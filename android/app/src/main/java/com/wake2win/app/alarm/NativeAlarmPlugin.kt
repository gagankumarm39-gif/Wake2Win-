package com.wake2win.app.alarm

import android.Manifest
import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.content.ContextCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * Capacitor bridge between the React app and the native alarm engine.
 *
 * Registered in MainActivity via `registerPlugin(NativeAlarmPlugin::class.java)`.
 * On the JS side it is reached with `registerPlugin('NativeAlarm')`.
 */
@CapacitorPlugin(
    name = "NativeAlarm",
    permissions = [
        Permission(alias = "notifications", strings = [Manifest.permission.POST_NOTIFICATIONS]),
    ],
)
class NativeAlarmPlugin : Plugin() {

    private var awaitingExactAlarmPermission = false

    /** Map a JS payload to an [AlarmData]. Missing fields fall back to sane defaults. */
    private fun parse(call: PluginCall): AlarmData? {
        val id = call.getString("id") ?: run {
            call.reject("Missing alarm id")
            return null
        }
        val daysJson = call.getArray("repeatDays", JSArray()) ?: JSArray()
        val days = ArrayList<Int>()
        for (i in 0 until daysJson.length()) days.add(daysJson.getInt(i))

        return AlarmData(
            id = id,
            name = call.getString("name") ?: "Wake up!",
            time = call.getString("time") ?: "06:00",
            repeatDays = days,
            sound = call.getString("sound") ?: "classic",
            volume = call.getInt("volume") ?: 80,
            vibration = call.getBoolean("vibration") ?: true,
            active = call.getBoolean("active") ?: true,
        )
    }

    @PluginMethod
    fun scheduleAlarm(call: PluginCall) {
        val alarm = parse(call) ?: return
        AlarmScheduler.schedule(context, alarm)
        Log.i(
            AlarmConstants.TAG,
            "Capacitor scheduleAlarm invoked for ${alarm.id}; exact=${canScheduleExact()} " +
                "notifications=${notificationsGranted()}",
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !notificationsGranted()) {
            requestPermissionForAlias("notifications", call, "notificationPermissionCallback")
            return
        }

        resolveScheduled(call)
    }

    @PermissionCallback
    fun notificationPermissionCallback(call: PluginCall) {
        val granted = notificationsGranted()
        Log.i(AlarmConstants.TAG, "POST_NOTIFICATIONS permission result granted=$granted")
        resolveScheduled(call)
    }

    private fun resolveScheduled(call: PluginCall) {
        val res = JSObject()
        res.put("scheduled", true)
        res.put("id", call.getString("id"))
        res.put("permissionRequired", !canScheduleExact())
        res.put("notificationsGranted", notificationsGranted())
        call.resolve(res)
    }

    @PluginMethod
    fun updateAlarm(call: PluginCall) {
        val alarm = parse(call) ?: return
        AlarmScheduler.cancel(context, alarm.id)
        AlarmScheduler.schedule(context, alarm)
        val res = JSObject()
        res.put("updated", true)
        res.put("id", alarm.id)
        call.resolve(res)
    }

    @PluginMethod
    fun cancelAlarm(call: PluginCall) {
        val id = call.getString("id") ?: run {
            call.reject("Missing alarm id")
            return
        }
        AlarmScheduler.cancel(context, id)
        AlarmStore.remove(context, id)
        val res = JSObject()
        res.put("cancelled", true)
        res.put("id", id)
        call.resolve(res)
    }

    @PluginMethod
    fun getScheduledAlarms(call: PluginCall) {
        val arr = JSArray()
        AlarmStore.all(context).forEach { arr.put(JSObject(it.toJson().toString())) }
        val res = JSObject()
        res.put("alarms", arr)
        call.resolve(res)
    }

    @PluginMethod
    fun dismissAlarm(call: PluginCall) {
        AlarmForegroundService.stop(context)
        call.resolve()
    }

    /** Opens the system "Alarms & reminders" screen so the user can grant exact-alarm. */
    @PluginMethod
    fun requestExactAlarmPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !canScheduleExact()) {
            awaitingExactAlarmPermission = true
            val i = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                data = Uri.parse("package:${context.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            try {
                context.startActivity(i)
                Log.i(AlarmConstants.TAG, "Opened exact-alarm settings for ${context.packageName}")
            } catch (e: Exception) {
                awaitingExactAlarmPermission = false
                Log.e(AlarmConstants.TAG, "Could not open exact-alarm settings: ${e.message}", e)
            }
        }
        val res = JSObject()
        res.put("granted", canScheduleExact())
        call.resolve(res)
    }

    override fun handleOnResume() {
        super.handleOnResume()
        if (!awaitingExactAlarmPermission) return

        awaitingExactAlarmPermission = false
        val granted = canScheduleExact()
        Log.i(AlarmConstants.TAG, "Returned from exact-alarm settings; granted=$granted")
        if (granted) rearmExactAlarms()
    }

    private fun rearmExactAlarms() {
        val alarms = AlarmStore.all(context).filter { it.active }
        Log.i(AlarmConstants.TAG, "Re-arming ${alarms.size} alarms after exact-alarm access grant")
        alarms.forEach { AlarmScheduler.arm(context, it) }
    }

    @PluginMethod
    fun canScheduleExactAlarms(call: PluginCall) {
        val res = JSObject()
        res.put("granted", canScheduleExact())
        call.resolve(res)
    }

    private fun canScheduleExact(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        return am.canScheduleExactAlarms()
    }

    private fun notificationsGranted(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED
}
