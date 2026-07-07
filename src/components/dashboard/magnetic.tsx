"use client";

import { motion, useMotionValue, useSpring, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface MagneticProps {
  children: React.ReactNode;
  className?: string;
  /** How strongly the element is pulled toward the cursor (0–1). */
  strength?: number;
}

/** Wraps a button/link so it magnetically drifts toward the cursor and springs back. */
export function Magnetic({ children, className, strength = 0.35 }: MagneticProps) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 200, damping: 16, mass: 0.5 });
  const sy = useSpring(y, { stiffness: 200, damping: 16, mass: 0.5 });

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  }

  function onLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.div
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ x: sx, y: sy }}
      whileTap={reduce ? undefined : { scale: 0.96 }}
      className={cn("inline-block", className)}
    >
      {children}
    </motion.div>
  );
}
