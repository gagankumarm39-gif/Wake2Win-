import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NcertScanner } from "@/components/scanner/ncert-scanner";

export const metadata = { title: "NCERT Scanner — Wake2Win" };
export const dynamic = "force-dynamic";

export default async function ScannerPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/scanner");

  return (
    <main className="min-h-dvh bg-gradient-to-b from-white via-brand-50 to-white px-4 py-10 sm:px-6 dark:from-[#0b0f1a] dark:via-[#131a2e] dark:to-[#0b0f1a]">
      <div className="mx-auto max-w-3xl">
        <Link href="/dashboard" className="text-sm text-slate-500 hover:text-brand-500">
          ← Dashboard
        </Link>
        <h1 className="mt-1 text-3xl font-extrabold">NCERT Scanner 📸</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Snap an NCERT page, question paper, handwritten doubt or diagram — get NEET-level
          solutions for every question in it.
        </p>
        <NcertScanner />
      </div>
    </main>
  );
}
