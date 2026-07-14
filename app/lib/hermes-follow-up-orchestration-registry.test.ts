import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  __resetFollowUpOrchestrationRegistryForTests,
  clearExpiredFollowUpOrchestrationDecisions,
  countFollowUpOrchestrationForLead,
  getActiveFollowUpOrchestrationDecisions,
  getFollowUpOrchestrationByCandidateId,
  getFollowUpOrchestrationByLeadId,
  getFollowUpOrchestrationByMissionId,
  getRecentFollowUpOrchestrationDecisions,
  recordFollowUpOrchestrationDecision,
} from "./hermes-follow-up-orchestration-registry.ts";
import {
  evaluateFollowUpOrchestration,
  type FollowUpCandidateLike,
  type FollowUpTrigger,
} from "./hermes-autonomous-follow-up-orchestrator.ts";
import { defaultFollowUpPolicy } from "./hermes-follow-up-policy.ts";

const POLICY = defaultFollowUpPolicy();
const HOUR = 60 * 60 * 1000;

function decisionFor(opts: { id?: string; reason?: FollowUpTrigger; leadId?: string; missionId?: string; now?: number; hasActiveApprovalDraft?: boolean } = {}) {
  const candidate: FollowUpCandidateLike = {
    id: opts.id ?? "followup:read_no_reply:1",
    missionId: opts.missionId ?? "m1",
    leadId: opts.leadId ?? "l1",
    reason: opts.reason ?? "read_no_reply",
    status: "candidate",
    priority: "high",
    source: "reply_intelligence",
    createdAt: 0,
    expiresAt: null,
  };
  return evaluateFollowUpOrchestration({
    candidate,
    signals: { hasContactPath: true, hasActiveApprovalDraft: opts.hasActiveApprovalDraft },
    policy: POLICY,
    currentTime: opts.now ?? 25 * HOUR,
  });
}

beforeEach(() => __resetFollowUpOrchestrationRegistryForTests());

test("record + retrieve by candidate / lead / mission", () => {
  const d = decisionFor({ id: "followup:read_no_reply:A", leadId: "lead-A", missionId: "mission-A" });
  assert.equal(recordFollowUpOrchestrationDecision({ decision: d, businessName: "Otel A", now: 25 * HOUR }), true);
  assert.ok(getFollowUpOrchestrationByCandidateId("followup:read_no_reply:A"));
  assert.equal(getFollowUpOrchestrationByLeadId("lead-A")?.decision.state, "draft_needed");
  assert.equal(getFollowUpOrchestrationByMissionId("mission-A")?.businessName, "Otel A");
});

test("upsert by candidate id — no duplicate on re-evaluation", () => {
  recordFollowUpOrchestrationDecision({ decision: decisionFor({ id: "followup:x:1", now: 25 * HOUR }), now: 25 * HOUR });
  recordFollowUpOrchestrationDecision({ decision: decisionFor({ id: "followup:x:1", now: 26 * HOUR }), now: 26 * HOUR });
  const all = getRecentFollowUpOrchestrationDecisions(50, 27 * HOUR);
  assert.equal(all.filter((v) => v.decision.followUpCandidateId === "followup:x:1").length, 1);
});

test("decision without candidate id is not stored", () => {
  const d = decisionFor();
  assert.equal(recordFollowUpOrchestrationDecision({ decision: { ...d, followUpCandidateId: "" }, now: 0 }), false);
});

test("active query excludes cancelled/completed", () => {
  recordFollowUpOrchestrationDecision({ decision: decisionFor({ id: "a", missionId: "m1", leadId: "l1" }), now: 25 * HOUR });
  // A cancelled one (new reply)
  const cancelled = evaluateFollowUpOrchestration({
    candidate: { id: "b", missionId: "m2", leadId: "l2", reason: "read_no_reply", status: "candidate", priority: "high", source: "reply_intelligence", createdAt: 0, expiresAt: null },
    signals: { hasContactPath: true, hasNewerReply: true },
    policy: POLICY,
    currentTime: 25 * HOUR,
  });
  recordFollowUpOrchestrationDecision({ decision: cancelled, now: 25 * HOUR });

  const active = getActiveFollowUpOrchestrationDecisions(50, 26 * HOUR);
  assert.equal(active.some((v) => v.decision.followUpCandidateId === "a"), true);
  assert.equal(active.some((v) => v.decision.followUpCandidateId === "b"), false);
});

test("TTL prunes expired decisions", () => {
  recordFollowUpOrchestrationDecision({ decision: decisionFor({ id: "a" }), now: 1000 });
  const fourteenDays = 14 * 24 * HOUR;
  assert.equal(clearExpiredFollowUpOrchestrationDecisions(1000 + fourteenDays + 1), 1);
});

test("count per lead", () => {
  recordFollowUpOrchestrationDecision({ decision: decisionFor({ id: "a", leadId: "L" }), now: 25 * HOUR });
  recordFollowUpOrchestrationDecision({ decision: decisionFor({ id: "b", leadId: "L" }), now: 25 * HOUR });
  recordFollowUpOrchestrationDecision({ decision: decisionFor({ id: "c", leadId: "OTHER" }), now: 25 * HOUR });
  assert.equal(countFollowUpOrchestrationForLead("L", 26 * HOUR), 2);
  assert.equal(countFollowUpOrchestrationForLead(null, 26 * HOUR), 0);
});

test("stored audit detail carries no raw phone/secret", () => {
  const d = decisionFor({ id: "a" });
  d.auditEvents.push({
    type: "hermes_follow_up_due", at: 1, followUpCandidateId: "a", missionId: "m1", leadId: "l1",
    trigger: "read_no_reply", state: "due", dueAt: null, priority: "high", approvalRequired: false,
    detailTr: "Ara +90 555 123 45 67 secret=xyz",
  });
  recordFollowUpOrchestrationDecision({ decision: d, now: 25 * HOUR });
  const stored = getFollowUpOrchestrationByCandidateId("a")!;
  for (const e of stored.decision.auditEvents) {
    assert.equal(/\+?\d[\d\s\-()]{8,}\d/.test(e.detailTr), false);
    assert.equal(/secret=xyz/.test(e.detailTr), false);
  }
});

test("max cap keeps store bounded at 500", () => {
  for (let i = 0; i < 520; i++) {
    recordFollowUpOrchestrationDecision({ decision: decisionFor({ id: `id-${i}`, leadId: `l-${i}`, missionId: `m-${i}` }), now: 25 * HOUR + i });
  }
  assert.ok(getRecentFollowUpOrchestrationDecisions(1000, 30 * HOUR).length <= 500);
});
