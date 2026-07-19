"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlarmClock,
  BarChart3,
  Bell,
  Bot,
  FileText,
  LogOut,
  Moon,
  NotebookPen,
  ScanLine,
  Sun,
  Sunrise,
  Timer,
  Trophy,
  UserRound,
} from "lucide-react";
import { motion } from "framer-motion";
import { Magnetic } from "./magnetic";

const NAV = [
  { href: "/alarms", label: "Alarms", icon: AlarmClock },
  { href: "/pomodoro", label: "Pomodoro", icon: Timer },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/assistant", label: "Assistant", icon: Bot },
  { href: "/scanner", label: "Scanner", icon: ScanLine },
  { href: "/tests", label: "Tests", icon: FileText },
  { href: "/notes", label: "Notes", icon: NotebookPen },
  { href: "/missions", label: "Missions", icon: Trophy },
  { href: "/reminders", label: "Reminders", icon: Bell },
];

function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("w2w:theme", next ? "dark" : "light");
    } catch {}
    setDark(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="relative flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-900/5 hover:text-brand-500 dark:text-slate-400 dark:hover:bg-white/5"
    >
      <motion.span
        key={dark === null ? "init" : dark ? "moon" : "sun"}
        initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
      >
        {dark ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
      </motion.span>
    </button>
  );
}

/** Floating glass navigation bar. */
export function GlassNavbar() {
  return (
    <motion.header
      initial={{ y: -70, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 120, damping: 18 }}
      className="sticky top-4 z-50 mx-auto w-full max-w-7xl px-4 sm:px-6"
    >
      <div className="glass-card flex items-center justify-between gap-2 px-4 py-2.5 sm:px-5">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 via-brand-400 to-cyan-400 shadow-lg shadow-brand-500/40">
            <Sunrise className="h-5 w-5 text-white" />
          </span>
          <span className="gradient-text hidden text-lg font-extrabold tracking-tight sm:block">
            Wake2Win
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="group relative flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:text-brand-500 dark:text-slate-300 dark:hover:text-brand-400"
            >
              <n.icon className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-110" />
              {n.label}
              <span className="absolute inset-x-3 -bottom-px h-px scale-x-0 bg-gradient-to-r from-transparent via-brand-400 to-transparent transition-transform duration-300 group-hover:scale-x-100" />
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Magnetic strength={0.25}>
            <Link
              href="/profile"
              aria-label="Profile"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-900/5 hover:text-brand-500 dark:text-slate-400 dark:hover:bg-white/5"
            >
              <UserRound className="h-[18px] w-[18px]" />
            </Link>
          </Magnetic>
          <form action="/auth/signout" method="post">
            <button
              aria-label="Sign out"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-400 dark:text-slate-400"
            >
              <LogOut className="h-[18px] w-[18px]" />
            </button>
          </form>
        </div>
      </div>
    </motion.header>
  );
}
