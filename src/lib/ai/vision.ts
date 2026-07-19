/**
 * Vision / OCR pipeline — image → text, using the SAME provider priority as
 * the text chain (generate.ts) restricted to vision-capable models:
 *
 *   Ollama gemma3:4b (multimodal, local dev only)
 *     → Cloudflare Workers AI moondream (vision QA)
 *     → Gemini (vision, final fallback)
 *
 * OpenRouter's configured free models are text-only, so they are covered by
 * the OCR path instead: this module extracts text/diagram descriptions from
 * the image, and the caller feeds that text through the normal
 * generateWithChain — a provider lacking vision can therefore never fail an
 * image request.
 *
 * Results are cached by content hash so identical images (re-asks, retries,
 * multi-question follow-ups on the same photo) never repeat OCR.
 * This module never creates a new router: it is a thin image→text front-end
 * for the existing chain.
 */

import { createHash } from "node:crypto";
import { describeImageWithCloudflare, isCloudflareConfigured } from "./cloudflare-provider";
import { AIError, kindFromStatus, pickBestError, toAIError } from "./errors";
import { getOllamaModel } from "./ollama-model-router";
import { AI_PROVIDERS } from "./provider-config";

const OLLAMA_VISION_TIMEOUT_MS = 60000;
const GEMINI_VISION_TIMEOUT_MS = 30000;

/** Faithful-transcription prompt shared by every vision provider. */
const TRANSCRIBE_PROMPT = [
  "You are an OCR and diagram-reading engine for NEET study material.",
  "Transcribe ALL text in this image exactly — questions, options (A/B/C/D), labels, values, units.",
  "For diagrams, graphs, flowcharts, tables, circuits or reaction mechanisms, describe the structure precisely:",
  "every label, axis, component, connection, arrow and species, in reading order.",
  "Preserve question numbering. Output plain text only — no commentary, no markdown fences.",
].join("\n");

/** data:image/…;base64,XXXX → { mime, base64 } (throws AIError on junk). */
export function parseDataUrl(dataUrl: string): { mime: string; base64: string } {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl.trim());
  if (!match) {
    throw new AIError("unavailable", "Invalid image data URL", { provider: "unknown" });
  }
  return { mime: match[1], base64: match[2] };
}

// ── OCR cache (content-hash keyed, bounded) ───────────────────────────────

const MAX_CACHE_ENTRIES = 200;
const ocrCache = new Map<string, string>();

function cacheKey(base64: string, question: string): string {
  return createHash("sha256").update(question).update(base64).digest("hex");
}

function cacheGet(key: string): string | undefined {
  const hit = ocrCache.get(key);
  if (hit !== undefined) {
    // Refresh recency (Map preserves insertion order → cheap LRU).
    ocrCache.delete(key);
    ocrCache.set(key, hit);
  }
  return hit;
}

function cacheSet(key: string, value: string): void {
  ocrCache.set(key, value);
  while (ocrCache.size > MAX_CACHE_ENTRIES) {
    const oldest = ocrCache.keys().next().value;
    if (oldest === undefined) break;
    ocrCache.delete(oldest);
  }
}

// ── Vision providers ───────────────────────────────────────────────────────

/** Ollama multimodal generate — gemma3:4b reads images locally. */
async function describeImageWithOllama(base64: string, question: string): Promise<string> {
  const base = process.env.OLLAMA_URL;
  if (!base) throw new AIError("not_configured", "OLLAMA_URL not set", { provider: "ollama" });

  const model = getOllamaModel("vision");
  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: question,
        images: [base64],
        stream: false,
        options: { temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(OLLAMA_VISION_TIMEOUT_MS),
    });
  } catch (err) {
    throw toAIError(err, { provider: "ollama", model });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new AIError(kindFromStatus(res.status), `Ollama vision ${res.status}`, {
      provider: "ollama",
      model,
      status: res.status,
      detail,
    });
  }

  const data = await res.json().catch(() => null);
  const text = data?.response;
  if (typeof text !== "string" || !text.trim()) {
    throw new AIError("empty", "Ollama vision returned an empty response", { provider: "ollama", model });
  }
  return text;
}

/** Gemini vision — inline base64 image + question. */
async function describeImageWithGemini(mime: string, base64: string, question: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AIError("not_configured", "GEMINI_API_KEY not set", { provider: "gemini" });

  const model = AI_PROVIDERS.gemini.defaultModel;
  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: mime, data: base64 } },
                { text: question },
              ],
            },
          ],
          generationConfig: { temperature: 0.2 },
        }),
        signal: AbortSignal.timeout(GEMINI_VISION_TIMEOUT_MS),
      }
    );
  } catch (err) {
    throw toAIError(err, { provider: "gemini", model });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new AIError(kindFromStatus(res.status), `Gemini vision ${res.status}`, {
      provider: "gemini",
      model,
      status: res.status,
      detail,
    });
  }

  const data = await res.json().catch(() => null);
  const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
  if (!text || !text.trim()) {
    throw new AIError("empty", "Gemini vision returned an empty response", { provider: "gemini", model });
  }
  return text;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Ask the vision chain a question about one image (data URL). One attempt per
 * provider, first success wins — mirrors generate.ts. Throws the most
 * informative AIError when every vision provider fails.
 */
export async function describeImage(dataUrl: string, question: string): Promise<string> {
  const { mime, base64 } = parseDataUrl(dataUrl);
  const key = cacheKey(base64, question);
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  interface VisionCandidate {
    provider: "ollama" | "cloudflare" | "gemini";
    model: string;
    run: () => Promise<string>;
  }

  const candidates: VisionCandidate[] = [
    ...(process.env.OLLAMA_URL
      ? [{
          provider: "ollama" as const,
          model: getOllamaModel("vision"),
          run: () => describeImageWithOllama(base64, question),
        }]
      : []),
    ...(isCloudflareConfigured()
      ? [{
          provider: "cloudflare" as const,
          model: "@cf/moondream/moondream3.1-9B-A2B",
          run: () => describeImageWithCloudflare(dataUrl, question),
        }]
      : []),
    ...(process.env.GEMINI_API_KEY
      ? [{
          provider: "gemini" as const,
          model: AI_PROVIDERS.gemini.defaultModel,
          run: () => describeImageWithGemini(mime, base64, question),
        }]
      : []),
  ];

  if (candidates.length === 0) {
    throw new AIError("not_configured", "No vision-capable AI provider configured");
  }

  const errors: AIError[] = [];
  for (const candidate of candidates) {
    const started = Date.now();
    try {
      const text = (await candidate.run()).trim();
      if (text) {
        console.log(
          `[AI] Provider: ${candidate.provider}\nModel: ${candidate.model}\nStatus: Success (vision)\nLatency: ${Date.now() - started} ms`
        );
        cacheSet(key, text);
        return text;
      }
      errors.push(new AIError("empty", `${candidate.provider} vision returned empty text`, { provider: candidate.provider }));
    } catch (err) {
      const aiErr = err instanceof AIError ? err : toAIError(err, { provider: candidate.provider });
      console.error(
        `[AI] Provider: ${candidate.provider}\nModel: ${candidate.model}\nStatus: Failed (vision)\nReason: ${aiErr.kind}\nLatency: ${Date.now() - started} ms`
      );
      errors.push(aiErr);
    }
  }
  throw pickBestError(errors);
}

/**
 * OCR an image (data URL) into faithful plain text — cached by content hash,
 * so repeated requests for the same image are free.
 */
export function extractImageText(dataUrl: string): Promise<string> {
  return describeImage(dataUrl, TRANSCRIBE_PROMPT);
}

/**
 * OCR several images and merge them into one numbered context block the text
 * chain can reason over. Images resolve sequentially to stay gentle on the
 * local Ollama server.
 */
export async function extractImagesContext(dataUrls: string[]): Promise<string> {
  const parts: string[] = [];
  for (let i = 0; i < dataUrls.length; i++) {
    const text = await extractImageText(dataUrls[i]);
    parts.push(dataUrls.length > 1 ? `--- Image ${i + 1} ---\n${text}` : text);
  }
  return parts.join("\n\n");
}
