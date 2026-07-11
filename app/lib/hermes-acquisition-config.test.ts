import { test } from "node:test";
import assert from "node:assert/strict";
import { loadAcquisitionConfigFromEnv } from "./hermes-acquisition-config.ts";
import {
  DEFAULT_ACQUISITION_POLICY,
  POLICY_HARD_LIMITS,
} from "./hermes-autonomous-acquisition-policy.ts";

const VALID_REGIONS_JSON = JSON.stringify([
  { id: "antalya-hotel", city: "Antalya", leadType: "Hotel", priority: 1, maxResultsPerRun: 10, cooldownHours: 24 },
  { id: "bodrum-boutique", city: "Bodrum", leadType: "Boutique Hotel", priority: 2 },
]);

test("empty env produces the safe defaults: disabled, dry-run, no regions, no errors", () => {
  const c = loadAcquisitionConfigFromEnv({});
  assert.equal(c.policy.enabled, false);
  assert.equal(c.policy.mode, "disabled");
  assert.equal(c.policy.dryRun, true);
  assert.deepEqual(c.regions, []);
  assert.deepEqual(c.configErrors, []);
  assert.equal(c.policy.dailyLeadLimit, DEFAULT_ACQUISITION_POLICY.dailyLeadLimit);
});

test("a fully valid enabled config parses regions and limits", () => {
  const c = loadAcquisitionConfigFromEnv({
    HERMES_AUTONOMOUS_ACQUISITION_ENABLED: "true",
    HERMES_AUTONOMOUS_ACQUISITION_MODE: "scheduled_safe",
    HERMES_ACQUISITION_DRY_RUN: "false",
    HERMES_ACQUISITION_DAILY_LEAD_LIMIT: "30",
    HERMES_ACQUISITION_DAILY_REQUEST_LIMIT: "40",
    HERMES_ACQUISITION_MAX_REGIONS_PER_RUN: "2",
    HERMES_ACQUISITION_MAX_RESULTS_PER_REGION: "10",
    HERMES_ACQUISITION_MAX_MISSIONS_PER_RUN: "5",
    HERMES_ACQUISITION_MIN_OPPORTUNITY_SCORE: "75",
    HERMES_ACQUISITION_REGIONS_JSON: VALID_REGIONS_JSON,
  });
  assert.deepEqual(c.configErrors, []);
  assert.equal(c.policy.enabled, true);
  assert.equal(c.policy.mode, "scheduled_safe");
  assert.equal(c.policy.dryRun, false);
  assert.equal(c.policy.dailyLeadLimit, 30);
  assert.equal(c.policy.minVerifiedOpportunityScore, 75);
  assert.equal(c.regions.length, 2);
  assert.equal(c.regions[0].city, "Antalya");
  assert.equal(c.regions[1].cooldownHours, DEFAULT_ACQUISITION_POLICY.cooldownHours);
});

test("broken numeric env values fall back to safe defaults", () => {
  const c = loadAcquisitionConfigFromEnv({
    HERMES_ACQUISITION_DAILY_LEAD_LIMIT: "banana",
    HERMES_ACQUISITION_DAILY_REQUEST_LIMIT: "",
  });
  assert.equal(c.policy.dailyLeadLimit, DEFAULT_ACQUISITION_POLICY.dailyLeadLimit);
  assert.equal(c.policy.dailyExternalRequestLimit, DEFAULT_ACQUISITION_POLICY.dailyExternalRequestLimit);
});

test("oversized numeric env values are clamped to hard limits", () => {
  const c = loadAcquisitionConfigFromEnv({
    HERMES_ACQUISITION_DAILY_LEAD_LIMIT: "99999",
    HERMES_ACQUISITION_MAX_REGIONS_PER_RUN: "50",
    HERMES_ACQUISITION_MAX_RESULTS_PER_REGION: "500",
    HERMES_ACQUISITION_MAX_MISSIONS_PER_RUN: "500",
  });
  assert.equal(c.policy.dailyLeadLimit, POLICY_HARD_LIMITS.dailyLeadLimit);
  assert.equal(c.policy.maxRegionsPerRun, POLICY_HARD_LIMITS.maxRegionsPerRun);
  assert.equal(c.policy.maxResultsPerRegion, POLICY_HARD_LIMITS.maxResultsPerRegion);
  assert.equal(c.policy.maxMissionCandidatesPerRun, POLICY_HARD_LIMITS.maxMissionCandidatesPerRun);
});

test("unknown mode value resolves to disabled", () => {
  const c = loadAcquisitionConfigFromEnv({
    HERMES_AUTONOMOUS_ACQUISITION_MODE: "yolo_mode",
  });
  assert.equal(c.policy.mode, "disabled");
  assert.equal(c.policy.enabled, false);
});

test("enabled=true with mode=disabled stays disabled and reports a config error", () => {
  const c = loadAcquisitionConfigFromEnv({
    HERMES_AUTONOMOUS_ACQUISITION_ENABLED: "true",
    HERMES_AUTONOMOUS_ACQUISITION_MODE: "disabled",
  });
  assert.equal(c.policy.enabled, false);
  assert.ok(c.configErrors.length > 0);
});

test("invalid regions JSON blocks with a config error instead of throwing", () => {
  const c = loadAcquisitionConfigFromEnv({
    HERMES_AUTONOMOUS_ACQUISITION_ENABLED: "true",
    HERMES_AUTONOMOUS_ACQUISITION_MODE: "manual_safe",
    HERMES_ACQUISITION_REGIONS_JSON: "{not json",
  });
  assert.ok(c.configErrors.some((e) => e.includes("JSON")));
  assert.deepEqual(c.regions, []);
});

test("region entries with invalid leadType or missing id/city are rejected with errors", () => {
  const c = loadAcquisitionConfigFromEnv({
    HERMES_ACQUISITION_REGIONS_JSON: JSON.stringify([
      { id: "x", city: "Antalya", leadType: "Casino" },
      { city: "Bodrum", leadType: "Hotel" },
      { id: "ok", city: "Fethiye", leadType: "Villa" },
    ]),
  });
  assert.equal(c.regions.length, 1);
  assert.equal(c.regions[0].id, "ok");
  assert.equal(c.configErrors.length, 2);
});

test("unknown region fields are ignored and region numbers are clamped", () => {
  const c = loadAcquisitionConfigFromEnv({
    HERMES_ACQUISITION_REGIONS_JSON: JSON.stringify([
      {
        id: "a",
        city: "Antalya",
        leadType: "Hotel",
        maxResultsPerRun: 9999,
        cooldownHours: 9999,
        apiKey: "should-be-ignored",
      },
    ]),
  });
  assert.equal(c.regions.length, 1);
  assert.equal(c.regions[0].maxResultsPerRun, POLICY_HARD_LIMITS.maxResultsPerRegion);
  assert.equal(c.regions[0].cooldownHours, POLICY_HARD_LIMITS.cooldownHoursMax);
  assert.ok(!("apiKey" in c.regions[0]));
});

test("duplicate region ids are rejected", () => {
  const c = loadAcquisitionConfigFromEnv({
    HERMES_ACQUISITION_REGIONS_JSON: JSON.stringify([
      { id: "a", city: "Antalya", leadType: "Hotel" },
      { id: "a", city: "Bodrum", leadType: "Hotel" },
    ]),
  });
  assert.equal(c.regions.length, 1);
  assert.ok(c.configErrors.some((e) => e.includes("birden fazla")));
});

test("enabled config without regions reports an error", () => {
  const c = loadAcquisitionConfigFromEnv({
    HERMES_AUTONOMOUS_ACQUISITION_ENABLED: "true",
    HERMES_AUTONOMOUS_ACQUISITION_MODE: "manual_safe",
  });
  assert.ok(c.configErrors.some((e) => e.includes("bölge")));
});

test("config output never contains the cron secret", () => {
  const c = loadAcquisitionConfigFromEnv({
    HERMES_ACQUISITION_CRON_SECRET: "super-secret-value",
    HERMES_ACQUISITION_REGIONS_JSON: VALID_REGIONS_JSON,
  });
  assert.ok(!JSON.stringify(c).includes("super-secret-value"));
});
