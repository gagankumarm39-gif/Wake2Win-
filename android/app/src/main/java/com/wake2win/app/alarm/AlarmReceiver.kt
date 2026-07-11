package com.wake2win.app.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * Fires when an `AlarmManager` alarm goes off. Runs even when the app is closed
 * or the device is idle (armed with `setExactAndAllowWhileIdle`).
 *
 * Responsibilities:
 *  1. Start [AlarmForegroundService] to actually ring (sound + vibration + the
 *     full-screen lock-screen challenge).
 *  2. Re-arm the next occurrence for repeating/daily alarms.
 */
class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(AlarmConstants.EXTRA_ALARM_ID) ?: return
        Log.i(AlarmConstants.TAG, "AlarmReceiver fired for $id")

        // Start the ringing service (foreground, so it survives the app being killed).
        val serviceIntent = Intent(context, AlarmForegroundService::class.java).apply {
            putExtra(AlarmConstants.EXTRA_ALARM_ID, id)
            putExtra(AlarmConstants.EXTRA_NAME, intent.getStringExtra(AlarmConstants.EXTRA_NAME))
            putExtra(AlarmConstants.EXTRA_SOUND, intent.getStringExtra(AlarmConstants.EXTRA_SOUND))
            putExtra(AlarmConstants.EXTRA_VOLUME, intent.getIntExtra(AlarmConstants.EXTRA_VOLUME, 80))
            putExtra(AlarmConstants.EXTRA_VIBRATION, intent.getBooleanExtra(AlarmConstants.EXTRA_VIBRATION, true))
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(context, serviceIntent)
        } else {
            context.startService(serviceIntent)
        }

        // Re-arm the next occurrence (repeating) or drop the record (one-shot).
        AlarmStore.get(context, id)?.let { AlarmScheduler.scheduleNext(context, it) }
    }
}
