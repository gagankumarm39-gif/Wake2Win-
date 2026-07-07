"use client";

import { useEffect, useState } from "react";
import { Plus, StickyNote, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface Note {
  id: string;
  text: string;
  hue: number;
}

const HUES = [265, 190, 155, 35, 330];
const STORAGE_KEY = "w2w:notes";

/** Sticky quick notes — stored locally in the browser (no backend). */
export function QuickNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setNotes(JSON.parse(raw));
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    } catch {}
  }, [notes, loaded]);

  function add(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setNotes((prev) => [
      { id: crypto.randomUUID(), text, hue: HUES[prev.length % HUES.length] },
      ...prev,
    ]);
    setDraft("");
  }

  function remove(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  return (
    <div className="flex h-full flex-col">
      <form onSubmit={add} className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Jot something down…"
          maxLength={140}
          className="h-10 flex-1 rounded-xl border border-slate-900/10 bg-white/40 px-3 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-brand-400 dark:border-white/10 dark:bg-white/5"
        />
        <button
          type="submit"
          aria-label="Add note"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white shadow-lg shadow-brand-500/30 transition-transform hover:scale-105 active:scale-95"
        >
          <Plus className="h-4 w-4" />
        </button>
      </form>

      <div className="mt-3 grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto">
        <AnimatePresence initial={false}>
          {notes.map((n, i) => (
            <motion.div
              key={n.id}
              layout
              initial={{ opacity: 0, scale: 0.8, rotate: -4 }}
              animate={{ opacity: 1, scale: 1, rotate: i % 2 ? 1.2 : -1.2 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
              className="group relative rounded-xl border p-2.5 text-xs font-medium leading-snug shadow-sm"
              style={{
                background: `hsl(${n.hue} 85% 60% / 0.12)`,
                borderColor: `hsl(${n.hue} 85% 60% / 0.3)`,
              }}
            >
              {n.text}
              <button
                onClick={() => remove(n.id)}
                aria-label="Delete note"
                className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-white shadow group-hover:flex dark:bg-slate-200 dark:text-slate-900"
              >
                <X className="h-3 w-3" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>

        {loaded && notes.length === 0 && (
          <div
            className={cn(
              "col-span-2 flex flex-col items-center justify-center rounded-xl border border-dashed",
              "border-slate-900/10 py-6 text-center text-xs text-slate-400 dark:border-white/10"
            )}
          >
            <StickyNote className="mb-1.5 h-5 w-5 opacity-50" />
            No notes yet — capture a quick thought.
          </div>
        )}
      </div>
    </div>
  );
}
