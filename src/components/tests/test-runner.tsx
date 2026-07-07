"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ChevronLeft, ChevronRight, Flag, Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { useCountdown, formatClock } from "@/hooks/use-countdown";
import { cn } from "@/lib/utils";
import type { TestAnalysis, TestAnswers, TestRecord } from "@/types/ai-studio";

const KIND_LABELS: Record<string, string> = {
  vsa: "Very Short Answer",
  sa: "Short Answer",
  la: "Long Answer",
  case: "Case Study",
};

type PaletteState = "current" | "answered" | "flagged" | "unanswered";

function paletteColor(state: PaletteState): string {
  switch (state) {
    case "current":
      return "bg-brand-500 text-white ring-2 ring-brand-300";
    case "answered":
      return "bg-emerald-500/85 text-white";
    case "flagged":
      return "bg-amber-400/90 text-slate-900";
    default:
      return "bg-slate-200/80 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  }
}

/** Full exam interface: timer · palette · flags · autosave · submit. */
export function TestRunner({
  test,
  onSubmitted,
}: {
  test: TestRecord;
  onSubmitted: (analysis: TestAnalysis, answers: TestAnswers) => void;
}) {
  const supabase = createClient();
  const [index, setIndex] = useState(test.current_index ?? 0);
  const [answers, setAnswers] = useState<TestAnswers>(test.answers ?? {});
  const [flagged, setFlagged] = useState<Set<string>>(new Set(test.flagged ?? []));
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const questions = test.questions;
  const q = questions[index];
  const questionStartRef = useRef(Date.now());
  const totalSeconds = test.config.durationMinutes * 60;
  const initialLeft = test.time_left_seconds ?? totalSeconds;

  const submittingRef = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const flaggedRef = useRef(flagged);
  flaggedRef.current = flagged;

  const submit = useCallback(
    async (auto = false) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setSubmitting(true);
      setError(null);
      const finalAnswers = answersRef.current;
      try {
        const res = await fetch(`/api/tests/${test.id}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answers: finalAnswers,
            timeSpentSeconds: Math.min(totalSeconds, totalSeconds - secondsLeftRef.current),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Submit failed");
        onSubmitted(data.analysis as TestAnalysis, finalAnswers);
      } catch (err) {
        submittingRef.current = false;
        setSubmitting(false);
        setError(
          `${err instanceof Error ? err.message : "Submit failed"}${auto ? " — time is up, please press Submit again." : ""}`
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [test.id, totalSeconds, onSubmitted]
  );

  const secondsLeft = useCountdown(initialLeft, () => void submit(true));
  const secondsLeftRef = useRef(secondsLeft);
  secondsLeftRef.current = secondsLeft;

  // Autosave progress every 10s + on unmount (enables resume).
  useEffect(() => {
    const save = () => {
      if (submittingRef.current) return;
      void supabase
        .from("ai_tests")
        .update({
          answers: answersRef.current,
          flagged: [...flaggedRef.current],
          current_index: index,
          time_left_seconds: secondsLeftRef.current,
        })
        .eq("id", test.id);
    };
    const id = setInterval(save, 10_000);
    return () => {
      clearInterval(id);
      save();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, test.id]);

  /** Merge a partial answer for the current question, tracking time spent. */
  function setAnswer(patch: Partial<TestAnswers[string]>) {
    const spent = Math.round((Date.now() - questionStartRef.current) / 1000);
    setAnswers((prev) => ({
      ...prev,
      [q.id]: {
        ...prev[q.id],
        ...patch,
        timeSeconds: (prev[q.id]?.timeSeconds ?? 0) + spent,
      },
    }));
    questionStartRef.current = Date.now();
  }

  function go(i: number) {
    if (i < 0 || i >= questions.length) return;
    setIndex(i);
    setPaletteOpen(false);
    questionStartRef.current = Date.now();
  }

  function toggleFlag() {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(q.id)) next.delete(q.id);
      else next.add(q.id);
      return next;
    });
  }

  const answeredCount = useMemo(
    () =>
      questions.filter((qq) => {
        const a = answers[qq.id];
        if (!a) return false;
        if (qq.type === "mcq") return typeof a.selectedIndex === "number";
        if (qq.type === "numerical") return !!a.value?.trim();
        return !!a.text?.trim();
      }).length,
    [questions, answers]
  );

  function stateOf(i: number): PaletteState {
    const qq = questions[i];
    if (i === index) return "current";
    if (flagged.has(qq.id)) return "flagged";
    const a = answers[qq.id];
    const answered =
      !!a &&
      ((qq.type === "mcq" && typeof a.selectedIndex === "number") ||
        (qq.type === "numerical" && !!a.value?.trim()) ||
        (qq.type === "subjective" && !!a.text?.trim()));
    return answered ? "answered" : "unanswered";
  }

  const a = answers[q.id];
  const lowTime = secondsLeft <= 300;

  const palette = (
    <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-5 xl:grid-cols-6">
      {questions.map((qq, i) => (
        <button
          key={qq.id}
          onClick={() => go(i)}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold transition-transform hover:scale-110",
            paletteColor(stateOf(i))
          )}
        >
          {i + 1}
        </button>
      ))}
    </div>
  );

  return (
    <main className="min-h-dvh bg-gradient-to-b from-white via-brand-50 to-white px-4 py-6 dark:from-[#0b0f1a] dark:via-[#131a2e] dark:to-[#0b0f1a]">
      <div className="mx-auto max-w-6xl">
        {/* Top bar */}
        <div className="glass-card sticky top-2 z-40 flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{test.title}</p>
            <p className="text-xs text-slate-500">
              {answeredCount}/{questions.length} answered
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-xl px-3 py-1.5 font-mono text-sm font-bold tabular-nums",
                lowTime ? "animate-pulse bg-red-500/15 text-red-500" : "bg-brand-500/10 text-brand-500"
              )}
            >
              {formatClock(secondsLeft)}
            </span>
            <Button size="sm" variant="outline" className="lg:hidden" onClick={() => setPaletteOpen(true)}>
              {index + 1}/{questions.length}
            </Button>
            <Button size="sm" onClick={() => setConfirming(true)} disabled={submitting}>
              <Send className="h-4 w-4" /> Submit
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_260px]">
          {/* Question card */}
          <AnimatePresence mode="wait">
            <motion.div
              key={q.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.15 }}
              className="glass-card rounded-3xl p-6"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-brand-500/10 px-2.5 py-1 font-semibold text-brand-500">
                  Q{index + 1} · {q.subject}
                </span>
                <span className="rounded-full bg-slate-200/70 px-2.5 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {q.chapter}
                </span>
                <span className="rounded-full bg-slate-200/70 px-2.5 py-1 capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {q.difficulty}
                </span>
                {q.kind && (
                  <span className="rounded-full bg-purple-500/10 px-2.5 py-1 font-semibold text-purple-500">
                    {KIND_LABELS[q.kind]}
                  </span>
                )}
                <span className="ml-auto text-slate-400">
                  +{q.marks}
                  {q.negativeMarks > 0 ? ` / −${q.negativeMarks}` : ""}
                </span>
              </div>

              <p className="mt-4 whitespace-pre-wrap text-[15px] font-medium leading-relaxed">{q.question}</p>

              {/* Answer input by type */}
              {q.type === "mcq" && q.options && (
                <div className="mt-5 space-y-2">
                  {q.options.map((opt, i) => {
                    const picked = a?.selectedIndex === i;
                    return (
                      <button
                        key={i}
                        onClick={() => setAnswer({ selectedIndex: picked ? undefined : i })}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition-all",
                          picked
                            ? "border-brand-500 bg-brand-500/10 font-semibold text-brand-600 dark:text-brand-400"
                            : "border-slate-200 hover:border-brand-300 hover:bg-brand-500/5 dark:border-slate-700"
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                            picked ? "bg-brand-500 text-white" : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                          )}
                        >
                          {String.fromCharCode(65 + i)}
                        </span>
                        <span className="pt-0.5">{opt}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {q.type === "numerical" && (
                <div className="mt-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Numerical answer
                  </p>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={a?.value ?? ""}
                    onChange={(e) => setAnswer({ value: e.target.value })}
                    placeholder="e.g. 9.8"
                    className="mt-2 max-w-xs font-mono"
                  />
                </div>
              )}

              {q.type === "subjective" && (
                <div className="mt-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Your answer ({q.marks} marks)
                  </p>
                  <textarea
                    value={a?.text ?? ""}
                    onChange={(e) => setAnswer({ text: e.target.value })}
                    rows={q.kind === "la" || q.kind === "case" ? 10 : 5}
                    placeholder="Write your answer here — it will be shown beside the model answer after submission."
                    className="mt-2 w-full rounded-2xl border border-slate-300 bg-white/70 p-4 text-sm shadow-sm transition-colors placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-700 dark:bg-slate-900/60"
                  />
                </div>
              )}

              {/* Bottom controls */}
              <div className="mt-6 flex items-center justify-between gap-2">
                <Button variant="outline" size="sm" onClick={() => go(index - 1)} disabled={index === 0}>
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <Button
                  variant={flagged.has(q.id) ? "default" : "outline"}
                  size="sm"
                  onClick={toggleFlag}
                  className={cn(flagged.has(q.id) && "bg-amber-500 hover:bg-amber-600 shadow-amber-500/25")}
                >
                  <Flag className="h-4 w-4" />
                  {flagged.has(q.id) ? "Flagged" : "Flag"}
                </Button>
                <Button size="sm" onClick={() => go(index + 1)} disabled={index === questions.length - 1}>
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Palette (desktop) */}
          <aside className="hidden lg:block">
            <div className="glass-card sticky top-20 rounded-3xl p-4">
              <p className="mb-3 text-sm font-bold">Questions</p>
              {palette}
              <div className="mt-4 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                <p><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-emerald-500/85" />Answered</p>
                <p><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-amber-400/90" />Flagged for review</p>
                <p><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />Not answered</p>
              </div>
            </div>
          </aside>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Palette drawer (mobile) */}
      <AnimatePresence>
        {paletteOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end bg-black/50 lg:hidden"
            onClick={() => setPaletteOpen(false)}
          >
            <motion.div
              initial={{ y: 300 }}
              animate={{ y: 0 }}
              exit={{ y: 300 }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
              className="max-h-[70dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 dark:bg-slate-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="font-bold">Question palette</p>
                <button onClick={() => setPaletteOpen(false)} aria-label="Close">
                  <X className="h-5 w-5 text-slate-400" />
                </button>
              </div>
              {palette}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit confirmation */}
      <AnimatePresence>
        {confirming && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6"
            onClick={() => !submitting && setConfirming(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="glass-card w-full max-w-sm rounded-3xl bg-white/95 p-6 dark:bg-slate-900/95"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-lg font-extrabold">Submit test?</p>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {answeredCount} of {questions.length} answered
                {flagged.size > 0 ? ` · ${flagged.size} flagged` : ""} · {formatClock(secondsLeft)} left.
              </p>
              <div className="mt-5 flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setConfirming(false)} disabled={submitting}>
                  Keep going
                </Button>
                <Button className="flex-1" onClick={() => void submit()} disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Submit
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
