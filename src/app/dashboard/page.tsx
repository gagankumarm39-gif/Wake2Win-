import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { randomQuote } from "@/lib/quotes";
import {
  alarmStats,
  attemptStats,
  dailyStudyMinutes,
  totalMinutesSince,
  type AlarmEventRow,
  type AttemptRow,
  type PomodoroRow,
} from "@/lib/analytics";
import { AuroraBackground } from "@/components/dashboard/aurora-background";
import {
  DashboardClient,
  type AlarmLite,
  type ConversationLite,
  type LeaderboardEntry,
  type MissionLite,
  type ReminderLite,
} from "@/components/dashboard/dashboard-client";
import type { Profile } from "@/types";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

interface MissionRow {
  code: string;
  title: string;
  type: "daily" | "weekly";
  criteria: { metric: string; target: number };
  xp_reward: number;
  coin_reward: number;
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  if (!profile?.onboarded) redirect("/onboarding");

  const now = new Date();
  const todayKey = dayKey(now);
  const todayStartIso = `${todayKey}T00:00:00Z`;
  const since14d = new Date(now.getTime() - 14 * 86_400_000).toISOString();
  const since30d = new Date(now.getTime() - 30 * 86_400_000).toISOString();

  const [alarmsRes, remindersRes, convRes, missionsRes, claimedRes, boardRes, pomoRes, eventsRes, attemptsRes] =
    await Promise.all([
      supabase
        .from("alarms")
        .select("id, name, time, repeat_days")
        .eq("is_active", true)
        .order("time"),
      supabase
        .from("reminders")
        .select("id, type, time, repeat_days")
        .eq("enabled", true)
        .order("time"),
      supabase
        .from("conversations")
        .select("id, title, updated_at")
        .order("updated_at", { ascending: false })
        .limit(3),
      supabase.from("missions").select("*").eq("active", true).eq("type", "daily"),
      supabase
        .from("user_missions")
        .select("mission_code, period_start")
        .eq("period_start", todayKey),
      supabase.from("leaderboard").select("*"),
      supabase
        .from("pomodoro_sessions")
        .select("focus_minutes, started_at, completed")
        .gte("started_at", since14d),
      supabase
        .from("alarm_events")
        .select("status, fired_at, app_switches, suspicious")
        .gte("fired_at", since30d),
      supabase
        .from("question_attempts")
        .select("correct, time_taken_seconds, created_at")
        .gte("created_at", since30d),
    ]);

  // ── Analytics summary ──
  const pomoRows = (pomoRes.data ?? []) as PomodoroRow[];
  const eventRows = (eventsRes.data ?? []) as AlarmEventRow[];
  const attemptRows = (attemptsRes.data ?? []) as AttemptRow[];

  const studyMinutes7d = totalMinutesSince(pomoRows, 7, now);
  const { successRate } = alarmStats(eventRows);
  const { accuracy } = attemptStats(attemptRows);
  const goalMinutes = Math.max(1, (profile.study_hours_per_day || 6) * 60 * 7);
  const consistency = Math.min(100, Math.round((studyMinutes7d / goalMinutes) * 100));
  const focusScore = Math.round(0.5 * consistency + 0.25 * successRate + 0.25 * accuracy);
  const spark = dailyStudyMinutes(pomoRows, 14, now).map((d) => d.minutes);

  // ── Daily missions with progress ──
  const claimed = new Set((claimedRes.data ?? []).map((c) => `${c.mission_code}:${c.period_start}`));
  const progressFor = (metric: string): number => {
    switch (metric) {
      case "study_minutes":
        return pomoRows
          .filter((r) => r.completed && r.started_at >= todayStartIso)
          .reduce((s, r) => s + r.focus_minutes, 0);
      case "alarms_dismissed":
        return eventRows.filter((r) => r.status === "dismissed" && r.fired_at >= todayStartIso).length;
      case "correct_answers":
        return attemptRows.filter((r) => r.correct && r.created_at >= todayStartIso).length;
      default:
        return 0;
    }
  };
  const missions: MissionLite[] = ((missionsRes.data ?? []) as MissionRow[]).map((m) => ({
    code: m.code,
    title: m.title,
    progress: progressFor(m.criteria.metric),
    target: m.criteria.target,
    xpReward: m.xp_reward,
    coinReward: m.coin_reward,
    claimed: claimed.has(`${m.code}:${todayKey}`),
  }));

  const leaderboard: LeaderboardEntry[] = ((boardRes.data ?? []) as {
    id: string;
    display_name: string | null;
    xp: number;
    current_streak: number;
  }[])
    .slice(0, 5)
    .map((p) => ({
      id: p.id,
      name: p.display_name ?? "Anonymous",
      xp: p.xp,
      streak: p.current_streak,
      isYou: p.id === user.id,
    }));

  return (
    <>
      <AuroraBackground />
      <DashboardClient
        data={{
          profile,
          quote: randomQuote(),
          alarms: (alarmsRes.data ?? []) as AlarmLite[],
          reminders: (remindersRes.data ?? []) as ReminderLite[],
          conversations: (convRes.data ?? []) as ConversationLite[],
          missions,
          leaderboard,
          analytics: { studyMinutes7d, wakeSuccess: successRate, accuracy, focusScore, spark },
        }}
      />
    </>
  );
}
