"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, FileText, PlayCircle, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { TEST_EXAMS, TEST_EXAM_ORDER } from "@/lib/exams/registry";
import type { TestRecord, TestStatus } from "@/types/ai-studio";

type StatusFilter = "all" | TestStatus;

const STATUS_META: Record<TestStatus, { label: string; className: string }> = {
  ready: { label: "Not started", className: "bg-slate-200/80 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  in_progress: { label: "In progress", className: "bg-amber-400/15 text-amber-500" },
  completed: { label: "Completed", className: "bg-emerald-500/15 text-emerald-500" },
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Saved tests: search · filter by exam/status · resume · review · delete. */
export function TestHistory({ initial }: { initial: TestRecord[] }) {
  const supabase = createClient();
  const [tests, setTests] = useState(initial);
  const [query, setQuery] = useState("");
  const [examFilter, setExamFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [deleting, setDeleting] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tests.filter((t) => {
      if (examFilter !== "all" && t.exam !== examFilter) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (q && !`${t.title} ${t.exam_name}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tests, query, examFilter, statusFilter]);

  async function remove(id: string) {
    setDeleting(id);
    const { error } = await supabase.from("ai_tests").delete().eq("id", id);
    if (!error) setTests((prev) => prev.filter((t) => t.id !== id));
    setDeleting(null);
  }

  const usedExams = [...new Set(tests.map((t) => t.exam))];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tests…"
            className="pl-10"
          />
        </div>
        <Link href="/tests/new">
          <Button className="w-full sm:w-auto">
            <Plus className="h-4 w-4" /> New AI test
          </Button>
        </Link>
      </div>

      {/* Filters */}
      {tests.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(["all", "ready", "in_progress", "completed"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                statusFilter === s
                  ? "bg-brand-500 text-white"
                  : "bg-slate-200/70 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              )}
            >
              {s === "all" ? "All" : STATUS_META[s].label}
            </button>
          ))}
          {usedExams.length > 1 && (
            <>
              <span className="mx-1 self-center text-slate-300 dark:text-slate-700">|</span>
              <button
                onClick={() => setExamFilter("all")}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                  examFilter === "all"
                    ? "bg-brand-500 text-white"
                    : "bg-slate-200/70 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                )}
              >
                All exams
              </button>
              {TEST_EXAM_ORDER.filter((e) => usedExams.includes(e)).map((e) => (
                <button
                  key={e}
                  onClick={() => setExamFilter(e)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                    examFilter === e
                      ? "bg-brand-500 text-white"
                      : "bg-slate-200/70 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  )}
                >
                  {TEST_EXAMS[e]?.short ?? e}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* Empty state */}
      {tests.length === 0 && (
        <div className="glass-card rounded-3xl p-10 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-brand-500" />
          <p className="mt-3 font-bold">No AI tests yet</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Generate your first full mock paper — NEET, JEE, KCET, Boards, UPSC and more.
          </p>
          <Link href="/tests/new" className="mt-5 inline-block">
            <Button>
              <Plus className="h-4 w-4" /> Create your first test
            </Button>
          </Link>
        </div>
      )}

      {/* List */}
      <AnimatePresence initial={false}>
        {visible.map((t) => {
          const meta = STATUS_META[t.status];
          const pct =
            t.status === "completed" && t.score !== null && t.total_marks > 0
              ? Math.max(0, Math.round((Number(t.score) / Number(t.total_marks)) * 100))
              : null;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              className="glass-card flex items-center gap-4 rounded-2xl p-4"
            >
              <div
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                  t.status === "completed" ? "bg-emerald-500/10" : "bg-brand-500/10"
                )}
              >
                {t.status === "completed" ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : (
                  <FileText className="h-5 w-5 text-brand-500" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{t.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                  <span>{t.exam_name}</span>
                  <span>·</span>
                  <span>{fmtDate(t.created_at)}</span>
                  {pct !== null && (
                    <>
                      <span>·</span>
                      <span className="font-semibold text-emerald-500">
                        {t.score}/{t.total_marks} ({pct}%)
                      </span>
                    </>
                  )}
                </p>
              </div>

              <span className={cn("hidden rounded-full px-2.5 py-1 text-[11px] font-semibold sm:block", meta.className)}>
                {meta.label}
              </span>

              <div className="flex shrink-0 items-center gap-1.5">
                <Link href={`/tests/${t.id}`}>
                  <Button size="sm" variant={t.status === "completed" ? "outline" : "default"}>
                    {t.status === "ready" ? (
                      <>
                        <PlayCircle className="h-4 w-4" /> Start
                      </>
                    ) : t.status === "in_progress" ? (
                      <>
                        <PlayCircle className="h-4 w-4" /> Resume
                      </>
                    ) : (
                      "Review"
                    )}
                  </Button>
                </Link>
                <button
                  onClick={() => remove(t.id)}
                  disabled={deleting === t.id}
                  aria-label="Delete test"
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {tests.length > 0 && visible.length === 0 && (
        <p className="glass rounded-2xl p-6 text-center text-sm text-slate-500">No tests match your filters.</p>
      )}
    </div>
  );
}
