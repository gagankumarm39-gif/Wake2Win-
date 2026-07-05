/**
 * Streaming AI providers — token-by-token generation.
 *
 * Chain: the student's own keys (Gemini → OpenRouter → OpenAI → Anthropic),
 * then the app's Gemini key, then each configured app OpenRouter model.
 * Mirrors the non-streaming chain in generate.ts but yields chunks as they
 * arrive. Errors are classified so the API route can degrade gracefully
 * (429 / 5xx / timeout / network) and automatically retry the next model.
 */

import { AI_PROVIDERS, resolveModel } from "./provider-config";
import type { UserProviderKey } from "@/types";

const STREAM_TIMEOUT_MS = 60_000;
const FIRST_TOKEN_TIMEOUT_MS = 20_000;

export type StreamErrorKind =
  | "rate_limited" // 429
  | "server_error" // 5xx
  | "timeout"
  | "network"
  | "unavailable" // provider not configured / bad response shape
  | "aborted";

export class StreamError extends Error {
  constructor(
    public readonly kind: StreamErrorKind,
    message: string
  ) {
    super(message);
    this.name = "StreamError";
  }
}

export interface StreamChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StreamResult {
  /** Async iterator of text deltas. */
  tokens: AsyncGenerator<string, void, void>;
  /** Provider/model that is producing this stream, e.g. "gemini-2.0-flash". */
  model: string;
}

function classifyStatus(status: number): StreamErrorKind {
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  return "unavailable";
}

function classifyThrown(err: unknown): StreamError {
  if (err instanceof StreamError) return err;
  if (err instanceof DOMException && err.name === "AbortError") {
    return new StreamError("aborted", "Stream aborted");
  }
  if (err instanceof DOMException && err.name === "TimeoutError") {
    return new StreamError("timeout", "Provider timed out");
  }
  if (err instanceof TypeError) {
    // fetch throws TypeError on network failure
    return new StreamError("network", "Network error reaching provider");
  }
  return new StreamError("unavailable", err instanceof Error ? err.message : String(err));
}

/** Combine an upstream abort signal with our own timeout. */
function combinedSignal(external: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const signals = [AbortSignal.timeout(timeoutMs)];
  if (external) signals.push(external);
  return AbortSignal.any(signals);
}

/**
 * Parse an SSE byte stream into `data:` payload strings.
 * Handles multi-line events and chunk boundaries splitting mid-line.
 */
async function* sseData(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<string, void, void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      if (signal?.aborted) throw new StreamError("aborted", "Stream aborted");
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload && payload !== "[DONE]") yield payload;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Watchdog: throw if the first token doesn't arrive quickly (hung provider). */
async function* withFirstTokenTimeout(
  inner: AsyncGenerator<string, void, void>
): AsyncGenerator<string, void, void> {
  let first = true;
  for (;;) {
    let next: IteratorResult<string, void>;
    if (first) {
      const timer = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new StreamError("timeout", "No token received in time")), FIRST_TOKEN_TIMEOUT_MS)
      );
      next = await Promise.race([inner.next(), timer]);
      first = false;
    } else {
      next = await inner.next();
    }
    if (next.done) return;
    yield next.value;
  }
}

// ── Gemini streaming ──────────────────────────────────────

async function* geminiTokens(
  messages: StreamChatMessage[],
  signal?: AbortSignal,
  opts?: { apiKey?: string; model?: string }
): AsyncGenerator<string, void, void> {
  const key = opts?.apiKey ?? process.env.GEMINI_API_KEY;
  if (!key) throw new StreamError("unavailable", "GEMINI_API_KEY not set");
  const model = opts?.model?.trim() || AI_PROVIDERS.gemini.defaultModel;

  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));

  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          contents,
          generationConfig: { temperature: 0.9 },
        }),
        signal: combinedSignal(signal, STREAM_TIMEOUT_MS),
      }
    );
  } catch (err) {
    throw classifyThrown(err);
  }

  if (!res.ok || !res.body) {
    throw new StreamError(classifyStatus(res.status), `Gemini ${res.status}`);
  }

  for await (const payload of sseData(res.body, signal)) {
    try {
      const data = JSON.parse(payload) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (text) yield text;
    } catch {
      // Skip malformed SSE frames rather than killing the stream.
    }
  }
}

// ── OpenAI-compatible chat-completions streaming (OpenRouter, OpenAI) ──

interface ChatCompletionsTarget {
  url: string;
  headers: Record<string, string>;
  /** For error messages, e.g. "OpenRouter" / "OpenAI". */
  label: string;
  /** OpenRouter accepts sampling params; newest OpenAI models may not care. */
  temperature?: number;
}

async function* chatCompletionsTokens(
  target: ChatCompletionsTarget,
  model: string,
  messages: StreamChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<string, void, void> {
  let res: Response;
  try {
    res = await fetch(target.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...target.headers },
      body: JSON.stringify({
        model,
        messages,
        ...(target.temperature !== undefined ? { temperature: target.temperature } : {}),
        stream: true,
      }),
      signal: combinedSignal(signal, STREAM_TIMEOUT_MS),
    });
  } catch (err) {
    throw classifyThrown(err);
  }

  if (!res.ok || !res.body) {
    throw new StreamError(classifyStatus(res.status), `${target.label} ${model} ${res.status}`);
  }

  for await (const payload of sseData(res.body, signal)) {
    try {
      const data = JSON.parse(payload) as {
        error?: { message?: string };
        choices?: Array<{ delta?: { content?: string } }>;
      };
      if (data.error) throw new StreamError("server_error", data.error.message ?? `${target.label} error`);
      const text = data.choices?.[0]?.delta?.content;
      if (text) yield text;
    } catch (err) {
      if (err instanceof StreamError) throw err;
      // Skip malformed frames (e.g. ": OPENROUTER PROCESSING" keep-alives).
    }
  }
}

function openRouterTokens(
  model: string,
  messages: StreamChatMessage[],
  signal?: AbortSignal,
  apiKey?: string
): AsyncGenerator<string, void, void> {
  const key = apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!key) throw new StreamError("unavailable", "OPENROUTER_API_KEY not set");
  return chatCompletionsTokens(
    {
      url: "https://openrouter.ai/api/v1/chat/completions",
      headers: {
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        "X-Title": "Wake2Win",
      },
      label: "OpenRouter",
      temperature: 0.9,
    },
    model,
    messages,
    signal
  );
}

function openAITokens(
  model: string,
  messages: StreamChatMessage[],
  signal: AbortSignal | undefined,
  apiKey: string
): AsyncGenerator<string, void, void> {
  return chatCompletionsTokens(
    {
      url: "https://api.openai.com/v1/chat/completions",
      headers: { Authorization: `Bearer ${apiKey}` },
      label: "OpenAI",
    },
    model,
    messages,
    signal
  );
}

// ── Anthropic Messages API streaming ──────────────────────

async function* anthropicTokens(
  model: string,
  messages: StreamChatMessage[],
  signal: AbortSignal | undefined,
  apiKey: string
): AsyncGenerator<string, void, void> {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  // Anthropic requires the first message to be a user turn.
  const convo = messages.filter((m) => m.role !== "system");
  while (convo.length > 0 && convo[0].role !== "user") convo.shift();
  if (convo.length === 0) throw new StreamError("unavailable", "Anthropic: no user message");

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        ...(system ? { system } : {}),
        messages: convo.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
      }),
      signal: combinedSignal(signal, STREAM_TIMEOUT_MS),
    });
  } catch (err) {
    throw classifyThrown(err);
  }

  if (!res.ok || !res.body) {
    throw new StreamError(classifyStatus(res.status), `Anthropic ${model} ${res.status}`);
  }

  for await (const payload of sseData(res.body, signal)) {
    try {
      const data = JSON.parse(payload) as {
        type?: string;
        error?: { message?: string };
        delta?: { type?: string; text?: string };
      };
      if (data.type === "error") {
        throw new StreamError("server_error", data.error?.message ?? "Anthropic error");
      }
      if (data.type === "content_block_delta" && data.delta?.type === "text_delta" && data.delta.text) {
        yield data.delta.text;
      }
    } catch (err) {
      if (err instanceof StreamError) throw err;
      // Skip malformed frames.
    }
  }
}

export function configuredOpenRouterModels(): string[] {
  const multi = process.env.OPENROUTER_MODELS?.split(",").map((m) => m.trim()).filter(Boolean) ?? [];
  if (multi.length > 0) return multi;
  const single = process.env.OPENROUTER_MODEL?.trim();
  return single ? [single] : [];
}

interface StreamAttempt {
  model: string;
  open: () => AsyncGenerator<string, void, void>;
}

/** The student's own keys, in resolution order, ahead of the app keys. */
function userKeyAttempts(
  messages: StreamChatMessage[],
  signal: AbortSignal | undefined,
  userKeys: UserProviderKey[]
): StreamAttempt[] {
  return userKeys.map((k) => {
    const model = resolveModel(k.provider, k.model);
    switch (k.provider) {
      case "gemini":
        return { model: `user:${model}`, open: () => geminiTokens(messages, signal, { apiKey: k.apiKey, model }) };
      case "openrouter":
        return { model: `user:${model}`, open: () => openRouterTokens(model, messages, signal, k.apiKey) };
      case "openai":
        return { model: `user:${model}`, open: () => openAITokens(model, messages, signal, k.apiKey) };
      case "anthropic":
        return { model: `user:${model}`, open: () => anthropicTokens(model, messages, signal, k.apiKey) };
    }
  });
}

/**
 * Open a token stream, falling through the provider chain on failure:
 * each of the student's own keys (Gemini → OpenRouter → OpenAI → Anthropic),
 * then the app's Gemini key, then each configured app OpenRouter model.
 * A provider only counts as "started" once its first token arrives, so
 * hung/erroring providers are skipped transparently. Throws
 * StreamError("unavailable") when every provider fails; throws
 * StreamError("aborted") if the caller aborted.
 */
export async function openChatStream(
  messages: StreamChatMessage[],
  signal?: AbortSignal,
  userKeys: UserProviderKey[] = []
): Promise<StreamResult> {
  const attempts: StreamAttempt[] = [
    ...userKeyAttempts(messages, signal, userKeys),
    { model: AI_PROVIDERS.gemini.defaultModel, open: () => geminiTokens(messages, signal) },
    ...configuredOpenRouterModels().map((m) => ({
      model: m,
      open: () => openRouterTokens(m, messages, signal),
    })),
  ];

  let lastError: StreamError = new StreamError("unavailable", "No AI provider configured");

  for (const attempt of attempts) {
    if (signal?.aborted) throw new StreamError("aborted", "Stream aborted");
    try {
      // open() may throw synchronously (missing key); the first next() is
      // where connection errors, 429s, 5xxs and hangs surface. Only after a
      // first token do we commit to this model.
      const gen = withFirstTokenTimeout(attempt.open());
      const first = await gen.next();
      if (first.done) {
        lastError = new StreamError("unavailable", `${attempt.model}: empty stream`);
        continue;
      }
      const firstToken = first.value;
      async function* replay(): AsyncGenerator<string, void, void> {
        yield firstToken;
        yield* gen;
      }
      console.log(`[stream] using ${attempt.model}`);
      return { tokens: replay(), model: attempt.model };
    } catch (err) {
      const sErr = classifyThrown(err);
      if (sErr.kind === "aborted") throw sErr;
      console.error(`[stream] ${attempt.model} failed (${sErr.kind}): ${sErr.message}`);
      lastError = sErr;
    }
  }

  throw lastError;
}
