import Link from "next/link";
import { redirect } from "next/navigation";
import { Crown } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { MissionCard } from "@/components/missions/mission-card";
import { cn, levelFromXp } from "@/lib/utils";

export const metadata = { title: "Missions & Rewards" };
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

export default async function MissionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/missions");

  const now = new Date();
  const todayKey = dayKey(now);
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7));
  const weekKey = dayKey(monday);
  const weekStartIso = `${weekKey}T00:00:00Z`;
  const todayStartIso = `${todayKey}T00:00:00Z`;

  const [missionsRes, claimedRes, pomoRes, eventsRes, attemptsRes, badgesRes, myBadgesRes, boardRes] =
    await Promise.all([
      supabase.from("missions").select("*").eq("active", true),
      supabase.from("user_missions").select("mission_code, period_start").in("period_start", [todayKey, weekKey]),
      supabase.from("pomodoro_sessions").select("focus_minutes, started_at").eq("completed", true).gte("started_at", weekStartIso),
      supabase.from("alarm_events").select("fired_at").eq("status", "dismissed").gte("fired_at", weekStartIso),
      supabase.from("question_attempts").select("created_at").eq("correct", true).gte("created_at", weekStartIso),
      supabase.from("badges").select("*").order("xp_reward"),
      supabase.from("user_badges").select("badge_code"),
      supabase.from("leaderboard").select("*"),
    ]);

  const missions = (missionsRes.data ?? []) as MissionRow[];
  const claimed = new Set((claimedRes.data ?? []).map((c) => `${c.mission_code}:${c.period_start}`));

  function progressFor(metric: string, type: "daily" | "weekly"): number {
    const cutoff = type === "daily" ? todayStartIso : weekStartIso;
    switch (metric) {
      case "study_minutes":
        return (pomoRes.data ?? [])
          .filter((r) => r.started_at >= cutoff)
          .reduce((s, r) => s + r.focus_minutes, 0);
      case "alarms_dismissed":
        return (eventsRes.data ?? []).filter((r) => r.fired_at >= cutoff).length;
      case "correct_answers":
        return (attemptsRes.data ?? []).filter((r) => r.created_at >= cutoff).length;
      default:
        return 0;
    }
  }

  const daily = missions.filter((m) => m.type === "daily");
  const weekly = missions.filter((m) => m.type === "weekly");
  const earned = new Set((myBadgesRes.data ?? []).map((b) => b.badge_code));
  const board = (boardRes.data ?? []).slice(0, 10) as {
    id: string; display_name: string | null; exam: string | null; xp: number; current_streak: number;
  }[];

  const renderMission = (m: MissionRow) => {
    const periodStart = m.type === "daily" ? todayKey : weekKey;
    return (
      <MissionCard
        key={m.code}
        code={m.code}
        title={m.title}
        type={m.type}
        progress={progressFor(m.criteria.metric, m.type)}
        target={m.criteria.target}
        xpReward={m.xp_reward}
        coinReward={m.coin_reward}
        periodStart={periodStart}
        claimed={claimed.has(`${m.code}:${periodStart}`)}
      />
    );
  };

  return (
    <main className="min-h-dvh px-6 py-10 bg-gradient-to-b from-white via-brand-50 to-white dark:from-[#0b0f1a] dark:via-[#131a2e] dark:to-[#0b0f1a]">
      <div className="mx-auto max-w-4xl">
        <Link href="/dashboard" className="text-sm text-slate-500 hover:text-brand-500">← Dashboard</Link>
        <h1 className="mt-1 text-3xl font-extrabold">Missions & Rewards</h1>

        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <div className="space-y-6">
            <section>
              <h2 className="font-bold text-lg">Daily missions</h2>
              <div className="mt-3 space-y-3">{daily.map(renderMission)}</div>
            </section>
            <section>
              <h2 className="font-bold text-lg">Weekly missions</h2>
              <div className="mt-3 space-y-3">{weekly.map(renderMission)}</div>
            </section>
            <section>
              <h2 className="font-bold text-lg">Achievements</h2>
              <div className="mt-3 grid grid-cols-5 gap-3">
                {(badgesRes.data ?? []).map((b) => (
                  <div
                    key={b.code}
                    title={`${b.name} — ${b.description}`}
                    className={cn(
                      "glass flex flex-col items-center p-3 text-center",
                      !earned.has(b.code) && "opacity-35 grayscale"
                    )}
                  >
                    <span className="text-2xl">{b.icon}</span>
                    <span className="mt-1 text-[10px] font-semibold leading-tight">{b.name}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section>
            <h2 className="font-bold text-lg">Leaderboard</h2>
            <div className="glass mt-3 divide-y divide-slate-200/50 dark:divide-slate-700/50">
              {board.length === 0 && (
                <p className="p-6 text-center text-sm text-slate-500">No rankings yet — be the first!</p>
              )}
              {board.map((p, i) => (
                <div
                  key={p.id}
                  className={cn(
                    "flex items-center gap-3 px-5 py-3",
                    p.id === user.id && "bg-brand-500/10"
                  )}
                >
                  <span className="w-7 text-center font-bold">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-semibold text-sm">
                      {p.display_name ?? "Anonymous"} {p.id === user.id && "(you)"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {p.exam ?? "—"} · Level {levelFromXp(p.xp)} · 🔥 {p.current_streak}d
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-sm font-bold text-brand-500">
                    <Crown className="h-3.5 w-3.5" /> {p.xp.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
