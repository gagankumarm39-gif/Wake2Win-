import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { openChatStream, StreamError, type StreamChatMessage } from "@/lib/ai/streaming";
import { generateAssistantReply, type ChatMessage } from "@/lib/ai/assistant";
import { generateWithGemini, generateWithOpenRouter } from "@/lib/ai/providers";
import { getUserProviderKeys } from "@/lib/ai/user-keys";
import { weakTopics } from "@/lib/weak-topics";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(2000),
});

// Differs from the non-streaming prompt: the streaming chat UI renders
// Markdown/KaTeX, so the model is allowed to format.
const SYSTEM = `You are Wake2Win's AI Study Assistant — a sharp, encouraging coach for Indian competitive exam students (NEET, JEE, UPSC, SSC, GATE, CAT, Boards).
You can: explain concepts and answers, give hints without spoiling, recommend what to revise based on weak topics, create revision plans, and motivate students.
Style: concise (under 200 words), warm, practical, exam-accurate. Never invent statistics about the student beyond the provided context.
Formatting: GitHub-flavored Markdown is rendered — use short lists and bold key terms where helpful, fenced code blocks for code, and LaTeX for math (inline $...$ or display $$...$$).`;

/** Recent messages sent to the model verbatim; older ones live in the rolling summary. */
const MEMORY_WINDOW = 12;
/** Fold older messages into the summary once this many pile up beyond the window. */
const SUMMARIZE_AFTER = 10;

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

interface ConversationRow {
  id: string;
  summary: string | null;
  summarized_count: number;
}

/**
 * Conversation memory: fold messages that fell out of the verbatim window
 * into `conversations.summary` so long chats stay cheap. Best-effort — any
 * failure leaves the summary as-is and the chat keeps working.
 */
async function maybeSummarize(supabase: SupabaseServer, conversation: ConversationRow): Promise<void> {
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversation.id);
  if (!count) return;

  const cutoff = count - MEMORY_WINDOW; // messages older than the verbatim window
  if (cutoff - conversation.summarized_count < SUMMARIZE_AFTER) return;

  const { data: older } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true })
    .range(conversation.summarized_count, cutoff - 1);
  if (!older?.length) return;

  const transcript = older
    .map((m: { role: string; content: string }) => `${m.role === "user" ? "Student" : "Assistant"}: ${m.content}`)
    .join("\n");
  const prompt = `Update this running summary of a study-coaching chat. Keep the student's goals, exam, topics discussed, weak areas and advice already given. Plain text, at most 180 words. Reply with the summary only.

Existing summary:
${conversation.summary ?? "(none yet)"}

New messages to fold in:
${transcript}`;

  let summary = "";
  for (const provider of [generateWithGemini, generateWithOpenRouter]) {
    try {
      summary = (await provider(prompt, false)).trim();
      if (summary) break;
    } catch {
      // try the next provider
    }
  }
  if (!summary) return;

  await supabase
    .from("conversations")
    .update({ summary, summarized_count: cutoff })
    .eq("id", conversation.id);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { conversationId, message } = parsed.data;

  // Resolve the conversation — verify ownership, or create one titled after
  // the first message. RLS also enforces ownership; the check gives a clean 404.
  let conversation: ConversationRow;
  if (conversationId) {
    const { data } = await supabase
      .from("conversations")
      .select("id, summary, summarized_count")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .single();
    if (!data) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    conversation = data;
  } else {
    const title = message.length > 60 ? `${message.slice(0, 60).trimEnd()}…` : message;
    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: user.id, title })
      .select("id, summary, summarized_count")
      .single();
    if (error || !data) return NextResponse.json({ error: "Could not create conversation" }, { status: 500 });
    conversation = data;
  }

  const { error: insertError } = await supabase
    .from("messages")
    .insert({ conversation_id: conversation.id, role: "user", content: message });
  if (insertError) return NextResponse.json({ error: "Could not save message" }, { status: 500 });

  // Same student signals as the non-streaming /api/assistant route.
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const [{ data: profile }, { data: attempts }, { data: recent }, userKeys] = await Promise.all([
    supabase.from("profiles").select("exam, study_hours_per_day, current_streak").eq("id", user.id).single(),
    supabase.from("question_attempts").select("subject, chapter, correct").gte("created_at", since),
    supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(MEMORY_WINDOW),
    getUserProviderKeys(user.id),
  ]);

  const topics = weakTopics(attempts ?? []);
  const context = [
    `Exam: ${profile?.exam ?? "unknown"}`,
    `Daily study goal: ${profile?.study_hours_per_day ?? "?"}h`,
    `Current streak: ${profile?.current_streak ?? 0} days`,
    topics.length
      ? `Weak topics (lowest accuracy first): ${topics.map((t) => `${t.topic} (${t.accuracy}% over ${t.attempts} attempts)`).join("; ")}`
      : "Weak topics: not enough attempt data yet",
  ].join("\n");

  const history: ChatMessage[] = (recent ?? [])
    .reverse()
    .map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    }));

  const chat: StreamChatMessage[] = [
    {
      role: "system",
      content:
        `${SYSTEM}\n\nStudent context:\n${context}` +
        (conversation.summary ? `\n\nSummary of the earlier conversation:\n${conversation.summary}` : ""),
    },
    ...history,
  ];

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true; // client went away — keep going so we can persist the partial reply
        }
      };

      send({ type: "meta", conversationId: conversation.id });

      let full = "";
      let model: string | null = null;
      try {
        const result = await openChatStream(chat, request.signal, userKeys);
        model = result.model;
        send({ type: "model", model: result.model });
        for await (const token of result.tokens) {
          full += token;
          send({ type: "token", text: token });
        }
      } catch (err) {
        const aborted = err instanceof StreamError && err.kind === "aborted";
        if (!aborted && full.length === 0) {
          // Every streaming provider failed before the first token — degrade
          // to the non-streaming chain (which itself ends in a canned reply).
          full = await generateAssistantReply(history, context, userKeys);
          model = "fallback";
          send({ type: "token", text: full });
        }
        // If aborted or a provider died mid-stream, persist the partial text below.
      }

      let messageId: string | null = null;
      if (full.trim()) {
        const { data: saved } = await supabase
          .from("messages")
          .insert({ conversation_id: conversation.id, role: "assistant", content: full, model })
          .select("id")
          .single();
        messageId = saved?.id ?? null;
        try {
          await maybeSummarize(supabase, conversation);
        } catch {
          // memory upkeep is best-effort
        }
      }

      send({ type: "done", messageId, model });
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
