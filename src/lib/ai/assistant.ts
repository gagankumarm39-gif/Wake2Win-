import { generateWithChain } from "./generate";
import type { UserProviderKey } from "@/types";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const FALLBACK_REPLIES = [
  "Here's my honest advice: pick ONE chapter you've been avoiding and give it 25 focused minutes right now. Start a Pomodoro — momentum beats motivation. 💪",
  "Revision rule of thumb: re-attempt every question you got wrong this week. Your mistakes are your fastest path to marks. Try the 'Quiz me' button to practice now!",
  "Consistency wins ranks. Aim for your daily study target, protect your streak, and let the leaderboard take care of itself. What subject shall we practice?",
  "Feeling stuck? Break it down: 1 chapter → 1 concept → 5 questions. Tap 'Quiz me' and I'll generate practice questions from your syllabus right away.",
  "Every topper you admire once sat exactly where you are. The difference is they showed up daily. Start a quiz or a Pomodoro session — I've got you. 🔥",
];

const SYSTEM = `You are Wake2Win's AI Study Assistant — a sharp, encouraging coach for Indian competitive exam students (NEET, JEE, UPSC, SSC, GATE, CAT, Boards).
You can: explain concepts and answers, give hints without spoiling, recommend what to revise based on weak topics, create revision plans, and motivate students.
Style: concise (under 150 words), warm, practical, exam-accurate. Use plain text with occasional emoji. Never invent statistics about the student beyond the provided context.`;

/**
 * Conversational reply with the same silent fallback chain as the question
 * generator: the student's own keys → app Gemini → app OpenRouter → canned
 * coaching reply. Never throws.
 */
export async function generateAssistantReply(
  messages: ChatMessage[],
  context: string,
  userKeys: UserProviderKey[] = []
): Promise<string> {
  const convo = messages
    .slice(-12)
    .map((m) => `${m.role === "user" ? "Student" : "Assistant"}: ${m.content}`)
    .join("\n");

  const prompt = `${SYSTEM}\n\nStudent context:\n${context}\n\nConversation so far:\n${convo}\n\nAssistant:`;

  try {
    const { text } = await generateWithChain(prompt, { json: false, userKeys });
    return text;
  } catch {
    // Every provider failed — fall back to a canned coaching reply.
    return FALLBACK_REPLIES[Math.floor(Math.random() * FALLBACK_REPLIES.length)];
  }
}