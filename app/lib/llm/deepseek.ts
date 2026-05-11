import {
  openAiCompatibleChatCompletion,
  type ChatMessage,
} from "./openai-compat";

const DEEPSEEK_CHAT_URL = "https://api.deepseek.com/v1/chat/completions";

export type { ChatMessage };

export function getDeepSeekApiKey(): string | null {
  const k = process.env.DEEPSEEK_API_KEY?.trim();
  return k || null;
}

export function defaultDeepSeekModel(): string {
  const m = process.env.DEEPSEEK_MODEL?.trim().replace(/^["']|["']$/g, "");
  return m || "deepseek-chat";
}

/**
 * DeepSeek Chat API (OpenAI-compatible). Returns assistant text or null on failure/timeout.
 */
export async function deepseekChatText(params: {
  messages: ChatMessage[];
  temperature?: number;
  jsonObject?: boolean;
  timeoutMs: number;
}): Promise<string | null> {
  const key = getDeepSeekApiKey();
  if (!key) return null;

  return openAiCompatibleChatCompletion({
    url: DEEPSEEK_CHAT_URL,
    apiKey: key,
    model: defaultDeepSeekModel(),
    messages: params.messages,
    temperature: params.temperature ?? 0.35,
    jsonObject: params.jsonObject ?? false,
    timeoutMs: params.timeoutMs,
  });
}
