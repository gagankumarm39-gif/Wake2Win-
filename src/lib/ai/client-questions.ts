import { getLocalQuestions } from "./local-question-bank";
import type { GeneratedQuestion, QuestionRequest } from "@/types";

/**
 * Client-side question fetcher. Tries the AI endpoint; if the network or
 * server fails (including fully offline), silently falls back to the built-in
 * local bank. The user NEVER sees an error.
 *
 * Timeout is generous (Priority 5): the server may try several free-tier
 * models plus Gemini with one retry before answering, which legitimately takes
 * longer than the old 15s. Cutting it too short discarded slow-but-successful
 * AI generations and forced the local bank unnecessarily.
 */
const CLIENT_TIMEOUT_MS = 30_000;

/**
 * In-flight de-duplication (Priority 5): collapse identical requests fired at
 * the same moment (e.g. React strict-mode double mount) into one network call.
 * Cleared as soon as the request settles, so successive rings still get FRESH
 * questions — this caches nothing across time, only across concurrency.
 */
const inFlight = new Map<string, Promise<GeneratedQuestion[]>>();

function keyOf(req: QuestionRequest): string {
  return JSON.stringify([req.exam, req.subject, req.chapter ?? "", req.difficulty, req.count]);
}

async function fetchFromServer(req: QuestionRequest): Promise<GeneratedQuestion[]> {
  try {
    const res = await fetch("/api/questions/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { questions: GeneratedQuestion[] };
    if (!Array.isArray(data.questions) || data.questions.length === 0) throw new Error("empty");
    return data.questions;
  } catch {
    return getLocalQuestions(req);
  }
}

export async function fetchQuestions(req: QuestionRequest): Promise<GeneratedQuestion[]> {
  const key = keyOf(req);
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = fetchFromServer(req).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}
