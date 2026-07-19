"use client";

/**
 * NCERT Scanner — pick/capture an image, preview it, POST to /api/scanner,
 * render per-question NEET solution cards. Image prep (validate → resize →
 * JPEG data URL) is shared with Image Chat via @/lib/images/client.
 */

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Camera, ImageIcon, Loader2, RotateCcw, ScanLine, X } from "lucide-react";
import { prepareImage, type PreparedImage } from "@/lib/images/client";
import type { ScannedSolution } from "@/app/api/scanner/route";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Phase = "pick" | "ready" | "scanning" | "done";

const FIELD_ROWS: Array<{ key: keyof ScannedSolution; label: string; emoji: string }> = [
  { key: "ncertConcept", label: "NCERT concept", emoji: "📖" },
  { key: "relatedTheory", label: "Related theory", emoji: "🧠" },
  { key: "commonMistake", label: "Common mistake", emoji: "⚠️" },
  { key: "memoryTrick", label: "Memory trick", emoji: "✨" },
  { key: "similarPyq", label: "Similar PYQ", emoji: "🎯" },
];

function SolutionCard({ solution, index }: { solution: ScannedSolution; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="glass p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold leading-relaxed">
          <span className="mr-2 text-brand-500">Q{index + 1}.</span>
          {solution.question}
        </p>
        {solution.difficulty && (
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
              solution.difficulty === "Hard"
                ? "bg-red-500/10 text-red-500"
                : solution.difficulty === "Easy"
                  ? "bg-emerald-500/10 text-emerald-500"
                  : "bg-amber-500/10 text-amber-500"
            )}
          >
            {solution.difficulty}
          </span>
        )}
      </div>

      <p className="mt-3 rounded-xl bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
        ✅ {solution.answer}
      </p>

      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{solution.explanation}</p>

      <div className="mt-3 space-y-2">
        {FIELD_ROWS.map(({ key, label, emoji }) => {
          const value = solution[key];
          if (!value) return null;
          return (
            <p key={key} className="rounded-xl bg-brand-500/10 p-3 text-xs leading-relaxed">
              <span className="font-bold">
                {emoji} {label}:{" "}
              </span>
              {value}
            </p>
          );
        })}
      </div>
    </motion.div>
  );
}

export function NcertScanner() {
  const [phase, setPhase] = useState<Phase>("pick");
  const [image, setImage] = useState<PreparedImage | null>(null);
  const [solutions, setSolutions] = useState<ScannedSolution[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // Revoke the preview object URL whenever the image changes / on unmount.
  useEffect(() => {
    const url = image?.previewUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [image]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      setImage(await prepareImage(file));
      setSolutions([]);
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not process this image.");
    }
  }

  async function scan() {
    if (!image || phase === "scanning") return;
    setPhase("scanning");
    setError(null);
    try {
      const res = await fetch("/api/scanner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: image.dataUrl }),
      });
      const data = (await res.json().catch(() => null)) as
        | { solutions?: ScannedSolution[]; error?: string }
        | null;
      if (!res.ok || !data?.solutions?.length) {
        setError(data?.error ?? "The scan failed. Please try again.");
        setPhase("ready");
        return;
      }
      setSolutions(data.solutions);
      setPhase("done");
    } catch {
      setError("You appear to be offline. Reconnect and try again.");
      setPhase("ready");
    }
  }

  function reset() {
    setImage(null);
    setSolutions([]);
    setError(null);
    setPhase("pick");
    if (fileRef.current) fileRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  }

  return (
    <div className="mt-6 space-y-4">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />

      {phase === "pick" && (
        <div className="glass flex flex-col items-center gap-4 p-8 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 via-brand-400 to-cyan-400 shadow-lg shadow-brand-500/40">
            <ScanLine className="h-8 w-8 text-white" />
          </span>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Works with printed pages, handwritten questions, diagrams, graphs and tables.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => cameraRef.current?.click()}>
              <Camera className="mr-2 h-4 w-4" /> Take photo
            </Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <ImageIcon className="mr-2 h-4 w-4" /> Choose image
            </Button>
          </div>
        </div>
      )}

      {image && phase !== "pick" && (
        <div className="glass p-4">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
            <img
              src={image.previewUrl}
              alt="Scan preview"
              className="max-h-80 w-full rounded-xl object-contain"
            />
            {phase !== "scanning" && (
              <button
                onClick={reset}
                aria-label="Remove image"
                className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/60 text-white hover:bg-slate-900/80"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="truncate text-xs text-slate-500">
              {image.name} · {Math.max(1, Math.round(image.bytes / 1024))} KB
            </p>
            {phase === "done" ? (
              <Button variant="outline" size="sm" onClick={reset}>
                <RotateCcw className="mr-2 h-4 w-4" /> Scan another
              </Button>
            ) : (
              <Button size="sm" onClick={() => void scan()} disabled={phase === "scanning"}>
                {phase === "scanning" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scanning…
                  </>
                ) : (
                  <>
                    <ScanLine className="mr-2 h-4 w-4" /> Solve this scan
                  </>
                )}
              </Button>
            )}
          </div>
          {phase === "scanning" && (
            <p className="mt-2 text-xs text-slate-500">
              Reading the image and solving every question — this can take up to a minute.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="flex items-center gap-2 rounded-xl bg-amber-500/10 p-3 text-sm font-medium text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {phase === "done" && (
        <div className="space-y-4">
          <p className="text-sm font-semibold text-slate-500">
            {solutions.length} question{solutions.length === 1 ? "" : "s"} solved
          </p>
          {solutions.map((s, i) => (
            <SolutionCard key={i} solution={s} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
