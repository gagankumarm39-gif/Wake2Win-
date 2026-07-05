export default function OfflinePage() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
      <div className="glass p-8 max-w-sm">
        <h1 className="text-2xl font-bold">You are offline</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Your timers and alarms keep working. AI questions will use the built-in
          question bank until you are back online.
        </p>
      </div>
    </main>
  );
}
