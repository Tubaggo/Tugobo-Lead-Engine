import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  runHermesAutonomousAcquisition,
  type AcquisitionDiscoveredLead,
  type AcquisitionImportAdapter,
} from "./hermes-autonomous-acquisition-runtime.ts";
import {
  __resetAcquisitionRunRegistryForTests,
  getPendingAcquisitionCandidates,
  getRecentAcquisitionRuns,
  startAcquisitionRun,
} from "./hermes-acquisition-run-registry.ts";
import {
  DEFAULT_ACQUISITION_POLICY,
  type AcquisitionPolicy,
  type AcquisitionRegion,
} from "./hermes-autonomous-acquisition-policy.ts";
import type { AcquisitionConfig } from "./hermes-acquisition-config.ts";

const NOW = Date.UTC(2026, 6, 10, 9, 0, 0);

beforeEach(() => {
  __resetAcquisitionRunRegistryForTests();
});

function region(overrides: Partial<AcquisitionRegion> = {}): AcquisitionRegion {
  return {
    id: "antalya-hotel",
    city: "Antalya",
    country: "TR",
    enabled: true,
    priority: 1,
    maxResultsPerRun: 10,
    leadType: "Hotel",
    lastRunAt: null,
    cooldownHours: 24,
    ...overrides,
  };
}

function config(
  policyOverrides: Partial<AcquisitionPolicy> = {},
  regions: AcquisitionRegion[] = [region()],
  configErrors: string[] = [],
): AcquisitionConfig {
  return {
    policy: {
      ...DEFAULT_ACQUISITION_POLICY,
      enabled: true,
      mode: "scheduled_safe",
      dryRun: false,
      ...policyOverrides,
    },
    regions,
    configErrors,
  };
}

function lead(overrides: Partial<AcquisitionDiscoveredLead> = {}): AcquisitionDiscoveredLead {
  return {
    id: "gmaps-abc",
    name: "Otel Deniz",
    city: "Antalya",
    phone: "+90 532 111 22 33",
    website: "oteldeniz.com",
    verifiedOpportunityScore: 85,
    ...overrides,
  };
}

function trackingAdapter(
  leads: AcquisitionDiscoveredLead[],
  externalRequestCount = leads.length + 1,
): { adapter: AcquisitionImportAdapter; calls: Array<{ city: string; maxResults: number }> } {
  const calls: Array<{ city: string; maxResults: number }> = [];
  const adapter: AcquisitionImportAdapter = async ({ region, maxResults }) => {
    calls.push({ city: region.city, maxResults });
    return { ok: true, leads, externalRequestCount };
  };
  return { adapter, calls };
}

/* ── disabled / invalid config ──────────────────────────────── */

test("no external call and blocked status when acquisition is disabled", async () => {
  const { adapter, calls } = trackingAdapter([lead()]);
  const result = await runHermesAutonomousAcquisition({
    trigger: "scheduled",
    config: {
      policy: DEFAULT_ACQUISITION_POLICY,
      regions: [region()],
      configErrors: [],
    },
    importAdapter: adapter,
    now: NOW,
  });
  assert.equal(result.status, "blocked");
  assert.equal(calls.length, 0);
  assert.ok(result.blockingReasons.includes("Fırsat taraması henüz etkin değil."));
});

test("no external call when config is invalid", async () => {
  const { adapter, calls } = trackingAdapter([lead()]);
  const result = await runHermesAutonomousAcquisition({
    trigger: "manual",
    config: config({}, [region()], ["Bölge yapılandırması çözümlenemedi (geçersiz JSON)."]),
    importAdapter: adapter,
    now: NOW,
  });
  assert.equal(result.status, "blocked");
  assert.equal(calls.length, 0);
});

/* ── dry run ────────────────────────────────────────────────── */

test("dry run produces a plan without invoking the adapter or registering candidates", async () => {
  const { adapter, calls } = trackingAdapter([lead()]);
  const result = await runHermesAutonomousAcquisition({
    trigger: "developer",
    config: config({ dryRun: true }),
    importAdapter: adapter,
    now: NOW,
  });
  assert.equal(result.status, "completed");
  assert.equal(result.dryRun, true);
  assert.equal(calls.length, 0);
  assert.equal(result.importedCount, 0);
  assert.ok(result.evaluatedCount > 0); // planned evaluations
  assert.equal(getPendingAcquisitionCandidates(NOW).length, 0);
  assert.ok(result.summaryTr.includes("Hiçbir kayıt yapılmadı."));
});

test("forceDryRun overrides a live policy into a dry run", async () => {
  const { adapter, calls } = trackingAdapter([lead()]);
  const result = await runHermesAutonomousAcquisition({
    trigger: "developer",
    config: config({ dryRun: false }),
    importAdapter: adapter,
    forceDryRun: true,
    now: NOW,
  });
  assert.equal(result.dryRun, true);
  assert.equal(calls.length, 0);
});

/* ── safe run happy path ────────────────────────────────────── */

test("safe run calls the import adapter and hands off qualified leads as capped mission candidates", async () => {
  const leads = [
    lead({ id: "gmaps-1", name: "Otel A", phone: "+90 532 100 00 01", website: "a.com", verifiedOpportunityScore: 90 }),
    lead({ id: "gmaps-2", name: "Otel B", phone: "+90 532 100 00 02", website: "b.com", verifiedOpportunityScore: 80 }),
    lead({ id: "gmaps-3", name: "Otel C", phone: "+90 532 100 00 03", website: "c.com", verifiedOpportunityScore: 40 }),
    lead({ id: "gmaps-4", name: "Otel D", phone: undefined, website: undefined, verifiedOpportunityScore: 95 }),
  ];
  const { adapter, calls } = trackingAdapter(leads, 5);
  const result = await runHermesAutonomousAcquisition({
    trigger: "manual",
    config: config({ maxMissionCandidatesPerRun: 2, minVerifiedOpportunityScore: 70 }),
    importAdapter: adapter,
    now: NOW,
  });

  assert.equal(calls.length, 1);
  assert.equal(result.evaluatedCount, 4);
  // C fails the score bar, D has no contact path → 2 qualified, cap is 2.
  assert.equal(result.qualifiedCount, 2);
  assert.equal(result.missionCandidateCount, 2);
  assert.equal(result.missionCreatedCount, 2);
  assert.equal(result.importedCount, 2);
  assert.equal(result.externalRequestCount, 5);
  assert.equal(result.status, "completed");

  const batches = getPendingAcquisitionCandidates(NOW);
  assert.equal(batches.length, 1);
  assert.deepEqual(
    batches[0].leads.map((l) => l.id),
    ["gmaps-1", "gmaps-2"],
  );
});

test("unqualified leads never become mission candidates", async () => {
  const { adapter } = trackingAdapter([
    lead({ id: "gmaps-1", verifiedOpportunityScore: 10 }),
    lead({ id: "gmaps-2", name: "Otel B", phone: undefined, website: undefined }),
  ]);
  const result = await runHermesAutonomousAcquisition({
    trigger: "manual",
    config: config(),
    importAdapter: adapter,
    now: NOW,
  });
  assert.equal(result.missionCandidateCount, 0);
  assert.equal(getPendingAcquisitionCandidates(NOW).length, 0);
});

test("mission candidate cap produces a partial run when more leads qualify", async () => {
  const leads = Array.from({ length: 5 }, (_, i) =>
    lead({
      id: `gmaps-${i}`,
      name: `Otel ${i}`,
      phone: `+90 532 100 10 0${i}`,
      website: `otel${i}.com`,
      verifiedOpportunityScore: 90,
    }),
  );
  const { adapter } = trackingAdapter(leads);
  const result = await runHermesAutonomousAcquisition({
    trigger: "manual",
    config: config({ maxMissionCandidatesPerRun: 2 }),
    importAdapter: adapter,
    now: NOW,
  });
  assert.equal(result.missionCandidateCount, 2);
  assert.equal(result.status, "partial");
});

/* ── duplicates / retry ─────────────────────────────────────── */

test("duplicates are skipped within a run and across runs; retry does not duplicate a mission", async () => {
  const theLead = lead();
  const { adapter } = trackingAdapter([theLead, { ...theLead }]);

  const first = await runHermesAutonomousAcquisition({
    trigger: "manual",
    config: config(),
    importAdapter: adapter,
    idempotencyKey: "k1",
    now: NOW,
  });
  assert.equal(first.missionCandidateCount, 1);
  assert.equal(first.duplicateCount, 1); // intra-run copy skipped

  // Retry an hour later with a different idempotency key — the same
  // business must not become a second candidate.
  const second = await runHermesAutonomousAcquisition({
    trigger: "manual",
    config: config(),
    importAdapter: adapter,
    idempotencyKey: "k2",
    now: NOW + 25 * 60 * 60 * 1000,
  });
  assert.equal(second.missionCandidateCount, 0);
  assert.equal(second.duplicateCount, 2);

  const totalCandidates = getPendingAcquisitionCandidates(NOW + 26 * 60 * 60 * 1000).reduce(
    (s, b) => s + b.leads.length,
    0,
  );
  assert.equal(totalCandidates, 1);
});

test("same idempotency key blocks the retry run entirely", async () => {
  const { adapter } = trackingAdapter([lead()]);
  const first = await runHermesAutonomousAcquisition({
    trigger: "scheduled",
    config: config(),
    importAdapter: adapter,
    idempotencyKey: "cron|2026-07-10-09",
    now: NOW,
  });
  assert.equal(first.status, "completed");

  const retry = await runHermesAutonomousAcquisition({
    trigger: "scheduled",
    config: config({}, [region({ id: "r2", city: "Bodrum" })]),
    importAdapter: adapter,
    idempotencyKey: "cron|2026-07-10-09",
    now: NOW + 60 * 1000,
  });
  assert.equal(retry.status, "blocked");
  assert.ok(retry.blockingReasons.includes("Bu tarama kısa süre önce zaten çalıştırıldı."));
});

/* ── concurrency ────────────────────────────────────────────── */

test("an active run blocks a second run", async () => {
  // Take the lock directly, simulating an in-flight run.
  const held = startAcquisitionRun({
    trigger: "manual",
    mode: "manual_safe",
    dryRun: false,
    selectedRegionsSafe: ["Antalya"],
    idempotencyKey: "held",
    now: NOW,
  });
  assert.equal(held.ok, true);

  const { adapter, calls } = trackingAdapter([lead()]);
  const result = await runHermesAutonomousAcquisition({
    trigger: "manual",
    config: config(),
    importAdapter: adapter,
    now: NOW + 1000,
  });
  assert.equal(result.status, "blocked");
  assert.ok(result.blockingReasons.includes("Hermes fırsat taraması zaten çalışıyor."));
  assert.equal(calls.length, 0);
});

/* ── provider failure ───────────────────────────────────────── */

test("partial provider failure returns partial, not a crash", async () => {
  let call = 0;
  const adapter: AcquisitionImportAdapter = async () => {
    call += 1;
    if (call === 1) return { ok: false, kind: "provider_error", externalRequestCount: 1 };
    return { ok: true, leads: [lead()], externalRequestCount: 2 };
  };
  const result = await runHermesAutonomousAcquisition({
    trigger: "manual",
    config: config({ maxRegionsPerRun: 2 }, [
      region({ id: "r1", city: "Antalya" }),
      region({ id: "r2", city: "Bodrum" }),
    ]),
    importAdapter: adapter,
    now: NOW,
  });
  assert.equal(result.status, "partial");
  assert.equal(result.missionCandidateCount, 1);
  assert.equal(result.externalRequestCount, 3);
});

test("rate limit stops the run safely as partial", async () => {
  const adapter: AcquisitionImportAdapter = async () => ({
    ok: false,
    kind: "rate_limit",
    externalRequestCount: 1,
  });
  const result = await runHermesAutonomousAcquisition({
    trigger: "manual",
    config: config(),
    importAdapter: adapter,
    now: NOW,
  });
  assert.equal(result.status, "partial");
  assert.equal(result.missionCandidateCount, 0);
});

test("an adapter that throws finalizes the run as failed and releases the lock", async () => {
  const adapter: AcquisitionImportAdapter = async () => {
    throw new Error("boom with secret token=abc");
  };
  const result = await runHermesAutonomousAcquisition({
    trigger: "manual",
    config: config(),
    importAdapter: adapter,
    idempotencyKey: "k-fail",
    now: NOW,
  });
  assert.equal(result.status, "failed");
  // The raw error text must never surface.
  const stored = JSON.stringify(getRecentAcquisitionRuns(3));
  assert.ok(!stored.includes("boom with secret"));

  // Lock released — a new run can start.
  const { adapter: okAdapter } = trackingAdapter([lead()]);
  const next = await runHermesAutonomousAcquisition({
    trigger: "manual",
    config: config(),
    importAdapter: okAdapter,
    idempotencyKey: "k-next",
    now: NOW + 5000,
  });
  assert.notEqual(next.status, "blocked");
});

/* ── budgets ────────────────────────────────────────────────── */

test("daily lead limit already reached blocks before any external call", async () => {
  const { adapter } = trackingAdapter(
    Array.from({ length: 5 }, (_, i) =>
      lead({ id: `gmaps-${i}`, name: `Otel ${i}`, phone: `+90 532 200 10 0${i}`, website: `x${i}.com` }),
    ),
  );
  const first = await runHermesAutonomousAcquisition({
    trigger: "manual",
    config: config({ dailyLeadLimit: 5, maxMissionCandidatesPerRun: 5 }),
    importAdapter: adapter,
    idempotencyKey: "k1",
    now: NOW,
  });
  assert.equal(first.importedCount, 5);

  const { adapter: secondAdapter, calls } = trackingAdapter([lead({ id: "gmaps-x", name: "Otel X" })]);
  const second = await runHermesAutonomousAcquisition({
    trigger: "manual",
    config: config({ dailyLeadLimit: 5 }, [region({ id: "r2", city: "Bodrum" })]),
    importAdapter: secondAdapter,
    idempotencyKey: "k2",
    now: NOW + 60 * 60 * 1000,
  });
  assert.equal(second.status, "blocked");
  assert.equal(calls.length, 0);
  assert.ok(second.blockingReasons.includes("Bugün için tarama limiti tamamlandı."));
});

test("region cooldown prevents rescanning the same region", async () => {
  const { adapter } = trackingAdapter([lead()]);
  const first = await runHermesAutonomousAcquisition({
    trigger: "manual",
    config: config({ dailyLeadLimit: 50, dailyExternalRequestLimit: 100 }),
    importAdapter: adapter,
    idempotencyKey: "k1",
    now: NOW,
  });
  assert.equal(first.status, "completed");

  const { adapter: adapter2, calls } = trackingAdapter([lead({ id: "gmaps-2", name: "Otel Yeni" })]);
  const second = await runHermesAutonomousAcquisition({
    trigger: "manual",
    config: config({ dailyLeadLimit: 50, dailyExternalRequestLimit: 100 }),
    importAdapter: adapter2,
    idempotencyKey: "k2",
    now: NOW + 2 * 60 * 60 * 1000, // 2h later, cooldown is 24h
  });
  assert.equal(second.status, "blocked");
  assert.equal(calls.length, 0);
  assert.ok(second.blockingReasons.includes("Şu anda taranmaya uygun bölge yok."));
});
