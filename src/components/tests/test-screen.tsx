"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Clock, FileQuestion, Flag, MinusCircle, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { TestRunner } from "./test-runner";
import { TestResults } from "./test-results";
import type { TestAnalysis, TestRecord } from "@/types/ai-studio";

/**
 * One test, three modes: start screen (ready) → runner (in_progress) →
 * results (completed). Resume and retake both flow through here.
 */
export function TestScreen({ initial }: { initial: TestRecord }) {
  const supabase = createClient();
  const [test, setTest] = useState<TestRecord>(initial);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    const startedAt = new Date().toISOString();
    await supabase
      .from("ai_tests")
      .update({ status: "in_progress", started_at: startedAt })
      .eq("id", test.id);
    setTest((t) => ({ ...t, status: "in_progress", started_at: startedAt }));
    setBusy(false);
  }

  /** Retake: wipe the attempt, keep the same paper. */
  async function retake() {
    setBusy(true);
    const fresh = {
      status: "ready" as const,
      answers: {},
      flagged: [],
      current_index: 0,
      time_left_seconds: test.config.durationMinutes * 60,
      started_at: null,
      completed_at: null,
      score: null,
      analysis: null,
    };
    await supabase.from("ai_tests").update(fresh).eq("id", test.id);
    setTest((t) => ({ ...t, ...fresh }));
    setBusy(false);
  }

  function onSubmitted(analysis: TestAnalysis, answers: TestRecord["answers"]) {
    setTest((t) => ({
      ...t,
      status: "completed",
      answers,
      analysis,
      score: analysis.score,
      completed_at: new Date().toISOString(),
    }));
  }

  if (test.status === "completed" && test.analysis) {
    return <TestResults test={test} onRetake={retake} busy={busy} />;
  }

  if (test.status === "in_progress") {
    return <TestRunner test={test} onSubmitted={onSubmitted} />;
  }

  // ── Start screen ──
  const negative = test.questions.some((q) => q.negativeMarks > 0);
  return (
    <main className="min-h-dvh px-6 py-10 bg-gradient-to-b from-white via-brand-50 to-white dark:from-[#0b0f1a] dark:via-[#131a2e] dark:to-[#0b0f1a]">
      <div className="mx-auto max-w-2xl">
        <Link href="/tests" className="text-sm text-slate-500 hover:text-brand-500">← AI Tests</Link>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card mt-4 rounded-3xl p-8"
        >
          <p className="text-xs font-bold uppercase tracking-widest text-brand-500">{test.exam_name}</p>
          <h1 className="mt-1 text-2xl font-extrabold">{test.title}</h1>

          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="glass rounded-2xl p-4 text-center">
              <FileQuestion className="mx-auto h-5 w-5 text-brand-500" />
              <p className="mt-1 text-xl font-extrabold">{test.questions.length}</p>
              <p className="text-xs text-slate-500">questions</p>
            </div>
            <div className="glass rounded-2xl p-4 text-center">
              <Clock className="mx-auto h-5 w-5 text-brand-500" />
              <p className="mt-1 text-xl font-extrabold">{test.config.durationMinutes}m</p>
              <p className="text-xs text-slate-500">time limit</p>
            </div>
            <div className="glass rounded-2xl p-4 text-center">
              <Flag className="mx-auto h-5 w-5 text-brand-500" />
              <p className="mt-1 text-xl font-extrabold">{test.total_marks}</p>
              <p className="text-xs text-slate-500">total marks</p>
            </div>
          </div>

          <div className="mt-6 space-y-2 text-sm text-slate-600 dark:text-slate-300">
            <p className="flex items-center gap-2">
              <MinusCircle className="h-4 w-4 text-slate-400" />
              Negative marking: <b>{negative ? "ON" : "OFF"}</b>
            </p>
            <p className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-slate-400" />
              Your progress autosaves — you can leave and resume anytime.
            </p>
          </div>

          <Button onClick={start} disabled={busy} size="lg" className="mt-8 w-full">
            <Play className="h-5 w-5" /> Start test
          </Button>
        </motion.div>
      </div>
    </main>
  );
}
