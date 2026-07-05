"use client";

import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import { playChime } from "@/lib/ambient-sound";
import { randomQuote } from "@/lib/quotes";

export type PomodoroPhase = "idle" | "focus" | "break";

export const FOCUS_OPTIONS = [25, 45, 60, 90, 120] as const;
export const BREAK_OPTIONS = [5, 10, 15] as const;

interface PomodoroState {
  phase: PomodoroPhase;
  focusMinutes: number;
  breakMinutes: number;
  secondsLeft: number;
  running: boolean;
  sessionsCompleted: number;
  quote: string | null;
  startedAt: number | null;
  setDurations: (focus: number, brk: number) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  skipBreak: () => void;
  _tick: () => void;
}

let ticker: ReturnType<typeof setInterval> | null = null;

function ensureTicker() {
  if (ticker) return;
  ticker = setInterval(() => usePomodoro.getState()._tick(), 1000);
}

function stopTicker() {
  if (ticker) clearInterval(ticker);
  ticker = null;
}

/** Persist the completed session and award XP — silently skipped when offline. */
async function recordSession(focusMinutes: number, breakMinutes: number, startedAt: number) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("pomodoro_sessions").insert({
      user_id: user.id,
      focus_minutes: focusMinutes,
      break_minutes: breakMinutes,
      started_at: new Date(startedAt).toISOString(),
      completed_at: new Date().toISOString(),
      completed: true,
    });
    const { data: p } = await supabase.from("profiles").select("xp, coins").eq("id", user.id).single();
    if (p) {
      await supabase
        .from("profiles")
        .update({ xp: p.xp + focusMinutes, coins: p.coins + 5 })
        .eq("id", user.id);
    }
  } catch {
    /* offline — timer keeps working, analytics catch up later */
  }
}

export const usePomodoro = create<PomodoroState>((set, get) => ({
  phase: "idle",
  focusMinutes: 25,
  breakMinutes: 5,
  secondsLeft: 25 * 60,
  running: false,
  sessionsCompleted: 0,
  quote: null,
  startedAt: null,

  setDurations: (focus, brk) => {
    if (get().phase !== "idle") return;
    set({ focusMinutes: focus, breakMinutes: brk, secondsLeft: focus * 60 });
  },

  start: () => {
    set({
      phase: "focus",
      running: true,
      startedAt: Date.now(),
      secondsLeft: get().focusMinutes * 60,
      quote: null,
    });
    ensureTicker();
  },

  pause: () => set({ running: false }),
  resume: () => {
    set({ running: true });
    ensureTicker();
  },

  reset: () => {
    stopTicker();
    set({
      phase: "idle",
      running: false,
      secondsLeft: get().focusMinutes * 60,
      quote: null,
      startedAt: null,
    });
  },

  skipBreak: () => {
    if (get().phase !== "break") return;
    set({ phase: "focus", secondsLeft: get().focusMinutes * 60, startedAt: Date.now(), quote: null });
  },

  _tick: () => {
    const s = get();
    if (!s.running) return;
    if (s.secondsLeft > 1) {
      set({ secondsLeft: s.secondsLeft - 1 });
      return;
    }

    playChime();
    if (s.phase === "focus") {
      // Focus complete → record, show quote, start break automatically.
      void recordSession(s.focusMinutes, s.breakMinutes, s.startedAt ?? Date.now());
      set({
        phase: "break",
        secondsLeft: s.breakMinutes * 60,
        sessionsCompleted: s.sessionsCompleted + 1,
        quote: randomQuote(),
      });
    } else {
      // Break complete → next focus session begins automatically.
      set({
        phase: "focus",
        secondsLeft: s.focusMinutes * 60,
        startedAt: Date.now(),
        quote: null,
      });
    }
  },
}));

export function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
