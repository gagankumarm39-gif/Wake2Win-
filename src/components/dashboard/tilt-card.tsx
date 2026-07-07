"use client";

import {
  motion,
  useMotionValue,
  useSpring,
  useMotionTemplate,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import { cn } from "@/lib/utils";

export const cardReveal: Variants = {
  hidden: { opacity: 0, y: 28, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 90, damping: 16 },
  },
};

interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  /** RGB triplet for the hover glow/spotlight, e.g. "34, 211, 238". */
  glow?: string;
  /** Max tilt in degrees. */
  tilt?: number;
}

/**
 * Glass bento card: lifts on hover, tilts in 3D toward the cursor,
 * shows a cursor-tracking spotlight and casts an animated glow shadow.
 */
export function TiltCard({ children, className, glow = "109, 94, 252", tilt = 6 }: TiltCardProps) {
  const reduce = useReducedMotion();

  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 180, damping: 22 });
  const sry = useSpring(ry, { stiffness: 180, damping: 22 });

  const px = useMotionValue(50);
  const py = useMotionValue(50);
  const spotlight = useMotionTemplate`radial-gradient(460px circle at ${px}% ${py}%, rgba(${glow}, 0.16), transparent 65%)`;

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top) / r.height;
    px.set(nx * 100);
    py.set(ny * 100);
    if (reduce) return;
    ry.set((nx - 0.5) * 2 * tilt);
    rx.set(-(ny - 0.5) * 2 * tilt);
  }

  function onLeave() {
    rx.set(0);
    ry.set(0);
  }

  return (
    <motion.div
      variants={cardReveal}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      whileHover={reduce ? undefined : { y: -6, scale: 1.012 }}
      style={{
        rotateX: srx,
        rotateY: sry,
        transformPerspective: 1100,
        transformStyle: "preserve-3d",
      }}
      className={cn("glass-card neon-edge group relative overflow-hidden", className)}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: spotlight }}
      />
      <div className="relative z-10 flex h-full flex-col" style={{ transform: "translateZ(20px)" }}>
        {children}
      </div>
    </motion.div>
  );
}
