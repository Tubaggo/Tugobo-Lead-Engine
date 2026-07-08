import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTION_STAGE_LABELS,
  actionStageOf,
  computeActionQueue,
  computeHermesHealth,
  computeHermesTimeline,
  computeMissionFocus,
  computeRevenueSummary,
  type MissionLike,
} from "./founder-revenue-workspace-adapter.ts";
import type { ProcessedWhatsAppDeliveryReceipt } from "../../../lib/whatsapp-delivery-receipt-processor.ts";
import type { StoredWhatsAppReply } from "../../../lib/whatsapp-reply-registry.ts";
import type { ReplyIntelligenceItem } from "../../../lib/reply-intelligence-runtime.ts";
import type { DemoScheduleItem } from "../../../lib/demo-scheduling-runtime.ts";
import type { FollowUpCandidate } from "../../../lib/follow-up-runtime.ts";

function buildMission(overrides: Partial<MissionLike> = {}): MissionLike {
  return {
    missionId: "mission:lead-1",
    hotelName: "Otel Test",
    stage: "prepare",
    stageLabel: "Hazırlık",
    status: "Hermes hazırlıyor",
    decisionState: "not-required",
    primaryTaskId: "task-1",
    tasks: [{ id: "task-1", taskType: "outreach-draft" }],
    timeline: [{ at: 1000, text: "Hazırlık başladı" }],
    ...overrides,
  };
}

function buildReceipt(overrides: Partial<ProcessedWhatsAppDeliveryReceipt> = {}): ProcessedWhatsAppDeliveryReceipt {
  return {
    provider: "whatsapp",
    providerMessageId: "wamid.TEST1",
    status: "sent",
    rawStatus: "sent",
    recipientMasked: "••• ••• 67",
    occurredAt: 2000,
    conversationIdSafe: null,
    pricingCategorySafe: null,
    errorCodeSafe: null,
    errorTypeSafe: null,
    errorMessageSafe: null,
    auditType: "whatsapp_delivery_sent",
    missionId: "mission:lead-1",
    leadId: "lead-1",
    mapped: true,
    ...overrides,
  };
}

function buildReply(overrides: Partial<StoredWhatsAppReply> = {}): StoredWhatsAppReply {
  return {
    provider: "whatsapp",
    providerMessageId: "wamid.REPLY1",
    fromMasked: "••• ••• 67",
    messageType: "text",
    textPreview: "Merhaba, fiyat bilgisi alabilir miyim?",
    occurredAt: 4000,
    conversationIdSafe: "wamid.TEST1",
    contactProfileNameSafe: "Ahmet",
    mapped: true,
    missionId: "mission:lead-1",
    leadId: "lead-1",
    source: "provider_message_registry",
    ...overrides,
  };
}

function buildIntelligence(overrides: Partial<ReplyIntelligenceItem> = {}): ReplyIntelligenceItem {
  return {
    provider: "whatsapp",
    providerMessageId: "wamid.REPLY1",
    missionId: "mission:lead-1",
    leadId: "lead-1",
    intent: "demo_requested",
    confidence: "high",
    urgency: "high",
    founderActionHint: "Demo talebi var — hemen randevu planlayın.",
    reason: "Mesajda demo/tanıtım talebi belirten bir ifade bulundu.",
    textPreview: "Demo görebilir miyiz?",
    analyzedAt: 4000,
    auditType: "reply_intelligence_demo_requested",
    ...overrides,
  };
}

function buildDemoItem(overrides: Partial<DemoScheduleItem> = {}): DemoScheduleItem {
  return {
    id: "demo:wamid.REPLY1",
    missionId: "mission:lead-1",
    leadId: "lead-1",
    provider: "whatsapp",
    sourceProviderMessageId: "wamid.REPLY1",
    sourceIntent: "demo_requested",
    status: "demo_requested",
    priority: "high",
    leadName: null,
    suggestedAction: "Demo zamanı planla",
    reason: "Müşteri doğrudan demo talep etti.",
    scheduledAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: 4000,
    updatedAt: 4000,
    ...overrides,
  };
}

function buildFollowUp(overrides: Partial<FollowUpCandidate> = {}): FollowUpCandidate {
  return {
    id: "followup:read_no_reply:wamid.REPLY1",
    missionId: "mission:lead-1",
    leadId: "lead-1",
    provider: "whatsapp",
    reason: "read_no_reply",
    status: "candidate",
    priority: "high",
    source: "delivery_receipt",
    suggestedAction: "Okundu ancak cevap yok, takip mesajı öner",
    suggestedTiming: "24 saat içinde",
    draftHint: "Kısa bir hatırlatma mesajı önerilir.",
    sourceProviderMessageId: "wamid.REPLY1",
    createdAt: 4000,
    updatedAt: 4000,
    expiresAt: null,
    ...overrides,
  };
}

/* ── actionStageOf ──────────────────────────────────────────────── */

test("actionStageOf: a failed receipt outranks everything else", () => {
  const mission = buildMission({ stage: "approval" });
  const receipt = buildReceipt({ status: "failed" });
  assert.equal(actionStageOf(mission, [receipt]), "failed");
});

test("actionStageOf: mission stage approval maps to approval_required", () => {
  const mission = buildMission({ stage: "approval" });
  assert.equal(actionStageOf(mission, []), "approval_required");
});

test("actionStageOf: a mapped reply outranks approval_required/read/delivered/sent", () => {
  const mission = buildMission({ missionId: "mission:lead-1", stage: "approval" });
  const reply = buildReply({ missionId: "mission:lead-1" });
  assert.equal(actionStageOf(mission, [], [reply]), "reply_received");
});

test("actionStageOf: a failed receipt still outranks a mapped reply", () => {
  const mission = buildMission({ missionId: "mission:lead-1", stage: "prepare" });
  const receipt = buildReceipt({ missionId: "mission:lead-1", status: "failed" });
  const reply = buildReply({ missionId: "mission:lead-1" });
  assert.equal(actionStageOf(mission, [receipt], [reply]), "failed");
});

test("actionStageOf: a reply mapped to a different missionId is ignored", () => {
  const mission = buildMission({ missionId: "mission:lead-A", stage: "prepare" });
  const reply = buildReply({ missionId: "mission:lead-B" });
  assert.equal(actionStageOf(mission, [], [reply]), "unknown");
});

test("actionStageOf: a hot classification (demo_requested) outranks a plain reply_received", () => {
  const mission = buildMission({ missionId: "mission:lead-1", stage: "prepare" });
  const reply = buildReply({ missionId: "mission:lead-1" });
  const intelligence = buildIntelligence({ missionId: "mission:lead-1", intent: "demo_requested", urgency: "high" });
  assert.equal(actionStageOf(mission, [], [reply], [intelligence]), "hot_reply");
});

test("actionStageOf: interested is hot even though its urgency is medium", () => {
  const mission = buildMission({ missionId: "mission:lead-1", stage: "prepare" });
  const reply = buildReply({ missionId: "mission:lead-1" });
  const intelligence = buildIntelligence({ missionId: "mission:lead-1", intent: "interested", urgency: "medium" });
  assert.equal(actionStageOf(mission, [], [reply], [intelligence]), "hot_reply");
});

test("actionStageOf: human_review_required classification maps to reply_needs_review", () => {
  const mission = buildMission({ missionId: "mission:lead-1", stage: "prepare" });
  const reply = buildReply({ missionId: "mission:lead-1" });
  const intelligence = buildIntelligence({ missionId: "mission:lead-1", intent: "human_review_required", urgency: "medium" });
  assert.equal(actionStageOf(mission, [], [reply], [intelligence]), "reply_needs_review");
});

test("actionStageOf: a non-hot classification (e.g. later) still falls back to reply_received", () => {
  const mission = buildMission({ missionId: "mission:lead-1", stage: "prepare" });
  const reply = buildReply({ missionId: "mission:lead-1" });
  const intelligence = buildIntelligence({ missionId: "mission:lead-1", intent: "later", urgency: "medium" });
  assert.equal(actionStageOf(mission, [], [reply], [intelligence]), "reply_received");
});

test("actionStageOf: a failed receipt still outranks a hot_reply classification", () => {
  const mission = buildMission({ missionId: "mission:lead-1", stage: "prepare" });
  const receipt = buildReceipt({ missionId: "mission:lead-1", status: "failed" });
  const reply = buildReply({ missionId: "mission:lead-1" });
  const intelligence = buildIntelligence({ missionId: "mission:lead-1", intent: "demo_requested", urgency: "high" });
  assert.equal(actionStageOf(mission, [receipt], [reply], [intelligence]), "failed");
});

test("actionStageOf: a pending demo item outranks reply_needs_review and reply_received", () => {
  const mission = buildMission({ missionId: "mission:lead-1", stage: "prepare" });
  const reply = buildReply({ missionId: "mission:lead-1" });
  const intelligence = buildIntelligence({ missionId: "mission:lead-1", intent: "human_review_required", urgency: "medium" });
  const demoItem = buildDemoItem({ missionId: "mission:lead-1", status: "scheduling_needed" });
  assert.equal(actionStageOf(mission, [], [reply], [intelligence], [demoItem]), "demo_pending");
});

test("actionStageOf: hot_reply still outranks demo_pending", () => {
  const mission = buildMission({ missionId: "mission:lead-1", stage: "prepare" });
  const reply = buildReply({ missionId: "mission:lead-1" });
  const intelligence = buildIntelligence({ missionId: "mission:lead-1", intent: "demo_requested", urgency: "high" });
  const demoItem = buildDemoItem({ missionId: "mission:lead-1", status: "demo_requested" });
  assert.equal(actionStageOf(mission, [], [reply], [intelligence], [demoItem]), "hot_reply");
});

test("actionStageOf: demo_pending surfaces even without a matching entry in the (capped) reply feed", () => {
  const mission = buildMission({ missionId: "mission:lead-1", stage: "prepare" });
  const demoItem = buildDemoItem({ missionId: "mission:lead-1", status: "demo_requested" });
  assert.equal(actionStageOf(mission, [], [], [], [demoItem]), "demo_pending");
});

test("actionStageOf: a scheduled/completed demo item is no longer pending — falls through to reply_received", () => {
  const mission = buildMission({ missionId: "mission:lead-1", stage: "prepare" });
  const reply = buildReply({ missionId: "mission:lead-1" });
  const demoItem = buildDemoItem({ missionId: "mission:lead-1", status: "scheduled" });
  assert.equal(actionStageOf(mission, [], [reply], [], [demoItem]), "reply_received");
});

test("actionStageOf: a failed receipt still outranks demo_pending", () => {
  const mission = buildMission({ missionId: "mission:lead-1", stage: "prepare" });
  const receipt = buildReceipt({ missionId: "mission:lead-1", status: "failed" });
  const demoItem = buildDemoItem({ missionId: "mission:lead-1", status: "demo_requested" });
  assert.equal(actionStageOf(mission, [receipt], [], [], [demoItem]), "failed");
});

test("actionStageOf: an active follow-up candidate outranks reply_needs_review and reply_received", () => {
  const mission = buildMission({ missionId: "mission:lead-1", stage: "prepare" });
  const reply = buildReply({ missionId: "mission:lead-1" });
  const intelligence = buildIntelligence({ missionId: "mission:lead-1", intent: "human_review_required", urgency: "medium" });
  const followUp = buildFollowUp({ missionId: "mission:lead-1", status: "candidate" });
  assert.equal(actionStageOf(mission, [], [reply], [intelligence], [], [followUp]), "follow_up_required");
});

test("actionStageOf: demo_pending still outranks follow_up_required", () => {
  const mission = buildMission({ missionId: "mission:lead-1", stage: "prepare" });
  const demoItem = buildDemoItem({ missionId: "mission:lead-1", status: "demo_requested" });
  const followUp = buildFollowUp({ missionId: "mission:lead-1", status: "candidate" });
  assert.equal(actionStageOf(mission, [], [], [], [demoItem], [followUp]), "demo_pending");
});

test("actionStageOf: follow_up_required surfaces even without a matching entry in the (capped) reply feed", () => {
  const mission = buildMission({ missionId: "mission:lead-1", stage: "prepare" });
  const followUp = buildFollowUp({ missionId: "mission:lead-1", status: "candidate" });
  assert.equal(actionStageOf(mission, [], [], [], [], [followUp]), "follow_up_required");
});

test("actionStageOf: an approval_required follow-up is still active and outranks reply_received", () => {
  const mission = buildMission({ missionId: "mission:lead-1", stage: "prepare" });
  const followUp = buildFollowUp({ missionId: "mission:lead-1", status: "approval_required" });
  assert.equal(actionStageOf(mission, [], [], [], [], [followUp]), "follow_up_required");
});

test("actionStageOf: a resolved follow-up (approved/completed/dismissed) is no longer active — falls through to reply_received", () => {
  const mission = buildMission({ missionId: "mission:lead-1", stage: "prepare" });
  const reply = buildReply({ missionId: "mission:lead-1" });
  const followUp = buildFollowUp({ missionId: "mission:lead-1", status: "approved" });
  assert.equal(actionStageOf(mission, [], [reply], [], [], [followUp]), "reply_received");
});

test("actionStageOf: a failed receipt still outranks follow_up_required", () => {
  const mission = buildMission({ missionId: "mission:lead-1", stage: "prepare" });
  const receipt = buildReceipt({ missionId: "mission:lead-1", status: "failed" });
  const followUp = buildFollowUp({ missionId: "mission:lead-1", status: "candidate" });
  assert.equal(actionStageOf(mission, [receipt], [], [], [], [followUp]), "failed");
});

test("actionStageOf: read/delivered/sent map from the mapped receipt when not blocked by approval/failure", () => {
  const mission = buildMission({ stage: "prepare" });
  assert.equal(actionStageOf(mission, [buildReceipt({ status: "read" })]), "read");
  assert.equal(actionStageOf(mission, [buildReceipt({ status: "delivered" })]), "delivered");
  assert.equal(actionStageOf(mission, [buildReceipt({ status: "sent" })]), "sent");
});

test("actionStageOf: execution-ready stage with no receipt maps to ready", () => {
  const mission = buildMission({ stage: "execution-ready" });
  assert.equal(actionStageOf(mission, []), "ready");
});

test("actionStageOf: anything else with no receipt maps to unknown", () => {
  const mission = buildMission({ stage: "verify" });
  assert.equal(actionStageOf(mission, []), "unknown");
});

test("actionStageOf: a receipt for a different missionId is ignored", () => {
  const mission = buildMission({ missionId: "mission:lead-A", stage: "prepare" });
  const receipt = buildReceipt({ missionId: "mission:lead-B", status: "read" });
  assert.equal(actionStageOf(mission, [receipt]), "unknown");
});

/* ── computeRevenueSummary ──────────────────────────────────────── */

test("computeRevenueSummary: counts across an empty state are all zero", () => {
  const summary = computeRevenueSummary([], []);
  assert.deepEqual(summary, {
    totalActiveMissions: 0,
    founderApprovalPending: 0,
    sentCount: 0,
    deliveredCount: 0,
    readCount: 0,
    failedCount: 0,
    demoPendingCount: 0,
    needsAttentionCount: 0,
    replyReceivedCount: 0,
    hotReplyCount: 0,
    followUpRequiredCount: 0,
  });
});

test("computeRevenueSummary: followUpRequiredCount counts only candidate/approval_required follow-ups", () => {
  const followUps = [
    buildFollowUp({ id: "f1", status: "candidate" }),
    buildFollowUp({ id: "f2", status: "approval_required" }),
    buildFollowUp({ id: "f3", status: "approved" }),
    buildFollowUp({ id: "f4", status: "completed" }),
  ];
  const summary = computeRevenueSummary([], [], [], [], [], followUps);
  assert.equal(summary.followUpRequiredCount, 2);
});

test("computeRevenueSummary: hotReplyCount counts high-urgency and interested classifications", () => {
  const intelligence = [
    buildIntelligence({ providerMessageId: "wamid.I1", intent: "demo_requested", urgency: "high" }),
    buildIntelligence({ providerMessageId: "wamid.I2", intent: "interested", urgency: "medium" }),
    buildIntelligence({ providerMessageId: "wamid.I3", intent: "later", urgency: "medium" }),
    buildIntelligence({ providerMessageId: "wamid.I4", intent: "not_interested", urgency: "low" }),
  ];
  const summary = computeRevenueSummary([], [], [], intelligence);
  assert.equal(summary.hotReplyCount, 2);
});

test("computeRevenueSummary: replyReceivedCount counts all recent replies, mapped and unmapped", () => {
  const replies = [
    buildReply({ providerMessageId: "wamid.R1", missionId: "m1" }),
    buildReply({ providerMessageId: "wamid.R2", mapped: false, missionId: null, leadId: null, source: "unmapped" }),
  ];
  const summary = computeRevenueSummary([], [], replies);
  assert.equal(summary.replyReceivedCount, 2);
});

test("computeRevenueSummary: completed missions are excluded from totalActiveMissions", () => {
  const missions = [buildMission({ missionId: "m1", stage: "prepare" }), buildMission({ missionId: "m2", stage: "completed" })];
  const summary = computeRevenueSummary(missions, []);
  assert.equal(summary.totalActiveMissions, 1);
});

test("computeRevenueSummary: counts receipts by status", () => {
  const receipts = [
    buildReceipt({ status: "sent" }),
    buildReceipt({ status: "delivered" }),
    buildReceipt({ status: "delivered" }),
    buildReceipt({ status: "read" }),
    buildReceipt({ status: "failed" }),
  ];
  const summary = computeRevenueSummary([], receipts);
  assert.equal(summary.sentCount, 1);
  assert.equal(summary.deliveredCount, 2);
  assert.equal(summary.readCount, 1);
  assert.equal(summary.failedCount, 1);
});

test("computeRevenueSummary: founderApprovalPending counts only approval-stage missions", () => {
  const missions = [
    buildMission({ missionId: "m1", stage: "approval" }),
    buildMission({ missionId: "m2", stage: "prepare" }),
    buildMission({ missionId: "m3", stage: "approval" }),
  ];
  assert.equal(computeRevenueSummary(missions, []).founderApprovalPending, 2);
});

test("computeRevenueSummary: needsAttentionCount is failed + approval_required missions", () => {
  const missions = [
    buildMission({ missionId: "m1", stage: "approval" }),
    buildMission({ missionId: "m2", stage: "prepare" }),
    buildMission({ missionId: "m3", stage: "prepare" }),
  ];
  const receipts = [buildReceipt({ missionId: "m3", status: "failed" })];
  assert.equal(computeRevenueSummary(missions, receipts).needsAttentionCount, 2);
});

test("computeRevenueSummary: demoPendingCount counts demo_requested/scheduling_needed items only (v6.4)", () => {
  const demoItems = [
    buildDemoItem({ id: "d1", sourceProviderMessageId: "wamid.1", status: "demo_requested" }),
    buildDemoItem({ id: "d2", sourceProviderMessageId: "wamid.2", status: "scheduling_needed" }),
    buildDemoItem({ id: "d3", sourceProviderMessageId: "wamid.3", status: "scheduled" }),
    buildDemoItem({ id: "d4", sourceProviderMessageId: "wamid.4", status: "completed" }),
  ];
  const summary = computeRevenueSummary([], [], [], [], demoItems);
  assert.equal(summary.demoPendingCount, 2);
});

/* ── computeActionQueue ─────────────────────────────────────────── */

test("computeActionQueue: empty input returns an empty queue", () => {
  assert.deepEqual(computeActionQueue([], []), []);
});

test("computeActionQueue: completed missions never appear", () => {
  const missions = [buildMission({ missionId: "m1", stage: "completed" })];
  assert.equal(computeActionQueue(missions, []).length, 0);
});

test("computeActionQueue: sorts strictly by priority — FAILED > HOT_REPLY > DEMO_PENDING > FOLLOW_UP_REQUIRED > REPLY_RECEIVED > APPROVAL_REQUIRED > READ > DELIVERED > SENT > READY > UNKNOWN", () => {
  const missions = [
    buildMission({ missionId: "m-unknown", stage: "verify" }),
    buildMission({ missionId: "m-ready", stage: "execution-ready" }),
    buildMission({ missionId: "m-approval", stage: "approval" }),
    buildMission({ missionId: "m-failed", stage: "prepare" }),
    buildMission({ missionId: "m-hot", stage: "prepare" }),
    buildMission({ missionId: "m-demo", stage: "prepare" }),
    buildMission({ missionId: "m-followup", stage: "prepare" }),
    buildMission({ missionId: "m-reply", stage: "prepare" }),
    buildMission({ missionId: "m-read", stage: "prepare" }),
    buildMission({ missionId: "m-delivered", stage: "prepare" }),
    buildMission({ missionId: "m-sent", stage: "prepare" }),
  ];
  const receipts = [
    buildReceipt({ missionId: "m-failed", status: "failed" }),
    buildReceipt({ missionId: "m-read", status: "read" }),
    buildReceipt({ missionId: "m-delivered", status: "delivered" }),
    buildReceipt({ missionId: "m-sent", status: "sent" }),
  ];
  const replies = [
    buildReply({ providerMessageId: "wamid.HOT", missionId: "m-hot" }),
    buildReply({ providerMessageId: "wamid.DEMO", missionId: "m-demo" }),
    buildReply({ missionId: "m-reply" }),
  ];
  const intelligence = [buildIntelligence({ providerMessageId: "wamid.HOT", missionId: "m-hot", intent: "demo_requested", urgency: "high" })];
  const demoItems = [buildDemoItem({ id: "demo:wamid.DEMO", sourceProviderMessageId: "wamid.DEMO", missionId: "m-demo", status: "demo_requested" })];
  const followUps = [buildFollowUp({ id: "followup:read_no_reply:wamid.FU", missionId: "m-followup", status: "candidate" })];

  const queue = computeActionQueue(missions, receipts, replies, intelligence, demoItems, followUps);
  assert.deepEqual(
    queue.map((q) => q.missionId),
    ["m-failed", "m-hot", "m-demo", "m-followup", "m-reply", "m-approval", "m-read", "m-delivered", "m-sent", "m-ready", "m-unknown"],
  );
  assert.deepEqual(
    queue.map((q) => q.stageLabel),
    [
      ACTION_STAGE_LABELS.failed,
      ACTION_STAGE_LABELS.hot_reply,
      ACTION_STAGE_LABELS.demo_pending,
      ACTION_STAGE_LABELS.follow_up_required,
      ACTION_STAGE_LABELS.reply_received,
      ACTION_STAGE_LABELS.approval_required,
      ACTION_STAGE_LABELS.read,
      ACTION_STAGE_LABELS.delivered,
      ACTION_STAGE_LABELS.sent,
      ACTION_STAGE_LABELS.ready,
      ACTION_STAGE_LABELS.unknown,
    ],
  );
});

test("computeActionQueue: within the same stage, most recently active sorts first", () => {
  const missions = [
    buildMission({ missionId: "m-old", stage: "approval", timeline: [{ at: 1000, text: "eski" }] }),
    buildMission({ missionId: "m-new", stage: "approval", timeline: [{ at: 5000, text: "yeni" }] }),
  ];
  const queue = computeActionQueue(missions, []);
  assert.deepEqual(queue.map((q) => q.missionId), ["m-new", "m-old"]);
});

test("computeActionQueue: card fields never expose runtime internals — only hotel/stage/activity/suggestion", () => {
  const missions = [buildMission({ missionId: "m1", stage: "approval" })];
  const [card] = computeActionQueue(missions, []);
  assert.deepEqual(Object.keys(card).sort(), [
    "currentStageLabel",
    "hotelName",
    "lastActivity",
    "lastActivityAt",
    "missionId",
    "stage",
    "stageLabel",
    "suggestedAction",
  ]);
});

/* ── computeMissionFocus ────────────────────────────────────────── */

test("computeMissionFocus: with no receipt shows the safe empty-state labels", () => {
  const mission = buildMission({ stage: "prepare" });
  const focus = computeMissionFocus(mission, []);
  assert.equal(focus.whatsappStatusLabel, "Henüz WhatsApp gönderimi yok");
  assert.equal(focus.deliveryStateLabel, "Henüz gönderim yok");
  assert.equal(focus.latestReceiptLabel, null);
});

test("computeMissionFocus: with a mapped receipt surfaces the delivery state and suggested action", () => {
  const mission = buildMission({ stage: "prepare" });
  const receipt = buildReceipt({ status: "delivered" });
  const focus = computeMissionFocus(mission, [receipt]);
  assert.equal(focus.deliveryStateLabel, "Teslim Edildi");
  assert.ok(focus.latestReceiptLabel?.startsWith("Teslim Edildi"));
  assert.equal(focus.suggestedNextAction, "Teslim edildi — yanıt bekleniyor");
});

test("computeMissionFocus: with no demo item, demo fields are all null", () => {
  const mission = buildMission({ stage: "prepare" });
  const focus = computeMissionFocus(mission, []);
  assert.equal(focus.demoStatusLabel, null);
  assert.equal(focus.demoSuggestedAction, null);
  assert.equal(focus.demoScheduledAtLabel, null);
});

test("computeMissionFocus: with a demo item, surfaces demo status/suggested action/scheduledAt", () => {
  const mission = buildMission({ missionId: "mission:lead-1", stage: "prepare" });
  const demoItem = buildDemoItem({ missionId: "mission:lead-1", status: "scheduled", scheduledAt: 9000 });
  const focus = computeMissionFocus(mission, [], [], [], [demoItem]);
  assert.equal(focus.demoStatusLabel, "Planlandı");
  assert.equal(focus.demoSuggestedAction, demoItem.suggestedAction);
  assert.ok(focus.demoScheduledAtLabel !== null);
});

test("computeMissionFocus: with no follow-up candidate, follow-up fields are all null", () => {
  const mission = buildMission({ stage: "prepare" });
  const focus = computeMissionFocus(mission, []);
  assert.equal(focus.followUpStatusLabel, null);
  assert.equal(focus.followUpReasonLabel, null);
  assert.equal(focus.followUpSuggestedAction, null);
  assert.equal(focus.followUpSuggestedTiming, null);
});

test("computeMissionFocus: with a follow-up candidate, surfaces status/reason/suggested action/timing", () => {
  const mission = buildMission({ missionId: "mission:lead-1", stage: "prepare" });
  const followUp = buildFollowUp({ missionId: "mission:lead-1", status: "candidate", reason: "demo_not_scheduled" });
  const focus = computeMissionFocus(mission, [], [], [], [], [followUp]);
  assert.equal(focus.followUpStatusLabel, "Takip Adayı");
  assert.equal(focus.followUpReasonLabel, "Demo Planlanmadı");
  assert.equal(focus.followUpSuggestedAction, followUp.suggestedAction);
  assert.equal(focus.followUpSuggestedTiming, followUp.suggestedTiming);
});

/* ── computeHermesTimeline ──────────────────────────────────────── */

test("computeHermesTimeline: empty state returns an empty timeline", () => {
  assert.deepEqual(computeHermesTimeline([], []), []);
});

test("computeHermesTimeline: includes mission-created, founder-approved, and receipt events, newest first", () => {
  const mission = buildMission({
    missionId: "m1",
    hotelName: "Otel A",
    decisionState: "approved",
    timeline: [
      { at: 1000, text: "İlk olay" },
      { at: 2000, text: "Onayladı — bir şey" },
    ],
  });
  const receipts = [buildReceipt({ missionId: "m1", status: "delivered", occurredAt: 3000, providerMessageId: "wamid.X" })];

  const timeline = computeHermesTimeline([mission], receipts);
  assert.deepEqual(
    timeline.map((e) => e.label),
    ["Teslim edildi — m1", "Founder onayı verildi — Otel A", "Mission oluşturuldu — Otel A"],
  );
});

test("computeHermesTimeline: unknown-status receipts never produce an event", () => {
  const receipts = [buildReceipt({ status: "unknown" })];
  assert.deepEqual(computeHermesTimeline([], receipts), []);
});

test("computeHermesTimeline: respects the limit and returns newest first", () => {
  const receipts = Array.from({ length: 5 }, (_, i) =>
    buildReceipt({ providerMessageId: `wamid.${i}`, occurredAt: i * 1000, status: "sent" }),
  );
  const timeline = computeHermesTimeline([], receipts, 2);
  assert.equal(timeline.length, 2);
  assert.equal(timeline[0].at, 4000);
  assert.equal(timeline[1].at, 3000);
});

/* ── computeHermesHealth ────────────────────────────────────────── */

test("computeHermesHealth: unknown inputs produce safe unknown labels", () => {
  const health = computeHermesHealth({
    hermesRuntimeAvailable: false,
    whatsappReadinessStatus: null,
    deliveryFeedReachable: null,
  });
  assert.equal(health.hermesRuntimeLabel, "Bilinmiyor");
  assert.equal(health.whatsappLabel, "Bilinmiyor");
  assert.equal(health.deliveryLabel, "Bilinmiyor");
  assert.equal(health.missionBridgeLabel, "Sağlıklı");
});

test("computeHermesHealth: healthy inputs produce the expected Turkish labels", () => {
  const health = computeHermesHealth({
    hermesRuntimeAvailable: true,
    whatsappReadinessStatus: "controlled_live_ready",
    deliveryFeedReachable: true,
  });
  assert.equal(health.hermesRuntimeLabel, "Sağlıklı");
  assert.equal(health.whatsappLabel, "Bağlı");
  assert.equal(health.deliveryLabel, "Çalışıyor");
});

test("computeHermesHealth: an unreachable delivery feed is reported, not hidden", () => {
  const health = computeHermesHealth({
    hermesRuntimeAvailable: true,
    whatsappReadinessStatus: "not_configured",
    deliveryFeedReachable: false,
  });
  assert.equal(health.deliveryLabel, "Erişilemiyor");
  assert.equal(health.whatsappLabel, "Yapılandırılmadı");
});
