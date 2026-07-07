"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Flashcard } from "@/types/ai-studio";

/** Tappable flip-card deck for AI-generated flashcards. */
export function FlashcardDeck({ cards }: { cards: Flashcard[] }) {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  if (cards.length === 0) return null;
  const card = cards[idx];

  function go(delta: number) {
    setFlipped(false);
    setIdx((i) => (i + delta + cards.length) % cards.length);
  }

  return (
    <div className="select-none">
      <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
        <span className="font-semibold">
          Card {idx + 1} / {cards.length}
        </span>
        <span className="flex items-center gap-1">
          <RotateCw className="h-3 w-3" /> tap to flip
        </span>
      </div>

      <div className="[perspective:1200px]">
        <motion.button
          onClick={() => setFlipped(!flipped)}
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.45, ease: [0.2, 0.8, 0.3, 1] }}
          className="relative block min-h-44 w-full [transform-style:preserve-3d]"
        >
          <span
            className={cn(
              "absolute inset-0 flex items-center justify-center rounded-2xl p-6 text-center font-semibold [backface-visibility:hidden]",
              "bg-gradient-to-br from-brand-500 to-cyan-500 text-white shadow-lg shadow-brand-500/25"
            )}
          >
            {card.front}
          </span>
          <span
            className="absolute inset-0 flex [transform:rotateY(180deg)] items-center justify-center rounded-2xl bg-white p-6 text-center text-sm [backface-visibility:hidden] dark:bg-slate-800"
          >
            {card.back}
          </span>
        </motion.button>
      </div>

      <div className="mt-3 flex items-center justify-center gap-3">
        <button
          onClick={() => go(-1)}
          aria-label="Previous card"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-200/70 text-slate-600 transition-colors hover:bg-brand-500/15 hover:text-brand-500 dark:bg-slate-800 dark:text-slate-300"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <AnimatePresence mode="wait">
          <motion.span
            key={idx}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-16 text-center text-xs font-bold tabular-nums text-slate-500"
          >
            {idx + 1} / {cards.length}
          </motion.span>
        </AnimatePresence>
        <button
          onClick={() => go(1)}
          aria-label="Next card"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-200/70 text-slate-600 transition-colors hover:bg-brand-500/15 hover:text-brand-500 dark:bg-slate-800 dark:text-slate-300"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
