import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VoiceAssistant } from "@/components/voice/voice-assistant";

export const metadata = { title: "Voice Tutor — Wake2Win" };
export const dynamic = "force-dynamic";

export default async function VoiceAssistantPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/voice-assistant");

  return (
    <main className="min-h-dvh bg-gradient-to-b from-white via-brand-50 to-white px-6 py-10 dark:from-[#0b0f1a] dark:via-[#131a2e] dark:to-[#0b0f1a]">
      <div className="mx-auto flex min-h-[calc(100dvh-5rem)] max-w-2xl flex-col">
        <div>
          <Link href="/dashboard" className="text-sm text-slate-500 hover:text-brand-500">
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-3xl font-extrabold">Voice Tutor 🎙️</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Hold the mic and ask any Biology, Physics or Chemistry doubt out loud.
          </p>
        </div>
        <VoiceAssistant />
      </div>
    </main>
  );
}
