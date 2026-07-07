import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TestWizard } from "@/components/tests/test-wizard";

export const metadata = { title: "New AI Test" };
export const dynamic = "force-dynamic";

export default async function NewTestPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/tests/new");

  return (
    <main className="min-h-dvh px-6 py-10 bg-gradient-to-b from-white via-brand-50 to-white dark:from-[#0b0f1a] dark:via-[#131a2e] dark:to-[#0b0f1a]">
      <div className="mx-auto max-w-3xl">
        <Link href="/tests" className="text-sm text-slate-500 hover:text-brand-500">← AI Tests</Link>
        <h1 className="mt-1 text-3xl font-extrabold">Create a test</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Pick your exam, subjects and chapters — the AI plans a blueprint and writes a fresh paper.
        </p>
        <div className="mt-8">
          <TestWizard />
        </div>
      </div>
    </main>
  );
}
