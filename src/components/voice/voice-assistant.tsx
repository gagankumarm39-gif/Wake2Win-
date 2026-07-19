"use client";

/**
 * Voice Tutor — hold-to-speak NEET doubt solving.
 *
 * Pipeline: Web Speech API (SpeechRecognition, on-device where the browser
 * supports it — Chrome/Android WebView use the Google recognizer) → transcript
 * → /api/voice (existing provider chain, spoken-style prompt) → optional
 * speechSynthesis read-aloud.
 *
 * The waveform is a live mic-level visual from an AnalyserNode; it doubles as
 * "the mic is actually hearing you" feedback. All browser APIs are feature-
 * detected so unsupported browsers degrade to a typed input, never a crash.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Bot, Keyboard, Mic, MicOff, Send, Volume2, VolumeX } from "lucide-react";
import { getRecognizer, type SpeechRecognitionLike } from "@/lib/speech";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface VoiceTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const BAR_COUNT = 24;

export function VoiceAssistant() {
  const [turns, setTurns] = useState<VoiceTurn[]>([]);
  const [phase, setPhase] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [interim, setInterim] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const [speakReplies, setSpeakReplies] = useState(true);
  const [typedMode, setTypedMode] = useState(false);
  const [typed, setTyped] = useState("");
  const [levels, setLevels] = useState<number[]>(() => Array(BAR_COUNT).fill(0.08));

  const recognizerRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");
  const holdingRef = useRef(false);
  const audioRef = useRef<{ ctx: AudioContext; stream: MediaStream; raf: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const supported = useRef<boolean | null>(null);
  if (supported.current === null && typeof window !== "undefined") {
    supported.current = getRecognizer() !== null;
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, interim, phase]);

  // Cleanup on unmount: stop recognition, mic, TTS and in-flight requests.
  useEffect(
    () => () => {
      recognizerRef.current?.abort();
      stopWaveform();
      abortRef.current?.abort();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    },
    []
  );

  function stopWaveform() {
    const audio = audioRef.current;
    if (!audio) return;
    cancelAnimationFrame(audio.raf);
    audio.stream.getTracks().forEach((t) => t.stop());
    void audio.ctx.close().catch(() => undefined);
    audioRef.current = null;
    setLevels(Array(BAR_COUNT).fill(0.08));
  }

  /** Live mic-level bars via an AnalyserNode (also proves mic permission). */
  async function startWaveform(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) return; // visual is optional
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const step = Math.floor(data.length / BAR_COUNT) || 1;
        setLevels(
          Array.from({ length: BAR_COUNT }, (_, i) => Math.max(0.08, (data[i * step] ?? 0) / 255))
        );
        if (audioRef.current) audioRef.current.raf = requestAnimationFrame(tick);
      };
      audioRef.current = { ctx, stream, raf: 0 };
      audioRef.current.raf = requestAnimationFrame(tick);
    } catch {
      // Permission denied for the visual — recognition itself will surface it.
    }
  }

  const ask = useCallback(
    async (question: string) => {
      const content = question.trim();
      if (!content) return;
      abortRef.current?.abort(); // abort a stale request before starting anew
      const controller = new AbortController();
      abortRef.current = controller;

      const userTurn: VoiceTurn = { id: crypto.randomUUID(), role: "user", content };
      setTurns((prev) => [...prev, userTurn]);
      setPhase("thinking");

      let reply = "I could not reach the AI tutor right now. Please try again.";
      try {
        const history = [...turns, userTurn].slice(-12).map((t) => ({ role: t.role, content: t.content }));
        const res = await fetch("/api/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history }),
          signal: controller.signal,
        });
        if (res.ok) reply = ((await res.json()) as { reply: string }).reply;
      } catch {
        if (controller.signal.aborted) return; // superseded by a newer question
      }

      setTurns((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: reply }]);

      if (speakReplies && typeof window !== "undefined" && window.speechSynthesis) {
        setPhase("speaking");
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(reply);
        utterance.lang = "en-IN";
        utterance.rate = 1.02;
        utterance.onend = () => setPhase("idle");
        utterance.onerror = () => setPhase("idle");
        window.speechSynthesis.speak(utterance);
      } else {
        setPhase("idle");
      }
    },
    [speakReplies, turns]
  );

  /** Hold started — begin recognition + waveform. */
  async function holdStart() {
    if (phase === "thinking" || holdingRef.current) return;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setMicError(null);

    const recognizer = getRecognizer();
    if (!recognizer) {
      setMicError("Speech recognition is not supported in this browser — use the keyboard instead.");
      setTypedMode(true);
      return;
    }

    holdingRef.current = true;
    finalRef.current = "";
    setInterim("");
    setPhase("listening");
    void startWaveform();

    recognizer.lang = "en-IN";
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.onresult = (e) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) finalRef.current += result[0].transcript;
        else interimText += result[0].transcript;
      }
      setInterim(interimText);
    };
    recognizer.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setMicError("Microphone permission was denied. Allow mic access in your browser settings, or type your doubt.");
      } else if (e.error === "no-speech") {
        setMicError("Didn't catch that — hold the button and speak clearly.");
      } else if (e.error !== "aborted") {
        setMicError("Speech recognition failed. Try again or use the keyboard.");
      }
    };
    recognizer.onend = () => {
      // Fires after stop() or on recognizer hiccups while still holding.
      if (holdingRef.current) return; // released handler will finish up
      stopWaveform();
    };
    recognizerRef.current = recognizer;
    try {
      recognizer.start();
    } catch {
      holdingRef.current = false;
      setPhase("idle");
      stopWaveform();
    }
  }

  /** Hold released — stop recognition and send whatever was heard. */
  function holdEnd() {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    recognizerRef.current?.stop();
    stopWaveform();

    // Give the recognizer a beat to flush its final result, then send.
    window.setTimeout(() => {
      const question = (finalRef.current + " " + interim).trim() || finalRef.current.trim();
      setInterim("");
      if (question) {
        void ask(question);
      } else {
        setPhase("idle");
        setMicError((prev) => prev ?? "Didn't catch that — hold the button and speak clearly.");
      }
    }, 350);
  }

  const listening = phase === "listening";

  return (
    <div className="flex flex-1 flex-col">
      {/* Conversation */}
      <div className="mt-6 flex-1 space-y-4 overflow-y-auto pb-4">
        {turns.length === 0 && (
          <div className="glass p-5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            <p className="font-semibold">Try asking out loud:</p>
            <ul className="mt-2 space-y-1">
              <li>🧬 “Why is the genetic code called degenerate?”</li>
              <li>⚡ “State Lenz&apos;s law with an example.”</li>
              <li>🧪 “Why is ozone a better oxidising agent than oxygen?”</li>
            </ul>
          </div>
        )}
        {turns.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn("flex", t.role === "user" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed",
                t.role === "user" ? "rounded-br-md bg-brand-500 text-white" : "glass rounded-bl-md"
              )}
            >
              {t.content}
            </div>
          </motion.div>
        ))}
        {listening && interim && (
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-500/50 px-4 py-3 text-sm italic text-white">
              {interim}…
            </div>
          </div>
        )}
        {phase === "thinking" && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Bot className="h-4 w-4 animate-pulse" /> Thinking…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {micError && (
        <p className="pb-2 text-center text-xs font-medium text-amber-600 dark:text-amber-400">{micError}</p>
      )}

      {/* Waveform */}
      <div className="flex h-12 items-end justify-center gap-1 pb-1" aria-hidden>
        {levels.map((v, i) => (
          <div
            key={i}
            className={cn(
              "w-1.5 rounded-full transition-[height] duration-75",
              listening ? "bg-brand-500" : "bg-slate-300 dark:bg-slate-700"
            )}
            style={{ height: `${Math.round(v * 44) + 4}px` }}
          />
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 pb-4">
        <button
          onClick={() => setSpeakReplies((s) => !s)}
          aria-label={speakReplies ? "Mute spoken replies" : "Speak replies aloud"}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 text-slate-500 transition-colors hover:border-brand-400 hover:text-brand-500 dark:border-slate-700"
        >
          {speakReplies ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
        </button>

        <button
          onPointerDown={(e) => {
            e.preventDefault();
            void holdStart();
          }}
          onPointerUp={holdEnd}
          onPointerLeave={() => holdingRef.current && holdEnd()}
          onPointerCancel={holdEnd}
          onContextMenu={(e) => e.preventDefault()}
          disabled={phase === "thinking"}
          aria-label="Hold to speak"
          className={cn(
            "flex h-20 w-20 touch-none select-none items-center justify-center rounded-full text-white shadow-lg transition-all disabled:opacity-50",
            listening
              ? "scale-110 bg-red-500 shadow-red-500/40"
              : "bg-gradient-to-br from-brand-500 via-brand-400 to-cyan-400 shadow-brand-500/40 active:scale-95"
          )}
        >
          {supported.current === false ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
        </button>

        <button
          onClick={() => setTypedMode((t) => !t)}
          aria-label="Type instead"
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 text-slate-500 transition-colors hover:border-brand-400 hover:text-brand-500 dark:border-slate-700",
            typedMode && "border-brand-400 text-brand-500"
          )}
        >
          <Keyboard className="h-5 w-5" />
        </button>
      </div>

      <p className="pb-3 text-center text-xs text-slate-400">
        {listening ? "Listening — release to send" : "Hold the mic to speak"}
      </p>

      {typedMode && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const q = typed;
            setTyped("");
            void ask(q);
          }}
          className="flex gap-2 pb-2"
        >
          <Input
            placeholder="Type your doubt instead…"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={phase === "thinking"}
          />
          <Button type="submit" disabled={!typed.trim() || phase === "thinking"} aria-label="Send">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      )}
    </div>
  );
}
