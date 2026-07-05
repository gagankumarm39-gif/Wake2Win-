"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlarmClock, TimerReset } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchQuestions } from "@/lib/ai/client-questions";
import { AlarmSoundEngine } from "@/lib/alarm-sound";
import { useAntiCheat } from "@/hooks/use-anti-cheat";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Alarm, Exam, GeneratedQuestion } from "@/types";

const SECONDS_PER_QUESTION = 25;
const pad = (n: number) => String(n).padStart(2, "0");

export function RingChallenge({ alarm, exam }: { alarm: Alarm; exam: Exam }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const engine = useMemo(() => new AlarmSoundEngine(), []);

  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [idx, setIdx] = useState(0);
  const [status, setStatus] = useState<"loading" | "active" | "done">("loading");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(SECONDS_PER_QUESTION);
  const [answering, setAnswering] = useState(false);
  const [snoozeUsed, setSnoozeUsed] = useState(false);

  const userIdRef = useRef<string | null>(null);
  const eventIdRef = useRef<string | null>(null);
  const attemptedRef = useRef(0);
  const correctRef = useRef(0);
  const appSwitchesRef = useRef(0);
  const solveTimesRef = useRef<number[]>([]);
  const statusRef = useRef(status);
  const idxRef = useRef(idx);
  statusRef.current = status;
  idxRef.current = idx;

  const req = useMemo(
    () => ({
      exam,
      subject: alarm.subject,
      chapter: alarm.chapter ?? undefined,
      difficulty: alarm.difficulty,
      count: alarm.question_count,
    }),
    [alarm, exam]
  );

  const loadAll = useCallback(async () => {
    setStatus("loading");
    const qs = await fetchQuestions(req); // never throws
    setQuestions(qs);
    setIdx(0);
    setStatus("active");
  }, [req]);

  // Mount: mark fired, start sound, open the alarm event, load questions.
  useEffect(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    localStorage.setItem(`w2w:fired:${alarm.id}:${today}`, "1");

    engine.start(alarm.sound, alarm.volume, alarm.vibration);

    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      userIdRef.current = user?.id ?? null;
      if (user) {
        const { data } = await supabase
          .from("alarm_events")
          .insert({ alarm_id: alarm.id, user_id: user.id })
          .select("id")
          .single();
        eventIdRef.current = data?.id ?? null;
      }
      await loadAll();
    })();

    return () => engine.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recordAttempt = useCallback(
    (q: GeneratedQuestion, correct: boolean, seconds: number) => {
      if (!userIdRef.current) return;
      void supabase.from("question_attempts").insert({
        user_id: userIdRef.current,
        alarm_event_id: eventIdRef.current,
        exam,
        subject: alarm.subject,
        chapter: alarm.chapter,
        difficulty: alarm.difficulty,
        source: q.source,
        correct,
        time_taken_seconds: seconds,
      });
    },
    [supabase, exam, alarm]
  );

  const replaceCurrent = useCallback(async () => {
    setStatus("loading");
    const [q] = await fetchQuestions({ ...req, count: 1 });
    setQuestions((prev) => {
      const next = [...prev];
      next[idxRef.current] = q;
      return next;
    });
    setStatus("active");
  }, [req]);

  // Anti-cheat: leaving the app restarts the challenge with brand-new questions.
  const onLeave = useCallback(() => {
    if (statusRef.current === "done") return;
    appSwitchesRef.current += 1;
    if (userIdRef.current) {
      void supabase.from("suspicious_events").insert({
        user_id: userIdRef.current,
        alarm_event_id: eventIdRef.current,
        kind: "app_switch",
        detail: { count: appSwitchesRef.current },
      });
    }
    setFeedback("You left the app — challenge restarted with new questions.");
    void loadAll();
  }, [supabase, loadAll]);

  useAntiCheat({ onLeave, onTimeout: () => {}, enabled: status !== "done" });

  const finish = useCallback(async () => {
    setStatus("done");
    engine.stop();
    const times = solveTimesRef.current;
    const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;

    if (eventIdRef.current) {
      await supabase
        .from("alarm_events")
        .update({
          status: "dismissed",
          dismissed_at: new Date().toISOString(),
          questions_attempted: attemptedRef.current,
          questions_correct: correctRef.current,
          avg_solve_seconds: avg,
          app_switches: appSwitchesRef.current,
          suspicious: appSwitchesRef.current >= 3,
        })
        .eq("id", eventIdRef.current);
    }
    if (userIdRef.current) {
      const { data: p } = await supabase
        .from("profiles")
        .select("xp, coins")
        .eq("id", userIdRef.current)
        .single();
      if (p) {
        await supabase
          .from("profiles")
          .update({ xp: p.xp + 25 * alarm.question_count, coins: p.coins + 10 })
          .eq("id", userIdRef.current);
      }
    }
    setTimeout(() => router.push("/dashboard"), 2000);
  }, [engine, supabase, alarm.question_count, router]);

  const handleTimeout = useCallback(() => {
    if (statusRef.current !== "active") return;
    const q = questions[idxRef.current];
    attemptedRef.current += 1;
    if (q) recordAttempt(q, false, SECONDS_PER_QUESTION);
    setFeedback("Time's up ⏱️ — here's a fresh question.");
    void replaceCurrent();
  }, [questions, recordAttempt, replaceCurrent]);

  const handleTimeoutRef = useRef(handleTimeout);
  handleTimeoutRef.current = handleTimeout;

  // Per-question countdown (20–30s window; 25s here).
  useEffect(() => {
    if (status !== "active") return;
    setSecondsLeft(SECONDS_PER_QUESTION);
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          handleTimeoutRef.current();
          return SECONDS_PER_QUESTION;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [status, idx, questions]);

  async function handleAnswer(i: number) {
    if (status !== "active" || answering) return;
    setAnswering(true);
    engine.unlock(); // user gesture — ensure audio is running

    const q = questions[idx];
    const taken = SECONDS_PER_QUESTION - secondsLeft;
    attemptedRef.current += 1;

    if (i === q.correctIndex) {
      correctRef.current += 1;
      solveTimesRef.current.push(taken);
      recordAttempt(q, true, taken);
      if (idx + 1 >= alarm.question_count) {
        await finish();
      } else {
        setFeedback("Correct ✅");
        setIdx(idx + 1);
      }
    } else {
      recordAttempt(q, false, taken);
      setFeedback("Wrong answer ❌ — generating a new question…");
      await replaceCurrent();
    }
    setAnswering(false);
  }

  async function snooze() {
    engine.stop();
    setSnoozeUsed(true);
    if (eventIdRef.current) {
      await supabase.from("alarm_events").update({ status: "snoozed" }).eq("id", eventIdRef.current);
    }
    localStorage.setItem(`w2w:snooze:${alarm.id}`, String(Date.now() + alarm.snooze_minutes * 60_000));
    router.push("/dashboard");
  }

  const q = questions[idx];

  return (
    <main className="challenge-lock min-h-dvh flex flex-col items-center justify-center px-6 py-10 bg-gradient-to-b from-[#1a1040] via-[#0b0f1a] to-black text-white">
      {status === "done" ? (
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
          <p className="text-6xl">🌅</p>
          <h1 className="mt-4 text-3xl font-extrabold">You're awake. You win.</h1>
          <p className="mt-2 text-slate-300">+{25 * alarm.question_count} XP · +10 coins</p>
        </motion.div>
      ) : (
        <>
          <header className="text-center">
            <AlarmClock className="mx-auto h-10 w-10 animate-pulse text-brand-400" />
            <h1 className="mt-2 text-2xl font-extrabold">{alarm.name}</h1>
            <p className="text-sm text-slate-400">
              Solve {alarm.question_count} questions correctly to stop the alarm
            </p>
          </header>

          {/* Progress dots */}
          <div className="mt-6 flex gap-2">
            {Array.from({ length: alarm.question_count }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  i < idx ? "bg-emerald-400" : i === idx ? "bg-brand-400" : "bg-slate-600"
                )}
              />
            ))}
          </div>

          <div className="mt-6 w-full max-w-md">
            {status === "loading" || !q ? (
              <div className="glass p-8 text-center text-slate-300">
                <TimerReset className="mx-auto h-6 w-6 animate-spin" />
                <p className="mt-3 text-sm">Preparing your question…</p>
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={q.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.25 }}
                  className="glass p-6"
                >
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Question {idx + 1} of {alarm.question_count}</span>
                    <span className={cn("font-bold tabular-nums", secondsLeft <= 5 && "text-red-400")}>
                      {secondsLeft}s
                    </span>
                  </div>
                  <p className="mt-3 font-semibold leading-relaxed">{q.question}</p>
                  <div className="mt-4 space-y-2.5">
                    {q.options.map((opt, i) => (
                      <button
                        key={i}
                        onClick={() => handleAnswer(i)}
                        disabled={answering}
                        className="w-full rounded-xl border border-slate-600 bg-white/5 px-4 py-3 text-left text-sm transition-colors hover:border-brand-400 hover:bg-brand-500/10 disabled:opacity-60"
                      >
                        <span className="mr-2 font-bold text-brand-400">
                          {String.fromCharCode(65 + i)}.
                        </span>
                        {opt}
                      </button>
                    ))}
                  </div>
                </motion.div>
              </AnimatePresence>
            )}

            {feedback && (
              <p className="mt-4 text-center text-sm text-slate-300" role="status">{feedback}</p>
            )}

            {alarm.snooze_enabled && !snoozeUsed && (
              <div className="mt-8 text-center">
                <Button variant="ghost" className="text-slate-400" onClick={snooze}>
                  Snooze {alarm.snooze_minutes} min (once)
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
