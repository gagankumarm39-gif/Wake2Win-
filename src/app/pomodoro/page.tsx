"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Expand, Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { BREAK_OPTIONS, FOCUS_OPTIONS, formatTime, usePomodoro } from "@/lib/pomodoro-store";
import { TimerRing } from "@/components/pomodoro/timer-ring";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function PomodoroPage() {
  const {
    phase, focusMinutes, breakMinutes, secondsLeft, running,
    sessionsCompleted, quote, setDurations, start, pause, resume, reset, skipBreak,
  } = usePomodoro();

  const total = (phase === "break" ? breakMinutes : focusMinutes) * 60;
  const progress = secondsLeft / total;
  const idle = phase === "idle";

  return (
    <main className="min-h-dvh px-6 py-10 bg-gradient-to-b from-white via-brand-50 to-white dark:from-[#0b0f1a] dark:via-[#131a2e] dark:to-[#0b0f1a]">
      <div className="mx-auto flex max-w-lg flex-col items-center">
        <header className="w-full flex items-center justify-between">
          <div>
            <Link href="/dashboard" className="text-sm text-slate-500 hover:text-brand-500">← Dashboard</Link>
            <h1 className="mt-1 text-3xl font-extrabold">Pomodoro</h1>
          </div>
          <Link
            href="/focus"
            className="inline-flex items-center gap-2 text-sm font-semibold text-brand-500 hover:underline"
          >
            <Expand className="h-4 w-4" /> Focus Mode
          </Link>
        </header>

        {/* Duration pickers */}
        <section className="mt-6 w-full glass p-5 space-y-4">
          <div>
            <p className="text-sm font-medium">Study duration</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {FOCUS_OPTIONS.map((m) => (
                <button
                  key={m}
                  disabled={!idle}
                  onClick={() => setDurations(m, breakMinutes)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50",
                    focusMinutes === m
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-slate-300 dark:border-slate-700"
                  )}
                >
                  {m} min
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium">Break</p>
            <div className="mt-2 flex gap-2">
              {BREAK_OPTIONS.map((m) => (
                <button
                  key={m}
                  disabled={!idle}
                  onClick={() => setDurations(focusMinutes, m)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50",
                    breakMinutes === m
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-slate-300 dark:border-slate-700"
                  )}
                >
                  {m} min
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Timer */}
        <div className="mt-8">
          <TimerRing progress={progress}>
            <p className="text-5xl font-extrabold tabular-nums">{formatTime(secondsLeft)}</p>
            <p className={cn(
              "mt-1 text-sm font-semibold uppercase tracking-widest",
              phase === "break" ? "text-emerald-500" : "text-brand-500"
            )}>
              {phase === "idle" ? "Ready" : phase === "focus" ? "Focus" : "Break"}
            </p>
          </TimerRing>
        </div>

        {/* Controls */}
        <div className="mt-6 flex items-center gap-3">
          {idle ? (
            <Button size="lg" onClick={start}>
              <Play className="h-5 w-5" /> Start focus
            </Button>
          ) : (
            <>
              <Button size="lg" onClick={running ? pause : resume}>
                {running ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                {running ? "Pause" : "Resume"}
              </Button>
              {phase === "break" && (
                <Button variant="outline" size="lg" onClick={skipBreak}>
                  <SkipForward className="h-5 w-5" /> Skip break
                </Button>
              )}
              <Button variant="ghost" size="lg" onClick={reset} aria-label="Reset">
                <RotateCcw className="h-5 w-5" />
              </Button>
            </>
          )}
        </div>

        <p className="mt-4 text-sm text-slate-500">
          Sessions completed: <span className="font-bold text-brand-500">{sessionsCompleted}</span>
        </p>

        {/* Motivational quote during break */}
        <AnimatePresence>
          {quote && phase === "break" && (
            <motion.blockquote
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="glass mt-6 w-full p-6 text-center"
            >
              <p className="text-lg font-semibold italic">“{quote}”</p>
              <p className="mt-2 text-xs uppercase tracking-widest text-slate-500">
                Break time — next session starts automatically
              </p>
            </motion.blockquote>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
