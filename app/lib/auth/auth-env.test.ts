import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { hashSync } from "bcryptjs";

import {
  decodePasswordHash,
  getAuthEnv,
  isAuthEnvConfigured,
  isDemoDataAllowed,
  missingAuthEnvKeys,
  normalizeEmail,
} from "./env.ts";
import { verifyAdminCredentials } from "./verify-credentials.ts";

/**
 * These tests set auth env vars at the process level only. No real credential
 * is used and nothing is written to .env.local.
 */

const TEST_EMAIL = "founder@tugobo.com";
const TEST_PASSWORD = "Test-Password-123";
const TEST_HASH = hashSync(TEST_PASSWORD, 4); // low cost: speed over strength in tests

const AUTH_KEYS = [
  "LEAD_ENGINE_ADMIN_EMAIL",
  "LEAD_ENGINE_ADMIN_PASSWORD_HASH",
  "AUTH_SECRET",
  "LEAD_ENGINE_ALLOW_DEMO_DATA",
  "NODE_ENV",
];

let saved: Record<string, string | undefined> = {};

/**
 * Next.js types `process.env.NODE_ENV` as read-only. These tests need to flip
 * it to exercise the production branches, so go through a mutable view.
 */
const mutableEnv = process.env as Record<string, string | undefined>;

function setNodeEnv(value: string) {
  mutableEnv.NODE_ENV = value;
}

function configure() {
  process.env.LEAD_ENGINE_ADMIN_EMAIL = TEST_EMAIL;
  process.env.LEAD_ENGINE_ADMIN_PASSWORD_HASH = TEST_HASH;
  process.env.AUTH_SECRET = "test-secret-not-a-real-one";
}

beforeEach(() => {
  saved = Object.fromEntries(AUTH_KEYS.map((k) => [k, process.env[k]]));
  for (const key of AUTH_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("normalizeEmail", () => {
  test("trims and lowercases", () => {
    assert.equal(normalizeEmail("  Founder@Tugobo.COM "), "founder@tugobo.com");
  });

  test("treats null and undefined as empty", () => {
    assert.equal(normalizeEmail(null), "");
    assert.equal(normalizeEmail(undefined), "");
  });
});

describe("env validation", () => {
  test("reports every missing key by name", () => {
    assert.deepEqual(missingAuthEnvKeys(), [
      "LEAD_ENGINE_ADMIN_EMAIL",
      "LEAD_ENGINE_ADMIN_PASSWORD_HASH",
      "AUTH_SECRET",
    ]);
    assert.equal(isAuthEnvConfigured(), false);
    assert.equal(getAuthEnv(), null);
  });

  test("a blank value counts as missing", () => {
    configure();
    process.env.AUTH_SECRET = "   ";
    assert.deepEqual(missingAuthEnvKeys(), ["AUTH_SECRET"]);
    assert.equal(getAuthEnv(), null);
  });

  test("returns a normalized admin e-mail once fully configured", () => {
    configure();
    process.env.LEAD_ENGINE_ADMIN_EMAIL = "  Founder@Tugobo.COM ";
    assert.equal(getAuthEnv()?.adminEmail, TEST_EMAIL);
  });
});

describe("verifyAdminCredentials", () => {
  test("accepts the configured admin", async () => {
    configure();
    const result = await verifyAdminCredentials(TEST_EMAIL, TEST_PASSWORD);
    assert.equal(result?.email, TEST_EMAIL);
  });

  test("accepts a differently-cased e-mail", async () => {
    configure();
    const result = await verifyAdminCredentials("FOUNDER@TUGOBO.COM", TEST_PASSWORD);
    assert.equal(result?.email, TEST_EMAIL);
  });

  test("rejects an unknown e-mail", async () => {
    configure();
    assert.equal(await verifyAdminCredentials("someone@else.com", TEST_PASSWORD), null);
  });

  test("rejects a wrong password", async () => {
    configure();
    assert.equal(await verifyAdminCredentials(TEST_EMAIL, "wrong-password"), null);
  });

  test("rejects an empty password", async () => {
    configure();
    assert.equal(await verifyAdminCredentials(TEST_EMAIL, ""), null);
  });

  test("rejects non-string input", async () => {
    configure();
    assert.equal(await verifyAdminCredentials(null, TEST_PASSWORD), null);
    assert.equal(await verifyAdminCredentials(TEST_EMAIL, { a: 1 }), null);
  });

  test("fails closed when env is missing, even with a plausible pair", async () => {
    assert.equal(await verifyAdminCredentials(TEST_EMAIL, TEST_PASSWORD), null);
  });

  test("denies rather than throwing when the stored hash is malformed", async () => {
    configure();
    process.env.LEAD_ENGINE_ADMIN_PASSWORD_HASH = "not-a-bcrypt-hash";
    assert.equal(await verifyAdminCredentials(TEST_EMAIL, TEST_PASSWORD), null);
  });

  test("accepts a base64-encoded hash (the form written to .env.local)", async () => {
    configure();
    process.env.LEAD_ENGINE_ADMIN_PASSWORD_HASH =
      Buffer.from(TEST_HASH, "utf8").toString("base64");
    const result = await verifyAdminCredentials(TEST_EMAIL, TEST_PASSWORD);
    assert.equal(result?.email, TEST_EMAIL);
  });
});

describe("decodePasswordHash", () => {
  test("returns a raw bcrypt hash unchanged (production env var / tests)", () => {
    assert.equal(decodePasswordHash(TEST_HASH), TEST_HASH);
  });

  test("decodes a base64-encoded bcrypt hash back to the original", () => {
    const b64 = Buffer.from(TEST_HASH, "utf8").toString("base64");
    assert.equal(decodePasswordHash(b64), TEST_HASH);
  });

  test("base64 form contains no '$' (survives dotenv-expand in .env.local)", () => {
    const b64 = Buffer.from(TEST_HASH, "utf8").toString("base64");
    assert.equal(/\$/.test(b64), false);
  });

  test("empty in, empty out", () => {
    assert.equal(decodePasswordHash(""), "");
    assert.equal(decodePasswordHash("   "), "");
  });

  test("leaves an unrecognized value as-is", () => {
    assert.equal(decodePasswordHash("not-a-hash"), "not-a-hash");
  });
});

describe("demo data gate", () => {
  test("demo data is available outside production", () => {
    setNodeEnv("development");
    assert.equal(isDemoDataAllowed(), true);
  });

  test("production hides demo data by default", () => {
    setNodeEnv("production");
    assert.equal(isDemoDataAllowed(), false);
  });

  test("production hides demo data for any non-affirmative value", () => {
    setNodeEnv("production");
    for (const value of ["false", "1", "yes", "on", ""]) {
      process.env.LEAD_ENGINE_ALLOW_DEMO_DATA = value;
      assert.equal(isDemoDataAllowed(), false, `value: ${JSON.stringify(value)}`);
    }
  });

  test("production shows demo data only on an explicit opt-in", () => {
    setNodeEnv("production");
    process.env.LEAD_ENGINE_ALLOW_DEMO_DATA = "true";
    assert.equal(isDemoDataAllowed(), true);
  });

  test("the opt-in tolerates casing and stray whitespace in a hand-edited file", () => {
    setNodeEnv("production");
    for (const value of ["TRUE", " true ", "True"]) {
      process.env.LEAD_ENGINE_ALLOW_DEMO_DATA = value;
      assert.equal(isDemoDataAllowed(), true, `value: ${JSON.stringify(value)}`);
    }
  });
});
