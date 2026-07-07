/**
 * AI Providers
 * Direct HTTP calls to each provider. Every generator accepts an optional
 * apiKey/model override so students can bring their own keys; without
 * overrides the app's env keys are used (the original behavior).
 * The resolution chain lives in generate.ts.
 */

import { configuredOpenRouterModels } from "./streaming";
import { AI_PROVIDERS } from "./provider-config";

const TIMEOUT_MS = 45000;

export interface ProviderCallOptions {
  apiKey?: string;
  model?: string;
}

export async function generateWithGemini(
  prompt: string,
  json = true,
  opts?: ProviderCallOptions
): Promise<string> {
  const key = opts?.apiKey ?? process.env.GEMINI_API_KEY;

  if (!key) {
    throw new Error("GEMINI_API_KEY not set");
  }

  const model = opts?.model?.trim() || AI_PROVIDERS.gemini.defaultModel;

  const res = await fetch(
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
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }
  );

  if (!res.ok) {
    console.error("Gemini status:", res.status);
    console.error(await res.text());
    throw new Error(`Gemini ${res.status}`);
  }

  const data = await res.json();

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("Gemini: empty response");
  }

  return text;
}

export async function generateWithOpenRouter(
  prompt: string,
  json = true,
  opts?: { apiKey?: string; models?: string[] }
): Promise<string> {
  const key = opts?.apiKey ?? process.env.OPENROUTER_API_KEY;

  if (!key) {
    throw new Error("OPENROUTER_API_KEY not set");
  }

  // Models always come from the server's OPENROUTER_MODELS / OPENROUTER_MODEL
  // configuration — students never choose one. Each model is tried in order;
  // any failure (429, timeout, unavailable…) falls through to the next.
  const models = opts?.models?.length ? opts.models : configuredOpenRouterModels();

  if (models.length === 0) {
    throw new Error("No OpenRouter model configured (set OPENROUTER_MODELS or OPENROUTER_MODEL)");
  }

  let lastError: unknown = null;

  for (const model of models) {
    try {
      console.log("Trying OpenRouter model:", model);

      const res = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
            "X-Title": "Wake2Win",
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
            temperature: 0.9,
            ...(json
              ? {
                  response_format: {
                    type: "json_object",
                  },
                }
              : {}),
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        }
      );

      const data = await res.json();

      if (!res.ok || data.error) {
        console.log(`${model} failed`);
        lastError = data.error ?? data;
        continue;
      }

      const choice = data?.choices?.[0];

      const text =
        typeof choice?.message?.content === "string"
          ? choice.message.content
          : Array.isArray(choice?.message?.content)
          ? choice.message.content
              .map((p: { text?: string }) => p.text ?? "")
              .join("")
          : "";

      if (!text) {
        console.log(`${model} returned empty text`);
        continue;
      }

      console.log(`SUCCESS using ${model}`);

      return text;
    } catch (err) {
      console.log(`${model} crashed`);
      console.error(err);
      lastError = err;
      continue;
    }
  }

  throw new Error(
    `All OpenRouter models failed.\n${JSON.stringify(lastError, null, 2)}`
  );
}

/** OpenAI chat completions — student keys only (the app ships no OpenAI key). */
export async function generateWithOpenAI(
  prompt: string,
  json = true,
  opts: ProviderCallOptions = {}
): Promise<string> {
  const key = opts.apiKey;
  if (!key) throw new Error("No OpenAI API key provided");

  const model = opts.model?.trim() || AI_PROVIDERS.openai.defaultModel;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
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
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || data?.error) {
    throw new Error(`OpenAI ${res.status}: ${data?.error?.message ?? "request failed"}`);
  }

  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text) throw new Error("OpenAI: empty response");
  return text;
}

/** Anthropic Messages API — student keys only (the app ships no Anthropic key). */
export async function generateWithAnthropic(
  prompt: string,
  json = true,
  opts: ProviderCallOptions = {}
): Promise<string> {
  const key = opts.apiKey;
  if (!key) throw new Error("No Anthropic API key provided");

  const model = opts.model?.trim() || AI_PROVIDERS.anthropic.defaultModel;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
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
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || data?.type === "error") {
    throw new Error(`Anthropic ${res.status}: ${data?.error?.message ?? "request failed"}`);
  }

  // Check stop_reason before reading content — safety classifiers can
  // return HTTP 200 with a refusal and an empty content array.
  if (data?.stop_reason === "refusal") {
    throw new Error("Anthropic: request refused");
  }

  const text = (data?.content ?? [])
    .filter((block: { type?: string }) => block.type === "text")
    .map((block: { text?: string }) => block.text ?? "")
    .join("");

  if (!text) throw new Error("Anthropic: empty response");
  return text;
}
