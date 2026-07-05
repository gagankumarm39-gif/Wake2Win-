import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto";
import { isAIProvider, resolveModel } from "@/lib/ai/provider-config";
import {
  generateWithAnthropic,
  generateWithGemini,
  generateWithOpenAI,
  generateWithOpenRouter,
} from "@/lib/ai/providers";
import type { AIProvider } from "@/types";

/**
 * Connection test: fire a one-word prompt at the provider with either the
 * key from the request body (pre-save "test before you trust") or the
 * student's stored key. Responds with a friendly classified result — the
 * key itself never appears in the response.
 */

const bodySchema = z.object({
  provider: z.string().refine(isAIProvider, "Unknown provider"),
  /** Present = test this key without saving; absent = test the stored key. */
  apiKey: z.string().trim().min(8).max(512).optional(),
  model: z.string().trim().max(200).optional().nullable(),
});

const TEST_PROMPT = 'Reply with exactly the word "OK".';

async function runTest(provider: AIProvider, apiKey: string, model: string): Promise<string> {
  switch (provider) {
    case "gemini":
      return generateWithGemini(TEST_PROMPT, false, { apiKey, model });
    case "openrouter":
      return generateWithOpenRouter(TEST_PROMPT, false, { apiKey, models: [model] });
    case "openai":
      return generateWithOpenAI(TEST_PROMPT, false, { apiKey, model });
    case "anthropic":
      return generateWithAnthropic(TEST_PROMPT, false, { apiKey, model });
  }
}

/** Map a raw provider error onto something a student can act on. */
function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/\b(401|403)\b|invalid.?api.?key|unauthorized|permission/i.test(msg)) {
    return "The key was rejected — it looks invalid or expired.";
  }
  if (/\b429\b|rate.?limit|quota|exhausted/i.test(msg)) {
    return "The key works but is currently rate-limited or out of quota.";
  }
  if (/\b404\b|not.?found|model/i.test(msg)) {
    return "The provider rejected the model — try a different model id.";
  }
  if (/timeout|timed out|abort/i.test(msg)) {
    return "The provider took too long to respond. Try again in a moment.";
  }
  if (/network|fetch failed|ENOTFOUND|ECONN/i.test(msg)) {
    return "Could not reach the provider — check your server's connectivity.";
  }
  return "The test call failed. Double-check the key and model.";
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { provider, model } = parsed.data;

  let apiKey = parsed.data.apiKey;
  let testedModel = model ?? null;
  if (!apiKey) {
    // No key in the body — test the stored one (service role reads the
    // ciphertext column, decryption stays in server memory).
    const admin = createAdminClient();
    const { data } = await admin
      .from("user_ai_keys")
      .select("api_key, default_model")
      .eq("user_id", user.id)
      .eq("provider", provider)
      .maybeSingle();
    if (!data) {
      return NextResponse.json(
        { ok: false, message: "No key saved for this provider yet." },
        { status: 404 }
      );
    }
    try {
      apiKey = decryptSecret((data as { api_key: string }).api_key);
    } catch {
      return NextResponse.json(
        { ok: false, message: "Stored key could not be read — please re-enter it." },
        { status: 500 }
      );
    }
    testedModel = testedModel ?? (data as { default_model: string | null }).default_model;
  }

  const resolved = resolveModel(provider, testedModel);
  try {
    await runTest(provider, apiKey, resolved);
    return NextResponse.json({ ok: true, message: `Connected — ${resolved} responded.`, model: resolved });
  } catch (err) {
    console.error(`[ai-keys/test] ${provider} failed:`, err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, message: friendlyError(err), model: resolved });
  }
}
