import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeHermesOpportunityFocus,
  type ComputeHermesOpportunityFocusInput,
  type OpportunityFocusMissionLike,
} from "./hermes-opportunity-focus-adapter.ts";
import type { HermesDecisionItem } from "./hermes-decision-queue-adapter.ts";
import type { ProcessedWhatsAppDeliveryReceipt } from "../../../lib/whatsapp-delivery-receipt-processor.ts";
import type { StoredWhatsAppReply } from "../../../lib/whatsapp-reply-registry.ts";
import type { ReplyIntelligenceItem } from "../../../lib/reply-intelligence-runtime.ts";
import type { DemoScheduleItem } from "../../../lib/demo-scheduling-runtime.ts";
import type { FollowUpCandidate } from "../../../lib/follow-up-runtime.ts";
import type { SalesOutcomeItem } from "../../../lib/sales-outcome-runtime.ts";

function buildMission(overrides: Partial<OpportunityFocusMissionLike> = {}): OpportunityFocusMissionLike {
  return {
    missionId: "mission:lead-1",
    hotelName: "Otel Test",
    city: "İzmir",
    stage: "prepare",
    stageLabel: "Hazırlık",
    status: "Hermes hazırlıyor",
    decisionState: "not-required",
    primaryTaskId: "task-1",
    tasks: [{ id: "task-1", taskType: "outreach-draft" }],
    timeline: [{ at: 1000, text: "Hazırlık başladı" }],
    leadId: "lead-1",
    estimatedImpact: 60,
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
    analyzedAt: 4500,
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
    leadName: "Otel Test",
    suggestedAction: "Demo zamanı planla",
    reason: "Müşteri doğrudan demo talep etti.",
    scheduledAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: 4500,
    updatedAt: 4500,
    ...overrides,
  };
}

function buildFollowUp(overrides: Partial<FollowUpCandidate> = {}): FollowUpCandidate {
  return {
    id: "followup:read_no_reply:wamid.TEST1",
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
    sourceProviderMessageId: "wamid.TEST1",
    createdAt: 3000,
    updatedAt: 3000,
    expiresAt: null,
    ...overrides,
  };
}

function buildSalesOutcome(overrides: Partial<SalesOutcomeItem> = {}): SalesOutcomeItem {
  return {
    id: "outcome:mission:lead-1",
    missionId: "mission:lead-1",
    leadId: "lead-1",
    leadName: "Otel Test",
    status: "open",
    package: "unknown",
    estimatedMrr: null,
    estimatedArr: null,
    lostReason: null,
    outcomeNotePreview: null,
    source: "demo_scheduling",
    priority: "high",
    suggestedAction: "Demo/follow-up sonrası satış sonucunu belirle",
    reason: "Demo veya takip tamamlandı, satış sonucu belirlenmedi.",
    createdAt: 5000,
    updatedAt: 5000,
    closedAt: null,
    ...overrides,
  };
}

function buildDecisionItem(overrides: Partial<HermesDecisionItem> = {}): HermesDecisionItem {
  return {
    id: "decision:mission:lead-1:approval_required",
    missionId: "mission:lead-1",
    leadId: "lead-1",
    title: "Otel Test",
    decisionType: "approve_message",
    priority: "high",
    statusLabel: "Onay Bekliyor",
    whatHappened: "Hermes bir mesaj taslağı hazırladı.",
    whyItMatters: "Onaylanmazsa mesaj gönderilmez, fırsat ilerlemez.",
    hermesRecommendation: "Hazırlanan mesaj gözden geçirilip onaylanmayı bekliyor.",
    founderDecisionLabel: "Mesajı onayla ya da reddet.",
    primaryActionLabel: "Onayla",
    secondaryActionLabel: "Reddet",
    lastActivityAt: 1000,
    sourceStage: "approval_required",
    mapped: true,
    confidence: null,
    urgency: null,
    ...overrides,
  };
}

function buildInput(overrides: Partial<ComputeHermesOpportunityFocusInput> = {}): ComputeHermesOpportunityFocusInput {
  return { selectedMission: buildMission(), ...overrides };
}

test("empty state when no selection", () => {
  const focus = computeHermesOpportunityFocus({ selectedMission: null });
  assert.equal(focus.missionId, null);
  assert.equal(focus.urgency, "none");
  assert.equal(focus.emptyState, "Bir fırsat seçtiğinde Hermes bu otel için önerilen sonraki adımı gösterecek.");
  assert.deepEqual(focus.timeline, []);
});

test("failed delivery focus: critical urgency, exact required copy", () => {
  const focus = computeHermesOpportunityFocus(
    buildInput({ recentReceipts: [buildReceipt({ status: "failed", errorMessageSafe: "boom" })] }),
  );
  assert.equal(focus.urgency, "critical");
  assert.equal(focus.currentStateLabel, "Teslimat sorunu var");
  assert.equal(focus.founderNextAction, "Teslimat hatasını çöz");
  assert.equal(focus.hermesRecommendation, "Farklı kanal veya manuel kontrol önerilir.");
  assert.equal(focus.emptyState, null);
});

test("hot reply focus: high urgency, recommendation from reply intelligence hint", () => {
  const focus = computeHermesOpportunityFocus(
    buildInput({
      recentReplies: [buildReply()],
      recentIntelligence: [buildIntelligence({ intent: "demo_requested", urgency: "high" })],
    }),
  );
  assert.equal(focus.urgency, "high");
  assert.equal(focus.currentStateLabel, "Sıcak cevap geldi");
  assert.equal(focus.founderNextAction, "Cevabı incele");
  assert.equal(focus.hermesRecommendation, "Demo talebi var — hemen randevu planlayın.");
});

test("demo pending focus: high urgency", () => {
  const focus = computeHermesOpportunityFocus(
    buildInput({ recentDemoItems: [buildDemoItem({ status: "demo_requested" })] }),
  );
  assert.equal(focus.urgency, "high");
  assert.equal(focus.currentStateLabel, "Demo planlanmalı");
  assert.equal(focus.founderNextAction, "Demo zamanı planla");
});

test("follow-up required focus: urgency high", () => {
  const focus = computeHermesOpportunityFocus(
    buildInput({ recentFollowUps: [buildFollowUp({ status: "candidate", priority: "high" })] }),
  );
  assert.equal(focus.urgency, "high");
  assert.equal(focus.currentStateLabel, "Takip gerekiyor");
  assert.equal(focus.founderNextAction, "Takip kararını ver");
});

test("outcome required focus: medium urgency", () => {
  const focus = computeHermesOpportunityFocus(
    buildInput({ recentSalesOutcomes: [buildSalesOutcome({ status: "open" })] }),
  );
  assert.equal(focus.urgency, "medium");
  assert.equal(focus.currentStateLabel, "Satış sonucu bekliyor");
  assert.equal(focus.founderNextAction, "Sonucu işaretle");
});

test("approval required focus: high urgency, primary/secondary reused from matching decision item", () => {
  const focus = computeHermesOpportunityFocus(
    buildInput({
      selectedMission: buildMission({ stage: "approval" }),
      decisionItems: [buildDecisionItem()],
    }),
  );
  assert.equal(focus.urgency, "high");
  assert.equal(focus.currentStateLabel, "Mesaj onayı bekliyor");
  assert.equal(focus.founderNextAction, "Mesajı onayla veya reddet");
  assert.equal(focus.primaryActionLabel, "Onayla");
  assert.equal(focus.secondaryActionLabel, "Reddet");
  assert.equal(focus.hermesRecommendation, "Hazırlanan mesaj gözden geçirilip onaylanmayı bekliyor.");
});

test("won focus: low urgency", () => {
  const focus = computeHermesOpportunityFocus(
    buildInput({ selectedMission: buildMission({ stage: "prepare" }), recentSalesOutcomes: [buildSalesOutcome({ status: "won" })] }),
  );
  assert.equal(focus.urgency, "low");
  assert.equal(focus.currentStateLabel, "Satış kazanıldı");
  assert.equal(focus.founderNextAction, "Onboarding sürecine geç");
});

test("lost focus: low urgency", () => {
  const focus = computeHermesOpportunityFocus(
    buildInput({ selectedMission: buildMission({ stage: "prepare" }), recentSalesOutcomes: [buildSalesOutcome({ status: "lost" })] }),
  );
  assert.equal(focus.urgency, "low");
  assert.equal(focus.currentStateLabel, "Satış kaybedildi");
  assert.equal(focus.founderNextAction, "Kayıp nedenini değerlendir");
});

test("passive read/delivered state says no action needed", () => {
  const read = computeHermesOpportunityFocus(buildInput({ recentReceipts: [buildReceipt({ status: "read" })] }));
  assert.equal(read.currentStateLabel, "Okundu");
  assert.equal(read.founderNextAction, "Şimdilik aksiyon gerekmiyor");
  assert.equal(read.urgency, "low");

  const delivered = computeHermesOpportunityFocus(buildInput({ recentReceipts: [buildReceipt({ status: "delivered" })] }));
  assert.equal(delivered.currentStateLabel, "Teslim edildi");
  assert.equal(delivered.founderNextAction, "Şimdilik aksiyon gerekmiyor");
  assert.equal(delivered.urgency, "low");

  const sent = computeHermesOpportunityFocus(buildInput({ recentReceipts: [buildReceipt({ status: "sent" })] }));
  assert.equal(sent.currentStateLabel, "Mesaj gönderildi");
  assert.equal(sent.founderNextAction, "Şimdilik aksiyon gerekmiyor");
});

test("urgency derivation across every stage matches the spec's rules", () => {
  const cases: Array<{ input: ComputeHermesOpportunityFocusInput; expected: string }> = [
    { input: buildInput({ recentReceipts: [buildReceipt({ status: "failed" })] }), expected: "critical" },
    { input: buildInput({ recentReplies: [buildReply()], recentIntelligence: [buildIntelligence({ urgency: "high" })] }), expected: "high" },
    { input: buildInput({ recentDemoItems: [buildDemoItem()] }), expected: "high" },
    { input: buildInput({ recentFollowUps: [buildFollowUp({ priority: "high" })] }), expected: "high" },
    { input: buildInput({ recentSalesOutcomes: [buildSalesOutcome({ status: "open" })] }), expected: "medium" },
    { input: buildInput({ selectedMission: buildMission({ stage: "approval" }) }), expected: "high" },
    { input: buildInput({ recentReceipts: [buildReceipt({ status: "read" })] }), expected: "low" },
  ];
  for (const c of cases) {
    const focus = computeHermesOpportunityFocus(c.input);
    assert.equal(focus.urgency, c.expected, `expected urgency ${c.expected}, got ${focus.urgency}`);
  }
});

test("revenue signal label bands off mission.estimatedImpact", () => {
  const high = computeHermesOpportunityFocus(buildInput({ selectedMission: buildMission({ estimatedImpact: 80 }) }));
  assert.equal(high.revenueSignalLabel, "Yüksek Gelir Potansiyeli");

  const medium = computeHermesOpportunityFocus(buildInput({ selectedMission: buildMission({ estimatedImpact: 60 }) }));
  assert.equal(medium.revenueSignalLabel, "Orta Gelir Potansiyeli");

  const low = computeHermesOpportunityFocus(buildInput({ selectedMission: buildMission({ estimatedImpact: 20 }) }));
  assert.equal(low.revenueSignalLabel, "Standart Fırsat");
});

test("status strip labels: whatsapp/demo/follow-up/outcome status populate when data exists", () => {
  const focus = computeHermesOpportunityFocus(
    buildInput({
      recentReceipts: [buildReceipt({ status: "delivered" })],
      recentDemoItems: [buildDemoItem()],
      recentFollowUps: [buildFollowUp()],
      recentSalesOutcomes: [buildSalesOutcome({ status: "open" })],
    }),
  );
  assert.ok(focus.whatsappStatusLabel);
  assert.ok(focus.demoStatusLabel);
  assert.ok(focus.followUpStatusLabel);
  assert.ok(focus.outcomeStatusLabel);
});

test("status strip labels are all null when nothing is selected", () => {
  const focus = computeHermesOpportunityFocus({ selectedMission: null });
  assert.equal(focus.whatsappStatusLabel, null);
  assert.equal(focus.replyIntentLabel, null);
  assert.equal(focus.demoStatusLabel, null);
  assert.equal(focus.followUpStatusLabel, null);
  assert.equal(focus.outcomeStatusLabel, null);
  assert.equal(focus.estimatedMrrLabel, null);
});

test("timeline never exceeds 5 items even with many signals", () => {
  const focus = computeHermesOpportunityFocus(
    buildInput({
      selectedMission: buildMission({
        timeline: [
          { at: 1000, text: "Hazırlık başladı" },
          { at: 1100, text: "Zenginleştirme tamamlandı" },
          { at: 1200, text: "AI incelemesi tamamlandı" },
        ],
      }),
      recentReceipts: [buildReceipt({ status: "read", occurredAt: 3000 })],
      recentReplies: [buildReply({ occurredAt: 4000 })],
      recentDemoItems: [buildDemoItem({ updatedAt: 5000 })],
      recentFollowUps: [buildFollowUp({ updatedAt: 6000 })],
      recentSalesOutcomes: [buildSalesOutcome({ status: "won", closedAt: 7000 })],
    }),
  );
  assert.ok(focus.timeline.length <= 5);
});

test("timeline contains meaningful Turkish labels, newest first", () => {
  const focus = computeHermesOpportunityFocus(
    buildInput({
      recentReceipts: [buildReceipt({ status: "delivered", occurredAt: 9000 })],
    }),
  );
  assert.ok(focus.timeline.length > 0);
  assert.equal(focus.timeline[0]!.label, "Teslim Edildi");
  assert.equal(focus.timeline[0]!.occurredAt, 9000);
  for (const entry of focus.timeline) {
    assert.ok(entry.label.trim().length > 0);
  }
});

test("no technical terms in founder-facing strings", () => {
  const forbidden = ["stage", "runtime", "providermessageid", "bridge", "registry", "webhook"];
  const scenarios: ComputeHermesOpportunityFocusInput[] = [
    buildInput({ recentReceipts: [buildReceipt({ status: "failed" })] }),
    buildInput({ recentReplies: [buildReply()], recentIntelligence: [buildIntelligence()] }),
    buildInput({ recentDemoItems: [buildDemoItem()] }),
    buildInput({ recentFollowUps: [buildFollowUp()] }),
    buildInput({ recentSalesOutcomes: [buildSalesOutcome({ status: "open" })] }),
    buildInput({ selectedMission: buildMission({ stage: "approval" }), decisionItems: [buildDecisionItem()] }),
    buildInput({ selectedMission: buildMission({ stage: "prepare" }), recentSalesOutcomes: [buildSalesOutcome({ status: "won" })] }),
    buildInput({ selectedMission: buildMission({ stage: "prepare" }), recentSalesOutcomes: [buildSalesOutcome({ status: "lost" })] }),
  ];
  for (const scenario of scenarios) {
    const focus = computeHermesOpportunityFocus(scenario);
    const text = [
      focus.title,
      focus.subtitle,
      focus.currentStateLabel,
      focus.revenueSignalLabel,
      focus.whyThisMatters,
      focus.hermesRecommendation,
      focus.founderNextAction,
      focus.primaryActionLabel ?? "",
      focus.secondaryActionLabel ?? "",
      ...focus.timeline.map((t) => t.label),
    ]
      .join(" ")
      .toLowerCase();
    for (const term of forbidden) {
      assert.ok(!text.includes(term), `leaked technical term "${term}" in: ${text}`);
    }
  }
});

test("selected decision updates focus: a different selected mission/decisionItems produces a different focus", () => {
  const first = computeHermesOpportunityFocus(
    buildInput({
      selectedMission: buildMission({ missionId: "mission:a", leadId: "lead-a", hotelName: "Otel A" }),
      recentReceipts: [buildReceipt({ missionId: "mission:a", status: "failed" })],
    }),
  );
  const second = computeHermesOpportunityFocus(
    buildInput({
      selectedMission: buildMission({ missionId: "mission:b", leadId: "lead-b", hotelName: "Otel B" }),
      recentDemoItems: [buildDemoItem({ missionId: "mission:b" })],
    }),
  );
  assert.notEqual(first.missionId, second.missionId);
  assert.equal(first.title, "Otel A");
  assert.equal(second.title, "Otel B");
  assert.equal(first.currentStateLabel, "Teslimat sorunu var");
  assert.equal(second.currentStateLabel, "Demo planlanmalı");
});
