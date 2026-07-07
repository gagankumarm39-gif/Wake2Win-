"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Floating AI companion orb — pure CSS/Framer sphere (no Three.js).
 * Fixed to the bottom-right corner; opens the AI assistant.
 */
export function AiOrb() {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0, y: 40 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 160, damping: 16, delay: 0.8 }}
      className="fixed bottom-6 right-6 z-40"
    >
      <Link href="/assistant" aria-label="Ask the AI assistant" className="group block">
        <motion.div
          animate={reduce ? undefined : { y: [0, -9, 0] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
          whileHover={{ scale: 1.12 }}
          whileTap={{ scale: 0.94 }}
          className="relative h-16 w-16"
        >
          {/* Outer glow */}
          <motion.div
            aria-hidden
            className="absolute -inset-3 rounded-full bg-brand-500/40 blur-xl"
            animate={reduce ? undefined : { opacity: [0.5, 0.9, 0.5], scale: [1, 1.15, 1] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />
          {/* Rotating aurora ring */}
          <div className="orb-ring" />
          {/* Sphere body */}
          <div
            className="absolute inset-[3px] rounded-full"
            style={{
              background:
                "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.85), rgba(255,255,255,0) 34%), radial-gradient(circle at 68% 74%, rgba(34,211,238,0.75), rgba(34,211,238,0) 52%), radial-gradient(circle at 50% 50%, #7c6cff 0%, #4634b8 68%, #241a63 100%)",
              boxShadow: "inset 0 -8px 16px rgba(0,0,0,0.35), inset 0 4px 10px rgba(255,255,255,0.25)",
            }}
          />
          {/* Icon */}
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              animate={reduce ? undefined : { scale: [1, 1.18, 1], rotate: [0, 8, 0] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
            >
              <Sparkles className="h-6 w-6 text-white drop-shadow" />
            </motion.div>
          </div>

          {/* Tooltip */}
          <span className="pointer-events-none absolute right-full top-1/2 mr-3 -translate-y-1/2 whitespace-nowrap rounded-xl border border-white/10 bg-slate-900/90 px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow-xl backdrop-blur transition-all duration-300 group-hover:-translate-x-1 group-hover:opacity-100">
            Ask AI ✨
          </span>
        </motion.div>
      </Link>
    </motion.div>
  );
}
