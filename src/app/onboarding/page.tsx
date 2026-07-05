"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Exam } from "@/types";

const EXAMS: { id: Exam; label: string; emoji: string }[] = [
  { id: "NEET", label: "NEET", emoji: "🩺" },
  { id: "JEE", label: "JEE", emoji: "⚙️" },
  { id: "UPSC", label: "UPSC", emoji: "🏛️" },
  { id: "SSC", label: "SSC", emoji: "📋" },
  { id: "GATE", label: "GATE", emoji: "🎓" },
  { id: "CAT", label: "CAT", emoji: "📈" },
  { id: "BOARDS", label: "Boards", emoji: "📚" },
];

const HOURS = [2, 4, 6, 8, 10, 12];
const THEMES = [
  { id: "light", label: "Day mode", emoji: "☀️" },
  { id: "dark", label: "Night mode", emoji: "🌙" },
  { id: "system", label: "Auto", emoji: "✨" },
] as const;

const STEP_TITLES = [
  "Which exam are you preparing for?",
  "What's your target?",
  "Your daily routine",
  "Pick your vibe",
];

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [exam, setExam] = useState<Exam | null>(null);
  const [targetRank, setTargetRank] = useState("");
  const [targetCollege, setTargetCollege] = useState("");
  const [studyHours, setStudyHours] = useState(6);
  const [wakeUpGoal, setWakeUpGoal] = useState("05:30");
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");

  const canContinue = step === 0 ? exam !== null : true;

  async function finish() {
    setSaving(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login?next=/onboarding");
      return;
    }

  
      const { error: dbError } = await supabase
  .from("profiles")
  .upsert({
    id: user.id,
    exam,
    target_rank: targetRank || null,
    target_college: targetCollege || null,
    study_hours_per_day: studyHours,
    wake_up_goal: wakeUpGoal,
    theme,
    onboarded: true,
    updated_at: new Date().toISOString(),
  });
      

    if (dbError) {
      setError("Could not save your profile. Please try again.");
      setSaving(false);
      return;
    }

    document.documentElement.classList.toggle(
      "dark",
      theme === "dark" ||
        (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
    );
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 py-10 bg-gradient-to-b from-white via-brand-50 to-white dark:from-[#0b0f1a] dark:via-[#131a2e] dark:to-[#0b0f1a]">
      {/* Progress */}
      <div className="mb-8 flex w-full max-w-md gap-2">
        {STEP_TITLES.map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i <= step ? "bg-brand-500" : "bg-slate-200 dark:bg-slate-700"
            )}
          />
        ))}
      </div>

      <div className="glass w-full max-w-md p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -32 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <h1 className="text-2xl font-extrabold">{STEP_TITLES[step]}</h1>

            {step === 0 && (
              <div className="mt-6 grid grid-cols-2 gap-3">
                {EXAMS.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setExam(e.id)}
                    className={cn(
                      "rounded-xl border p-4 text-left transition-all",
                      exam === e.id
                        ? "border-brand-500 bg-brand-500/10 ring-2 ring-brand-500"
                        : "border-slate-200 hover:border-brand-400 dark:border-slate-700"
                    )}
                  >
                    <span className="text-2xl">{e.emoji}</span>
                    <p className="mt-1 font-bold">{e.label}</p>
                  </button>
                ))}
              </div>
            )}

            {step === 1 && (
              <div className="mt-6 space-y-4">
                <div>
                  <label className="text-sm font-medium">Target rank (optional)</label>
                  <Input
                    className="mt-1.5"
                    placeholder="e.g. AIR 500"
                    value={targetRank}
                    onChange={(e) => setTargetRank(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Dream college (optional)</label>
                  <Input
                    className="mt-1.5"
                    placeholder="e.g. AIIMS Delhi, IIT Bombay"
                    value={targetCollege}
                    onChange={(e) => setTargetCollege(e.target.value)}
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="mt-6 space-y-6">
                <div>
                  <label className="text-sm font-medium">Study hours per day</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {HOURS.map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setStudyHours(h)}
                        className={cn(
                          "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                          studyHours === h
                            ? "border-brand-500 bg-brand-500 text-white"
                            : "border-slate-300 hover:border-brand-400 dark:border-slate-700"
                        )}
                      >
                        {h}h
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Wake-up goal</label>
                  <Input
                    type="time"
                    className="mt-1.5"
                    value={wakeUpGoal}
                    onChange={(e) => setWakeUpGoal(e.target.value)}
                  />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="mt-6 grid grid-cols-3 gap-3">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTheme(t.id)}
                    className={cn(
                      "rounded-xl border p-4 text-center transition-all",
                      theme === t.id
                        ? "border-brand-500 bg-brand-500/10 ring-2 ring-brand-500"
                        : "border-slate-200 hover:border-brand-400 dark:border-slate-700"
                    )}
                  >
                    <span className="text-2xl">{t.emoji}</span>
                    <p className="mt-1 text-sm font-semibold">{t.label}</p>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {error && (
          <p className="mt-4 text-sm text-red-500" role="alert">
            {error}
          </p>
        )}

        <div className="mt-8 flex justify-between">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || saving}
          >
            Back
          </Button>
          {step < STEP_TITLES.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canContinue}>
              Continue
            </Button>
          ) : (
            <Button onClick={finish} disabled={saving}>
              {saving ? "Saving…" : "Let's go 🚀"}
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}
