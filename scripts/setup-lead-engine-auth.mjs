#!/usr/bin/env node
/**
 * Interactive one-time auth setup for the Tugobo Lead Engine.
 *
 * Generates LEAD_ENGINE_ADMIN_EMAIL, LEAD_ENGINE_ADMIN_PASSWORD_HASH and
 * AUTH_SECRET into .env.local, preserving every other key already there.
 *
 * The plaintext password never leaves this process: it is not echoed, not
 * logged, and not written to disk. Only the bcrypt hash is persisted.
 *
 * Usage: pnpm auth:setup
 */

import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { hash, compare } from "bcryptjs";

const PROJECT_ROOT = resolve(import.meta.dirname, "..");
const ENV_PATH = join(PROJECT_ROOT, ".env.local");
const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 12;

/** Key codes handled by the hidden password reader. */
const CODE_CTRL_C = 3;
const CODE_BACKSPACE = 8;
const CODE_DELETE = 127;
const CODE_FIRST_PRINTABLE = 32;

const MANAGED_KEYS = [
  "LEAD_ENGINE_ADMIN_EMAIL",
  "LEAD_ENGINE_ADMIN_PASSWORD_HASH",
  "AUTH_SECRET",
  "AUTH_TRUST_HOST",
];

function out(message = "") {
  process.stdout.write(`${message}\n`);
}

function fail(message) {
  process.stderr.write(`\n[x] ${message}\n`);
  process.exit(1);
}

/**
 * The readline interface is created lazily rather than at module scope.
 * Constructing it on import would hold stdin open and keep the event loop
 * alive, hanging any process that merely imports this file for its helpers
 * (the test runner does exactly that).
 */
let rl = null;

function getRl() {
  if (!rl) rl = createInterface({ input: process.stdin, output: process.stdout });
  return rl;
}

function closeRl() {
  if (rl) {
    rl.close();
    rl = null;
  }
}

function ask(question) {
  return new Promise((res) => getRl().question(question, (a) => res(a)));
}

/**
 * Reads a line without echoing it. Raw mode suppresses terminal echo entirely,
 * so the password is never rendered — not even as asterisks, which would leak
 * its length to anyone watching the screen.
 */
function askHidden(question) {
  return new Promise((res, rej) => {
    if (!process.stdin.isTTY) {
      rej(
        new Error(
          "A TTY is required to enter a password. Run `pnpm auth:setup` directly in a terminal.",
        ),
      );
      return;
    }
    process.stdout.write(question);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();

    let value = "";

    const finish = (fn) => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(wasRaw ?? false);
      process.stdout.write("\n");
      fn();
    };

    const onData = (chunk) => {
      for (const ch of chunk.toString("utf8")) {
        const code = ch.charCodeAt(0);

        if (ch === "\r" || ch === "\n") {
          finish(() => res(value));
          return;
        }
        if (code === CODE_CTRL_C) {
          finish(() => process.exit(130));
          return;
        }
        if (code === CODE_BACKSPACE || code === CODE_DELETE) {
          value = value.slice(0, -1);
          continue;
        }
        // Ignore remaining control characters (arrow keys, escape sequences).
        if (code < CODE_FIRST_PRINTABLE) continue;

        value += ch;
      }
    };

    stdin.on("data", onData);
  });
}

/** Refuses to run if .env.local would be tracked by git. */
function assertEnvIsIgnored() {
  try {
    const result = execFileSync("git", ["check-ignore", ".env.local"], {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (result.trim().length > 0) return;
  } catch {
    // A non-zero exit means "not ignored" (or git is unavailable).
  }
  fail(
    ".env.local is not git-ignored. Add `.env*` to .gitignore before running this script — " +
      "otherwise your credentials could be committed.",
  );
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Reads a single key's trimmed value from raw .env content, or "" if absent. */
function readEnvValue(content, key) {
  const m = new RegExp(`^\\s*${key}\\s*=(.*)$`, "m").exec(content);
  return m ? m[1].trim() : "";
}

/** A previously-generated AUTH_SECRET is considered valid if it is long enough. */
function isValidAuthSecret(value) {
  return typeof value === "string" && value.trim().length >= 32;
}

/** Minimum strength bar. Deliberately simple, and explained back to the user. */
function passwordProblems(password) {
  const problems = [];
  if (password.length < MIN_PASSWORD_LENGTH) {
    problems.push(`at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (!/[a-z]/.test(password)) problems.push("a lowercase letter");
  if (!/[A-Z]/.test(password)) problems.push("an uppercase letter");
  if (!/[0-9]/.test(password)) problems.push("a digit");
  return problems;
}

/** Rewrites managed keys in place; unrelated keys keep their original position. */
export function upsertEnvContent(existing, updates) {
  const lines = existing.length > 0 ? existing.split(/\r?\n/) : [];
  const applied = new Set();

  const next = lines.map((line) => {
    const match = /^\s*([A-Z0-9_]+)\s*=/.exec(line);
    if (!match) return line;
    const key = match[1];
    if (!(key in updates)) return line;
    applied.add(key);
    return `${key}=${updates[key]}`;
  });

  const remaining = Object.entries(updates).filter(([k]) => !applied.has(k));
  if (remaining.length > 0) {
    if (next.length > 0 && next[next.length - 1].trim() !== "") next.push("");
    next.push(
      "# Tugobo Lead Engine — single-admin auth (generated by pnpm auth:setup)",
    );
    for (const [key, value] of remaining) next.push(`${key}=${value}`);
  }

  let content = next.join("\n");
  if (!content.endsWith("\n")) content += "\n";
  return content;
}

/** Writes via temp file + rename so an interrupted run cannot truncate .env.local. */
function writeAtomic(path, content) {
  const tmp = `${path}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, content, { encoding: "utf8", mode: 0o600 });
    renameSync(tmp, path);
  } catch (error) {
    if (existsSync(tmp)) {
      try {
        unlinkSync(tmp);
      } catch {
        /* best effort cleanup */
      }
    }
    throw error;
  }
}

async function main() {
  out("");
  out("  Tugobo Lead Engine - founder access setup");
  out("  -----------------------------------------");
  out("  Creates the single admin login in .env.local.");
  out("  Your password is never displayed, logged, or stored in plaintext.");
  out("");

  assertEnvIsIgnored();

  const existing = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
  const alreadyConfigured = MANAGED_KEYS.some((key) =>
    new RegExp(`^\\s*${key}\\s*=\\s*\\S`, "m").test(existing),
  );

  if (alreadyConfigured) {
    out("  ! Auth keys already exist in .env.local.");
    const answer = (
      await ask(
        "  Overwrite them? Any existing session will stop working. (y/N): ",
      )
    )
      .trim()
      .toLowerCase();
    if (answer !== "y" && answer !== "yes") {
      out("\n  Cancelled. Nothing was changed.");
      closeRl();
      process.exit(0);
    }
    out("");
  }

  // E-mail: keep the one already in .env.local (set it there beforehand if you
  // want to change it). Only prompt when none is configured yet.
  const existingEmail = readEnvValue(existing, "LEAD_ENGINE_ADMIN_EMAIL");
  let email = existingEmail;
  if (isValidEmail(existingEmail)) {
    out(`  Keeping existing admin e-mail: ${existingEmail.toLowerCase()}`);
  } else {
    email = (await ask("  Admin e-mail: ")).trim();
    if (!isValidEmail(email)) {
      fail("That does not look like a valid e-mail address.");
    }
  }

  const password = await askHidden("  New password (hidden): ");
  const problems = passwordProblems(password);
  if (problems.length > 0) {
    fail(`Password too weak. It needs ${problems.join(", ")}.`);
  }

  const confirm = await askHidden("  Confirm password: ");
  if (password !== confirm) fail("The two passwords do not match.");

  closeRl();

  out("");
  out("  Hashing password...");
  const passwordHash = await hash(password, BCRYPT_ROUNDS);

  // Verify the freshly-written hash matches the password just entered. Only the
  // boolean result is printed; the password and hash themselves never are.
  const verified = await compare(password, passwordHash);
  out(`  Password verifies against new hash: ${verified}`);
  if (!verified) {
    fail("Internal error: the new hash did not verify. .env.local was NOT changed.");
  }

  // A bcrypt hash contains `$` (`$2b$12$…`). Next.js runs dotenv-expand over
  // .env.local values and would treat those `$` as variable references,
  // corrupting the hash. Store it base64-encoded (no `$` in the base64
  // alphabet) so it survives intact; app/lib/auth/env.ts decodes it.
  const passwordHashB64 = Buffer.from(passwordHash, "utf8").toString("base64");

  // AUTH_SECRET: preserve the existing one when it is still valid, so active
  // sessions and the signing key are only rotated when strictly necessary.
  const existingSecret = readEnvValue(existing, "AUTH_SECRET");
  const secretPreserved = isValidAuthSecret(existingSecret);
  const authSecret = secretPreserved
    ? existingSecret
    : randomBytes(32).toString("base64");

  const content = upsertEnvContent(existing, {
    LEAD_ENGINE_ADMIN_EMAIL: email.toLowerCase(),
    LEAD_ENGINE_ADMIN_PASSWORD_HASH: passwordHashB64,
    AUTH_SECRET: authSecret,
    AUTH_TRUST_HOST: "true",
  });

  writeAtomic(ENV_PATH, content);

  out("");
  out("  [ok] .env.local updated.");
  out(`       LEAD_ENGINE_ADMIN_EMAIL         = ${email.toLowerCase()}`);
  out("       LEAD_ENGINE_ADMIN_PASSWORD_HASH = <new bcrypt hash, base64-encoded>");
  out(
    `       AUTH_SECRET                     = ${
      secretPreserved ? "<existing value preserved>" : "<generated>"
    }`,
  );
  out("       AUTH_TRUST_HOST                 = true");
  out("");
  out("  All other keys (Airtable, Google, DeepSeek, ...) were left untouched.");
  out("  Restart the server, then sign in at /login.");
  out("");
}

// Only run the interactive flow when executed directly, so the pure helpers
// above can be imported by tests.
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error) => {
    closeRl();
    fail(error instanceof Error ? error.message : "Setup failed.");
  });
}
