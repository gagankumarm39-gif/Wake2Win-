import Link from "next/link";
import { redirect } from "next/navigation";
import { AlarmCheck, Brain, CalendarDays, Flame, ShieldAlert, Sunrise, Timer, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  alarmStats,
  attemptStats,
  computeStreaks,
  dailyStudyMinutes,
  fmtDuration,
  totalMinutesSince,
  type AlarmEventRow,
  type AttemptRow,
  type PomodoroRow,
} from "@/lib/analytics";
import { AccuracyDonut, StudyBarChart } from "@/components/analytics/charts";

export const metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/analytics");

  const since90 = new Date(Date.now() - 90 * 86_400_000).toISOString();

  const [pomoRes, eventRes, attemptRes, suspiciousRes, profileRes] = await Promise.all([
    supabase.from("pomodoro_sessions").select("focus_minutes, started_at, completed").gte("started_at", since90),
    supabase.from("alarm_events").select("status, fired_at, app_switches, suspicious").gte("fired_at", since90),
    supabase.from("question_attempts").select("correct, time_taken_seconds, created_at").gte("created_at", since90),
    supabase.from("suspicious_events").select("kind").gte("created_at", since90),
    supabase.from("profiles").select("longest_streak").eq("id", user.id).single(),
  ]);

  const pomo = (pomoRes.data ?? []) as PomodoroRow[];
  const events = (eventRes.data ?? []) as AlarmEventRow[];
  const attempts = (attemptRes.data ?? []) as AttemptRow[];
  const suspicious = suspiciousRes.data ?? [];

  // Active days = completed focus sessions or dismissed alarms.
  const activeDays = [
    ...pomo.filter((p) => p.completed).map((p) => p.started_at.slice(0, 10)),
    ...events.filter((e) => e.status === "dismissed").map((e) => e.fired_at.slice(0, 10)),
  ];
  const streaks = computeStreaks(activeDays);
  const longestEver = Math.max(streaks.longest, profileRes.data?.longest_streak ?? 0);

  // Keep the profile streaks in sync for the dashboard and leaderboard.
  await supabase
    .from("profiles")
    .update({ current_streak: streaks.current, longest_streak: longestEver })
    .eq("id", user.id);

  const daily = dailyStudyMinutes(pomo, 14);
  const a = alarmStats(events);
  const q = attemptStats(attempts);
  const appSwitchLogs = suspicious.length;

  const stats = [
    { icon: CalendarDays, label: "Today", value: fmtDuration(totalMinutesSince(pomo, 1)) },
    { icon: TrendingUp, label: "This week", value: fmtDuration(totalMinutesSince(pomo, 7)) },
    { icon: TrendingUp, label: "This month", value: fmtDuration(totalMinutesSince(pomo, 30)) },
    { icon: Flame, label: "Current streak", value: `${streaks.current}d` },
    { icon: Flame, label: "Longest streak", value: `${longestEver}d` },
    { icon: Sunrise, label: "Wake-up success", value: `${a.successRate}%` },
    { icon: AlarmCheck, label: "Alarm completion", value: `${a.completionRate}%` },
    { icon: Brain, label: "Accuracy", value: `${q.accuracy}%` },
    { icon: Timer, label: "Avg solve time", value: q.avgSeconds === null ? "—" : `${q.avgSeconds}s` },
  ];

  return (
    <main className="min-h-dvh px-6 py-10 bg-gradient-to-b from-white via-brand-50 to-white dark:from-[#0b0f1a] dark:via-[#131a2e] dark:to-[#0b0f1a]">
      <div className="mx-auto max-w-4xl">
        <Link href="/dashboard" className="text-sm text-slate-500 hover:text-brand-500">← Dashboard</Link>
        <h1 className="mt-1 text-3xl font-extrabold">Analytics</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Last 90 days of your grind, visualized.</p>

        {/* Stat grid */}
        <section className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {stats.map((s, i) => (
            <div key={i} className="glass p-4">
              <s.icon className="h-5 w-5 text-brand-500" />
              <p className="mt-2 text-2xl font-extrabold tabular-nums">{s.value}</p>
              <p className="text-xs uppercase tracking-wider text-slate-500">{s.label}</p>
            </div>
          ))}
        </section>

        {/* Charts */}
        <section className="mt-8 grid gap-6 lg:grid-cols-5">
          <div className="glass p-6 lg:col-span-3">
            <h2 className="font-bold">Daily study time · last 14 days</h2>
            <div className="mt-4">
              <StudyBarChart data={daily} />
            </div>
          </div>
          <div className="glass p-6 lg:col-span-2">
            <h2 className="font-bold">Question accuracy</h2>
            <div className="mt-4">
              <AccuracyDonut correct={q.correct} wrong={q.total - q.correct} />
            </div>
            <p className="text-center text-sm text-slate-500">
              {q.correct} correct · {q.total - q.correct} wrong · {q.total} total
            </p>
          </div>
        </section>

        {/* Anti-cheat transparency */}
        <section className="glass mt-6 p-6">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            <h2 className="font-bold">Integrity report</h2>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-extrabold">{a.totalAppSwitches}</p>
              <p className="text-xs text-slate-500">App switches during alarms</p>
            </div>
            <div>
              <p className="text-2xl font-extrabold">{a.suspiciousCount}</p>
              <p className="text-xs text-slate-500">Flagged alarm sessions</p>
            </div>
            <div>
              <p className="text-2xl font-extrabold">{appSwitchLogs}</p>
              <p className="text-xs text-slate-500">Suspicious events logged</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Leaving the app during a wake-up challenge restarts it with new questions and is recorded here.
            Honest mornings build real ranks. 💪
          </p>
        </section>
      </div>
    </main>
  );
}
