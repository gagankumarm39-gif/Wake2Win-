package com.wake2win.app.alarm

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * A single scheduled alarm as the native layer understands it.
 *
 * This mirrors just the fields the native alarm engine needs to ring and to
 * open the correct challenge page. The full alarm (subject/chapter/difficulty/
 * question_count) still lives in Supabase and is re-fetched by the React
 * challenge page via [id]; the native side only needs enough to fire on time
 * and open `/alarms/ring/{id}`.
 */
data class AlarmData(
    val id: String,
    val name: String,
    /** "HH:mm" 24h local time. */
    val time: String,
    /** 0=Sun … 6=Sat. Empty = fires once at the next occurrence of [time]. */
    val repeatDays: List<Int>,
    val sound: String,
    val volume: Int,
    val vibration: Boolean,
    val active: Boolean = true,
) {
    val isRepeating: Boolean get() = repeatDays.isNotEmpty()

    fun toJson(): JSONObject = JSONObject().apply {
        put("id", id)
        put("name", name)
        put("time", time)
        put("repeatDays", JSONArray(repeatDays))
        put("sound", sound)
        put("volume", volume)
        put("vibration", vibration)
        put("active", active)
    }

    companion object {
        fun fromJson(o: JSONObject): AlarmData {
            val daysArr = o.optJSONArray("repeatDays") ?: JSONArray()
            val days = ArrayList<Int>(daysArr.length())
            for (i in 0 until daysArr.length()) days.add(daysArr.getInt(i))
            return AlarmData(
                id = o.getString("id"),
                name = o.optString("name", "Wake up!"),
                time = o.optString("time", "06:00"),
                repeatDays = days,
                sound = o.optString("sound", "classic"),
                volume = o.optInt("volume", 80),
                vibration = o.optBoolean("vibration", true),
                active = o.optBoolean("active", true),
            )
        }
    }
}

/**
 * SharedPreferences-backed persistence for scheduled alarms.
 *
 * Used by [NativeAlarmPlugin.getScheduledAlarms] and by [BootReceiver] to
 * restore alarms after a device reboot. Persistence is required because
 * `AlarmManager` registrations are cleared on reboot.
 */
object AlarmStore {
    private const val PREFS = "wake2win_alarms"
    private const val KEY = "alarms"

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    @Synchronized
    fun all(context: Context): List<AlarmData> {
        val raw = prefs(context).getString(KEY, "[]") ?: "[]"
        return try {
            val arr = JSONArray(raw)
            (0 until arr.length()).map { AlarmData.fromJson(arr.getJSONObject(it)) }
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun get(context: Context, id: String): AlarmData? = all(context).firstOrNull { it.id == id }

    @Synchronized
    fun put(context: Context, alarm: AlarmData) {
        val list = all(context).filter { it.id != alarm.id } + alarm
        save(context, list)
    }

    @Synchronized
    fun remove(context: Context, id: String) {
        save(context, all(context).filter { it.id != id })
    }

    private fun save(context: Context, list: List<AlarmData>) {
        val arr = JSONArray()
        list.forEach { arr.put(it.toJson()) }
        prefs(context).edit().putString(KEY, arr.toString()).apply()
    }
}
