/**
 * Shared text-generation chain with "bring your own key" support and automatic
 * provider fallback (Priority 1).
 *
 * App-key resolution order is INTERLEAVED so no single provider being globally
 * down can stall generation:
 *   OpenRouter model #1  →  Gemini  →  OpenRouter model #2 → #3 → …
 * A student's own keys (if any) are tried first, in the order they added them.
 *
 * Every candidate is retried ONCE on a rate-limit (429) or timeout before we
 * move on. Any failure — 401/403/429/5xx/timeout/network — falls through to the
 * next candidate, so an expired student key or a busy free model degrades to
 * the next option without the student seeing an error. Throws the most
 * informative AIError only when EVERY candidate fails; callers keep their own
 * final fallbacks (canned reply / local question bank).
 */

import {
  generateWithAnthropic,
  generateWithGemini,
  generateWithOpenAI,
  generateWithOpenRouterModel,
} from "./providers";
import { configuredOpenRouterModels } from "./models";
import { AIError, logProviderFailure, pickBestError, toAIError } from "./errors";
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
  run: () => Promise<string>;
}

/** One retry, after a short backoff, but only for transient failures. */
const RETRYABLE = new Set(["rate_limited", "timeout"]);
const RETRY_DELAY_MS = 1200;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Interleave OpenRouter models with Gemini: [OR0, Gemini, OR1, OR2, …]. */
function appCandidates(prompt: string, json: boolean): Candidate[] {
  const models = configuredOpenRouterModels();
  const orCandidate = (model: string): Candidate => ({
    provider: "openrouter",
    ownKey: false,
    label: `app openrouter (${model})`,
    run: () => generateWithOpenRouterModel(prompt, json, model),
  });
  const gemini: Candidate = {
    provider: "gemini",
    ownKey: false,
    label: "app gemini",
    run: () => generateWithGemini(prompt, json),
  };

  if (models.length === 0) return [gemini];
  // OpenRouter first (working model) → Gemini → the rest of OpenRouter.
  return [orCandidate(models[0]), gemini, ...models.slice(1).map(orCandidate)];
}

function ownCandidates(prompt: string, json: boolean, userKeys: UserProviderKey[]): Candidate[] {
  return userKeys.flatMap((k): Candidate[] => {
    const model = k.model ?? undefined;
    switch (k.provider) {
      case "gemini":
        return [{ provider: "gemini", ownKey: true, label: "student gemini", run: () => generateWithGemini(prompt, json, { apiKey: k.apiKey, model }) }];
      case "openrouter":
        // Students never pick an OpenRouter model: try the server's configured
        // models in order with the student's key.
        return configuredOpenRouterModels().map((m) => ({
          provider: "openrouter" as const,
          ownKey: true,
          label: `student openrouter (${m})`,
          run: () => generateWithOpenRouterModel(prompt, json, m, { apiKey: k.apiKey }),
        }));
      case "openai":
        return [{ provider: "openai", ownKey: true, label: "student openai", run: () => generateWithOpenAI(prompt, json, { apiKey: k.apiKey, model }) }];
      case "anthropic":
        return [{ provider: "anthropic", ownKey: true, label: "student anthropic", run: () => generateWithAnthropic(prompt, json, { apiKey: k.apiKey, model }) }];
      default:
        return [];
    }
  });
}

/** Run one candidate with a single retry on transient (429/timeout) errors. */
async function runWithRetry(candidate: Candidate): Promise<string> {
  try {
    return await candidate.run();
  } catch (err) {
    const aiErr = err instanceof AIError ? err : toAIError(err);
    if (!RETRYABLE.has(aiErr.kind)) throw aiErr;
    logProviderFailure(`${candidate.label} (retrying)`, aiErr);
    await delay(RETRY_DELAY_MS);
    return candidate.run();
  }
}

export async function generateWithChain(
  prompt: string,
  { json = true, userKeys = [] }: { json?: boolean; userKeys?: UserProviderKey[] } = {}
): Promise<ChainResult> {
  const candidates = [...ownCandidates(prompt, json, userKeys), ...appCandidates(prompt, json)];
  const errors: AIError[] = [];

  for (const candidate of candidates) {
    try {
      const text = (await runWithRetry(candidate)).trim();
      if (text) {
        console.log(`[ai] ${candidate.label} succeeded`);
        return { text, provider: candidate.provider, ownKey: candidate.ownKey };
      }
      errors.push(new AIError("empty", `${candidate.label} returned empty text`, { provider: candidate.provider }));
    } catch (err) {
      const aiErr = err instanceof AIError ? err : toAIError(err, { provider: candidate.provider });
      logProviderFailure(candidate.label, aiErr);
      errors.push(aiErr);
    }
  }

  // Every provider failed — throw the single most informative reason.
  throw pickBestError(errors);
}
