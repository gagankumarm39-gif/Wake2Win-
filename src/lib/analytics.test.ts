import { describe, expect, it } from "vitest";
import { alarmStats, attemptStats, computeStreaks, dailyStudyMinutes, totalMinutesSince } from "./analytics";

const TODAY = new Date("2026-07-02T12:00:00Z");

describe("computeStreaks", () => {
  it("counts a current streak ending today", () => {
    const days = ["2026-06-30", "2026-07-01", "2026-07-02"];
    expect(computeStreaks(days, TODAY)).toEqual({ current: 3, longest: 3 });
  });

  it("does not break the streak when today is not yet active", () => {
    const days = ["2026-06-30", "2026-07-01"];
    expect(computeStreaks(days, TODAY).current).toBe(2);
  });

  it("finds the longest historical streak", () => {
    const days = ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-20"];
    const { current, longest } = computeStreaks(days, TODAY);
    expect(longest).toBe(4);
    expect(current).toBe(0);
  });

  it("handles empty input", () => {
    expect(computeStreaks([], TODAY)).toEqual({ current: 0, longest: 0 });
  });
});

describe("dailyStudyMinutes", () => {
  it("buckets completed sessions per day and zero-fills gaps", () => {
    const rows = [
      { focus_minutes: 25, started_at: "2026-07-02T05:00:00Z", completed: true },
      { focus_minutes: 45, started_at: "2026-07-02T09:00:00Z", completed: true },
      { focus_minutes: 60, started_at: "2026-07-01T09:00:00Z", completed: false },
    ];
    const out = dailyStudyMinutes(rows, 3, TODAY);
    expect(out).toHaveLength(3);
    expect(out[2]).toMatchObject({ day: "2026-07-02", minutes: 70 });
    expect(out[1].minutes).toBe(0); // incomplete session ignored
  });
});

describe("totalMinutesSince", () => {
  it("sums only completed sessions inside the window", () => {
    const rows = [
      { focus_minutes: 25, started_at: "2026-07-01T05:00:00Z", completed: true },
      { focus_minutes: 90, started_at: "2026-05-01T05:00:00Z", completed: true },
    ];
    expect(totalMinutesSince(rows, 7, TODAY)).toBe(25);
  });
});

describe("attemptStats", () => {
  it("computes accuracy and average solve time", () => {
    const rows = [
      { correct: true, time_taken_seconds: 10, created_at: "2026-07-02" },
      { correct: false, time_taken_seconds: 20, created_at: "2026-07-02" },
    ];
    const s = attemptStats(rows);
    expect(s.accuracy).toBe(50);
    expect(s.avgSeconds).toBe(15);
  });

  it("is safe on empty input", () => {
    expect(attemptStats([])).toEqual({ total: 0, correct: 0, accuracy: 0, avgSeconds: null });
  });
});

describe("alarmStats", () => {
  it("computes success and completion rates", () => {
    const events = [
      { status: "dismissed", fired_at: "", app_switches: 1, suspicious: false },
      { status: "snoozed", fired_at: "", app_switches: 0, suspicious: false },
      { status: "missed", fired_at: "", app_switches: 4, suspicious: true },
    ];
    const s = alarmStats(events);
    expect(s.successRate).toBe(33);
    expect(s.completionRate).toBe(50);
    expect(s.totalAppSwitches).toBe(5);
    expect(s.suspiciousCount).toBe(1);
  });
});
