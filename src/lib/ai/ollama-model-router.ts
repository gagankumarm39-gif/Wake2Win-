/**
 * Per-task Ollama model routing. Env vars override; the defaults below are
 * the shipped mapping.
 *
 * gemma3:4b   — default local model: all NEET/educational tasks (chat, notes,
 *               tests, alarm questions, vision) route here first.
 * qwen2.5:7b  — coding/technical tasks ONLY (code, JSON-heavy backend logic).
 * kimi-k2.7-code:cloud — advanced-coding fallback when qwen fails; never used
 *               for educational content.
 *
 * Unknown tasks fall back to OLLAMA_MODEL / gemma3:4b so a missing env var can
 * never produce an undefined model id.
 */

export type OllamaTask = "chat" | "notes" | "tests" | "alarm" | "vision" | "code";

const EDU_MODEL = "gemma3:4b";
const CODE_MODEL = "qwen2.5:7b";
const CODE_ADVANCED_MODEL = "kimi-k2.7-code:cloud";

export function getOllamaModel(task?: OllamaTask): string {
  switch (task) {
    case "chat":
      return process.env.OLLAMA_CHAT_MODEL || EDU_MODEL;

    case "notes":
      return process.env.OLLAMA_NOTES_MODEL || EDU_MODEL;

    case "tests":
      return process.env.OLLAMA_TEST_MODEL || EDU_MODEL;

    case "alarm":
      return process.env.OLLAMA_ALARM_MODEL || EDU_MODEL;

    case "vision":
      return process.env.OLLAMA_VISION_MODEL || EDU_MODEL;

    case "code":
      return process.env.OLLAMA_CODE_MODEL || CODE_MODEL;

    default:
      return process.env.OLLAMA_MODEL || EDU_MODEL;
  }
}

/**
 * The ordered Ollama models to try for a task. Educational tasks get exactly
 * one model (gemma3:4b — a second local attempt would just repeat the same
 * failure). Code tasks get qwen2.5:7b first, then the advanced coding model
 * kimi-k2.7-code:cloud as the in-Ollama fallback.
 */
export function getOllamaModelChain(task?: OllamaTask): string[] {
  const primary = getOllamaModel(task);
  if (task === "code") {
    const advanced = process.env.OLLAMA_CODE_FALLBACK_MODEL || CODE_ADVANCED_MODEL;
    return advanced === primary ? [primary] : [primary, advanced];
  }
  return [primary];
}
