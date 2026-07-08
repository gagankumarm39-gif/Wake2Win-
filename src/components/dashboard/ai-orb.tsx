"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  CalendarDays,
  FileText,
  NotebookPen,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const ACTIONS = [
  { label: "Daily Challenge", href: "/missions", icon: Target, chip: "from-amber-500 to-yellow-400 shadow-amber-500/35" },
  { label: "Weak Topic Analysis", href: "/analytics", icon: BarChart3, chip: "from-emerald-500 to-teal-400 shadow-emerald-500/35" },
  { label: "Study Planner", href: "/assistant", icon: CalendarDays, chip: "from-violet-500 to-purple-400 shadow-violet-500/35" },
  { label: "Generate Test", href: "/tests/new", icon: FileText, chip: "from-rose-500 to-orange-400 shadow-rose-500/35" },
  { label: "Generate Notes", href: "/notes", icon: NotebookPen, chip: "from-sky-500 to-indigo-400 shadow-sky-500/35" },
  { label: "Ask AI", href: "/assistant", icon: Sparkles, chip: "from-brand-500 to-cyan-400 shadow-brand-500/40" },
] as const;

/**
 * Floating AI companion orb, upgraded into a premium Speed Dial.
 * Same CSS/Framer sphere as before — tapping it now expands animated
 * quick actions and closes automatically after selecting one.
 */
export function AiOrb() {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Escape closes the dial and returns focus to the trigger.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[55] bg-slate-950/30 backdrop-blur-[2px]"
            aria-hidden
          />
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, scale: 0, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 160, damping: 16, delay: 0.8 }}
        className="fixed bottom-28 right-5 z-[60] flex flex-col items-end gap-3 lg:bottom-6 lg:right-6"
      >
        <AnimatePresence>
          {open && (
            <motion.ul
              key="menu"
              id="ai-speed-dial-menu"
              role="menu"
              aria-label="AI quick actions"
              initial="hidden"
              animate="show"
              exit="hidden"
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: 0.045, staggerDirection: -1 } },
              }}
              className="flex flex-col items-end gap-2.5"
            >
              {ACTIONS.map((a) => (
                <motion.li
                  key={a.label}
                  role="none"
                  variants={{
                    hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.85 },
                    show: reduce
                      ? { opacity: 1 }
                      : {
                          opacity: 1,
                          y: 0,
                          scale: 1,
                          transition: { type: "spring", stiffness: 380, damping: 26 },
                        },
                  }}
                >
                  <Link
                    role="menuitem"
                    href={a.href}
                    onClick={() => setOpen(false)}
                    className="group flex items-center gap-3 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                  >
                    <span className="glass-card rounded-xl px-3 py-1.5 text-xs font-semibold">
                      {a.label}
                    </span>
                    <span
                      className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg transition-transform duration-200 group-hover:scale-110 group-active:scale-95 ${a.chip}`}
                    >
                      <a.icon className="h-5 w-5" />
                    </span>
                  </Link>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>

        <button
          ref={btnRef}
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close AI quick actions" : "Open AI quick actions"}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls="ai-speed-dial-menu"
          className="group block rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
        >
          <motion.div
            animate={reduce || open ? undefined : { y: [0, -9, 0] }}
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
                boxShadow:
                  "inset 0 -8px 16px rgba(0,0,0,0.35), inset 0 4px 10px rgba(255,255,255,0.25)",
              }}
            />
            {/* Icon crossfade: sparkles ↔ close */}
            <div className="absolute inset-0 flex items-center justify-center">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={open ? "close" : "spark"}
                  initial={reduce ? false : { rotate: -90, opacity: 0, scale: 0.5 }}
                  animate={{ rotate: 0, opacity: 1, scale: 1 }}
                  exit={reduce ? undefined : { rotate: 90, opacity: 0, scale: 0.5 }}
                  transition={{ type: "spring", stiffness: 300, damping: 22 }}
                >
                  {open ? (
                    <X className="h-6 w-6 text-white drop-shadow" />
                  ) : (
                    <Sparkles className="h-6 w-6 text-white drop-shadow" />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Tooltip (closed state only) */}
            {!open && (
              <span className="pointer-events-none absolute right-full top-1/2 mr-3 -translate-y-1/2 whitespace-nowrap rounded-xl border border-white/10 bg-slate-900/90 px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow-xl backdrop-blur transition-all duration-300 group-hover:-translate-x-1 group-hover:opacity-100">
                Ask AI ✨
              </span>
            )}
          </motion.div>
        </button>
      </motion.div>
    </>
  );
}
