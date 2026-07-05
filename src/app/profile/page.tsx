"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, levelFromXp } from "@/lib/utils";
import type { Exam, Profile } from "@/types";

const EXAMS: Exam[] = ["NEET", "JEE", "UPSC", "SSC", "GATE", "CAT", "BOARDS"];
const THEMES = [
  { id: "light", label: "Day", emoji: "☀️" },
  { id: "dark", label: "Night", emoji: "🌙" },
  { id: "system", label: "Auto", emoji: "✨" },
] as const;

export default function ProfilePage() {
  const supabase = createClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (data) setProfile(data as Profile);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patch<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile((p) => (p ? { ...p, [key]: value } : p));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setMessage(null);

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: profile.display_name,
        exam: profile.exam,
        target_rank: profile.target_rank,
        target_college: profile.target_college,
        study_hours_per_day: profile.study_hours_per_day,
        wake_up_goal: profile.wake_up_goal,
        theme: profile.theme,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);

    // Apply + persist theme immediately (read by the layout init script).
    localStorage.setItem("w2w:theme", profile.theme);
    document.documentElement.classList.toggle(
      "dark",
      profile.theme === "dark" ||
        (profile.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
    );

    setMessage(error ? "Could not save. Please try again." : "Saved ✅");
    setSaving(false);
  }

  if (!profile) {
    return (
      <main className="min-h-dvh flex items-center justify-center">
        <p className="text-sm text-slate-500">Loading profile…</p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh px-6 py-10 bg-gradient-to-b from-white via-brand-50 to-white dark:from-[#0b0f1a] dark:via-[#131a2e] dark:to-[#0b0f1a]">
      <div className="mx-auto max-w-lg">
        <Link href="/dashboard" className="text-sm text-slate-500 hover:text-brand-500">← Dashboard</Link>
        <h1 className="mt-1 text-3xl font-extrabold">Profile</h1>

        <div className="glass mt-6 flex items-center justify-around p-4 text-center">
          <div>
            <p className="text-2xl font-extrabold">{levelFromXp(profile.xp)}</p>
            <p className="text-xs uppercase tracking-wider text-slate-500">Level</p>
          </div>
          <div>
            <p className="text-2xl font-extrabold">{profile.xp.toLocaleString()}</p>
            <p className="text-xs uppercase tracking-wider text-slate-500">XP</p>
          </div>
          <div>
            <p className="text-2xl font-extrabold">{profile.coins.toLocaleString()}</p>
            <p className="text-xs uppercase tracking-wider text-slate-500">Coins</p>
          </div>
          <div>
            <p className="text-2xl font-extrabold">{profile.current_streak}d</p>
            <p className="text-xs uppercase tracking-wider text-slate-500">Streak</p>
          </div>
        </div>

        <form onSubmit={save} className="glass mt-6 space-y-5 p-8">
          <div>
            <label className="text-sm font-medium">Display name</label>
            <Input
              className="mt-1.5"
              value={profile.display_name ?? ""}
              onChange={(e) => patch("display_name", e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Exam</label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {EXAMS.map((x) => (
                <button
                  key={x}
                  type="button"
                  onClick={() => patch("exam", x)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                    profile.exam === x
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-slate-300 dark:border-slate-700"
                  )}
                >
                  {x}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Target rank</label>
              <Input
                className="mt-1.5"
                placeholder="e.g. AIR 500"
                value={profile.target_rank ?? ""}
                onChange={(e) => patch("target_rank", e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Target college</label>
              <Input
                className="mt-1.5"
                placeholder="e.g. IIT Bombay"
                value={profile.target_college ?? ""}
                onChange={(e) => patch("target_college", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Study hours / day</label>
              <Input
                type="number"
                min={1}
                max={16}
                step={0.5}
                className="mt-1.5"
                value={profile.study_hours_per_day}
                onChange={(e) => patch("study_hours_per_day", Number(e.target.value))}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Wake-up goal</label>
              <Input
                type="time"
                className="mt-1.5"
                value={profile.wake_up_goal?.slice(0, 5) ?? "06:00"}
                onChange={(e) => patch("wake_up_goal", e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Theme</label>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => patch("theme", t.id)}
                  className={cn(
                    "rounded-xl border p-3 text-center text-sm font-semibold transition-all",
                    profile.theme === t.id
                      ? "border-brand-500 bg-brand-500/10 ring-2 ring-brand-500"
                      : "border-slate-300 dark:border-slate-700"
                  )}
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </div>

          <Link
            href="/settings/ai"
            className="flex items-center justify-between rounded-xl border border-slate-300 p-4 text-sm transition-colors hover:border-brand-500 dark:border-slate-700"
          >
            <span>
              <span className="font-semibold">AI Providers</span>
              <span className="mt-0.5 block text-xs text-slate-500">
                Use your own Gemini / OpenRouter key for AI quizzes &amp; chat
              </span>
            </span>
            <span aria-hidden className="text-slate-400">→</span>
          </Link>

          {message && <p className="text-sm text-slate-600 dark:text-slate-300" role="status">{message}</p>}

          <div className="flex items-center justify-between">
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
            {/* Submits the sibling sign-out form below — forms must not nest. */}
            <button type="submit" form="signout-form" className="text-sm text-slate-500 hover:text-red-500">
              Sign out
            </button>
          </div>
        </form>

        <form id="signout-form" action="/auth/signout" method="post" className="hidden" />
      </div>
    </main>
  );
}
