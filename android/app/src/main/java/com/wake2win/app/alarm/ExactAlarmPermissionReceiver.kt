package com.wake2win.app.alarm

import android.app.AlarmManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/** Re-arms persisted alarms when the user grants the Alarms & reminders special access. */
class ExactAlarmPermissionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            intent.action != AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED
        ) return

        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val granted = alarmManager.canScheduleExactAlarms()
        Log.i(AlarmConstants.TAG, "Exact-alarm permission changed; granted=$granted")
        if (!granted) return

        val alarms = AlarmStore.all(context).filter { it.active }
        Log.i(AlarmConstants.TAG, "Re-arming ${alarms.size} alarms after exact-alarm permission grant")
        alarms.forEach { AlarmScheduler.arm(context, it) }
    }
}
