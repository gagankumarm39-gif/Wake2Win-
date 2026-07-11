import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { openChatStream, StreamError } from "@/lib/ai/streaming";
import { generateWithChain } from "@/lib/ai/generate";
import { AIError, logProviderFailure } from "@/lib/ai/errors";
import { getUserProviderKeys } from "@/lib/ai/user-keys";
import { buildNotesPrompt } from "@/lib/ai/notes-generator";
import { getExam } from "@/lib/exams/registry";
import { NOTE_FOCUSES, NOTE_LANGUAGES, NOTE_LENGTHS, type NoteConfig } from "@/types/ai-studio";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  examId: z.string().min(1).max(50),
  subject: z.string().min(1).max(60),
  chapter: z.string().min(1).max(120),
  language: z.enum(NOTE_LANGUAGES),
  length: z.enum(NOTE_LENGTHS),
  focus: z.enum(NOTE_FOCUSES),
  /** Overwrite this saved note instead of creating a new one (regenerate). */
  noteId: z.string().uuid().optional(),
});

/**
 * Streams the notes as SSE token events (same event shape as the assistant
 * stream), saving the finished markdown to ai_notes. Falls back to the
 * non-streaming provider chain if every streaming provider fails.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { noteId, ...config } = parsed.data;

  const exam = getExam(config.examId);
  if (!exam) return NextResponse.json({ error: "Unknown exam" }, { status: 400 });
  if (!exam.subjects[config.subject]?.includes(config.chapter)) {
    return NextResponse.json({ error: "Unknown subject/chapter" }, { status: 400 });
  }

  const userKeys = await getUserProviderKeys(user.id);
  const { system, user: userPrompt } = buildNotesPrompt(config as NoteConfig);

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true; // client went away — keep going so we can persist the note
        }
      };

      let full = "";
      let model: string | null = null;
      try {
        const result = await openChatStream(
          [
            { role: "system", content: system },
            { role: "user", content: userPrompt },
          ],
          request.signal,
          userKeys
        );
        model = result.model;
        send({ type: "model", model: result.model });
        for await (const token of result.tokens) {
          full += token;
          send({ type: "token", text: token });
        }
      } catch (err) {
        const aborted = err instanceof StreamError && err.kind === "aborted";
        if (!aborted && full.length === 0) {
          // Every streaming provider failed — one non-streaming attempt.
          try {
            const res = await generateWithChain(`${system}\n\n${userPrompt}`, { json: false, userKeys });
            full = res.text;
            model = res.provider;
            send({ type: "token", text: full });
          } catch (fallbackErr) {
            // Report the REAL reason (rate limit / auth / timeout …) — Priority 2.
            const aiErr = fallbackErr instanceof AIError ? fallbackErr : null;
            if (aiErr) logProviderFailure("notes fallback", aiErr);
            send({
              type: "error",
              message: aiErr ? aiErr.userMessage() : "All AI providers are busy right now. Please try again in a minute.",
            });
          }
        }
      }

      let savedId: string | null = null;
      if (full.trim()) {
        const record = {
          title: `${config.chapter} — ${config.length}`,
          exam: exam.id,
          exam_name: exam.name,
          subject: config.subject,
          chapter: config.chapter,
          language: config.language,
          length: config.length,
          focus: config.focus,
          content: full,
        };
        if (noteId) {
          // Regenerate in place; extras reset because they described the old content.
          const { data } = await supabase
            .from("ai_notes")
            .update({ ...record, extras: {} })
            .eq("id", noteId)
            .eq("user_id", user.id)
            .select("id")
            .single();
          savedId = data?.id ?? null;
        }
        if (!savedId) {
          const { data } = await supabase
            .from("ai_notes")
            .insert({ user_id: user.id, ...record })
            .select("id")
            .single();
          savedId = data?.id ?? null;
        }
      }

      send({ type: "done", noteId: savedId, model });
      if (!closed) {
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed by cancel
        }
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
