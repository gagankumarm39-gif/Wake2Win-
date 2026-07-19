import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateWithChain } from "@/lib/ai/generate";
import { getUserProviderKeys } from "@/lib/ai/user-keys";
import { extractImageText } from "@/lib/ai/vision";

/**
 * NCERT Scanner — image of an NCERT page / question paper / handwritten
 * question / diagram in, per-question NEET solutions out.
 *
 * Pipeline: image (client already resized+compressed) → vision/OCR chain
 * (vision.ts, cached) → existing text chain (generateWithChain) with a
 * structured solving prompt → per-question solution cards.
 */

export const maxDuration = 120;

const bodySchema = z.object({
  /** data:image/jpeg;base64,… — client compresses to ≤2048px / ≤10MB. */
  image: z.string().startsWith("data:image/").max(14_000_000),
});

export interface ScannedSolution {
  question: string;
  answer: string;
  explanation: string;
  ncertConcept: string;
  relatedTheory: string;
  commonMistake: string;
  difficulty: string;
  memoryTrick: string;
  similarPyq: string;
}

const solutionSchema = z.object({
  solutions: z
    .array(
      z.object({
        question: z.string().min(1),
        answer: z.string().min(1),
        explanation: z.string().min(1),
        ncertConcept: z.string().default(""),
        relatedTheory: z.string().default(""),
        commonMistake: z.string().default(""),
        difficulty: z.string().default("Medium"),
        memoryTrick: z.string().default(""),
        similarPyq: z.string().default(""),
      })
    )
    .min(1),
});

function solvePrompt(extracted: string): string {
  return [
    "You are an expert NEET tutor. Below is text extracted from a student's scanned image",
    "(an NCERT page, question paper, handwritten question, diagram, graph, flowchart, table,",
    "circuit or reaction mechanism).",
    "",
    "Identify EVERY distinct question in it. If it is study material without explicit questions,",
    "treat the core concept as ONE question ('Explain: …').",
    "",
    "Solve each question separately. Respond with ONLY valid JSON, no markdown fences:",
    "{",
    '  "solutions": [',
    "    {",
    '      "question": "the question, restated clearly",',
    '      "answer": "the correct answer (letter + text for MCQs)",',
    '      "explanation": "detailed stepwise reasoning at NEET level, plain text",',
    '      "ncertConcept": "the exact NCERT chapter/concept this tests",',
    '      "relatedTheory": "brief related theory the student should revise",',
    '      "commonMistake": "the mistake students usually make here",',
    '      "difficulty": "Easy | Medium | Hard",',
    '      "memoryTrick": "a mnemonic or quick trick, if one exists",',
    '      "similarPyq": "a similar NEET previous-year question (year if known)"',
    "    }",
    "  ]",
    "}",
    "",
    "Rules: NCERT wording, NEET level, conceptual and exam-oriented. Every string is plain",
    "educational text — no markdown, no code. Never invent a PYQ; say 'No close PYQ' if unsure.",
    "",
    "Extracted content:",
    '"""',
    extracted,
    '"""',
  ].join("\n");
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  // 1. Image → text (vision providers, or OCR-style transcription; cached).
  let extracted: string;
  try {
    extracted = await extractImageText(parsed.data.image);
  } catch {
    return NextResponse.json(
      { error: "Could not read the image. Try a clearer, well-lit photo." },
      { status: 502 }
    );
  }

  // 2. Text → solutions through the existing provider chain.
  const userKeys = await getUserProviderKeys(user.id);
  try {
    const { text } = await generateWithChain(solvePrompt(extracted), {
      json: true,
      userKeys,
      ollamaTask: "notes",
      validate: (t) => {
        try {
          return solutionSchema.safeParse(JSON.parse(t)).success;
        } catch {
          return false;
        }
      },
    });
    const { solutions } = solutionSchema.parse(JSON.parse(text));
    return NextResponse.json({ solutions, extracted });
  } catch {
    return NextResponse.json(
      { error: "The AI could not solve this scan right now. Please try again." },
      { status: 502 }
    );
  }
}
