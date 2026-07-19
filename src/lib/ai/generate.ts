/**
 * Shared text-generation chain with "bring your own key" support and automatic
 * provider fallback (Priority 1).
 *
 * App-key resolution order (strict, ONE attempt per provider, stop on first
 * success):
 *   Ollama (self-hosted)  →  Cloudflare Workers AI  →  OpenRouter  →  Gemini
 * Within Ollama, code tasks may try qwen2.5:7b then kimi-k2.7-code:cloud
 * (ollama-model-router.ts); within OpenRouter the three configured models are
 * tried in order. Those are model fallbacks INSIDE a provider step — no
 * provider is ever re-entered, and nothing is retried.
 * A student's own keys (if any) are tried first, in the order they added them.
 *
 * Any failure — 401/403/429/5xx/timeout/network — falls through to the next
 * candidate. Throws the most informative AIError only when EVERY candidate
 * fails; callers keep their own final fallbacks (canned reply / local
 * question bank).
 */

import {
  generateWithAnthropic,
  generateWithGemini,
  generateWithOllama,
  generateWithOpenAI,
  generateWithOpenRouterModel,
} from "./providers";
import { generateWithCloudflare, isCloudflareConfigured } from "./cloudflare-provider";
import { configuredOpenRouterModels } from "./models";
import { AIError, logProviderFailure, pickBestError, toAIError } from "./errors";
import { getOllamaModelChain, type OllamaTask } from "./ollama-model-router";
import type { AIProvider, UserProviderKey } from "@/types";

export interface ChainResult {
  text: string;
  /** Which provider produced the text (student or app key). */
  provider: AIProvider;
  /** True when the student's own key was used. */
  ownKey: boolean;
}

interface Candidate {
  provider: AIProvider;
  ownKey: boolean;
  label: string;
  /** Model id, for the structured [AI] log lines. */
  model: string;
  run: () => Promise<string>;
}

/**
 * App-key candidates in the strict order
 *   Ollama → Cloudflare Workers AI → OpenRouter (3 models) → Gemini.
 * Unconfigured providers are skipped entirely (they'd only waste a step on a
 * guaranteed not_configured error).
 */
function appCandidates(prompt: string, json: boolean, ollamaTask: OllamaTask): Candidate[] {
  const ollama: Candidate[] = process.env.OLLAMA_URL
    ? getOllamaModelChain(ollamaTask).map((model) => ({
        provider: "ollama" as const,
        ownKey: false,
        label: `app ollama (${model})`,
        model,
        run: () => generateWithOllama(prompt, ollamaTask, json, { model }),
      }))
    : [];
  const cloudflare: Candidate[] = isCloudflareConfigured()
    ? [{
        provider: "cloudflare" as const,
        ownKey: false,
        label: "app cloudflare",
        model: process.env.CLOUDFLARE_MODEL || "@cf/meta/llama-4-scout-17b-16e-instruct",
        run: () => generateWithCloudflare(prompt, json),
      }]
    : [];
  const openrouter: Candidate[] = configuredOpenRouterModels().map((model) => ({
    provider: "openrouter" as const,
    ownKey: false,
    label: `app openrouter (${model})`,
    model,
    run: () => generateWithOpenRouterModel(prompt, json, model),
  }));
  const gemini: Candidate = {
    provider: "gemini",
    ownKey: false,
    label: "app gemini",
    model: "gemini-2.0-flash",
    run: () => generateWithGemini(prompt, json),
  };

  return [...ollama, ...cloudflare, ...openrouter, gemini];
}

function ownCandidates(prompt: string, json: boolean, userKeys: UserProviderKey[]): Candidate[] {
  return userKeys.flatMap((k): Candidate[] => {
    const model = k.model ?? undefined;
    switch (k.provider) {
      case "gemini":
        return [{ provider: "gemini", ownKey: true, label: "student gemini", model: model ?? "gemini-2.0-flash", run: () => generateWithGemini(prompt, json, { apiKey: k.apiKey, model }) }];
      case "openrouter":
        // Students never pick an OpenRouter model: try the server's configured
        // models in order with the student's key.
        return configuredOpenRouterModels().map((m) => ({
          provider: "openrouter" as const,
          ownKey: true,
          label: `student openrouter (${m})`,
          model: m,
          run: () => generateWithOpenRouterModel(prompt, json, m, { apiKey: k.apiKey }),
        }));
      case "openai":
        return [{ provider: "openai", ownKey: true, label: "student openai", model: model ?? "gpt-4o-mini", run: () => generateWithOpenAI(prompt, json, { apiKey: k.apiKey, model }) }];
      case "anthropic":
        return [{ provider: "anthropic", ownKey: true, label: "student anthropic", model: model ?? "claude-opus-4-8", run: () => generateWithAnthropic(prompt, json, { apiKey: k.apiKey, model }) }];
      default:
        return [];
    }
  });
}

const PROVIDER_NAMES: Record<string, string> = {
  ollama: "Ollama",
  cloudflare: "Cloudflare",
  openrouter: "OpenRouter",
  gemini: "Gemini",
  openai: "OpenAI",
  anthropic: "Anthropic",
};

function logSuccess(candidate: Candidate, latencyMs: number): void {
  console.log(
    `[AI] Provider: ${PROVIDER_NAMES[candidate.provider] ?? candidate.provider}\n` +
      `Model: ${candidate.model}\n` +
      `Status: Success\n` +
      `Latency: ${latencyMs} ms`
  );
}

function logFailure(candidate: Candidate, err: AIError, latencyMs: number): void {
  console.error(
    `[AI] Provider: ${PROVIDER_NAMES[candidate.provider] ?? candidate.provider}\n` +
      `Model: ${candidate.model}\n` +
      `Status: Failed\n` +
      `Reason: ${err.kind}\n` +
      `Latency: ${latencyMs} ms`
  );
}

export async function generateWithChain(
  prompt: string,
  {
    json = true,
    userKeys = [],
    validate,
    ollamaTask = "chat",
  }: {
    json?: boolean;
    userKeys?: UserProviderKey[];
    /**
     * Optional semantic gate. A provider can return HTTP 200 with non-empty but
     * USELESS text (e.g. `{"questions":[]}` from a flaky free model). Returning
     * that as success makes the caller discard it and fall back to the local
     * bank even though the NEXT provider would have produced real content. When
     * supplied, a candidate only counts as success if its text also passes
     * `validate`; otherwise the chain treats it as a failure and moves on.
     */
    validate?: (text: string) => boolean;
    /** Which per-task Ollama model to use (ollama-model-router.ts). */
    ollamaTask?: OllamaTask;
  } = {}
): Promise<ChainResult> {
  const candidates = [...ownCandidates(prompt, json, userKeys), ...appCandidates(prompt, json, ollamaTask)];
  const errors: AIError[] = [];

  // ONE attempt per candidate, in order. The first success ends the chain
  // immediately; no candidate is ever retried.
  for (const candidate of candidates) {
    const started = Date.now();
    try {
      const text = (await candidate.run()).trim();
      if (text && (!validate || validate(text))) {
        logSuccess(candidate, Date.now() - started);
        return { text, provider: candidate.provider, ownKey: candidate.ownKey };
      }
      const reason = text ? "returned unusable content" : "returned empty text";
      const emptyErr = new AIError("empty", `${candidate.label} ${reason}`, { provider: candidate.provider, model: candidate.model });
      logFailure(candidate, emptyErr, Date.now() - started);
      errors.push(emptyErr);
    } catch (err) {
      const aiErr = err instanceof AIError ? err : toAIError(err, { provider: candidate.provider });
      logFailure(candidate, aiErr, Date.now() - started);
      logProviderFailure(candidate.label, aiErr);
      errors.push(aiErr);
    }
  }

  // Every provider failed — throw the single most informative reason.
  throw pickBestError(errors);
}
