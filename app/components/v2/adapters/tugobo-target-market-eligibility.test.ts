import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeTugoboTargetMarketEligibility,
  buildTargetMarketFounderLine,
  type TargetMarketLeadLike,
} from "./tugobo-target-market-eligibility.ts";

function lead(overrides: Partial<TargetMarketLeadLike> = {}): TargetMarketLeadLike {
  return { name: "Test Otel", ...overrides };
}

/* ── #7-15 Required coverage — the exact real-world gap this sprint fixes ── */

test("#7 Uçhisar is eligible (Kapadokya)", () => {
  const r = computeTugoboTargetMarketEligibility(lead({ city: "Uçhisar" }));
  assert.equal(r.eligible, true);
  assert.equal(r.matchedMarketName, "Uçhisar");
  assert.equal(r.matchedClusterName, "Kapadokya");
});

test("#8 Ortahisar is eligible (Kapadokya)", () => {
  const r = computeTugoboTargetMarketEligibility(lead({ city: "Ortahisar" }));
  assert.equal(r.eligible, true);
  assert.equal(r.matchedClusterName, "Kapadokya");
});

test("#9 Mustafapaşa is eligible (Kapadokya)", () => {
  const r = computeTugoboTargetMarketEligibility(lead({ city: "Mustafapaşa" }));
  assert.equal(r.eligible, true);
  assert.equal(r.matchedClusterName, "Kapadokya");
});

test("#10 Ölüdeniz is eligible (Muğla)", () => {
  const r = computeTugoboTargetMarketEligibility(lead({ city: "Ölüdeniz" }));
  assert.equal(r.eligible, true);
  assert.equal(r.matchedClusterName, "Muğla");
});

test("#11 Dalyan is eligible (Muğla)", () => {
  const r = computeTugoboTargetMarketEligibility(lead({ city: "Dalyan" }));
  assert.equal(r.eligible, true);
  assert.equal(r.matchedClusterName, "Muğla");
});

test("#12 Akyaka is eligible (Muğla)", () => {
  const r = computeTugoboTargetMarketEligibility(lead({ city: "Akyaka" }));
  assert.equal(r.eligible, true);
  assert.equal(r.matchedClusterName, "Muğla");
});

test("#13 Kalkan is eligible (Antalya)", () => {
  const r = computeTugoboTargetMarketEligibility(lead({ city: "Kalkan" }));
  assert.equal(r.eligible, true);
  assert.equal(r.matchedClusterName, "Antalya");
});

test("#14 Olympos is eligible (Antalya)", () => {
  const r = computeTugoboTargetMarketEligibility(lead({ city: "Olympos" }));
  assert.equal(r.eligible, true);
  assert.equal(r.matchedClusterName, "Antalya");
});

test("#15 Çıralı is eligible (Antalya)", () => {
  const r = computeTugoboTargetMarketEligibility(lead({ city: "Çıralı" }));
  assert.equal(r.eligible, true);
  assert.equal(r.matchedClusterName, "Antalya");
});

test("#16 İstanbul is not eligible", () => {
  const r = computeTugoboTargetMarketEligibility(lead({ city: "İstanbul" }));
  assert.equal(r.eligible, false);
});

/* ── #17-23 Province-wide eligibility ────────────────────────────────── */

test("#17 Uçhisar eligible via province-wide Kapadokya coverage", () => {
  assert.equal(computeTugoboTargetMarketEligibility(lead({ city: "Uçhisar" })).eligible, true);
});

test("#18 Nevşehir (the province name itself) is eligible", () => {
  const r = computeTugoboTargetMarketEligibility(lead({ city: "Nevşehir" }));
  assert.equal(r.eligible, true);
  assert.equal(r.matchedMarketName, "Nevşehir");
});

test("#19 Dalaman (unlisted locality) + verified province Muğla is eligible via province-wide fallback", () => {
  const r = computeTugoboTargetMarketEligibility(lead({ city: "Dalaman", province: "Muğla" }));
  assert.equal(r.eligible, true);
  assert.equal(r.matchedClusterName, "Muğla");
});

test("#20 Antalya is eligible", () => {
  assert.equal(computeTugoboTargetMarketEligibility(lead({ city: "Antalya" })).eligible, true);
});

test("#21 Mersin is eligible", () => {
  assert.equal(computeTugoboTargetMarketEligibility(lead({ city: "Mersin" })).eligible, true);
});

test("#22 Trabzon is eligible", () => {
  assert.equal(computeTugoboTargetMarketEligibility(lead({ city: "Trabzon" })).eligible, true);
});

test("#23 Rize is eligible", () => {
  assert.equal(computeTugoboTargetMarketEligibility(lead({ city: "Rize" })).eligible, true);
});

/* ── #24-34 Locality-only eligibility ────────────────────────────────── */

test("#24 İzmir (city center) is not eligible", () => {
  assert.equal(computeTugoboTargetMarketEligibility(lead({ city: "İzmir" })).eligible, false);
});

test("#25 Çeşme is eligible", () => {
  assert.equal(computeTugoboTargetMarketEligibility(lead({ city: "Çeşme" })).eligible, true);
});

test("#26 Alaçatı is eligible", () => {
  assert.equal(computeTugoboTargetMarketEligibility(lead({ city: "Alaçatı" })).eligible, true);
});

test("#27 Aydın (city center) is not eligible", () => {
  assert.equal(computeTugoboTargetMarketEligibility(lead({ city: "Aydın" })).eligible, false);
});

test("#28 Kuşadası is eligible", () => {
  assert.equal(computeTugoboTargetMarketEligibility(lead({ city: "Kuşadası" })).eligible, true);
});

test("#29 Balıkesir (city center) is not eligible", () => {
  assert.equal(computeTugoboTargetMarketEligibility(lead({ city: "Balıkesir" })).eligible, false);
});

test("#30 Ayvalık is eligible", () => {
  assert.equal(computeTugoboTargetMarketEligibility(lead({ city: "Ayvalık" })).eligible, true);
});

test("#31 Çanakkale (city center) is not eligible", () => {
  assert.equal(computeTugoboTargetMarketEligibility(lead({ city: "Çanakkale" })).eligible, false);
});

test("#32 Bozcaada is eligible", () => {
  assert.equal(computeTugoboTargetMarketEligibility(lead({ city: "Bozcaada" })).eligible, true);
});

test("#33 Bursa (city center) is not eligible", () => {
  assert.equal(computeTugoboTargetMarketEligibility(lead({ city: "Bursa" })).eligible, false);
});

test("#34 Uludağ is eligible", () => {
  assert.equal(computeTugoboTargetMarketEligibility(lead({ city: "Uludağ" })).eligible, true);
});

/* ── #35-38 Business-name safety ─────────────────────────────────────── */

test("#35 name 'Bodrum Hotel' + verified city İstanbul is not eligible — verified city wins over a misleading brand name", () => {
  const r = computeTugoboTargetMarketEligibility(lead({ name: "Bodrum Hotel İstanbul", city: "İstanbul" }));
  assert.equal(r.eligible, false);
});

test("#36 name-only 'Uçhisar' with no verified location is not active-eligible", () => {
  const r = computeTugoboTargetMarketEligibility(lead({ name: "Uçhisar Stone Suites" }));
  assert.equal(r.eligible, false);
  assert.equal(r.confidence, "inferred");
});

test("#37 a verified city always takes precedence over a name-based inference", () => {
  const r = computeTugoboTargetMarketEligibility(lead({ name: "Uçhisar Stone Suites", city: "Antalya" }));
  assert.equal(r.eligible, true);
  assert.equal(r.matchedMarketName, "Antalya");
});

test("#38 no substring false positives — 'Riverside'/'Poolside' never match the catalog town 'Side'", () => {
  assert.equal(computeTugoboTargetMarketEligibility(lead({ name: "Ağva Riverside Bungalow" })).eligible, false);
  assert.equal(computeTugoboTargetMarketEligibility(lead({ name: "Poolside Hotel" })).eligible, false);
});

/* ── business-name matching never yields active eligibility, even on a real hit ── */

test("a business-name-only match on a real cluster alias still never sets eligible:true", () => {
  const r = computeTugoboTargetMarketEligibility(lead({ name: "Bodrum Palace Otel" }));
  assert.equal(r.eligible, false);
  assert.equal(r.confidence, "inferred");
  assert.equal(r.matchedMarketId, null);
});

/* ── source region id precedence ─────────────────────────────────────── */

test("a persisted acquisition source region id takes priority over other signals", () => {
  const r = computeTugoboTargetMarketEligibility(lead({ sourceRegionId: "mugla-bodrum-hotel", city: "Nowhereville" }));
  assert.equal(r.eligible, true);
  assert.equal(r.matchedMarketName, "Bodrum");
  assert.equal(r.matchedClusterName, "Muğla");
});

test("an invalid/unknown source region id falls through to the next priority instead of failing closed", () => {
  const r = computeTugoboTargetMarketEligibility(lead({ sourceRegionId: "not-a-real-region-id", city: "Antalya" }));
  assert.equal(r.eligible, true);
});

/* ── address token matching ──────────────────────────────────────────── */

test("an address containing a cluster alias as a whole token is eligible", () => {
  const r = computeTugoboTargetMarketEligibility(lead({ city: undefined, address: "Uçhisar Mah., Nevşehir" }));
  assert.equal(r.eligible, true);
});

test("Turkish character/case normalization passes for city matching", () => {
  assert.equal(computeTugoboTargetMarketEligibility(lead({ city: "UÇHİSAR" })).eligible, true);
  assert.equal(computeTugoboTargetMarketEligibility(lead({ city: "uçhisar" })).eligible, true);
});

test("an unrecognized location is not eligible and confidence is unknown", () => {
  const r = computeTugoboTargetMarketEligibility(lead({ city: "Nowhereville" }));
  assert.equal(r.eligible, false);
  assert.equal(r.confidence, "unknown");
  assert.equal(r.matchedMarketId, null);
});

/* ── founder copy: two-gate explanation ──────────────────────────────── */

test("founder line for a specific matched locality reads 'X, Cluster hedef pazar kümesi içinde.'", () => {
  const r = computeTugoboTargetMarketEligibility(lead({ city: "Uçhisar" }));
  assert.equal(buildTargetMarketFounderLine(r), "Pazar uygunluğu: Uçhisar, Kapadokya hedef pazar kümesi içinde.");
});

test("founder line for a province-wide-only match (no specific locality) is non-redundant", () => {
  const r = computeTugoboTargetMarketEligibility(lead({ city: "Dalaman", province: "Muğla" }));
  assert.equal(buildTargetMarketFounderLine(r), "Pazar uygunluğu: Muğla hedef pazar kümesi içinde.");
});

test("founder line for an ineligible business never claims a market fit", () => {
  const r = computeTugoboTargetMarketEligibility(lead({ city: "İstanbul" }));
  assert.equal(buildTargetMarketFounderLine(r), "Pazar uygunluğu: onaylı TUGOBO hedef pazarı dışında.");
});

test("founder line never states geography as the sole opportunity reason", () => {
  const r = computeTugoboTargetMarketEligibility(lead({ city: "Bodrum" }));
  const line = buildTargetMarketFounderLine(r);
  assert.ok(!line.match(/^Bodrum'da olduğu için/));
});
