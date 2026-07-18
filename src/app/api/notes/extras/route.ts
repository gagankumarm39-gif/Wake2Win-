import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateWithChain } from "@/lib/ai/generate";
import { getUserProviderKeys } from "@/lib/ai/user-keys";
import { buildExtrasPrompt, parseFlashcards } from "@/lib/ai/notes-generator";
import { NOTE_EXTRA_KINDS, type NoteConfig, type NoteExtras, type NoteRecord } from "@/types/ai-studio";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  noteId: z.string().uuid(),
  kind: z.enum(NOTE_EXTRA_KINDS),
});

/**
 * Generate one add-on (flashcards / checklist / formula sheet / …) for a
 * saved note and persist it under ai_notes.extras[kind]. Cached: asking for
 * the same kind again returns the stored version.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { noteId, kind } = parsed.data;

  const { data: note } = await supabase
    .from("ai_notes")
    .select("*")
    .eq("id", noteId)
    .eq("user_id", user.id)
    .single<NoteRecord>();
  if (!note) return NextResponse.json({ error: "Note not found" }, { status: 404 });

  const extras: NoteExtras = note.extras ?? {};
  if (extras[kind]) return NextResponse.json({ kind, content: extras[kind] });

  const config: NoteConfig = {
    examId: note.exam,
    subject: note.subject,
    chapter: note.chapter,
    language: note.language,
    length: note.length,
    focus: note.focus,
  };

  const userKeys = await getUserProviderKeys(user.id);
  const prompt = buildExtrasPrompt(config, kind, note.content);

  try {
    const { text } = await generateWithChain(prompt, { json: kind === "flashcards", userKeys, ollamaTask: "notes" });
    const content = kind === "flashcards" ? parseFlashcards(text) : text.trim();
    const nextExtras = { ...extras, [kind]: content };

    await supabase.from("ai_notes").update({ extras: nextExtras }).eq("id", noteId).eq("user_id", user.id);
    return NextResponse.json({ kind, content });
  } catch (err) {
    console.error("[notes/extras] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Generation failed — please try again." }, { status: 502 });
  }
}
