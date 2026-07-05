/**
 * Server-only loader for a student's own AI provider keys.
 * Reads the encrypted rows with the service role (the ciphertext column is
 * hidden from browser clients) and decrypts in memory. Decrypted keys must
 * never be serialized into a response.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto";
import { AI_PROVIDER_ORDER } from "./provider-config";
import type { UserProviderKey } from "@/types";

interface KeyRow {
  provider: string;
  api_key: string;
  default_model: string | null;
}

/**
 * Returns the student's usable provider keys in resolution order
 * (gemini → openrouter → openai → anthropic). NEVER throws — a missing
 * table, missing encryption secret or corrupt row simply yields fewer keys,
 * and the app-key chain takes over.
 */
export async function getUserProviderKeys(userId: string): Promise<UserProviderKey[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("user_ai_keys")
      .select("provider, api_key, default_model")
      .eq("user_id", userId);
    if (error || !data) return [];

    const rows = data as KeyRow[];
    return AI_PROVIDER_ORDER.flatMap((provider) => {
      const row = rows.find((r) => r.provider === provider);
      if (!row) return [];
      try {
        return [{ provider, apiKey: decryptSecret(row.api_key), model: row.default_model }];
      } catch {
        // Wrong/rotated encryption secret — skip this key silently.
        return [];
      }
    });
  } catch {
    return [];
  }
}
