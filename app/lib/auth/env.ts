import "server-only";

/**
 * Central, server-only accessor for the single-admin auth environment.
 *
 * Rules enforced here:
 *  - no hardcoded admin credentials and no fallback defaults
 *  - never expose a value in an error message, only the missing key name
 *  - in production a missing key fails closed (auth cannot succeed)
 *  - nothing is prefixed NEXT_PUBLIC_, and `server-only` blocks client imports
 */

const ADMIN_EMAIL_KEY = "LEAD_ENGINE_ADMIN_EMAIL";
const ADMIN_PASSWORD_HASH_KEY = "LEAD_ENGINE_ADMIN_PASSWORD_HASH";
const AUTH_SECRET_KEY = "AUTH_SECRET";

export const REQUIRED_AUTH_ENV_KEYS = [
  ADMIN_EMAIL_KEY,
  ADMIN_PASSWORD_HASH_KEY,
  AUTH_SECRET_KEY,
] as const;

export type AuthEnv = {
  adminEmail: string;
  adminPasswordHash: string;
  authSecret: string;
};

/**
 * Normalizes an e-mail for comparison: trims surrounding whitespace and
 * lowercases. Exported so the credential check, the session check and the
 * rate limiter all key on exactly the same representation.
 */
export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function read(key: string): string {
  return (process.env[key] ?? "").trim();
}

/** Matches the prefix of a bcrypt hash (algorithm id + cost). */
const BCRYPT_PREFIX = /^\$2[aby]\$\d{2}\$/;

/**
 * Resolves the stored password hash to a usable bcrypt string.
 *
 * A bcrypt hash contains `$` characters (`$2b$12$…`). When it is placed raw in
 * `.env.local`, Next.js's env loader runs dotenv-expand over the value and
 * treats those `$` sequences as variable references, silently corrupting the
 * hash before the app ever sees it. To survive that, `pnpm auth:setup` stores
 * the hash **base64-encoded** — the base64 alphabet has no `$`, so it is left
 * untouched. This decodes it back.
 *
 * A value that is already a bcrypt hash (e.g. an env var injected directly in
 * production/PM2 where no dotenv expansion runs, or in unit tests) is detected
 * and used as-is, so both forms work.
 */
export function decodePasswordHash(value: string): string {
  const v = value.trim();
  if (v.length === 0) return "";
  if (BCRYPT_PREFIX.test(v)) return v;
  try {
    const decoded = Buffer.from(v, "base64").toString("utf8");
    if (BCRYPT_PREFIX.test(decoded)) return decoded;
  } catch {
    // not valid base64 — fall through
  }
  return v;
}

/** Names of required auth env keys that are missing or blank. */
export function missingAuthEnvKeys(): string[] {
  return REQUIRED_AUTH_ENV_KEYS.filter((key) => read(key).length === 0);
}

/** True when every required auth env key is present. */
export function isAuthEnvConfigured(): boolean {
  return missingAuthEnvKeys().length === 0;
}

/**
 * Returns the validated auth env, or `null` when anything required is absent.
 * Callers treat `null` as "authentication is unavailable" and deny access —
 * there is deliberately no partial or default-credential mode.
 */
export function getAuthEnv(): AuthEnv | null {
  if (!isAuthEnvConfigured()) return null;
  return {
    adminEmail: normalizeEmail(read(ADMIN_EMAIL_KEY)),
    adminPasswordHash: decodePasswordHash(read(ADMIN_PASSWORD_HASH_KEY)),
    authSecret: read(AUTH_SECRET_KEY),
  };
}

/**
 * Throws when auth env is incomplete. The message lists only key *names*,
 * never values. Used at the edges where a hard failure is preferable to a
 * silent "always denied" state.
 */
export function assertAuthEnv(): AuthEnv {
  const env = getAuthEnv();
  if (!env) {
    throw new Error(
      `Auth is not configured. Missing environment key(s): ${missingAuthEnvKeys().join(
        ", ",
      )}. Run \`pnpm auth:setup\` to generate them.`,
    );
  }
  return env;
}

/**
 * Demo/seed lead data gate.
 *
 * Development keeps the existing demo experience. Production is fail-closed:
 * the seed hotels are only served when LEAD_ENGINE_ALLOW_DEMO_DATA is
 * explicitly "true", so demo records can never be mistaken for real pipeline.
 */
export function isDemoDataAllowed(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return read("LEAD_ENGINE_ALLOW_DEMO_DATA").toLowerCase() === "true";
}
