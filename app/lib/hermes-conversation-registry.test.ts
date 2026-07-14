import { test } from "node:test";
import assert from "node:assert/strict";
import {
  __resetConversationRegistryForTests,
  clearExpiredConversationDecisions,
  getConversationByLeadId,
  getConversationByMissionId,
  getConversationByProviderMessageId,
  getConversationDecision,
  getOpenConversationDecisions,
  getRecentConversationDecisions,
  recordConversationDecision,
} from "./hermes-conversation-registry.ts";
import {
  evaluateHermesConversation,
  type ConversationInput,
  type ConversationReplyIntent,
} from "./hermes-autonomous-conversation-runtime.ts";
import { defaultConversationPolicy } from "./hermes-conversation-policy.ts";

const POLICY = defaultConversationPolicy();

function decisionFor(
  intent: ConversationReplyIntent,
  opts: { providerMessageId?: string; leadId?: string; missionId?: string; now?: number } = {},
) {
  const input: ConversationInput = {
    reply: {
      provider: "whatsapp",
      providerMessageId: opts.providerMessageId ?? "wamid.1",
      textPreview: "test",
      mapped: true,
      missionId: opts.missionId ?? "m1",
      leadId: opts.leadId ?? "l1",
      occurredAt: opts.now ?? 1000,
    },
    replyIntelligence: { intent, confidence: "high", urgency: "high", founderActionHint: "h" },
    missionId: opts.missionId ?? "m1",
    leadId: opts.leadId ?? "l1",
    salesOutcome: null,
    currentTime: opts.now ?? 1000,
    policy: POLICY,
  };
  return evaluateHermesConversation(input);
}

test.beforeEach(() => __resetConversationRegistryForTests());

test("record + retrieve by id / lead / mission / provider id", () => {
  const d = decisionFor("interested", { providerMessageId: "wamid.A", leadId: "lead-A", missionId: "mission-A" });
  assert.equal(recordConversationDecision({ decision: d, businessName: "Otel A", now: 1000 }), true);

  assert.ok(getConversationDecision(d.id));
  assert.equal(getConversationByLeadId("lead-A")?.decision.state, "hot_opportunity");
  assert.equal(getConversationByMissionId("mission-A")?.decision.state, "hot_opportunity");
  assert.equal(getConversationByProviderMessageId("wamid.A")?.businessName, "Otel A");
});

test("upsert by provider message id — no duplicate for a re-processed reply", () => {
  const d1 = decisionFor("interested", { providerMessageId: "wamid.DUP", now: 1000 });
  recordConversationDecision({ decision: d1, businessName: "Otel", now: 1000 });
  const d2 = decisionFor("demo_requested", { providerMessageId: "wamid.DUP", now: 2000 });
  recordConversationDecision({ decision: d2, businessName: "Otel", now: 2000 });

  const all = getRecentConversationDecisions(50, 3000);
  const forId = all.filter((v) => v.decision.providerMessageIdSafe === "wamid.DUP");
  assert.equal(forId.length, 1);
  assert.equal(forId[0].decision.state, "demo_requested"); // latest wins
});

test("decision without providerMessageIdSafe is not stored", () => {
  const d = decisionFor("interested");
  const bad = { ...d, providerMessageIdSafe: "" };
  assert.equal(recordConversationDecision({ decision: bad, businessName: "x", now: 1000 }), false);
});

test("open query excludes closed/passive conversations", () => {
  recordConversationDecision({ decision: decisionFor("interested", { providerMessageId: "w1", leadId: "l1", missionId: "m1" }), businessName: "A", now: 1000 });
  recordConversationDecision({ decision: decisionFor("wrong_number", { providerMessageId: "w2", leadId: "l2", missionId: "m2" }), businessName: "B", now: 1000 });
  recordConversationDecision({ decision: decisionFor("unknown", { providerMessageId: "w3", leadId: "l3", missionId: "m3" }), businessName: "C", now: 1000 });

  const open = getOpenConversationDecisions(50, 2000);
  const states = open.map((v) => v.decision.state);
  assert.ok(states.includes("hot_opportunity"));
  assert.equal(states.includes("wrong_number"), false); // closed
  assert.equal(states.includes("reply_received"), false); // passive
});

test("recent is priority-sorted (critical first)", () => {
  recordConversationDecision({ decision: decisionFor("later", { providerMessageId: "w1", leadId: "l1", missionId: "m1" }), businessName: "A", now: 1000 });
  recordConversationDecision({ decision: decisionFor("wrong_number", { providerMessageId: "w2", leadId: "l2", missionId: "m2" }), businessName: "B", now: 1000 });
  const recent = getRecentConversationDecisions(50, 2000);
  assert.equal(recent[0].decision.priority, "critical");
});

test("TTL prunes expired decisions", () => {
  recordConversationDecision({ decision: decisionFor("interested", { providerMessageId: "w1" }), businessName: "A", now: 1000 });
  const fourteenDays = 14 * 24 * 60 * 60 * 1000;
  const removed = clearExpiredConversationDecisions(1000 + fourteenDays + 1);
  assert.equal(removed, 1);
  assert.equal(getRecentConversationDecisions(50, 1000 + fourteenDays + 2).length, 0);
});

test("stored decision carries no raw phone/token/secret in audit detail", () => {
  const d = decisionFor("interested", { providerMessageId: "wamid.S" });
  d.auditEvents.push({
    type: "hermes_conversation_requested",
    at: 1,
    leadId: "l1",
    missionId: "m1",
    providerMessageIdSafe: "wamid.S",
    state: "hot_opportunity",
    nextAction: "prepare_reply_draft",
    confidence: "high",
    urgency: "high",
    mapped: true,
    detailTr: "Numara +90 555 123 45 67 secret=xyz",
  });
  recordConversationDecision({ decision: d, businessName: "X", now: 1000 });
  const stored = getConversationByProviderMessageId("wamid.S")!;
  for (const e of stored.decision.auditEvents) {
    assert.equal(/\+?\d[\d\s\-()]{8,}\d/.test(e.detailTr), false);
    assert.equal(/secret=xyz/.test(e.detailTr), false);
  }
});

test("max cap keeps store bounded at 500", () => {
  for (let i = 0; i < 520; i++) {
    recordConversationDecision({ decision: decisionFor("interested", { providerMessageId: `w${i}`, leadId: `l${i}`, missionId: `m${i}` }), businessName: "A", now: 1000 + i });
  }
  const recent = getRecentConversationDecisions(1000, 2000);
  assert.ok(recent.length <= 500);
});
