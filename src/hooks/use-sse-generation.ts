"use client";

import { useCallback, useRef, useState } from "react";

/** Event shape shared by the assistant and notes SSE streams. */
interface SSEEvent {
  type: "meta" | "model" | "token" | "error" | "done";
  text?: string;
  message?: string;
  model?: string | null;
  noteId?: string | null;
}

export interface SSEGenerationState {
  text: string;
  streaming: boolean;
  error: string | null;
  model: string | null;
}

/**
 * Reusable POST-and-stream hook: sends JSON to an SSE endpoint, accumulates
 * token events into `text`, and resolves with the `done` payload. A new
 * start() aborts any in-flight stream.
 */
export function useSSEGeneration(url: string) {
  const [state, setState] = useState<SSEGenerationState>({
    text: "",
    streaming: false,
    error: null,
    model: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((s) => ({ ...s, streaming: false }));
  }, []);

  const start = useCallback(
    async (body: unknown): Promise<{ noteId: string | null; text: string } | null> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setState({ text: "", streaming: true, error: null, model: null });

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Request failed (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let acc = "";
        let doneId: string | null = null;
        let sawDone = false;

        for (;;) {
          const { done: finished, value } = await reader.read();
          if (finished) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            let event: SSEEvent;
            try {
              event = JSON.parse(trimmed.slice(5).trim()) as SSEEvent;
            } catch {
              continue;
            }
            if (event.type === "token" && event.text) {
              acc += event.text;
              setState((s) => ({ ...s, text: acc }));
            } else if (event.type === "model") {
              setState((s) => ({ ...s, model: event.model ?? null }));
            } else if (event.type === "error") {
              throw new Error(event.message ?? "Generation failed");
            } else if (event.type === "done") {
              doneId = event.noteId ?? null;
              sawDone = true;
            }
          }
        }

        setState((s) => ({ ...s, streaming: false }));
        return sawDone || acc ? { noteId: doneId, text: acc } : null;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return null;
        setState((s) => ({
          ...s,
          streaming: false,
          error: err instanceof Error ? err.message : "Generation failed",
        }));
        return null;
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [url]
  );

  return { ...state, start, stop, setText: (text: string) => setState((s) => ({ ...s, text })) };
}
