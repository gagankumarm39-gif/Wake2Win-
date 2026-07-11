package com.wake2win.app.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Re-arms all stored alarms after the device reboots. `AlarmManager`
 * registrations do not survive a reboot, so without this every alarm would be
 * silently lost until the app is next opened.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED &&
            action != "android.intent.action.QUICKBOOT_POWERON" &&
            action != "com.htc.intent.action.QUICKBOOT_POWERON"
        ) return

        val alarms = AlarmStore.all(context).filter { it.active }
        Log.i(AlarmConstants.TAG, "BootReceiver re-arming ${alarms.size} alarms")
        alarms.forEach { AlarmScheduler.arm(context, it) }
    }
}
