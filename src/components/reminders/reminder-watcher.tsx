"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { playChime } from "@/lib/ambient-sound";

interface ReminderRow {
  id: string;
  type: string;
  time: string;
  repeat_days: number[];
  enabled: boolean;
}

const MESSAGES: Record<string, { title: string; body: string }> = {
  water: { title: "💧 Hydration check", body: "Drink a glass of water — your brain works better hydrated." },
  stretch: { title: "🧘 Stretch break", body: "Stand up and stretch for 2 minutes." },
  revision: { title: "📖 Revision time", body: "Review what you studied today — spaced repetition wins." },
  sleep: { title: "😴 Wind down", body: "Sleep on time so you can win tomorrow's alarm." },
  mock_test: { title: "📝 Mock test", body: "Practice under real exam conditions today." },
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Fires browser notifications for enabled reminders — once per reminder per day. */
export function ReminderWatcher() {
  useEffect(() => {
    const supabase = createClient();
    let reminders: ReminderRow[] = [];

    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase.from("reminders").select("*").eq("enabled", true);
        if (data) {
          reminders = data as ReminderRow[];
          localStorage.setItem("w2w:reminders", JSON.stringify(data));
          return;
        }
      } catch {
        /* offline — use cache */
      }
      try {
        reminders = (JSON.parse(localStorage.getItem("w2w:reminders") ?? "[]") as ReminderRow[]).filter(
          (r) => r.enabled
        );
      } catch {
        reminders = [];
      }
    }

    function check() {
      if (reminders.length === 0) return;
      const now = new Date();
      const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

      for (const r of reminders) {
        const key = `w2w:rfired:${r.id}:${today}`;
        if (localStorage.getItem(key)) continue;
        const dayOk = r.repeat_days.length === 0 || r.repeat_days.includes(now.getDay());
        if (dayOk && r.time.slice(0, 5) === hhmm) {
          localStorage.setItem(key, "1");
          const msg = MESSAGES[r.type] ?? { title: "⏰ Reminder", body: "Time for your reminder." };
          playChime();
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            try {
              new Notification(msg.title, { body: msg.body, icon: "/icons/icon-192.png" });
            } catch {
              /* notification failed — chime already played */
            }
          }
        }
      }
    }

    void load();
    const checkTimer = setInterval(check, 30_000);
    const syncTimer = setInterval(() => void load(), 5 * 60_000);
    return () => {
      clearInterval(checkTimer);
      clearInterval(syncTimer);
    };
  }, []);

  return null;
}
