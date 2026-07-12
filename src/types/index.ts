export type Exam = "NEET" | "JEE" | "UPSC" | "SSC" | "GATE" | "CAT" | "BOARDS";
export type Difficulty = "easy" | "medium" | "hard";
export type QuestionSource = "gemini" | "openrouter" | "openai" | "anthropic" | "ollama" | "local";

export interface QuestionRequest {
  exam: Exam;
  subject: string;
  chapter?: string;
  difficulty: Difficulty;
  count: number; // 2–4 for alarms, up to 10 for quizzes
}

export interface GeneratedQuestion {
  id: string;
  question: string;
  options: string[]; // always 4, shuffled server-side
  correctIndex: number;
  explanation: string;
  hint?: string;
  source: QuestionSource;
}

export interface Alarm {
  id: string;
  user_id: string;
  name: string;
  time: string; // HH:mm:ss
  repeat_days: number[]; // 0=Sun … 6=Sat
  sound: string;
  volume: number;
  vibration: boolean;
  snooze_enabled: boolean;
  snooze_minutes: number;
  max_snoozes: number;
  question_count: 2 | 3 | 4;
  subject: string;
  chapter: string | null;
  difficulty: Difficulty;
  is_active: boolean;
}

export type AIProvider = "gemini" | "openrouter" | "openai" | "anthropic" | "ollama";

/** Decrypted student key, server-side only — never serialized to the client. */
export interface UserProviderKey {
  provider: AIProvider;
  apiKey: string;
  model: string | null;
}

/** Safe metadata about a stored key (what the settings UI sees). */
export interface UserAIKeyInfo {
  provider: AIProvider;
  connected: boolean;
  defaultModel: string | null;
  updatedAt: string | null;
}

export type ChatRole = "user" | "assistant";

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  pinned: boolean;
  summary: string | null;
  summarized_count: number;
  created_at: string;
  updated_at: string;
}

export interface StoredMessage {
  id: string;
  conversation_id: string;
  role: ChatRole;
  content: string;
  model: string | null;
  liked: boolean | null;
  created_at: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
  exam: Exam | null;
  target_rank: string | null;
  target_college: string | null;
  study_hours_per_day: number;
  wake_up_goal: string | null;
  theme: "light" | "dark" | "system";
  onboarded: boolean;
  xp: number;
  coins: number;
  level: number;
  current_streak: number;
  longest_streak: number;
}
