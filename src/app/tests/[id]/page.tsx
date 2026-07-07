import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TestScreen } from "@/components/tests/test-screen";
import type { TestRecord } from "@/types/ai-studio";

export const metadata = { title: "AI Test" };
export const dynamic = "force-dynamic";

/** One test: take it (ready/in_progress) or review results (completed). */
export default async function TestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/tests");

  const { data: test } = await supabase
    .from("ai_tests")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single<TestRecord>();
  if (!test) redirect("/tests");

  return <TestScreen initial={test} />;
}
