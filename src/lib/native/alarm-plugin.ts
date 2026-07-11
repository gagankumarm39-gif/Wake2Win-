import { registerPlugin, Capacitor } from "@capacitor/core";
import type { Alarm } from "@/types";

/**
 * Bridge to the native Android alarm engine (see
 * android/app/src/main/java/com/wake2win/app/alarm/NativeAlarmPlugin.kt).
 *
 * On the web (browser / PWA) these calls are no-ops — the existing
 * `AlarmWatcher` remains the fallback. On the Android APK they schedule real
 * `AlarmManager` alarms that ring even when the app is closed or the phone is
 * locked.
 */
export interface NativeAlarmSchedule {
  id: string;
  name: string;
  /** "HH:mm" 24h local. */
  time: string;
  /** 0=Sun … 6=Sat. Empty = fires once. */
  repeatDays: number[];
  sound: string;
  volume: number;
  vibration: boolean;
  active: boolean;
}

export interface NativeAlarmPlugin {
  scheduleAlarm(o: NativeAlarmSchedule): Promise<{ scheduled: boolean; id: string; permissionRequired: boolean }>;
  updateAlarm(o: NativeAlarmSchedule): Promise<{ updated: boolean; id: string }>;
  cancelAlarm(o: { id: string }): Promise<{ cancelled: boolean; id: string }>;
  getScheduledAlarms(): Promise<{ alarms: NativeAlarmSchedule[] }>;
  dismissAlarm(): Promise<void>;
  requestExactAlarmPermission(): Promise<{ granted: boolean }>;
  canScheduleExactAlarms(): Promise<{ granted: boolean }>;
}

export const NativeAlarm = registerPlugin<NativeAlarmPlugin>("NativeAlarm");

/** True only inside the native Android/iOS shell, not the browser. */
export function isNativeAlarm(): boolean {
  return Capacitor.isNativePlatform();
}

/** Map a Supabase alarm row to the native plugin payload. */
export function toNativePayload(alarm: Alarm): NativeAlarmSchedule {
  return {
    id: alarm.id,
    name: alarm.name,
    time: alarm.time.slice(0, 5), // "HH:mm:ss" → "HH:mm"
    repeatDays: alarm.repeat_days ?? [],
    sound: alarm.sound,
    volume: alarm.volume,
    vibration: alarm.vibration,
    active: alarm.is_active,
  };
}

/** Schedule/refresh a native alarm; safe no-op on web, never throws. */
export async function safeSchedule(alarm: Alarm): Promise<void> {
  if (!isNativeAlarm()) return;
  try {
    const payload = toNativePayload(alarm);
    if (payload.active) {
      const res = await NativeAlarm.scheduleAlarm(payload);
      if (res.permissionRequired) {
        // Ask once for the exact-alarm grant (Android 12+); ignored if already held.
        try {
          await NativeAlarm.requestExactAlarmPermission();
        } catch {
          /* OEM without the settings screen — falls back to inexact alarm */
        }
      }
    } else {
      await NativeAlarm.cancelAlarm({ id: payload.id });
    }
  } catch (e) {
    console.warn("[NativeAlarm] schedule failed", e);
  }
}

/** Cancel a native alarm; safe no-op on web, never throws. */
export async function safeCancel(id: string): Promise<void> {
  if (!isNativeAlarm()) return;
  try {
    await NativeAlarm.cancelAlarm({ id });
  } catch (e) {
    console.warn("[NativeAlarm] cancel failed", e);
  }
}
