import { normalizeEmail } from "./env.ts";

/**
 * Minimal in-process login throttle for the single-instance deployment.
 *
 * Scope and limits (documented deliberately):
 *  - counters live in process memory, so a restart clears them
 *  - it is per-instance; it does not coordinate across processes or PM2 forks
 *  - it is an application-level backstop, not a replacement for an edge/Nginx
 *    rate limit, which is applied separately at deploy time
 *
 * Nothing derived from the password is stored — only a counter keyed by
 * client IP plus normalized e-mail.
 */

export const MAX_ATTEMPTS = 5;
export const WINDOW_MS = 15 * 60 * 1000;
/** Hard cap on tracked keys so a hostile caller cannot grow the Map without bound. */
export const MAX_TRACKED_KEYS = 5000;

export type AttemptRecord = {
  /** Failed attempts inside the current window. */
  count: number;
  /** Epoch ms when the current window began. */
  windowStartedAt: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  remainingAttempts: number;
  /** Epoch ms when the caller may retry; null while still allowed. */
  retryAtMs: number | null;
};

/** Builds the throttle key. IP and e-mail are combined so one does not mask the other. */
export function buildAttemptKey(ip: string, email: string): string {
  const safeIp = (ip || "unknown").trim() || "unknown";
  return `${safeIp}|${normalizeEmail(email)}`;
}

/**
 * Pure decision function: given the stored record (if any) and the current
 * time, decide whether a login attempt may proceed.
 */
export function evaluateAttempt(
  record: AttemptRecord | undefined,
  now: number,
): RateLimitDecision {
  if (!record || now - record.windowStartedAt >= WINDOW_MS) {
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS, retryAtMs: null };
  }
  if (record.count >= MAX_ATTEMPTS) {
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAtMs: record.windowStartedAt + WINDOW_MS,
    };
  }
  return {
    allowed: true,
    remainingAttempts: MAX_ATTEMPTS - record.count,
    retryAtMs: null,
  };
}

/**
 * Pure state transition for a failed attempt. Returns the next record; the
 * window restarts when the previous one has fully elapsed.
 */
export function registerFailure(
  record: AttemptRecord | undefined,
  now: number,
): AttemptRecord {
  if (!record || now - record.windowStartedAt >= WINDOW_MS) {
    return { count: 1, windowStartedAt: now };
  }
  return { count: record.count + 1, windowStartedAt: record.windowStartedAt };
}

/** Drops records whose window has elapsed. Pure with respect to `now`. */
export function pruneExpired(
  store: Map<string, AttemptRecord>,
  now: number,
): void {
  for (const [key, record] of store) {
    if (now - record.windowStartedAt >= WINDOW_MS) store.delete(key);
  }
}

/**
 * If the store is still over capacity after pruning, evict the oldest windows
 * first. Bounds memory under a distributed guessing attempt.
 */
export function enforceCapacity(
  store: Map<string, AttemptRecord>,
  maxKeys: number = MAX_TRACKED_KEYS,
): void {
  if (store.size <= maxKeys) return;
  const oldestFirst = [...store.entries()].sort(
    (a, b) => a[1].windowStartedAt - b[1].windowStartedAt,
  );
  for (const [key] of oldestFirst.slice(0, store.size - maxKeys)) {
    store.delete(key);
  }
}

/**
 * A self-contained limiter instance. `now` is injectable so the time-based
 * behaviour is testable without sleeping.
 */
export class LoginRateLimiter {
  private readonly store = new Map<string, AttemptRecord>();
  // Declared explicitly rather than as a TS parameter property, which Node's
  // strip-only TypeScript loader cannot parse when running the tests.
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  check(key: string): RateLimitDecision {
    return evaluateAttempt(this.store.get(key), this.now());
  }

  recordFailure(key: string): RateLimitDecision {
    const now = this.now();
    pruneExpired(this.store, now);
    this.store.set(key, registerFailure(this.store.get(key), now));
    enforceCapacity(this.store);
    return evaluateAttempt(this.store.get(key), now);
  }

  /** Clears the counter for a key. Called on every successful login. */
  reset(key: string): void {
    this.store.delete(key);
  }

  /** Test/introspection helper. */
  size(): number {
    return this.store.size;
  }
}

/**
 * Process-wide limiter. Survives hot module reloads in dev by hanging off
 * globalThis, which also keeps the counter honest across route recompiles.
 */
const globalForLimiter = globalThis as typeof globalThis & {
  __leadEngineLoginLimiter?: LoginRateLimiter;
};

export const loginRateLimiter: LoginRateLimiter =
  globalForLimiter.__leadEngineLoginLimiter ??
  (globalForLimiter.__leadEngineLoginLimiter = new LoginRateLimiter());

/** Best-effort client IP from the proxy headers Nginx will set on the VPS. */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
