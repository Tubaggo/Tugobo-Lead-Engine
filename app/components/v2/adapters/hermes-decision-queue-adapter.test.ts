import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeHermesDecisionQueue,
  summarizeHermesDecisionQueue,
  type ComputeHermesDecisionQueueInput,
  type DecisionQueueDemoItemLike,
  type DecisionQueueFollowUpLike,
  type DecisionQueueMissionLike,
  type DecisionQueueReceiptLike,
  type DecisionQueueReplyIntelligenceLike,
  type DecisionQueueSalesOutcomeLike,
} from "./hermes-decision-queue-adapter.ts";
import type { ActionQueueItem, ActionStage } from "./founder-revenue-workspace-adapter.ts";

function buildActionQueueItem(overrides: Partial<ActionQueueItem> = {}): ActionQueueItem {
  return {
    missionId: "mission:lead-1",
    hotelName: "Otel Test",
    stage: "approval_required",
    stageLabel: "Onay Bekliyor",
    currentStageLabel: "Onay",
    lastActivity: "Mesaj hazırlandı",
    lastActivityAt: 1000,
    suggestedAction: "Founder onayı bekleniyor",
    ...overrides,
  };
}

function buildMission(overrides: Partial<DecisionQueueMissionLike> = {}): DecisionQueueMissionLike {
  return { missionId: "mission:lead-1", leadId: "lead-1", ...overrides };
}

function buildInput(
  actionQueue: ActionQueueItem[],
  overrides: Partial<ComputeHermesDecisionQueueInput> = {},
): ComputeHermesDecisionQueueInput {
  return {
    actionQueue,
    missions: [buildMission()],
    ...overrides,
  };
}

test("empty input returns empty queue", () => {
  const result = computeHermesDecisionQueue({ actionQueue: [], missions: [] });
  assert.deepEqual(result, []);
  const summary = summarizeHermesDecisionQueue(result);
  assert.equal(summary.total, 0);
});

test("approval_required creates an approve_message decision item", () => {
  const [item] = computeHermesDecisionQueue(buildInput([buildActionQueueItem({ stage: "approval_required" })]));
  assert.ok(item);
  assert.equal(item!.decisionType, "approve_message");
  assert.equal(item!.priority, "high");
  assert.equal(item!.statusLabel, "Onay Bekliyor");
  assert.equal(item!.primaryActionLabel, "Onayla");
  assert.equal(item!.secondaryActionLabel, "Reddet");
});

test("hot_reply creates a review_hot_reply decision item, using the reply intelligence hint", () => {
  const recentIntelligence: DecisionQueueReplyIntelligenceLike[] = [
    {
      missionId: "mission:lead-1",
      confidence: "high",
      urgency: "high",
      founderActionHint: "Demo talebi var — hemen randevu planlayın.",
      analyzedAt: 500,
    },
  ];
  const [item] = computeHermesDecisionQueue(
    buildInput([buildActionQueueItem({ stage: "hot_reply" })], { recentIntelligence }),
  );
  assert.ok(item);
  assert.equal(item!.decisionType, "review_hot_reply");
  assert.equal(item!.priority, "high");
  assert.equal(item!.statusLabel, "Sıcak Cevap");
  assert.equal(item!.primaryActionLabel, "İncele");
  assert.equal(item!.hermesRecommendation, "Demo talebi var — hemen randevu planlayın.");
  assert.equal(item!.confidence, "high");
  assert.equal(item!.urgency, "high");
});

test("demo_pending creates a plan_demo decision item", () => {
  const recentDemoItems: DecisionQueueDemoItemLike[] = [
    { missionId: "mission:lead-1", status: "demo_requested", suggestedAction: "Demo zamanı planla", updatedAt: 500 },
  ];
  const [item] = computeHermesDecisionQueue(
    buildInput([buildActionQueueItem({ stage: "demo_pending" })], { recentDemoItems }),
  );
  assert.ok(item);
  assert.equal(item!.decisionType, "plan_demo");
  assert.equal(item!.priority, "high");
  assert.equal(item!.statusLabel, "Demo Bekliyor");
  assert.equal(item!.primaryActionLabel, "Planla");
});

test("follow_up_required creates a decide_follow_up decision item, priority follows the candidate's own priority", () => {
  const recentFollowUps: DecisionQueueFollowUpLike[] = [
    { missionId: "mission:lead-1", status: "candidate", priority: "high", suggestedAction: "Takip mesajı öner", updatedAt: 500 },
  ];
  const [item] = computeHermesDecisionQueue(
    buildInput([buildActionQueueItem({ stage: "follow_up_required" })], { recentFollowUps }),
  );
  assert.ok(item);
  assert.equal(item!.decisionType, "decide_follow_up");
  assert.equal(item!.priority, "high");
  assert.equal(item!.statusLabel, "Takip Gerekli");
  assert.equal(item!.primaryActionLabel, "Karar Ver");

  const recentFollowUpsMedium: DecisionQueueFollowUpLike[] = [
    { missionId: "mission:lead-1", status: "candidate", priority: "low", suggestedAction: "Takip mesajı öner", updatedAt: 500 },
  ];
  const [mediumItem] = computeHermesDecisionQueue(
    buildInput([buildActionQueueItem({ stage: "follow_up_required" })], { recentFollowUps: recentFollowUpsMedium }),
  );
  assert.equal(mediumItem!.priority, "medium");
});

test("outcome_required creates a mark_outcome decision item", () => {
  const recentSalesOutcomes: DecisionQueueSalesOutcomeLike[] = [
    { missionId: "mission:lead-1", status: "open", suggestedAction: "Demo/follow-up sonrası satış sonucunu belirle", updatedAt: 500 },
  ];
  const [item] = computeHermesDecisionQueue(
    buildInput([buildActionQueueItem({ stage: "outcome_required" })], { recentSalesOutcomes }),
  );
  assert.ok(item);
  assert.equal(item!.decisionType, "mark_outcome");
  assert.equal(item!.priority, "medium");
  assert.equal(item!.statusLabel, "Sonuç Bekliyor");
  assert.equal(item!.primaryActionLabel, "Sonuçlandır");
});

test("failed creates a resolve_failed_delivery decision item, critical priority", () => {
  const recentReceipts: DecisionQueueReceiptLike[] = [
    { missionId: "mission:lead-1", status: "failed", errorMessageSafe: "Recipient unavailable", occurredAt: 500 },
  ];
  const [item] = computeHermesDecisionQueue(
    buildInput([buildActionQueueItem({ stage: "failed" })], { recentReceipts }),
  );
  assert.ok(item);
  assert.equal(item!.decisionType, "resolve_failed_delivery");
  assert.equal(item!.priority, "critical");
  assert.equal(item!.statusLabel, "Teslimat Hatası");
  assert.equal(item!.primaryActionLabel, "Çöz");
  assert.equal(item!.hermesRecommendation, "Farklı kanal veya manuel kontrol önerilir.");
});

test("reply_needs_review creates a review_unknown decision item", () => {
  const [item] = computeHermesDecisionQueue(buildInput([buildActionQueueItem({ stage: "reply_needs_review" })]));
  assert.ok(item);
  assert.equal(item!.decisionType, "review_unknown");
  assert.equal(item!.priority, "medium");
  assert.equal(item!.statusLabel, "İnceleme Gerekli");
  assert.equal(item!.primaryActionLabel, "İncele");
});

test("read/delivered/sent do not create decision items by default", () => {
  const passiveStages: ActionStage[] = ["read", "delivered", "sent"];
  for (const stage of passiveStages) {
    const result = computeHermesDecisionQueue(buildInput([buildActionQueueItem({ stage })]));
    assert.deepEqual(result, [], `stage "${stage}" must not create a decision item`);
  }
});

test("won/lost do not create decision items", () => {
  for (const stage of ["won", "lost"] as ActionStage[]) {
    const result = computeHermesDecisionQueue(buildInput([buildActionQueueItem({ stage })]));
    assert.deepEqual(result, [], `stage "${stage}" must not create a decision item`);
  }
});

test("ready/unknown/reply_received also do not create decision items", () => {
  for (const stage of ["ready", "unknown", "reply_received"] as ActionStage[]) {
    const result = computeHermesDecisionQueue(buildInput([buildActionQueueItem({ stage })]));
    assert.deepEqual(result, [], `stage "${stage}" must not create a decision item`);
  }
});

test("priority sorting: critical > high > medium > low", () => {
  const actionQueue = [
    buildActionQueueItem({ missionId: "m:medium", stage: "outcome_required", lastActivityAt: 1000 }),
    buildActionQueueItem({ missionId: "m:critical", stage: "failed", lastActivityAt: 1000 }),
    buildActionQueueItem({ missionId: "m:high", stage: "hot_reply", lastActivityAt: 1000 }),
  ];
  const missions = actionQueue.map((i) => buildMission({ missionId: i.missionId, leadId: i.missionId }));
  const result = computeHermesDecisionQueue(buildInput(actionQueue, { missions }));
  assert.deepEqual(
    result.map((i) => i.priority),
    ["critical", "high", "medium"],
  );
});

test("within the same priority, the newest lastActivityAt wins", () => {
  const actionQueue = [
    buildActionQueueItem({ missionId: "m:older", stage: "hot_reply", lastActivityAt: 1000 }),
    buildActionQueueItem({ missionId: "m:newer", stage: "demo_pending", lastActivityAt: 5000 }),
  ];
  const missions = actionQueue.map((i) => buildMission({ missionId: i.missionId, leadId: i.missionId }));
  const result = computeHermesDecisionQueue(buildInput(actionQueue, { missions }));
  assert.deepEqual(
    result.map((i) => i.missionId),
    ["m:newer", "m:older"],
  );
});

test("queue summary counts are correct", () => {
  const actionQueue = [
    buildActionQueueItem({ missionId: "m:1", stage: "failed" }),
    buildActionQueueItem({ missionId: "m:2", stage: "hot_reply" }),
    buildActionQueueItem({ missionId: "m:3", stage: "demo_pending" }),
    buildActionQueueItem({ missionId: "m:4", stage: "follow_up_required" }),
    buildActionQueueItem({ missionId: "m:5", stage: "outcome_required" }),
    buildActionQueueItem({ missionId: "m:6", stage: "approval_required" }),
    buildActionQueueItem({ missionId: "m:7", stage: "read" }), // passive — excluded
  ];
  const missions = actionQueue.map((i) => buildMission({ missionId: i.missionId, leadId: i.missionId }));
  const items = computeHermesDecisionQueue(buildInput(actionQueue, { missions }));
  const summary = summarizeHermesDecisionQueue(items);

  assert.equal(summary.total, 6);
  assert.equal(summary.critical, 1);
  assert.equal(summary.high, 3); // hot_reply, demo_pending, approval_required
  assert.equal(summary.medium, 2); // follow_up_required (no priority override → medium), outcome_required
  assert.equal(summary.failedDelivery, 1);
  assert.equal(summary.hotReply, 1);
  assert.equal(summary.demo, 1);
  assert.equal(summary.followUp, 1);
  assert.equal(summary.outcome, 1);
  assert.equal(summary.approveMessage, 1);
});

test("every decision item has whatHappened / whyItMatters / hermesRecommendation / primaryActionLabel", () => {
  const actionableStages: ActionStage[] = [
    "failed",
    "hot_reply",
    "demo_pending",
    "follow_up_required",
    "outcome_required",
    "approval_required",
    "reply_needs_review",
  ];
  for (const stage of actionableStages) {
    const [item] = computeHermesDecisionQueue(buildInput([buildActionQueueItem({ stage })]));
    assert.ok(item, `stage "${stage}" should produce an item`);
    assert.ok(item!.whatHappened.trim().length > 0, `${stage}: whatHappened`);
    assert.ok(item!.whyItMatters.trim().length > 0, `${stage}: whyItMatters`);
    assert.ok(item!.hermesRecommendation.trim().length > 0, `${stage}: hermesRecommendation`);
    assert.ok(item!.founderDecisionLabel.trim().length > 0, `${stage}: founderDecisionLabel`);
    assert.ok(item!.primaryActionLabel.trim().length > 0, `${stage}: primaryActionLabel`);
  }
});

test("no technical labels appear in founder-facing strings", () => {
  const actionableStages: ActionStage[] = [
    "failed",
    "hot_reply",
    "demo_pending",
    "follow_up_required",
    "outcome_required",
    "approval_required",
    "reply_needs_review",
  ];
  const forbidden = ["stage", "runtime", "providerMessageId", "bridge", "registry", "webhook"];
  for (const stage of actionableStages) {
    const [item] = computeHermesDecisionQueue(buildInput([buildActionQueueItem({ stage })]));
    const founderFacingText = [
      item!.title,
      item!.statusLabel,
      item!.whatHappened,
      item!.whyItMatters,
      item!.hermesRecommendation,
      item!.founderDecisionLabel,
      item!.primaryActionLabel,
      item!.secondaryActionLabel ?? "",
    ]
      .join(" ")
      .toLowerCase();
    for (const term of forbidden) {
      assert.ok(!founderFacingText.includes(term), `stage "${stage}" leaked technical term "${term}"`);
    }
  }
});

test("mapped is true whenever the item carries a missionId", () => {
  const [item] = computeHermesDecisionQueue(buildInput([buildActionQueueItem({ stage: "hot_reply" })]));
  assert.equal(item!.mapped, true);
});

test("leadId is resolved via the missions lookup, and is null if no match exists", () => {
  const [matched] = computeHermesDecisionQueue(
    buildInput([buildActionQueueItem({ stage: "hot_reply", missionId: "mission:lead-1" })], {
      missions: [buildMission({ missionId: "mission:lead-1", leadId: "lead-1" })],
    }),
  );
  assert.equal(matched!.leadId, "lead-1");

  const [unmatched] = computeHermesDecisionQueue(
    buildInput([buildActionQueueItem({ stage: "hot_reply", missionId: "mission:unknown" })], { missions: [] }),
  );
  assert.equal(unmatched!.leadId, null);
});

test("lastActivityAt of 0 (no real activity recorded) is normalized to null", () => {
  const [item] = computeHermesDecisionQueue(
    buildInput([buildActionQueueItem({ stage: "hot_reply", lastActivityAt: 0 })]),
  );
  assert.equal(item!.lastActivityAt, null);
});

/* ── Sprint C2 — review_qualification ───────────────────────── */

test("review_required qualification sonucu review_qualification karar öğesi olur", () => {
  const items = computeHermesDecisionQueue(
    buildInput([], {
      qualificationReviews: [
        {
          leadId: "lead-q1",
          businessName: "Zincir Otel",
          founderSummaryTr: "Hermes Zincir Otel işletmesinde güçlü fırsat sinyalleri buldu ancak bir nokta doğrulama gerektiriyor.",
          hermesRecommendationTr: "Hermes önce senin incelemeni istiyor — karar sana ait.",
          evaluatedAt: 5000,
        },
      ],
    }),
  );
  assert.equal(items.length, 1);
  const item = items[0]!;
  assert.equal(item.decisionType, "review_qualification");
  assert.equal(item.statusLabel, "Fırsatı İncele");
  assert.equal(item.primaryActionLabel, "İncele");
  assert.equal(item.missionId, null);
  assert.equal(item.leadId, "lead-q1");
  assert.ok(item.whatHappened.includes("güçlü fırsat sinyalleri"));
});

test("aynı lead zaten mission karar öğesi taşıyorsa qualification kartı üretilmez", () => {
  const items = computeHermesDecisionQueue(
    buildInput([buildActionQueueItem({ stage: "approval_required" })], {
      qualificationReviews: [{ leadId: "lead-1", businessName: "Otel Test" }],
    }),
  );
  assert.equal(items.length, 1);
  assert.equal(items[0]!.decisionType, "approve_message");
});

test("qualificationReviews verilmezse kuyruk davranışı değişmez", () => {
  const before = computeHermesDecisionQueue(buildInput([buildActionQueueItem()]));
  const after = computeHermesDecisionQueue(buildInput([buildActionQueueItem()], { qualificationReviews: [] }));
  assert.deepEqual(after, before);
});
