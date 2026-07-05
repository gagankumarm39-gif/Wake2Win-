"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Maximize, Minimize, Pause, Play, X } from "lucide-react";
import { formatTime, usePomodoro } from "@/lib/pomodoro-store";
import { AMBIENT_SOUNDS, AmbientSoundEngine, type AmbientType } from "@/lib/ambient-sound";
import { cn } from "@/lib/utils";

const WALLPAPERS = [
  "from-[#1a1040] via-[#0b0f1a] to-black",
  "from-emerald-950 via-slate-950 to-black",
  "from-rose-950 via-purple-950 to-black",
  "from-sky-950 via-indigo-950 to-black",
];

export default function FocusPage() {
  const { phase, secondsLeft, running, quote, start, pause, resume } = usePomodoro();
  const engine = useMemo(() => new AmbientSoundEngine(), []);

  const [wallpaper, setWallpaper] = useState(0);
  const [ambient, setAmbient] = useState<AmbientType | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-hide controls after 4s of inactivity — zero distractions.
  useEffect(() => {
    function poke() {
      setControlsVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setControlsVisible(false), 4000);
    }
    poke();
    window.addEventListener("mousemove", poke);
    window.addEventListener("touchstart", poke);
    return () => {
      window.removeEventListener("mousemove", poke);
      window.removeEventListener("touchstart", poke);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  useEffect(() => () => engine.stop(), [engine]);

  function toggleAmbient(type: AmbientType) {
    if (ambient === type) {
      engine.stop();
      setAmbient(null);
    } else {
      engine.start(type);
      setAmbient(type);
    }
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      setFullscreen(false);
    } else {
      await document.documentElement.requestFullscreen().catch(() => {});
      setFullscreen(true);
    }
  }

  return (
    <main
      className={cn(
        "min-h-dvh flex flex-col items-center justify-center bg-gradient-to-b text-white transition-colors duration-700",
        WALLPAPERS[wallpaper]
      )}
    >
      {/* Timer — the only permanent element */}
      <p className="text-[clamp(4rem,18vw,9rem)] font-extrabold tabular-nums leading-none">
        {formatTime(secondsLeft)}
      </p>
      <p className={cn(
        "mt-2 text-sm font-semibold uppercase tracking-[0.3em]",
        phase === "break" ? "text-emerald-400" : "text-brand-400"
      )}>
        {phase === "idle" ? "ready" : phase}
      </p>

      <AnimatePresence>
        {quote && phase === "break" && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-6 max-w-md px-6 text-center text-sm italic text-slate-300"
          >
            “{quote}”
          </motion.p>
        )}
      </AnimatePresence>

      {/* Controls — fade away when inactive */}
      <AnimatePresence>
        {controlsVisible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-x-0 bottom-0 flex flex-col items-center gap-5 p-6"
          >
            <div className="flex items-center gap-4">
              <button
                onClick={phase === "idle" ? start : running ? pause : resume}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 backdrop-blur hover:bg-white/20 transition-colors"
                aria-label={running ? "Pause" : "Start"}
              >
                {running ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
              </button>
              <button
                onClick={toggleFullscreen}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 backdrop-blur hover:bg-white/20 transition-colors"
                aria-label="Toggle fullscreen"
              >
                {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
              </button>
              <Link
                href="/pomodoro"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 backdrop-blur hover:bg-white/20 transition-colors"
                aria-label="Exit focus mode"
              >
                <X className="h-5 w-5" />
              </Link>
            </div>

            {/* Ambient sounds */}
            <div className="flex gap-2">
              {AMBIENT_SOUNDS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => toggleAmbient(s.id)}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm backdrop-blur transition-colors",
                    ambient === s.id ? "bg-brand-500 text-white" : "bg-white/10 hover:bg-white/20"
                  )}
                >
                  {s.emoji} {s.label}
                </button>
              ))}
            </div>

            {/* Wallpapers */}
            <div className="flex gap-2">
              {WALLPAPERS.map((w, i) => (
                <button
                  key={i}
                  onClick={() => setWallpaper(i)}
                  aria-label={`Wallpaper ${i + 1}`}
                  className={cn(
                    "h-6 w-6 rounded-full bg-gradient-to-br border-2 transition-transform",
                    w,
                    wallpaper === i ? "border-white scale-110" : "border-white/30"
                  )}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
