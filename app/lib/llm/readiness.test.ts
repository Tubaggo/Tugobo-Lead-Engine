import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { getProviderReadiness } from "./readiness.ts";

const KEYS = [
  "DEEPSEEK_API_KEY",
  "OPENAI_API_KEY",
  "DEEPSEEK_MODEL",
  "OPENAI_MODEL",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("getProviderReadiness", () => {
  it("1. reports configured when a DeepSeek key is present", () => {
    process.env.DEEPSEEK_API_KEY = "sk-deepseek-test";
    const r = getProviderReadiness();
    assert.equal(r.configured, true);
    assert.equal(r.provider, "deepseek");
    assert.equal(r.model, "deepseek-chat");
  });

  it("uses a custom DeepSeek model when set (quotes stripped)", () => {
    process.env.DEEPSEEK_API_KEY = "sk-deepseek-test";
    process.env.DEEPSEEK_MODEL = '"deepseek-reasoner"';
    assert.equal(getProviderReadiness().model, "deepseek-reasoner");
  });

  it("falls back to OpenAI readiness when only OpenAI is configured", () => {
    process.env.OPENAI_API_KEY = "sk-openai-test";
    const r = getProviderReadiness();
    assert.equal(r.configured, true);
    assert.equal(r.provider, "openai");
    assert.equal(r.model, "gpt-4o-mini");
  });

  it("prefers DeepSeek over OpenAI when both are configured", () => {
    process.env.DEEPSEEK_API_KEY = "sk-deepseek-test";
    process.env.OPENAI_API_KEY = "sk-openai-test";
    assert.equal(getProviderReadiness().provider, "deepseek");
  });

  it("2. reports unconfigured when no key is present", () => {
    const r = getProviderReadiness();
    assert.deepEqual(r, { provider: null, configured: false, model: null });
  });

  it("treats a whitespace-only key as unconfigured", () => {
    process.env.DEEPSEEK_API_KEY = "   ";
    assert.equal(getProviderReadiness().configured, false);
  });

  it("3. never exposes the API key value in the readiness object", () => {
    process.env.DEEPSEEK_API_KEY = "sk-super-secret-value-123";
    const serialized = JSON.stringify(getProviderReadiness());
    assert.ok(!serialized.includes("sk-super-secret-value-123"));
    assert.ok(!serialized.toLowerCase().includes("secret"));
    // The object exposes exactly these keys and nothing key-bearing.
    assert.deepEqual(Object.keys(getProviderReadiness()).sort(), [
      "configured",
      "model",
      "provider",
    ]);
  });
});
