package com.wake2win.app.alarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * The component that actually makes noise. A foreground service so it keeps
 * running when the app is closed, backgrounded, or swiped from recents.
 *
 * On start it:
 *  - posts a high-importance notification with a **full-screen intent** →
 *    [AlarmActivity] (this is what launches the lock-screen challenge),
 *  - loops the device alarm ringtone at [AudioAttributes.USAGE_ALARM],
 *  - vibrates in a repeating pattern,
 *  - holds a partial wake lock so the CPU keeps ringing under Doze.
 *
 * It stops when [AlarmActivity] reports the challenge solved/snoozed (via the
 * JS bridge) or the plugin calls dismiss.
 */
class AlarmForegroundService : Service() {

    private var mediaPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopRinging()
            return START_NOT_STICKY
        }

        val alarmId = intent?.getStringExtra(AlarmConstants.EXTRA_ALARM_ID) ?: ""
        val name = intent?.getStringExtra(AlarmConstants.EXTRA_NAME) ?: "Wake up!"
        val volume = intent?.getIntExtra(AlarmConstants.EXTRA_VOLUME, 80) ?: 80
        val vibrate = intent?.getBooleanExtra(AlarmConstants.EXTRA_VIBRATION, true) ?: true

        startForegroundWithNotification(alarmId, name)
        acquireWakeLock()
        startSound(volume)
        if (vibrate) startVibration()

        // Also proactively launch the challenge activity (full-screen intent is a
        // fallback the OS may route through the notification shade on some OEMs).
        launchAlarmActivity(alarmId, name)

        return START_STICKY
    }

    private fun startForegroundWithNotification(alarmId: String, name: String) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                AlarmConstants.NOTIF_CHANNEL_ID,
                "Alarms",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Wake2Win wake-up alarms"
                setSound(null, null) // audio handled by MediaPlayer, not the channel
                enableVibration(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            nm.createNotificationChannel(channel)
        }

        val fullScreenIntent = alarmActivityIntent(alarmId, name)
        var piFlags = PendingIntent.FLAG_UPDATE_CURRENT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) piFlags = piFlags or PendingIntent.FLAG_IMMUTABLE
        val fullScreenPi = PendingIntent.getActivity(this, 0, fullScreenIntent, piFlags)

        val notification = NotificationCompat.Builder(this, AlarmConstants.NOTIF_CHANNEL_ID)
            .setContentTitle(name)
            .setContentText("Solve to stop the alarm")
            .setSmallIcon(applicationInfo.icon)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setOngoing(true)
            .setAutoCancel(false)
            .setFullScreenIntent(fullScreenPi, true)
            .setContentIntent(fullScreenPi)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceCompat.startForeground(
                this,
                AlarmConstants.NOTIF_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
            )
        } else {
            startForeground(AlarmConstants.NOTIF_ID, notification)
        }
    }

    private fun alarmActivityIntent(alarmId: String, name: String): Intent =
        Intent(this, AlarmActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(AlarmConstants.EXTRA_ALARM_ID, alarmId)
            putExtra(AlarmConstants.EXTRA_NAME, name)
        }

    private fun launchAlarmActivity(alarmId: String, name: String) {
        try {
            startActivity(alarmActivityIntent(alarmId, name))
        } catch (e: Exception) {
            Log.w(AlarmConstants.TAG, "Could not launch AlarmActivity directly: ${e.message}")
        }
    }

    private fun startSound(volume: Int) {
        try {
            val uri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            mediaPlayer = MediaPlayer().apply {
                setDataSource(this@AlarmForegroundService, uri)
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                isLooping = true
                val v = (volume.coerceIn(1, 100)) / 100f
                setVolume(v, v)
                prepare()
                start()
            }
        } catch (e: Exception) {
            Log.e(AlarmConstants.TAG, "Failed to start alarm sound: ${e.message}")
        }
    }

    private fun startVibration() {
        val v = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
        vibrator = v
        val pattern = longArrayOf(0, 800, 500, 800, 500)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            v.vibrate(VibrationEffect.createWaveform(pattern, 0))
        } else {
            @Suppress("DEPRECATION")
            v.vibrate(pattern, 0)
        }
    }

    private fun acquireWakeLock() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Wake2Win:AlarmWakeLock").apply {
            setReferenceCounted(false)
            acquire(10 * 60 * 1000L) // safety timeout: 10 min
        }
    }

    private fun stopRinging() {
        try {
            mediaPlayer?.apply { if (isPlaying) stop(); release() }
        } catch (_: Exception) {}
        mediaPlayer = null

        vibrator?.cancel()
        vibrator = null

        if (wakeLock?.isHeld == true) wakeLock?.release()
        wakeLock = null

        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        stopRinging()
        super.onDestroy()
    }

    companion object {
        const val ACTION_STOP = "com.wake2win.app.STOP_ALARM"

        /** Stop the ringing service from anywhere (plugin dismiss / activity solved). */
        fun stop(context: Context) {
            val i = Intent(context, AlarmForegroundService::class.java).apply { action = ACTION_STOP }
            try {
                context.startService(i)
            } catch (e: Exception) {
                Log.w(AlarmConstants.TAG, "stop() failed: ${e.message}")
            }
        }
    }
}
