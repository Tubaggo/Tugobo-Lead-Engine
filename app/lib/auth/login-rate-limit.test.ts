import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  LoginRateLimiter,
  MAX_ATTEMPTS,
  WINDOW_MS,
  buildAttemptKey,
  clientIpFromHeaders,
  enforceCapacity,
  evaluateAttempt,
  pruneExpired,
  registerFailure,
  type AttemptRecord,
} from "./login-rate-limit.ts";

describe("buildAttemptKey", () => {
  test("normalizes the e-mail so casing cannot split the counter", () => {
    assert.equal(
      buildAttemptKey("1.2.3.4", "Founder@Tugobo.com "),
      buildAttemptKey("1.2.3.4", "founder@tugobo.com"),
    );
  });

  test("keys on IP as well as e-mail", () => {
    assert.notEqual(
      buildAttemptKey("1.2.3.4", "a@b.com"),
      buildAttemptKey("5.6.7.8", "a@b.com"),
    );
  });

  test("falls back to a placeholder when the IP is unknown", () => {
    assert.equal(buildAttemptKey("", "a@b.com"), "unknown|a@b.com");
  });
});

describe("evaluateAttempt", () => {
  test("allows a first attempt", () => {
    const decision = evaluateAttempt(undefined, 1_000);
    assert.equal(decision.allowed, true);
    assert.equal(decision.remainingAttempts, MAX_ATTEMPTS);
  });

  test("blocks once the limit is reached", () => {
    const record: AttemptRecord = {
      count: MAX_ATTEMPTS,
      windowStartedAt: 1_000,
    };
    const decision = evaluateAttempt(record, 2_000);
    assert.equal(decision.allowed, false);
    assert.equal(decision.remainingAttempts, 0);
    assert.equal(decision.retryAtMs, 1_000 + WINDOW_MS);
  });

  test("allows again once the window has fully elapsed", () => {
    const record: AttemptRecord = {
      count: MAX_ATTEMPTS,
      windowStartedAt: 1_000,
    };
    const decision = evaluateAttempt(record, 1_000 + WINDOW_MS);
    assert.equal(decision.allowed, true);
    assert.equal(decision.remainingAttempts, MAX_ATTEMPTS);
  });
});

describe("registerFailure", () => {
  test("starts a window on the first failure", () => {
    assert.deepEqual(registerFailure(undefined, 500), {
      count: 1,
      windowStartedAt: 500,
    });
  });

  test("increments without extending the window", () => {
    const first: AttemptRecord = { count: 1, windowStartedAt: 500 };
    assert.deepEqual(registerFailure(first, 900), {
      count: 2,
      windowStartedAt: 500,
    });
  });

  test("restarts the window after it elapses", () => {
    const stale: AttemptRecord = { count: 4, windowStartedAt: 0 };
    assert.deepEqual(registerFailure(stale, WINDOW_MS + 1), {
      count: 1,
      windowStartedAt: WINDOW_MS + 1,
    });
  });
});

describe("LoginRateLimiter", () => {
  test("blocks the sixth attempt within the window", () => {
    let now = 0;
    const limiter = new LoginRateLimiter(() => now);
    const key = buildAttemptKey("1.2.3.4", "founder@tugobo.com");

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      assert.equal(limiter.check(key).allowed, true, `attempt ${i + 1}`);
      limiter.recordFailure(key);
      now += 1_000;
    }

    assert.equal(limiter.check(key).allowed, false);
  });

  test("a successful login clears the counter", () => {
    let now = 0;
    const limiter = new LoginRateLimiter(() => now);
    const key = buildAttemptKey("1.2.3.4", "founder@tugobo.com");

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      limiter.recordFailure(key);
      now += 1_000;
    }
    assert.equal(limiter.check(key).allowed, false);

    limiter.reset(key);
    assert.equal(limiter.check(key).allowed, true);
    assert.equal(limiter.check(key).remainingAttempts, MAX_ATTEMPTS);
  });

  test("lock expires after the window", () => {
    let now = 0;
    const limiter = new LoginRateLimiter(() => now);
    const key = buildAttemptKey("1.2.3.4", "founder@tugobo.com");

    for (let i = 0; i < MAX_ATTEMPTS; i++) limiter.recordFailure(key);
    assert.equal(limiter.check(key).allowed, false);

    now += WINDOW_MS;
    assert.equal(limiter.check(key).allowed, true);
  });

  test("one blocked identity does not lock out another", () => {
    let now = 0;
    const limiter = new LoginRateLimiter(() => now);
    const blocked = buildAttemptKey("1.2.3.4", "founder@tugobo.com");
    const other = buildAttemptKey("9.9.9.9", "founder@tugobo.com");

    for (let i = 0; i < MAX_ATTEMPTS; i++) limiter.recordFailure(blocked);

    assert.equal(limiter.check(blocked).allowed, false);
    assert.equal(limiter.check(other).allowed, true);
  });
});

describe("store maintenance", () => {
  test("pruneExpired drops only elapsed windows", () => {
    const store = new Map<string, AttemptRecord>([
      ["fresh", { count: 1, windowStartedAt: WINDOW_MS }],
      ["stale", { count: 3, windowStartedAt: 0 }],
    ]);

    pruneExpired(store, WINDOW_MS + 1);

    assert.equal(store.has("fresh"), true);
    assert.equal(store.has("stale"), false);
  });

  test("enforceCapacity evicts the oldest windows first", () => {
    const store = new Map<string, AttemptRecord>();
    for (let i = 0; i < 10; i++) {
      store.set(`k${i}`, { count: 1, windowStartedAt: i });
    }

    enforceCapacity(store, 4);

    assert.equal(store.size, 4);
    assert.equal(store.has("k0"), false);
    assert.equal(store.has("k9"), true);
  });

  test("the limiter stays bounded under many distinct keys", () => {
    let now = 0;
    const limiter = new LoginRateLimiter(() => now);
    for (let i = 0; i < 6000; i++) {
      limiter.recordFailure(buildAttemptKey(`10.0.0.${i}`, `u${i}@x.com`));
    }
    assert.ok(limiter.size() <= 5000, `size was ${limiter.size()}`);
  });
});

describe("clientIpFromHeaders", () => {
  test("prefers the first x-forwarded-for entry", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
    assert.equal(clientIpFromHeaders(headers), "203.0.113.9");
  });

  test("falls back to x-real-ip", () => {
    const headers = new Headers({ "x-real-ip": "198.51.100.7" });
    assert.equal(clientIpFromHeaders(headers), "198.51.100.7");
  });

  test("returns a placeholder when no proxy header is present", () => {
    assert.equal(clientIpFromHeaders(new Headers()), "unknown");
  });
});
