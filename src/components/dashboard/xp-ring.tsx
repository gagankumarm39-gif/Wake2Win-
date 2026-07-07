"use client";

import { motion, useReducedMotion } from "framer-motion";
import { AnimatedCounter } from "./animated-counter";

interface XpRingProps {
  xp: number;
  size?: number;
}

/**
 * Circular XP progress ring. Progress = position between the XP thresholds of
 * the current and next level (level = floor(sqrt(xp/100)) + 1, from lib/utils).
 */
export function XpRing({ xp, size = 156 }: XpRingProps) {
  const reduce = useReducedMotion();
  const level = Math.max(1, Math.floor(Math.sqrt(xp / 100)) + 1);
  const start = 100 * (level - 1) ** 2;
  const end = 100 * level ** 2;
  const progress = Math.min(1, Math.max(0.02, (xp - start) / (end - start)));

  const stroke = 10;
  const r = (size - stroke) / 2 - 4;
  const c = 2 * Math.PI * r;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Soft glow behind the ring */}
      <div className="absolute inset-3 rounded-full bg-brand-500/20 blur-2xl" />

      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id="xp-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6d5efc" />
            <stop offset="55%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-slate-900/10 dark:stroke-white/10"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#xp-grad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - progress) }}
          transition={
            reduce ? { duration: 0 } : { duration: 1.8, ease: [0.16, 1, 0.3, 1], delay: 0.3 }
          }
          style={{ filter: "drop-shadow(0 0 8px rgba(109, 94, 252, 0.55))" }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
          Level
        </span>
        <AnimatedCounter value={level} className="text-4xl font-extrabold tabular-nums" />
        <span className="mt-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400 tabular-nums">
          {(end - xp).toLocaleString()} XP to next
        </span>
      </div>
    </div>
  );
}
