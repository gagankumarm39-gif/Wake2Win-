"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Bot, History, Lightbulb, Plus, Send, Square, ThumbsDown, ThumbsUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchQuestions } from "@/lib/ai/client-questions";
import { dailySubject, defaultSubject } from "@/lib/exam-data";
import type { TopicStat } from "@/lib/weak-topics";
import { Markdown } from "@/components/assistant/markdown";
import { ChatHistory } from "@/components/assistant/history";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Conversation, Difficulty, Exam, GeneratedQuestion, StoredMessage } from "@/types";

type ChatItem =
  | {
      id: string;
      kind: "text";
      role: "user" | "assistant";
      content: string;
      /** DB id of the persisted message — enables like/dislike. */
      dbId?: string;
      model?: string | null;
      liked?: boolean | null;
    }
  | { id: string; kind: "quiz"; title: string; subject: string; difficulty: Difficulty; questions: GeneratedQuestion[] };

type StreamEvent =
  | { type: "meta"; conversationId: string }
  | { type: "model"; model: string }
  | { type: "token"; text: string }
  | { type: "done"; messageId: string | null; model: string | null };

function QuizCard({
  item,
  exam,
}: {
  item: Extract<ChatItem, { kind: "quiz" }>;
  exam: Exam;
}) {
  const supabase = createClient();
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [finished, setFinished] = useState(false);
  const startRef = useRef(Date.now());

  const q = item.questions[idx];

  async function answer(i: number) {
    if (picked !== null) return;
    setPicked(i);
    const correct = i === q.correctIndex;
    if (correct) setScore((s) => s + 1);

    const seconds = Math.round((Date.now() - startRef.current) / 100) / 10;
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      void supabase.from("question_attempts").insert({
        user_id: user.id,
        exam,
        subject: item.subject,
        difficulty: item.difficulty,
        source: q.source,
        correct,
        time_taken_seconds: seconds,
      });
    }
  }

  async function next() {
    if (idx + 1 >= item.questions.length) {
      setFinished(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user && score > 0) {
        const { data: p } = await supabase.from("profiles").select("xp, coins").eq("id", user.id).single();
        if (p) {
          await supabase
            .from("profiles")
            .update({ xp: p.xp + score * 5, coins: p.coins + score })
            .eq("id", user.id);
        }
      }
      return;
    }
    setIdx(idx + 1);
    setPicked(null);
    setShowHint(false);
    startRef.current = Date.now();
  }

  if (finished) {
    return (
      <div className="glass p-5">
        <p className="font-bold">{item.title} — complete! 🎉</p>
        <p className="mt-1 text-sm">
          Score: <span className="font-bold text-brand-500">{score}/{item.questions.length}</span>
          {score > 0 && <span className="text-slate-500"> · +{score * 5} XP · +{score} coins</span>}
        </p>
      </div>
    );
  }

  return (
    <div className="glass p-5">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="font-semibold">{item.title}</span>
        <span>{idx + 1} / {item.questions.length}</span>
      </div>
      <p className="mt-2 font-semibold leading-relaxed">{q.question}</p>

      <div className="mt-3 space-y-2">
        {q.options.map((opt, i) => {
          const isCorrect = picked !== null && i === q.correctIndex;
          const isWrongPick = picked === i && i !== q.correctIndex;
          return (
            <button
              key={i}
              onClick={() => answer(i)}
              disabled={picked !== null}
              className={cn(
                "w-full rounded-xl border px-4 py-2.5 text-left text-sm transition-colors",
                isCorrect
                  ? "border-emerald-500 bg-emerald-500/10"
                  : isWrongPick
                    ? "border-red-500 bg-red-500/10"
                    : "border-slate-300 hover:border-brand-400 dark:border-slate-700"
              )}
            >
              <span className="mr-2 font-bold text-brand-500">{String.fromCharCode(65 + i)}.</span>
              {opt}
            </button>
          );
        })}
      </div>

      {picked === null ? (
        q.hint && (
          <button
            onClick={() => setShowHint(!showHint)}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-500 hover:underline"
          >
            <Lightbulb className="h-3.5 w-3.5" /> {showHint ? q.hint : "Show hint"}
          </button>
        )
      ) : (
        <div className="mt-3">
          <p className="rounded-xl bg-brand-500/10 p-3 text-xs leading-relaxed">
            <span className="font-bold">Explanation: </span>
            {q.explanation}
          </p>
          <Button size="sm" className="mt-3" onClick={next}>
            {idx + 1 >= item.questions.length ? "Finish" : "Next question"}
          </Button>
        </div>
      )}
    </div>
  );
}

function helloItem(exam: Exam): ChatItem {
  return {
    id: "hello",
    kind: "text",
    role: "assistant",
    content: `Hey! I'm your ${exam} study assistant. I can quiz you, explain answers, find your weak topics, and keep you motivated. Try a quick action below 👇`,
  };
}

export function AssistantChat({ exam, topics }: { exam: Exam; topics: TopicStat[] }) {
  const supabase = createClient();
  const [items, setItems] = useState<ChatItem[]>([helloItem(exam)]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items, busy]);

  useEffect(() => () => abortRef.current?.abort(), []);

  /** Token-by-token reply via /api/assistant/stream. Returns false when the
   *  endpoint is unreachable/errored so the legacy route can take over. */
  async function streamReply(content: string, signal: AbortSignal): Promise<boolean> {
    let res: Response;
    try {
      res = await fetch("/api/assistant/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversationId ?? undefined, message: content }),
        signal,
      });
    } catch {
      return signal.aborted; // aborted = handled; offline = let the fallback try
    }
    if (!res.ok || !res.body || !res.headers.get("content-type")?.includes("text/event-stream")) {
      return false;
    }

    const id = crypto.randomUUID();
    let created = false;
    const apply = (event: StreamEvent) => {
      if (event.type === "meta") {
        setConversationId(event.conversationId);
      } else if (event.type === "token") {
        if (!created) {
          created = true;
          setItems((prev) => [...prev, { id, kind: "text", role: "assistant", content: event.text }]);
        } else {
          setItems((prev) =>
            prev.map((i) => (i.id === id && i.kind === "text" ? { ...i, content: i.content + event.text } : i))
          );
        }
      } else if (event.type === "done") {
        setItems((prev) =>
          prev.map((i) =>
            i.id === id && i.kind === "text"
              ? { ...i, dbId: event.messageId ?? undefined, model: event.model }
              : i
          )
        );
      }
    };

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          try {
            apply(JSON.parse(line.slice(5)) as StreamEvent);
          } catch {
            // skip malformed frame
          }
        }
      }
    } catch {
      // aborted mid-stream — keep whatever text already arrived
    }
    return created || signal.aborted;
  }

  /** Original non-streaming path — kept as the silent fallback. */
  async function legacyReply(history: ChatItem[]) {
    let reply =
      "I'm having trouble reaching the AI right now, but your quizzes still work offline — try 'Quiz me'! 💪";
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history
            .filter((i): i is Extract<ChatItem, { kind: "text" }> => i.kind === "text")
            .slice(-12)
            .map((i) => ({ role: i.role, content: i.content })),
        }),
      });
      if (res.ok) reply = ((await res.json()) as { reply: string }).reply;
    } catch {
      /* offline — friendly default above */
    }
    setItems((prev) => [...prev, { id: crypto.randomUUID(), kind: "text", role: "assistant", content: reply }]);
  }

  async function sendText(content: string) {
    if (!content.trim() || busy) return;
    const userItem: ChatItem = { id: crypto.randomUUID(), kind: "text", role: "user", content };
    const history = [...items, userItem];
    setItems(history);
    setInput("");
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const streamed = await streamReply(content, controller.signal);
      if (!streamed) await legacyReply(history);
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  function stopStreaming() {
    abortRef.current?.abort();
  }

  function newChat() {
    if (busy) stopStreaming();
    setConversationId(null);
    setItems([helloItem(exam)]);
    setHistoryOpen(false);
  }

  async function openConversation(c: Conversation) {
    if (busy) stopStreaming();
    const { data } = await supabase
      .from("messages")
      .select("id, conversation_id, role, content, model, liked, created_at")
      .eq("conversation_id", c.id)
      .order("created_at", { ascending: true })
      .limit(200);
    const rows = (data as StoredMessage[]) ?? [];
    setConversationId(c.id);
    setItems(
      rows.map((m) => ({
        id: m.id,
        kind: "text" as const,
        role: m.role,
        content: m.content,
        dbId: m.id,
        model: m.model,
        liked: m.liked,
      }))
    );
    setHistoryOpen(false);
  }

  function rate(item: Extract<ChatItem, { kind: "text" }>, liked: boolean) {
    if (!item.dbId) return;
    const next = item.liked === liked ? null : liked; // click again to clear
    setItems((prev) => prev.map((i) => (i.id === item.id && i.kind === "text" ? { ...i, liked: next } : i)));
    void supabase.from("messages").update({ liked: next }).eq("id", item.dbId);
  }

  const weakest = topics[0];
  const actions = [
    { label: "🎯 Quiz me", run: () => startQuiz("Practice quiz", weakest?.subject ?? defaultSubject(exam), "medium", 5) },
    { label: "🔥 Daily challenge", run: () => startQuiz("Daily challenge", dailySubject(exam), "hard", 5) },
    { label: "📝 Revision questions", run: () => startQuiz("Revision round", weakest?.subject ?? defaultSubject(exam), "easy", 3) },
    { label: "📊 My weak topics", run: () => sendText("What are my weak topics and how should I improve them?") },
    { label: "⚡ Motivate me", run: () => sendText("Motivate me to study hard today.") },
  ];

  async function startQuiz(title: string, subject: string, difficulty: Difficulty, count: number) {
    if (busy) return;
    setBusy(true);
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), kind: "text", role: "user", content: title },
    ]);
    const questions = await fetchQuestions({ exam, subject, difficulty, count }); // never throws
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), kind: "quiz", title: `${title} · ${subject}`, subject, difficulty, questions },
    ]);
    setBusy(false);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end gap-2 pb-2">
        <button
          onClick={newChat}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-3.5 py-1.5 text-xs font-semibold transition-colors hover:border-brand-400 hover:text-brand-500 dark:border-slate-700"
        >
          <Plus className="h-3.5 w-3.5" /> New chat
        </button>
        <button
          onClick={() => setHistoryOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-3.5 py-1.5 text-xs font-semibold transition-colors hover:border-brand-400 hover:text-brand-500 dark:border-slate-700"
        >
          <History className="h-3.5 w-3.5" /> History
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {items.map((item) =>
          item.kind === "quiz" ? (
            <motion.div key={item.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <QuizCard item={item} exam={exam} />
            </motion.div>
          ) : (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn("flex", item.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                  item.role === "user"
                    ? "bg-brand-500 text-white rounded-br-md whitespace-pre-wrap"
                    : "glass rounded-bl-md"
                )}
              >
                {item.role === "assistant" ? <Markdown content={item.content} /> : item.content}
                {item.role === "assistant" && item.dbId && (
                  <div className="mt-2 flex items-center gap-1 text-slate-400">
                    <button
                      onClick={() => rate(item, true)}
                      aria-label="Good answer"
                      className={cn("rounded-md p-1 hover:text-emerald-500", item.liked === true && "text-emerald-500")}
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => rate(item, false)}
                      aria-label="Bad answer"
                      className={cn("rounded-md p-1 hover:text-red-500", item.liked === false && "text-red-500")}
                    >
                      <ThumbsDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )
        )}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Bot className="h-4 w-4 animate-pulse" /> Thinking…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex flex-wrap gap-2 py-3">
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={a.run}
            disabled={busy}
            className="rounded-full border border-slate-300 px-3.5 py-1.5 text-xs font-semibold transition-colors hover:border-brand-400 hover:text-brand-500 disabled:opacity-50 dark:border-slate-700"
          >
            {a.label}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendText(input);
        }}
        className="flex gap-2"
      >
        <Input
          placeholder="Ask anything — concepts, doubts, strategy…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        {busy ? (
          <Button type="button" variant="outline" onClick={stopStreaming} aria-label="Stop generating">
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="submit" disabled={!input.trim()} aria-label="Send">
            <Send className="h-4 w-4" />
          </Button>
        )}
      </form>

      <ChatHistory
        open={historyOpen}
        activeId={conversationId}
        onClose={() => setHistoryOpen(false)}
        onSelect={(c) => void openConversation(c)}
        onNew={newChat}
        onDeleted={(id) => {
          if (id === conversationId) newChat();
        }}
      />
    </div>
  );
}
