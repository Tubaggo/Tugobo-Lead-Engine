import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildReplyIntelligenceEvent,
  classifyReplyIntent,
  deriveFounderActionHint,
  deriveReplyUrgency,
  isHotReplyIntelligence,
  summarizeReplyIntelligence,
  type ReplyIntelligenceInput,
  type ReplyIntent,
} from "./reply-intelligence-runtime.ts";

const ALL_INTENTS: ReplyIntent[] = [
  "demo_requested",
  "pricing_question",
  "interested",
  "call_requested",
  "later",
  "not_interested",
  "wrong_number",
  "human_review_required",
  "unknown",
];

function buildInput(overrides: Partial<ReplyIntelligenceInput> = {}): ReplyIntelligenceInput {
  return {
    provider: "whatsapp",
    providerMessageId: "wamid.R1",
    messageType: "text",
    textPreview: "Merhaba",
    mapped: true,
    missionId: "mission-1",
    leadId: "lead-1",
    occurredAt: 1000,
    ...overrides,
  };
}

/* ── Classification per intent ─────────────────────────────────── */

test("classifies a demo_requested reply", () => {
  const result = classifyReplyIntent(buildInput({ textPreview: "Demo görebilir miyiz, uygun zaman var mı?" }));
  assert.equal(result.intent, "demo_requested");
  assert.equal(result.confidence, "high");
});

test("classifies a pricing_question reply", () => {
  const result = classifyReplyIntent(buildInput({ textPreview: "Fiyat bilgisi alabilir miyim?" }));
  assert.equal(result.intent, "pricing_question");
  assert.equal(result.confidence, "high");
});

test("classifies an interested reply", () => {
  const result = classifyReplyIntent(buildInput({ textPreview: "Detay bilgi alabilir miyim?" }));
  assert.equal(result.intent, "interested");
  assert.equal(result.confidence, "medium");
});

test("classifies a call_requested reply", () => {
  const result = classifyReplyIntent(buildInput({ textPreview: "Beni ara lütfen" }));
  assert.equal(result.intent, "call_requested");
  assert.equal(result.confidence, "high");
});

test("classifies a later reply", () => {
  const result = classifyReplyIntent(buildInput({ textPreview: "Şu an yoğunuz, daha sonra konuşalım" }));
  assert.equal(result.intent, "later");
  assert.equal(result.confidence, "medium");
});

test("classifies a not_interested reply", () => {
  const result = classifyReplyIntent(buildInput({ textPreview: "İlgilenmiyoruz, teşekkürler" }));
  assert.equal(result.intent, "not_interested");
  assert.equal(result.confidence, "high");
});

test("classifies a wrong_number reply", () => {
  const result = classifyReplyIntent(buildInput({ textPreview: "Yanlış numara aramışsınız" }));
  assert.equal(result.intent, "wrong_number");
  assert.equal(result.confidence, "high");
});

test("classifies an unknown reply when there is no useful signal", () => {
  const result = classifyReplyIntent(buildInput({ textPreview: "Merhaba, nasılsınız bugün?" }));
  assert.equal(result.intent, "unknown");
  assert.equal(result.confidence, "low");
});

/* ── human_review_required triggers ──────────────────────────────── */

test("a button/interactive reply with no clear keyword becomes human_review_required", () => {
  const result = classifyReplyIntent(buildInput({ messageType: "button", textPreview: "Tamam" }));
  assert.equal(result.intent, "human_review_required");
  assert.equal(result.confidence, "low");
});

test("an interactive reply with no clear keyword becomes human_review_required", () => {
  const result = classifyReplyIntent(buildInput({ messageType: "interactive", textPreview: "Seçenek 1" }));
  assert.equal(result.intent, "human_review_required");
});

test("an empty textPreview becomes human_review_required", () => {
  const result = classifyReplyIntent(buildInput({ textPreview: null }));
  assert.equal(result.intent, "human_review_required");
});

test("a too-short textPreview becomes human_review_required", () => {
  const result = classifyReplyIntent(buildInput({ textPreview: "ok" }));
  assert.equal(result.intent, "human_review_required");
});

test("an unmapped reply with no keyword match becomes human_review_required", () => {
  const result = classifyReplyIntent(buildInput({ mapped: false, missionId: null, leadId: null, textPreview: "Merhaba, nasılsınız bugün?" }));
  assert.equal(result.intent, "human_review_required");
});

/* ── Rule priority ──────────────────────────────────────────────── */

test("rule priority: wrong_number beats interested when both signals are present", () => {
  const result = classifyReplyIntent(buildInput({ textPreview: "Yanlış numara ama detay bilgi alabilir miyim?" }));
  assert.equal(result.intent, "wrong_number");
});

test("rule priority: not_interested beats pricing/demo when signals conflict", () => {
  const result = classifyReplyIntent(buildInput({ textPreview: "İlgilenmiyoruz, demo ya da fiyat konuşmak istemiyoruz" }));
  assert.equal(result.intent, "not_interested");
});

test("rule priority: demo_requested beats pricing_question when both are present", () => {
  const result = classifyReplyIntent(buildInput({ textPreview: "Fiyat sormadan önce demo görmek istiyoruz" }));
  assert.equal(result.intent, "demo_requested");
});

/* ── Urgency mapping ────────────────────────────────────────────── */

test("urgency mapping matches the spec table", () => {
  assert.equal(deriveReplyUrgency({ intent: "demo_requested" }), "high");
  assert.equal(deriveReplyUrgency({ intent: "pricing_question" }), "high");
  assert.equal(deriveReplyUrgency({ intent: "call_requested" }), "high");
  assert.equal(deriveReplyUrgency({ intent: "wrong_number" }), "high");
  assert.equal(deriveReplyUrgency({ intent: "interested" }), "medium");
  assert.equal(deriveReplyUrgency({ intent: "later" }), "medium");
  assert.equal(deriveReplyUrgency({ intent: "human_review_required" }), "medium");
  assert.equal(deriveReplyUrgency({ intent: "not_interested" }), "low");
  assert.equal(deriveReplyUrgency({ intent: "unknown" }), "low");
});

test("isHotReplyIntelligence: high urgency and interested are hot, everything else is not", () => {
  assert.equal(isHotReplyIntelligence({ urgency: "high", intent: "demo_requested" }), true);
  assert.equal(isHotReplyIntelligence({ urgency: "medium", intent: "interested" }), true);
  assert.equal(isHotReplyIntelligence({ urgency: "medium", intent: "later" }), false);
  assert.equal(isHotReplyIntelligence({ urgency: "low", intent: "not_interested" }), false);
});

/* ── Founder action hint ────────────────────────────────────────── */

test("a Turkish founder action hint exists for every intent", () => {
  for (const intent of ALL_INTENTS) {
    const hint = deriveFounderActionHint({ intent, mapped: true });
    assert.ok(hint.length > 0, `missing action hint for ${intent}`);
  }
});

test("an unmapped classification's action hint mentions the mapping limitation", () => {
  const hint = deriveFounderActionHint({ intent: "demo_requested", mapped: false });
  assert.ok(hint.includes("mission eşleşmedi"));
});

test("a mapped classification's action hint does not mention the mapping limitation", () => {
  const hint = deriveFounderActionHint({ intent: "demo_requested", mapped: true });
  assert.equal(hint.includes("mission eşleşmedi"), false);
});

/* ── buildReplyIntelligenceEvent ────────────────────────────────── */

test("buildReplyIntelligenceEvent assembles the full sanitized output model", () => {
  const input = buildInput({ textPreview: "Demo görebilir miyiz?" });
  const classification = classifyReplyIntent(input);
  const event = buildReplyIntelligenceEvent(input, classification, 5000);
  assert.equal(event.provider, "whatsapp");
  assert.equal(event.providerMessageId, "wamid.R1");
  assert.equal(event.missionId, "mission-1");
  assert.equal(event.leadId, "lead-1");
  assert.equal(event.intent, "demo_requested");
  assert.equal(event.confidence, "high");
  assert.equal(event.urgency, "high");
  assert.equal(event.textPreview, "Demo görebilir miyiz?");
  assert.equal(event.analyzedAt, 5000);
  assert.equal(event.auditType, "reply_intelligence_demo_requested");
  assert.ok(event.founderActionHint.length > 0);
  assert.ok(event.reason.length > 0);
});

test("buildReplyIntelligenceEvent never includes a raw phone or full message body", () => {
  const longText = "A".repeat(400);
  const input = buildInput({ textPreview: longText });
  const classification = classifyReplyIntent(input);
  const event = buildReplyIntelligenceEvent(input, classification, 5000);
  const serialized = JSON.stringify(event);
  assert.equal(serialized.includes("905551234567"), false);
  assert.equal("from" in event, false);
  assert.equal("accessToken" in event, false);
});

/* ── summarizeReplyIntelligence ─────────────────────────────────── */

test("summarizeReplyIntelligence counts every intent bucket and highUrgency", () => {
  const items = ALL_INTENTS.map((intent, i) =>
    buildReplyIntelligenceEvent(
      buildInput({ providerMessageId: `wamid.${i}`, textPreview: "x".repeat(10) }),
      { intent, confidence: "high", reason: "test" },
      1000,
    ),
  );
  const summary = summarizeReplyIntelligence(items);
  assert.equal(summary.total, 9);
  assert.equal(summary.demoRequested, 1);
  assert.equal(summary.pricingQuestion, 1);
  assert.equal(summary.interested, 1);
  assert.equal(summary.callRequested, 1);
  assert.equal(summary.later, 1);
  assert.equal(summary.notInterested, 1);
  assert.equal(summary.wrongNumber, 1);
  assert.equal(summary.humanReviewRequired, 1);
  assert.equal(summary.unknown, 1);
  assert.equal(summary.highUrgency, 4); // demo_requested, pricing_question, call_requested, wrong_number
});
