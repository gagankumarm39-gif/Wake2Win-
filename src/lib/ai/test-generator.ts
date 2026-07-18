/**
 * AI Test Generator service (server-only).
 *
 * Pipeline:  config → blueprint (AI, deterministic fallback)
 *                   → batched question generation (provider chain, concurrent)
 *                   → auto review (dedupe · answer verification · top-up
 *                     · coverage & difficulty report)
 *
 * Reuses the existing provider chain (generateWithChain): the student's own
 * keys first, then the app keys — identical fallback behavior to the alarm
 * question generator and the assistant.
 */

import { z } from "zod";
import { generateWithChain } from "./generate";
import { AIError, isDev, pickBestError, toAIError } from "./errors";
import { shuffle } from "@/lib/utils";
import { getExam, type ExamDefinition, type SubjectiveSection } from "@/lib/exams/registry";
import type { QuestionSource, UserProviderKey } from "@/types";
import type {
  BloomLevel,
  BlueprintItem,
  QuestionDifficulty,
  TestConfig,
  TestQuestion,
} from "@/types/ai-studio";

const CHUNK_SIZE = 8;
const CONCURRENCY = 3;

/* ══════════════════ Small utilities ══════════════════ */

function extractJson(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON in model output");
  return JSON.parse(raw.slice(start, end + 1));
}

/** Chain gate: reject 200-but-empty replies for a given JSON array key so the
 *  chain keeps trying other models instead of accepting a useless response. */
function hasArray(key: string): (text: string) => boolean {
  return (text: string) => {
    try {
      const data = extractJson(text) as Record<string, unknown>;
      return Array.isArray(data?.[key]) && (data[key] as unknown[]).length > 0;
    } catch {
      return false;
    }
  };
}

/** Run tasks with limited concurrency; failed tasks resolve to null. */
async function pool<T>(tasks: (() => Promise<T>)[], limit = CONCURRENCY): Promise<(T | null)[]> {
  const results: (T | null)[] = new Array(tasks.length).fill(null);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= tasks.length) return;
      try {
        results[i] = await tasks[i]();
      } catch (err) {
        console.error("[test-gen] chunk failed:", err instanceof Error ? err.message : err);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

const BLOOMS: BloomLevel[] = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"];

function normalizeBloom(value: string | undefined): BloomLevel {
  const hit = BLOOMS.find((b) => b.toLowerCase() === value?.trim().toLowerCase());
  return hit ?? "Understand";
}

function normalizeDifficulty(value: string | undefined, fallback: QuestionDifficulty): QuestionDifficulty {
  const v = value?.trim().toLowerCase();
  return v === "easy" || v === "medium" || v === "hard" ? v : fallback;
}

/** Normalized fingerprint for duplicate detection. */
function fingerprint(question: string): string {
  return question.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 160);
}

function defaultSeconds(difficulty: QuestionDifficulty, subjective: boolean): number {
  if (subjective) return 300;
  return difficulty === "easy" ? 45 : difficulty === "medium" ? 75 : 120;
}

/* ══════════════════ Blueprint ══════════════════ */

const blueprintSchema = z.object({
  items: z
    .array(
      z.object({
        subject: z.string().min(1),
        chapter: z.string().min(1),
        count: z.number().int().min(1).max(60),
      })
    )
    .min(1),
});

export function buildBlueprintPrompt(
  exam: ExamDefinition,
  config: TestConfig,
  perSubject: Record<string, { chapters: string[]; count: number }>
): string {
  const lines = Object.entries(perSubject)
    .map(
      ([subject, s]) =>
        `- ${subject}: ${s.count} questions from chapters: ${s.chapters.join("; ")}`
    )
    .join("\n");
  return `You are an expert ${exam.name} paper setter planning a mock test blueprint.
Distribute questions across chapters with realistic exam weightage (high-yield chapters get more questions). Every listed chapter must get at least 1 question. Counts per subject must sum EXACTLY to the requested number.

${lines}

Respond with ONLY valid JSON:
{"items":[{"subject":"...","chapter":"...","count":3}]}`;
}

/** Deterministic distribution: round-robin so counts always sum correctly. */
function evenBlueprint(perSubject: Record<string, { chapters: string[]; count: number }>): BlueprintItem[] {
  const items: BlueprintItem[] = [];
  for (const [subject, s] of Object.entries(perSubject)) {
    const counts = new Array<number>(s.chapters.length).fill(0);
    for (let i = 0; i < s.count; i++) counts[i % s.chapters.length]++;
    s.chapters.forEach((chapter, i) => {
      if (counts[i] > 0) items.push({ subject, chapter, count: counts[i] });
    });
  }
  return items;
}

/** How many questions each subject gets (official pattern beats even split). */
function subjectQuota(exam: ExamDefinition, config: TestConfig): Record<string, number> {
  if (config.officialPattern && exam.officialPattern) {
    return { ...exam.officialPattern.subjectCounts };
  }
  const quota: Record<string, number> = {};
  const per = Math.floor(config.questionCount / config.subjects.length);
  let rest = config.questionCount - per * config.subjects.length;
  for (const s of config.subjects) quota[s] = per + (rest-- > 0 ? 1 : 0);
  return quota;
}

export async function buildBlueprint(
  exam: ExamDefinition,
  config: TestConfig,
  userKeys: UserProviderKey[]
): Promise<BlueprintItem[]> {
  const quota = subjectQuota(exam, config);
  const perSubject: Record<string, { chapters: string[]; count: number }> = {};
  for (const subject of Object.keys(quota)) {
    const selected = config.chapters[subject]?.length
      ? config.chapters[subject]
      : exam.subjects[subject] ?? [];
    // A subject can't spread N questions over more than N chapters.
    const chapters = selected.slice(0, Math.max(1, quota[subject]));
    perSubject[subject] = { chapters, count: quota[subject] };
  }

  let items: BlueprintItem[] | null = null;
  try {
    const { text } = await generateWithChain(buildBlueprintPrompt(exam, config, perSubject), {
      json: true,
      userKeys,
      validate: hasArray("items"),
      ollamaTask: "tests",
    });
    const parsed = blueprintSchema.parse(extractJson(text));
    // Trust the AI only if its plan matches the request; else fall back.
    items = parsed.items.filter(
      (i) => perSubject[i.subject] && perSubject[i.subject].chapters.includes(i.chapter)
    );
    for (const [subject, s] of Object.entries(perSubject)) {
      const sum = items.filter((i) => i.subject === subject).reduce((a, i) => a + i.count, 0);
      const covered = new Set(items.filter((i) => i.subject === subject).map((i) => i.chapter));
      if (sum !== s.count || covered.size < s.chapters.length) {
        items = null;
        break;
      }
    }
  } catch {
    items = null;
  }

  const blueprint = items ?? evenBlueprint(perSubject);

  // Tag numerical counts for mcq-numerical exams (JEE Main / Advanced).
  if (exam.paperStyle === "mcq-numerical" && exam.numericalShare) {
    for (const item of blueprint) {
      item.numericalCount = Math.round(item.count * exam.numericalShare);
    }
  }
  return blueprint;
}

/* ══════════════════ Question generation ══════════════════ */

const mcqSchema = z.object({
  question: z.string().min(10),
  options: z.array(z.string().min(1)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(1),
  difficulty: z.string().optional(),
  estimatedSeconds: z.number().optional(),
  bloom: z.string().optional(),
});

const numericalSchema = z.object({
  question: z.string().min(10),
  answer: z.union([z.number(), z.string()]),
  explanation: z.string().min(1),
  difficulty: z.string().optional(),
  estimatedSeconds: z.number().optional(),
  bloom: z.string().optional(),
});

const subjectiveSchema = z.object({
  question: z.string().min(10),
  modelAnswer: z.string().min(10),
  explanation: z.string().optional(),
  difficulty: z.string().optional(),
  estimatedSeconds: z.number().optional(),
  bloom: z.string().optional(),
});

interface ChunkTask {
  subject: string;
  chapter: string;
  count: number;
  type: "mcq" | "numerical";
  section?: SubjectiveSection; // subjective papers
}

/** Exam-specific NEET/JEE style guidance for the paper generator. */
function examStyle(exam: ExamDefinition): string {
  if (exam.short === "NEET" || exam.name.includes("NEET")) {
    return `NEET rules: base every question strictly on NCERT (Class 11 & 12) concepts and keywords. Across the set, rotate NEET's real question styles — direct NCERT-statement MCQs, assertion–reason (with the 4 standard options), "which statement(s) is/are correct" combinations, and match-the-following pairings. Use previously-repeated (PYQ-style) concepts and NEET's classic traps (units, exceptions, NCERT-only facts, look-alike terms) — but only from within the given chapter.`;
  }
  if (exam.short === "JEE" || exam.name.includes("JEE")) {
    return `JEE rules: concept-application heavy. Distractors should trap common sign/unit/algebra errors. Mix single-step and multi-step reasoning.`;
  }
  return `Keep questions strictly syllabus-accurate for ${exam.name}, with a mix of factual and application-based items.`;
}

export function buildQuestionsPrompt(exam: ExamDefinition, config: TestConfig, task: ChunkTask): string {
  const difficulty =
    config.difficulty === "mixed"
      ? "a realistic mix of easy, medium and hard"
      : config.difficulty;
  const base = `You are an expert ${exam.name} question setter.
Generate ${task.count} fresh, original, exam-accurate questions.
Subject: ${task.subject}
Chapter: ${task.chapter}

STRICT RULES:
- Every question must come ONLY from the chapter "${task.chapter}".
- Do NOT include questions from any other chapter, even a related one.
- Never substitute a different chapter because it is easier or higher-yield.

Difficulty: ${difficulty}

${examStyle(exam)}

Every question object must also include:
- "difficulty": "easy" | "medium" | "hard"
- "estimatedSeconds": realistic solving time in seconds
- "bloom": Bloom taxonomy level ("Remember"|"Understand"|"Apply"|"Analyze"|"Evaluate"|"Create")
- "explanation": detailed step-by-step explanation that also names the common trap or misconception`;

  if (task.section) {
    return `${base}
Question type: ${task.section.label} (${task.section.marks} marks each), as asked in ${exam.name} board papers.${
      task.section.kind === "case"
        ? "\nEach question must start with a short case/passage followed by the question."
        : ""
    }
Each question needs a complete "modelAnswer" a topper would write for full marks.

Respond with ONLY valid JSON:
{"questions":[{"question":"...","modelAnswer":"...","explanation":"...","difficulty":"medium","estimatedSeconds":300,"bloom":"Understand"}]}`;
  }

  if (task.type === "numerical") {
    return `${base}
Question type: numerical answer (no options — the student types a number, JEE style).
"answer" must be the exact numerical value (round to 2 decimals if needed).

Respond with ONLY valid JSON:
{"questions":[{"question":"...","answer":9.8,"explanation":"...","difficulty":"medium","estimatedSeconds":120,"bloom":"Apply"}]}`;
  }

  return `${base}
Question type: single-correct MCQ with exactly 4 options.
Rules: only one correct option, no "all of the above", plausible distractors.

Respond with ONLY valid JSON:
{"questions":[{"question":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"...","difficulty":"medium","estimatedSeconds":60,"bloom":"Understand"}]}`;
}

function marksFor(exam: ExamDefinition, config: TestConfig, section?: SubjectiveSection): { marks: number; negative: number } {
  if (section) return { marks: section.marks, negative: 0 };
  return {
    marks: exam.marking.correct,
    negative: config.negativeMarking && exam.supportsNegativeMarking ? exam.marking.incorrect : 0,
  };
}

async function generateChunk(
  exam: ExamDefinition,
  config: TestConfig,
  task: ChunkTask,
  userKeys: UserProviderKey[]
): Promise<TestQuestion[]> {
  const prompt = buildQuestionsPrompt(exam, config, task);
  const { text, provider } = await generateWithChain(prompt, { json: true, userKeys, validate: hasArray("questions"), ollamaTask: "tests" });
  if (isDev) {
    console.log(
      `[test-gen] subject="${task.subject}" chapter="${task.chapter}" count=${task.count} type=${task.type} provider=${provider}`
    );
  }
  const raw = extractJson(text) as { questions?: unknown[] };
  const list = Array.isArray(raw?.questions) ? raw.questions : [];
  const { marks, negative } = marksFor(exam, config, task.section);
  const fallbackDiff: QuestionDifficulty = config.difficulty === "mixed" ? "medium" : config.difficulty;
  const out: TestQuestion[] = [];

  for (const item of list.slice(0, task.count)) {
    try {
      const common = {
        id: crypto.randomUUID(),
        subject: task.subject,
        chapter: task.chapter,
        marks,
        negativeMarks: negative,
        source: provider as QuestionSource,
      };
      if (task.section) {
        const q = subjectiveSchema.parse(item);
        const difficulty = normalizeDifficulty(q.difficulty, fallbackDiff);
        out.push({
          ...common,
          type: "subjective",
          kind: task.section.kind,
          question: q.question,
          modelAnswer: q.modelAnswer,
          explanation: q.explanation ?? q.modelAnswer,
          difficulty,
          estimatedSeconds: Math.min(900, Math.max(60, Math.round(q.estimatedSeconds ?? defaultSeconds(difficulty, true)))),
          bloom: normalizeBloom(q.bloom),
        });
      } else if (task.type === "numerical") {
        const q = numericalSchema.parse(item);
        const difficulty = normalizeDifficulty(q.difficulty, fallbackDiff);
        out.push({
          ...common,
          type: "numerical",
          question: q.question,
          answerValue: String(q.answer),
          explanation: q.explanation,
          difficulty,
          estimatedSeconds: Math.min(600, Math.max(20, Math.round(q.estimatedSeconds ?? defaultSeconds(difficulty, false)))),
          bloom: normalizeBloom(q.bloom),
        });
      } else {
        const q = mcqSchema.parse(item);
        const difficulty = normalizeDifficulty(q.difficulty, fallbackDiff);
        // Shuffle option order (anti-cheat, same as the alarm generator).
        const order = shuffle([0, 1, 2, 3]);
        out.push({
          ...common,
          type: "mcq",
          question: q.question,
          options: order.map((i) => q.options[i]),
          correctIndex: order.indexOf(q.correctIndex),
          explanation: q.explanation,
          difficulty,
          estimatedSeconds: Math.min(600, Math.max(20, Math.round(q.estimatedSeconds ?? defaultSeconds(difficulty, false)))),
          bloom: normalizeBloom(q.bloom),
        });
      }
    } catch {
      // Skip malformed items; the top-up round replaces them.
    }
  }
  return out;
}

/** Split blueprint items into ≤CHUNK_SIZE generation tasks. */
function chunkTasks(exam: ExamDefinition, blueprint: BlueprintItem[]): ChunkTask[] {
  const tasks: ChunkTask[] = [];
  for (const item of blueprint) {
    if (exam.paperStyle === "subjective" && exam.subjectiveSections) {
      // Distribute this chapter's questions across the paper's sections.
      let assigned = 0;
      exam.subjectiveSections.forEach((section, i) => {
        const isLast = i === exam.subjectiveSections!.length - 1;
        const n = isLast ? item.count - assigned : Math.round(item.count * section.share);
        assigned += n;
        for (let done = 0; done < n; done += CHUNK_SIZE) {
          tasks.push({
            subject: item.subject,
            chapter: item.chapter,
            count: Math.min(CHUNK_SIZE, n - done),
            type: "mcq",
            section,
          });
        }
      });
      continue;
    }

    const numerical = Math.min(item.numericalCount ?? 0, item.count);
    const mcq = item.count - numerical;
    for (let done = 0; done < mcq; done += CHUNK_SIZE) {
      tasks.push({ subject: item.subject, chapter: item.chapter, count: Math.min(CHUNK_SIZE, mcq - done), type: "mcq" });
    }
    for (let done = 0; done < numerical; done += CHUNK_SIZE) {
      tasks.push({ subject: item.subject, chapter: item.chapter, count: Math.min(CHUNK_SIZE, numerical - done), type: "numerical" });
    }
  }
  return tasks.filter((t) => t.count > 0);
}

/* ══════════════════ Auto review ══════════════════ */

export interface ReviewReport {
  duplicatesRemoved: number;
  answersCorrected: number;
  toppedUp: number;
  chaptersMissing: string[];
  difficultyMix: Record<QuestionDifficulty, number>;
}

const verifySchema = z.object({
  corrections: z.array(z.object({ index: z.number().int().min(0), correctIndex: z.number().int().min(0).max(3) })),
});

export function buildReviewPrompt(exam: ExamDefinition, batch: TestQuestion[]): string {
  const listing = batch
    .map(
      (q, i) =>
        `${i}. ${q.question}\n   Options: ${q.options?.map((o, j) => `[${j}] ${o}`).join(" | ")}\n   Claimed correct: [${q.correctIndex}]`
    )
    .join("\n");
  return `You are reviewing an AI-generated ${exam.name} answer key for correctness.
For each question below, verify the claimed correct option. Report ONLY the questions whose claimed answer is wrong, with the truly correct option index.

${listing}

Respond with ONLY valid JSON (empty array if the whole key is correct):
{"corrections":[{"index":2,"correctIndex":1}]}`;
}

/** Best-effort AI answer-key verification for MCQs (batches of 12). */
async function verifyAnswers(
  exam: ExamDefinition,
  questions: TestQuestion[],
  userKeys: UserProviderKey[]
): Promise<number> {
  const mcqs = questions.filter((q) => q.type === "mcq");
  const batches: TestQuestion[][] = [];
  for (let i = 0; i < mcqs.length; i += 12) batches.push(mcqs.slice(i, i + 12));

  let corrected = 0;
  await pool(
    batches.map((batch) => async () => {
      const { text } = await generateWithChain(buildReviewPrompt(exam, batch), { json: true, userKeys, ollamaTask: "tests" });
      const parsed = verifySchema.parse(extractJson(text));
      for (const fix of parsed.corrections) {
        const q = batch[fix.index];
        if (q && q.correctIndex !== fix.correctIndex) {
          q.correctIndex = fix.correctIndex;
          corrected++;
        }
      }
      return true;
    })
  );
  return corrected;
}

/* ══════════════════ Full pipeline ══════════════════ */

export interface GeneratedPaper {
  title: string;
  blueprint: BlueprintItem[];
  questions: TestQuestion[];
  totalMarks: number;
  review: ReviewReport;
}

export async function generateTestPaper(
  config: TestConfig,
  userKeys: UserProviderKey[]
): Promise<GeneratedPaper> {
  const exam = getExam(config.examId);
  if (!exam) throw new Error(`Unknown exam: ${config.examId}`);

  // Step 2 — AI blueprint.
  const blueprint = await buildBlueprint(exam, config, userKeys);

  // Step 3 — generate the paper in concurrent batches. Capture provider
  // failures so a fully-failed run can report the REAL reason (Priority 2).
  const failures: AIError[] = [];
  const tasks = chunkTasks(exam, blueprint);
  const generated = (
    await pool(
      tasks.map((t) => async () => {
        try {
          return await generateChunk(exam, config, t, userKeys);
        } catch (err) {
          failures.push(err instanceof AIError ? err : toAIError(err));
          throw err;
        }
      })
    )
  )
    .filter(Boolean)
    .flat() as TestQuestion[];

  // Auto review — duplicates.
  const seen = new Set<string>();
  let duplicatesRemoved = 0;
  let questions = generated.filter((q) => {
    const fp = fingerprint(q.question);
    if (seen.has(fp)) {
      duplicatesRemoved++;
      return false;
    }
    seen.add(fp);
    return true;
  });

  // Auto review — top-up: one retry round for chapters that came up short.
  const target = blueprint.reduce((s, i) => s + i.count, 0);
  let toppedUp = 0;
  if (questions.length < target) {
    const deficit = new Map<string, { subject: string; chapter: string; missing: number }>();
    for (const item of blueprint) {
      const have = questions.filter((q) => q.subject === item.subject && q.chapter === item.chapter).length;
      if (have < item.count) {
        deficit.set(`${item.subject}::${item.chapter}`, {
          subject: item.subject,
          chapter: item.chapter,
          missing: item.count - have,
        });
      }
    }
    const retryTasks: ChunkTask[] = [...deficit.values()].map((d) => ({
      subject: d.subject,
      chapter: d.chapter,
      count: Math.min(CHUNK_SIZE, d.missing),
      type: "mcq" as const,
      section:
        exam.paperStyle === "subjective" && exam.subjectiveSections
          ? exam.subjectiveSections[0]
          : undefined,
    }));
    const extra = (await pool(retryTasks.map((t) => () => generateChunk(exam, config, t, userKeys))))
      .filter(Boolean)
      .flat() as TestQuestion[];
    for (const q of extra) {
      const fp = fingerprint(q.question);
      if (!seen.has(fp) && questions.length < target) {
        seen.add(fp);
        questions.push(q);
        toppedUp++;
      }
    }
  }

  if (questions.length < Math.max(5, Math.floor(target * 0.6))) {
    // Report the real underlying reason (rate limit / auth / timeout …) instead
    // of a generic message, so the wizard can show it (Priority 2).
    if (failures.length > 0) throw pickBestError(failures);
    throw new AIError(
      "unavailable",
      "The AI providers could not produce enough questions right now. Please try again in a few minutes."
    );
  }

  // Auto review — answer-key verification (best-effort; never blocks the paper).
  let answersCorrected = 0;
  try {
    answersCorrected = await verifyAnswers(exam, questions, userKeys);
  } catch {
    // review is advisory
  }

  // Auto review — coverage & difficulty balance report.
  const chaptersMissing = blueprint
    .filter((i) => !questions.some((q) => q.subject === i.subject && q.chapter === i.chapter))
    .map((i) => `${i.subject} · ${i.chapter}`);
  const difficultyMix: Record<QuestionDifficulty, number> = { easy: 0, medium: 0, hard: 0 };
  for (const q of questions) difficultyMix[q.difficulty]++;

  // Stable paper order: by subject (config order), then chapter, then section.
  const subjectRank = new Map(config.subjects.map((s, i) => [s, i]));
  const kindRank: Record<string, number> = { vsa: 0, sa: 1, la: 2, case: 3 };
  questions = questions.sort(
    (a, b) =>
      (subjectRank.get(a.subject) ?? 99) - (subjectRank.get(b.subject) ?? 99) ||
      a.chapter.localeCompare(b.chapter) ||
      (kindRank[a.kind ?? ""] ?? 0) - (kindRank[b.kind ?? ""] ?? 0)
  );

  const totalMarks = questions.reduce((s, q) => s + q.marks, 0);
  const title = `${exam.short} · ${config.subjects.length > 2 ? `${config.subjects.length} subjects` : config.subjects.join(" + ")} · ${questions.length}Q`;

  return {
    title,
    blueprint,
    questions,
    totalMarks,
    review: { duplicatesRemoved, answersCorrected, toppedUp, chaptersMissing, difficultyMix },
  };
}
