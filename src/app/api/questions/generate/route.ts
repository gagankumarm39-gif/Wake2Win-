import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateQuestionsDetailed } from "@/lib/ai/question-generator";
import { getUserProviderKeys } from "@/lib/ai/user-keys";
import { isDev } from "@/lib/ai/errors";

const bodySchema = z.object({
  exam: z.enum(["NEET", "JEE", "UPSC", "SSC", "GATE", "CAT", "BOARDS"]),
  subject: z.string().min(1).max(100),
  chapter: z.string().max(150).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  count: z.number().int().min(1).max(10),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Student keys first, then app keys. generateQuestionsDetailed never throws —
  // local bank is the guaranteed fallback so the alarm always has questions.
  const userKeys = await getUserProviderKeys(user.id);
  const { questions, usedFallback, error } = await generateQuestionsDetailed(parsed.data, userKeys);

  // The alarm intentionally never surfaces an error to the user, but expose the
  // real fallback reason via headers so it's visible in dev/telemetry (Priority 2/5).
  const headers: Record<string, string> = { "x-ai-fallback": usedFallback ? "1" : "0" };
  if (usedFallback && error && isDev) headers["x-ai-error"] = error.slice(0, 300);

  // For simplicity of offline mode, explanation and correctness are returned after answering.
  return NextResponse.json({ questions, usedFallback }, { headers });
}
