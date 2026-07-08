# Wake2Win — Android APK Build Guide (Capacitor)

Wake2Win ships as a native Android shell built with [Capacitor](https://capacitorjs.com).
The shell loads the production deployment (`https://wake2-win.vercel.app`), so the APK
always runs the latest release — no store updates needed. **No web code changes are
required**: auth, Supabase, AI and navigation work exactly as on the web.

- **App name:** Wake2Win
- **App ID:** `com.wake2win.app`
- **Config:** [`capacitor.config.ts`](./capacitor.config.ts)

---

## Prerequisites

| Tool | Version |
| --- | --- |
| Node.js | 20+ |
| Android Studio | Ladybug or newer (bundled SDK + emulator) |
| JDK | 17 (bundled with Android Studio) |

---

## 1. Install dependencies

```bash
npm install
```

This installs `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`,
`@capacitor/splash-screen`, `@capacitor/status-bar` and `@capacitor/assets`
(already declared in `package.json`).

## 2. Add the Android platform

```bash
npx cap add android
```

Generates the native `android/` project from `capacitor.config.ts`.
Commit the `android/` directory — it is part of the repo from now on.

## 3. Permissions

Open `android/app/src/main/AndroidManifest.xml`.

`INTERNET` is included by Capacitor's template by default. Add the notifications
permission (required on Android 13+) next to it:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

## 4. Icons, adaptive icons & splash screen

Create a `resources/` folder in the project root with two source images:

| File | Size | Purpose |
| --- | --- | --- |
| `resources/icon.png` | 1024×1024 | Launcher icon (also used to derive adaptive layers) |
| `resources/splash.png` | 2732×2732 | Splash screen (dark `#0b0f1a` background recommended) |

Optional explicit adaptive-icon layers:

| File | Size | Purpose |
| --- | --- | --- |
| `resources/icon-foreground.png` | 1024×1024 | Adaptive icon foreground (logo with padding) |
| `resources/icon-background.png` | 1024×1024 | Adaptive icon background (solid `#0b0f1a`) |

Then generate every Android density automatically:

```bash
npm run cap:assets
# equivalent to: npx @capacitor/assets generate --android
```

This writes `mipmap-*` launcher icons, `ic_launcher_foreground` /
`ic_launcher_background` adaptive layers, and all `splash` drawables.
Splash behavior (duration, color, immersive mode) and the status bar
(dark style, `#0b0f1a`) are configured in `capacitor.config.ts`.

## 5. Sync web config into the native project

```bash
npx cap sync
# or: npm run cap:sync
```

Run this again after every change to `capacitor.config.ts` or plugin versions.

## 6. Open in Android Studio

```bash
npx cap open android
# or: npm run cap:open
```

Run on an emulator or device with the ▶ button to verify:
splash → status bar (dark, `#0b0f1a`) → app loads `https://wake2-win.vercel.app`.

## 7. Build the APK

**Debug (quick test):**

```bash
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

**Release (production):**

1. In Android Studio: **Build → Generate Signed App Bundle / APK → APK**.
2. Create (once) a keystore and keep it safe — losing it means you cannot
   update the app in place.
3. Select the `release` variant → Finish.
   → `android/app/build/outputs/apk/release/app-release.apk`

Or on the command line after configuring `signingConfigs` in
`android/app/build.gradle`:

```bash
cd android && ./gradlew assembleRelease
```

## 8. Publish

1. Rename the artifact to `wake2win-v<version>.apk`.
2. Create a GitLab release and attach the APK:
   **Project → Deploy → Releases → New release**.
3. The in-app **/download** page links to the latest release permalink
   automatically. Update `APP_VERSION` and `APK_SIZE` in
   `src/app/download/page.tsx` to match the new build.

---

## Troubleshooting

- **White screen on launch** — the device has no internet; the shell needs
  connectivity to load the production site.
- **`cap sync` fails** — delete `android/` and re-run `npx cap add android`
  (config is fully regenerated from `capacitor.config.ts`).
- **Old icon still showing** — uninstall the previous build; Android caches
  launcher icons aggressively.
