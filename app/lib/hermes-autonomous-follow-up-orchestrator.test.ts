import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FOLLOW_UP_ORCH_STATE_LABELS_TR,
  buildFollowUpOrchestrationAuditEvent,
  deriveFollowUpChannelStrategy,
  deriveFollowUpDueAt,
  deriveFollowUpOrchestrationState,
  deriveFollowUpTrigger,
  evaluateFollowUpOrchestration,
  isActiveFollowUpOrchestration,
  sortFollowUpOrchestration,
  summarizeFollowUpOrchestration,
  type FollowUpCandidateLike,
  type FollowUpOrchestrationDecision,
  type FollowUpOrchestrationInput,
  type FollowUpSignals,
  type FollowUpTrigger,
} from "./hermes-autonomous-follow-up-orchestrator.ts";
import { defaultFollowUpPolicy } from "./hermes-follow-up-policy.ts";

const POLICY = defaultFollowUpPolicy();
const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;

function candidate(overrides: Partial<FollowUpCandidateLike> = {}): FollowUpCandidateLike {
  return {
    id: "followup:read_no_reply:wamid.1",
    missionId: "m1",
    leadId: "l1",
    reason: "read_no_reply",
    status: "candidate",
    priority: "high",
    source: "reply_intelligence",
    createdAt: 0,
    expiresAt: null,
    ...overrides,
  };
}

function evalOrch(
  reason: FollowUpTrigger,
  now: number,
  signals: FollowUpSignals = {},
  cand: Partial<FollowUpCandidateLike> = {},
): FollowUpOrchestrationDecision {
  const input: FollowUpOrchestrationInput = {
    candidate: candidate({ reason, id: `followup:${reason}:wamid.1`, ...cand }),
    signals: { hasContactPath: true, ...signals },
    policy: POLICY,
    currentTime: now,
  };
  return evaluateFollowUpOrchestration(input);
}

/* ── due / waiting timing ───────────────────────────────────── */

test("read_no_reply waiting before threshold, due after", () => {
  assert.equal(evalOrch("read_no_reply", 23 * HOUR).state, "waiting");
  // 24h threshold → draft_needed (due + eligible for draft)
  assert.equal(evalOrch("read_no_reply", 25 * HOUR).state, "draft_needed");
});

test("delivered_no_reply uses 48h threshold", () => {
  assert.equal(evalOrch("delivered_no_reply", 40 * HOUR).state, "waiting");
  assert.equal(evalOrch("delivered_no_reply", 49 * HOUR).state, "draft_needed");
});

test("hot_reply_needs_action uses 30min threshold", () => {
  assert.equal(evalOrch("hot_reply_needs_action", 20 * MIN).state, "waiting");
  assert.equal(evalOrch("hot_reply_needs_action", 40 * MIN).state, "draft_needed");
});

test("demo_not_scheduled uses 4h threshold", () => {
  assert.equal(evalOrch("demo_not_scheduled", 3 * HOUR).state, "waiting");
  assert.equal(evalOrch("demo_not_scheduled", 5 * HOUR).state, "draft_needed");
});

test("demo_no_show uses 24h threshold", () => {
  assert.equal(evalOrch("demo_no_show", 23 * HOUR).state, "waiting");
  assert.equal(evalOrch("demo_no_show", 25 * HOUR).state, "draft_needed");
});

test("failed_delivery_recovery: due state, manual channel review, no auto resend", () => {
  const d = evalOrch("failed_delivery_recovery", 20 * MIN);
  assert.equal(d.state, "due"); // no draft — hasContactPath default true but channel strategy overrides
  assert.equal(d.channelStrategy, "manual_channel_review");
  assert.equal(d.priority, "critical");
  assert.equal(d.founderActionLabelTr, "İletişim Kanalını Kontrol Et");
});

test("later_requested uses 72h default threshold", () => {
  assert.equal(evalOrch("later_requested", 70 * HOUR).state, "waiting");
  assert.equal(evalOrch("later_requested", 73 * HOUR).state, "draft_needed");
});

test("deriveFollowUpDueAt = createdAt + policy delay", () => {
  const input: FollowUpOrchestrationInput = { candidate: candidate({ reason: "read_no_reply", createdAt: 1000 }), signals: {}, policy: POLICY, currentTime: 0 };
  assert.equal(deriveFollowUpDueAt(input), 1000 + 24 * HOUR);
});

/* ── failed delivery channel strategy for failed_delivery ───── */

test("failed_delivery: hasContactPath false still manual_channel_review", () => {
  const d = evalOrch("failed_delivery_recovery", 20 * MIN, { hasContactPath: false });
  assert.equal(d.channelStrategy, "manual_channel_review");
});

/* ── cancellation / suppression ─────────────────────────────── */

test("new reply cancels a no-reply follow-up", () => {
  const d = evalOrch("read_no_reply", 25 * HOUR, { hasNewerReply: true });
  assert.equal(d.state, "cancelled");
  assert.match(d.cancellationReasonTr ?? "", /cevap verdiği/);
});

test("demo scheduled cancels demo-related follow-up", () => {
  const d = evalOrch("demo_not_scheduled", 5 * HOUR, { demoScheduledOrCompleted: true });
  assert.equal(d.state, "cancelled");
  assert.match(d.cancellationReasonTr ?? "", /Demo planlandığı/);
});

test("outcome won cancels follow-up", () => {
  const d = evalOrch("read_no_reply", 25 * HOUR, { outcomeWon: true });
  assert.equal(d.state, "cancelled");
  assert.match(d.cancellationReasonTr ?? "", /kazanıldığı/);
});

test("outcome lost cancels follow-up", () => {
  const d = evalOrch("read_no_reply", 25 * HOUR, { outcomeLost: true });
  assert.equal(d.state, "cancelled");
});

test("not_interested cancels follow-up", () => {
  const d = evalOrch("read_no_reply", 25 * HOUR, { conversationNotInterested: true });
  assert.equal(d.state, "cancelled");
});

test("wrong_number blocks follow-up", () => {
  const d = evalOrch("read_no_reply", 25 * HOUR, { conversationWrongNumber: true });
  assert.equal(d.state, "blocked");
});

test("doNotContact blocks follow-up", () => {
  const d = evalOrch("read_no_reply", 25 * HOUR, { doNotContact: true });
  assert.equal(d.state, "blocked");
});

test("max follow-up count blocks", () => {
  const d = evalOrch("read_no_reply", 25 * HOUR, { followUpCountForLead: 4 }); // > maxFollowUpsPerLead (3)
  assert.equal(d.state, "blocked");
  assert.ok(d.blockedReasonsTr.some((r) => /sınır/.test(r)));
});

test("minimum interval suppresses when a newer follow-up is too close", () => {
  // candidate at createdAt=0; another follow-up at 1h (< 24h min interval)
  const d = evalOrch("read_no_reply", 25 * HOUR, { mostRecentOtherFollowUpAt: 1 * HOUR });
  assert.equal(d.state, "cancelled");
  assert.match(d.cancellationReasonTr ?? "", /daha güncel/);
});

test("expired after policy window", () => {
  const d = evalOrch("read_no_reply", 337 * HOUR); // > expireAfterHours (336)
  assert.equal(d.state, "expired");
});

/* ── mapped requirement ─────────────────────────────────────── */

test("unmapped candidate is blocked (requireMappedLead)", () => {
  const d = evalOrch("read_no_reply", 25 * HOUR, {}, { missionId: null });
  assert.equal(d.state, "blocked");
  assert.ok(d.blockedReasonsTr.some((r) => /eşleşmedi/.test(r)));
});

/* ── approval / draft flow ──────────────────────────────────── */

test("due follow-up requires approval (draft_needed → approvalRequired true)", () => {
  const d = evalOrch("read_no_reply", 25 * HOUR);
  assert.equal(d.state, "draft_needed");
  assert.equal(d.draftNeeded, true);
  assert.equal(d.approvalRequired, true);
});

test("existing approval draft for mission → approval_required, not a second draft", () => {
  const d = evalOrch("read_no_reply", 25 * HOUR, { hasActiveApprovalDraft: true });
  assert.equal(d.state, "approval_required");
  assert.equal(d.draftNeeded, false);
  assert.equal(d.approvalRequired, true);
});

test("candidate already approved → approved_waiting_send", () => {
  const d = evalOrch("read_no_reply", 25 * HOUR, {}, { status: "approved" });
  assert.equal(d.state, "approved_waiting_send");
});

test("candidate completed → completed", () => {
  const d = evalOrch("read_no_reply", 25 * HOUR, {}, { status: "completed" });
  assert.equal(d.state, "completed");
});

/* ── no send / no auto approval (structural) ────────────────── */

test("no decision exposes a send or founderApproved field", () => {
  const triggers: FollowUpTrigger[] = ["read_no_reply", "delivered_no_reply", "hot_reply_needs_action", "demo_not_scheduled", "demo_no_show", "failed_delivery_recovery", "later_requested"];
  for (const t of triggers) {
    const d = evalOrch(t, 500 * HOUR);
    const keys = Object.keys(d);
    assert.equal(keys.includes("sendAllowed"), false, t);
    assert.equal(keys.includes("founderApproved"), false, t);
    if (d.draftNeeded) assert.equal(d.approvalRequired, true, t);
  }
});

test("founder action labels never say 'Gönder'", () => {
  const triggers: FollowUpTrigger[] = ["read_no_reply", "demo_not_scheduled", "failed_delivery_recovery", "later_requested"];
  for (const t of triggers) {
    const label = evalOrch(t, 500 * HOUR).founderActionLabelTr;
    if (label) assert.equal(/gönder/i.test(label), false, label);
  }
});

/* ── trigger derivation ─────────────────────────────────────── */

test("manual source → manual trigger", () => {
  assert.equal(deriveFollowUpTrigger(candidate({ source: "manual", reason: "read_no_reply" })), "manual");
});

test("unknown reason → unknown trigger", () => {
  assert.equal(deriveFollowUpTrigger(candidate({ reason: "unknown" })), "unknown");
});

/* ── channel strategy ───────────────────────────────────────── */

test("channel strategy same_channel by default, no_channel when blocked", () => {
  assert.equal(deriveFollowUpChannelStrategy({ candidate: candidate(), signals: { hasContactPath: true }, policy: POLICY, currentTime: 25 * HOUR }), "same_channel");
  assert.equal(deriveFollowUpChannelStrategy({ candidate: candidate(), signals: { doNotContact: true }, policy: POLICY, currentTime: 25 * HOUR }), "no_channel");
});

/* ── priority / summary / sorting ───────────────────────────── */

test("summary counts by group", () => {
  const items = [
    evalOrch("read_no_reply", 25 * HOUR), // draft_needed
    evalOrch("read_no_reply", 10 * HOUR, {}, { id: "followup:read_no_reply:w2" }), // waiting
    evalOrch("failed_delivery_recovery", 20 * MIN, {}, { id: "followup:failed:w3" }), // due, channel review
    evalOrch("read_no_reply", 25 * HOUR, { hasActiveApprovalDraft: true }, { id: "followup:read_no_reply:w4" }), // approval_required
  ];
  const s = summarizeFollowUpOrchestration(items);
  assert.equal(s.dueToday, 1);
  assert.equal(s.upcoming, 1);
  assert.equal(s.approvalRequired, 1);
  assert.equal(s.channelReview, 1);
});

test("sorting: approval_required before draft_needed before waiting; input not mutated", () => {
  const waiting = evalOrch("read_no_reply", 10 * HOUR, {}, { id: "a" });
  const draft = evalOrch("read_no_reply", 25 * HOUR, {}, { id: "b" });
  const approval = evalOrch("read_no_reply", 25 * HOUR, { hasActiveApprovalDraft: true }, { id: "c" });
  const input = [waiting, draft, approval];
  const sorted = sortFollowUpOrchestration(input);
  assert.deepEqual(sorted.map((x) => x.state), ["approval_required", "draft_needed", "waiting"]);
  assert.deepEqual(input.map((x) => x.state), ["waiting", "draft_needed", "approval_required"]);
});

test("isActiveFollowUpOrchestration excludes cancelled/completed/expired", () => {
  assert.equal(isActiveFollowUpOrchestration({ state: "due" }), true);
  assert.equal(isActiveFollowUpOrchestration({ state: "waiting" }), true);
  assert.equal(isActiveFollowUpOrchestration({ state: "cancelled" }), false);
  assert.equal(isActiveFollowUpOrchestration({ state: "completed" }), false);
});

/* ── audit ──────────────────────────────────────────────────── */

test("audit scrubber hides phone-like runs and secrets", () => {
  const e = buildFollowUpOrchestrationAuditEvent({
    type: "hermes_follow_up_due",
    at: 1,
    followUpCandidateId: "f1",
    trigger: "read_no_reply",
    priority: "high",
    detailTr: "Ara +90 532 111 22 33 token=abc",
  });
  assert.equal(/\+?\d[\d\s\-()]{8,}\d/.test(e.detailTr), false);
  assert.ok(e.detailTr.includes("token=[gizli]"));
});

test("evaluate emits requested + state audit chain", () => {
  const d = evalOrch("read_no_reply", 25 * HOUR);
  const types = d.auditEvents.map((e) => e.type);
  assert.ok(types.includes("hermes_follow_up_evaluation_requested"));
  assert.ok(types.includes("hermes_follow_up_draft_requested"));
});

test("every produced state has a Turkish label", () => {
  const states = Object.keys(FOLLOW_UP_ORCH_STATE_LABELS_TR);
  assert.ok(states.length === 11);
  for (const s of states) assert.ok(FOLLOW_UP_ORCH_STATE_LABELS_TR[s as keyof typeof FOLLOW_UP_ORCH_STATE_LABELS_TR]);
});

/* ── deriveFollowUpOrchestrationState direct ────────────────── */

test("deriveFollowUpOrchestrationState matches evaluate", () => {
  const input: FollowUpOrchestrationInput = { candidate: candidate({ reason: "read_no_reply" }), signals: { hasContactPath: true }, policy: POLICY, currentTime: 25 * HOUR };
  assert.equal(deriveFollowUpOrchestrationState(input), "draft_needed");
});
