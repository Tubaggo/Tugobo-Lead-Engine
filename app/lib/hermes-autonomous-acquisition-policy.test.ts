import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACQUISITION_BLOCKING_REASONS,
  DEFAULT_ACQUISITION_POLICY,
  POLICY_HARD_LIMITS,
  buildAcquisitionAuditEvent,
  enforceAcquisitionBudget,
  evaluateAutonomousAcquisitionEligibility,
  evaluateMissionCandidateEligibility,
  selectNextAcquisitionRegions,
  summarizeAcquisitionRun,
  type AcquisitionDailyCounters,
  type AcquisitionPolicy,
  type AcquisitionRegion,
} from "./hermes-autonomous-acquisition-policy.ts";

const ZERO_COUNTERS: AcquisitionDailyCounters = {
  importedToday: 0,
  externalRequestsToday: 0,
  runsToday: 0,
};

function enabledPolicy(overrides: Partial<AcquisitionPolicy> = {}): AcquisitionPolicy {
  return {
    ...DEFAULT_ACQUISITION_POLICY,
    enabled: true,
    mode: "scheduled_safe",
    dryRun: false,
    ...overrides,
  };
}

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

/* ── defaults ───────────────────────────────────────────────── */

test("default policy is disabled and dry-run with low limits", () => {
  assert.equal(DEFAULT_ACQUISITION_POLICY.enabled, false);
  assert.equal(DEFAULT_ACQUISITION_POLICY.mode, "disabled");
  assert.equal(DEFAULT_ACQUISITION_POLICY.dryRun, true);
  assert.ok(DEFAULT_ACQUISITION_POLICY.dailyLeadLimit <= POLICY_HARD_LIMITS.dailyLeadLimit);
  assert.equal(DEFAULT_ACQUISITION_POLICY.maxRegionsPerRun, 1);
  assert.equal(DEFAULT_ACQUISITION_POLICY.maxMissionCandidatesPerRun, 5);
});

/* ── eligibility ────────────────────────────────────────────── */

test("disabled policy blocks every trigger", () => {
  for (const trigger of ["scheduled", "manual", "developer"] as const) {
    const r = evaluateAutonomousAcquisitionEligibility({
      policy: DEFAULT_ACQUISITION_POLICY,
      configErrors: [],
      trigger,
      hasActiveRun: false,
      counters: ZERO_COUNTERS,
      enabledRegionCount: 1,
    });
    assert.equal(r.eligible, false);
    assert.ok(r.blockingReasons.includes(ACQUISITION_BLOCKING_REASONS.disabled));
  }
});

test("invalid config blocks safely", () => {
  const r = evaluateAutonomousAcquisitionEligibility({
    policy: enabledPolicy(),
    configErrors: ["regions parse error"],
    trigger: "manual",
    hasActiveRun: false,
    counters: ZERO_COUNTERS,
    enabledRegionCount: 1,
  });
  assert.equal(r.eligible, false);
  assert.ok(r.blockingReasons.includes(ACQUISITION_BLOCKING_REASONS.invalidConfig));
});

test("manual_safe mode blocks scheduled trigger but allows manual", () => {
  const policy = enabledPolicy({ mode: "manual_safe" });
  const scheduled = evaluateAutonomousAcquisitionEligibility({
    policy,
    configErrors: [],
    trigger: "scheduled",
    hasActiveRun: false,
    counters: ZERO_COUNTERS,
    enabledRegionCount: 1,
  });
  assert.equal(scheduled.eligible, false);
  assert.ok(scheduled.blockingReasons.includes(ACQUISITION_BLOCKING_REASONS.wrongModeForTrigger));

  const manual = evaluateAutonomousAcquisitionEligibility({
    policy,
    configErrors: [],
    trigger: "manual",
    hasActiveRun: false,
    counters: ZERO_COUNTERS,
    enabledRegionCount: 1,
  });
  assert.equal(manual.eligible, true);
});

test("daily lead limit blocks", () => {
  const r = evaluateAutonomousAcquisitionEligibility({
    policy: enabledPolicy({ dailyLeadLimit: 5 }),
    configErrors: [],
    trigger: "manual",
    hasActiveRun: false,
    counters: { ...ZERO_COUNTERS, importedToday: 5 },
    enabledRegionCount: 1,
  });
  assert.equal(r.eligible, false);
  assert.ok(r.blockingReasons.includes(ACQUISITION_BLOCKING_REASONS.dailyLeadLimitReached));
});

test("daily request limit blocks", () => {
  const r = evaluateAutonomousAcquisitionEligibility({
    policy: enabledPolicy({ dailyExternalRequestLimit: 10 }),
    configErrors: [],
    trigger: "manual",
    hasActiveRun: false,
    counters: { ...ZERO_COUNTERS, externalRequestsToday: 10 },
    enabledRegionCount: 1,
  });
  assert.equal(r.eligible, false);
  assert.ok(r.blockingReasons.includes(ACQUISITION_BLOCKING_REASONS.dailyRequestLimitReached));
});

test("active run blocks with the exact founder sentence", () => {
  const r = evaluateAutonomousAcquisitionEligibility({
    policy: enabledPolicy(),
    configErrors: [],
    trigger: "manual",
    hasActiveRun: true,
    counters: ZERO_COUNTERS,
    enabledRegionCount: 1,
  });
  assert.equal(r.eligible, false);
  assert.ok(r.blockingReasons.includes("Hermes fırsat taraması zaten çalışıyor."));
});

test("zero enabled regions blocks", () => {
  const r = evaluateAutonomousAcquisitionEligibility({
    policy: enabledPolicy(),
    configErrors: [],
    trigger: "manual",
    hasActiveRun: false,
    counters: ZERO_COUNTERS,
    enabledRegionCount: 0,
  });
  assert.equal(r.eligible, false);
  assert.ok(r.blockingReasons.includes(ACQUISITION_BLOCKING_REASONS.noRegionsConfigured));
});

/* ── region selection ───────────────────────────────────────── */

const NOW = Date.UTC(2026, 6, 10, 9, 0, 0);
const HOUR = 60 * 60 * 1000;

test("region cooldown excludes recently scanned regions", () => {
  const regions = [
    region({ id: "r1", lastRunAt: NOW - 2 * HOUR, cooldownHours: 24 }),
    region({ id: "r2", city: "Bodrum", lastRunAt: NOW - 30 * HOUR, cooldownHours: 24 }),
  ];
  const selected = selectNextAcquisitionRegions({ policy: enabledPolicy(), regions, now: NOW });
  assert.deepEqual(selected.map((r) => r.id), ["r2"]);
});

test("rotation selects the least recently run region first", () => {
  const regions = [
    region({ id: "r1", priority: 1, lastRunAt: NOW - 40 * HOUR }),
    region({ id: "r2", city: "Bodrum", priority: 2, lastRunAt: null }),
    region({ id: "r3", city: "Fethiye", priority: 3, lastRunAt: NOW - 60 * HOUR }),
  ];
  const selected = selectNextAcquisitionRegions({
    policy: enabledPolicy({ maxRegionsPerRun: 2, regionRotationEnabled: true }),
    regions,
    now: NOW,
  });
  // Never-run (r2) counts as oldest, then r3 (60h ago).
  assert.deepEqual(selected.map((r) => r.id), ["r2", "r3"]);
});

test("rotation off selects by priority", () => {
  const regions = [
    region({ id: "r1", priority: 5, lastRunAt: null }),
    region({ id: "r2", city: "Bodrum", priority: 1, lastRunAt: null }),
  ];
  const selected = selectNextAcquisitionRegions({
    policy: enabledPolicy({ regionRotationEnabled: false }),
    regions,
    now: NOW,
  });
  assert.deepEqual(selected.map((r) => r.id), ["r2"]);
});

test("disabled regions are never selected and hard cap applies", () => {
  const regions = [
    region({ id: "r1", enabled: false }),
    region({ id: "r2", city: "Bodrum" }),
    region({ id: "r3", city: "Fethiye" }),
    region({ id: "r4", city: "Marmaris" }),
    region({ id: "r5", city: "Çeşme" }),
  ];
  const selected = selectNextAcquisitionRegions({
    policy: enabledPolicy({ maxRegionsPerRun: 99 }),
    regions,
    now: NOW,
  });
  assert.equal(selected.length, POLICY_HARD_LIMITS.maxRegionsPerRun);
  assert.ok(!selected.some((r) => r.id === "r1"));
});

/* ── budget ─────────────────────────────────────────────────── */

test("budget clamps to hard limits and computes remaining allowances", () => {
  const b = enforceAcquisitionBudget({
    policy: enabledPolicy({
      dailyLeadLimit: 9999,
      dailyExternalRequestLimit: 9999,
      maxResultsPerRegion: 9999,
      maxMissionCandidatesPerRun: 9999,
    }),
    counters: { importedToday: 10, externalRequestsToday: 20, runsToday: 1 },
    selectedRegionCount: 1,
  });
  assert.equal(b.allowed, true);
  assert.equal(b.remainingLeadBudget, POLICY_HARD_LIMITS.dailyLeadLimit - 10);
  assert.equal(b.remainingRequestBudget, POLICY_HARD_LIMITS.dailyExternalRequestLimit - 20);
  assert.equal(b.maxResultsPerRegion, POLICY_HARD_LIMITS.maxResultsPerRegion);
  assert.equal(b.maxMissionCandidates, POLICY_HARD_LIMITS.maxMissionCandidatesPerRun);
});

test("budget blocks when lead budget is exhausted", () => {
  const b = enforceAcquisitionBudget({
    policy: enabledPolicy({ dailyLeadLimit: 20 }),
    counters: { importedToday: 20, externalRequestsToday: 0, runsToday: 2 },
    selectedRegionCount: 1,
  });
  assert.equal(b.allowed, false);
  assert.ok(b.blockingReasons.includes(ACQUISITION_BLOCKING_REASONS.dailyLeadLimitReached));
});

test("budget blocks when request budget cannot cover selected regions", () => {
  const b = enforceAcquisitionBudget({
    policy: enabledPolicy({ dailyExternalRequestLimit: 10 }),
    counters: { importedToday: 0, externalRequestsToday: 9, runsToday: 1 },
    selectedRegionCount: 2,
  });
  assert.equal(b.allowed, false);
  assert.ok(b.blockingReasons.includes(ACQUISITION_BLOCKING_REASONS.dailyRequestLimitReached));
});

/* ── mission candidate eligibility ──────────────────────────── */

test("mission candidate threshold works", () => {
  const policy = enabledPolicy({ minVerifiedOpportunityScore: 70 });
  assert.equal(
    evaluateMissionCandidateEligibility({ opportunityScore: 69, hasPhone: true, hasWebsite: true, policy })
      .eligible,
    false,
  );
  assert.equal(
    evaluateMissionCandidateEligibility({ opportunityScore: 70, hasPhone: true, hasWebsite: true, policy })
      .eligible,
    true,
  );
});

test("missing contact path blocks a candidate", () => {
  const policy = enabledPolicy();
  const r = evaluateMissionCandidateEligibility({
    opportunityScore: 90,
    hasPhone: false,
    hasWebsite: false,
    policy,
  });
  assert.equal(r.eligible, false);
  assert.ok(r.reasons.includes("no_website_or_phone"));
  assert.ok(r.reasons.includes("no_contact_path"));
});

test("phone-only candidate passes contact requirements", () => {
  const r = evaluateMissionCandidateEligibility({
    opportunityScore: 90,
    hasPhone: true,
    hasWebsite: false,
    policy: enabledPolicy(),
  });
  assert.equal(r.eligible, true);
});

/* ── summary + audit ────────────────────────────────────────── */

test("dry-run summary announces a preview with no mutation", () => {
  const s = summarizeAcquisitionRun({
    status: "completed",
    dryRun: true,
    regionCities: ["Antalya"],
    evaluatedCount: 12,
    importedCount: 0,
    duplicateCount: 0,
    qualifiedCount: 4,
    missionCandidateCount: 4,
    blockingReasons: [],
  });
  assert.ok(s.includes("Önizleme"));
  assert.ok(s.includes("Hiçbir kayıt yapılmadı."));
});

test("blocked summary surfaces the first blocking reason", () => {
  const s = summarizeAcquisitionRun({
    status: "blocked",
    dryRun: false,
    regionCities: [],
    evaluatedCount: 0,
    importedCount: 0,
    duplicateCount: 0,
    qualifiedCount: 0,
    missionCandidateCount: 0,
    blockingReasons: [ACQUISITION_BLOCKING_REASONS.dailyLeadLimitReached],
  });
  assert.equal(s, "Bugün için tarama limiti tamamlandı.");
});

test("completed summary reports evaluated/imported/duplicate/mission counts in Turkish", () => {
  const s = summarizeAcquisitionRun({
    status: "completed",
    dryRun: false,
    regionCities: ["Antalya"],
    evaluatedCount: 24,
    importedCount: 8,
    duplicateCount: 3,
    qualifiedCount: 4,
    missionCandidateCount: 4,
    blockingReasons: [],
  });
  assert.ok(s.includes("24 işletmeyi değerlendirdi"));
  assert.ok(s.includes("8 yeni fırsat"));
  assert.ok(s.includes("3 işletme zaten listede"));
  assert.ok(s.includes("4 satış işi kararını bekliyor"));
});

test("audit event scrubs token-like content from detail", () => {
  const e = buildAcquisitionAuditEvent({
    type: "hermes_acquisition_run_started",
    at: NOW,
    detailTr: "Tarama başladı Bearer abc123 key=XYZ",
  });
  assert.ok(!e.detailTr.includes("abc123"));
  assert.ok(!e.detailTr.includes("XYZ"));
});
