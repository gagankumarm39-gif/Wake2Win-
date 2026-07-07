/**
 * AI generation quota (server-only).
 *
 * Free plan: ONE AI test every 24 hours. Premium (future): unlimited.
 * The ledger lives in ai_usage, written only with the service role, so a
 * student deleting a test from history can't reset their quota.
 *
 * All helpers fail-open on infrastructure errors (missing table, network):
 * a broken quota check should never take the feature down.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export const FREE_TEST_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type QuotaKind = "test" | "notes";

export interface QuotaStatus {
  allowed: boolean;
  premium: boolean;
  /** ISO time when the next free generation unlocks (null = now). */
  nextAt: string | null;
}

/** Premium check — future billing writes ai_entitlements; free users have no row. */
export async function isPremium(userId: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("ai_entitlements")
      .select("premium, premium_until")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data?.premium) return false;
    return !data.premium_until || new Date(data.premium_until).getTime() > Date.now();
  } catch {
    return false;
  }
}

/** Can this user generate an AI test right now? */
export async function checkTestQuota(userId: string): Promise<QuotaStatus> {
  if (await isPremium(userId)) return { allowed: true, premium: true, nextAt: null };

  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - FREE_TEST_INTERVAL_MS).toISOString();
    const { data, error } = await admin
      .from("ai_usage")
      .select("created_at")
      .eq("user_id", userId)
      .eq("kind", "test")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return { allowed: true, premium: false, nextAt: null };

    const last = data?.[0]?.created_at;
    if (!last) return { allowed: true, premium: false, nextAt: null };
    const nextAt = new Date(new Date(last).getTime() + FREE_TEST_INTERVAL_MS).toISOString();
    return { allowed: false, premium: false, nextAt };
  } catch {
    return { allowed: true, premium: false, nextAt: null };
  }
}

/** Record a successful generation in the ledger (service role only). */
export async function recordUsage(userId: string, kind: QuotaKind): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("ai_usage").insert({ user_id: userId, kind });
  } catch {
    // Ledger write is best-effort; worst case the user gets a bonus test.
  }
}
