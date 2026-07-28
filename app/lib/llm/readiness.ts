/**
 * v3.7.9 — Server-side AI provider readiness.
 *
 * Reports WHETHER a provider is configured and WHICH model would be used, so a
 * readiness check never has to touch the network. It reads only the presence of
 * the key and the model name from the environment.
 *
 * Security: this NEVER returns, logs, or otherwise exposes the API key value —
 * only a boolean `configured` flag and the (non-secret) model name. Keep it that
 * way; a readiness surface that leaks the key is worse than no readiness surface.
 *
 * Leaf module: reads `process.env` directly, no heavy imports, so it is unit
 * testable under the Node test runner.
 */

export type ProviderName = "deepseek" | "openai";

export type ProviderReadiness = {
  /** The provider that would serve a request, or null when none is configured. */
  provider: ProviderName | null;
  /** True when an API key is present for the selected provider. */
  configured: boolean;
  /** The model that would be used (non-secret), or null when unconfigured. */
  model: string | null;
};

const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

function cleanEnv(value: string | undefined): string {
  return (value ?? "").trim();
}

/** Strips surrounding quotes a model name may have picked up from a .env line. */
function cleanModel(value: string | undefined): string {
  return cleanEnv(value).replace(/^["']|["']$/g, "");
}

/**
 * Resolves the active provider readiness. DeepSeek takes precedence over OpenAI,
 * mirroring the request path in `provider.ts`.
 */
export function getProviderReadiness(): ProviderReadiness {
  if (cleanEnv(process.env.DEEPSEEK_API_KEY)) {
    return {
      provider: "deepseek",
      configured: true,
      model: cleanModel(process.env.DEEPSEEK_MODEL) || DEFAULT_DEEPSEEK_MODEL,
    };
  }
  if (cleanEnv(process.env.OPENAI_API_KEY)) {
    return {
      provider: "openai",
      configured: true,
      model: cleanModel(process.env.OPENAI_MODEL) || DEFAULT_OPENAI_MODEL,
    };
  }
  return { provider: null, configured: false, model: null };
}
