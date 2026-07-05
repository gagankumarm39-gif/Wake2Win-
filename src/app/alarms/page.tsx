import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AlarmCard } from "@/components/alarms/alarm-card";
import type { Alarm } from "@/types";

export const metadata = { title: "Alarms" };

export default async function AlarmsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/alarms");

  const { data: alarms } = await supabase.from("alarms").select("*").order("time");

  return (
    <main className="min-h-dvh px-6 py-10 bg-gradient-to-b from-white via-brand-50 to-white dark:from-[#0b0f1a] dark:via-[#131a2e] dark:to-[#0b0f1a]">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between">
          <div>
            <Link href="/dashboard" className="text-sm text-slate-500 hover:text-brand-500">← Dashboard</Link>
            <h1 className="mt-1 text-3xl font-extrabold">Alarms</h1>
          </div>
          <Link
            href="/alarms/new"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-500 px-5 font-semibold text-white shadow-lg shadow-brand-500/25 hover:bg-brand-600 transition-colors"
          >
            <Plus className="h-4 w-4" /> New alarm
          </Link>
        </header>

        <section className="mt-8 space-y-4">
          {(alarms as Alarm[] | null)?.length ? (
            (alarms as Alarm[]).map((a) => <AlarmCard key={a.id} alarm={a} />)
          ) : (
            <div className="glass p-10 text-center">
              <p className="text-4xl">⏰</p>
              <p className="mt-3 font-semibold">No alarms yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Create your first AI wake-up alarm — it only stops when you solve questions.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
