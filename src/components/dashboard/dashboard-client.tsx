"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlarmClock,
  ArrowRight,
  BarChart3,
  Bell,
  BellOff,
  Bot,
  ChevronRight,
  Coins,
  Crown,
  MessageSquare,
  Play,
  Plus,
  Quote,
  Sparkles,
  StickyNote,
  Target,
  Timer,
  Trophy,
  Zap,
} from "lucide-react";
import { motion, type Variants } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { usePomodoro, formatTime } from "@/lib/pomodoro-store";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types";
import { TiltCard } from "./tilt-card";
import { Magnetic } from "./magnetic";
import { AnimatedCounter } from "./animated-counter";
import { XpRing } from "./xp-ring";
import { StreakFlame } from "./streak-flame";
import { AiOrb } from "./ai-orb";
import { GlassNavbar } from "./glass-navbar";
import { QuickNotes } from "./quick-notes";

/* ────────────────────────── Types ────────────────────────── */

export interface AlarmLite {
  id: string;
  name: string;
  time: string; // HH:mm:ss
  repeat_days: number[];
}

export interface ReminderLite {
  id: string;
  type: string;
  time: string;
  repeat_days: number[];
}

export interface ConversationLite {
  id: string;
  title: string;
  updated_at: string;
}

export interface MissionLite {
  code: string;
  title: string;
  progress: number;
  target: number;
  xpReward: number;
  coinReward: number;
  claimed: boolean;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  xp: number;
  streak: number;
  isYou: boolean;
}

export interface AnalyticsSummary {
  studyMinutes7d: number;
  wakeSuccess: number;
  accuracy: number;
  focusScore: number;
  spark: number[]; // last 14 days study minutes
}

export interface DashboardData {
  profile: Profile;
  quote: string;
  alarms: AlarmLite[];
  reminders: ReminderLite[];
  conversations: ConversationLite[];
  missions: MissionLite[];
  leaderboard: LeaderboardEntry[];
  analytics: AnalyticsSummary;
}

/* ────────────────────────── Helpers ────────────────────────── */

const REMINDER_EMOJI: Record<string, string> = {
  water: "💧",
  stretch: "🧘",
  revision: "📖",
  sleep: "😴",
  mock_test: "📝",
};

const QUICK_PROMPTS = ["Quiz me on weak topics", "Explain a concept", "Plan my study day"];

function nextOccurrence(a: AlarmLite, now: Date): Date | null {
  const [h, m] = a.time.split(":").map(Number);
  for (let add = 0; add < 8; add++) {
    const d = new Date(now);
    d.setDate(now.getDate() + add);
    d.setHours(h, m, 0, 0);
    if (d <= now) continue;
    if (!a.repeat_days.length || a.repeat_days.includes(d.getDay())) return d;
  }
  return null;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

const gridVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.2 } },
};

/* ────────────────────────── Small building blocks ────────────────────────── */

function CardHeader({
  icon: Icon,
  title,
  href,
  iconClass,
}: {
  icon: React.ElementType;
  title: string;
  href?: string;
  iconClass?: string;
}) {
  const inner = (
    <>
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg",
          iconClass ?? "from-brand-500 to-brand-400 shadow-brand-500/30"
        )}
      >
        <Icon className="h-4 w-4 text-white" />
      </span>
      <span className="text-sm font-bold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">
        {title}
      </span>
    </>
  );

  if (!href) return <div className="flex items-center gap-2.5">{inner}</div>;

  return (
    <Link href={href} className="group/hd flex items-center gap-2.5">
      {inner}
      <ChevronRight className="h-4 w-4 -translate-x-1 text-slate-400 opacity-0 transition-all duration-300 group-hover/hd:translate-x-0 group-hover/hd:opacity-100" />
    </Link>
  );
}

function GreetingTitle({ name }: { name: string }) {
  const [greeting, setGreeting] = useState("Welcome back");

  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 5 ? "Burning the midnight oil" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 21 ? "Good evening" : "Late night grind");
  }, []);

  const words = `${greeting}, ${name}`.split(" ");

  return (
    <h1 key={greeting} className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
      {words.map((w, i) => (
        <motion.span
          key={`${w}-${i}`}
          initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ delay: 0.15 + i * 0.08, type: "spring", stiffness: 120, damping: 16 }}
          className={cn("mr-[0.3em] inline-block", i === words.length - 1 && "gradient-text")}
        >
          {w}
        </motion.span>
      ))}
    </h1>
  );
}

function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex items-baseline gap-3">
      <span className="text-lg font-bold tabular-nums tracking-tight sm:text-xl">
        {now ? `${pad(now.getHours())}:${pad(now.getMinutes())}` : "--:--"}
        <span className="text-brand-400">:{now ? pad(now.getSeconds()) : "--"}</span>
      </span>
      <span className="text-sm text-slate-500 dark:text-slate-400">
        {now?.toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long" }) ?? ""}
      </span>
    </div>
  );
}

function StatPill({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 150, damping: 15, delay: 0.5 }}
      className="glass-card flex items-center gap-2.5 rounded-2xl px-4 py-2.5"
    >
      {icon}
      <div className="leading-tight">
        <div className="text-base font-extrabold tabular-nums">{children}</div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
          {label}
        </div>
      </div>
    </motion.div>
  );
}

/* ────────────────────────── Bento cards ────────────────────────── */

function AlarmCard({ alarms }: { alarms: AlarmLite[] }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const next = useMemo(() => {
    if (!now) return null;
    let best: { alarm: AlarmLite; at: Date } | null = null;
    for (const a of alarms) {
      const at = nextOccurrence(a, now);
      if (at && (!best || at < best.at)) best = { alarm: a, at };
    }
    return best;
  }, [alarms, now]);

  let countdown = "--:--:--";
  let sub = "";
  if (next && now) {
    const ms = next.at.getTime() - now.getTime();
    const totalS = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(totalS / 86_400);
    const h = Math.floor((totalS % 86_400) / 3600);
    const m = Math.floor((totalS % 3600) / 60);
    const s = totalS % 60;
    countdown = d > 0 ? `${d}d ${pad(h)}:${pad(m)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
    sub = `${next.alarm.name || "Alarm"} · ${next.alarm.time.slice(0, 5)}`;
  }

  return (
    <div className="flex h-full flex-col p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <CardHeader icon={AlarmClock} title="Next alarm" href="/alarms" />
        <motion.span
          animate={{ rotate: [0, -12, 10, -8, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 3.4, ease: "easeInOut" }}
          className="text-slate-400"
        >
          <AlarmClock className="h-5 w-5" />
        </motion.span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
        {alarms.length === 0 ? (
          <>
            <span className="text-4xl">⏰</span>
            <p className="mt-3 font-semibold">No alarms yet</p>
            <p className="mt-1 max-w-[26ch] text-sm text-slate-500 dark:text-slate-400">
              Create an AI wake-up challenge — it only stops when you answer correctly.
            </p>
          </>
        ) : (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
              Rings in
            </p>
            <p className="gradient-text mt-1 text-5xl font-extrabold tabular-nums tracking-tight sm:text-6xl">
              {countdown}
            </p>
            <p className="mt-2 text-sm font-medium text-slate-500 dark:text-slate-400">{sub}</p>

            <div className="mt-5 w-full max-w-xs space-y-1.5">
              {alarms.slice(0, 2).map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-xl border border-slate-900/5 bg-white/30 px-3 py-2 text-xs dark:border-white/5 dark:bg-white/5"
                >
                  <span className="truncate font-semibold">{a.name || "Alarm"}</span>
                  <span className="tabular-nums text-slate-500 dark:text-slate-400">
                    {a.time.slice(0, 5)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-center gap-3">
        <Magnetic>
          <Link
            href="/alarms/new"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-400 px-5 text-sm font-semibold text-white shadow-lg shadow-brand-500/35 transition-shadow hover:shadow-brand-500/55"
          >
            <Plus className="h-4 w-4" /> Quick start
          </Link>
        </Magnetic>
        <Link
          href="/alarms"
          className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-slate-900/10 px-4 text-sm font-semibold text-slate-600 transition-colors hover:border-brand-400/50 hover:text-brand-500 dark:border-white/10 dark:text-slate-300"
        >
          All alarms <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

function AssistantCard({ conversations }: { conversations: ConversationLite[] }) {
  return (
    <div className="flex h-full flex-col p-5 sm:p-6">
      <CardHeader
        icon={Bot}
        title="AI Assistant"
        href="/assistant"
        iconClass="from-cyan-500 to-sky-400 shadow-cyan-500/30"
      />

      <div className="mt-4 flex-1 space-y-2">
        {conversations.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <Bot className="h-10 w-10 text-cyan-400/70" />
            </motion.div>
            <p className="mt-3 text-sm font-semibold">Your study copilot awaits</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Doubts, quizzes, revision plans — just ask.
            </p>
          </div>
        ) : (
          conversations.map((c) => (
            <Link
              key={c.id}
              href="/assistant"
              className="group/conv flex items-center gap-3 rounded-xl border border-slate-900/5 bg-white/30 px-3 py-2.5 transition-colors hover:border-cyan-400/40 dark:border-white/5 dark:bg-white/5"
            >
              <MessageSquare className="h-4 w-4 shrink-0 text-cyan-500" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{c.title || "Untitled chat"}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {formatDistanceToNow(new Date(c.updated_at), { addSuffix: true })}
                </p>
              </div>
              <ArrowRight className="h-3.5 w-3.5 -translate-x-1 text-cyan-400 opacity-0 transition-all group-hover/conv:translate-x-0 group-hover/conv:opacity-100" />
            </Link>
          ))
        )}
      </div>

      <div className="mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          Quick prompts
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.map((p) => (
            <Link
              key={p}
              href="/assistant"
              className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-600 transition-all hover:scale-105 hover:bg-cyan-400/20 dark:text-cyan-300"
            >
              {p}
            </Link>
          ))}
        </div>
        <Magnetic className="mt-4 w-full">
          <Link
            href="/assistant"
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-sky-400 text-sm font-semibold text-white shadow-lg shadow-cyan-500/35 transition-shadow hover:shadow-cyan-500/55"
          >
            <Sparkles className="h-4 w-4" /> Ask AI
          </Link>
        </Magnetic>
      </div>
    </div>
  );
}

function AnalyticsCard({ analytics }: { analytics: AnalyticsSummary }) {
  const max = Math.max(1, ...analytics.spark);
  const stats = [
    { label: "Study (7d)", value: analytics.studyMinutes7d / 60, decimals: 1, suffix: "h" },
    { label: "Wake success", value: analytics.wakeSuccess, decimals: 0, suffix: "%" },
    { label: "Focus score", value: analytics.focusScore, decimals: 0, suffix: "" },
    { label: "Accuracy", value: analytics.accuracy, decimals: 0, suffix: "%" },
  ];

  return (
    <div className="flex h-full flex-col p-5 sm:p-6">
      <CardHeader
        icon={BarChart3}
        title="Analytics"
        href="/analytics"
        iconClass="from-emerald-500 to-teal-400 shadow-emerald-500/30"
      />

      <div className="mt-4 grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col justify-center">
            <AnimatedCounter
              value={s.value}
              decimals={s.decimals}
              suffix={s.suffix}
              className="text-2xl font-extrabold tabular-nums"
            />
            <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              {s.label}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex h-12 items-end gap-1" aria-label="Study minutes, last 14 days">
        {analytics.spark.map((v, i) => (
          <motion.div
            key={i}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: Math.max(0.06, v / max) }}
            transition={{ delay: 0.5 + i * 0.045, type: "spring", stiffness: 160, damping: 18 }}
            className="h-full flex-1 origin-bottom rounded-sm bg-gradient-to-t from-emerald-500/70 to-cyan-400/70"
          />
        ))}
      </div>
    </div>
  );
}

function PomodoroCard() {
  const router = useRouter();
  const phase = usePomodoro((s) => s.phase);
  const running = usePomodoro((s) => s.running);
  const secondsLeft = usePomodoro((s) => s.secondsLeft);
  const focusMinutes = usePomodoro((s) => s.focusMinutes);
  const breakMinutes = usePomodoro((s) => s.breakMinutes);
  const start = usePomodoro((s) => s.start);

  const total = (phase === "break" ? breakMinutes : focusMinutes) * 60;
  const pct = phase === "idle" ? 0 : 1 - secondsLeft / total;

  return (
    <div className="flex h-full flex-col p-5">
      <CardHeader
        icon={Timer}
        title="Pomodoro"
        href="/pomodoro"
        iconClass="from-rose-500 to-orange-400 shadow-rose-500/30"
      />

      <div className="flex flex-1 flex-col items-center justify-center py-4">
        <p className="text-4xl font-extrabold tabular-nums tracking-tight">
          {formatTime(phase === "idle" ? focusMinutes * 60 : secondsLeft)}
        </p>
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          {phase === "idle" ? "Ready to focus" : phase === "focus" ? (running ? "Focusing" : "Paused") : "Break"}
        </p>
        {phase !== "idle" && (
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-900/10 dark:bg-white/10">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-400"
              animate={{ width: `${Math.round(pct * 100)}%` }}
              transition={{ ease: "linear", duration: 0.4 }}
            />
          </div>
        )}
      </div>

      <Magnetic className="w-full">
        <button
          onClick={() => {
            if (phase === "idle") start();
            router.push("/pomodoro");
          }}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-orange-400 text-sm font-semibold text-white shadow-lg shadow-rose-500/35 transition-shadow hover:shadow-rose-500/55"
        >
          <Play className="h-4 w-4 fill-current" />
          {phase === "idle" ? `Start ${focusMinutes} min` : "Open timer"}
        </button>
      </Magnetic>
    </div>
  );
}

function MissionsCard({ missions }: { missions: MissionLite[] }) {
  return (
    <div className="flex h-full flex-col p-5">
      <CardHeader
        icon={Target}
        title="Missions"
        href="/missions"
        iconClass="from-amber-500 to-yellow-400 shadow-amber-500/30"
      />

      <div className="mt-4 flex-1 space-y-3.5">
        {missions.length === 0 && (
          <p className="pt-4 text-center text-xs text-slate-500 dark:text-slate-400">
            No daily missions available right now.
          </p>
        )}
        {missions.slice(0, 3).map((m, i) => {
          const pct = Math.min(100, Math.round((m.progress / Math.max(1, m.target)) * 100));
          return (
            <div key={m.code}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-semibold">{m.title}</span>
                <span className="shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-300">
                  {m.claimed ? "Claimed ✓" : `+${m.xpReward} XP`}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-900/10 dark:bg-white/10">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ delay: 0.6 + i * 0.15, duration: 1, ease: [0.16, 1, 0.3, 1] }}
                  className={cn(
                    "h-full rounded-full",
                    m.claimed
                      ? "bg-emerald-400"
                      : "bg-gradient-to-r from-amber-500 to-yellow-400"
                  )}
                />
              </div>
              <p className="mt-1 text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                {Math.min(m.progress, m.target)} / {m.target}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RemindersCard({ reminders }: { reminders: ReminderLite[] }) {
  const [today, setToday] = useState<number | null>(null);
  useEffect(() => setToday(new Date().getDay()), []);

  const todays = reminders.filter(
    (r) => today === null || !r.repeat_days.length || r.repeat_days.includes(today)
  );

  return (
    <div className="flex h-full flex-col p-5">
      <CardHeader
        icon={Bell}
        title="Reminders"
        href="/reminders"
        iconClass="from-violet-500 to-purple-400 shadow-violet-500/30"
      />

      <div className="mt-4 flex-1 space-y-2 overflow-hidden">
        {todays.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <BellOff className="h-6 w-6 text-slate-400/60" />
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Nothing scheduled today</p>
            <Link
              href="/reminders"
              className="mt-2 text-xs font-semibold text-violet-500 hover:underline"
            >
              Add a reminder →
            </Link>
          </div>
        ) : (
          todays.slice(0, 4).map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-2.5 rounded-xl border border-slate-900/5 bg-white/30 px-3 py-2 dark:border-white/5 dark:bg-white/5"
            >
              <span className="text-base">{REMINDER_EMOJI[r.type] ?? "🔔"}</span>
              <span className="flex-1 truncate text-xs font-semibold capitalize">
                {r.type.replace("_", " ")}
              </span>
              <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                {r.time.slice(0, 5)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function LeaderboardCard({ board }: { board: LeaderboardEntry[] }) {
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div className="flex h-full flex-col p-5">
      <CardHeader
        icon={Crown}
        title="Leaderboard"
        href="/missions"
        iconClass="from-fuchsia-500 to-pink-400 shadow-fuchsia-500/30"
      />

      <div className="mt-4 flex-1 space-y-1.5">
        {board.length === 0 && (
          <p className="pt-4 text-center text-xs text-slate-500 dark:text-slate-400">
            No rankings yet — be the first!
          </p>
        )}
        {board.map((p, i) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.55 + i * 0.1, type: "spring", stiffness: 150, damping: 18 }}
            className={cn(
              "flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs",
              p.isYou
                ? "border border-brand-400/30 bg-brand-500/10"
                : "border border-transparent"
            )}
          >
            <span className="w-5 text-center font-bold">{medals[i] ?? i + 1}</span>
            <span className="flex-1 truncate font-semibold">
              {p.name}
              {p.isYou && <span className="text-brand-400"> (you)</span>}
            </span>
            <span className="flex items-center gap-1 font-bold tabular-nums text-brand-500 dark:text-brand-400">
              <Zap className="h-3 w-3" />
              {p.xp.toLocaleString()}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────── Page ────────────────────────── */

export function DashboardClient({ data }: { data: DashboardData }) {
  const { profile, quote, alarms, reminders, conversations, missions, leaderboard, analytics } =
    data;

  return (
    <div className="relative min-h-dvh">
      <GlassNavbar />
      <AiOrb />

      <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-10 sm:px-6">
        {/* ── Hero ── */}
        <section className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <GreetingTitle name={profile.display_name ?? "champion"} />
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="mt-3"
            >
              <LiveClock />
              <p className="mt-3 flex max-w-xl items-start gap-2 text-sm italic text-slate-500 dark:text-slate-400">
                <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-400" />
                {quote}
              </p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                {profile.exam ?? "Exam"} aspirant · wake goal {profile.wake_up_goal?.slice(0, 5) ?? "—"}
              </p>
            </motion.div>

            <div className="mt-6 flex flex-wrap gap-3">
              <StatPill icon={<Zap className="h-5 w-5 text-brand-400" />} label="Total XP">
                <AnimatedCounter value={profile.xp} />
              </StatPill>
              <StatPill icon={<Coins className="h-5 w-5 text-amber-400" />} label="Coins">
                <AnimatedCounter value={profile.coins} />
              </StatPill>
              <StatPill icon={<StreakFlame className="h-6 w-6" />} label="Day streak">
                <AnimatedCounter value={profile.current_streak} suffix="d" />
              </StatPill>
              <StatPill icon={<Trophy className="h-5 w-5 text-emerald-400" />} label="Best streak">
                <AnimatedCounter value={profile.longest_streak} suffix="d" />
              </StatPill>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, type: "spring", stiffness: 120, damping: 16 }}
            className="flex shrink-0 items-center justify-center lg:justify-end"
          >
            <XpRing xp={profile.xp} />
          </motion.div>
        </section>

        {/* ── Bento grid ── */}
        <motion.section
          variants={gridVariants}
          initial="hidden"
          animate="show"
          className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:[grid-auto-rows:minmax(0,auto)]"
        >
          <TiltCard className="sm:col-span-2 lg:row-span-2" glow="139, 125, 255">
            <AlarmCard alarms={alarms} />
          </TiltCard>

          <TiltCard className="sm:col-span-2 lg:row-span-2" glow="34, 211, 238">
            <AssistantCard conversations={conversations} />
          </TiltCard>

          <TiltCard className="sm:col-span-2" glow="52, 211, 153">
            <AnalyticsCard analytics={analytics} />
          </TiltCard>

          <TiltCard glow="251, 113, 133">
            <PomodoroCard />
          </TiltCard>

          <TiltCard glow="251, 191, 36">
            <MissionsCard missions={missions} />
          </TiltCard>

          <TiltCard glow="167, 139, 250">
            <RemindersCard reminders={reminders} />
          </TiltCard>

          <TiltCard glow="232, 121, 249">
            <LeaderboardCard board={leaderboard} />
          </TiltCard>

          <TiltCard className="sm:col-span-2" glow="139, 125, 255">
            <div className="flex h-full flex-col p-5">
              <CardHeader icon={StickyNote} title="Quick notes" iconClass="from-sky-500 to-indigo-400 shadow-sky-500/30" />
              <div className="mt-4 flex-1">
                <QuickNotes />
              </div>
            </div>
          </TiltCard>
        </motion.section>
      </main>
    </div>
  );
}
