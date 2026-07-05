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

function buildPrompt(req: QuestionRequest): string {
  return `You are an expert ${req.exam} exam question setter.
Generate ${req.count} fresh, original multiple-choice questions.
Subject: ${req.subject}${req.chapter ? `\nChapter: ${req.chapter}` : ""}
Difficulty: ${req.difficulty}

Rules:
- Exactly 4 options per question, only one correct.
- Exam-accurate syllabus and style. No repeated or trivial questions.
- Include a concise explanation and a short hint for each.

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

/**
 * Provider chain: the student's own keys → app Gemini → app OpenRouter → local bank.
 * NEVER throws — the local bank guarantees questions, so the user never sees an error.
 */
export async function generateQuestions(
  req: QuestionRequest,
  userKeys: UserProviderKey[] = []
): Promise<GeneratedQuestion[]> {
  const count = Math.min(Math.max(req.count, 1), 10);
  const prompt = buildPrompt({ ...req, count });

  try {
    const { text, provider } = await generateWithChain(prompt, { json: true, userKeys });
    const parsed = payloadSchema.parse(extractJson(text));
    const questions = parsed.questions.slice(0, count).map((q) => randomize(q, provider));
    if (questions.length >= count) return questions;
  } catch {
    // Every provider failed or returned malformed JSON — the local bank takes over.
  }

  return getLocalQuestions({ ...req, count });
}
