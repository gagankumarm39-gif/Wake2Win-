import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RingChallenge } from "@/components/alarms/ring-challenge";
import type { Alarm, Exam } from "@/types";

export const metadata = { title: "Alarm ringing" };

export default async function RingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: alarm }, { data: profile }] = await Promise.all([
    supabase.from("alarms").select("*").eq("id", id).single<Alarm>(),
    supabase.from("profiles").select("exam").eq("id", user.id).single<{ exam: Exam | null }>(),
  ]);

  if (!alarm) redirect("/alarms");

  return <RingChallenge alarm={alarm} exam={profile?.exam ?? "BOARDS"} />;
}
