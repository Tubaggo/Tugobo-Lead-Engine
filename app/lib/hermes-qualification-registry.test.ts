import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  __resetQualificationRegistryForTests,
  clearExpiredQualificationResults,
  getQualificationByLeadId,
  getQualificationResult,
  getQualificationResultsByRun,
  getRecentQualificationResults,
  recordQualificationResult,
} from "./hermes-qualification-registry.ts";
import {
  evaluateHermesQualification,
  type QualificationLeadLike,
} from "./hermes-autonomous-qualification-runtime.ts";
import { DEFAULT_QUALIFICATION_POLICY } from "./hermes-qualification-policy.ts";

const NOW = Date.UTC(2026, 6, 13, 9, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  __resetQualificationRegistryForTests();
});

function lead(overrides: Partial<QualificationLeadLike> = {}): QualificationLeadLike {
  return {
    id: "lead-1",
    name: "Mersin Marina Hotel",
    phone: "+90 532 100 00 01",
    website: "https://marina.example",
    verifiedOpportunityScore: 88,
    icpFitScore: 75,
    lastEnrichedAt: new Date(NOW - 60 * 60 * 1000).toISOString(),
    signalVerification: {
      whatsappVerification: "verified",
      websiteVerification: "verified",
      reservationSignal: "detected",
    },
    ...overrides,
  };
}

function resultFor(overrides: Partial<QualificationLeadLike> = {}, runId = "acq-run-1") {
  return evaluateHermesQualification({
    lead: lead(overrides),
    existingMissionId: null,
    acquisitionRunId: runId,
    policy: { ...DEFAULT_QUALIFICATION_POLICY, enabled: true },
    currentTime: NOW,
  });
}

test("kayıt ve okuma: id, leadId ve run bazlı", () => {
  const result = resultFor();
  assert.equal(recordQualificationResult({ result, businessName: "Mersin Marina Hotel", now: NOW }), true);

  const byLead = getQualificationByLeadId("lead-1");
  assert.ok(byLead);
  assert.equal(byLead!.result.status, "sales_ready");
  assert.equal(byLead!.businessName, "Mersin Marina Hotel");

  const byId = getQualificationResult(result.id);
  assert.ok(byId);

  const byRun = getQualificationResultsByRun("acq-run-1", NOW);
  assert.equal(byRun.length, 1);

  const recent = getRecentQualificationResults(10, NOW);
  assert.equal(recent.length, 1);
});

test("aynı lead tekrar değerlendirilince upsert olur — duplicate kayıt yok", () => {
  recordQualificationResult({ result: resultFor(), businessName: "Otel", now: NOW });
  const updated = resultFor({ verifiedOpportunityScore: 45, signalVerification: { websiteVerification: "verified" } });
  recordQualificationResult({ result: updated, businessName: "Otel", now: NOW + 1000 });

  const recent = getRecentQualificationResults(10, NOW + 2000);
  assert.equal(recent.length, 1);
  assert.equal(recent[0].result.status, updated.status);
  // Audit geçmişi sınırlı biçimde birleşir, sınırsız büyümez.
  assert.ok(recent[0].result.auditEvents.length <= 12);
});

test("leadId'siz sonuç kaydedilmez", () => {
  const blocked = resultFor({ id: undefined });
  assert.equal(recordQualificationResult({ result: blocked, businessName: "X", now: NOW }), false);
  assert.equal(getRecentQualificationResults(10, NOW).length, 0);
});

test("TTL: 14 günden eski kayıtlar temizlenir", () => {
  recordQualificationResult({ result: resultFor(), businessName: "Otel", now: NOW });
  assert.equal(getRecentQualificationResults(10, NOW + 13 * DAY).length, 1);
  assert.equal(getRecentQualificationResults(10, NOW + 15 * DAY).length, 0);
});

test("clearExpiredQualificationResults kaldırılan sayıyı döner", () => {
  recordQualificationResult({ result: resultFor(), businessName: "Otel", now: NOW });
  assert.equal(clearExpiredQualificationResults(NOW + 15 * DAY), 1);
});

test("kayıtta ham telefon, secret veya provider yanıtı yoktur", () => {
  recordQualificationResult({ result: resultFor(), businessName: "Mersin Marina Hotel", now: NOW });
  const stored = getQualificationByLeadId("lead-1")!;
  const serialized = JSON.stringify(stored);
  assert.ok(!serialized.includes("+90 532"), "ham telefon sızdı");
  assert.ok(!/api[_-]?key/i.test(serialized), "key alanı sızdı");
  assert.ok(!/secret/i.test(serialized), "secret sızdı");
  assert.ok(!serialized.includes("<html"), "ham HTML sızdı");
});

test("okuma kopya döner — dışarıdan mutasyon store'u etkilemez", () => {
  recordQualificationResult({ result: resultFor(), businessName: "Otel", now: NOW });
  const view = getQualificationByLeadId("lead-1")!;
  view.result.positiveReasons.length = 0;
  const again = getQualificationByLeadId("lead-1")!;
  assert.ok(again.result.positiveReasons.length > 0);
});

test("run bazlı sorgu yalnız o run'ın sonuçlarını döner", () => {
  recordQualificationResult({ result: resultFor({}, "run-a"), businessName: "A", now: NOW });
  recordQualificationResult({ result: resultFor({ id: "lead-2" }, "run-b"), businessName: "B", now: NOW });
  assert.equal(getQualificationResultsByRun("run-a", NOW).length, 1);
  assert.equal(getQualificationResultsByRun("run-b", NOW).length, 1);
  assert.equal(getQualificationResultsByRun("run-c", NOW).length, 0);
});
