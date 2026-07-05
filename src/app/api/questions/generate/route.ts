import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateQuestions } from "@/lib/ai/question-generator";
import { getUserProviderKeys } from "@/lib/ai/user-keys";

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

  // Student keys first, then app keys. generateQuestions never throws —
  // local bank is the guaranteed fallback.
  const userKeys = await getUserProviderKeys(user.id);
  const questions = await generateQuestions(parsed.data, userKeys);

  // Never expose the correct answer to the client during an active challenge:
  // the client submits an answer index and we verify server-side (see /api/questions/verify).
  // For simplicity of offline mode, explanation and correctness are returned after answering.
  return NextResponse.json({ questions });
}
