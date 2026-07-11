import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  __resetAcquisitionRunRegistryForTests,
  finishAcquisitionRun,
  getAcquisitionTodayCounters,
  getActiveAcquisitionRun,
  getPendingAcquisitionCandidates,
  getRecentAcquisitionRuns,
  getRegionLastRunAt,
  hasSeenAcquisitionDedupeKey,
  markRegionsScanned,
  registerAcquisitionCandidates,
  rememberAcquisitionDedupeKeys,
  startAcquisitionRun,
  type StartAcquisitionRunInput,
} from "./hermes-acquisition-run-registry.ts";

const NOW = Date.UTC(2026, 6, 10, 9, 0, 0);

beforeEach(() => {
  __resetAcquisitionRunRegistryForTests();
});

function startInput(overrides: Partial<StartAcquisitionRunInput> = {}): StartAcquisitionRunInput {
  return {
    trigger: "manual",
    mode: "manual_safe",
    dryRun: false,
    selectedRegionsSafe: ["Antalya"],
    idempotencyKey: "manual|w1",
    now: NOW,
    ...overrides,
  };
}

test("run registers and appears in recent runs", () => {
  const r = startAcquisitionRun(startInput());
  assert.equal(r.ok, true);
  const recent = getRecentAcquisitionRuns(5);
  assert.equal(recent.length, 1);
  assert.equal(recent[0].status, "running");
  assert.deepEqual(recent[0].selectedRegionsSafe, ["Antalya"]);
});

test("active lock blocks a second run", () => {
  const first = startAcquisitionRun(startInput());
  assert.equal(first.ok, true);
  const second = startAcquisitionRun(startInput({ idempotencyKey: "manual|w2" }));
  assert.deepEqual(second, { ok: false, reason: "active_run" });
});

test("completed run releases the lock", () => {
  const first = startAcquisitionRun(startInput());
  assert.equal(first.ok, true);
  if (!first.ok) return;
  finishAcquisitionRun(first.run.id, { status: "completed", importedCount: 3 }, NOW + 1000);
  assert.equal(getActiveAcquisitionRun(NOW + 2000), null);
  const second = startAcquisitionRun(startInput({ idempotencyKey: "manual|w2", now: NOW + 3000 }));
  assert.equal(second.ok, true);
});

test("stale lock is released and the crashed run is marked failed", () => {
  const first = startAcquisitionRun(startInput());
  assert.equal(first.ok, true);
  // 11 minutes later, the never-finished run must not block acquisition.
  const active = getActiveAcquisitionRun(NOW + 11 * 60 * 1000);
  assert.equal(active, null);
  const recent = getRecentAcquisitionRuns(1);
  assert.equal(recent[0].status, "failed");
  const second = startAcquisitionRun(startInput({ idempotencyKey: "manual|w2", now: NOW + 11 * 60 * 1000 }));
  assert.equal(second.ok, true);
});

test("duplicate idempotency key is blocked after the first run completes", () => {
  const first = startAcquisitionRun(startInput({ idempotencyKey: "scheduled|2026-07-10-09" }));
  assert.equal(first.ok, true);
  if (!first.ok) return;
  finishAcquisitionRun(first.run.id, { status: "completed" }, NOW + 1000);

  const retry = startAcquisitionRun(
    startInput({ idempotencyKey: "scheduled|2026-07-10-09", now: NOW + 2000 }),
  );
  assert.deepEqual(retry, { ok: false, reason: "duplicate_idempotency" });
});

test("dry runs never consume an idempotency slot and stay repeatable", () => {
  const first = startAcquisitionRun(startInput({ dryRun: true, idempotencyKey: "dev|w1" }));
  assert.equal(first.ok, true);
  if (!first.ok) return;
  finishAcquisitionRun(first.run.id, { status: "completed" }, NOW + 500);

  const second = startAcquisitionRun(
    startInput({ dryRun: true, idempotencyKey: "dev|w1", now: NOW + 1000 }),
  );
  assert.equal(second.ok, true);
});

test("sanitized run output contains no secret or provider-looking payload fields", () => {
  const first = startAcquisitionRun(startInput());
  assert.equal(first.ok, true);
  if (!first.ok) return;
  finishAcquisitionRun(first.run.id, { status: "completed", summaryTr: "Tamamlandı." }, NOW + 1000);
  const json = JSON.stringify(getRecentAcquisitionRuns(5));
  for (const forbidden of ["apiKey", "accessToken", "access_token", "place_id", "Bearer "]) {
    assert.ok(!json.includes(forbidden), `run output must not contain ${forbidden}`);
  }
});

test("today counters aggregate only today's non-dry runs", () => {
  const a = startAcquisitionRun(startInput({ idempotencyKey: "k1" }));
  assert.equal(a.ok, true);
  if (!a.ok) return;
  finishAcquisitionRun(
    a.run.id,
    { status: "completed", importedCount: 4, externalRequestCount: 6, evaluatedCount: 10 },
    NOW + 1000,
  );

  const dry = startAcquisitionRun(startInput({ dryRun: true, idempotencyKey: "k2", now: NOW + 2000 }));
  assert.equal(dry.ok, true);
  if (!dry.ok) return;
  finishAcquisitionRun(dry.run.id, { status: "completed", evaluatedCount: 99 }, NOW + 3000);

  const counters = getAcquisitionTodayCounters(NOW + 4000);
  assert.equal(counters.importedToday, 4);
  assert.equal(counters.externalRequestsToday, 6);
  assert.equal(counters.evaluatedToday, 10);
  assert.equal(counters.runsToday, 1);
});

test("region last-run bookkeeping works", () => {
  assert.equal(getRegionLastRunAt("r1"), null);
  markRegionsScanned(["r1", "r2"], NOW);
  assert.equal(getRegionLastRunAt("r1"), NOW);
  assert.equal(getRegionLastRunAt("r2"), NOW);
});

test("dedupe keys are remembered across runs", () => {
  assert.equal(hasSeenAcquisitionDedupeKey(["otel deniz|antalya"]), false);
  rememberAcquisitionDedupeKeys(["otel deniz|antalya", "phone:5321112233"]);
  assert.equal(hasSeenAcquisitionDedupeKey(["phone:5321112233"]), true);
  assert.equal(hasSeenAcquisitionDedupeKey(["web:other.com"]), false);
});

test("candidates register for real runs and never for dry runs", () => {
  const real = startAcquisitionRun(startInput({ idempotencyKey: "k1" }));
  assert.equal(real.ok, true);
  if (!real.ok) return;
  const stored = registerAcquisitionCandidates(
    real.run.id,
    [{ id: "gmaps-1", name: "Otel Deniz", city: "Antalya" }],
    NOW + 100,
  );
  assert.equal(stored, 1);
  finishAcquisitionRun(real.run.id, { status: "completed" }, NOW + 200);

  const dry = startAcquisitionRun(startInput({ dryRun: true, idempotencyKey: "k2", now: NOW + 300 }));
  assert.equal(dry.ok, true);
  if (!dry.ok) return;
  const dryStored = registerAcquisitionCandidates(
    dry.run.id,
    [{ id: "gmaps-2", name: "Otel Kaya", city: "Bodrum" }],
    NOW + 400,
  );
  assert.equal(dryStored, 0);

  const batches = getPendingAcquisitionCandidates(NOW + 500);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].leads[0].id, "gmaps-1");
});

test("candidate batches expire after their TTL", () => {
  const real = startAcquisitionRun(startInput({ idempotencyKey: "k1" }));
  assert.equal(real.ok, true);
  if (!real.ok) return;
  registerAcquisitionCandidates(real.run.id, [{ id: "gmaps-1", name: "A", city: "Antalya" }], NOW);
  finishAcquisitionRun(real.run.id, { status: "completed" }, NOW + 100);

  assert.equal(getPendingAcquisitionCandidates(NOW + 1000).length, 1);
  assert.equal(getPendingAcquisitionCandidates(NOW + 49 * 60 * 60 * 1000).length, 0);
});
