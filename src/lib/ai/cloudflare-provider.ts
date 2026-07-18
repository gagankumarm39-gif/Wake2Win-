/**
 * Cloudflare Workers AI — server-side app provider (second priority, after
 * Ollama). Reads CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN from the
 * environment; never a student key.
 *
 * Text: @cf/meta/llama-4-scout-17b-16e-instruct via the /ai/run endpoint
 * (non-streaming, supports response_format json). Streaming lives in
 * streaming.ts and reuses the shared chat-completions parser against the
 * OpenAI-compatible /ai/v1/chat/completions endpoint exposed below.
 *
 * Vision: @cf/moondream/moondream3.1-9B-A2B ("moondream3" has no catalog
 * entry on Workers AI — 3.1-9B-A2B is the shipped id, verified against
 * GET /ai/models/search). Accepts a base64 data URI (reliable) or public
 * HTTPS URL.
 *
 * Every failure throws a typed AIError, matching providers.ts; retries on
 * 429/timeout are handled by the chain in generate.ts, like Gemini.
 */

import { AIError, kindFromStatus, toAIError } from "./errors";
import type { ProviderCallOptions } from "./providers";

const TIMEOUT_MS = 45000;

export const CLOUDFLARE_TEXT_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
export const CLOUDFLARE_VISION_MODEL = "@cf/moondream/moondream3.1-9B-A2B";

interface CloudflareEnv {
  accountId: string;
  apiToken: string;
}

/** Null when the account id / token are not configured (chain skips us). */
export function cloudflareEnv(): CloudflareEnv | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  return accountId && apiToken ? { accountId, apiToken } : null;
}

export function isCloudflareConfigured(): boolean {
  return cloudflareEnv() !== null;
}

function requireEnv(): CloudflareEnv {
  const env = cloudflareEnv();
  if (!env) {
    throw new AIError("not_configured", "CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not set", {
      provider: "cloudflare",
    });
  }
  return env;
}

function runUrl(env: CloudflareEnv, model: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${env.accountId}/ai/run/${model}`;
}

/** OpenAI-compatible endpoint + headers for streaming.ts. */
export function cloudflareChatTarget(): { url: string; headers: Record<string, string> } | null {
  const env = cloudflareEnv();
  if (!env) return null;
  return {
    url: `https://api.cloudflare.com/client/v4/accounts/${env.accountId}/ai/v1/chat/completions`,
    headers: { Authorization: `Bearer ${env.apiToken}` },
  };
}

interface CloudflareRunResponse {
  success?: boolean;
  result?: unknown;
  errors?: Array<{ code?: number; message?: string }>;
}

async function callRun(model: string, body: Record<string, unknown>): Promise<unknown> {
  const env = requireEnv();

  let res: Response;
  try {
    res = await fetch(runUrl(env, model), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw toAIError(err, { provider: "cloudflare", model });
  }

  const data = (await res.json().catch(() => null)) as CloudflareRunResponse | null;

  if (!res.ok || !data?.success) {
    const detail = data?.errors?.[0]?.message ?? data ?? (await res.text().catch(() => ""));
    throw new AIError(kindFromStatus(res.status), `Cloudflare ${model}: ${res.status}`, {
      provider: "cloudflare",
      model,
      status: res.status,
      detail,
    });
  }

  return data.result;
}

/**
 * Non-streaming text generation with Llama 4 Scout. In JSON mode Workers AI
 * returns `response` as a parsed OBJECT (not a string) — re-serialize it so
 * callers keep receiving text, like every other provider.
 */
export async function generateWithCloudflare(
  prompt: string,
  json = true,
  opts?: ProviderCallOptions
): Promise<string> {
  const model = opts?.model?.trim() || process.env.CLOUDFLARE_MODEL || CLOUDFLARE_TEXT_MODEL;

  const result = (await callRun(model, {
    messages: [{ role: "user", content: prompt }],
    temperature: 0.9,
    ...(json ? { response_format: { type: "json_object" } } : {}),
  })) as { response?: unknown } | null;

  const raw = result?.response;
  const text =
    typeof raw === "string" ? raw : raw !== null && raw !== undefined ? JSON.stringify(raw) : "";

  if (!text.trim() || text === "{}" || text === "null") {
    throw new AIError("empty", "Cloudflare returned an empty response", {
      provider: "cloudflare",
      model,
      detail: result,
    });
  }

  return text;
}

/**
 * Image understanding with Moondream. `image` is a base64 data URI
 * ("data:image/jpeg;base64,…" — reliable) or a public HTTPS URL.
 * The run result nests the payload one level: { result: { answer } }.
 */
export async function describeImageWithCloudflare(
  image: string,
  question = "Describe this image in detail."
): Promise<string> {
  const result = (await callRun(CLOUDFLARE_VISION_MODEL, {
    task: "query",
    image,
    question,
    reasoning: false,
    // Moondream returns an empty result unless stream is EXPLICITLY false
    // (verified against the live endpoint — omitting the field breaks it).
    stream: false,
    max_tokens: 1024,
  })) as { result?: { answer?: unknown } } | null;

  const answer = result?.result?.answer;
  if (typeof answer !== "string" || !answer.trim()) {
    throw new AIError("empty", "Cloudflare vision returned an empty response", {
      provider: "cloudflare",
      model: CLOUDFLARE_VISION_MODEL,
      detail: result,
    });
  }

  return answer;
}
