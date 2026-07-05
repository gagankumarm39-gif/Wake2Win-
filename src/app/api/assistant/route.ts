import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateAssistantReply } from "@/lib/ai/assistant";
import { getUserProviderKeys } from "@/lib/ai/user-keys";
import { weakTopics } from "@/lib/weak-topics";

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      })
    )
    .min(1)
    .max(16),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const [{ data: profile }, { data: attempts }, userKeys] = await Promise.all([
    supabase.from("profiles").select("exam, study_hours_per_day, current_streak").eq("id", user.id).single(),
    supabase.from("question_attempts").select("subject, chapter, correct").gte("created_at", since),
    getUserProviderKeys(user.id),
  ]);

  const topics = weakTopics(attempts ?? []);
  const context = [
    `Exam: ${profile?.exam ?? "unknown"}`,
    `Daily study goal: ${profile?.study_hours_per_day ?? "?"}h`,
    `Current streak: ${profile?.current_streak ?? 0} days`,
    topics.length
      ? `Weak topics (lowest accuracy first): ${topics.map((t) => `${t.topic} (${t.accuracy}% over ${t.attempts} attempts)`).join("; ")}`
      : "Weak topics: not enough attempt data yet",
  ].join("\n");

  // generateAssistantReply never throws — canned coaching is the final fallback.
  const reply = await generateAssistantReply(parsed.data.messages, context, userKeys);
  return NextResponse.json({ reply });
}
