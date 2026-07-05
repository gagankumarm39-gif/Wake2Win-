"use client";

import { useEffect, useState } from "react";
import { BellRing, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface Reminder {
  id: string;
  type: string;
  time: string;
  repeat_days: number[];
  enabled: boolean;
}

const TYPES = [
  { id: "water", label: "Drink water", emoji: "💧" },
  { id: "stretch", label: "Stretch", emoji: "🧘" },
  { id: "revision", label: "Revision", emoji: "📖" },
  { id: "sleep", label: "Sleep", emoji: "😴" },
  { id: "mock_test", label: "Mock test", emoji: "📝" },
] as const;

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export function ReminderManager({ initial }: { initial: Reminder[] }) {
  const supabase = createClient();
  const [reminders, setReminders] = useState<Reminder[]>(initial);
  const [newType, setNewType] = useState<string>("water");
  const [newTime, setNewTime] = useState("10:00");
  const [busy, setBusy] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  async function requestPermission() {
    if (typeof Notification === "undefined") return;
    setPerm(await Notification.requestPermission());
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("reminders")
      .insert({ user_id: user.id, type: newType, time: newTime, repeat_days: [0, 1, 2, 3, 4, 5, 6], enabled: true })
      .select("*")
      .single();
    if (data) setReminders((prev) => [...prev, data as Reminder]);
    setBusy(false);
  }

  async function toggle(r: Reminder) {
    setReminders((prev) => prev.map((x) => (x.id === r.id ? { ...x, enabled: !r.enabled } : x)));
    await supabase.from("reminders").update({ enabled: !r.enabled }).eq("id", r.id);
  }

  async function toggleDay(r: Reminder, d: number) {
    const repeat_days = r.repeat_days.includes(d)
      ? r.repeat_days.filter((x) => x !== d)
      : [...r.repeat_days, d].sort();
    setReminders((prev) => prev.map((x) => (x.id === r.id ? { ...x, repeat_days } : x)));
    await supabase.from("reminders").update({ repeat_days }).eq("id", r.id);
  }

  async function updateTime(r: Reminder, time: string) {
    setReminders((prev) => prev.map((x) => (x.id === r.id ? { ...x, time } : x)));
    await supabase.from("reminders").update({ time }).eq("id", r.id);
  }

  async function remove(id: string) {
    setReminders((prev) => prev.filter((x) => x.id !== id));
    await supabase.from("reminders").delete().eq("id", id);
  }

  const typeOf = (id: string) => TYPES.find((t) => t.id === id) ?? TYPES[0];

  return (
    <div className="space-y-6">
      {perm !== "granted" && perm !== "unsupported" && (
        <div className="glass flex items-center justify-between gap-4 p-4">
          <p className="text-sm">
            <BellRing className="mr-1.5 inline h-4 w-4 text-brand-500" />
            Enable notifications so reminders reach you even in another tab.
          </p>
          <Button size="sm" onClick={requestPermission}>Enable</Button>
        </div>
      )}

      <div className="space-y-3">
        {reminders.length === 0 && (
          <div className="glass p-8 text-center text-sm text-slate-500">
            No reminders yet — add your first one below.
          </div>
        )}
        {reminders.map((r) => {
          const t = typeOf(r.type);
          return (
            <div key={r.id} className={cn("glass p-4", !r.enabled && "opacity-55")}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">
                  <span className="mr-2 text-xl">{t.emoji}</span>
                  {t.label}
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="time"
                    value={r.time.slice(0, 5)}
                    onChange={(e) => updateTime(r, e.target.value)}
                    className="h-9 rounded-lg border border-slate-300 bg-white/70 px-2 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-900/60"
                  />
                  <button onClick={() => remove(r.id)} aria-label="Delete reminder" className="text-slate-400 hover:text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <button
                    role="switch"
                    aria-checked={r.enabled}
                    onClick={() => toggle(r)}
                    className={cn(
                      "relative h-7 w-12 rounded-full transition-colors",
                      r.enabled ? "bg-brand-500" : "bg-slate-300 dark:bg-slate-700"
                    )}
                  >
                    <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all", r.enabled ? "left-6" : "left-1")} />
                  </button>
                </div>
              </div>
              <div className="mt-3 flex gap-1.5">
                {DAY_LABELS.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => toggleDay(r, i)}
                    className={cn(
                      "h-8 w-8 rounded-full border text-xs font-bold transition-colors",
                      r.repeat_days.includes(i)
                        ? "border-brand-500 bg-brand-500 text-white"
                        : "border-slate-300 dark:border-slate-700"
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={add} className="glass flex flex-wrap items-end gap-3 p-4">
        <div className="flex-1 min-w-36">
          <label className="text-sm font-medium">Type</label>
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white/70 px-3 text-sm dark:border-slate-700 dark:bg-slate-900/60"
          >
            {TYPES.map((t) => (
              <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Time</label>
          <Input type="time" className="mt-1.5 w-32" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
        </div>
        <Button type="submit" disabled={busy}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </form>
    </div>
  );
}
