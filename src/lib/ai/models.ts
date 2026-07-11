/**
 * OpenRouter free-model configuration — the single source of truth for which
 * models the app tries, in order.
 *
 * Free-tier OpenRouter models are individually flaky: any given model can
 * return "Provider returned error" / 429 / empty at any moment even when it is
 * perfectly valid. The reliability strategy is therefore NOT "pick the one
 * best model" but "try several known-valid models with retry + Gemini in the
 * middle" (see generate.ts / streaming.ts).
 *
 * DEFAULT_OPENROUTER_MODELS is a curated list of model ids verified to exist on
 * OpenRouter (checked against GET /api/v1/models). Invalid / hallucinated ids
 * (e.g. "openrouter/free", "google/gemma-4-26b-a4b-it-20260403:free",
 * "poolside/laguna-m1:free", "nvidia/nemotron-3-super:free") are deliberately
 * excluded — a bad id wastes a whole round-trip on a guaranteed 400.
 *
 * The env var OPENROUTER_MODELS (comma-separated) overrides this list, but any
 * ids it contains are sanitised and de-duplicated first, and if it ends up
 * empty we fall back to the curated defaults so the app always has something
 * valid to try.
 */

export const DEFAULT_OPENROUTER_MODELS: string[] = [
  // Ordered fastest/most-reliable-first so the common case answers quickly and
  // the heavy models are only reached as later fallbacks.
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "openai/gpt-oss-120b:free",
  "openai/gpt-oss-20b:free",
  "google/gemma-4-31b-it:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
];

/** A model id is plausibly valid only as "vendor/name" (optionally ":free"). */
function looksValid(id: string): boolean {
  if (!id.includes("/")) return false;
  // Reject obvious junk ids the old env used, e.g. a bare "openrouter/free".
  if (id === "openrouter/free") return false;
  return /^[a-z0-9._-]+\/[a-z0-9._:-]+$/i.test(id);
}

/**
 * The OpenRouter models to try, in order. Reads OPENROUTER_MODELS /
 * OPENROUTER_MODEL from the environment, sanitises them, and falls back to the
 * curated DEFAULT_OPENROUTER_MODELS when nothing valid is configured.
 */
export function configuredOpenRouterModels(): string[] {
  const fromEnv = [
    ...(process.env.OPENROUTER_MODELS?.split(",") ?? []),
    ...(process.env.OPENROUTER_MODEL ? [process.env.OPENROUTER_MODEL] : []),
  ]
    .map((m) => m.trim())
    .filter(Boolean)
    .filter(looksValid);

  const deduped = [...new Set(fromEnv)];
  return deduped.length > 0 ? deduped : DEFAULT_OPENROUTER_MODELS;
}
