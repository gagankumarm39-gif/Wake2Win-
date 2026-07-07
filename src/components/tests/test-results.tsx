"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock,
  Lightbulb,
  Loader2,
  MinusCircle,
  RotateCcw,
  Target,
  TrendingDown,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { isCorrect } from "@/lib/tests/grading";
import { formatClock } from "@/hooks/use-countdown";
import { cn } from "@/lib/utils";
import type { TestQuestion, TestRecord } from "@/types/ai-studio";

type Filter = "all" | "mistakes" | "skipped";

function Stat({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string; tone?: string }) {
  return (
    <div className="glass rounded-2xl p-4 text-center">
      <Icon className={cn("mx-auto h-5 w-5", tone ?? "text-brand-500")} />
      <p className="mt-1 text-xl font-extrabold tabular-nums">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

function QuestionReview({ q, test }: { q: TestQuestion; test: TestRecord }) {
  const [open, setOpen] = useState(false);
  const a = test.answers[q.id];
  const result = isCorrect(q, a);
  const subjective = q.type === "subjective";

  return (
    <div className="glass rounded-2xl">
      <button onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 p-4 text-left">
        {result === true ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
        ) : result === false ? (
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
        ) : (
          <MinusCircle className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-relaxed">{q.question}</p>
          <p className="mt-1 text-xs text-slate-500">
            {q.subject} · {q.chapter} · {q.difficulty} · {q.bloom}
            {a?.timeSeconds ? ` · ${formatClock(Math.round(a.timeSeconds))}` : ""}
          </p>
        </div>
        <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-slate-200/70 px-4 py-4 text-sm dark:border-slate-700/70">
          {q.type === "mcq" && q.options && (
            <div className="space-y-1.5">
              {q.options.map((opt, i) => {
                const isAnswer = i === q.correctIndex;
                const wasPicked = a?.selectedIndex === i;
                return (
                  <p
                    key={i}
                    className={cn(
                      "rounded-xl px-3 py-2",
                      isAnswer && "bg-emerald-500/10 font-semibold text-emerald-600 dark:text-emerald-400",
                      wasPicked && !isAnswer && "bg-red-500/10 text-red-500 line-through"
                    )}
                  >
                    <b>{String.fromCharCode(65 + i)}.</b> {opt}
                    {isAnswer && " ✓"}
                    {wasPicked && !isAnswer && " (your pick)"}
                  </p>
                );
              })}
            </div>
          )}

          {q.type === "numerical" && (
            <div className="space-y-1">
              <p>
                Correct answer: <b className="text-emerald-500">{q.answerValue}</b>
              </p>
              <p>
                Your answer:{" "}
                <b className={result === true ? "text-emerald-500" : "text-red-500"}>{a?.value?.trim() || "—"}</b>
              </p>
            </div>
          )}

          {subjective && (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Your answer</p>
                <p className="mt-1 whitespace-pre-wrap rounded-xl bg-slate-100/70 p-3 dark:bg-slate-800/70">
                  {a?.text?.trim() || "— skipped —"}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">Model answer</p>
                <p className="mt-1 whitespace-pre-wrap rounded-xl bg-emerald-500/10 p-3">{q.modelAnswer}</p>
              </div>
            </div>
          )}

          {q.explanation && q.explanation !== q.modelAnswer && (
            <div className="mt-3 rounded-xl bg-brand-500/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-500">
                <Lightbulb className="h-3.5 w-3.5" /> Explanation
              </p>
              <p className="mt-1 whitespace-pre-wrap text-slate-600 dark:text-slate-300">{q.explanation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Score + detailed analysis + full answer review. */
export function TestResults({
  test,
  onRetake,
  busy,
}: {
  test: TestRecord;
  onRetake: () => void;
  busy: boolean;
}) {
  const analysis = test.analysis!;
  const [filter, setFilter] = useState<Filter>("all");

  const pct = analysis.totalMarks > 0 ? Math.max(0, Math.round((analysis.score / analysis.totalMarks) * 100)) : 0;

  const visible = useMemo(() => {
    if (filter === "mistakes") return test.questions.filter((q) => analysis.mistakes.includes(q.id));
    if (filter === "skipped")
      return test.questions.filter((q) => {
        const a = test.answers[q.id];
        return isCorrect(q, a) === null && q.type !== "subjective"
          ? true
          : q.type === "subjective" && !a?.text?.trim();
      });
    return test.questions;
  }, [filter, test, analysis]);

  return (
    <main className="min-h-dvh px-4 py-8 bg-gradient-to-b from-white via-brand-50 to-white dark:from-[#0b0f1a] dark:via-[#131a2e] dark:to-[#0b0f1a]">
      <div className="mx-auto max-w-3xl">
        <Link href="/tests" className="text-sm text-slate-500 hover:text-brand-500">← AI Tests</Link>

        {/* Score hero */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card mt-3 rounded-3xl p-8 text-center"
        >
          <p className="text-xs font-bold uppercase tracking-widest text-brand-500">{test.exam_name}</p>
          <h1 className="mt-1 text-xl font-extrabold">{test.title}</h1>
          {analysis.autoGraded ? (
            <>
              <p className="mt-4 text-5xl font-extrabold tabular-nums">
                {analysis.score}
                <span className="text-2xl text-slate-400"> / {analysis.totalMarks}</span>
              </p>
              <p className="mt-1 text-sm text-slate-500">{pct}% score · {analysis.accuracy}% accuracy</p>
            </>
          ) : (
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
              Subjective paper — compare your answers with the model answers below and mark yourself strictly.
            </p>
          )}
        </motion.div>

        {/* Stats */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat icon={CheckCircle2} label="Correct" value={String(analysis.correct)} tone="text-emerald-500" />
          <Stat icon={XCircle} label="Incorrect" value={String(analysis.incorrect)} tone="text-red-500" />
          <Stat icon={MinusCircle} label="Skipped" value={String(analysis.skipped)} tone="text-slate-400" />
          <Stat icon={Clock} label="Time" value={formatClock(analysis.timeSpentSeconds)} />
        </div>

        {/* Subject breakdown */}
        {analysis.autoGraded && analysis.bySubject.length > 0 && (
          <div className="glass-card mt-4 rounded-3xl p-6">
            <p className="flex items-center gap-2 font-bold">
              <Target className="h-4 w-4 text-brand-500" /> Subject performance
            </p>
            <div className="mt-4 space-y-3">
              {analysis.bySubject.map((s) => {
                const p = s.maxMarks > 0 ? Math.max(0, Math.round((s.marks / s.maxMarks) * 100)) : 0;
                return (
                  <div key={s.subject}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold">{s.subject}</span>
                      <span className="tabular-nums text-slate-500">
                        {s.marks}/{s.maxMarks} · {s.correct}/{s.total} correct
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-800">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${p}%` }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className={cn(
                          "h-full rounded-full",
                          p >= 70 ? "bg-emerald-500" : p >= 40 ? "bg-amber-400" : "bg-red-500"
                        )}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Weak chapters + recommendations */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {analysis.weakChapters.length > 0 && (
            <div className="glass-card rounded-3xl p-6">
              <p className="flex items-center gap-2 font-bold">
                <TrendingDown className="h-4 w-4 text-red-500" /> Weak chapters
              </p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                {analysis.weakChapters.slice(0, 6).map((c) => (
                  <li key={c} className="rounded-xl bg-red-500/5 px-3 py-2">{c}</li>
                ))}
              </ul>
            </div>
          )}
          <div className={cn("glass-card rounded-3xl p-6", analysis.weakChapters.length === 0 && "sm:col-span-2")}>
            <p className="flex items-center gap-2 font-bold">
              <BookOpen className="h-4 w-4 text-brand-500" /> Recommended revision
            </p>
            <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
              {analysis.recommendations.map((r, i) => (
                <li key={i} className="rounded-xl bg-brand-500/5 px-3 py-2">{r}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Answer review */}
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-lg font-extrabold">Answer review</p>
            <div className="flex gap-1.5">
              {(
                [
                  ["all", `All (${analysis.totalQuestions})`],
                  ["mistakes", `Mistakes (${analysis.mistakes.length})`],
                  ["skipped", `Skipped (${analysis.skipped})`],
                ] as [Filter, string][]
              ).map(([f, label]) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                    filter === f
                      ? "bg-brand-500 text-white"
                      : "bg-slate-200/70 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 space-y-2.5">
            {visible.map((q) => (
              <QuestionReview key={q.id} q={q} test={test} />
            ))}
            {visible.length === 0 && (
              <p className="glass rounded-2xl p-6 text-center text-sm text-slate-500">Nothing here 🎉</p>
            )}
          </div>
        </div>

        <div className="mt-8 flex gap-3 pb-10">
          <Button onClick={onRetake} disabled={busy} variant="outline" className="flex-1">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Retake this test
          </Button>
          <Link href="/tests/new" className="flex-1">
            <Button className="w-full">New AI test</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
