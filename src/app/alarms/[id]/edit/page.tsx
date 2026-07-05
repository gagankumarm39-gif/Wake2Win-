import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AlarmForm } from "@/components/alarms/alarm-form";
import type { Alarm } from "@/types";

export const metadata = { title: "Edit alarm" };

export default async function EditAlarmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: alarm } = await supabase.from("alarms").select("*").eq("id", id).single<Alarm>();
  if (!alarm) redirect("/alarms");

  return (
    <main className="min-h-dvh flex flex-col items-center px-6 py-10 bg-gradient-to-b from-white via-brand-50 to-white dark:from-[#0b0f1a] dark:via-[#131a2e] dark:to-[#0b0f1a]">
      <div className="w-full max-w-lg">
        <Link href="/alarms" className="text-sm text-slate-500 hover:text-brand-500">← Alarms</Link>
        <h1 className="mt-1 mb-6 text-3xl font-extrabold">Edit alarm</h1>
        <AlarmForm initial={alarm} />
      </div>
    </main>
  );
}
