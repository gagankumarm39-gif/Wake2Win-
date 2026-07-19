import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateWithChain } from "@/lib/ai/generate";
import { getUserProviderKeys } from "@/lib/ai/user-keys";

/**
 * Voice assistant — speech-transcribed question in, SPOKEN-STYLE educational
 * answer out. Reuses the existing provider chain (generateWithChain); the only
 * difference from /api/assistant is the plain-text, TTS-friendly prompt:
 * no markdown, no code, no JSON — the reply is read aloud.
 */

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

const SYSTEM = [
  "You are a friendly NEET voice tutor for Biology, Physics and Chemistry.",
  "The student is SPEAKING to you and your answer will be READ ALOUD.",
  "Rules:",
  "- Answer at NEET level using NCERT concepts and NCERT terminology.",
  "- Be conceptual and stepwise: state the concept, explain the reasoning, then the conclusion.",
  "- Plain spoken text ONLY: no markdown, no bullet symbols, no LaTeX, no code, no JSON.",
  "- Spell out symbols the way a teacher says them (e.g. 'delta G', 'H two O').",
  "- Keep it under 160 words so it is comfortable to listen to.",
  "- End with one short exam tip or memory trick when it helps.",
].join("\n");

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const transcript = parsed.data.messages
    .slice(-12)
    .map((m) => `${m.role === "user" ? "Student" : "Tutor"}: ${m.content}`)
    .join("\n");
  const prompt = `${SYSTEM}\n\nConversation so far:\n${transcript}\n\nTutor:`;

  const userKeys = await getUserProviderKeys(user.id);

  try {
    const { text } = await generateWithChain(prompt, { json: false, userKeys, ollamaTask: "chat" });
    return NextResponse.json({ reply: text.trim() });
  } catch {
    return NextResponse.json(
      { reply: "I could not reach the AI tutor right now. Please try asking again in a moment." },
      { status: 200 }
    );
  }
}
