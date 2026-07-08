import Link from "next/link";

export const metadata = { title: "Download Android App" };

/* Update these three constants when publishing a new APK release. */
const APP_VERSION = "1.0.0";
const APK_SIZE = "≈ 6 MB";
const APK_URL = "https://github.com/gagankumarm39-gif/Wake2Win-/releases/download/v1.0.0/app-debug.apk";

const REQUIREMENTS = [
  "Android 6.0 (API 23) or newer",
  "About 50 MB of free storage",
  "Active internet connection (content streams from the live app)",
  "Notifications permission — optional, for alarms and reminders",
] as const;

const STEPS = [
  { title: "Download the APK", body: "Tap the Download APK button above. Your browser saves the file to your Downloads folder." },
  { title: "Allow installs from your browser", body: "When prompted, open Settings → Install unknown apps and allow your browser to install apps. This appears only the first time." },
  { title: "Install Wake2Win", body: "Open the downloaded wake2win.apk file and tap Install." },
  { title: "Grant notifications", body: "On first launch, allow notifications so alarms and study reminders can ring reliably." },
  { title: "Sign in and study", body: "Log in with your existing account — all your alarms, notes, tests, XP and streaks are already there." },
] as const;

const FACTS = [
  { label: "Version", value: APP_VERSION },
  { label: "APK size", value: APK_SIZE },
  { label: "Requires", value: "Android 6.0+" },
  { label: "Updates", value: "Automatic (live app)" },
] as const;

/** Public page — intentionally not in the middleware's protected prefixes. */
export default function DownloadPage() {
  return (
    <main className="min-h-dvh px-6 py-10 bg-gradient-to-b from-white via-brand-50 to-white dark:from-[#0b0f1a] dark:via-[#131a2e] dark:to-[#0b0f1a]">
      <div className="mx-auto max-w-3xl">
        <Link href="/dashboard" className="text-sm text-slate-500 hover:text-brand-500">
          ← Dashboard
        </Link>
        <h1 className="mt-1 text-3xl font-extrabold">📲 Wake2Win for Android</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          The full Wake2Win experience — alarms, AI assistant, notes, tests and streaks — as a
          native Android app.
        </p>

        {/* Hero */}
        <div className="glass mt-8 p-8 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 via-brand-400 to-cyan-400 text-3xl shadow-lg shadow-brand-500/40">
            🌅
          </span>
          <h2 className="mt-4 text-xl font-extrabold">Wake2Win</h2>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Version {APP_VERSION} · {APK_SIZE}
          </p>
          <a
            href={APK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-400 px-8 text-sm font-semibold text-white shadow-lg shadow-brand-500/35 transition-shadow hover:shadow-brand-500/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
          >
            ⬇️ Download APK
          </a>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Served from the project’s latest release. Not on the Play Store.
          </p>
        </div>

        {/* Facts */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {FACTS.map((f) => (
            <div key={f.label} className="glass p-4 text-center">
              <p className="text-sm font-extrabold">{f.value}</p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                {f.label}
              </p>
            </div>
          ))}
        </div>

        {/* Requirements */}
        <section className="glass mt-6 p-6" aria-labelledby="requirements-heading">
          <h2 id="requirements-heading" className="text-sm font-bold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">
            Android requirements
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
            {REQUIREMENTS.map((r) => (
              <li key={r} className="flex items-start gap-2">
                <span aria-hidden className="mt-0.5 text-emerald-500">✓</span>
                {r}
              </li>
            ))}
          </ul>
        </section>

        {/* Installation guide */}
        <section className="glass mt-6 p-6" aria-labelledby="install-heading">
          <h2 id="install-heading" className="text-sm font-bold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">
            Installation guide
          </h2>
          <ol className="mt-4 space-y-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-xs font-bold text-brand-500 ring-1 ring-brand-400/30 dark:text-brand-400">
                  {i + 1}
                </span>
                <span>
                  <span className="block text-sm font-semibold">{s.title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    {s.body}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
            ⚠️ Android warns about apps installed outside the Play Store. The APK is built directly
            from this project’s source — verify you downloaded it from the official release link
            above.
          </p>
        </section>
      </div>
    </main>
  );
}
