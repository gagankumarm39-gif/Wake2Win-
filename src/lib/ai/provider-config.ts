import type { AIProvider } from "@/types";

/**
 * Client-safe metadata for every supported "bring your own key" provider.
 * No secrets here — this drives both the settings UI and server-side
 * defaults/validation.
 */
export interface AIProviderMeta {
  id: AIProvider;
  name: string;
  tagline: string;
  keyUrl: string;
  keyPlaceholder: string;
  defaultModel: string;
  /** Suggested models — the UI also allows any custom model id. */
  models: string[];
  /** Shown as a small badge, e.g. "Future-ready". */
  badge?: string;
}

export const AI_PROVIDER_ORDER: AIProvider[] = ["gemini", "openrouter", "openai", "anthropic"];

export const AI_PROVIDERS: Record<AIProvider, AIProviderMeta> = {
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    tagline: "Free tier from Google AI Studio",
    keyUrl: "https://aistudio.google.com/apikey",
    keyPlaceholder: "AIza…",
    defaultModel: "gemini-2.0-flash",
    models: ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro"],
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    tagline: "One key, many free models",
    keyUrl: "https://openrouter.ai/keys",
    keyPlaceholder: "sk-or-v1-…",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    models: [
      "google/gemma-4-26b-a4b-it:free",
      "meta-llama/llama-3.3-70b-instruct:free",
      "openai/gpt-oss-20b:free",
      "qwen/qwen3-next-80b-a3b-instruct:free",
      "nvidia/nemotron-3-nano-30b-a3b:free",
    ],
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    tagline: "GPT models with your own billing",
    keyUrl: "https://platform.openai.com/api-keys",
    keyPlaceholder: "sk-…",
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"],
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic Claude",
    tagline: "Claude models via the Anthropic API",
    keyUrl: "https://platform.claude.com/",
    keyPlaceholder: "sk-ant-…",
    defaultModel: "claude-opus-4-8",
    models: ["claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5"],
    badge: "Future-ready",
  },
};

export function isAIProvider(value: string): value is AIProvider {
  return (AI_PROVIDER_ORDER as string[]).includes(value);
}

/** The model to call for a student key: their choice, or the provider default. */
export function resolveModel(provider: AIProvider, model: string | null | undefined): string {
  return model?.trim() || AI_PROVIDERS[provider].defaultModel;
}
