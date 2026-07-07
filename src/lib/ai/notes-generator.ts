/**
 * AI Notes Studio — reusable prompt builders (server-only usage, but the
 * module itself is pure and import-safe anywhere).
 *
 * The notes stream goes through openChatStream (student keys → app chain);
 * extras go through generateWithChain. No provider logic lives here.
 */

import { getExam } from "@/lib/exams/registry";
import type { Flashcard, NoteConfig, NoteExtraKind } from "@/types/ai-studio";

const LENGTH_SPEC: Record<NoteConfig["length"], string> = {
  "Quick Revision":
    "Ultra-compact: 300–450 words. Only the highest-yield points, formulas and traps. A student revises this in 5 minutes.",
  "1 Page":
    "About 600–900 words — one printed page. Cover the whole chapter tightly with tables and bullets, no fluff.",
  Detailed:
    "Comprehensive: 1500–2200 words. Cover every NCERT concept in the chapter with depth, worked micro-examples and edge cases.",
};

const FOCUS_SPEC: Record<NoteConfig["focus"], string> = {
  "NCERT Only": "Stick strictly to NCERT content and NCERT keywords. Flag lines that are directly asked from NCERT.",
  "NEET Level": "NCERT base + NEET twist: assertion-reason traps, previous-year NEET concepts, elimination tricks.",
  "JEE Level": "Concept depth for JEE: derivations that matter, formula variants, common JEE Main/Advanced applications.",
  "Board Level": "Board-exam orientation: definitions as mark-fetching statements, diagrams to practice, stepwise answers.",
};

export function buildNotesPrompt(config: NoteConfig): { system: string; user: string } {
  const exam = getExam(config.examId);
  const examName = exam?.name ?? config.examId;
  const system = `You are Wake2Win's Notes Studio — an elite ${examName} educator who writes beautiful, information-dense revision notes for Indian students.
Output language: ${config.language}.${config.language !== "English" ? " Write the notes in " + config.language + " but keep technical terms, formulas and standard scientific vocabulary in English where students expect it." : ""}
Formatting: GitHub-flavored Markdown. Use # / ## / ### headings, tables, bullet lists, **bold** key terms, > blockquotes for tips, and LaTeX for every formula (inline $...$ or display $$...$$). For processes/flows draw simple text flowcharts with arrows inside fenced code blocks (e.g. Glucose → Pyruvate → Acetyl-CoA). Never use HTML.`;

  const user = `Create short notes for:
Exam: ${examName}
Subject: ${config.subject}
Chapter: ${config.chapter}
Length: ${config.length} — ${LENGTH_SPEC[config.length]}
Focus: ${config.focus} — ${FOCUS_SPEC[config.focus]}

Structure the notes with these sections (skip a section only if truly irrelevant to this chapter):
1. Title heading + one-line chapter essence
2. Core concepts (headings + subheadings, tables where data compares well)
3. ⚡ Important formulas (LaTeX, boxed in a table with "when to use")
4. Flowcharts for processes/mechanisms (text arrows in code blocks)
5. 🧠 Mnemonics & memory tricks
6. 📌 One-line revision points (rapid-fire list)
7. ⚠️ Common mistakes students make
8. ❓ Frequently asked questions (with crisp answers)
9. 🎯 Previous-year concepts that keep repeating
10. 📖 NCERT keywords to underline
11. 💡 Exam tips for this chapter

Highlight the most important concepts in **bold**. Be exam-accurate and specific to this chapter — no generic filler.`;

  return { system, user };
}

/* ── Extras ── */

export const NOTE_EXTRA_LABELS: Record<NoteExtraKind, { label: string; icon: string }> = {
  flashcards: { label: "Flashcards", icon: "🃏" },
  checklist: { label: "Revision checklist", icon: "✅" },
  lastminute: { label: "Last-minute sheet", icon: "⏰" },
  conceptmap: { label: "Concept map", icon: "🗺️" },
  formulas: { label: "Formula sheet", icon: "🧮" },
  reactions: { label: "Important reactions", icon: "⚗️" },
  definitions: { label: "Definitions", icon: "📖" },
  summary: { label: "Summary", icon: "📝" },
};

export function buildExtrasPrompt(config: NoteConfig, kind: NoteExtraKind, notes: string): string {
  const exam = getExam(config.examId);
  const header = `Chapter: ${config.chapter} (${config.subject}, ${exam?.name ?? config.examId}). Language: ${config.language}.
Base it on this chapter (existing notes for context):
---
${notes.slice(0, 6000)}
---
`;

  if (kind === "flashcards") {
    return `${header}
Create 12–20 spaced-repetition flashcards for this chapter. Front = a precise question/prompt; back = a crisp answer (max 40 words). Cover formulas, definitions, traps and previous-year concepts.
Respond with ONLY valid JSON: {"cards":[{"front":"...","back":"..."}]}`;
  }

  const specs: Record<Exclude<NoteExtraKind, "flashcards">, string> = {
    checklist:
      "Create a revision checklist in Markdown: `- [ ]` task list grouped under ### headings (Concepts / Formulas / Diagrams / Practice). Each item is a concrete, checkable revision action.",
    lastminute:
      "Create a last-minute revision sheet in Markdown: the 15–25 highest-yield facts, formulas and traps as ultra-short bullets a student reads outside the exam hall. No explanations.",
    conceptmap:
      "Create a concept map in Markdown: the chapter as a nested bullet hierarchy (topic → subtopic → key point), max 3 levels deep, with → arrows showing cause/effect links inside items.",
    formulas:
      "Create a formula sheet in Markdown: a table with columns Formula (LaTeX) | Variables | When to use | Common trap. Include every formula in the chapter.",
    reactions:
      "Create an important-reactions sheet in Markdown: each reaction in LaTeX/text with conditions above the arrow, grouped by type, with a one-line 'why it's asked' note. If the chapter has no chemical reactions, list the key transformations/derivations instead.",
    definitions:
      "Create a definitions sheet in Markdown: a table with columns Term | Exact exam-ready definition | One-line memory hook. Cover every NCERT keyword in the chapter.",
    summary:
      "Write a flowing 150–250 word summary of the chapter in Markdown — a single narrative a student reads once before sleeping. Bold the 8–10 most critical terms.",
  };

  return `${header}
${specs[kind as Exclude<NoteExtraKind, "flashcards">]}
Respond with ONLY the Markdown content — no preamble, no code fence around the whole answer.`;
}

/** Parse + validate the flashcards JSON returned by the model. */
export function parseFlashcards(raw: string): Flashcard[] {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON in model output");
  const data = JSON.parse(raw.slice(start, end + 1)) as { cards?: unknown };
  if (!Array.isArray(data.cards)) throw new Error("No cards");
  return data.cards
    .filter(
      (c): c is Flashcard =>
        typeof c === "object" && c !== null &&
        typeof (c as Flashcard).front === "string" && typeof (c as Flashcard).back === "string"
    )
    .slice(0, 30);
}
