import { getLocalQuestions } from "./local-question-bank";
import type { GeneratedQuestion, QuestionRequest } from "@/types";

/**
 * Client-side question fetcher. Tries the AI endpoint; if the network or
 * server fails (including fully offline), silently falls back to the built-in
 * local bank. The user NEVER sees an error.
 */
export async function fetchQuestions(req: QuestionRequest): Promise<GeneratedQuestion[]> {
  try {
    const res = await fetch("/api/questions/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { questions: GeneratedQuestion[] };
    if (!Array.isArray(data.questions) || data.questions.length === 0) throw new Error("empty");
    return data.questions;
  } catch {
    return getLocalQuestions(req);
  }
}
