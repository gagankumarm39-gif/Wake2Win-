/**
 * AI Providers
 * Direct HTTP calls to each provider. Every generator accepts an optional
 * apiKey/model override so students can bring their own keys; without
 * overrides the app's env keys are used (the original behavior).
 * The resolution chain lives in generate.ts.
 *
 * Every failure path throws a typed AIError (errors.ts) carrying the real
 * reason — rate limit / auth / invalid model / timeout / unavailable / empty —
 * so the UI can report it instead of a generic "Check your network.".
 */

import { configuredOpenRouterModels } from "./models";
import { AI_PROVIDERS } from "./provider-config";
import { AIError, kindFromStatus, pickBestError, toAIError } from "./errors";
import { getOllamaModel, type OllamaTask } from "./ollama-model-router";

// Per-provider timeouts: Ollama 60s (local models can be slow to load),
// Cloudflare 45s (cloudflare-provider.ts), OpenRouter/Gemini 30s.
const GEMINI_TIMEOUT_MS = 30000;
const OPENROUTER_TIMEOUT_MS = 30000;
const OTHER_TIMEOUT_MS = 45000;
const OLLAMA_TIMEOUT_MS = 60000;

export interface ProviderCallOptions {
  apiKey?: string;
  model?: string;
}

/**
 * Ollama (self-hosted, highest-priority provider) via /api/generate.
 * Reads OLLAMA_URL; the model is routed per task (ollama-model-router.ts)
 * unless overridden. 60s timeout, single attempt — any failure throws a typed
 * AIError so the chain moves on to the next provider without surfacing an
 * error to the student.
 */
export async function generateWithOllama(
  prompt: string,
  task: OllamaTask = "chat",
  json = true,
  opts?: ProviderCallOptions
): Promise<string> {
  const base = process.env.OLLAMA_URL;
  if (!base) {
    throw new AIError("not_configured", "OLLAMA_URL not set", { provider: "ollama" });
  }

  const model = opts?.model?.trim() || getOllamaModel(task);
  const url = `${base.replace(/\/$/, "")}/api/generate`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        ...(json ? { format: "json" } : {}),
        options: { temperature: 0.9 },
      }),
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
    });
  } catch (err) {
    throw toAIError(err, { provider: "ollama", model });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new AIError(kindFromStatus(res.status), `Ollama ${res.status}`, {
      provider: "ollama",
      model,
      status: res.status,
      detail,
    });
  }

  const data = await res.json().catch(() => null);
  const text = data?.response;

  if (typeof text !== "string" || !text.trim()) {
    throw new AIError("empty", "Ollama returned an empty response", {
      provider: "ollama",
      model,
      detail: data,
    });
  }

  return text;
}

export async function generateWithGemini(
  prompt: string,
  json = true,
  opts?: ProviderCallOptions
): Promise<string> {
  const key = opts?.apiKey ?? process.env.GEMINI_API_KEY;

  if (!key) {
    throw new AIError("not_configured", "GEMINI_API_KEY not set", { provider: "gemini" });
  }

  const model = opts?.model?.trim() || AI_PROVIDERS.gemini.defaultModel;

  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.9,
            ...(json
              ? {
                  responseMimeType: "application/json",
                }
              : {}),
          },
        }),
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      }
    );
  } catch (err) {
    throw toAIError(err, { provider: "gemini", model });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new AIError(kindFromStatus(res.status), `Gemini ${res.status}`, {
      provider: "gemini",
      model,
      status: res.status,
      detail,
    });
  }

  const data = await res.json().catch(() => null);
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new AIError("empty", "Gemini returned an empty response", {
      provider: "gemini",
      model,
      detail: data,
    });
  }

  return text;
}

interface OpenRouterCallOptions {
  apiKey?: string;
  /** Extra headers for observability (not required). */
}

/** Single OpenRouter model call — throws a typed AIError on any failure. */
export async function generateWithOpenRouterModel(
  prompt: string,
  json = true,
  model: string,
  opts?: OpenRouterCallOptions
): Promise<string> {
  const key = opts?.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new AIError("not_configured", "OPENROUTER_API_KEY not set", { provider: "openrouter" });
  }

  let res: Response;
  try {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://wake2-win.vercel.app",
        "X-Title": "Wake2Win",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.9,
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
    });
  } catch (err) {
    throw toAIError(err, { provider: "openrouter", model });
  }

  const data = await res.json().catch(() => null);

  if (!res.ok || data?.error) {
    // OpenRouter free tier often returns 200 + { error } or a 5xx wrapper for a
    // transient "Provider returned error"; classify by whichever we have.
    const status = res.ok ? (data?.error?.code as number | undefined) : res.status;
    const kind = typeof status === "number" ? kindFromStatus(status) : "unavailable";
    throw new AIError(kind, `OpenRouter ${model}: ${data?.error?.message ?? res.status}`, {
      provider: "openrouter",
      model,
      status: typeof status === "number" ? status : res.status,
      detail: data?.error ?? data,
    });
  }

  const choice = data?.choices?.[0];
  const text =
    typeof choice?.message?.content === "string"
      ? choice.message.content
      : Array.isArray(choice?.message?.content)
      ? choice.message.content.map((p: { text?: string }) => p.text ?? "").join("")
      : "";

  if (!text) {
    throw new AIError("empty", `OpenRouter ${model} returned empty text`, {
      provider: "openrouter",
      model,
      detail: data,
    });
  }

  return text;
}

/**
 * Try every configured OpenRouter model in order. Kept for callers that want a
 * single "OpenRouter, please" entry point (key-test route, assistant fallback).
 * generate.ts interleaves models with Gemini itself and does NOT use this.
 */
export async function generateWithOpenRouter(
  prompt: string,
  json = true,
  opts?: { apiKey?: string; models?: string[] }
): Promise<string> {
  const models = opts?.models?.length ? opts.models : configuredOpenRouterModels();
  if (models.length === 0) {
    throw new AIError("not_configured", "No OpenRouter model configured", { provider: "openrouter" });
  }

  const errors: AIError[] = [];
  for (const model of models) {
    try {
      return await generateWithOpenRouterModel(prompt, json, model, { apiKey: opts?.apiKey });
    } catch (err) {
      errors.push(err instanceof AIError ? err : toAIError(err, { provider: "openrouter", model }));
    }
  }
  // Surface the most informative failure across the models we tried.
  throw pickBestError(errors);
}

/** OpenAI chat completions — student keys only (the app ships no OpenAI key). */
export async function generateWithOpenAI(
  prompt: string,
  json = true,
  opts: ProviderCallOptions = {}
): Promise<string> {
  const key = opts.apiKey;
  if (!key) throw new AIError("not_configured", "No OpenAI API key provided", { provider: "openai" });

  const model = opts.model?.trim() || AI_PROVIDERS.openai.defaultModel;

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(OTHER_TIMEOUT_MS),
    });
  } catch (err) {
    throw toAIError(err, { provider: "openai", model });
  }

  const data = await res.json().catch(() => null);
  if (!res.ok || data?.error) {
    throw new AIError(kindFromStatus(res.status), `OpenAI ${res.status}: ${data?.error?.message ?? "request failed"}`, {
      provider: "openai",
      model,
      status: res.status,
      detail: data?.error ?? data,
    });
  }

  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text) {
    throw new AIError("empty", "OpenAI returned an empty response", { provider: "openai", model, detail: data });
  }
  return text;
}

/** Anthropic Messages API — student keys only (the app ships no Anthropic key). */
export async function generateWithAnthropic(
  prompt: string,
  json = true,
  opts: ProviderCallOptions = {}
): Promise<string> {
  const key = opts.apiKey;
  if (!key) throw new AIError("not_configured", "No Anthropic API key provided", { provider: "anthropic" });

  const model = opts.model?.trim() || AI_PROVIDERS.anthropic.defaultModel;

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        ...(json
          ? { system: "Respond with only valid JSON. No prose, no markdown fences." }
          : {}),
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(OTHER_TIMEOUT_MS),
    });
  } catch (err) {
    throw toAIError(err, { provider: "anthropic", model });
  }

  const data = await res.json().catch(() => null);
  if (!res.ok || data?.type === "error") {
    throw new AIError(kindFromStatus(res.status), `Anthropic ${res.status}: ${data?.error?.message ?? "request failed"}`, {
      provider: "anthropic",
      model,
      status: res.status,
      detail: data?.error ?? data,
    });
  }

  // Check stop_reason before reading content — safety classifiers can
  // return HTTP 200 with a refusal and an empty content array.
  if (data?.stop_reason === "refusal") {
    throw new AIError("unavailable", "Anthropic refused the request", { provider: "anthropic", model });
  }

  const text = (data?.content ?? [])
    .filter((block: { type?: string }) => block.type === "text")
    .map((block: { text?: string }) => block.text ?? "")
    .join("");

  if (!text) throw new AIError("empty", "Anthropic returned an empty response", { provider: "anthropic", model, detail: data });
  return text;
}
