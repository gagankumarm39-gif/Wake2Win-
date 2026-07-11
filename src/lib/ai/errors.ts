/**
 * Typed AI errors — so the UI can show the REAL reason a generation failed
 * ("Rate limit exceeded", "Authentication error", "Timeout"…) instead of a
 * generic "Check your network." / "Could not generate.".
 *
 * Every provider call in providers.ts throws an AIError. generateWithChain
 * collects them and re-throws the most informative one (see pickBestError).
 */

import type { AIProvider } from "@/types";

export type AIErrorKind =
  | "rate_limited" // 429 / quota exceeded
  | "auth_error" // 401 / 403 — bad or missing key
  | "invalid_model" // 400 / 404 — model id not found on the provider
  | "timeout" // request/first-token timed out
  | "network" // fetch threw (DNS / offline / TLS)
  | "unavailable" // provider 5xx / bad response shape / provider-returned-error
  | "empty" // HTTP 200 but no usable text
  | "not_configured"; // no key / no model configured

export interface AIErrorMeta {
  provider?: AIProvider | "unknown";
  model?: string;
  status?: number;
  /** Raw provider payload/message — logged in development only. */
  detail?: unknown;
}

export class AIError extends Error {
  readonly kind: AIErrorKind;
  readonly provider: AIProvider | "unknown";
  readonly model?: string;
  readonly status?: number;
  readonly detail?: unknown;

  constructor(kind: AIErrorKind, message: string, meta: AIErrorMeta = {}) {
    super(message);
    this.name = "AIError";
    this.kind = kind;
    this.provider = meta.provider ?? "unknown";
    this.model = meta.model;
    this.status = meta.status;
    this.detail = meta.detail;
  }

  /** Short, user-facing reason — the exact strings Priority 2 asks for. */
  userMessage(): string {
    switch (this.kind) {
      case "rate_limited":
        return "Rate limit exceeded — the AI provider is busy. Please try again shortly.";
      case "auth_error":
        return "Authentication error — the AI provider rejected the API key.";
      case "invalid_model":
        return "Invalid model — the configured AI model is not available.";
      case "timeout":
        return "Timeout — the AI provider took too long to respond.";
      case "network":
        return "Network error reaching the AI provider.";
      case "unavailable":
        return "AI provider unavailable — please try again in a moment.";
      case "empty":
        return "The AI provider returned an empty response.";
      case "not_configured":
        return "No AI provider is configured.";
    }
  }
}

/** Map an HTTP status from any provider to an AIError kind. */
export function kindFromStatus(status: number): AIErrorKind {
  if (status === 401 || status === 403) return "auth_error";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 404) return "invalid_model";
  if (status === 408 || status === 504) return "timeout";
  if (status >= 500) return "unavailable";
  return "unavailable";
}

/** Wrap any thrown value (fetch/abort/timeout) into an AIError. */
export function toAIError(err: unknown, meta: AIErrorMeta = {}): AIError {
  if (err instanceof AIError) return err;
  if (err instanceof DOMException && err.name === "TimeoutError") {
    return new AIError("timeout", "Provider timed out", { ...meta, detail: err.message });
  }
  if (err instanceof DOMException && err.name === "AbortError") {
    return new AIError("timeout", "Request aborted", { ...meta, detail: err.message });
  }
  if (err instanceof TypeError) {
    // fetch() throws TypeError on network failure.
    return new AIError("network", "Network error reaching provider", { ...meta, detail: err.message });
  }
  return new AIError("unavailable", err instanceof Error ? err.message : String(err), {
    ...meta,
    detail: err,
  });
}

/**
 * Rank kinds so the chain reports the MOST informative failure. e.g. if one
 * model was rate-limited and another merely returned empty, "rate limited" is
 * the more useful thing to tell the user.
 */
const SEVERITY: Record<AIErrorKind, number> = {
  auth_error: 6,
  rate_limited: 5,
  invalid_model: 4,
  timeout: 3,
  unavailable: 2,
  empty: 2,
  network: 1,
  not_configured: 0,
};

/** Pick the most informative error from a list of failures. */
export function pickBestError(errors: AIError[]): AIError {
  if (errors.length === 0) return new AIError("not_configured", "No AI provider configured");
  return errors.reduce((best, e) => (SEVERITY[e.kind] >= SEVERITY[best.kind] ? e : best));
}

/** True only in local/dev, gating verbose provider logging (Priority 2). */
export const isDev = process.env.NODE_ENV !== "production";

/** Log a full provider failure in development; stay quiet in production. */
export function logProviderFailure(label: string, err: AIError): void {
  if (!isDev) {
    console.error(`[ai] ${label} failed: ${err.kind}`);
    return;
  }
  console.error(
    `[ai] ${label} failed: ${err.kind} (${err.provider}${err.model ? " · " + err.model : ""}${
      err.status ? " · HTTP " + err.status : ""
    })\n      ${err.message}`,
    err.detail !== undefined ? { detail: err.detail } : ""
  );
}
