import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { upsertEnvContent } from "./setup-lead-engine-auth.mjs";

/**
 * The setup script must never clobber the founder's existing integration keys.
 * These tests use placeholder values only — no real credential is involved.
 */

const UPDATES = {
  LEAD_ENGINE_ADMIN_EMAIL: "founder@tugobo.com",
  LEAD_ENGINE_ADMIN_PASSWORD_HASH: "$2b$12$placeholder",
  AUTH_SECRET: "placeholder-secret",
  AUTH_TRUST_HOST: "true",
};

describe("upsertEnvContent", () => {
  test("appends auth keys to an empty file", () => {
    const result = upsertEnvContent("", UPDATES);
    for (const [key, value] of Object.entries(UPDATES)) {
      assert.match(result, new RegExp(`^${key}=${escapeRe(value)}$`, "m"));
    }
  });

  test("preserves unrelated existing keys and their order", () => {
    const existing = [
      "GOOGLE_MAPS_API_KEY=abc123",
      "AIRTABLE_API_KEY=key456",
      "DEEPSEEK_API_KEY=ds789",
      "",
    ].join("\n");

    const result = upsertEnvContent(existing, UPDATES);

    assert.match(result, /^GOOGLE_MAPS_API_KEY=abc123$/m);
    assert.match(result, /^AIRTABLE_API_KEY=key456$/m);
    assert.match(result, /^DEEPSEEK_API_KEY=ds789$/m);
    assert.ok(
      result.indexOf("GOOGLE_MAPS_API_KEY") < result.indexOf("AIRTABLE_API_KEY"),
      "original ordering should be preserved",
    );
  });

  test("replaces an existing auth key in place rather than duplicating it", () => {
    const existing = [
      "LEAD_ENGINE_ADMIN_EMAIL=old@example.com",
      "GOOGLE_MAPS_API_KEY=abc123",
      "",
    ].join("\n");

    const result = upsertEnvContent(existing, UPDATES);
    const occurrences = result.match(/^LEAD_ENGINE_ADMIN_EMAIL=/gm) ?? [];

    assert.equal(occurrences.length, 1);
    assert.match(result, /^LEAD_ENGINE_ADMIN_EMAIL=founder@tugobo\.com$/m);
    assert.doesNotMatch(result, /old@example\.com/);
    assert.match(result, /^GOOGLE_MAPS_API_KEY=abc123$/m);
  });

  test("leaves comments and blank lines untouched", () => {
    const existing = ["# my notes", "", "GOOGLE_MAPS_API_KEY=abc123", ""].join("\n");
    const result = upsertEnvContent(existing, UPDATES);
    assert.match(result, /^# my notes$/m);
  });

  test("always ends with a trailing newline", () => {
    assert.ok(upsertEnvContent("FOO=bar", UPDATES).endsWith("\n"));
  });
});

function escapeRe(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
