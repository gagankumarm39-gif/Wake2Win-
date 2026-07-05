/**
 * Shared text-generation chain with "bring your own key" support.
 *
 * Resolution order:
 *   1. Student Gemini key      (their model choice)
 *   2. Student OpenRouter key  (their model choice)
 *   3. Student OpenAI key      (their model choice)
 *   4. Student Anthropic key   (their model choice)
 *   5. App Gemini key          (env)
 *   6. App OpenRouter key      (env model list)
 *
 * Any failure — 401/403/429/5xx/timeout/network — silently falls through to
 * the next candidate, so an expired student key degrades to the app keys
 * without the student ever seeing an error. Throws only when EVERY candidate
 * fails; callers keep their own final fallbacks (canned reply / local bank).
 */

import {
  generateWithAnthropic,
  generateWithGemini,
  generateWithOpenAI,
  generateWithOpenRouter,
} from "./providers";
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
  run: () => Promise<string>;
}

function candidatesFor(
  prompt: string,
  json: boolean,
  userKeys: UserProviderKey[]
): Candidate[] {
  const own: Candidate[] = userKeys.map((k) => {
    const model = k.model ?? undefined;
    switch (k.provider) {
      case "gemini":
        return { provider: "gemini", ownKey: true, run: () => generateWithGemini(prompt, json, { apiKey: k.apiKey, model }) };
      case "openrouter":
        return {
          provider: "openrouter",
          ownKey: true,
          run: () => generateWithOpenRouter(prompt, json, { apiKey: k.apiKey, models: model ? [model] : undefined }),
        };
      case "openai":
        return { provider: "openai", ownKey: true, run: () => generateWithOpenAI(prompt, json, { apiKey: k.apiKey, model }) };
      case "anthropic":
        return { provider: "anthropic", ownKey: true, run: () => generateWithAnthropic(prompt, json, { apiKey: k.apiKey, model }) };
    }
  });

  return [
    ...own,
    { provider: "gemini", ownKey: false, run: () => generateWithGemini(prompt, json) },
    { provider: "openrouter", ownKey: false, run: () => generateWithOpenRouter(prompt, json) },
  ];
}

export async function generateWithChain(
  prompt: string,
  { json = true, userKeys = [] }: { json?: boolean; userKeys?: UserProviderKey[] } = {}
): Promise<ChainResult> {
  let lastError: unknown = new Error("No AI provider configured");

  for (const candidate of candidatesFor(prompt, json, userKeys)) {
    try {
      const text = (await candidate.run()).trim();
      if (text) {
        console.log(`[ai] ${candidate.ownKey ? "student" : "app"} ${candidate.provider} succeeded`);
        return { text, provider: candidate.provider, ownKey: candidate.ownKey };
      }
    } catch (err) {
      console.error(`[ai] ${candidate.ownKey ? "student" : "app"} ${candidate.provider} failed:`, err instanceof Error ? err.message : err);
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
