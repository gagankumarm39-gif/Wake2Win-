/**
 * OpenRouter free-model configuration — the single source of truth for which
 * models the app tries, in order.
 *
 * Free-tier OpenRouter models are individually flaky: any given model can
 * return "Provider returned error" / 429 / empty at any moment even when it is
 * perfectly valid. The reliability strategy is a strict provider chain
 * (Ollama → Cloudflare → OpenRouter → Gemini, one attempt each; see
 * generate.ts / streaming.ts) with these models tried in order inside the
 * OpenRouter step.
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
  // Exactly three models, in priority order (verified against GET
  // /api/v1/models on 2026-07-19). Previously-listed models were removed
  // because they fail in production:
  //   meta-llama/llama-3.3-70b-instruct:free     — rate-limited
  //   qwen/qwen3-next-80b-a3b-instruct:free      — rate-limited
  //   nvidia/nemotron-3-super*                   — invalid model id
  //   poolside/laguna-m1*                        — invalid model id (catalog id is laguna-m.1)
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "poolside/laguna-xs-2.1",
  "google/gemma-4-26b-a4b-it",
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
