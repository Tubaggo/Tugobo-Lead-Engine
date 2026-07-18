import { test } from "node:test";
import assert from "node:assert/strict";
import { TUGOBO_TARGET_MARKET_CLUSTERS } from "./hermes-tugobo-target-market-clusters.ts";

test("#1 cluster ids are unique", () => {
  const ids = TUGOBO_TARGET_MARKET_CLUSTERS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("#2 search market ids are globally unique across all clusters", () => {
  const ids = TUGOBO_TARGET_MARKET_CLUSTERS.flatMap((c) => c.searchMarkets.map((m) => m.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length > 0);
});

test("#3 all ids (cluster + search market) are ASCII-safe", () => {
  const asciiOnly = /^[a-z0-9-]+$/;
  for (const c of TUGOBO_TARGET_MARKET_CLUSTERS) {
    assert.match(c.id, asciiOnly, `cluster id ${c.id} must be ASCII`);
    for (const m of c.searchMarkets) {
      assert.match(m.id, asciiOnly, `search market id ${m.id} must be ASCII`);
    }
  }
});

test("#4 coverage modes are valid", () => {
  for (const c of TUGOBO_TARGET_MARKET_CLUSTERS) {
    assert.ok(c.coverageMode === "province-wide" || c.coverageMode === "locality-only");
  }
});

test("every cluster has a non-empty province, name, and at least one search market", () => {
  for (const c of TUGOBO_TARGET_MARKET_CLUSTERS) {
    assert.ok(c.province.trim().length > 0);
    assert.ok(c.name.trim().length > 0);
    assert.ok(c.searchMarkets.length > 0, `${c.id} must have at least one search market`);
  }
});

test("priority is globally unique and sequential across the whole declaration", () => {
  const priorities = TUGOBO_TARGET_MARKET_CLUSTERS.flatMap((c) => c.searchMarkets.map((m) => m.priority));
  assert.equal(new Set(priorities).size, priorities.length);
  const sorted = [...priorities].sort((a, b) => a - b);
  assert.deepEqual(priorities, sorted);
  assert.equal(priorities[0], 1);
});

test("Kapadokya cluster explicitly covers Uçhisar, Ortahisar, and Mustafapaşa", () => {
  const kapadokya = TUGOBO_TARGET_MARKET_CLUSTERS.find((c) => c.id === "kapadokya-cluster")!;
  const cities = kapadokya.searchMarkets.map((m) => m.city);
  assert.ok(cities.includes("Uçhisar"));
  assert.ok(cities.includes("Ortahisar"));
  assert.ok(cities.includes("Mustafapaşa"));
  assert.equal(kapadokya.coverageMode, "province-wide");
  assert.equal(kapadokya.province, "Nevşehir");
});

test("Muğla cluster covers Ölüdeniz, Dalyan, and Akyaka", () => {
  const mugla = TUGOBO_TARGET_MARKET_CLUSTERS.find((c) => c.id === "mugla-cluster")!;
  const cities = mugla.searchMarkets.map((m) => m.city);
  assert.ok(cities.includes("Ölüdeniz"));
  assert.ok(cities.includes("Dalyan"));
  assert.ok(cities.includes("Akyaka"));
});

test("Antalya cluster covers Kalkan, Olympos, and Çıralı", () => {
  const antalya = TUGOBO_TARGET_MARKET_CLUSTERS.find((c) => c.id === "antalya-cluster")!;
  const cities = antalya.searchMarkets.map((m) => m.city);
  assert.ok(cities.includes("Kalkan"));
  assert.ok(cities.includes("Olympos"));
  assert.ok(cities.includes("Çıralı"));
});

test("İstanbul is not present anywhere in the cluster model", () => {
  const allCities = TUGOBO_TARGET_MARKET_CLUSTERS.flatMap((c) => c.searchMarkets.map((m) => m.city));
  const allProvinces = TUGOBO_TARGET_MARKET_CLUSTERS.map((c) => c.province);
  assert.ok(!allCities.includes("İstanbul"));
  assert.ok(!allProvinces.includes("İstanbul"));
});

test("locality-only clusters never include their bare province name as a search market", () => {
  const localityOnly = TUGOBO_TARGET_MARKET_CLUSTERS.filter((c) => c.coverageMode === "locality-only");
  for (const c of localityOnly) {
    const cities = c.searchMarkets.map((m) => m.city);
    assert.ok(!cities.includes(c.province), `${c.id} must not list its own province "${c.province}" as a search market`);
  }
});
