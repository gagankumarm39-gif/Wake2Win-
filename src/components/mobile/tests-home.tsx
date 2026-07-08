"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  BarChart3,
  FileText,
  History,
  Library,
  Sparkles,
  Timer,
  Zap,
} from "lucide-react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { TestRecord } from "@/types/ai-studio";

/**
 * Mobile launcher for the Tests page (lg:hidden).
 * Cards deep-link to the existing test wizard, history and analytics.
 */
const EXAMS = ["NEET", "JEE", "Boards", "UPSC", "SSC", "GATE", "CAT", "Custom Test"] as const;

const TILES = [
  { label: "Quick Quiz", desc: "Short AI quiz", href: "/tests/new", icon: Zap, chip: "from-amber-500 to-yellow-400 shadow-amber-500/30" },
  { label: "Mock Tests", desc: "Full-length papers", href: "/tests/new", icon: Timer, chip: "from-rose-500 to-orange-400 shadow-rose-500/30" },
  { label: "Previous Tests", desc: "Resume · retake · review", href: "#test-history", icon: History, chip: "from-violet-500 to-purple-400 shadow-violet-500/30" },
  { label: "Performance", desc: "Accuracy & trends", href: "/analytics", icon: BarChart3, chip: "from-emerald-500 to-teal-400 shadow-emerald-500/30" },
  { label: "Question Bank", desc: "Practice by chapter", href: "/tests/new", icon: Library, chip: "from-sky-500 to-indigo-400 shadow-sky-500/30" },
] as const;

const grid: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 220, damping: 22 } },
};

function TileInner({ tile }: { tile: (typeof TILES)[number] }) {
  return (
    <>
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg ${tile.chip}`}
      >
        <tile.icon className="h-5 w-5 text-white" aria-hidden />
      </span>
      <span className="text-sm font-bold leading-tight">{tile.label}</span>
      <span className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
        {tile.desc}
      </span>
    </>
  );
}

export function TestsHome({ tests }: { tests: TestRecord[] }) {
  const reduce = useReducedMotion();
  const recent = useMemo(() => tests.slice(0, 3), [tests]);

  return (
    <section className="mt-6 lg:hidden" aria-label="Tests quick access">
      {/* Hero: generate test */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 180, damping: 20 }}
      >
        <Link
          href="/tests/new"
          className="flex items-center gap-4 rounded-3xl bg-gradient-to-r from-brand-500 via-brand-400 to-cyan-400 p-5 text-white shadow-lg shadow-brand-500/35 outline-none transition-transform focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 active:scale-[0.98]"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
            <Sparkles className="h-6 w-6" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-lg font-extrabold leading-tight">Generate Test</span>
            <span className="block text-xs text-white/85">
              AI-planned blueprint, fresh paper, instant grading
            </span>
          </span>
        </Link>
      </motion.div>

      {/* Exam chips */}
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]" role="list" aria-label="Exams">
        {EXAMS.map((e) => (
          <Link
            key={e}
            role="listitem"
            href="/tests/new"
            className="shrink-0 rounded-full border border-brand-400/25 bg-brand-500/10 px-3.5 py-1.5 text-xs font-semibold text-brand-600 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-400 hover:bg-brand-500/20 dark:text-brand-300"
          >
            {e}
          </Link>
        ))}
      </div>

      {/* Tiles */}
      <motion.div
        variants={reduce ? undefined : grid}
        initial="hidden"
        animate="show"
        className="mt-4 grid grid-cols-2 gap-3"
      >
        {TILES.map((t) => (
          <motion.div key={t.label} variants={reduce ? undefined : item}>
            {t.href.startsWith("#") ? (
              <a
                href={t.href}
                className="glass-card flex h-full flex-col gap-2 rounded-2xl p-4 outline-none transition-transform focus-visible:ring-2 focus-visible:ring-brand-400 active:scale-95"
              >
                <TileInner tile={t} />
              </a>
            ) : (
              <Link
                href={t.href}
                className="glass-card flex h-full flex-col gap-2 rounded-2xl p-4 outline-none transition-transform focus-visible:ring-2 focus-visible:ring-brand-400 active:scale-95"
              >
                <TileInner tile={t} />
              </Link>
            )}
          </motion.div>
        ))}
      </motion.div>

      {/* Recent tests */}
      {recent.length > 0 && (
        <div className="mt-6">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            <History className="h-3.5 w-3.5" aria-hidden /> Recent tests
          </h2>
          <div className="mt-2 space-y-2">
            {recent.map((t) => (
              <a
                key={t.id}
                href="#test-history"
                className="glass-card flex items-center gap-3 rounded-2xl px-4 py-3 outline-none transition-transform focus-visible:ring-2 focus-visible:ring-brand-400 active:scale-[0.98]"
              >
                <FileText className="h-4 w-4 shrink-0 text-brand-400" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{t.title}</span>
                  <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {t.exam_name ?? t.exam ?? ""}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-brand-500/10 px-2.5 py-1 text-[10px] font-bold tabular-nums text-brand-500 dark:text-brand-400">
                  {t.status === "completed"
                    ? `${t.score ?? 0}/${t.total_marks ?? 0}`
                    : "In progress"}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
