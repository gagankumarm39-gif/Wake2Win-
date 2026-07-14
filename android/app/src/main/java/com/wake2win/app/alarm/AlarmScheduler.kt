package com.wake2win.app.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import java.util.Calendar

/**
 * Shared constants for the native alarm engine (intent extras + ring URL).
 */
object AlarmConstants {
    const val TAG = "NativeAlarm"

    // Base site the thin-shell WebView loads. Must match capacitor.config.ts
    // `server.url`. The lock-screen challenge is served from `${BASE_URL}/alarms/ring/{id}`.
    const val BASE_URL = "https://wake2-win.vercel.app"

    const val EXTRA_ALARM_ID = "alarm_id"
    const val EXTRA_NAME = "alarm_name"
    const val EXTRA_SOUND = "alarm_sound"
    const val EXTRA_VOLUME = "alarm_volume"
    const val EXTRA_VIBRATION = "alarm_vibration"

    const val NOTIF_CHANNEL_ID = "wake2win_alarm"
    const val NOTIF_ID = 4201
}

/**
 * Owns all `AlarmManager` interaction: computing the next trigger time from an
 * alarm's `HH:mm` + repeat days, arming an exact/Doze-proof alarm, cancelling,
 * and re-arming the next occurrence of a repeating alarm after it fires.
 */
object AlarmScheduler {

    /** Stable, deterministic request code so schedule/cancel target the same PendingIntent. */
    private fun requestCode(id: String): Int = id.hashCode()

    private fun intentFor(context: Context, alarm: AlarmData): Intent =
        Intent(context, AlarmReceiver::class.java).apply {
            action = "com.wake2win.app.ALARM_FIRE"
            // Unique data URI so extras aren't collapsed across distinct alarms.
            data = android.net.Uri.parse("wake2win://alarm/${alarm.id}")
            putExtra(AlarmConstants.EXTRA_ALARM_ID, alarm.id)
            putExtra(AlarmConstants.EXTRA_NAME, alarm.name)
            putExtra(AlarmConstants.EXTRA_SOUND, alarm.sound)
            putExtra(AlarmConstants.EXTRA_VOLUME, alarm.volume)
            putExtra(AlarmConstants.EXTRA_VIBRATION, alarm.vibration)
        }

    private fun pendingIntent(context: Context, alarm: AlarmData): PendingIntent {
        var flags = PendingIntent.FLAG_UPDATE_CURRENT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags = flags or PendingIntent.FLAG_IMMUTABLE
        val intent = intentFor(context, alarm)
        Log.i(AlarmConstants.TAG, "Creating alarm PendingIntent id=${alarm.id} requestCode=${requestCode(alarm.id)} action=${intent.action} data=${intent.data}")
        return PendingIntent.getBroadcast(context, requestCode(alarm.id), intent, flags)
    }

    /**
     * Next epoch millis this alarm should fire.
     * - Repeating: the soonest future day-of-week in [AlarmData.repeatDays] at [AlarmData.time].
     * - One-shot: today at [time] if still in the future, else tomorrow.
     */
    fun nextTriggerAt(alarm: AlarmData, now: Calendar = Calendar.getInstance()): Long {
        val parts = alarm.time.split(":")
        val hour = parts.getOrNull(0)?.toIntOrNull() ?: 6
        val minute = parts.getOrNull(1)?.toIntOrNull() ?: 0

        val candidate = (now.clone() as Calendar).apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }

        if (!alarm.isRepeating) {
            if (candidate.timeInMillis <= now.timeInMillis) candidate.add(Calendar.DAY_OF_YEAR, 1)
            return candidate.timeInMillis
        }

        // Calendar.DAY_OF_WEEK: Sunday=1..Saturday=7. Our repeatDays: Sunday=0..Saturday=6.
        for (offset in 0..7) {
            val c = (candidate.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, offset) }
            val dow = c.get(Calendar.DAY_OF_WEEK) - 1 // → 0..6
            if (alarm.repeatDays.contains(dow) && c.timeInMillis > now.timeInMillis) {
                return c.timeInMillis
            }
        }
        // Fallback (shouldn't happen): a week out.
        return candidate.apply { add(Calendar.DAY_OF_YEAR, 7) }.timeInMillis
    }

    /** Persist + arm the alarm. Safe to call repeatedly (idempotent per id). */
    fun schedule(context: Context, alarm: AlarmData) {
        Log.i(AlarmConstants.TAG, "Scheduling alarm id=${alarm.id} active=${alarm.active} time=${alarm.time}")
        AlarmStore.put(context, alarm)
        if (!alarm.active) {
            cancel(context, alarm.id)
            AlarmStore.put(context, alarm) // keep the (inactive) record for the list
            return
        }
        arm(context, alarm)
    }

    /** Arm the AlarmManager entry without touching the store (used on fire/boot re-arm). */
    fun arm(context: Context, alarm: AlarmData) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val triggerAt = nextTriggerAt(alarm)
        val pi = pendingIntent(context, alarm)

        val canScheduleExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
        if (!canScheduleExact) {
            scheduleInexactAllowWhileIdle(am, triggerAt, pi)
            Log.w(
                AlarmConstants.TAG,
                "Exact alarm permission denied; armed inexact allow-while-idle alarm ${alarm.id} at $triggerAt",
            )
            return
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pi)
            }
            Log.i(
                AlarmConstants.TAG,
                "Armed exact alarm ${alarm.id} at $triggerAt (repeating=${alarm.isRepeating})",
            )
        } catch (e: SecurityException) {
            Log.e(AlarmConstants.TAG, "Exact alarm scheduling failed for ${alarm.id}: ${e.message}", e)
            scheduleInexactAllowWhileIdle(am, triggerAt, pi)
        }
    }

    private fun scheduleInexactAllowWhileIdle(am: AlarmManager, triggerAt: Long, pi: PendingIntent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
        } else {
            am.set(AlarmManager.RTC_WAKEUP, triggerAt, pi)
        }
    }

    /** Re-arm the next occurrence of a repeating alarm; no-op for one-shots. */
    fun scheduleNext(context: Context, alarm: AlarmData) {
        if (alarm.isRepeating && alarm.active) arm(context, alarm)
        else AlarmStore.remove(context, alarm.id) // one-shot: consumed after firing
    }

    /**
     * Arm a one-shot alarm at an exact epoch time, reusing an existing alarm's
     * metadata. Used for snooze (re-fire the same challenge N minutes later)
     * without disturbing the alarm's normal recurring schedule.
     */
    fun snooze(context: Context, sourceId: String, minutes: Int) {
        val source = AlarmStore.get(context, sourceId) ?: return
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val triggerAt = System.currentTimeMillis() + minutes.coerceAtLeast(1) * 60_000L
        // Distinct snooze id so it never collides with the recurring registration.
        val snoozeAlarm = source.copy(id = "${source.id}#snooze", repeatDays = emptyList())
        val pi = pendingIntent(context, snoozeAlarm)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pi)
            }
            // Store so the receiver can look it up (and drop it after firing).
            AlarmStore.put(context, snoozeAlarm)
            Log.i(AlarmConstants.TAG, "Snoozed $sourceId for $minutes min")
        } catch (e: SecurityException) {
            Log.e(AlarmConstants.TAG, "Exact snooze scheduling failed for $sourceId: ${e.message}", e)
            scheduleInexactAllowWhileIdle(am, triggerAt, pi)
        }
    }

    fun cancel(context: Context, id: String) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val alarm = AlarmStore.get(context, id) ?: AlarmData(id, "", "06:00", emptyList(), "classic", 80, true)
        am.cancel(pendingIntent(context, alarm))
        Log.i(AlarmConstants.TAG, "Cancelled alarm $id")
    }
}
