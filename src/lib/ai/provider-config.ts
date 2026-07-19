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
  /**
   * True when students never pick a model: the server iterates its own
   * env-configured list (OPENROUTER_MODELS) on every request. The UI hides
   * all model inputs and no model is ever stored for this provider.
   */
  serverManagedModel?: boolean;
}

// Drives the settings UI and BYOK validation. Ollama is a server-side
// (self-hosted) provider, never a student key, so it is deliberately excluded
// here but still present in AI_PROVIDERS below (the Record must be complete).
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
    tagline: "One key, many free models — picked automatically",
    keyUrl: "https://openrouter.ai/keys",
    keyPlaceholder: "sk-or-v1-…",
    // Never shown to students and never stored: the server iterates the
    // OPENROUTER_MODELS list from the environment on every request.
    defaultModel: "auto",
    models: [],
    serverManagedModel: true,
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
  // Server-side self-hosted provider (highest priority). Read from OLLAMA_URL /
  // OLLAMA_MODEL env vars, never a student key — kept out of AI_PROVIDER_ORDER
  // so it never surfaces in the BYOK settings UI.
  ollama: {
    id: "ollama",
    name: "Ollama",
    tagline: "Self-hosted local models",
    keyUrl: "https://ollama.com",
    keyPlaceholder: "",
    defaultModel: "gemma3:4b",
    models: ["gemma3:4b", "qwen2.5:7b", "kimi-k2.7-code:cloud"],
    serverManagedModel: true,
  },
  // Server-side provider (second priority, after Ollama). Read from
  // CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN env vars, never a student
  // key — kept out of AI_PROVIDER_ORDER so it never surfaces in the BYOK UI.
  cloudflare: {
    id: "cloudflare",
    name: "Cloudflare Workers AI",
    tagline: "Edge-hosted models on Cloudflare",
    keyUrl: "https://dash.cloudflare.com/",
    keyPlaceholder: "",
    defaultModel: "@cf/meta/llama-4-scout-17b-16e-instruct",
    models: ["@cf/meta/llama-4-scout-17b-16e-instruct"],
    serverManagedModel: true,
  },
};

export function isAIProvider(value: string): value is AIProvider {
  return (AI_PROVIDER_ORDER as string[]).includes(value);
}

/** The model to call for a student key: their choice, or the provider default. */
export function resolveModel(provider: AIProvider, model: string | null | undefined): string {
  return model?.trim() || AI_PROVIDERS[provider].defaultModel;
}
