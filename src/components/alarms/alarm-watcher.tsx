"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Alarm } from "@/types";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Global alarm scheduler. Mounted once in the root layout.
 * - Syncs active alarms from Supabase and caches them in localStorage (offline).
 * - Every 10s checks whether an alarm (or an elapsed snooze) should fire and
 *   navigates to the full-screen challenge.
 * - Fires each alarm at most once per day (localStorage guard).
 */
export function AlarmWatcher() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let alarms: Alarm[] = [];
    let signedIn = false;

    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        signedIn = Boolean(user);
        if (!user) return;
        const { data } = await supabase.from("alarms").select("*").eq("is_active", true);
        if (data) {
          alarms = data as Alarm[];
          localStorage.setItem("w2w:alarms", JSON.stringify(data));
          return;
        }
      } catch {
        /* offline — fall through to cache */
      }
      try {
        alarms = JSON.parse(localStorage.getItem("w2w:alarms") ?? "[]") as Alarm[];
      } catch {
        alarms = [];
      }
    }

    function check() {
      if (!signedIn || alarms.length === 0) return;
      if (window.location.pathname.startsWith("/alarms/ring")) return;

      const now = new Date();
      const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

      for (const a of alarms) {
        // Elapsed snooze fires first.
        const snoozeKey = `w2w:snooze:${a.id}`;
        const snoozeAt = Number(localStorage.getItem(snoozeKey) ?? 0);
        if (snoozeAt && Date.now() >= snoozeAt) {
          localStorage.removeItem(snoozeKey);
          router.push(`/alarms/ring/${a.id}`);
          return;
        }

        const firedKey = `w2w:fired:${a.id}:${today}`;
        if (localStorage.getItem(firedKey)) continue;

        const dayOk = a.repeat_days.length === 0 || a.repeat_days.includes(now.getDay());
        if (dayOk && a.time.slice(0, 5) === hhmm) {
          localStorage.setItem(firedKey, "1");
          router.push(`/alarms/ring/${a.id}`);
          return;
        }
      }
    }

    void load();
    const checkTimer = setInterval(check, 10_000);
    const syncTimer = setInterval(() => void load(), 60_000);
    return () => {
      clearInterval(checkTimer);
      clearInterval(syncTimer);
    };
  }, [router]);

  return null;
}
