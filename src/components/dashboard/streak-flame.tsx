"use client";

import { Flame } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/** Animated flickering streak flame with a pulsing glow. */
export function StreakFlame({ className }: { className?: string }) {
  const reduce = useReducedMotion();

  return (
    <span className={cn("relative inline-flex items-center justify-center", className)}>
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full bg-orange-500/40 blur-md"
        animate={reduce ? undefined : { scale: [1, 1.35, 1.1, 1.4, 1], opacity: [0.5, 0.9, 0.6, 0.85, 0.5] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.span
        className="relative"
        animate={
          reduce
            ? undefined
            : { scale: [1, 1.12, 0.96, 1.08, 1], rotate: [0, -4, 3, -2, 0], y: [0, -1, 0.5, -1, 0] }
        }
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <Flame className="h-full w-full fill-orange-500 text-amber-400" />
      </motion.span>
    </span>
  );
}
