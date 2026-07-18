import { test } from "node:test";
import assert from "node:assert/strict";
import { TUGOBO_NEED_ACQUISITION_REGIONS } from "./hermes-tugobo-need-acquisition-regions.ts";
import { TUGOBO_TARGET_MARKET_CLUSTERS } from "./hermes-tugobo-target-market-clusters.ts";
import { TURKEY_ACQUISITION_REGIONS } from "./hermes-turkey-acquisition-regions.ts";
import { POLICY_HARD_LIMITS } from "./hermes-autonomous-acquisition-policy.ts";

function hasCity(city: string): boolean {
  return TUGOBO_NEED_ACQUISITION_REGIONS.some((r) => r.city === city);
}

test("#5 acquisition regions are derived deterministically from the cluster source's search markets", () => {
  const expectedIds = TUGOBO_TARGET_MARKET_CLUSTERS.flatMap((c) => c.searchMarkets.map((m) => m.id))
    .slice()
    .sort();
  const actualIds = TUGOBO_NEED_ACQUISITION_REGIONS.map((r) => r.id).slice().sort();
  assert.deepEqual(actualIds, expectedIds);
  assert.equal(TUGOBO_NEED_ACQUISITION_REGIONS.length, expectedIds.length);
});

test("#6 the Turkey 81-province catalog stays completely unaffected by the cluster fix", () => {
  assert.equal(TURKEY_ACQUISITION_REGIONS.length, 81);
  assert.ok(TURKEY_ACQUISITION_REGIONS.some((r) => r.id === "istanbul-hotel" && r.city === "İstanbul"));
});

test("the first market by priority is Antalya", () => {
  const sorted = [...TUGOBO_NEED_ACQUISITION_REGIONS].sort((a, b) => a.priority - b.priority);
  assert.equal(sorted[0].city, "Antalya");
  assert.equal(sorted[0].id, "antalya-hotel");
});

test("Uçhisar, Ortahisar, Mustafapaşa, Ölüdeniz, Dalyan, Akyaka, Kalkan, Olympos, Çıralı are now real search points", () => {
  for (const city of ["Uçhisar", "Ortahisar", "Mustafapaşa", "Ölüdeniz", "Dalyan", "Akyaka", "Kalkan", "Olympos", "Çıralı"]) {
    assert.ok(hasCity(city), `missing new coverage city: ${city}`);
  }
});

test("#16 İstanbul is not present in the tugobo-need acquisition regions", () => {
  assert.ok(!hasCity("İstanbul"));
});

test("plain İzmir/Aydın/Balıkesir/Çanakkale/Denizli/Sakarya/Bolu/Bursa city centers are not search points", () => {
  for (const city of ["İzmir", "Aydın", "Balıkesir", "Çanakkale", "Denizli", "Sakarya", "Bolu", "Bursa"]) {
    assert.ok(!hasCity(city), `${city} city-center must not itself be a search point`);
  }
});

test("all ids are unique and ASCII-safe", () => {
  const ids = TUGOBO_NEED_ACQUISITION_REGIONS.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  const asciiOnly = /^[a-z0-9-]+$/;
  for (const id of ids) assert.match(id, asciiOnly, `${id} must be a plain ASCII slug`);
});

test("no region's limits exceed the policy hard limits", () => {
  for (const r of TUGOBO_NEED_ACQUISITION_REGIONS) {
    assert.ok(r.maxResultsPerRun <= POLICY_HARD_LIMITS.maxResultsPerRegion);
    assert.ok(r.cooldownHours >= POLICY_HARD_LIMITS.cooldownHoursMin);
    assert.ok(r.cooldownHours <= POLICY_HARD_LIMITS.cooldownHoursMax);
  }
});

test("shared province-level ids match the Turkey catalog's ids for the same province", () => {
  const turkeyIds = new Set(TURKEY_ACQUISITION_REGIONS.map((r) => r.id));
  for (const id of ["antalya-hotel", "mersin-hotel", "nevsehir-hotel", "trabzon-hotel", "rize-hotel"]) {
    assert.ok(turkeyIds.has(id), `${id} must exist in the Turkey catalog too (shared rotation cursor)`);
    const tugoboCity = TUGOBO_NEED_ACQUISITION_REGIONS.find((r) => r.id === id)?.city;
    const turkeyCity = TURKEY_ACQUISITION_REGIONS.find((r) => r.id === id)?.city;
    assert.equal(tugoboCity, turkeyCity, `${id}'s city must match between catalogs`);
  }
});

test("every region is enabled and typed Hotel", () => {
  for (const r of TUGOBO_NEED_ACQUISITION_REGIONS) {
    assert.equal(r.enabled, true);
    assert.equal(r.leadType, "Hotel");
  }
});

test("no duplicate cities within the catalog", () => {
  const cities = TUGOBO_NEED_ACQUISITION_REGIONS.map((r) => r.city);
  assert.equal(new Set(cities).size, cities.length);
});
