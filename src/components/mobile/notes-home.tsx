"use client";

import { useMemo, useState } from "react";
import {
  Bookmark,
  BrainCircuit,
  Clock3,
  FileDown,
  Layers,
  Network,
  Search,
  Sparkles,
  StickyNote,
} from "lucide-react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { QuickNotes } from "@/components/dashboard/quick-notes";
import type { NoteRecord } from "@/types/ai-studio";

/**
 * Mobile launcher for the Notes page (lg:hidden).
 * Every card deep-links into the existing AI Notes Studio below,
 * where generation, flashcards, sheets, printing/PDF and saved notes live.
 */
const CATEGORIES = [
  { label: "AI Notes Generator", desc: "Chapter-wise AI notes", icon: Sparkles, chip: "from-brand-500 to-cyan-400 shadow-brand-500/30" },
  { label: "Revision Sheets", desc: "Last-minute sheets", icon: Layers, chip: "from-emerald-500 to-teal-400 shadow-emerald-500/30" },
  { label: "Flashcards", desc: "Active-recall decks", icon: BrainCircuit, chip: "from-violet-500 to-purple-400 shadow-violet-500/30" },
  { label: "Mind Maps", desc: "Visual chapter outlines", icon: Network, chip: "from-rose-500 to-orange-400 shadow-rose-500/30" },
  { label: "PDF Notes", desc: "Print or save as PDF", icon: FileDown, chip: "from-sky-500 to-indigo-400 shadow-sky-500/30" },
  { label: "Bookmarks", desc: "Your saved notes", icon: Bookmark, chip: "from-amber-500 to-yellow-400 shadow-amber-500/30" },
] as const;

const grid: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 220, damping: 22 } },
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function NotesHome({ notes }: { notes: NoteRecord[] }) {
  const reduce = useReducedMotion();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes.slice(0, 5);
    return notes
      .filter((n) =>
        [n.title, n.subject, n.chapter, n.exam_name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 8);
  }, [notes, query]);

  return (
    <section className="mt-6 lg:hidden" aria-label="Notes quick access">
      {/* Search */}
      <div className="glass-card flex items-center gap-2.5 rounded-2xl px-4 py-3">
        <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          type="search"
          placeholder="Search your notes…"
          aria-label="Search saved notes"
          className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
        />
      </div>

      {/* Category cards */}
      <motion.div
        variants={reduce ? undefined : grid}
        initial="hidden"
        animate="show"
        className="mt-4 grid grid-cols-2 gap-3"
      >
        {CATEGORIES.map((c) => (
          <motion.a
            key={c.label}
            variants={reduce ? undefined : item}
            href="#notes-studio"
            className="glass-card flex flex-col gap-2 rounded-2xl p-4 outline-none transition-transform focus-visible:ring-2 focus-visible:ring-brand-400 active:scale-95"
          >
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg ${c.chip}`}
            >
              <c.icon className="h-5 w-5 text-white" aria-hidden />
            </span>
            <span className="text-sm font-bold leading-tight">{c.label}</span>
            <span className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
              {c.desc}
            </span>
          </motion.a>
        ))}
      </motion.div>

      {/* Recent notes / search results */}
      <div className="mt-6">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
          <Clock3 className="h-3.5 w-3.5" aria-hidden />
          {query ? "Search results" : "Recent notes"}
        </h2>
        <div className="mt-2 space-y-2">
          {filtered.length === 0 ? (
            <p className="glass-card rounded-2xl px-4 py-5 text-center text-xs text-slate-500 dark:text-slate-400">
              {query
                ? "No notes match your search."
                : "No saved notes yet — generate your first in the studio below."}
            </p>
          ) : (
            filtered.map((n) => (
              <a
                key={n.id}
                href="#notes-studio"
                className="glass-card flex items-center gap-3 rounded-2xl px-4 py-3 outline-none transition-transform focus-visible:ring-2 focus-visible:ring-brand-400 active:scale-[0.98]"
              >
                <StickyNote className="h-4 w-4 shrink-0 text-brand-400" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{n.title}</span>
                  <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {[n.exam_name, n.subject, n.chapter].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
                  {fmtDate(n.created_at)}
                </span>
              </a>
            ))
          )}
        </div>
      </div>

      {/* Quick notes (same component as the dashboard card) */}
      <div className="glass-card mt-6 rounded-2xl p-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
          Quick notes
        </h2>
        <div className="mt-3">
          <QuickNotes />
        </div>
      </div>
    </section>
  );
}
