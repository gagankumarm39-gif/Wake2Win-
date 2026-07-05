import Link from "next/link";
import { redirect } from "next/navigation";
import { AlarmClock, BarChart3, Bell, Bot, Coins, Flame, Sparkles, Timer, Trophy, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { levelFromXp } from "@/lib/utils";
import type { Profile } from "@/types";

export const metadata = { title: "Dashboard" };

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

  const stats = [
    { icon: Sparkles, label: "Level", value: levelFromXp(profile.xp) },
    { icon: Trophy, label: "XP", value: profile.xp.toLocaleString() },
    { icon: Coins, label: "Coins", value: profile.coins.toLocaleString() },
    { icon: Flame, label: "Streak", value: `${profile.current_streak}d` },
  ];

  const modules = [
    { icon: AlarmClock, title: "Alarms", href: "/alarms", desc: "AI wake-up challenges" },
    { icon: Timer, title: "Pomodoro", href: "/pomodoro", desc: "Smart focus sessions" },
    { icon: BarChart3, title: "Analytics", href: "/analytics", desc: "Streaks & accuracy" },
    { icon: Bot, title: "AI Assistant", href: "/assistant", desc: "Quizzes, hints & more" },
    { icon: Trophy, title: "Missions", href: "/missions", desc: "Daily goals, badges & leaderboard" },
    { icon: Bell, title: "Reminders", href: "/reminders", desc: "Water, revision, sleep & more" },
  ];

  return (
    <main className="min-h-dvh px-6 py-10 bg-gradient-to-b from-white via-brand-50 to-white dark:from-[#0b0f1a] dark:via-[#131a2e] dark:to-[#0b0f1a]">
      <div className="mx-auto max-w-4xl">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold">
              Hey, {profile.display_name ?? "champion"} 👋
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {profile.exam} aspirant · goal: wake up at {profile.wake_up_goal?.slice(0, 5) ?? "—"}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/profile" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-500">
              <UserRound className="h-4 w-4" /> Profile
            </Link>
            <form action="/auth/signout" method="post">
              <button className="text-sm text-slate-500 hover:text-brand-500">Sign out</button>
            </form>
          </div>
        </header>

        <section className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="glass p-4 text-center">
              <s.icon className="mx-auto h-6 w-6 text-brand-500" />
              <p className="mt-2 text-2xl font-extrabold">{s.value}</p>
              <p className="text-xs uppercase tracking-wider text-slate-500">{s.label}</p>
            </div>
          ))}
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          {modules.map((m) => (
            <Link key={m.href} href={m.href} className="glass p-6 hover:scale-[1.02] transition-transform">
              <m.icon className="h-8 w-8 text-brand-500" />
              <h2 className="mt-3 text-xl font-bold">{m.title}</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{m.desc}</p>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
