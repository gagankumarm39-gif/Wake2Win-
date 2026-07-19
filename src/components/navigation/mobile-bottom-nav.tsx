"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Ellipsis, FileText, Home, NotebookPen, ScanLine, UserRound } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/assistant", label: "AI", icon: Bot },
  { href: "/notes", label: "Notes", icon: NotebookPen },
  { href: "/tests", label: "Tests", icon: FileText },
  { href: "/profile", label: "Profile", icon: UserRound },
] as const;

/** Overflow destinations — the bar itself is full at 5 slots. */
const MORE_ITEMS = [
  { href: "/scanner", label: "Scanner", icon: ScanLine },
] as const;

/**
 * Routes where the bottom nav must stay out of the way:
 * marketing/auth/onboarding flows, full-screen alarm ring,
 * distraction-free focus mode and the anti-cheat test runner
 * (/tests/[id] — but not /tests or /tests/new).
 */
const HIDDEN_PATTERNS: readonly RegExp[] = [
  /^\/$/,
  /^\/login/,
  /^\/onboarding/,
  /^\/auth/,
  /^\/offline/,
  /^\/focus/,
  /^\/alarms\/ring/,
  /^\/tests\/(?!new(?:\/|$))[^/]+/,
];

/**
 * Floating glassmorphism bottom navigation — mobile & small tablets only
 * (hidden from the lg breakpoint up, where GlassNavbar shows its links).
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const [moreOpen, setMoreOpen] = useState(false);

  // Navigating anywhere closes the overflow menu.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const hidden = useMemo(
    () => HIDDEN_PATTERNS.some((p) => p.test(pathname ?? "")),
    [pathname]
  );
  if (hidden) return null;

  const isActive = (href: string) =>
    pathname === href || (pathname?.startsWith(`${href}/`) ?? false);
  const moreActive = MORE_ITEMS.some((i) => isActive(i.href));

  return (
    <>
      {/* In-flow spacer so page content never hides behind the floating bar. */}
      <div aria-hidden className="h-24 lg:hidden" />

      <motion.nav
        aria-label="Primary"
        initial={reduce ? false : { y: 90, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 24, delay: 0.15 }}
        className="fixed inset-x-0 z-50 mx-auto w-[min(92%,26rem)] lg:hidden"
        style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        {moreOpen && (
          <motion.div
            initial={reduce ? false : { y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="glass-card mb-2 rounded-3xl px-2 py-1.5"
          >
            {MORE_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-label={label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold outline-none transition-colors",
                    "focus-visible:ring-2 focus-visible:ring-brand-400",
                    active
                      ? "text-brand-500 dark:text-brand-400"
                      : "text-slate-500 hover:text-brand-500 dark:text-slate-400 dark:hover:text-brand-400"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </motion.div>
        )}

        <div className="glass-card flex items-center justify-between rounded-3xl px-2 py-1.5">
          {ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-w-[3.25rem] flex-col items-center gap-0.5 rounded-2xl px-3 py-2 text-[10px] font-semibold outline-none transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-brand-400",
                  active
                    ? "text-brand-500 dark:text-brand-400"
                    : "text-slate-500 hover:text-brand-500 dark:text-slate-400 dark:hover:text-brand-400"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="w2w-bottom-nav-pill"
                    transition={
                      reduce
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 320, damping: 28 }
                    }
                    className="absolute inset-0 rounded-2xl bg-brand-500/10 ring-1 ring-brand-400/30"
                    aria-hidden
                  />
                )}
                <motion.span
                  whileTap={reduce ? undefined : { scale: 0.85 }}
                  className="relative"
                >
                  <Icon className="h-5 w-5" />
                </motion.span>
                <span className="relative">{label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            aria-label="More"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((o) => !o)}
            className={cn(
              "relative flex min-w-[3.25rem] flex-col items-center gap-0.5 rounded-2xl px-3 py-2 text-[10px] font-semibold outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-brand-400",
              moreActive || moreOpen
                ? "text-brand-500 dark:text-brand-400"
                : "text-slate-500 hover:text-brand-500 dark:text-slate-400 dark:hover:text-brand-400"
            )}
          >
            {moreActive && (
              <motion.span
                layoutId="w2w-bottom-nav-pill"
                transition={
                  reduce
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 320, damping: 28 }
                }
                className="absolute inset-0 rounded-2xl bg-brand-500/10 ring-1 ring-brand-400/30"
                aria-hidden
              />
            )}
            <motion.span
              whileTap={reduce ? undefined : { scale: 0.85 }}
              className="relative"
            >
              <Ellipsis className="h-5 w-5" />
            </motion.span>
            <span className="relative">More</span>
          </button>
        </div>
      </motion.nav>
    </>
  );
}
