package com.wake2win.app.alarm

import android.annotation.SuppressLint
import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * Full-screen, over-the-lock-screen host for the wake-up challenge.
 *
 * We intentionally do NOT re-implement the challenge UI natively — we load the
 * existing React page `${BASE_URL}/alarms/ring/{id}?native=1` in a WebView. The
 * Supabase session cookie is shared app-wide via [CookieManager], so the page
 * loads authenticated exactly as it does inside the main app.
 *
 * The activity stays up (screen on, keyguard dismissed, back disabled) until the
 * challenge signals completion — either explicitly via the `AndroidAlarm` JS
 * bridge, or implicitly when React navigates away from `/alarms/ring/` after a
 * correct solve (URL-interception fallback).
 */
class AlarmActivity : Activity() {

    private lateinit var webView: WebView
    private var alarmId: String = ""
    private var dismissed = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        showWhenLockedAndTurnScreenOn()

        alarmId = intent.getStringExtra(AlarmConstants.EXTRA_ALARM_ID) ?: ""
        // Snooze re-fires use an id suffixed with "#snooze"; the challenge page
        // still needs the real Supabase alarm id.
        val challengeId = alarmId.substringBefore("#snooze")

        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            setBackgroundColor(Color.parseColor("#0b0f1a"))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            addJavascriptInterface(AlarmBridge(), "AndroidAlarm")
            webViewClient = object : WebViewClient() {
                override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                    super.onPageStarted(view, url, favicon)
                    // Fallback: once React routes off the ring page (solve/snooze
                    // → /dashboard), treat the alarm as handled.
                    if (url != null && !url.contains("/alarms/ring/")) {
                        finishChallenge()
                    }
                }
            }
        }
        setContentView(webView)

        // Share cookies (Supabase session) into this WebView.
        CookieManager.getInstance().setAcceptCookie(true)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
        }

        val url = "${AlarmConstants.BASE_URL}/alarms/ring/$challengeId?native=1"
        Log.i(AlarmConstants.TAG, "AlarmActivity loading $url")
        webView.loadUrl(url)
    }

    private fun showWhenLockedAndTurnScreenOn() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            (getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager)
                .requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD,
            )
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    /** Stop the ringing service and close the challenge. Idempotent. */
    private fun finishChallenge() {
        if (dismissed) return
        dismissed = true
        AlarmForegroundService.stop(this)
        finish()
    }

    /** JS bridge exposed to the React challenge as `window.AndroidAlarm`. */
    inner class AlarmBridge {
        @JavascriptInterface
        fun dismiss() {
            runOnUiThread { finishChallenge() }
        }

        @JavascriptInterface
        fun snooze(minutes: Int) {
            runOnUiThread {
                AlarmScheduler.snooze(this@AlarmActivity, alarmId.substringBefore("#snooze"), minutes)
                finishChallenge()
            }
        }
    }

    // Prevent escaping the challenge with the back button.
    @Suppress("OVERRIDE_DEPRECATION", "MissingSuperCall")
    override fun onBackPressed() { /* no-op: must solve to dismiss */ }

    override fun onDestroy() {
        try {
            (webView.parent as? ViewGroup)?.removeView(webView)
            webView.removeJavascriptInterface("AndroidAlarm")
            webView.destroy()
        } catch (_: Exception) {}
        super.onDestroy()
    }
}
