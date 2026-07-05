import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { weakTopics } from "@/lib/weak-topics";
import { AssistantChat } from "@/components/assistant/chat";
import type { Exam } from "@/types";

export const metadata = { title: "AI Assistant" };
export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/assistant");

  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const [{ data: profile }, { data: attempts }] = await Promise.all([
    supabase.from("profiles").select("exam").eq("id", user.id).single(),
    supabase.from("question_attempts").select("subject, chapter, correct").gte("created_at", since),
  ]);

  const topics = weakTopics(attempts ?? []);

  return (
    <main className="min-h-dvh px-6 py-10 bg-gradient-to-b from-white via-brand-50 to-white dark:from-[#0b0f1a] dark:via-[#131a2e] dark:to-[#0b0f1a]">
      <div className="mx-auto flex h-[calc(100dvh-5rem)] max-w-2xl flex-col">
        <header className="pb-4">
          <Link href="/dashboard" className="text-sm text-slate-500 hover:text-brand-500">← Dashboard</Link>
          <h1 className="mt-1 text-3xl font-extrabold">AI Study Assistant</h1>
        </header>
        <AssistantChat exam={(profile?.exam ?? "BOARDS") as Exam} topics={topics} />
      </div>
    </main>
  );
}
