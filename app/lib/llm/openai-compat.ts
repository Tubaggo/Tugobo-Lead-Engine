export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function openAiCompatibleChatCompletion(params: {
  url: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature: number;
  jsonObject: boolean;
  timeoutMs: number;
}): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    const res = await fetch(params.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: params.model,
        temperature: params.temperature,
        ...(params.jsonObject ? { response_format: { type: "json_object" } } : {}),
        messages: params.messages,
      }),
      signal: controller.signal,
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    let raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;
    if (raw.startsWith("```")) {
      raw = raw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
    }
    return raw;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
