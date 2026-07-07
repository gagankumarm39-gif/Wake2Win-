/**
 * Test grading — pure functions, no I/O, so both the submit API route and
 * unit tests can use them.
 *
 * MCQ/numerical papers are auto-graded (with negative marking from each
 * question's own negativeMarks). Subjective papers can't be machine-scored:
 * they are marked attempted/skipped and reviewed against model answers, and
 * the analysis carries autoGraded=false.
 */

import type {
  ChapterBreakdown,
  SubjectBreakdown,
  TestAnalysis,
  TestAnswer,
  TestAnswers,
  TestQuestion,
} from "@/types/ai-studio";

function isAttempted(q: TestQuestion, a: TestAnswer | undefined): boolean {
  if (!a) return false;
  if (q.type === "mcq") return typeof a.selectedIndex === "number";
  if (q.type === "numerical") return typeof a.value === "string" && a.value.trim() !== "";
  return typeof a.text === "string" && a.text.trim() !== "";
}

/** Numerical answers match within a small tolerance (JEE-style). */
export function numericalMatches(expected: string, given: string): boolean {
  const e = parseFloat(expected);
  const g = parseFloat(given);
  if (Number.isFinite(e) && Number.isFinite(g)) {
    const tolerance = Math.max(0.01, Math.abs(e) * 0.005);
    return Math.abs(e - g) <= tolerance;
  }
  return expected.trim().toLowerCase() === given.trim().toLowerCase();
}

/** null = can't auto-grade (subjective / unattempted). */
export function isCorrect(q: TestQuestion, a: TestAnswer | undefined): boolean | null {
  if (!isAttempted(q, a)) return null;
  if (q.type === "mcq") return a!.selectedIndex === q.correctIndex;
  if (q.type === "numerical") return numericalMatches(q.answerValue ?? "", a!.value ?? "");
  return null; // subjective — reviewed against the model answer
}

function recommendationsFor(
  weak: ChapterBreakdown[],
  accuracy: number,
  skipped: number,
  total: number,
  autoGraded: boolean
): string[] {
  const recs: string[] = [];
  if (!autoGraded) {
    recs.push("Compare each of your answers with the model answers — mark yourself strictly, a board examiner would.");
  }
  for (const c of weak.slice(0, 3)) {
    recs.push(`Revise ${c.chapter} (${c.subject}) — ${c.accuracy}% accuracy here. Re-read NCERT and redo the mistakes below.`);
  }
  if (autoGraded) {
    if (skipped > total * 0.25) {
      recs.push(`You skipped ${skipped} questions. Practice attempting more — even educated elimination beats a blank in most papers.`);
    }
    if (accuracy > 0 && accuracy < 50) {
      recs.push("Accuracy below 50% — slow down and secure the easy questions before touching the hard ones.");
    } else if (accuracy >= 85) {
      recs.push("Great accuracy! Push question count or difficulty in your next test to build speed.");
    }
  }
  if (recs.length === 0) {
    recs.push("Solid attempt. Retake this test in a week and aim to beat this score.");
  }
  return recs;
}

export function gradeTest(
  questions: TestQuestion[],
  answers: TestAnswers,
  timeSpentSeconds: number
): TestAnalysis {
  const autoGraded = questions.every((q) => q.type !== "subjective");

  let attempted = 0;
  let correct = 0;
  let incorrect = 0;
  let score = 0;
  const mistakes: string[] = [];

  const subjectMap = new Map<string, SubjectBreakdown>();
  const chapterMap = new Map<string, ChapterBreakdown>();

  for (const q of questions) {
    const a = answers[q.id];
    const att = isAttempted(q, a);
    const result = isCorrect(q, a);

    const sub =
      subjectMap.get(q.subject) ??
      ({ subject: q.subject, total: 0, attempted: 0, correct: 0, marks: 0, maxMarks: 0 } satisfies SubjectBreakdown);
    const chKey = `${q.subject}::${q.chapter}`;
    const ch =
      chapterMap.get(chKey) ??
      ({ subject: q.subject, chapter: q.chapter, total: 0, attempted: 0, correct: 0, accuracy: 0 } satisfies ChapterBreakdown);

    sub.total++;
    sub.maxMarks += q.marks;
    ch.total++;
    if (att) {
      attempted++;
      sub.attempted++;
      ch.attempted++;
    }
    if (result === true) {
      correct++;
      score += q.marks;
      sub.correct++;
      sub.marks += q.marks;
      ch.correct++;
    } else if (result === false) {
      incorrect++;
      score -= q.negativeMarks;
      sub.marks -= q.negativeMarks;
      mistakes.push(q.id);
    }

    subjectMap.set(q.subject, sub);
    chapterMap.set(chKey, ch);
  }

  const byChapter = [...chapterMap.values()].map((c) => ({
    ...c,
    accuracy: c.attempted > 0 ? Math.round((c.correct / c.attempted) * 100) : 0,
  }));

  // Weakest first: chapters with attempts and low accuracy, then untouched ones.
  const weak = autoGraded
    ? [...byChapter]
        .filter((c) => c.attempted > 0 && c.accuracy < 70)
        .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total)
    : [];

  const totalMarks = questions.reduce((s, q) => s + q.marks, 0);
  const skipped = questions.length - attempted;
  const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;

  return {
    totalQuestions: questions.length,
    attempted,
    correct,
    incorrect,
    skipped,
    score: Math.round(score * 100) / 100,
    totalMarks,
    accuracy,
    timeSpentSeconds,
    bySubject: [...subjectMap.values()],
    byChapter,
    weakChapters: weak.map((c) => `${c.subject} · ${c.chapter}`),
    mistakes,
    recommendations: recommendationsFor(weak, accuracy, skipped, questions.length, autoGraded),
    autoGraded,
  };
}
