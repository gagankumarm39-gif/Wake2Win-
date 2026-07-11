import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUserProviderKeys } from "@/lib/ai/user-keys";
import { generateTestPaper } from "@/lib/ai/test-generator";
import { isDev } from "@/lib/ai/errors";
import { checkTestQuota, recordUsage } from "@/lib/ai/quota";
import { getExam, suggestedDuration } from "@/lib/exams/registry";
import type { TestConfig } from "@/types/ai-studio";

export const dynamic = "force-dynamic";
// Full-length papers (e.g. NEET 180Q) need several provider round-trips.
export const maxDuration = 300;

const bodySchema = z.object({
  examId: z.string().min(1).max(50),
  subjects: z.array(z.string().min(1).max(60)).min(1).max(8),
  chapters: z.record(z.array(z.string().min(1).max(120)).max(50)).default({}),
  difficulty: z.enum(["easy", "medium", "hard", "mixed"]),
  questionCount: z.number().int().min(5).max(200),
  negativeMarking: z.boolean(),
  durationMinutes: z.number().int().min(5).max(360).optional(),
  officialPattern: z.boolean().default(false),
});

/** Quota status for the wizard ("next free test at …"). */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const quota = await checkTestQuota(user.id);
  return NextResponse.json(quota);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const body = parsed.data;
  const exam = getExam(body.examId);
  if (!exam) return NextResponse.json({ error: "Unknown exam" }, { status: 400 });

  // Every requested subject/chapter must exist in the registry.
  for (const subject of body.subjects) {
    const known = exam.subjects[subject];
    if (!known) return NextResponse.json({ error: `Unknown subject: ${subject}` }, { status: 400 });
    for (const chapter of body.chapters[subject] ?? []) {
      if (!known.includes(chapter)) {
        return NextResponse.json({ error: `Unknown chapter: ${chapter}` }, { status: 400 });
      }
    }
  }

  // ONE free AI test per 24h; premium (future) bypasses via ai_entitlements.
  const quota = await checkTestQuota(user.id);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: "Free limit reached — you can generate one AI test every 24 hours.", nextAt: quota.nextAt },
      { status: 429 }
    );
  }

  const officialPattern = body.officialPattern && !!exam.officialPattern;
  const config: TestConfig = {
    examId: exam.id,
    subjects: officialPattern ? Object.keys(exam.officialPattern!.subjectCounts) : body.subjects,
    chapters: body.chapters,
    difficulty: body.difficulty,
    questionCount: officialPattern ? exam.officialPattern!.totalQuestions : body.questionCount,
    negativeMarking: body.negativeMarking && exam.supportsNegativeMarking,
    durationMinutes:
      body.durationMinutes ??
      (officialPattern
        ? exam.officialPattern!.durationMinutes
        : suggestedDuration(exam, body.questionCount)),
    officialPattern,
  };

  const userKeys = await getUserProviderKeys(user.id);

  let paper;
  try {
    paper = await generateTestPaper(config, userKeys);
  } catch (err) {
    // Report the REAL reason (rate limit / auth / timeout / invalid model /
    // provider unavailable) instead of a generic message (Priority 2).
    // AIError may be a type-only interface; avoid using instanceof. Detect
    // by presence of the `kind` field instead.
    const aiErr = err && typeof (err as any).kind !== "undefined" ? (err as any) : null;
    const status = aiErr?.kind === "rate_limited" ? 429 : 502;
    console.error(
      "[tests/generate] failed:",
      aiErr ? `${aiErr.kind} (${aiErr.provider}${aiErr.status ? " HTTP " + aiErr.status : ""})` : err
    );
    return NextResponse.json(
      {
        error: aiErr ? aiErr.userMessage() : err instanceof Error ? err.message : "Test generation failed. Please try again.",
        reason: aiErr?.kind ?? "unavailable",
        // Full provider payload only in development.
        ...(isDev && aiErr?.detail !== undefined ? { detail: aiErr.detail } : {}),
      },
      { status }
    );
  }

  const { data: row, error } = await supabase
    .from("ai_tests")
    .insert({
      user_id: user.id,
      title: paper.title,
      exam: exam.id,
      exam_name: exam.name,
      config,
      blueprint: paper.blueprint,
      questions: paper.questions,
      status: "ready",
      total_marks: paper.totalMarks,
      time_left_seconds: config.durationMinutes * 60,
    })
    .select("id")
    .single();
  if (error || !row) {
    console.error("[tests/generate] save failed:", error?.message);
    return NextResponse.json({ error: "Could not save the test" }, { status: 500 });
  }

  // Count against the 24h quota only after a successful save.
  await recordUsage(user.id, "test");

  return NextResponse.json({ id: row.id, review: paper.review });
}
