import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/crypto";
import { AI_PROVIDERS, AI_PROVIDER_ORDER, isAIProvider } from "@/lib/ai/provider-config";
import type { UserAIKeyInfo } from "@/types";

/**
 * Student AI key management. The plaintext key exists only in the POST body
 * and in server memory — responses carry metadata only (UserAIKeyInfo).
 * Writes go through the service role because the `authenticated` role has no
 * insert/update grant on user_ai_keys (see migration 0004).
 */

interface KeyMetaRow {
  provider: string;
  default_model: string | null;
  updated_at: string;
}

function toInfoList(rows: KeyMetaRow[]): UserAIKeyInfo[] {
  return AI_PROVIDER_ORDER.map((provider) => {
    const row = rows.find((r) => r.provider === provider);
    return {
      provider,
      connected: Boolean(row),
      defaultModel: row?.default_model ?? null,
      updatedAt: row?.updated_at ?? null,
    };
  });
}

/** GET — connection status for every provider (never the key itself). */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // The user's own client: RLS scopes to their rows, and the column grant
  // excludes api_key, so this physically cannot leak ciphertext.
  const { data, error } = await supabase
    .from("user_ai_keys")
    .select("provider, default_model, updated_at");
  if (error) return NextResponse.json({ error: "Could not load key status" }, { status: 500 });

  return NextResponse.json({ providers: toInfoList((data ?? []) as KeyMetaRow[]) });
}

const saveSchema = z.object({
  provider: z.string().refine(isAIProvider, "Unknown provider"),
  apiKey: z.string().trim().min(8, "That key looks too short").max(512),
  model: z.string().trim().max(200).optional().nullable(),
});

/** POST — save or replace a key (upsert on user_id + provider). */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await request.json().catch(() => null);
  const parsed = saveSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }
  const { provider, apiKey, model } = parsed.data;

  let ciphertext: string;
  try {
    ciphertext = encryptSecret(apiKey);
  } catch {
    // AI_KEY_ENCRYPTION_SECRET missing — a deployment problem, not a user error.
    return NextResponse.json(
      { error: "Key storage is not configured on this server" },
      { status: 500 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_ai_keys")
    .upsert(
      {
        user_id: user.id,
        provider,
        api_key: ciphertext,
        // Server-managed providers (OpenRouter) never store a model — the
        // server iterates OPENROUTER_MODELS from the environment per request.
        default_model: AI_PROVIDERS[provider].serverManagedModel ? null : model || null,
      },
      { onConflict: "user_id,provider" }
    )
    .select("provider, default_model, updated_at")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Could not save the key" }, { status: 500 });
  }

  const row = data as KeyMetaRow;
  const info: UserAIKeyInfo = {
    provider,
    connected: true,
    defaultModel: row.default_model,
    updatedAt: row.updated_at,
  };
  return NextResponse.json({ ok: true, key: info });
}

const deleteSchema = z.object({
  provider: z.string().refine(isAIProvider, "Unknown provider"),
});

/** DELETE — remove a stored key. */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await request.json().catch(() => null);
  const parsed = deleteSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  // The user's own client — RLS restricts the delete to their rows.
  const { error } = await supabase
    .from("user_ai_keys")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", parsed.data.provider);
  if (error) return NextResponse.json({ error: "Could not delete the key" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
