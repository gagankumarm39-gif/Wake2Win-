import type { Exam } from "@/types";

export const EXAM_SUBJECTS: Record<Exam, string[]> = {
  NEET: ["Physics", "Chemistry", "Biology"],
  JEE: ["Physics", "Chemistry", "Mathematics"],
  UPSC: ["Polity", "History", "Geography", "Economy", "Environment", "Current Affairs"],
  SSC: ["Quantitative Aptitude", "Reasoning", "English", "General Awareness"],
  GATE: ["Engineering Mathematics", "Computer Science", "General Aptitude"],
  CAT: ["Quantitative Ability", "VARC", "DILR"],
  BOARDS: ["Physics", "Chemistry", "Mathematics", "Biology", "Science", "English"],
};

export function defaultSubject(exam: Exam): string {
  return EXAM_SUBJECTS[exam][0];
}

/** Rotating subject of the day for the daily challenge. */
export function dailySubject(exam: Exam, date = new Date()): string {
  const subjects = EXAM_SUBJECTS[exam];
  const dayOfYear = Math.floor(
    (date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86_400_000
  );
  return subjects[dayOfYear % subjects.length];
}
