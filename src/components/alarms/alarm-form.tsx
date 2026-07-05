"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ALARM_SOUNDS, AlarmSoundEngine } from "@/lib/alarm-sound";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Alarm, Difficulty, Exam } from "@/types";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const SUBJECTS: Record<Exam, string[]> = {
  NEET: ["Physics", "Chemistry", "Biology"],
  JEE: ["Physics", "Chemistry", "Mathematics"],
  UPSC: ["Polity", "History", "Geography", "Economy", "Environment", "Current Affairs"],
  SSC: ["Quantitative Aptitude", "Reasoning", "English", "General Awareness"],
  GATE: ["Engineering Mathematics", "Computer Science", "General Aptitude"],
  CAT: ["Quantitative Ability", "VARC", "DILR"],
  BOARDS: ["Physics", "Chemistry", "Mathematics", "Biology", "Science", "English"],
};

export function AlarmForm({ initial }: { initial?: Alarm }) {
  const router = useRouter();
  const supabase = createClient();

  const [exam, setExam] = useState<Exam>("JEE");
  const [name, setName] = useState(initial?.name ?? "Wake up!");
  const [time, setTime] = useState(initial?.time?.slice(0, 5) ?? "06:00");
  const [days, setDays] = useState<number[]>(initial?.repeat_days ?? [1, 2, 3, 4, 5]);
  const [sound, setSound] = useState(initial?.sound ?? "sunrise");
  const [volume, setVolume] = useState(initial?.volume ?? 80);
  const [vibration, setVibration] = useState(initial?.vibration ?? true);
  const [snoozeEnabled, setSnoozeEnabled] = useState(initial?.snooze_enabled ?? true);
  const [snoozeMinutes, setSnoozeMinutes] = useState(initial?.snooze_minutes ?? 5);
  const [questionCount, setQuestionCount] = useState<2 | 3 | 4>(initial?.question_count ?? 3);
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [chapter, setChapter] = useState(initial?.chapter ?? "");
  const [difficulty, setDifficulty] = useState<Difficulty>(initial?.difficulty ?? "medium");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("exam").eq("id", user.id).single();
      if (data?.exam) {
        setExam(data.exam as Exam);
        if (!initial?.subject) setSubject(SUBJECTS[data.exam as Exam][0]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleDay(d: number) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }

  function previewSound() {
    const engine = new AlarmSoundEngine();
    engine.start(sound, volume, false);
    engine.unlock();
    setTimeout(() => engine.stop(), 2000);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login?next=/alarms");
      return;
    }

    const payload = {
      user_id: user.id,
      name,
      time,
      repeat_days: days,
      sound,
      volume,
      vibration,
      snooze_enabled: snoozeEnabled,
      snooze_minutes: snoozeMinutes,
      question_count: questionCount,
      subject: subject || SUBJECTS[exam][0],
      chapter: chapter || null,
      difficulty,
      is_active: true,
    };

    const { error: dbError } = initial
      ? await supabase.from("alarms").update(payload).eq("id", initial.id)
      : await supabase.from("alarms").insert(payload);

    if (dbError) {
      setError("Could not save the alarm. Please try again.");
      setSaving(false);
      return;
    }
    router.push("/alarms");
    router.refresh();
  }

  const selectCls =
    "h-11 w-full rounded-xl border border-slate-300 bg-white/70 px-3 text-sm dark:border-slate-700 dark:bg-slate-900/60";

  return (
    <form onSubmit={save} className="glass w-full max-w-lg p-8 space-y-6">
      <div>
        <label className="text-sm font-medium">Alarm name</label>
        <Input className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Time</label>
          <Input type="time" className="mt-1.5" value={time} onChange={(e) => setTime(e.target.value)} required />
        </div>
        <div>
          <label className="text-sm font-medium">Questions to dismiss</label>
          <div className="mt-1.5 flex gap-2">
            {([2, 3, 4] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setQuestionCount(n)}
                className={cn(
                  "h-11 flex-1 rounded-xl border font-bold transition-colors",
                  questionCount === n
                    ? "border-brand-500 bg-brand-500 text-white"
                    : "border-slate-300 dark:border-slate-700"
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Repeat days</label>
        <div className="mt-1.5 flex gap-1.5">
          {DAY_LABELS.map((d, i) => (
            <button
              key={i}
              type="button"
              onClick={() => toggleDay(i)}
              className={cn(
                "h-10 w-10 rounded-full border text-sm font-bold transition-colors",
                days.includes(i)
                  ? "border-brand-500 bg-brand-500 text-white"
                  : "border-slate-300 dark:border-slate-700"
              )}
            >
              {d}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-500">No days selected = rings once.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Sound</label>
          <div className="mt-1.5 flex gap-2">
            <select className={selectCls} value={sound} onChange={(e) => setSound(e.target.value)}>
              {ALARM_SOUNDS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <Button type="button" variant="outline" size="sm" className="h-11" onClick={previewSound}>
              ▶
            </Button>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Volume: {volume}%</label>
          <input
            type="range"
            min={10}
            max={100}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="mt-4 w-full accent-brand-500"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={vibration} onChange={(e) => setVibration(e.target.checked)} className="h-4 w-4 accent-brand-500" />
          Vibration (mobile)
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={snoozeEnabled} onChange={(e) => setSnoozeEnabled(e.target.checked)} className="h-4 w-4 accent-brand-500" />
          Snooze
        </label>
        {snoozeEnabled && (
          <select className="h-9 rounded-lg border border-slate-300 bg-white/70 px-2 text-sm dark:border-slate-700 dark:bg-slate-900/60" value={snoozeMinutes} onChange={(e) => setSnoozeMinutes(Number(e.target.value))}>
            {[5, 10, 15].map((m) => (
              <option key={m} value={m}>{m} min</option>
            ))}
          </select>
        )}
      </div>

      <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-4 space-y-4">
        <p className="text-sm font-semibold text-brand-500">Wake-up challenge ({exam})</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Subject</label>
            <select className={cn(selectCls, "mt-1.5")} value={subject} onChange={(e) => setSubject(e.target.value)}>
              {SUBJECTS[exam].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Difficulty</label>
            <select className={cn(selectCls, "mt-1.5")} value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Chapter (optional)</label>
          <Input className="mt-1.5" placeholder="e.g. Rotational Motion" value={chapter ?? ""} onChange={(e) => setChapter(e.target.value)} />
        </div>
      </div>

      {error && <p className="text-sm text-red-500" role="alert">{error}</p>}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={() => router.push("/alarms")}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : initial ? "Save changes" : "Create alarm"}</Button>
      </div>
    </form>
  );
}
