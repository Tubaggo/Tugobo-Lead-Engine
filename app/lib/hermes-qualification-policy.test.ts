import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_QUALIFICATION_POLICY,
  QUALIFICATION_HARD_LIMITS,
  deriveQualificationPolicy,
} from "./hermes-qualification-policy.ts";
import { DEFAULT_ACQUISITION_POLICY } from "./hermes-autonomous-acquisition-policy.ts";

test("güvenli default: kapalı, iletişim + freshness zorunlu, duplicate blok açık", () => {
  const d = DEFAULT_QUALIFICATION_POLICY;
  assert.equal(d.enabled, false);
  assert.equal(d.requireContactPath, true);
  assert.equal(d.requireFreshEnrichment, true);
  assert.equal(d.blockDuplicateMission, true);
  assert.equal(d.maxSalesReadyPerRun, DEFAULT_ACQUISITION_POLICY.maxMissionCandidatesPerRun);
});

test("acquisition kapalıyken qualification da kapalıdır", () => {
  const derived = deriveQualificationPolicy(DEFAULT_ACQUISITION_POLICY);
  assert.equal(derived.enabled, false);
  const disabledMode = deriveQualificationPolicy({
    ...DEFAULT_ACQUISITION_POLICY,
    enabled: true,
    mode: "disabled",
  });
  assert.equal(disabledMode.enabled, false);
});

test("eşikler server kontrolündedir — acquisition policy'sinden birebir gelir", () => {
  const derived = deriveQualificationPolicy({
    ...DEFAULT_ACQUISITION_POLICY,
    enabled: true,
    mode: "manual_safe",
    minVerifiedOpportunityScore: 82,
    maxMissionCandidatesPerRun: 4,
    requireContactPath: false,
  });
  assert.equal(derived.minVerifiedOpportunityScore, 82);
  assert.equal(derived.maxSalesReadyPerRun, 4);
  assert.equal(derived.requireContactPath, false);
});

test("geçersiz sayılar güvenli default'a/clamp'e düşer", () => {
  const derived = deriveQualificationPolicy(
    {
      ...DEFAULT_ACQUISITION_POLICY,
      enabled: true,
      mode: "manual_safe",
      minVerifiedOpportunityScore: Number.NaN,
      maxMissionCandidatesPerRun: 999,
    },
    { maxEnrichmentAgeHours: -5 },
  );
  assert.equal(
    derived.minVerifiedOpportunityScore,
    DEFAULT_QUALIFICATION_POLICY.minVerifiedOpportunityScore,
  );
  assert.equal(derived.maxSalesReadyPerRun, QUALIFICATION_HARD_LIMITS.maxSalesReadyPerRun);
  assert.equal(
    derived.maxEnrichmentAgeHours,
    QUALIFICATION_HARD_LIMITS.maxEnrichmentAgeHoursMin,
  );
});

test("sales_ready cap hard limit tavanını asla aşamaz", () => {
  const derived = deriveQualificationPolicy({
    ...DEFAULT_ACQUISITION_POLICY,
    maxMissionCandidatesPerRun: 100,
  });
  assert.ok(derived.maxSalesReadyPerRun <= QUALIFICATION_HARD_LIMITS.maxSalesReadyPerRun);
});

test("overrides yalnız qualification'a özgü alanları etkiler", () => {
  const derived = deriveQualificationPolicy(
    { ...DEFAULT_ACQUISITION_POLICY, enabled: true, mode: "manual_safe" },
    { requireWebsite: false, allowManualReview: false, blockDuplicateMission: false, minLeadScore: 60 },
  );
  assert.equal(derived.requireWebsite, false);
  assert.equal(derived.allowManualReview, false);
  assert.equal(derived.blockDuplicateMission, false);
  assert.equal(derived.minLeadScore, 60);
  // Skor eşiği override edilemez — acquisition'dan gelir.
  assert.equal(
    derived.minVerifiedOpportunityScore,
    DEFAULT_ACQUISITION_POLICY.minVerifiedOpportunityScore,
  );
});
