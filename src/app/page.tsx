"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { AlarmClock, Brain, Timer, Trophy } from "lucide-react";

const features = [
  { icon: AlarmClock, title: "AI Wake-Up Alarm", desc: "Alarms only stop when you solve fresh AI-generated MCQs from your exam syllabus." },
  { icon: Brain, title: "AI Study Assistant", desc: "Quizzes, hints, explanations, weak-topic detection and daily challenges." },
  { icon: Timer, title: "Smart Pomodoro", desc: "Custom focus sessions, automatic breaks and motivational quotes." },
  { icon: Trophy, title: "Gamification", desc: "XP, coins, badges, streaks, missions and a global leaderboard." },
];

export default function LandingPage() {
  return (
    <main className="min-h-dvh flex flex-col items-center px-6 py-16 bg-gradient-to-b from-white via-brand-50 to-white dark:from-[#0b0f1a] dark:via-[#131a2e] dark:to-[#0b0f1a]">
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="text-center max-w-2xl"
      >
        <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight">
          Wake up. <span className="gradient-text">Win the day.</span>
        </h1>
        <p className="mt-5 text-lg text-slate-600 dark:text-slate-300">
          The AI alarm that makes you solve exam questions before it stops. Built for NEET, JEE,
          UPSC, SSC, GATE, CAT and Boards aspirants.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/login"
            className="rounded-full bg-brand-500 hover:bg-brand-600 text-white px-8 py-3 font-semibold shadow-lg shadow-brand-500/30 transition-colors"
          >
            Get started free
          </Link>
          <Link
            href="/dashboard"
            className="glass px-8 py-3 font-semibold hover:scale-[1.02] transition-transform"
          >
            Open app
          </Link>
        </div>
      </motion.section>

      <section className="mt-20 grid gap-6 sm:grid-cols-2 max-w-4xl w-full">
        {features.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08, duration: 0.5 }}
            className="glass p-6"
          >
            <f.icon className="h-8 w-8 text-brand-500" />
            <h2 className="mt-3 text-xl font-bold">{f.title}</h2>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">{f.desc}</p>
          </motion.div>
        ))}
      </section>
    </main>
  );
}
