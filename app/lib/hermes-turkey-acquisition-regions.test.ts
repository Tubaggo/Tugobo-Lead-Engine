import { test } from "node:test";
import assert from "node:assert/strict";
import { TURKEY_ACQUISITION_REGIONS } from "./hermes-turkey-acquisition-regions.ts";
import { POLICY_HARD_LIMITS } from "./hermes-autonomous-acquisition-policy.ts";

test("catalog contains exactly 81 provinces", () => {
  assert.equal(TURKEY_ACQUISITION_REGIONS.length, 81);
});

test("all region ids are unique", () => {
  const ids = new Set(TURKEY_ACQUISITION_REGIONS.map((r) => r.id));
  assert.equal(ids.size, 81);
});

test("all city values are unique and non-empty", () => {
  const cities = new Set(TURKEY_ACQUISITION_REGIONS.map((r) => r.city));
  assert.equal(cities.size, 81);
  for (const r of TURKEY_ACQUISITION_REGIONS) {
    assert.ok(r.city.trim().length > 0);
    assert.ok(r.id.trim().length > 0);
  }
});

test("region ids are ASCII slugs — no Turkish characters", () => {
  const asciiOnly = /^[a-z0-9-]+$/;
  for (const r of TURKEY_ACQUISITION_REGIONS) {
    assert.match(r.id, asciiOnly, `${r.id} must be a plain ASCII slug`);
  }
});

test("every region is enabled", () => {
  for (const r of TURKEY_ACQUISITION_REGIONS) {
    assert.equal(r.enabled, true);
  }
});

test("every region's leadType is Hotel", () => {
  for (const r of TURKEY_ACQUISITION_REGIONS) {
    assert.equal(r.leadType, "Hotel");
  }
});

test("no region's limits exceed the policy hard limits", () => {
  for (const r of TURKEY_ACQUISITION_REGIONS) {
    assert.ok(r.maxResultsPerRun <= POLICY_HARD_LIMITS.maxResultsPerRegion);
    assert.ok(r.cooldownHours >= POLICY_HARD_LIMITS.cooldownHoursMin);
    assert.ok(r.cooldownHours <= POLICY_HARD_LIMITS.cooldownHoursMax);
  }
});

test("the first static scan order starts with the expected priority cities", () => {
  const sorted = [...TURKEY_ACQUISITION_REGIONS].sort((a, b) => a.priority - b.priority);
  const firstFive = sorted.slice(0, 5).map((r) => r.city);
  assert.deepEqual(firstFive, ["İstanbul", "Antalya", "Muğla", "İzmir", "Ankara"]);
});

test("every region starts with lastRunAt null — no baked-in rotation state", () => {
  for (const r of TURKEY_ACQUISITION_REGIONS) {
    assert.equal(r.lastRunAt, null);
  }
});
