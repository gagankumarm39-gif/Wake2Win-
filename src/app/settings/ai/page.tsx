"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AI_PROVIDER_ORDER, AI_PROVIDERS, type AIProviderMeta } from "@/lib/ai/provider-config";
import { cn } from "@/lib/utils";
import type { AIProvider, UserAIKeyInfo } from "@/types";

/**
 * Settings → AI Providers: bring-your-own-key management.
 * Keys are write-only from the browser's perspective — once saved, only
 * connection status/model/timestamps ever come back from the server.
 */

type Feedback = { tone: "success" | "error" | "info"; text: string } | null;

interface CardState {
  keyInput: string;
  model: string;
  busy: "save" | "test" | "delete" | null;
  feedback: Feedback;
  /** Show the replace form even though a key is already connected. */
  editing: boolean;
}

const initialCard: CardState = { keyInput: "", model: "", busy: null, feedback: null, editing: false };

function maskFor(meta: AIProviderMeta): string {
  // Placeholder minus its trailing ellipsis, padded with bullets: "sk-or-v1-••••••••••••"
  return meta.keyPlaceholder.replace(/…$/, "") + "••••••••••••";
}

function formatUpdated(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AIProvidersPage() {
  const [statuses, setStatuses] = useState<Record<AIProvider, UserAIKeyInfo> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cards, setCards] = useState<Record<AIProvider, CardState>>({
    gemini: { ...initialCard },
    openrouter: { ...initialCard },
    openai: { ...initialCard },
    anthropic: { ...initialCard },
    // Server-side providers, never rendered (the page maps AI_PROVIDER_ORDER).
    ollama: { ...initialCard },
    cloudflare: { ...initialCard },
  });

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/ai-keys");
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { providers: UserAIKeyInfo[] };
        const map = Object.fromEntries(data.providers.map((p) => [p.provider, p]));
        setStatuses(map as Record<AIProvider, UserAIKeyInfo>);
      } catch {
        setLoadError("Could not load your provider settings. Refresh to try again.");
      }
    })();
  }, []);

  function patchCard(provider: AIProvider, patch: Partial<CardState>) {
    setCards((c) => ({ ...c, [provider]: { ...c[provider], ...patch } }));
  }

  async function saveKey(provider: AIProvider) {
    const card = cards[provider];
    const apiKey = card.keyInput.trim();
    if (!apiKey) {
      patchCard(provider, { feedback: { tone: "error", text: "Paste your API key first." } });
      return;
    }
    patchCard(provider, { busy: "save", feedback: null });
    try {
      const res = await fetch("/api/ai-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey,
          // Server-managed providers (OpenRouter) never store a model.
          model: AI_PROVIDERS[provider].serverManagedModel ? null : card.model.trim() || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Could not save the key");
      setStatuses((s) => (s ? { ...s, [provider]: data.key as UserAIKeyInfo } : s));
      patchCard(provider, {
        busy: null,
        keyInput: "",
        editing: false,
        feedback: { tone: "success", text: "Key saved — it's encrypted and ready to use. ✅" },
      });
    } catch (err) {
      patchCard(provider, {
        busy: null,
        feedback: { tone: "error", text: err instanceof Error ? err.message : "Could not save the key" },
      });
    }
  }

  async function testKey(provider: AIProvider) {
    const card = cards[provider];
    const typedKey = card.keyInput.trim();
    patchCard(provider, {
      busy: "test",
      feedback: { tone: "info", text: "Testing connection…" },
    });
    try {
      const res = await fetch("/api/ai-keys/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          // A freshly typed key is tested as-is (before saving); otherwise
          // the server tests the stored key.
          ...(typedKey ? { apiKey: typedKey } : {}),
          model: AI_PROVIDERS[provider].serverManagedModel ? null : card.model.trim() || null,
        }),
      });
      const data = await res.json().catch(() => null);
      const ok = Boolean(data?.ok);
      patchCard(provider, {
        busy: null,
        feedback: {
          tone: ok ? "success" : "error",
          text: data?.message ?? (ok ? "Connected." : "Test failed."),
        },
      });
    } catch {
      patchCard(provider, {
        busy: null,
        feedback: { tone: "error", text: "Could not reach the server. Try again." },
      });
    }
  }

  async function deleteKey(provider: AIProvider) {
    if (!window.confirm(`Remove your ${AI_PROVIDERS[provider].name} key? Wake2Win will fall back to its built-in AI.`)) {
      return;
    }
    patchCard(provider, { busy: "delete", feedback: null });
    try {
      const res = await fetch("/api/ai-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Could not delete the key");
      setStatuses((s) =>
        s
          ? { ...s, [provider]: { provider, connected: false, defaultModel: null, updatedAt: null } }
          : s
      );
      patchCard(provider, {
        busy: null,
        keyInput: "",
        model: "",
        editing: false,
        feedback: { tone: "success", text: "Key removed." },
      });
    } catch (err) {
      patchCard(provider, {
        busy: null,
        feedback: { tone: "error", text: err instanceof Error ? err.message : "Could not delete the key" },
      });
    }
  }

  return (
    <main className="min-h-dvh px-6 py-10 bg-gradient-to-b from-white via-brand-50 to-white dark:from-[#0b0f1a] dark:via-[#131a2e] dark:to-[#0b0f1a]">
      <div className="mx-auto max-w-2xl">
        <Link href="/profile" className="text-sm text-slate-500 hover:text-brand-500">← Profile</Link>
        <h1 className="mt-1 text-3xl font-extrabold">AI Providers</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Bring your own API key for faster, more reliable AI. Your key is encrypted on our
          server and never shown again. When your key fails or is missing, Wake2Win automatically
          falls back to its built-in AI — quizzes and chat always keep working.
        </p>

        {loadError && (
          <p className="mt-6 rounded-xl bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400" role="alert">
            {loadError}
          </p>
        )}

        {!statuses && !loadError && (
          <p className="mt-10 text-center text-sm text-slate-500" role="status">Loading providers…</p>
        )}

        {statuses && (
          <div className="mt-6 space-y-5">
            {AI_PROVIDER_ORDER.map((provider) => {
              const meta = AI_PROVIDERS[provider];
              const status = statuses[provider];
              const card = cards[provider];
              const connected = status.connected;
              const showForm = !connected || card.editing;
              const updated = formatUpdated(status.updatedAt);

              return (
                <section key={provider} className="glass p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="flex items-center gap-2 text-lg font-bold">
                        {meta.name}
                        {meta.badge && (
                          <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-500">
                            {meta.badge}
                          </span>
                        )}
                      </h2>
                      <p className="text-xs text-slate-500">{meta.tagline}</p>
                    </div>
                    <span
                      className={cn(
                        "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
                        connected
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-slate-500/10 text-slate-500"
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          connected ? "bg-emerald-500" : "bg-slate-400"
                        )}
                      />
                      {connected ? "Connected" : "Not connected"}
                    </span>
                  </div>

                  {connected && (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-white/50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/40">
                      <p className="font-mono text-slate-600 dark:text-slate-300">{maskFor(meta)}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {meta.serverManagedModel
                          ? "Model: chosen automatically by Wake2Win"
                          : `Model: ${status.defaultModel ?? `${meta.defaultModel} (default)`}`}
                        {updated && <> · Updated {updated}</>}
                      </p>
                    </div>
                  )}

                  {showForm && (
                    <div className="mt-4 space-y-3">
                      <div>
                        <label className="text-sm font-medium" htmlFor={`${provider}-key`}>
                          {connected ? "New API key" : "API key"}
                        </label>
                        <Input
                          id={`${provider}-key`}
                          type="password"
                          autoComplete="off"
                          spellCheck={false}
                          className="mt-1.5 font-mono"
                          placeholder={meta.keyPlaceholder}
                          value={card.keyInput}
                          onChange={(e) => patchCard(provider, { keyInput: e.target.value })}
                        />
                        <p className="mt-1 text-xs text-slate-500">
                          Get a key at{" "}
                          <a
                            href={meta.keyUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-brand-500 underline-offset-2 hover:underline"
                          >
                            {new URL(meta.keyUrl).hostname}
                          </a>
                        </p>
                      </div>
                      {meta.serverManagedModel ? (
                        <p className="text-xs text-slate-500">
                          No model to choose — Wake2Win automatically picks the best available
                          free model for every request.
                        </p>
                      ) : (
                        <div>
                          <label className="text-sm font-medium" htmlFor={`${provider}-model`}>
                            Model <span className="font-normal text-slate-500">(optional)</span>
                          </label>
                          <Input
                            id={`${provider}-model`}
                            list={`${provider}-models`}
                            className="mt-1.5 font-mono text-xs"
                            placeholder={meta.defaultModel}
                            value={card.model}
                            onChange={(e) => patchCard(provider, { model: e.target.value })}
                          />
                          <datalist id={`${provider}-models`}>
                            {meta.models.map((m) => (
                              <option key={m} value={m} />
                            ))}
                          </datalist>
                        </div>
                      )}
                    </div>
                  )}

                  {card.feedback && (
                    <p
                      role="status"
                      className={cn(
                        "mt-3 text-sm",
                        card.feedback.tone === "success" && "text-emerald-600 dark:text-emerald-400",
                        card.feedback.tone === "error" && "text-red-600 dark:text-red-400",
                        card.feedback.tone === "info" && "text-slate-500"
                      )}
                    >
                      {card.feedback.text}
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {showForm ? (
                      <>
                        <Button size="sm" disabled={card.busy !== null} onClick={() => void saveKey(provider)}>
                          {card.busy === "save" ? "Saving…" : connected ? "Replace key" : "Save key"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={card.busy !== null || (!connected && !card.keyInput.trim())}
                          onClick={() => void testKey(provider)}
                        >
                          {card.busy === "test" ? "Testing…" : "Test connection"}
                        </Button>
                        {connected && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={card.busy !== null}
                            onClick={() => patchCard(provider, { editing: false, keyInput: "", feedback: null })}
                          >
                            Cancel
                          </Button>
                        )}
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={card.busy !== null}
                          onClick={() => void testKey(provider)}
                        >
                          {card.busy === "test" ? "Testing…" : "Test connection"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={card.busy !== null}
                          onClick={() =>
                            patchCard(provider, {
                              editing: true,
                              model: meta.serverManagedModel ? "" : status.defaultModel ?? "",
                              feedback: null,
                            })
                          }
                        >
                          Replace key
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500 hover:bg-red-500/10"
                          disabled={card.busy !== null}
                          onClick={() => void deleteKey(provider)}
                        >
                          {card.busy === "delete" ? "Removing…" : "Delete"}
                        </Button>
                      </>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <p className="mt-8 text-center text-xs text-slate-500">
          Keys are stored with AES-256 encryption and only ever decrypted on the server, at the
          moment of an AI request. Priority: your key → Wake2Win's key → offline question bank.
        </p>
      </div>
    </main>
  );
}
