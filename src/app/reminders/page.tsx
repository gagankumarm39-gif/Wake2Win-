import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReminderManager, type Reminder } from "@/components/reminders/reminder-manager";

export const metadata = { title: "Reminders" };
export const dynamic = "force-dynamic";

export default async function RemindersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/reminders");

  const { data: reminders } = await supabase.from("reminders").select("*").order("time");

  return (
    <main className="min-h-dvh px-6 py-10 bg-gradient-to-b from-white via-brand-50 to-white dark:from-[#0b0f1a] dark:via-[#131a2e] dark:to-[#0b0f1a]">
      <div className="mx-auto max-w-2xl">
        <Link href="/dashboard" className="text-sm text-slate-500 hover:text-brand-500">← Dashboard</Link>
        <h1 className="mt-1 text-3xl font-extrabold">Reminders</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Water, stretching, revision, sleep and mock tests — stay on schedule.
        </p>
        <div className="mt-8">
          <ReminderManager initial={(reminders ?? []) as Reminder[]} />
        </div>
      </div>
    </main>
  );
}
