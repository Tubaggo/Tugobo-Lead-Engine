import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { __resetFollowUpRegistryForTests, upsertFollowUpCandidate } from "./follow-up-registry.ts";
import { __resetDemoSchedulingRegistryForTests, upsertDemoScheduleItem, updateDemoScheduleStatus } from "./demo-scheduling-registry.ts";
import { __resetSalesOutcomeRegistryForTests, upsertSalesOutcomeItem, updateSalesOutcomeStatus, getSalesOutcomeByMissionId } from "./sales-outcome-registry.ts";
import { __resetWhatsAppReplyRegistryForTests, recordWhatsAppReply } from "./whatsapp-reply-registry.ts";
import { __resetProviderMessageRegistryForTests, registerProviderMessageMapping } from "./hermes-provider-message-registry.ts";
import { __resetReplyIntelligenceRegistryForTests } from "./reply-intelligence-registry.ts";
import { __resetConversationRegistryForTests } from "./hermes-conversation-registry.ts";
import { __resetFollowUpOrchestrationRegistryForTests, getFollowUpOrchestrationByMissionId, getRecentFollowUpOrchestrationDecisions } from "./hermes-follow-up-orchestration-registry.ts";
import { __resetFollowUpOrchestrationServiceForTests, runFollowUpOrchestration } from "./hermes-follow-up-orchestration-service.ts";
import { buildFollowUpPolicy } from "./hermes-follow-up-policy.ts";

const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  __resetFollowUpRegistryForTests();
  __resetDemoSchedulingRegistryForTests();
  __resetSalesOutcomeRegistryForTests();
  __resetWhatsAppReplyRegistryForTests();
  __resetProviderMessageRegistryForTests();
  __resetReplyIntelligenceRegistryForTests();
  __resetConversationRegistryForTests();
  __resetFollowUpOrchestrationRegistryForTests();
  __resetFollowUpOrchestrationServiceForTests();
});

function seedLaterCandidate(t0: number) {
  return upsertFollowUpCandidate(
    { source: "reply_intelligence", reason: "later_requested", provider: "whatsapp", sourceId: "wamid.later", providerMessageId: "wamid.later", missionId: "m1", leadId: "l1" },
    t0,
  );
}

function seedReadNoReply(t0: number) {
  return upsertFollowUpCandidate(
    { source: "reply_intelligence", reason: "read_no_reply", provider: "whatsapp", sourceId: "wamid.read", providerMessageId: "wamid.read", missionId: "m1", leadId: "l1" },
    t0,
  );
}

test("seeded follow-up candidate → service produces one orchestration decision", () => {
  seedLaterCandidate(0);
  const result = runFollowUpOrchestration({ now: 1 * HOUR, persist: true });
  assert.equal(result.evaluatedCount, 1);
  const orch = getFollowUpOrchestrationByMissionId("m1");
  assert.ok(orch);
  assert.equal(orch!.decision.trigger, "later_requested");
  assert.equal(orch!.decision.state, "waiting"); // 72h delay, only 1h elapsed
});

test("due follow-up prepares an approval-required draft only — no send", () => {
  seedReadNoReply(0);
  runFollowUpOrchestration({ now: 25 * HOUR, persist: true });
  const d = getFollowUpOrchestrationByMissionId("m1")!.decision;
  assert.equal(d.state, "draft_needed");
  assert.equal(d.draftNeeded, true);
  assert.equal(d.approvalRequired, true);
  const json = JSON.stringify(d);
  assert.equal(/sendAllowed|founderApproved|deliveryGateway|controlled-send/i.test(json), false);
});

test("evaluation retry does not duplicate orchestration decisions", () => {
  seedReadNoReply(0);
  runFollowUpOrchestration({ now: 25 * HOUR, persist: true });
  runFollowUpOrchestration({ now: 26 * HOUR, persist: true });
  const all = getRecentFollowUpOrchestrationDecisions(50, 27 * HOUR);
  assert.equal(all.filter((v) => v.decision.followUpCandidateId === "followup:read_no_reply:wamid.read").length, 1);
});

test("new reply cancels an obsolete no-reply follow-up", () => {
  seedReadNoReply(0);
  registerProviderMessageMapping({ providerMessageId: "wamid.ORIG", missionId: "m1", leadId: "l1", recipientMasked: null, now: 0 });
  // A newer inbound reply for the same mission, after the follow-up was created.
  recordWhatsAppReply(
    { provider: "whatsapp", providerMessageId: "wamid.NEW", fromMasked: null, fromWaIdMasked: null, messageType: "text", rawType: "text", textPreview: "Merhaba", occurredAt: 2 * HOUR, conversationIdSafe: "wamid.ORIG", contactProfileNameSafe: null, auditType: "whatsapp_reply_received" },
    2 * HOUR,
  );
  runFollowUpOrchestration({ now: 25 * HOUR, persist: true });
  assert.equal(getFollowUpOrchestrationByMissionId("m1")!.decision.state, "cancelled");
});

test("demo scheduled cancels the demo follow-up", () => {
  upsertFollowUpCandidate(
    { source: "demo_scheduling", reason: "demo_not_scheduled", provider: "whatsapp", sourceId: "demo:1", providerMessageId: null, missionId: "m1", leadId: "l1" },
    0,
  );
  // Create a demo item for the mission and mark it scheduled.
  upsertDemoScheduleItem({ provider: "whatsapp", providerMessageId: "wamid.demo", missionId: "m1", leadId: "l1", intent: "demo_requested" }, 0);
  const demoId = "demo:wamid.demo";
  updateDemoScheduleStatus(demoId, "scheduled", undefined, 0);
  runFollowUpOrchestration({ now: 5 * HOUR, persist: true });
  const d = getFollowUpOrchestrationByMissionId("m1")!.decision;
  // The demo_not_scheduled follow-up is cancelled; the newer demo-seeded follow-up (if any) is most recent.
  const orch = getRecentFollowUpOrchestrationDecisions(50, 6 * HOUR).find((v) => v.decision.followUpCandidateId === "followup:demo_not_scheduled:demo:1");
  assert.equal(orch!.decision.state, "cancelled");
  void d;
});

test("outcome won cancels the follow-up", () => {
  seedReadNoReply(0);
  upsertSalesOutcomeItem({ missionId: "m1", leadId: "l1", source: "founder_manual" }, 0);
  const outcome = getSalesOutcomeByMissionId("m1", 0)!;
  updateSalesOutcomeStatus(outcome.id, { status: "won", package: "starter" }, 0);
  runFollowUpOrchestration({ now: 25 * HOUR, persist: true });
  assert.equal(getFollowUpOrchestrationByMissionId("m1")!.decision.state, "cancelled");
});

test("persist:false evaluates without writing the registry", () => {
  seedReadNoReply(0);
  const result = runFollowUpOrchestration({ now: 25 * HOUR, persist: false });
  assert.equal(result.evaluatedCount, 1);
  assert.equal(getRecentFollowUpOrchestrationDecisions(50, 26 * HOUR).length, 0);
});

test("disabled policy evaluates nothing", () => {
  seedReadNoReply(0);
  const result = runFollowUpOrchestration({ now: 25 * HOUR, persist: true, policy: buildFollowUpPolicy({ enabled: false }) });
  assert.equal(result.evaluatedCount, 0);
  assert.equal(getRecentFollowUpOrchestrationDecisions(50, 26 * HOUR).length, 0);
});

test("no candidates → safe empty result", () => {
  const result = runFollowUpOrchestration({ now: 25 * HOUR, persist: true });
  assert.equal(result.ok, true);
  assert.equal(result.evaluatedCount, 0);
});
