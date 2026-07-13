import { test } from "node:test";
import assert from "node:assert/strict";
import {
  __resetOutreachRegistryForTests,
  clearExpiredOutreachDecisions,
  getOutreachByLeadId,
  getOutreachDecisionsByRun,
  getRecentOutreachDecisions,
  recordOutreachDecision,
} from "./hermes-outreach-registry.ts";
import type { AutonomousOutreachDecision } from "./hermes-autonomous-outreach-runtime.ts";

const NOW = Date.UTC(2026, 6, 13, 9, 0, 0);

function decision(overrides: Partial<AutonomousOutreachDecision> = {}): AutonomousOutreachDecision {
  return {
    id: `outreach:${overrides.leadId ?? "lead-1"}:${NOW}`,
    missionId: null,
    leadId: "lead-1",
    status: "approval_required",
    eligible: true,
    blockedReason: null,
    draftNeeded: true,
    approvalNeeded: true,
    recommendedChannel: "whatsapp",
    recommendedLanguage: "tr",
    recommendedTemplate: "whatsapp-intro",
    recommendedTone: "consultative",
    recommendedLength: "short",
    personalizationSignals: [{ key: "hotel_name", labelTr: "Otel adı: Test" }],
    founderSummary: "Hermes mesaj hazırladı.",
    hermesRecommendation: "Mesajı incele ve onayla.",
    nextAction: "await_founder_approval",
    acquisitionRunId: "run-1",
    createdAt: NOW,
    auditEvents: [
      { type: "hermes_outreach_prepared", at: NOW, leadId: "lead-1", missionId: null, acquisitionRunId: "run-1", status: "approval_required", detailTr: "hazırlandı" },
    ],
    ...overrides,
  };
}

test("leadId'siz karar kaydedilmez", () => {
  __resetOutreachRegistryForTests();
  assert.equal(recordOutreachDecision({ decision: decision({ leadId: null }), businessName: "X", now: NOW }), false);
});

test("kayıt + leadId ile okuma", () => {
  __resetOutreachRegistryForTests();
  recordOutreachDecision({ decision: decision(), businessName: "Marina", now: NOW });
  const v = getOutreachByLeadId("lead-1");
  assert.ok(v);
  assert.equal(v!.businessName, "Marina");
  assert.equal(v!.decision.status, "approval_required");
});

test("lead bazlı UPSERT — duplicate kayıt oluşmaz", () => {
  __resetOutreachRegistryForTests();
  recordOutreachDecision({ decision: decision({ status: "waiting" }), businessName: "Marina", now: NOW });
  recordOutreachDecision({ decision: decision({ status: "approval_required" }), businessName: "Marina", now: NOW + 1000 });
  const all = getRecentOutreachDecisions(50, NOW + 2000);
  assert.equal(all.filter((a) => a.decision.leadId === "lead-1").length, 1);
  assert.equal(getOutreachByLeadId("lead-1")!.decision.status, "approval_required");
});

test("okuma kopya döner — mutasyon store'u etkilemez", () => {
  __resetOutreachRegistryForTests();
  recordOutreachDecision({ decision: decision(), businessName: "Marina", now: NOW });
  const v = getOutreachByLeadId("lead-1")!;
  v.decision.personalizationSignals.push({ key: "x", labelTr: "y" });
  assert.equal(getOutreachByLeadId("lead-1")!.decision.personalizationSignals.length, 1);
});

test("run bazlı filtre", () => {
  __resetOutreachRegistryForTests();
  recordOutreachDecision({ decision: decision({ leadId: "a", acquisitionRunId: "run-1" }), businessName: "A", now: NOW });
  recordOutreachDecision({ decision: decision({ leadId: "b", acquisitionRunId: "run-2" }), businessName: "B", now: NOW });
  assert.equal(getOutreachDecisionsByRun("run-1", NOW).length, 1);
});

test("TTL: 14 günden eski kayıt temizlenir", () => {
  __resetOutreachRegistryForTests();
  recordOutreachDecision({ decision: decision(), businessName: "Marina", now: NOW });
  const later = NOW + 15 * 24 * 60 * 60 * 1000;
  const removed = clearExpiredOutreachDecisions(later);
  assert.equal(removed, 1);
  assert.equal(getOutreachByLeadId("lead-1"), null);
});

test("audit detayında telefon görünümü son savunma hattında gizlenir", () => {
  __resetOutreachRegistryForTests();
  const d = decision({
    auditEvents: [
      { type: "hermes_outreach_prepared", at: NOW, leadId: "lead-1", missionId: null, acquisitionRunId: "run-1", status: "approval_required", detailTr: "Numara +90 532 100 00 01" },
    ],
  });
  recordOutreachDecision({ decision: d, businessName: "Marina", now: NOW });
  const v = getOutreachByLeadId("lead-1")!;
  assert.ok(v.decision.auditEvents[0].detailTr.includes("[numara gizli]"));
});
