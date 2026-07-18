import { z } from "zod";
import { generateWithChain } from "./generate";
import { getLocalQuestions } from "./local-question-bank";
import { isDev } from "./errors";
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

/**
 * NEET/JEE-specific style guidance so alarm questions feel like the real exam.
 * `scoped` is true when the student pinned a specific lesson/topic: the guidance
 * must then NOT steer the model toward other (higher-yield) chapters.
 */
function styleGuidance(exam: string, scoped: boolean): string {
  const scopeNote = scoped
    ? "\nStay strictly INSIDE the requested lesson/topic — never drift to another (easier or higher-yield) chapter."
    : "";
  if (exam === "NEET") {
    return `This is NEET. Follow NCERT (Class 11 & 12) strictly — every fact must be traceable to an NCERT line.
Rotate across these NEET question STYLES (use a different style for each question):
- Direct concept/factual MCQ (NCERT statement based)
- Assertion–Reason: "Assertion (A): … / Reason (R): …" with the 4 standard options (both true & R explains A / both true but R doesn't explain A / A true R false / A false R true)
- Statement-based: "Which of the following statements is/are correct?" with 4 option combinations
- Match the following: two columns to match, 4 options give the correct pairing
- Previous-year (PYQ) style: phrased the way NEET actually asks it
Use NEET's favourite traps (units, exceptions, NCERT-only exceptions, similar-looking terms).${scopeNote}`;
  }
  if (exam === "JEE") {
    return `This is JEE. Concept-application heavy, single-correct MCQs with plausible distractors that catch common algebra/sign/unit mistakes. Mix straightforward and multi-step reasoning.${scopeNote}`;
  }
  return `Exam-accurate syllabus and phrasing for ${exam}. Mix factual and application questions.${scopeNote}`;
}

/** Strict lesson/topic scope block — only emitted when the student pinned one. */
function lessonBlock(lesson: string): string {
  return `Lesson / Chapter / Topic: ${lesson}

STRICT RULES:
- Every question must come ONLY from the lesson/topic "${lesson}".
- Do NOT include questions from any other lesson or chapter, even a closely related one.
- If the lesson is broad, still generate questions only from within that lesson.
- Never substitute a different lesson because it is easier or higher-yield.
- If you cannot form a question from this lesson, leave it out rather than drifting to another lesson.`;
}

function buildPrompt(req: QuestionRequest, seed: string): string {
  const difficultyNote =
    req.difficulty === "easy"
      ? "Keep them accessible but never trivial — NCERT-direct."
      : req.difficulty === "hard"
      ? "Make them rank-deciding: multi-concept, subtle traps, tricky distractors."
      : "Exam-standard difficulty, the level a serious aspirant sees in a real paper.";

  const lesson = req.chapter?.trim();

  return `You are an expert ${req.exam} question setter creating a fresh set for a wake-up challenge.
Generate ${req.count} brand-new, original single-correct multiple-choice questions.
Exam: ${req.exam}
Subject: ${req.subject}${lesson ? `\n${lessonBlock(lesson)}` : ""}
Difficulty: ${req.difficulty} — ${difficultyNote}

${styleGuidance(req.exam, !!lesson)}

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

/**
 * Chain-level gate: a model response is only usable if it actually carries at
 * least one question. Some free models answer 200 OK with `{"questions":[]}`;
 * without this the chain would "succeed" on that empty reply and we'd fall
 * straight to the local bank instead of trying the next (working) model.
 */
function hasQuestions(text: string): boolean {
  try {
    const data = extractJson(text) as { questions?: unknown[] };
    return Array.isArray(data?.questions) && data.questions.length > 0;
  } catch {
    return false;
  }
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

const lessonCheckSchema = z.object({ offTopic: z.array(z.number().int()) });

/**
 * Best-effort AI gate: verify each generated question genuinely belongs to the
 * requested lesson/topic (not merely the same subject). Returns the indices
 * that are OFF-topic. If the check itself can't run (provider down / bad JSON),
 * returns [] so a flaky validator never blocks generation.
 */
async function findOffLessonQuestions(
  req: QuestionRequest,
  lesson: string,
  questions: GeneratedQuestion[],
  userKeys: UserProviderKey[]
): Promise<number[]> {
  const listing = questions.map((q, i) => `${i}. ${q.question}`).join("\n");
  const prompt = `You are checking whether exam questions belong to a specific lesson/topic.
Exam: ${req.exam}
Subject: ${req.subject}
Lesson / Chapter / Topic: ${lesson}

List ONLY the questions that CLEARLY belong to a DIFFERENT, identifiable chapter than "${lesson}". Be conservative: a question that reasonably fits within "${lesson}" — including its sub-topics — is on-topic and must NOT be listed. When in doubt, treat it as on-topic and leave it out.

${listing}

Respond with ONLY valid JSON listing the indices of the clearly off-topic questions (empty array if all belong to the lesson):
{"offTopic":[0,2]}`;
  try {
    const { text } = await generateWithChain(prompt, { json: true, userKeys, ollamaTask: "alarm" });
    const parsed = lessonCheckSchema.parse(extractJson(text));
    return [...new Set(parsed.offTopic.filter((i) => i >= 0 && i < questions.length))];
  } catch {
    return []; // never block generation on a failed validator
  }
}

/** Dev-only trace of one generation attempt (Requirement 6). */
function logAttempt(
  req: QuestionRequest,
  lesson: string,
  count: number,
  provider: QuestionSource,
  validation: string,
  attempt: number
): void {
  if (!isDev) return;
  console.log(
    `[questions] subject="${req.subject}" lesson="${lesson || "(subject-wide)"}" count=${count} ` +
      `provider=${provider} validation="${validation}" attempt=${attempt}`
  );
}

/**
 * Provider chain: the student's own keys → app Ollama/OpenRouter/Gemini → local
 * bank. NEVER throws — the local bank guarantees questions, so the alarm always
 * has something to show.
 *
 * Lesson binding (Requirements 2–5): when the student pins a lesson/topic, the
 * prompt is strictly scoped to it, and each AI batch is validated to belong to
 * that lesson. Off-lesson questions are rejected and generation is retried (up
 * to 3 attempts), accumulating only on-lesson questions across attempts. The
 * subject-level local bank is used only when NO on-lesson AI question could be
 * produced, so the alarm is never empty.
 */
export async function generateQuestionsDetailed(
  req: QuestionRequest,
  userKeys: UserProviderKey[] = []
): Promise<QuestionResult> {
  const count = Math.min(Math.max(req.count, 1), 10);
  const lesson = req.chapter?.trim() ?? "";
  const maxAttempts = lesson ? 3 : 1;

  const collected: GeneratedQuestion[] = [];
  const seen = new Set<string>();
  const push = (qs: GeneratedQuestion[]) => {
    for (const q of qs) {
      const fp = q.question.toLowerCase().replace(/\s+/g, " ").trim();
      if (!seen.has(fp) && collected.length < count) {
        seen.add(fp);
        collected.push(q);
      }
    }
  };

  let lastError: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const prompt = buildPrompt({ ...req, count }, crypto.randomUUID());
    try {
      const { text, provider } = await generateWithChain(prompt, { json: true, userKeys, validate: hasQuestions, ollamaTask: "alarm" });
      const parsed = payloadSchema.parse(extractJson(text));
      const questions = parsed.questions.slice(0, count).map((q) => randomize(q, provider));

      if (!lesson) {
        logAttempt(req, lesson, count, provider, "skipped (subject-wide)", attempt);
        if (questions.length >= count) return { questions, usedFallback: false };
        const filler = getLocalQuestions({ ...req, count: count - questions.length });
        return { questions: [...questions, ...filler], usedFallback: false };
      }

      const off = await findOffLessonQuestions(req, lesson, questions, userKeys);
      const onTopic = questions.filter((_, i) => !off.includes(i));
      const validation =
        off.length === 0 ? "all on-topic" : `${off.length}/${questions.length} off-topic rejected`;
      logAttempt(req, lesson, count, provider, validation, attempt);

      push(onTopic);
      if (collected.length >= count) return { questions: collected.slice(0, count), usedFallback: false };
      // Not enough on-lesson questions yet — try again with a fresh seed.
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[questions] attempt ${attempt} failed: ${lastError}`);
    }
  }

  // Ran out of attempts. Return the on-lesson questions we gathered; only fall
  // back to the (subject-level) bank when we have NONE, so the alarm isn't empty.
  if (collected.length > 0) return { questions: collected, usedFallback: false };

  if (isDev && lesson) console.warn(`[questions] no on-lesson questions for "${lesson}" — using local bank`);
  return { questions: getLocalQuestions({ ...req, count }), usedFallback: true, error: lastError };
}

/** Back-compat: questions only (never throws). */
export async function generateQuestions(
  req: QuestionRequest,
  userKeys: UserProviderKey[] = []
): Promise<GeneratedQuestion[]> {
  return (await generateQuestionsDetailed(req, userKeys)).questions;
}
