/**
 * Shared types for the AI Test Generator and AI Notes Studio.
 * Kept separate from types/index.ts so the existing alarm/assistant types
 * (and everything that imports them) stay untouched.
 */

import type { QuestionSource } from "@/types";

/* ══════════════════ Feature 1 — AI Test Generator ══════════════════ */

export type TestDifficulty = "easy" | "medium" | "hard" | "mixed";
export type QuestionDifficulty = "easy" | "medium" | "hard";
export type TestQuestionType = "mcq" | "numerical" | "subjective";
/** Subjective paper sections (board exams). */
export type SubjectiveKind = "vsa" | "sa" | "la" | "case";
export type BloomLevel = "Remember" | "Understand" | "Apply" | "Analyze" | "Evaluate" | "Create";
export type TestStatus = "ready" | "in_progress" | "completed";

export interface TestConfig {
  examId: string;
  /** Selected subjects, in display order. */
  subjects: string[];
  /** Selected chapters per subject (empty array = whole syllabus). */
  chapters: Record<string, string[]>;
  difficulty: TestDifficulty;
  questionCount: number;
  negativeMarking: boolean;
  durationMinutes: number;
  /** True when the official full-paper pattern was chosen (e.g. NEET 720). */
  officialPattern: boolean;
}

export interface BlueprintItem {
  subject: string;
  chapter: string;
  count: number;
  /** How many of `count` should be numerical (mcq-numerical exams only). */
  numericalCount?: number;
}

export interface TestQuestion {
  id: string;
  type: TestQuestionType;
  subject: string;
  chapter: string;
  question: string;
  /** MCQ: exactly 4 options. */
  options?: string[];
  /** MCQ: index into options. */
  correctIndex?: number;
  /** Numerical: the expected value, e.g. "9.8". */
  answerValue?: string;
  /** Subjective: full model answer. */
  modelAnswer?: string;
  /** Subjective section. */
  kind?: SubjectiveKind;
  explanation: string;
  difficulty: QuestionDifficulty;
  marks: number;
  negativeMarks: number;
  estimatedSeconds: number;
  bloom: BloomLevel;
  source: QuestionSource;
}

/** A student's saved answer for one question. */
export interface TestAnswer {
  /** MCQ. */
  selectedIndex?: number;
  /** Numerical. */
  value?: string;
  /** Subjective. */
  text?: string;
  timeSeconds: number;
}

export type TestAnswers = Record<string, TestAnswer>;

export interface SubjectBreakdown {
  subject: string;
  total: number;
  attempted: number;
  correct: number;
  marks: number;
  maxMarks: number;
}

export interface ChapterBreakdown {
  subject: string;
  chapter: string;
  total: number;
  attempted: number;
  correct: number;
  accuracy: number;
}

export interface TestAnalysis {
  totalQuestions: number;
  attempted: number;
  correct: number;
  incorrect: number;
  skipped: number;
  score: number;
  totalMarks: number;
  /** % of attempted that were correct. */
  accuracy: number;
  timeSpentSeconds: number;
  bySubject: SubjectBreakdown[];
  byChapter: ChapterBreakdown[];
  /** "Subject · Chapter" labels, weakest first. */
  weakChapters: string[];
  /** Question ids answered incorrectly. */
  mistakes: string[];
  recommendations: string[];
  /** Subjective papers are reviewed against model answers, not auto-scored. */
  autoGraded: boolean;
}

/** Row shape of the ai_tests table. */
export interface TestRecord {
  id: string;
  user_id: string;
  title: string;
  exam: string;
  exam_name: string;
  config: TestConfig;
  blueprint: BlueprintItem[];
  questions: TestQuestion[];
  status: TestStatus;
  answers: TestAnswers;
  flagged: string[];
  current_index: number;
  time_left_seconds: number | null;
  started_at: string | null;
  completed_at: string | null;
  score: number | null;
  total_marks: number;
  analysis: TestAnalysis | null;
  created_at: string;
  updated_at: string;
}

/* ══════════════════ Feature 2 — AI Notes Studio ══════════════════ */

export const NOTE_LANGUAGES = ["English", "Kannada", "Hindi"] as const;
export type NoteLanguage = (typeof NOTE_LANGUAGES)[number];

export const NOTE_LENGTHS = ["Quick Revision", "1 Page", "Detailed"] as const;
export type NoteLength = (typeof NOTE_LENGTHS)[number];

export const NOTE_FOCUSES = ["NCERT Only", "NEET Level", "JEE Level", "Board Level"] as const;
export type NoteFocus = (typeof NOTE_FOCUSES)[number];

export interface NoteConfig {
  examId: string;
  subject: string;
  chapter: string;
  language: NoteLanguage;
  length: NoteLength;
  focus: NoteFocus;
}

export const NOTE_EXTRA_KINDS = [
  "flashcards",
  "checklist",
  "lastminute",
  "conceptmap",
  "formulas",
  "reactions",
  "definitions",
  "summary",
] as const;
export type NoteExtraKind = (typeof NOTE_EXTRA_KINDS)[number];

export interface Flashcard {
  front: string;
  back: string;
}

/** flashcards → card deck; every other kind → a markdown section. */
export type NoteExtras = { flashcards?: Flashcard[] } & Partial<
  Record<Exclude<NoteExtraKind, "flashcards">, string>
>;

/** Row shape of the ai_notes table. */
export interface NoteRecord {
  id: string;
  user_id: string;
  title: string;
  exam: string;
  exam_name: string;
  subject: string;
  chapter: string;
  language: NoteLanguage;
  length: NoteLength;
  focus: NoteFocus;
  content: string;
  extras: NoteExtras;
  created_at: string;
  updated_at: string;
}
