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
  });
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

test("computeRevenueSummary: demoPendingCount includes read-stage missions and demo-preparation tasks", () => {
  const missions = [
    buildMission({ missionId: "m1", stage: "prepare" }), // read via receipt
    buildMission({
      missionId: "m2",
      stage: "prepare",
      primaryTaskId: "t2",
      tasks: [{ id: "t2", taskType: "demo-preparation" }],
    }),
    buildMission({ missionId: "m3", stage: "prepare" }),
  ];
  const receipts = [buildReceipt({ missionId: "m1", status: "read" })];
  assert.equal(computeRevenueSummary(missions, receipts).demoPendingCount, 2);
});

/* ── computeActionQueue ─────────────────────────────────────────── */

test("computeActionQueue: empty input returns an empty queue", () => {
  assert.deepEqual(computeActionQueue([], []), []);
});

test("computeActionQueue: completed missions never appear", () => {
  const missions = [buildMission({ missionId: "m1", stage: "completed" })];
  assert.equal(computeActionQueue(missions, []).length, 0);
});

test("computeActionQueue: sorts strictly by priority — FAILED > REPLY_RECEIVED > APPROVAL_REQUIRED > READ > DELIVERED > SENT > READY > UNKNOWN", () => {
  const missions = [
    buildMission({ missionId: "m-unknown", stage: "verify" }),
    buildMission({ missionId: "m-ready", stage: "execution-ready" }),
    buildMission({ missionId: "m-approval", stage: "approval" }),
    buildMission({ missionId: "m-failed", stage: "prepare" }),
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
  const replies = [buildReply({ missionId: "m-reply" })];

  const queue = computeActionQueue(missions, receipts, replies);
  assert.deepEqual(
    queue.map((q) => q.missionId),
    ["m-failed", "m-reply", "m-approval", "m-read", "m-delivered", "m-sent", "m-ready", "m-unknown"],
  );
  assert.deepEqual(
    queue.map((q) => q.stageLabel),
    [
      ACTION_STAGE_LABELS.failed,
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
