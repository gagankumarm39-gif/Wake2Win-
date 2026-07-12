"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Copy,
  FileDown,
  Loader2,
  NotebookPen,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/assistant/markdown";
import { FlashcardDeck } from "./flashcard-deck";
import { createClient } from "@/lib/supabase/client";
import { useSSEGeneration } from "@/hooks/use-sse-generation";
import { NOTE_EXTRA_LABELS, cleanNotesMarkdown } from "@/lib/ai/notes-generator";
import { TEST_EXAMS, TEST_EXAM_ORDER } from "@/lib/exams/registry";
import { cn } from "@/lib/utils";
import {
  NOTE_EXTRA_KINDS,
  NOTE_FOCUSES,
  NOTE_LANGUAGES,
  NOTE_LENGTHS,
  type Flashcard,
  type NoteExtraKind,
  type NoteExtras,
  type NoteFocus,
  type NoteLanguage,
  type NoteLength,
  type NoteRecord,
} from "@/types/ai-studio";

interface ActiveNote {
  id: string | null;
  title: string;
  content: string;
  extras: NoteExtras;
}

function Chip<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          disabled={disabled}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50",
            value === o
              ? "bg-brand-500 text-white shadow-lg shadow-brand-500/25"
              : "bg-slate-200/70 text-slate-600 hover:bg-brand-500/15 hover:text-brand-500 dark:bg-slate-800 dark:text-slate-300"
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * AI Notes Studio: config → streamed markdown notes (KaTeX + GFM) →
 * on-demand extras (flashcards, formula sheet, …) → copy / print / PDF.
 */
export function NotesStudio({ savedInitial }: { savedInitial: NoteRecord[] }) {
  const supabase = createClient();

  // Config
  const [examId, setExamId] = useState<string>(TEST_EXAM_ORDER[0]);
  const exam = TEST_EXAMS[examId];
  const subjects = Object.keys(exam.subjects);
  const [subject, setSubject] = useState<string>(subjects[0]);
  const chapters = exam.subjects[subject] ?? [];
  const [chapter, setChapter] = useState<string>("");
  const [language, setLanguage] = useState<NoteLanguage>("English");
  const [length, setLength] = useState<NoteLength>("1 Page");
  const [focus, setFocus] = useState<NoteFocus>("NCERT Only");

  // Output
  const gen = useSSEGeneration("/api/notes/generate");
  const [note, setNote] = useState<ActiveNote | null>(null);
  const [saved, setSaved] = useState<NoteRecord[]>(savedInitial);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [extraBusy, setExtraBusy] = useState<NoteExtraKind | null>(null);
  const [extraError, setExtraError] = useState<string | null>(null);
  const [loadingNote, setLoadingNote] = useState<string | null>(null);

  function pickExam(id: string) {
    setExamId(id);
    const first = Object.keys(TEST_EXAMS[id].subjects)[0];
    setSubject(first);
    setChapter("");
  }

  function pickSubject(s: string) {
    setSubject(s);
    setChapter("");
  }

  async function generate(regenerateId?: string) {
    if (!chapter) return;
    setExtraError(null);
    setNote({ id: regenerateId ?? null, title: `${chapter} — ${length}`, content: "", extras: {} });
    const result = await gen.start({
      examId,
      subject,
      chapter,
      language,
      length,
      focus,
      ...(regenerateId ? { noteId: regenerateId } : {}),
    });
    if (result) {
      setNote((n) => (n ? { ...n, id: result.noteId ?? n.id, content: result.text } : n));
    }
    if (result?.noteId) {
      // Refresh the saved list from the server (new row or updated title).
      const { data } = await supabase
        .from("ai_notes")
        .select("id, title, exam, exam_name, subject, chapter, language, length, focus, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (data) setSaved(data as Partial<NoteRecord>[] as NoteRecord[]);
    }
  }

  async function openSaved(id: string) {
    setLoadingNote(id);
    gen.stop();
    const { data } = await supabase.from("ai_notes").select("*").eq("id", id).single<NoteRecord>();
    if (data) {
      setNote({ id: data.id, title: data.title, content: data.content, extras: data.extras ?? {} });
      gen.setText(data.content);
      // Restore the form to this note's config so Regenerate does the right thing.
      setExamId(data.exam);
      setSubject(data.subject);
      setChapter(data.chapter);
      setLanguage(data.language);
      setLength(data.length);
      setFocus(data.focus);
    }
    setLoadingNote(null);
  }

  async function removeSaved(id: string) {
    await supabase.from("ai_notes").delete().eq("id", id);
    setSaved((prev) => prev.filter((n) => n.id !== id));
    if (note?.id === id) setNote(null);
  }

  async function makeExtra(kind: NoteExtraKind) {
    if (!note?.id || extraBusy) return;
    setExtraBusy(kind);
    setExtraError(null);
    try {
      const res = await fetch("/api/notes/extras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId: note.id, kind }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setNote((n) => (n ? { ...n, extras: { ...n.extras, [kind]: data.content } } : n));
    } catch (err) {
      setExtraError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setExtraBusy(null);
    }
  }

  function fullMarkdown(): string {
    if (!note) return "";
    let md = cleanNotesMarkdown(note.content);
    for (const kind of NOTE_EXTRA_KINDS) {
      const extra = note.extras[kind];
      if (!extra) continue;
      const { label, icon } = NOTE_EXTRA_LABELS[kind];
      if (kind === "flashcards") {
        const cards = extra as Flashcard[];
        md += `\n\n---\n\n## ${icon} ${label}\n\n${cards.map((c, i) => `**${i + 1}. ${c.front}**\n${c.back}`).join("\n\n")}`;
      } else {
        md += `\n\n---\n\n## ${icon} ${label}\n\n${extra}`;
      }
    }
    return md;
  }

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(fullMarkdown());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable (http) — ignore
    }
  }

  const filteredSaved = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return saved;
    return saved.filter((n) => `${n.title} ${n.subject} ${n.chapter} ${n.exam_name}`.toLowerCase().includes(q));
  }, [saved, query]);

  // note.content is empty until generation completes; fall back to the live stream.
  // Strip any whole-answer code fence / JSON wrapper a model may have added so
  // the viewer shows formatted notes, not one gray code block (Priority: notes).
  const displayText = cleanNotesMarkdown(note?.content || gen.text);
  const showOutput = note !== null;

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      {/* ── Left rail: config + saved notes ── */}
      <div className="space-y-5 print:hidden">
        <div className="glass-card rounded-3xl p-5">
          <p className="flex items-center gap-2 font-bold">
            <NotebookPen className="h-4 w-4 text-brand-500" /> New notes
          </p>

          <div className="mt-4 space-y-4 text-sm">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Exam</p>
              <select
                value={examId}
                onChange={(e) => pickExam(e.target.value)}
                disabled={gen.streaming}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white/70 px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-700 dark:bg-slate-900/60"
              >
                {TEST_EXAM_ORDER.map((id) => (
                  <option key={id} value={id}>
                    {TEST_EXAMS[id].name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Subject</p>
              <select
                value={subject}
                onChange={(e) => pickSubject(e.target.value)}
                disabled={gen.streaming}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white/70 px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-700 dark:bg-slate-900/60"
              >
                {subjects.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Chapter</p>
              <select
                value={chapter}
                onChange={(e) => setChapter(e.target.value)}
                disabled={gen.streaming}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white/70 px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-700 dark:bg-slate-900/60"
              >
                <option value="">Choose a chapter…</option>
                {chapters.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Language</p>
              <Chip options={NOTE_LANGUAGES} value={language} onChange={setLanguage} disabled={gen.streaming} />
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Length</p>
              <Chip options={NOTE_LENGTHS} value={length} onChange={setLength} disabled={gen.streaming} />
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Exam focus</p>
              <Chip options={NOTE_FOCUSES} value={focus} onChange={setFocus} disabled={gen.streaming} />
            </div>

            {gen.streaming ? (
              <Button variant="outline" className="w-full" onClick={gen.stop}>
                <Square className="h-4 w-4" /> Stop
              </Button>
            ) : (
              <Button className="w-full" onClick={() => void generate()} disabled={!chapter}>
                <Sparkles className="h-4 w-4" /> Generate notes
              </Button>
            )}
          </div>
        </div>

        {/* Saved notes */}
        <div className="glass-card rounded-3xl p-5">
          <p className="font-bold">Saved notes</p>
          {saved.length > 3 && (
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search notes…"
                className="h-9 pl-9 text-sm"
              />
            </div>
          )}
          <div className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
            {filteredSaved.length === 0 && (
              <p className="py-4 text-center text-xs text-slate-400">
                {saved.length === 0 ? "Your generated notes appear here." : "No notes match."}
              </p>
            )}
            {filteredSaved.map((n) => (
              <div
                key={n.id}
                className={cn(
                  "group flex items-center gap-2 rounded-xl px-3 py-2.5 transition-colors",
                  note?.id === n.id ? "bg-brand-500/10" : "hover:bg-slate-900/5 dark:hover:bg-white/5"
                )}
              >
                <button onClick={() => void openSaved(n.id)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-semibold">{n.chapter}</p>
                  <p className="truncate text-[11px] text-slate-500">
                    {n.subject} · {n.length} · {n.language} · {fmtDate(n.created_at)}
                  </p>
                </button>
                {loadingNote === n.id ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-500" />
                ) : (
                  <button
                    onClick={() => void removeSaved(n.id)}
                    aria-label="Delete note"
                    className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-500 group-hover:flex"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main: the note ── */}
      <div>
        {!showOutput ? (
          <div className="glass-card flex min-h-96 flex-col items-center justify-center rounded-3xl p-10 text-center">
            <Sparkles className="h-10 w-10 text-brand-500" />
            <p className="mt-4 text-lg font-bold">Pick a chapter, get exam-ready notes</p>
            <p className="mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
              Headings, tables, formulas in LaTeX, mnemonics, common mistakes, PYQ concepts and NCERT keywords —
              streamed live, saved automatically.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="glass-card flex flex-wrap items-center gap-2 rounded-2xl px-4 py-3 print:hidden">
              <p className="min-w-0 flex-1 truncate text-sm font-bold">{note.title}</p>
              {gen.model && gen.streaming && (
                <span className="hidden text-[10px] text-slate-400 sm:block">{gen.model}</span>
              )}
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" onClick={() => void copyAll()} disabled={!displayText}>
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => window.print()} disabled={!displayText || gen.streaming}>
                  <Printer className="h-4 w-4" /> Print
                </Button>
                <Button size="sm" variant="outline" onClick={() => window.print()} disabled={!displayText || gen.streaming}>
                  <FileDown className="h-4 w-4" /> PDF
                </Button>
                <Button
                  size="sm"
                  onClick={() => void generate(note.id ?? undefined)}
                  disabled={gen.streaming || !chapter}
                >
                  <RefreshCw className={cn("h-4 w-4", gen.streaming && "animate-spin")} /> Regenerate
                </Button>
              </div>
            </div>

            {gen.error && (
              <div className="flex items-center gap-2 rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-500 print:hidden">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {gen.error}
              </div>
            )}

            {/* The note */}
            <div className="glass-card print-note rounded-3xl p-6 sm:p-8">
              {displayText ? (
                <Markdown content={displayText} />
              ) : gen.streaming ? (
                <div className="flex items-center gap-3 py-10 text-sm text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
                  Contacting AI providers — your key first, app fallback next…
                </div>
              ) : null}
              {gen.streaming && displayText && (
                <span className="mt-2 inline-block h-4 w-2 animate-pulse rounded-sm bg-brand-500" />
              )}

              {/* Extras render inside the printable area */}
              <AnimatePresence initial={false}>
                {NOTE_EXTRA_KINDS.filter((k) => note.extras[k]).map((kind) => {
                  const { label, icon } = NOTE_EXTRA_LABELS[kind];
                  const extra = note.extras[kind]!;
                  return (
                    <motion.div
                      key={kind}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="mt-8 border-t border-slate-200/70 pt-6 dark:border-slate-700/70"
                    >
                      <p className="mb-3 text-lg font-extrabold">
                        {icon} {label}
                      </p>
                      {kind === "flashcards" ? (
                        <FlashcardDeck cards={extra as Flashcard[]} />
                      ) : (
                        <Markdown content={extra as string} />
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            {/* Extras generator */}
            {note.id && !gen.streaming && (
              <div className="glass-card rounded-2xl p-4 print:hidden">
                <p className="text-sm font-bold">
                  <Plus className="mr-1 inline h-4 w-4 text-brand-500" />
                  Add to these notes
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {NOTE_EXTRA_KINDS.map((kind) => {
                    const { label, icon } = NOTE_EXTRA_LABELS[kind];
                    const done = !!note.extras[kind];
                    return (
                      <button
                        key={kind}
                        onClick={() => void makeExtra(kind)}
                        disabled={done || extraBusy !== null}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                          done
                            ? "bg-emerald-500/15 text-emerald-500"
                            : "bg-slate-200/70 text-slate-600 hover:bg-brand-500/15 hover:text-brand-500 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300"
                        )}
                      >
                        {extraBusy === kind ? <Loader2 className="h-3 w-3 animate-spin" /> : <span>{icon}</span>}
                        {label}
                        {done && <Check className="h-3 w-3" />}
                      </button>
                    );
                  })}
                </div>
                {extraError && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-red-500">
                    <AlertTriangle className="h-3.5 w-3.5" /> {extraError}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
