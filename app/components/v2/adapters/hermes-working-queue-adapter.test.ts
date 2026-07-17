import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeFounderWorkingQueue,
  isDirectMutationDecisionType,
  summarizeFounderWorkingQueue,
  type ComputeFounderWorkingQueueInput,
  type WorkingQueueLeadLike,
} from "./hermes-working-queue-adapter.ts";
import type { HermesDecisionItem, HermesDecisionType } from "./hermes-decision-queue-adapter.ts";

const NOW = new Date(2026, 6, 15, 12, 0, 0).getTime(); // 15 Temmuz 2026, öğlen
const TODAY_EARLY = new Date(2026, 6, 15, 3, 0, 0).getTime();
const YESTERDAY = new Date(2026, 6, 14, 12, 0, 0).getTime();

function buildLead(overrides: Partial<WorkingQueueLeadLike> = {}): WorkingQueueLeadLike {
  return {
    id: "lead-1",
    name: "Test Otel",
    phone: "+90 555 000 0000",
    website: "testotel.com",
    leadScore: 80,
    verifiedOpportunityScore: 85,
    ...overrides,
  };
}

function buildDecisionItem(overrides: Partial<HermesDecisionItem> = {}): HermesDecisionItem {
  return {
    id: "decision:mission:lead-2:approval",
    missionId: "mission:lead-2",
    leadId: "lead-2",
    title: "Karar Gereken Otel",
    decisionType: "approve_message",
    priority: "high",
    statusLabel: "Onay Bekliyor",
    whatHappened: "Hermes bir mesaj taslağı hazırladı.",
    whyItMatters: "Onaylanmazsa mesaj gönderilmez.",
    hermesRecommendation: "Mesajı gözden geçir.",
    founderDecisionLabel: "Mesajı onayla ya da reddet.",
    primaryActionLabel: "Onayla",
    secondaryActionLabel: "Reddet",
    lastActivityAt: NOW - 1000,
    sourceStage: "approval_required",
    mapped: true,
    confidence: null,
    urgency: null,
    ...overrides,
  };
}

function buildInput(overrides: Partial<ComputeFounderWorkingQueueInput> = {}): ComputeFounderWorkingQueueInput {
  return { decisionItems: [], leads: [], now: NOW, ...overrides };
}

/* ── 1. Fresh qualified opportunity appears ────────────────────────── */

test("a fresh, qualified lead (first seen today, not set-aside) appears as a fresh_opportunity item", () => {
  const lead = buildLead({ id: "fresh-1", firstImportedAt: TODAY_EARLY, phone: "+90 555 111 2233" });
  const items = computeFounderWorkingQueue(buildInput({ leads: [lead] }));
  assert.equal(items.length, 1);
  assert.equal(items[0]!.kind, "fresh_opportunity");
  assert.equal(items[0]!.isNew, true);
  assert.equal(items[0]!.leadId, "fresh-1");
});

/* ── 2. Old inactive lead does not appear ──────────────────────────── */

test("an old lead with no decision and no freshness does not appear at all", () => {
  const oldLead = buildLead({ id: "old-1", firstImportedAt: YESTERDAY });
  const items = computeFounderWorkingQueue(buildInput({ leads: [oldLead] }));
  assert.equal(items.length, 0);
});

test("a seed/demo lead (no firstImportedAt, no createdAt) never appears, even with a strong score", () => {
  const seedLead = buildLead({ id: "seed-1", firstImportedAt: undefined, createdAt: undefined, verifiedOpportunityScore: 99 });
  const items = computeFounderWorkingQueue(buildInput({ leads: [seedLead] }));
  assert.equal(items.length, 0);
});

/* ── 3/4/5/6. Old lead with new development / approval / failed ──────── */

test("an old lead with a pending founder decision appears via the decision item, regardless of lead freshness", () => {
  const decision = buildDecisionItem({ leadId: "old-with-decision" });
  const items = computeFounderWorkingQueue(buildInput({ decisionItems: [decision] }));
  assert.equal(items.length, 1);
  assert.equal(items[0]!.kind, "decision");
  assert.equal(items[0]!.isNew, false);
});

test("failed/blocked decision item is preserved with its own priority — computeFounderWorkingQueue never re-ranks decisions", () => {
  const failed = buildDecisionItem({
    id: "decision:mission:failed-1:failed",
    leadId: "failed-1",
    decisionType: "resolve_failed_delivery",
    priority: "critical",
  });
  const approval = buildDecisionItem({ id: "decision:mission:lead-2:approval", leadId: "lead-2", priority: "high" });
  // computeHermesDecisionQueue already sorts critical before high — this
  // module trusts that order and must not reshuffle it.
  const items = computeFounderWorkingQueue(buildInput({ decisionItems: [failed, approval] }));
  assert.deepEqual(items.map((i) => i.leadId), ["failed-1", "lead-2"]);
});

/* ── 7. Duplicate lead is not shown as a new opportunity ──────────────── */

test("a lead that already has a decision item is never also shown as a fresh opportunity (one business, one row)", () => {
  const decision = buildDecisionItem({ leadId: "dup-1" });
  const freshLookingLead = buildLead({ id: "dup-1", firstImportedAt: TODAY_EARLY });
  const items = computeFounderWorkingQueue(buildInput({ decisionItems: [decision], leads: [freshLookingLead] }));
  assert.equal(items.length, 1);
  assert.equal(items[0]!.kind, "decision");
});

test("a lead first imported earlier (even if later updated) is not shown as fresh — firstImportedAt is the freshness key, never a later touch", () => {
  const lead = buildLead({ id: "updated-1", firstImportedAt: YESTERDAY });
  const items = computeFounderWorkingQueue(buildInput({ leads: [lead] }));
  assert.equal(items.length, 0);
});

/* ── 9. Queue order follows the canonical action priority, fresh last ── */

test("queue order: every decision item first (their own existing order), fresh opportunities appended after", () => {
  const decision = buildDecisionItem({ leadId: "decided-1" });
  const fresh = buildLead({ id: "fresh-1", firstImportedAt: TODAY_EARLY });
  const items = computeFounderWorkingQueue(buildInput({ decisionItems: [decision], leads: [fresh] }));
  assert.deepEqual(items.map((i) => i.kind), ["decision", "fresh_opportunity"]);
});

test("fresh opportunities set aside by Hermes ('waiting'/no channel) never enter the queue", () => {
  const noChannelLead = buildLead({ id: "no-channel-1", firstImportedAt: TODAY_EARLY, phone: undefined, website: undefined });
  const items = computeFounderWorkingQueue(buildInput({ leads: [noChannelLead] }));
  assert.equal(items.length, 0);
});

/* ── 10. Queue counters remain consistent with the authoritative source ── */

test("summarizeFounderWorkingQueue counts match the item array exactly", () => {
  const decision = buildDecisionItem({ leadId: "decided-1" });
  const fresh = buildLead({ id: "fresh-1", firstImportedAt: TODAY_EARLY });
  const items = computeFounderWorkingQueue(buildInput({ decisionItems: [decision], leads: [fresh] }));
  const summary = summarizeFounderWorkingQueue(items);
  assert.equal(summary.total, items.length);
  assert.equal(summary.decisionCount, items.filter((i) => i.kind === "decision").length);
  assert.equal(summary.freshOpportunityCount, items.filter((i) => i.kind === "fresh_opportunity").length);
  assert.equal(summary.total, 2);
  assert.equal(summary.decisionCount, 1);
  assert.equal(summary.freshOpportunityCount, 1);
});

/* ── isHermesWorking ────────────────────────────────────────────────── */

test("isHermesWorking is true only when the decision's own mission is in the runningMissionIds set", () => {
  const decision = buildDecisionItem({ missionId: "mission:running-1", leadId: "lead-running" });
  const runningItems = computeFounderWorkingQueue(
    buildInput({ decisionItems: [decision], runningMissionIds: new Set(["mission:running-1"]) }),
  );
  assert.equal(runningItems[0]!.isHermesWorking, true);

  const idleItems = computeFounderWorkingQueue(buildInput({ decisionItems: [decision] }));
  assert.equal(idleItems[0]!.isHermesWorking, false);
});

test("a fresh opportunity resolves its missionId from the missions array, so its card can open the Deal Workspace", () => {
  const lead = buildLead({ id: "fresh-1", firstImportedAt: TODAY_EARLY });
  const items = computeFounderWorkingQueue(
    buildInput({ leads: [lead], missions: [{ missionId: "mission:fresh-1", leadId: "fresh-1" }] }),
  );
  assert.equal(items[0]!.missionId, "mission:fresh-1");
});

/* ── Empty state ───────────────────────────────────────────────────── */

test("no decisions and no fresh opportunities produces an empty queue, not a fallback list", () => {
  const items = computeFounderWorkingQueue(buildInput());
  assert.deepEqual(items, []);
});

/* ── Founder Mode Deal Workspace fix — isDirectMutationDecisionType ───── */

test("isDirectMutationDecisionType flags only approve_message as a direct-mutation decision", () => {
  assert.equal(isDirectMutationDecisionType("approve_message"), true);
  const others: HermesDecisionType[] = [
    "review_hot_reply",
    "plan_demo",
    "decide_follow_up",
    "mark_outcome",
    "resolve_failed_delivery",
    "review_unknown",
    "review_qualification",
  ];
  for (const decisionType of others) {
    assert.equal(isDirectMutationDecisionType(decisionType), false, decisionType);
  }
  assert.equal(isDirectMutationDecisionType(null), false);
  assert.equal(isDirectMutationDecisionType(undefined), false);
});

test("an approve_message working queue item still carries its real Onayla/Reddet labels — the fix is in how the queue renders/routes them, not in the underlying decision data", () => {
  const decision = buildDecisionItem({ leadId: "lead-2" });
  const items = computeFounderWorkingQueue(buildInput({ decisionItems: [decision] }));
  assert.equal(items[0]!.sourceDecisionItem?.decisionType, "approve_message");
  assert.equal(items[0]!.primaryActionLabel, "Onayla");
  assert.equal(items[0]!.secondaryActionLabel, "Reddet");
  assert.equal(isDirectMutationDecisionType(items[0]!.sourceDecisionItem?.decisionType), true);
});
