import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { __resetSalesOutcomeRegistryForTests, upsertSalesOutcomeItem, updateSalesOutcomeStatus, getSalesOutcomeByMissionId, getRecentSalesOutcomeItems } from "./sales-outcome-registry.ts";
import { __resetDemoSchedulingRegistryForTests, upsertDemoScheduleItem, updateDemoScheduleStatus } from "./demo-scheduling-registry.ts";
import { __resetFollowUpRegistryForTests } from "./follow-up-registry.ts";
import { __resetFollowUpOrchestrationRegistryForTests } from "./hermes-follow-up-orchestration-registry.ts";
import { __resetConversationRegistryForTests } from "./hermes-conversation-registry.ts";
import { __resetOutreachRegistryForTests } from "./hermes-outreach-registry.ts";
import { __resetQualificationRegistryForTests, recordQualificationResult } from "./hermes-qualification-registry.ts";
import { __resetRecentReceiptsForTests } from "./whatsapp-delivery-receipt-processor.ts";
import { __resetWhatsAppReplyRegistryForTests } from "./whatsapp-reply-registry.ts";
import { runRevenuePipeline } from "./hermes-revenue-pipeline-service.ts";
import { buildRevenuePipelinePolicy } from "./hermes-revenue-pipeline-policy.ts";
import type { QualificationResult } from "./hermes-autonomous-qualification-runtime.ts";

const NOW = 1_000_000_000;

beforeEach(() => {
  __resetSalesOutcomeRegistryForTests();
  __resetDemoSchedulingRegistryForTests();
  __resetFollowUpRegistryForTests();
  __resetFollowUpOrchestrationRegistryForTests();
  __resetConversationRegistryForTests();
  __resetOutreachRegistryForTests();
  __resetQualificationRegistryForTests();
  __resetRecentReceiptsForTests();
  __resetWhatsAppReplyRegistryForTests();
});

function seedQualification(leadId: string, status: string, businessName: string) {
  const result = {
    id: `qual:${leadId}`,
    leadId,
    acquisitionRunId: null,
    status,
    confidence: "high",
    priority: "high",
    eligibleForMission: true,
    eligibleForOutreachDraft: true,
    scoreSnapshot: {},
    positiveReasons: [],
    cautionReasons: [],
    blockingReasons: [],
    founderSummaryTr: "",
    hermesRecommendationTr: "",
    evaluatedAt: NOW,
    auditEvents: [],
  } as unknown as QualificationResult;
  recordQualificationResult({ result, businessName, now: NOW });
}

test("aggregates existing registries into pipeline items", () => {
  seedQualification("l1", "sales_ready", "Otel A");
  const result = runRevenuePipeline({ now: NOW });
  assert.ok(result.items.length >= 1);
  const a = result.items.find((i) => i.leadId === "l1");
  assert.equal(a?.stage, "qualified");
  assert.equal(a?.title, "Otel A");
});

test("won sales outcome → realized revenue, closed stage", () => {
  upsertSalesOutcomeItem({ missionId: "m1", leadId: "l1", leadName: "Otel A", source: "founder_manual" }, NOW);
  const o = getSalesOutcomeByMissionId("m1", NOW)!;
  updateSalesOutcomeStatus(o.id, { status: "won", package: "growth", estimatedMrr: 9000 }, NOW);

  const result = runRevenuePipeline({ now: NOW });
  const item = result.items.find((i) => i.leadId === "l1")!;
  assert.equal(item.stage, "won");
  assert.equal(item.realizedMrr, 9000);
  assert.equal(result.summary.realizedMrr, 9000);
  assert.equal(result.summary.potentialMrr, null); // no open estimates
});

test("open outcome + scheduled demo → demo_scheduled, potential revenue", () => {
  upsertDemoScheduleItem({ provider: "whatsapp", providerMessageId: "wamid.d", missionId: "m1", leadId: "l1", intent: "demo_requested" }, NOW);
  updateDemoScheduleStatus("demo:wamid.d", "scheduled", undefined, NOW);
  upsertSalesOutcomeItem({ missionId: "m1", leadId: "l1", source: "demo_scheduling", estimatedMrr: 6000 }, NOW);

  const result = runRevenuePipeline({ now: NOW });
  const item = result.items.find((i) => i.leadId === "l1")!;
  assert.equal(item.stage, "demo_scheduled");
  assert.equal(item.potentialMrr, 6000);
  assert.equal(result.summary.potentialMrr, 6000);
});

test("activeOnly filters out closed items", () => {
  seedQualification("l1", "sales_ready", "Open Hotel");
  upsertSalesOutcomeItem({ missionId: "m2", leadId: "l2", leadName: "Won Hotel", source: "founder_manual" }, NOW);
  const o = getSalesOutcomeByMissionId("m2", NOW)!;
  updateSalesOutcomeStatus(o.id, { status: "won", package: "starter" }, NOW);

  const all = runRevenuePipeline({ now: NOW });
  const active = runRevenuePipeline({ now: NOW, activeOnly: true });
  assert.ok(all.items.some((i) => i.stage === "won"));
  assert.equal(active.items.some((i) => i.stage === "won"), false);
});

test("limit is respected and clamped to policy max", () => {
  for (let i = 0; i < 10; i++) seedQualification(`l${i}`, "sales_ready", `Otel ${i}`);
  const result = runRevenuePipeline({ now: NOW, limit: 3 });
  assert.equal(result.items.length, 3);
});

test("disabled policy → empty pipeline", () => {
  seedQualification("l1", "sales_ready", "Otel A");
  const result = runRevenuePipeline({ now: NOW, policy: buildRevenuePipelinePolicy({ enabled: false }) });
  assert.equal(result.items.length, 0);
});

test("service does not mutate source registries", () => {
  upsertSalesOutcomeItem({ missionId: "m1", leadId: "l1", leadName: "Otel A", source: "founder_manual", estimatedMrr: 5000 }, NOW);
  const before = JSON.stringify(getRecentSalesOutcomeItems(50, NOW));
  runRevenuePipeline({ now: NOW });
  const after = JSON.stringify(getRecentSalesOutcomeItems(50, NOW));
  assert.equal(before, after);
});

test("empty registries → empty items, null revenue totals", () => {
  const result = runRevenuePipeline({ now: NOW });
  assert.equal(result.items.length, 0);
  assert.equal(result.summary.realizedMrr, null);
  assert.equal(result.summary.potentialMrr, null);
});

test("no raw phone/secret in founder-visible text fields", () => {
  upsertSalesOutcomeItem({ missionId: "m1", leadId: "l1", leadName: "Otel A", source: "founder_manual", estimatedMrr: 5000 }, NOW);
  const result = runRevenuePipeline({ now: NOW });
  // Concatenate only the human-readable text fields (numeric timestamps/amounts
  // are legitimately long digit runs and are not a leak).
  const text = result.items
    .flatMap((i) => [i.title, i.currentStateLabelTr, i.revenueSignalLabelTr, i.whatHappenedTr, i.whyItMattersTr, i.hermesRecommendationTr, i.founderNextActionTr, ...i.riskReasonsTr])
    .join(" | ");
  assert.equal(/\+?\d[\d\s\-()]{8,}\d/.test(text), false);
  assert.equal(/secret=|Bearer /.test(text), false);
});
