import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONVERSATION_NEXT_ACTION_LABELS_TR,
  CONVERSATION_STATE_LABELS_TR,
  buildConversationAuditEvent,
  deriveConversationFlags,
  deriveConversationNextAction,
  deriveConversationPriority,
  evaluateHermesConversation,
  isActiveConversation,
  safeReplyPreview,
  sortConversationDecisions,
  summarizeConversationDecisions,
  type ConversationDecision,
  type ConversationInput,
  type ConversationReplyIntent,
  type ConversationState,
} from "./hermes-autonomous-conversation-runtime.ts";
import { defaultConversationPolicy } from "./hermes-conversation-policy.ts";

const POLICY = defaultConversationPolicy();

function buildInput(overrides: Partial<ConversationInput> = {}): ConversationInput {
  const intent = overrides.replyIntelligence?.intent ?? "interested";
  return {
    reply: {
      provider: "whatsapp",
      providerMessageId: "wamid.C1",
      textPreview: "Merhaba, ilgileniyoruz.",
      mapped: true,
      missionId: "mission-1",
      leadId: "lead-1",
      occurredAt: 1000,
      ...overrides.reply,
    },
    replyIntelligence: {
      intent,
      confidence: "high",
      urgency: "medium",
      founderActionHint: "İlgi gösterdi — detaylı bilgi gönderin.",
      ...overrides.replyIntelligence,
    },
    missionId: overrides.missionId ?? "mission-1",
    leadId: overrides.leadId ?? "lead-1",
    salesOutcome: overrides.salesOutcome ?? null,
    currentTime: overrides.currentTime ?? 5000,
    policy: overrides.policy ?? POLICY,
  };
}

function evalIntent(intent: ConversationReplyIntent, extra: Partial<ConversationInput> = {}): ConversationDecision {
  return evaluateHermesConversation(buildInput({ replyIntelligence: { intent, confidence: "high", urgency: "high", founderActionHint: "hint" }, ...extra }));
}

/* ── intent → state mapping ─────────────────────────────────── */

test("interested → hot_opportunity, reply draft + approval, no send fields", () => {
  const d = evalIntent("interested");
  assert.equal(d.state, "hot_opportunity");
  assert.equal(d.nextAction, "prepare_reply_draft");
  assert.equal(d.replyDraftNeeded, true);
  assert.equal(d.approvalRequired, true);
  assert.equal(d.founderActionRequired, true);
  assert.equal(d.conversationClosed, false);
  // Yapısal: karar üzerinde send/approve alanı yoktur.
  assert.equal((d as Record<string, unknown>).sendAllowed, undefined);
  assert.equal((d as Record<string, unknown>).founderApproved, undefined);
});

test("pricing_question → pricing_discussion with approval-required draft", () => {
  const d = evalIntent("pricing_question");
  assert.equal(d.state, "pricing_discussion");
  assert.equal(d.nextAction, "prepare_reply_draft");
  assert.equal(d.replyDraftNeeded, true);
  assert.equal(d.approvalRequired, true);
});

test("demo_requested → demo_requested + schedule_demo", () => {
  const d = evalIntent("demo_requested");
  assert.equal(d.state, "demo_requested");
  assert.equal(d.nextAction, "schedule_demo");
  assert.equal(d.demoSchedulingNeeded, true);
  assert.equal(d.replyDraftNeeded, false);
  assert.equal(d.priority, "high");
});

test("call_requested → call_requested + schedule_call", () => {
  const d = evalIntent("call_requested");
  assert.equal(d.state, "call_requested");
  assert.equal(d.nextAction, "schedule_call");
  assert.equal(d.callSchedulingNeeded, true);
  assert.equal(d.priority, "high");
});

test("later → follow_up_later + create_follow_up", () => {
  const d = evalIntent("later");
  assert.equal(d.state, "follow_up_later");
  assert.equal(d.nextAction, "create_follow_up");
  assert.equal(d.followUpNeeded, true);
  assert.equal(d.priority, "medium");
});

test("not_interested → closed operationally, never auto-lost", () => {
  const d = evalIntent("not_interested");
  assert.equal(d.state, "not_interested");
  assert.equal(d.nextAction, "mark_not_interested");
  assert.equal(d.conversationClosed, true);
  assert.equal(d.priority, "low");
  // Asla otomatik lost: state closed_lost DEĞİL.
  assert.notEqual(d.state, "closed_lost");
});

test("wrong_number → closed + blocked-priority, critical", () => {
  const d = evalIntent("wrong_number");
  assert.equal(d.state, "wrong_number");
  assert.equal(d.nextAction, "mark_wrong_number");
  assert.equal(d.conversationClosed, true);
  assert.equal(d.priority, "critical");
});

test("human_review_required → founder review", () => {
  const d = evalIntent("human_review_required");
  assert.equal(d.state, "human_review_required");
  assert.equal(d.nextAction, "founder_review");
  assert.equal(d.founderActionRequired, true);
});

test("unknown mapped → reply_received (passive, no guessing)", () => {
  const d = evalIntent("unknown", { reply: { provider: "whatsapp", providerMessageId: "wamid.U", textPreview: "??", mapped: true, missionId: "m", leadId: "l", occurredAt: 1 } });
  assert.equal(d.state, "reply_received");
  assert.equal(d.nextAction, "wait");
  assert.equal(d.founderActionRequired, false);
});

test("unknown unmapped → human_review_required (no guessing)", () => {
  const d = evalIntent("unknown", { reply: { provider: "whatsapp", providerMessageId: "wamid.U2", textPreview: "??", mapped: false, missionId: null, leadId: null, occurredAt: 1 } });
  assert.equal(d.state, "human_review_required");
  assert.equal(d.nextAction, "founder_review");
});

/* ── unmapped automation downgrade ──────────────────────────── */

test("commercial intent but unmapped → downgraded to human_review_required", () => {
  const d = evalIntent("demo_requested", {
    reply: { provider: "whatsapp", providerMessageId: "wamid.D", textPreview: "demo", mapped: false, missionId: null, leadId: null, occurredAt: 1 },
    missionId: null,
    leadId: null,
  });
  assert.equal(d.state, "human_review_required");
  assert.equal(d.demoSchedulingNeeded, false);
});

test("unmapped downgrade can be disabled via policy", () => {
  const policy = { ...POLICY, requireMappedReplyForAutomation: false };
  const d = evaluateHermesConversation(buildInput({
    replyIntelligence: { intent: "demo_requested", confidence: "high", urgency: "high", founderActionHint: "h" },
    reply: { provider: "whatsapp", providerMessageId: "wamid.D2", textPreview: "demo", mapped: false, missionId: null, leadId: null, occurredAt: 1 },
    missionId: null,
    leadId: null,
    policy,
  }));
  assert.equal(d.state, "demo_requested");
});

/* ── sales outcome source-of-truth override ─────────────────── */

test("won overrides reply intent → closed_won", () => {
  const d = evalIntent("interested", { salesOutcome: { status: "won" } });
  assert.equal(d.state, "closed_won");
  assert.equal(d.conversationClosed, true);
  assert.equal(d.replyDraftNeeded, false);
});

test("lost overrides reply intent → closed_lost", () => {
  const d = evalIntent("demo_requested", { salesOutcome: { status: "lost" } });
  assert.equal(d.state, "closed_lost");
  assert.equal(d.conversationClosed, true);
});

test("open/paused outcome does NOT override reply intent", () => {
  const d = evalIntent("interested", { salesOutcome: { status: "open" } });
  assert.equal(d.state, "hot_opportunity");
});

/* ── safety: no auto send / auto approval anywhere ──────────── */

test("no state produces a send or auto-approval flag", () => {
  const intents: ConversationReplyIntent[] = [
    "demo_requested", "pricing_question", "interested", "call_requested",
    "later", "not_interested", "wrong_number", "human_review_required", "unknown",
  ];
  for (const intent of intents) {
    const d = evalIntent(intent);
    const keys = Object.keys(d);
    assert.equal(keys.includes("sendAllowed"), false, intent);
    assert.equal(keys.includes("founderApproved"), false, intent);
    // Taslak gerekiyorsa onay HER ZAMAN zorunlu.
    if (d.replyDraftNeeded) assert.equal(d.approvalRequired, true, intent);
  }
});

test("reply draft always requires approval (structural)", () => {
  for (const intent of ["interested", "pricing_question"] as ConversationReplyIntent[]) {
    const d = evalIntent(intent);
    assert.equal(d.replyDraftNeeded, true);
    assert.equal(d.approvalRequired, true);
  }
});

/* ── priority + next action tables ──────────────────────────── */

test("priority mapping is deterministic per state", () => {
  assert.equal(deriveConversationPriority("wrong_number"), "critical");
  assert.equal(deriveConversationPriority("hot_opportunity"), "high");
  assert.equal(deriveConversationPriority("follow_up_later"), "medium");
  assert.equal(deriveConversationPriority("reply_received"), "low");
});

test("next action mapping covers every state", () => {
  const states: ConversationState[] = [
    "awaiting_reply", "reply_received", "hot_opportunity", "pricing_discussion",
    "demo_requested", "call_requested", "follow_up_later", "human_review_required",
    "not_interested", "wrong_number", "closed_won", "closed_lost", "blocked",
  ];
  for (const s of states) {
    const na = deriveConversationNextAction(s);
    assert.ok(CONVERSATION_NEXT_ACTION_LABELS_TR[na], s);
  }
});

/* ── preview cap ────────────────────────────────────────────── */

test("preview capped at policy max length", () => {
  const long = "a".repeat(500);
  const preview = safeReplyPreview(long, POLICY);
  assert.ok(preview);
  assert.ok(preview!.length <= POLICY.maxReplyPreviewLength + 1); // +1 for the ellipsis
  assert.ok(preview!.endsWith("…"));
});

test("empty/null preview → null", () => {
  assert.equal(safeReplyPreview(null, POLICY), null);
  assert.equal(safeReplyPreview("   ", POLICY), null);
});

/* ── founder copy is safe Turkish (no raw phone/enum leakage) ── */

test("founder copy contains no raw digits sequence resembling a phone", () => {
  const d = evalIntent("interested");
  for (const text of [d.whatHappenedTr, d.whyItMattersTr, d.hermesRecommendationTr]) {
    assert.equal(/\+?\d[\d\s\-()]{8,}\d/.test(text), false, text);
  }
});

test("founder action label present when action required, null when passive", () => {
  assert.ok(evalIntent("demo_requested").founderActionLabelTr);
  assert.equal(evalIntent("unknown", { reply: { provider: "whatsapp", providerMessageId: "w", textPreview: "x", mapped: true, missionId: "m", leadId: "l", occurredAt: 1 } }).founderActionLabelTr, null);
});

test("no founder action label is a send label", () => {
  const intents: ConversationReplyIntent[] = ["demo_requested", "call_requested", "interested", "pricing_question", "later", "not_interested", "wrong_number", "human_review_required"];
  for (const intent of intents) {
    const label = evalIntent(intent).founderActionLabelTr;
    if (label) assert.equal(/gönder/i.test(label), false, label);
  }
});

/* ── summary + sorting ──────────────────────────────────────── */

test("summary counts by state", () => {
  const items = [
    evalIntent("interested"),
    evalIntent("pricing_question"),
    evalIntent("demo_requested"),
    evalIntent("not_interested"),
    evalIntent("wrong_number"),
  ];
  const s = summarizeConversationDecisions(items);
  assert.equal(s.total, 5);
  assert.equal(s.hotOpportunity, 1);
  assert.equal(s.pricingDiscussion, 1);
  assert.equal(s.demoRequested, 1);
  assert.equal(s.notInterested, 1);
  assert.equal(s.wrongNumber, 1);
  assert.equal(s.closed, 2); // not_interested + wrong_number
});

test("sorting: critical before high before medium; input not mutated", () => {
  const a = evalIntent("later");        // medium
  const b = evalIntent("wrong_number"); // critical
  const c = evalIntent("interested");   // high
  const input = [a, b, c];
  const sorted = sortConversationDecisions(input);
  assert.deepEqual(sorted.map((x) => x.priority), ["critical", "high", "medium"]);
  assert.deepEqual(input.map((x) => x.priority), ["medium", "critical", "high"]);
});

test("isActiveConversation excludes passive + closed states", () => {
  assert.equal(isActiveConversation({ state: "hot_opportunity" }), true);
  assert.equal(isActiveConversation({ state: "reply_received" }), false);
  assert.equal(isActiveConversation({ state: "closed_won" }), false);
  assert.equal(isActiveConversation({ state: "wrong_number" }), false);
});

/* ── flags helper ───────────────────────────────────────────── */

test("deriveConversationFlags respects policy auto toggles", () => {
  const noAuto = { ...POLICY, allowAutoDemoCandidateCreation: false, allowAutoFollowUpCandidateCreation: false };
  const demo = deriveConversationFlags("demo_requested", noAuto);
  assert.equal(demo.demoSchedulingNeeded, false);
  assert.equal(demo.founderActionRequired, true); // founder yine bilgilendirilir
  const later = deriveConversationFlags("follow_up_later", noAuto);
  assert.equal(later.followUpNeeded, false);
});

/* ── audit ──────────────────────────────────────────────────── */

test("audit scrubber hides phone-like digit runs and secrets", () => {
  const e = buildConversationAuditEvent({
    type: "hermes_conversation_requested",
    at: 1,
    providerMessageIdSafe: "wamid.X",
    detailTr: "Ara +90 532 111 22 33 token=abc123",
  });
  assert.equal(/\+?\d[\d\s\-()]{8,}\d/.test(e.detailTr), false);
  assert.ok(e.detailTr.includes("[numara gizli]"));
  assert.ok(e.detailTr.includes("token=[gizli]"));
});

test("evaluate emits requested + started + completed audit chain", () => {
  const d = evalIntent("interested");
  const types = d.auditEvents.map((e) => e.type);
  assert.ok(types.includes("hermes_conversation_requested"));
  assert.ok(types.includes("hermes_conversation_started"));
  assert.ok(types.includes("hermes_conversation_hot_opportunity"));
  assert.ok(types.includes("hermes_conversation_completed"));
});

test("state + next-action labels exist for every produced state", () => {
  const intents: ConversationReplyIntent[] = ["demo_requested", "call_requested", "interested", "pricing_question", "later", "not_interested", "wrong_number", "human_review_required", "unknown"];
  for (const intent of intents) {
    const d = evalIntent(intent);
    assert.ok(CONVERSATION_STATE_LABELS_TR[d.state]);
    assert.ok(CONVERSATION_NEXT_ACTION_LABELS_TR[d.nextAction]);
  }
});
