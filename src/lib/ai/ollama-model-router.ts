/**
 * Per-task Ollama model routing. Env vars override; the defaults below are
 * the shipped mapping. Falls back to OLLAMA_MODEL / qwen2.5:7b for unknown
 * tasks so a missing env var can never produce an undefined model id.
 */

export type OllamaTask = "chat" | "notes" | "tests" | "alarm" | "vision" | "code";

export function getOllamaModel(task?: OllamaTask): string {
  switch (task) {
    case "chat":
      return process.env.OLLAMA_CHAT_MODEL || "qwen2.5:7b";

    case "notes":
      return process.env.OLLAMA_NOTES_MODEL || "gemma3:4b";

    case "tests":
      return process.env.OLLAMA_TEST_MODEL || "qwen2.5:7b";

    case "alarm":
      return process.env.OLLAMA_ALARM_MODEL || "qwen2.5:7b";

    case "vision":
      return process.env.OLLAMA_VISION_MODEL || "gemma3:4b";

    case "code":
      return process.env.OLLAMA_CODE_MODEL || "kimi-k2.7-code:cloud";

    default:
      return process.env.OLLAMA_MODEL || "qwen2.5:7b";
  }
}
