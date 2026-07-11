import { z } from "zod";
import { generateWithChain } from "./generate";
import { getLocalQuestions } from "./local-question-bank";
import { shuffle } from "@/lib/utils";
import type { GeneratedQuestion, QuestionRequest, QuestionSource, UserProviderKey } from "@/types";

const questionSchema = z.object({
  question: z.string().min(10),
  options: z.array(z.string().min(1)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(1),
  hint: z.string().optional(),
});
const payloadSchema = z.object({ questions: z.array(questionSchema).min(1) });

/** NEET/JEE-specific style guidance so alarm questions feel like the real exam. */
function styleGuidance(exam: string): string {
  if (exam === "NEET") {
    return `This is NEET. Follow NCERT (Class 11 & 12) strictly — every fact must be traceable to an NCERT line.
Rotate across these NEET question STYLES (use a different style for each question):
- Direct concept/factual MCQ (NCERT statement based)
- Assertion–Reason: "Assertion (A): … / Reason (R): …" with the 4 standard options (both true & R explains A / both true but R doesn't explain A / A true R false / A false R true)
- Statement-based: "Which of the following statements is/are correct?" with 4 option combinations
- Match the following: two columns to match, 4 options give the correct pairing
- Previous-year (PYQ) style: phrased the way NEET actually asks it
Prefer high-yield chapters and NEET's favourite traps (units, exceptions, NCERT-only exceptions, similar-looking terms).`;
  }
  if (exam === "JEE") {
    return `This is JEE. Concept-application heavy, single-correct MCQs with plausible distractors that catch common algebra/sign/unit mistakes. Mix straightforward and multi-step reasoning.`;
  }
  return `Exam-accurate syllabus and phrasing for ${exam}. Mix factual and application questions.`;
}

function buildPrompt(req: QuestionRequest, seed: string): string {
  const difficultyNote =
    req.difficulty === "easy"
      ? "Keep them accessible but never trivial — NCERT-direct."
      : req.difficulty === "hard"
      ? "Make them rank-deciding: multi-concept, subtle traps, tricky distractors."
      : "Exam-standard difficulty, the level a serious aspirant sees in a real paper.";

  return `You are an expert ${req.exam} question setter creating a fresh set for a wake-up challenge.
Generate ${req.count} brand-new, original single-correct multiple-choice questions.
Subject: ${req.subject}${req.chapter ? `\nChapter: ${req.chapter}` : ""}
Difficulty: ${req.difficulty} — ${difficultyNote}

${styleGuidance(req.exam)}

Hard rules:
- Exactly 4 options per question, exactly one correct.
- No "all of the above"/"none of the above". Distractors must be plausible.
- Every question must be DIFFERENT from common textbook examples — do not reuse the "powerhouse of the cell" type clichés.
- "explanation": 1–2 sentences on WHY the answer is right (and the trap if any).
- "hint": a short nudge that doesn't give the answer away.
- Unique generation seed (do not mention it in output): ${seed}

Respond with ONLY valid JSON in this exact shape:
{"questions":[{"question":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"...","hint":"..."}]}`;
}

function extractJson(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON in model output");
  return JSON.parse(raw.slice(start, end + 1));
}

/** Shuffle answer order per question (anti-cheat: no memorizable positions). */
function randomize(q: z.infer<typeof questionSchema>, source: QuestionSource): GeneratedQuestion {
  const order = shuffle([0, 1, 2, 3]);
  return {
    id: crypto.randomUUID(),
    question: q.question,
    options: order.map((i) => q.options[i]),
    correctIndex: order.indexOf(q.correctIndex),
    explanation: q.explanation,
    hint: q.hint,
    source,
  };
}

export interface QuestionResult {
  questions: GeneratedQuestion[];
  /** Whether the local bank was used because every AI provider failed. */
  usedFallback: boolean;
  /** The real provider failure reason (dev/telemetry) — never shown on the alarm. */
  error?: string;
}

/**
 * Provider chain: the student's own keys → app OpenRouter → Gemini → next
 * OpenRouter → local bank. NEVER throws — the local bank guarantees questions,
 * so the alarm always has something to show. A fresh seed per call plus the
 * NEET-style prompt means every ring gets genuinely new questions when AI is
 * reachable, and a large randomized bank when it isn't (Priority 3).
 */
export async function generateQuestionsDetailed(
  req: QuestionRequest,
  userKeys: UserProviderKey[] = []
): Promise<QuestionResult> {
  const count = Math.min(Math.max(req.count, 1), 10);
  const seed = crypto.randomUUID();
  const prompt = buildPrompt({ ...req, count }, seed);

  try {
    const { text, provider } = await generateWithChain(prompt, { json: true, userKeys });
    const parsed = payloadSchema.parse(extractJson(text));
    const questions = parsed.questions.slice(0, count).map((q) => randomize(q, provider));
    if (questions.length >= count) return { questions, usedFallback: false };
    // Partial AI result — top up from the bank rather than discard the AI ones.
    const filler = getLocalQuestions({ ...req, count: count - questions.length });
    return { questions: [...questions, ...filler], usedFallback: false };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.warn(`[questions] all providers failed, using local bank: ${error}`);
    return { questions: getLocalQuestions({ ...req, count }), usedFallback: true, error };
  }
}

/** Back-compat: questions only (never throws). */
export async function generateQuestions(
  req: QuestionRequest,
  userKeys: UserProviderKey[] = []
): Promise<GeneratedQuestion[]> {
  return (await generateQuestionsDetailed(req, userKeys)).questions;
}
