"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { safeSchedule, safeCancel } from "@/lib/native/alarm-plugin";
import { cn } from "@/lib/utils";
import type { Alarm } from "@/types";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function AlarmCard({ alarm }: { alarm: Alarm }) {
  const router = useRouter();
  const supabase = createClient();
  const [active, setActive] = useState(alarm.is_active);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const next = !active;
    setActive(next);
    const { error } = await supabase.from("alarms").update({ is_active: next }).eq("id", alarm.id);
    if (error) {
      setActive(!next);
    } else {
      // Keep the native alarm in sync with the toggle.
      if (next) await safeSchedule({ ...alarm, is_active: true });
      else await safeCancel(alarm.id);
    }
    setBusy(false);
  }

  async function remove() {
    if (!confirm("Delete this alarm?")) return;
    await supabase.from("alarms").delete().eq("id", alarm.id);
    await safeCancel(alarm.id);
    router.refresh();
  }

  const days =
    alarm.repeat_days.length === 0
      ? "Once"
      : alarm.repeat_days.length === 7
        ? "Every day"
        : alarm.repeat_days.map((d) => DAY_LABELS[d]).join(" ");

  return (
    <div className={cn("glass flex items-center justify-between p-5", !active && "opacity-55")}>
      <div>
        <p className="text-3xl font-extrabold tabular-nums">{alarm.time.slice(0, 5)}</p>
        <p className="mt-0.5 font-semibold">{alarm.name}</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {days} · {alarm.subject} · {alarm.difficulty} · {alarm.question_count} questions to dismiss
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Link href={`/alarms/${alarm.id}/edit`} aria-label="Edit alarm" className="text-slate-400 hover:text-brand-500">
          <Pencil className="h-4 w-4" />
        </Link>
        <button onClick={remove} aria-label="Delete alarm" className="text-slate-400 hover:text-red-500">
          <Trash2 className="h-4 w-4" />
        </button>
        <button
          role="switch"
          aria-checked={active}
          disabled={busy}
          onClick={toggle}
          className={cn(
            "relative h-7 w-12 rounded-full transition-colors",
            active ? "bg-brand-500" : "bg-slate-300 dark:bg-slate-700"
          )}
        >
          <span
            className={cn(
              "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all",
              active ? "left-6" : "left-1"
            )}
          />
        </button>
      </div>
    </div>
  );
}
