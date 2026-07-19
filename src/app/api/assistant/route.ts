import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateAssistantReply } from "@/lib/ai/assistant";
import { getUserProviderKeys } from "@/lib/ai/user-keys";
import { extractImagesContext } from "@/lib/ai/vision";
import { weakTopics } from "@/lib/weak-topics";

// Image turns are capped tighter than the scanner (chat = quick doubts, and
// the whole payload must stay well under serverless body limits).
const MAX_CHAT_IMAGES = 4;

// Image turns run vision + text generation back-to-back; allow the extra time.
export const maxDuration = 90;

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
  /**
   * Optional images attached to the LAST user message (data URLs, already
   * resized/compressed by the client). They are converted to text via the
   * vision/OCR chain and injected as context — providers without vision never
   * see the raw image, so an image turn can never fail on capability.
   */
  images: z
    .array(z.string().startsWith("data:image/").max(14_000_000))
    .max(MAX_CHAT_IMAGES)
    .optional(),
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

  // Image turns: run the vision/OCR chain and fold the extracted content into
  // the last user message so the ordinary text chain (and its history window)
  // handles the rest unchanged.
  const messages = [...parsed.data.messages];
  if (parsed.data.images?.length) {
    let imageContext: string;
    try {
      imageContext = await extractImagesContext(parsed.data.images);
    } catch {
      return NextResponse.json(
        { reply: "I couldn't read the attached image(s) — try a clearer, well-lit photo. 📷" }
      );
    }
    const last = messages[messages.length - 1];
    const merged = `${last.content}\n\n[Attached image content]\n${imageContext}`;
    messages[messages.length - 1] = { ...last, content: merged };
  }

  // generateAssistantReply never throws — canned coaching is the final fallback.
  const reply = await generateAssistantReply(messages, context, userKeys);
  return NextResponse.json({ reply });
}
