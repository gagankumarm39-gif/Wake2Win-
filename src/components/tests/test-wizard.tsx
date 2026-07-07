"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Clock, Crown, Loader2, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  QUESTION_COUNT_PRESETS,
  TEST_EXAMS,
  TEST_EXAM_ORDER,
  suggestedDuration,
  type ExamDefinition,
} from "@/lib/exams/registry";
import type { TestDifficulty } from "@/types/ai-studio";

type Step = 0 | 1 | 2 | 3;
const STEP_LABELS = ["Exam", "Subjects", "Chapters", "Settings"];

interface QuotaInfo {
  allowed: boolean;
  premium: boolean;
  nextAt: string | null;
}

const DIFFICULTIES: { id: TestDifficulty; label: string; hint: string }[] = [
  { id: "easy", label: "Easy", hint: "Confidence builder" },
  { id: "medium", label: "Medium", hint: "Exam standard" },
  { id: "hard", label: "Hard", hint: "Rank pusher" },
  { id: "mixed", label: "Mixed", hint: "Realistic paper" },
];

function fmtCountdown(nextAt: string): string {
  const ms = new Date(nextAt).getTime() - Date.now();
  if (ms <= 0) return "now";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.ceil((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** 4-step test creation wizard → POST /api/tests/generate → runner. */
export function TestWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [examId, setExamId] = useState<string>(TEST_EXAM_ORDER[0]);
  const [official, setOfficial] = useState(false);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [chapters, setChapters] = useState<Record<string, string[]>>({});
  const [difficulty, setDifficulty] = useState<TestDifficulty>("mixed");
  const [count, setCount] = useState<number>(30);
  const [customCount, setCustomCount] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [negative, setNegative] = useState(true);
  const [duration, setDuration] = useState<number | null>(null);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exam: ExamDefinition = TEST_EXAMS[examId];
  const allSubjects = Object.keys(exam.subjects);

  useEffect(() => {
    fetch("/api/tests/generate")
      .then((r) => (r.ok ? r.json() : null))
      .then((q: QuotaInfo | null) => q && setQuota(q))
      .catch(() => {});
  }, []);

  // Changing exam resets downstream choices.
  function pickExam(id: string) {
    setExamId(id);
    setOfficial(false);
    setSubjects([]);
    setChapters({});
    setNegative(TEST_EXAMS[id].supportsNegativeMarking);
    setCount(TEST_EXAMS[id].defaultQuestionCount);
    setUseCustom(false);
    setDuration(null);
  }

  function toggleSubject(s: string) {
    setSubjects((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  function toggleChapter(subject: string, chapter: string) {
    setChapters((prev) => {
      const cur = prev[subject] ?? [];
      const next = cur.includes(chapter) ? cur.filter((c) => c !== chapter) : [...cur, chapter];
      return { ...prev, [subject]: next };
    });
  }

  const effectiveCount = useCustom ? Math.max(5, Math.min(200, parseInt(customCount) || 0)) : count;
  const effectiveDuration = official && exam.officialPattern
    ? exam.officialPattern.durationMinutes
    : duration ?? suggestedDuration(exam, effectiveCount);

  const canNext = useMemo(() => {
    if (step === 0) return true;
    if (step === 1) return official || subjects.length > 0;
    if (step === 2) return true; // empty chapter selection = whole syllabus
    return effectiveCount >= 5;
  }, [step, official, subjects, effectiveCount]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tests/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examId,
          subjects: official && exam.officialPattern ? Object.keys(exam.officialPattern.subjectCounts) : subjects,
          chapters,
          difficulty,
          questionCount: effectiveCount,
          negativeMarking: negative,
          durationMinutes: effectiveDuration,
          officialPattern: official,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Generation failed — please try again.");
        if (res.status === 429 && data.nextAt) {
          setQuota({ allowed: false, premium: false, nextAt: data.nextAt });
        }
        setBusy(false);
        return;
      }
      router.push(`/tests/${data.id}`);
    } catch {
      setError("Network error — check your connection and try again.");
      setBusy(false);
    }
  }

  const blocked = quota !== null && !quota.allowed;

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEP_LABELS.map((label, i) => (
          <button
            key={label}
            onClick={() => i < step && setStep(i as Step)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
              i === step
                ? "bg-brand-500 text-white shadow-lg shadow-brand-500/30"
                : i < step
                  ? "bg-brand-500/15 text-brand-500 cursor-pointer"
                  : "bg-slate-200/60 text-slate-400 dark:bg-slate-800/60"
            )}
          >
            {i < step ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>}
            {label}
          </button>
        ))}
      </div>

      {/* Quota banner */}
      {quota && !quota.premium && (
        <div
          className={cn(
            "glass flex items-center gap-3 rounded-2xl px-4 py-3 text-sm",
            blocked ? "border border-amber-400/40" : ""
          )}
        >
          {blocked ? (
            <>
              <Clock className="h-4 w-4 shrink-0 text-amber-500" />
              <span>
                Free limit used — next AI test in <b>{quota.nextAt ? fmtCountdown(quota.nextAt) : "24h"}</b>.
                <span className="ml-1 inline-flex items-center gap-1 text-amber-500"><Crown className="h-3.5 w-3.5" /> Premium unlocks unlimited tests (coming soon).</span>
              </span>
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 shrink-0 text-brand-500" />
              <span>You have <b>1 free AI test</b> available. Free plan: one test every 24 hours.</span>
            </>
          )}
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.18 }}
        >
          {/* ── Step 0: Exam ── */}
          {step === 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {TEST_EXAM_ORDER.map((id) => {
                const e = TEST_EXAMS[id];
                const active = examId === id;
                return (
                  <button
                    key={id}
                    onClick={() => pickExam(id)}
                    className={cn(
                      "glass-card rounded-2xl p-4 text-left transition-all",
                      active && "ring-2 ring-brand-500"
                    )}
                  >
                    <p className="font-bold">{e.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{e.tagline}</p>
                    <p className="mt-2 text-[11px] uppercase tracking-wide text-slate-400">
                      {Object.keys(e.subjects).join(" · ")}
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Step 1: Subjects (+ official pattern) ── */}
          {step === 1 && (
            <div className="space-y-4">
              {exam.officialPattern && (
                <button
                  onClick={() => setOfficial(!official)}
                  className={cn(
                    "glass-card w-full rounded-2xl p-4 text-left transition-all",
                    official && "ring-2 ring-brand-500"
                  )}
                >
                  <p className="flex items-center gap-2 font-bold">
                    <Wand2 className="h-4 w-4 text-brand-500" />
                    {exam.officialPattern.label}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    All subjects, official distribution, official timing — the real-deal mock.
                  </p>
                </button>
              )}
              <div className={cn("grid gap-3 sm:grid-cols-2", official && "pointer-events-none opacity-40")}>
                {allSubjects.map((s) => {
                  const active = subjects.includes(s);
                  return (
                    <button
                      key={s}
                      onClick={() => toggleSubject(s)}
                      className={cn(
                        "glass rounded-2xl px-4 py-3 text-left font-semibold transition-all",
                        active && "ring-2 ring-brand-500"
                      )}
                    >
                      <span className="flex items-center justify-between">
                        {s}
                        {active && <Check className="h-4 w-4 text-brand-500" />}
                      </span>
                      <span className="mt-0.5 block text-xs font-normal text-slate-500 dark:text-slate-400">
                        {exam.subjects[s].length} chapters
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Step 2: Chapters ── */}
          {step === 2 && (
            <div className="space-y-5">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Select chapters per subject — leave a subject untouched to include its <b>whole syllabus</b>.
              </p>
              {(official && exam.officialPattern ? Object.keys(exam.officialPattern.subjectCounts) : subjects).map((s) => {
                const selected = chapters[s] ?? [];
                return (
                  <div key={s} className="glass rounded-2xl p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-bold">{s}</p>
                      <button
                        onClick={() => setChapters((prev) => ({ ...prev, [s]: [] }))}
                        className="text-xs text-slate-400 hover:text-brand-500"
                      >
                        {selected.length > 0 ? `${selected.length} selected · clear` : "Whole syllabus"}
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {exam.subjects[s].map((c) => {
                        const active = selected.includes(c);
                        return (
                          <button
                            key={c}
                            onClick={() => toggleChapter(s, c)}
                            className={cn(
                              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                              active
                                ? "bg-brand-500 text-white"
                                : "bg-slate-200/70 text-slate-600 hover:bg-brand-500/15 hover:text-brand-500 dark:bg-slate-800 dark:text-slate-300"
                            )}
                          >
                            {c}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Step 3: Settings ── */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="glass rounded-2xl p-4">
                <p className="font-bold">Difficulty</p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setDifficulty(d.id)}
                      className={cn(
                        "rounded-xl px-3 py-2.5 text-sm font-semibold transition-all",
                        difficulty === d.id
                          ? "bg-brand-500 text-white shadow-lg shadow-brand-500/25"
                          : "bg-slate-200/70 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      )}
                    >
                      {d.label}
                      <span className="block text-[10px] font-normal opacity-80">{d.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              {!official && (
                <div className="glass rounded-2xl p-4">
                  <p className="font-bold">Questions</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {QUESTION_COUNT_PRESETS.map((n) => (
                      <button
                        key={n}
                        onClick={() => {
                          setCount(n);
                          setUseCustom(false);
                        }}
                        className={cn(
                          "rounded-xl px-4 py-2 text-sm font-semibold transition-all",
                          !useCustom && count === n
                            ? "bg-brand-500 text-white shadow-lg shadow-brand-500/25"
                            : "bg-slate-200/70 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        )}
                      >
                        {n}
                      </button>
                    ))}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setUseCustom(true)}
                        className={cn(
                          "rounded-xl px-4 py-2 text-sm font-semibold transition-all",
                          useCustom
                            ? "bg-brand-500 text-white shadow-lg shadow-brand-500/25"
                            : "bg-slate-200/70 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        )}
                      >
                        Custom
                      </button>
                      {useCustom && (
                        <Input
                          type="number"
                          min={5}
                          max={200}
                          value={customCount}
                          onChange={(e) => setCustomCount(e.target.value)}
                          placeholder="5–200"
                          className="h-10 w-24"
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="glass rounded-2xl p-4">
                  <p className="font-bold">Negative marking</p>
                  {exam.supportsNegativeMarking ? (
                    <div className="mt-3 flex gap-2">
                      {[true, false].map((v) => (
                        <button
                          key={String(v)}
                          onClick={() => setNegative(v)}
                          className={cn(
                            "flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-all",
                            negative === v
                              ? "bg-brand-500 text-white shadow-lg shadow-brand-500/25"
                              : "bg-slate-200/70 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                          )}
                        >
                          {v ? `ON (−${exam.marking.incorrect})` : "OFF"}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                      {exam.short} has no negative marking.
                    </p>
                  )}
                </div>

                <div className="glass rounded-2xl p-4">
                  <p className="font-bold">Time limit</p>
                  <div className="mt-3 flex items-center gap-2">
                    <Input
                      type="number"
                      min={5}
                      max={360}
                      value={effectiveDuration}
                      onChange={(e) => setDuration(Math.max(5, Math.min(360, parseInt(e.target.value) || 5)))}
                      disabled={official}
                      className="h-10 w-24"
                    />
                    <span className="text-sm text-slate-500 dark:text-slate-400">minutes</span>
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="glass-card rounded-2xl p-4 text-sm">
                <p className="font-bold text-brand-500">Paper summary</p>
                <p className="mt-1 text-slate-600 dark:text-slate-300">
                  {exam.name} · {official && exam.officialPattern ? exam.officialPattern.totalQuestions : effectiveCount} questions ·{" "}
                  {difficulty} · {effectiveDuration} min
                  {official && exam.officialPattern ? ` · ${exam.officialPattern.totalMarks} marks (official pattern)` : ""}
                </p>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Nav */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => setStep((s) => Math.max(0, s - 1) as Step)}
          disabled={step === 0 || busy}
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        {step < 3 ? (
          <Button onClick={() => setStep((s) => Math.min(3, s + 1) as Step)} disabled={!canNext}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={generate} disabled={busy || blocked || !canNext}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Generating your paper… (up to a minute)
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Generate test
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
