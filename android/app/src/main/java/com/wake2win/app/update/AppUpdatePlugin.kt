package com.wake2win.app.update

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.content.FileProvider
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * In-app APK update engine (GitHub Releases distribution, no Play Store).
 *
 * JS side: src/lib/native/update-plugin.ts. Downloads the release APK to the
 * app cache, streams "downloadProgress" events to the WebView, then hands the
 * file to the Android package installer via the app FileProvider.
 */
@CapacitorPlugin(name = "AppUpdate")
class AppUpdatePlugin : Plugin() {

    companion object {
        private const val TAG = "Wake2WinUpdate"
        private const val APK_NAME = "wake2win-update.apk"
    }

    private val executor = Executors.newSingleThreadExecutor()
    private val downloading = AtomicBoolean(false)

    /** True when the app may launch the package installer (Android 8+ gate). */
    @PluginMethod
    fun canInstallPackages(call: PluginCall) {
        val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.packageManager.canRequestPackageInstalls()
        } else {
            true
        }
        val res = JSObject()
        res.put("granted", granted)
        call.resolve(res)
    }

    /** Opens the system "Install unknown apps" screen for this app. */
    @PluginMethod
    fun openInstallSettings(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                val i = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                    data = Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(i)
            } catch (e: Exception) {
                Log.e(TAG, "Could not open install settings: ${e.message}", e)
                call.reject("Could not open install settings")
                return
            }
        }
        call.resolve()
    }

    /**
     * Downloads the APK at `url` (follows GitHub's asset redirects) and starts
     * the package installer. Progress is delivered via "downloadProgress"
     * events: { downloadedBytes, totalBytes, progress }.
     */
    @PluginMethod
    fun downloadAndInstall(call: PluginCall) {
        val url = call.getString("url") ?: run {
            call.reject("Missing APK url")
            return
        }
        if (!downloading.compareAndSet(false, true)) {
            call.reject("A download is already in progress")
            return
        }

        executor.execute {
            try {
                val apk = download(url)
                launchInstaller(apk)
                val res = JSObject()
                res.put("installed", true)
                call.resolve(res)
            } catch (e: Exception) {
                Log.e(TAG, "Update download failed: ${e.message}", e)
                call.reject(e.message ?: "Download failed")
            } finally {
                downloading.set(false)
            }
        }
    }

    private fun download(url: String): File {
        var current = url
        var conn: HttpURLConnection? = null

        // Follow up to 5 redirects manually — GitHub asset downloads redirect
        // cross-host to objects.githubusercontent.com.
        for (hop in 0 until 5) {
            conn = (URL(current).openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = false
                connectTimeout = 20_000
                readTimeout = 30_000
                setRequestProperty("Accept", "application/octet-stream")
            }
            val code = conn.responseCode
            if (code in 301..308) {
                val next = conn.getHeaderField("Location")
                    ?: throw IllegalStateException("Redirect without Location header")
                conn.disconnect()
                current = next
                conn = null
                continue
            }
            if (code != 200) throw IllegalStateException("Download failed with HTTP $code")
            break
        }
        val c = conn ?: throw IllegalStateException("Too many redirects")

        val total = c.contentLengthLong
        val out = File(context.cacheDir, APK_NAME)
        var downloaded = 0L
        var lastEmit = 0L

        c.inputStream.use { input ->
            FileOutputStream(out).use { fos ->
                val buf = ByteArray(64 * 1024)
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    fos.write(buf, 0, n)
                    downloaded += n
                    // Throttle progress events to ~every 128 KB.
                    if (downloaded - lastEmit >= 128 * 1024 || downloaded == total) {
                        lastEmit = downloaded
                        emitProgress(downloaded, total)
                    }
                }
            }
        }
        c.disconnect()
        emitProgress(downloaded, if (total > 0) total else downloaded)
        Log.i(TAG, "APK downloaded ($downloaded bytes) to ${out.absolutePath}")
        return out
    }

    private fun emitProgress(downloaded: Long, total: Long) {
        val data = JSObject()
        data.put("downloadedBytes", downloaded)
        data.put("totalBytes", total)
        data.put("progress", if (total > 0) (downloaded * 100 / total).toInt() else 0)
        notifyListeners("downloadProgress", data)
    }

    private fun launchInstaller(apk: File) {
        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            apk,
        )
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        Log.i(TAG, "Package installer launched for ${apk.name}")
    }
}
