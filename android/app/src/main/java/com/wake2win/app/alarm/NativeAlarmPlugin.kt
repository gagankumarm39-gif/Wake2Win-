package com.wake2win.app.alarm

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Capacitor bridge between the React app and the native alarm engine.
 *
 * Registered in MainActivity via `registerPlugin(NativeAlarmPlugin::class.java)`.
 * On the JS side it is reached with `registerPlugin('NativeAlarm')`.
 */
@CapacitorPlugin(name = "NativeAlarm")
class NativeAlarmPlugin : Plugin() {

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
        val res = JSObject()
        res.put("scheduled", alarm.active)
        res.put("id", alarm.id)
        res.put("permissionRequired", !canScheduleExact())
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
            val i = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                data = Uri.parse("package:${context.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            try {
                context.startActivity(i)
            } catch (_: Exception) { /* OEM without this settings screen */ }
        }
        val res = JSObject()
        res.put("granted", canScheduleExact())
        call.resolve(res)
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
}
