"use client";

import { cn } from "@/lib/utils";

interface TimerRingProps {
  /** 0–1 fraction of time remaining. */
  progress: number;
  size?: number;
  className?: string;
  children?: React.ReactNode;
}

export function TimerRing({ progress, size = 280, className, children }: TimerRingProps) {
  const stroke = 10;
  const r = (size - stroke * 2) / 2;
  const c = 2 * Math.PI * r;

  return (
    <div className={cn("relative", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-slate-200 dark:stroke-slate-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
          className="stroke-brand-500 transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
