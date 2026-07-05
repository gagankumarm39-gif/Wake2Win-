"use client";

import { useCallback, useEffect, useRef } from "react";

interface AntiCheatOptions {
  /** Called when the user switches apps / tabs or minimizes — challenge should reset with new questions. */
  onLeave: () => void;
  /** Called when the per-question time limit elapses. */
  onTimeout: () => void;
  /** Seconds allowed per question (20–30 recommended). */
  secondsPerQuestion?: number;
  enabled: boolean;
}

/**
 * Anti-cheating for the alarm challenge (web-standard techniques only):
 * - Requests fullscreen lock; logs exits.
 * - visibilitychange → onLeave (pause + regenerate questions).
 * - Blocks copy, cut, context menu and text selection.
 * - Per-question countdown enforced via onTimeout.
 *
 * Note: screenshots can only be blocked in the Android TWA/native wrapper via
 * FLAG_SECURE. This hook intentionally makes no claims about blocking system
 * features like Circle to Search, Google Lens or Gemini.
 */
export function useAntiCheat({ onLeave, onTimeout, secondsPerQuestion = 25, enabled }: AntiCheatOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startQuestionTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(onTimeout, secondsPerQuestion * 1000);
  }, [onTimeout, secondsPerQuestion]);

  const stopQuestionTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    document.documentElement.requestFullscreen?.().catch(() => {
      /* fullscreen may be denied — challenge still runs */
    });

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") onLeave();
    };
    const block = (e: Event) => e.preventDefault();

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", onLeave);
    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    document.addEventListener("contextmenu", block);
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", onLeave);
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("contextmenu", block);
      document.body.style.userSelect = "";
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      stopQuestionTimer();
    };
  }, [enabled, onLeave, stopQuestionTimer]);

  return { startQuestionTimer, stopQuestionTimer };
}
