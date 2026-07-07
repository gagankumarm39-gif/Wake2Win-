"use client";

import { useEffect } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useMotionTemplate,
  useReducedMotion,
} from "framer-motion";

/** Deterministic particle layout (fixed values → identical SSR & client markup). */
const PARTICLES = [
  { x: 8, y: 18, s: 5, d: 0, t: 11 },
  { x: 16, y: 72, s: 4, d: 2.2, t: 14 },
  { x: 24, y: 34, s: 6, d: 4.1, t: 12 },
  { x: 31, y: 88, s: 3, d: 1.4, t: 16 },
  { x: 39, y: 12, s: 5, d: 3.6, t: 13 },
  { x: 47, y: 56, s: 4, d: 0.8, t: 15 },
  { x: 54, y: 26, s: 6, d: 5.2, t: 11 },
  { x: 61, y: 79, s: 3, d: 2.9, t: 17 },
  { x: 68, y: 44, s: 5, d: 1.1, t: 12 },
  { x: 74, y: 9, s: 4, d: 4.7, t: 14 },
  { x: 81, y: 63, s: 6, d: 0.4, t: 13 },
  { x: 88, y: 30, s: 3, d: 3.1, t: 15 },
  { x: 93, y: 84, s: 5, d: 2.0, t: 12 },
  { x: 12, y: 48, s: 3, d: 5.6, t: 16 },
  { x: 58, y: 94, s: 4, d: 1.8, t: 13 },
  { x: 86, y: 50, s: 4, d: 4.4, t: 14 },
];

/**
 * Full-screen animated aurora: drifting gradient blobs, floating particles,
 * a light source that follows the cursor, mouse parallax and a noise overlay.
 * Pure transform/opacity animations — stays off the main thread.
 */
export function AuroraBackground() {
  const reduce = useReducedMotion();

  // Normalized cursor position (-0.5 … 0.5) → smoothed with springs.
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 40, damping: 18, mass: 0.8 });
  const sy = useSpring(my, { stiffness: 40, damping: 18, mass: 0.8 });

  // Parallax depths per layer.
  const l1x = useTransform(sx, (v) => v * -60);
  const l1y = useTransform(sy, (v) => v * -40);
  const l2x = useTransform(sx, (v) => v * 90);
  const l2y = useTransform(sy, (v) => v * 60);
  const l3x = useTransform(sx, (v) => v * -30);
  const l3y = useTransform(sy, (v) => v * 50);

  // Moving light source (percentage-based radial gradient).
  const lightX = useTransform(sx, (v) => 50 + v * 60);
  const lightY = useTransform(sy, (v) => 40 + v * 60);
  const light = useMotionTemplate`radial-gradient(600px circle at ${lightX}% ${lightY}%, rgba(139, 125, 255, 0.16), transparent 70%)`;

  useEffect(() => {
    if (reduce) return;
    function onMove(e: MouseEvent) {
      mx.set(e.clientX / window.innerWidth - 0.5);
      my.set(e.clientY / window.innerHeight - 0.5);
    }
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [mx, my, reduce]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Aurora blobs — parallax layer 1 */}
      <motion.div style={{ x: l1x, y: l1y }} className="absolute inset-0">
        <div className="aurora-blob aurora-blob-1 -left-[15%] -top-[20%] h-[55vmax] w-[55vmax] bg-brand-500/25 dark:bg-brand-500/30" />
      </motion.div>

      {/* Parallax layer 2 */}
      <motion.div style={{ x: l2x, y: l2y }} className="absolute inset-0">
        <div className="aurora-blob aurora-blob-2 -right-[18%] top-[8%] h-[48vmax] w-[48vmax] bg-cyan-400/20 dark:bg-cyan-500/20" />
      </motion.div>

      {/* Parallax layer 3 */}
      <motion.div style={{ x: l3x, y: l3y }} className="absolute inset-0">
        <div className="aurora-blob aurora-blob-3 -bottom-[25%] left-[18%] h-[50vmax] w-[50vmax] bg-emerald-400/15 dark:bg-emerald-500/15" />
        <div className="aurora-blob aurora-blob-1 right-[20%] bottom-[5%] h-[30vmax] w-[30vmax] bg-fuchsia-400/10 dark:bg-fuchsia-500/15" />
      </motion.div>

      {/* Cursor-following light source */}
      <motion.div className="absolute inset-0" style={{ background: light }} />

      {/* Floating particles */}
      {!reduce &&
        PARTICLES.map((p, i) => (
          <span
            key={i}
            className="particle"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.s,
              height: p.s,
              animationDuration: `${p.t}s`,
              animationDelay: `${p.d}s`,
            }}
          />
        ))}

      {/* Noise texture */}
      <div className="noise-overlay" />
    </div>
  );
}
