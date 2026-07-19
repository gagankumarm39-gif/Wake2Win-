"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Bot, Camera, History, ImagePlus, Lightbulb, Mic, Plus, Send, Square, ThumbsDown, ThumbsUp, Volume2, VolumeX, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { prepareImages, type PreparedImage } from "@/lib/images/client";
import { getRecognizer, type SpeechRecognitionLike } from "@/lib/speech";
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
      /** Preview object URLs of images attached to this (user) message. */
      images?: string[];
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
  const [attachments, setAttachments] = useState<PreparedImage[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  /** Auto-send the dictated text when the mic stops (persisted preference). */
  const [autoSend, setAutoSend] = useState(false);
  /** id of the message currently being read aloud, or null. */
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const recognizerRef = useRef<SpeechRecognitionLike | null>(null);
  /** Input text present when the mic started — dictation appends to it. */
  const dictationBaseRef = useRef("");
  const autoSendRef = useRef(autoSend);
  autoSendRef.current = autoSend;
  /** Latest sendText — recognizer callbacks outlive the render they close over. */
  const sendTextRef = useRef<(content: string) => Promise<void>>(async () => {});

  // /api/assistant caps image turns at 4 images (MAX_CHAT_IMAGES).
  const MAX_ATTACHMENTS = 4;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items, busy]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      recognizerRef.current?.abort();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    },
    []
  );

  useEffect(() => {
    try {
      setAutoSend(localStorage.getItem("w2w:voice-autosend") === "1");
    } catch {}
  }, []);

  function toggleAutoSend() {
    setAutoSend((prev) => {
      try {
        localStorage.setItem("w2w:voice-autosend", prev ? "0" : "1");
      } catch {}
      return !prev;
    });
  }

  /** Toggle speech-to-text dictation into the input field. */
  function toggleMic() {
    if (listening) {
      recognizerRef.current?.stop();
      return;
    }
    const recognizer = getRecognizer();
    if (!recognizer) {
      setMicError("Speech recognition is not supported in this browser — type your doubt instead.");
      return;
    }
    setMicError(null);
    dictationBaseRef.current = input ? `${input.trimEnd()} ` : "";
    let final = "";

    recognizer.lang = "en-IN";
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) final += result[0].transcript;
        else interim += result[0].transcript;
      }
      setInput(dictationBaseRef.current + final + interim);
    };
    recognizer.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setMicError("Microphone permission was denied. Allow mic access in your browser settings.");
      } else if (e.error === "no-speech") {
        setMicError("Didn't catch that — tap the mic and speak clearly.");
      } else if (e.error !== "aborted") {
        setMicError("Speech recognition failed. Try again or type instead.");
      }
    };
    recognizer.onend = () => {
      setListening(false);
      recognizerRef.current = null;
      // Drop any lingering interim text; keep base + final results only.
      const dictated = dictationBaseRef.current + final;
      setInput(dictated);
      if (autoSendRef.current && dictated.trim()) void sendTextRef.current(dictated);
    };
    recognizerRef.current = recognizer;
    try {
      recognizer.start();
      setListening(true);
    } catch {
      recognizerRef.current = null;
    }
  }

  /** Read one assistant reply aloud; tap again to stop. */
  function toggleSpeak(item: Extract<ChatItem, { kind: "text" }>) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    if (speakingId === item.id) {
      setSpeakingId(null);
      return;
    }
    // Strip markdown syntax so TTS doesn't read asterisks and pipes.
    const plain = item.content
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[*_#`>|]/g, " ")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    if (!plain) return;
    const utterance = new SpeechSynthesisUtterance(plain);
    utterance.lang = "en-IN";
    utterance.rate = 1.02;
    utterance.onend = () => setSpeakingId((id) => (id === item.id ? null : id));
    utterance.onerror = () => setSpeakingId((id) => (id === item.id ? null : id));
    setSpeakingId(item.id);
    window.speechSynthesis.speak(utterance);
  }

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

  /** Original non-streaming path — the silent fallback, and the ONLY path for
   *  image turns (/api/assistant/stream does not accept images). */
  async function legacyReply(history: ChatItem[], images?: string[]) {
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
          ...(images?.length ? { images } : {}),
        }),
      });
      if (res.ok) reply = ((await res.json()) as { reply: string }).reply;
    } catch {
      /* offline — friendly default above */
    }
    setItems((prev) => [...prev, { id: crypto.randomUUID(), kind: "text", role: "assistant", content: reply }]);
  }

  async function sendText(content: string) {
    const attached = attachments;
    if ((!content.trim() && attached.length === 0) || busy) return;
    if (listening) recognizerRef.current?.stop();
    const userItem: ChatItem = {
      id: crypto.randomUUID(),
      kind: "text",
      role: "user",
      content: content.trim() || "What is in this image? Explain it for NEET.",
      images: attached.length ? attached.map((a) => a.previewUrl) : undefined,
    };
    const history = [...items, userItem];
    setItems(history);
    setInput("");
    setAttachments([]);
    setAttachError(null);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      if (attached.length) {
        // Image turn: vision runs server-side on /api/assistant only.
        await legacyReply(history, attached.map((a) => a.dataUrl));
      } else {
        const streamed = await streamReply(content, controller.signal);
        if (!streamed) await legacyReply(history);
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }
  sendTextRef.current = sendText;

  async function onPickImages(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      setAttachError(`You can attach up to ${MAX_ATTACHMENTS} images per message.`);
      return;
    }
    const { images, error } = await prepareImages(Array.from(files).slice(0, room));
    setAttachments((prev) => [...prev, ...images]);
    setAttachError(
      error ?? (files.length > room ? `Only ${MAX_ATTACHMENTS} images per message — extras were skipped.` : null)
    );
    if (fileRef.current) fileRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
    setAttachError(null);
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
          onClick={toggleAutoSend}
          title="When on, dictated questions are sent automatically when you stop the mic"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
            autoSend
              ? "border-brand-400 text-brand-500"
              : "border-slate-300 hover:border-brand-400 hover:text-brand-500 dark:border-slate-700"
          )}
        >
          <Mic className="h-3.5 w-3.5" /> Auto-send {autoSend ? "on" : "off"}
        </button>
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
                {item.role === "user" && item.images && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {item.images.map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
                      <img
                        key={i}
                        src={src}
                        alt={`Attachment ${i + 1}`}
                        className="max-h-40 rounded-xl object-contain"
                      />
                    ))}
                  </div>
                )}
                {item.role === "assistant" ? <Markdown content={item.content} /> : item.content}
                {item.role === "assistant" && item.id !== "hello" && (
                  <div className="mt-2 flex items-center gap-1 text-slate-400">
                    <button
                      onClick={() => toggleSpeak(item)}
                      aria-label={speakingId === item.id ? "Stop reading aloud" : "Listen"}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md p-1 text-[11px] font-semibold hover:text-brand-500",
                        speakingId === item.id && "text-brand-500"
                      )}
                    >
                      {speakingId === item.id ? (
                        <>
                          <VolumeX className="h-3.5 w-3.5" /> Stop
                        </>
                      ) : (
                        <>
                          <Volume2 className="h-3.5 w-3.5" /> Listen
                        </>
                      )}
                    </button>
                    {item.dbId && (
                      <>
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
                      </>
                    )}
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

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 pb-2">
          {attachments.map((a, i) => (
            <div key={a.previewUrl} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
              <img src={a.previewUrl} alt={a.name} className="h-16 w-16 rounded-xl object-cover" />
              <button
                type="button"
                onClick={() => removeAttachment(i)}
                aria-label={`Remove ${a.name}`}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/70 text-white hover:bg-slate-900"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {attachError && (
        <p className="pb-2 text-xs font-medium text-amber-600 dark:text-amber-400">{attachError}</p>
      )}
      {micError && (
        <p className="pb-2 text-xs font-medium text-amber-600 dark:text-amber-400">{micError}</p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendText(input);
        }}
        className="flex gap-2"
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => void onPickImages(e.target.files)}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => void onPickImages(e.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => cameraRef.current?.click()}
          disabled={busy || attachments.length >= MAX_ATTACHMENTS}
          aria-label="Take photo"
        >
          <Camera className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={busy || attachments.length >= MAX_ATTACHMENTS}
          aria-label="Attach images"
        >
          <ImagePlus className="h-4 w-4" />
        </Button>
        <Input
          placeholder={listening ? "Listening — speak your doubt…" : "Ask anything — concepts, doubts, strategy…"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        <Button
          type="button"
          variant="outline"
          onClick={toggleMic}
          disabled={busy}
          aria-label={listening ? "Stop dictation" : "Speak your question"}
          className={cn(listening && "animate-pulse border-red-500 text-red-500 hover:text-red-500")}
        >
          <Mic className="h-4 w-4" />
        </Button>
        {busy ? (
          <Button type="button" variant="outline" onClick={stopStreaming} aria-label="Stop generating">
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="submit" disabled={!input.trim() && attachments.length === 0} aria-label="Send">
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
