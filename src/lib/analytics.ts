/** Pure, testable aggregation helpers for the analytics dashboard. */

export interface PomodoroRow {
  focus_minutes: number;
  started_at: string;
  completed: boolean;
}

export interface AlarmEventRow {
  status: string;
  fired_at: string;
  app_switches: number;
  suspicious: boolean;
}

export interface AttemptRow {
  correct: boolean;
  time_taken_seconds: number | null;
  created_at: string;
}

const DAY_MS = 86_400_000;

export const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** Minutes studied per day for the last `days` days (oldest first). */
export function dailyStudyMinutes(
  rows: PomodoroRow[],
  days = 14,
  today = new Date()
): { day: string; label: string; minutes: number }[] {
  const byDay = new Map<string, number>();
  for (const r of rows) {
    if (!r.completed) continue;
    const k = r.started_at.slice(0, 10);
    byDay.set(k, (byDay.get(k) ?? 0) + r.focus_minutes);
  }
  const out: { day: string; label: string; minutes: number }[] = [];
  const end = Date.parse(dayKey(today));
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end - i * DAY_MS);
    const k = dayKey(d);
    out.push({
      day: k,
      label: d.toLocaleDateString("en", { day: "numeric", month: "short" }),
      minutes: byDay.get(k) ?? 0,
    });
  }
  return out;
}

/** Total completed focus minutes within the last `sinceDays` days. */
export function totalMinutesSince(rows: PomodoroRow[], sinceDays: number, today = new Date()): number {
  const cutoff = today.getTime() - sinceDays * DAY_MS;
  return rows
    .filter((r) => r.completed && Date.parse(r.started_at) >= cutoff)
    .reduce((sum, r) => sum + r.focus_minutes, 0);
}

/** Wake-up success rate and alarm completion % (0–100). */
export function alarmStats(events: AlarmEventRow[]): {
  successRate: number;
  completionRate: number;
  totalAppSwitches: number;
  suspiciousCount: number;
} {
  const total = events.length;
  const dismissed = events.filter((e) => e.status === "dismissed").length;
  const nonSnoozed = events.filter((e) => e.status !== "snoozed").length;
  return {
    successRate: total ? Math.round((dismissed / total) * 100) : 0,
    completionRate: nonSnoozed ? Math.round((dismissed / nonSnoozed) * 100) : 0,
    totalAppSwitches: events.reduce((s, e) => s + (e.app_switches ?? 0), 0),
    suspiciousCount: events.filter((e) => e.suspicious).length,
  };
}

/** Question accuracy % and average solving time in seconds. */
export function attemptStats(rows: AttemptRow[]): {
  total: number;
  correct: number;
  accuracy: number;
  avgSeconds: number | null;
} {
  const total = rows.length;
  const correct = rows.filter((r) => r.correct).length;
  const timed = rows.filter((r) => r.time_taken_seconds !== null);
  const avg = timed.length
    ? timed.reduce((s, r) => s + Number(r.time_taken_seconds), 0) / timed.length
    : null;
  return {
    total,
    correct,
    accuracy: total ? Math.round((correct / total) * 100) : 0,
    avgSeconds: avg === null ? null : Math.round(avg * 10) / 10,
  };
}

/**
 * Current and longest streak from a list of active-day keys (YYYY-MM-DD).
 * A day counts as active when the student completed a focus session or
 * dismissed an alarm. Today not yet active does not break the streak.
 */
export function computeStreaks(dayKeys: string[], today = new Date()): { current: number; longest: number } {
  const unique = [...new Set(dayKeys)].sort();

  let longest = 0;
  let run = 0;
  let prev: number | null = null;
  for (const k of unique) {
    const t = Date.parse(k);
    run = prev !== null && t - prev === DAY_MS ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = t;
  }

  const set = new Set(unique);
  let cursor = Date.parse(dayKey(today));
  if (!set.has(dayKey(today))) cursor -= DAY_MS;
  let current = 0;
  while (set.has(dayKey(new Date(cursor)))) {
    current += 1;
    cursor -= DAY_MS;
  }
  return { current, longest };
}

export function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
