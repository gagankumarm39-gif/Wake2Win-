import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { gradeTest } from "@/lib/tests/grading";
import type { TestAnswers, TestQuestion } from "@/types/ai-studio";

export const dynamic = "force-dynamic";

const answerSchema = z.object({
  selectedIndex: z.number().int().min(0).max(3).optional(),
  value: z.string().max(50).optional(),
  text: z.string().max(8000).optional(),
  timeSeconds: z.number().min(0).max(36_000).default(0),
});

const bodySchema = z.object({
  answers: z.record(answerSchema),
  timeSpentSeconds: z.number().int().min(0).max(72_000),
});

/**
 * Grade an attempt server-side (the client never computes the score) and
 * persist the analysis. Idempotent-ish: re-submitting a completed test
 * returns the stored analysis instead of re-grading.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { data: test } = await supabase
    .from("ai_tests")
    .select("id, status, questions, analysis, score")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!test) return NextResponse.json({ error: "Test not found" }, { status: 404 });

  if (test.status === "completed" && test.analysis) {
    return NextResponse.json({ analysis: test.analysis, score: test.score });
  }

  const questions = test.questions as TestQuestion[];
  // Only keep answers for question ids that exist on this paper.
  const answers: TestAnswers = {};
  for (const [qid, a] of Object.entries(parsed.data.answers)) {
    if (questions.some((q) => q.id === qid)) answers[qid] = a;
  }

  const analysis = gradeTest(questions, answers, parsed.data.timeSpentSeconds);

  const { error } = await supabase
    .from("ai_tests")
    .update({
      status: "completed",
      answers,
      score: analysis.score,
      analysis,
      completed_at: new Date().toISOString(),
      time_left_seconds: 0,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Could not save the result" }, { status: 500 });

  return NextResponse.json({ analysis, score: analysis.score });
}
