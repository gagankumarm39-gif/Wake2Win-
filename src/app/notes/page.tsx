import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NotesStudio } from "@/components/notes/notes-studio";
import type { NoteRecord } from "@/types/ai-studio";

export const metadata = { title: "AI Notes Studio" };
export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/notes");

  // Saved-notes list only needs metadata; content loads on open.
  const { data: notes } = await supabase
    .from("ai_notes")
    .select("id, title, exam, exam_name, subject, chapter, language, length, focus, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <main className="min-h-dvh px-4 py-10 sm:px-6 bg-gradient-to-b from-white via-brand-50 to-white dark:from-[#0b0f1a] dark:via-[#131a2e] dark:to-[#0b0f1a]">
      <div className="mx-auto max-w-5xl">
        <Link href="/dashboard" className="text-sm text-slate-500 hover:text-brand-500">← Dashboard</Link>
        <h1 className="mt-1 text-3xl font-extrabold">AI Notes Studio</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Chapter-wise revision notes with formulas, mnemonics, flashcards and last-minute sheets — in English, ಕನ್ನಡ or हिंदी.
        </p>
        <div className="mt-8">
          <NotesStudio savedInitial={(notes ?? []) as Partial<NoteRecord>[] as NoteRecord[]} />
        </div>
      </div>
    </main>
  );
}
