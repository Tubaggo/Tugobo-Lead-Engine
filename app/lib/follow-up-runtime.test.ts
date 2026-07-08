import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  applyFollowUpStatusUpdate,
  buildFollowUpAuditEvent,
  deriveFollowUpCandidate,
  deriveFollowUpPriority,
  deriveFollowUpSuggestedAction,
  deriveFollowUpSuggestedTiming,
  isValidFollowUpStatusUpdateTarget,
  sortFollowUpCandidates,
  summarizeFollowUpCandidates,
  type FollowUpCandidateInput,
  type FollowUpReason,
} from "./follow-up-runtime.ts";

const ALL_REASONS: FollowUpReason[] = [
  "read_no_reply",
  "delivered_no_reply",
  "hot_reply_needs_action",
  "demo_not_scheduled",
  "demo_no_show",
  "failed_delivery_recovery",
  "later_requested",
  "unknown",
];

function buildInput(overrides: Partial<FollowUpCandidateInput> = {}): FollowUpCandidateInput {
  return {
    source: "delivery_receipt",
    reason: "read_no_reply",
    provider: "whatsapp",
    sourceId: "wamid.R1",
    providerMessageId: "wamid.R1",
    missionId: "mission-1",
    leadId: "lead-1",
    ...overrides,
  };
}

/* ── Rule table ─────────────────────────────────────────────────── */

test("read_no_reply creates a high-priority candidate", () => {
  const item = deriveFollowUpCandidate(buildInput({ reason: "read_no_reply" }), 1000);
  assert.equal(item.status, "candidate");
  assert.equal(item.priority, "high");
});

test("delivered_no_reply creates a medium-priority candidate", () => {
  const item = deriveFollowUpCandidate(buildInput({ reason: "delivered_no_reply" }), 1000);
  assert.equal(item.status, "candidate");
  assert.equal(item.priority, "medium");
});

test("failed_delivery_recovery creates a high-priority candidate", () => {
  const item = deriveFollowUpCandidate(buildInput({ reason: "failed_delivery_recovery" }), 1000);
  assert.equal(item.status, "candidate");
  assert.equal(item.priority, "high");
});

test("hot_reply_needs_action creates a high-priority candidate", () => {
  const item = deriveFollowUpCandidate(buildInput({ source: "reply_intelligence", reason: "hot_reply_needs_action" }), 1000);
  assert.equal(item.status, "candidate");
  assert.equal(item.priority, "high");
});

test("demo_not_scheduled creates a high-priority candidate", () => {
  const item = deriveFollowUpCandidate(buildInput({ source: "demo_scheduling", reason: "demo_not_scheduled", providerMessageId: null, sourceId: "demo:wamid.X" }), 1000);
  assert.equal(item.status, "candidate");
  assert.equal(item.priority, "high");
});

test("demo_no_show creates a high-priority candidate", () => {
  const item = deriveFollowUpCandidate(buildInput({ source: "demo_scheduling", reason: "demo_no_show", providerMessageId: null, sourceId: "demo:wamid.X" }), 1000);
  assert.equal(item.priority, "high");
});

test("later_requested creates a medium-priority candidate", () => {
  const item = deriveFollowUpCandidate(buildInput({ source: "reply_intelligence", reason: "later_requested" }), 1000);
  assert.equal(item.status, "candidate");
  assert.equal(item.priority, "medium");
});

test("deriveFollowUpPriority matches the rule table for every reason", () => {
  assert.equal(deriveFollowUpPriority({ reason: "read_no_reply" }), "high");
  assert.equal(deriveFollowUpPriority({ reason: "delivered_no_reply" }), "medium");
  assert.equal(deriveFollowUpPriority({ reason: "hot_reply_needs_action" }), "high");
  assert.equal(deriveFollowUpPriority({ reason: "demo_not_scheduled" }), "high");
  assert.equal(deriveFollowUpPriority({ reason: "demo_no_show" }), "high");
  assert.equal(deriveFollowUpPriority({ reason: "failed_delivery_recovery" }), "high");
  assert.equal(deriveFollowUpPriority({ reason: "later_requested" }), "medium");
  assert.equal(deriveFollowUpPriority({ reason: "unknown" }), "low");
});

/* ── missing missionId never crashes ───────────────────────────── */

test("a missing missionId never crashes candidate derivation", () => {
  assert.doesNotThrow(() => deriveFollowUpCandidate(buildInput({ missionId: null, leadId: null }), 1000));
  const item = deriveFollowUpCandidate(buildInput({ missionId: null, leadId: null }), 1000);
  assert.equal(item.missionId, null);
  assert.equal(item.leadId, null);
});

/* ── unmapped action hint ───────────────────────────────────────── */

test("an unmapped active candidate's suggested action mentions the mapping limitation", () => {
  const item = deriveFollowUpCandidate(buildInput({ reason: "read_no_reply", missionId: null, leadId: null }), 1000);
  assert.ok(item.suggestedAction.includes("mission eşleşmedi"));
});

test("a mapped candidate's suggested action does not mention the mapping limitation", () => {
  const item = deriveFollowUpCandidate(buildInput({ reason: "read_no_reply" }), 1000);
  assert.equal(item.suggestedAction.includes("mission eşleşmedi"), false);
});

test("deriveFollowUpSuggestedAction matches the spec's literal Turkish examples", () => {
  assert.equal(deriveFollowUpSuggestedAction({ reason: "read_no_reply", missionId: "m1", status: "candidate" }), "Okundu ancak cevap yok, takip mesajı öner");
  assert.equal(deriveFollowUpSuggestedAction({ reason: "demo_not_scheduled", missionId: "m1", status: "candidate" }), "Demo talebi var, planlama yapılmadı");
  assert.equal(deriveFollowUpSuggestedAction({ reason: "failed_delivery_recovery", missionId: "m1", status: "candidate" }), "Teslimat başarısız, farklı kanal dene");
  assert.equal(deriveFollowUpSuggestedAction({ reason: "later_requested", missionId: "m1", status: "candidate" }), "Sonra görüşelim dedi, uygun zamanda tekrar temas kur");
});

test("deriveFollowUpSuggestedTiming returns a Turkish timing hint for every reason", () => {
  for (const reason of ALL_REASONS) {
    const timing = deriveFollowUpSuggestedTiming({ reason });
    assert.ok(timing.length > 0, `missing timing for ${reason}`);
  }
});

/* ── status update targets ─────────────────────────────────────── */

test("isValidFollowUpStatusUpdateTarget accepts only the four allowed targets", () => {
  assert.equal(isValidFollowUpStatusUpdateTarget("approval_required"), true);
  assert.equal(isValidFollowUpStatusUpdateTarget("approved"), true);
  assert.equal(isValidFollowUpStatusUpdateTarget("dismissed"), true);
  assert.equal(isValidFollowUpStatusUpdateTarget("completed"), true);
  assert.equal(isValidFollowUpStatusUpdateTarget("candidate"), false);
  assert.equal(isValidFollowUpStatusUpdateTarget("expired"), false);
  assert.equal(isValidFollowUpStatusUpdateTarget("anything"), false);
  assert.equal(isValidFollowUpStatusUpdateTarget(null), false);
  assert.equal(isValidFollowUpStatusUpdateTarget(42), false);
});

test("applyFollowUpStatusUpdate transitions status and refreshes the action hint", () => {
  const item = deriveFollowUpCandidate(buildInput({ reason: "read_no_reply" }), 1000);
  const approved = applyFollowUpStatusUpdate(item, "approved", 2000);
  assert.equal(approved.status, "approved");
  assert.equal(approved.updatedAt, 2000);
  assert.equal(approved.suggestedAction, "Okundu ancak cevap yok, takip mesajı öner");
});

test("applyFollowUpStatusUpdate to dismissed on an unmapped item no longer shows the mapping-limitation hint (inactive status)", () => {
  const item = deriveFollowUpCandidate(buildInput({ reason: "read_no_reply", missionId: null, leadId: null }), 1000);
  assert.ok(item.suggestedAction.includes("mission eşleşmedi"));
  const dismissed = applyFollowUpStatusUpdate(item, "dismissed", 2000);
  assert.equal(dismissed.suggestedAction.includes("mission eşleşmedi"), false);
});

/* ── Audit events ───────────────────────────────────────────────── */

test("buildFollowUpAuditEvent produces a safe event for every audit type, with the right actor", () => {
  const item = deriveFollowUpCandidate(buildInput({ reason: "read_no_reply" }), 1000);

  const created = buildFollowUpAuditEvent(item, "follow_up_candidate_created", 1000);
  assert.equal(created.actor, "Hermes");
  assert.ok(created.details.includes("mission-1"));

  const expired = buildFollowUpAuditEvent(item, "follow_up_candidate_expired", 1000);
  assert.equal(expired.actor, "Hermes");

  for (const type of [
    "follow_up_status_approval_required",
    "follow_up_status_approved",
    "follow_up_status_dismissed",
    "follow_up_status_completed",
  ] as const) {
    const event = buildFollowUpAuditEvent(item, type, 1000);
    assert.equal(event.actor, "Founder");
    assert.equal(event.action, type);
  }
});

/* ── Summary ────────────────────────────────────────────────────── */

test("summarizeFollowUpCandidates counts every status bucket and highPriority", () => {
  const base = deriveFollowUpCandidate(buildInput({ reason: "read_no_reply" }), 1000);
  const items = [
    base,
    applyFollowUpStatusUpdate({ ...base, id: "f2" }, "approval_required", 1000),
    applyFollowUpStatusUpdate({ ...base, id: "f3" }, "approved", 1000),
    applyFollowUpStatusUpdate({ ...base, id: "f4" }, "dismissed", 1000),
    applyFollowUpStatusUpdate({ ...base, id: "f5" }, "completed", 1000),
    { ...base, id: "f6", status: "expired" as const },
  ];
  const summary = summarizeFollowUpCandidates(items);
  assert.equal(summary.total, 6);
  assert.equal(summary.candidate, 1);
  assert.equal(summary.approvalRequired, 1);
  assert.equal(summary.approved, 1);
  assert.equal(summary.dismissed, 1);
  assert.equal(summary.completed, 1);
  assert.equal(summary.expired, 1);
  assert.equal(summary.highPriority, 6);
});

/* ── Sorting ────────────────────────────────────────────────────── */

test("sortFollowUpCandidates prioritizes active/high-priority candidates first", () => {
  const completed = applyFollowUpStatusUpdate(deriveFollowUpCandidate(buildInput({ sourceId: "wamid.DONE", reason: "read_no_reply" }), 1000), "completed", 1000);
  const mediumCandidate = deriveFollowUpCandidate(buildInput({ sourceId: "wamid.MED", reason: "delivered_no_reply" }), 1000);
  const highCandidate = deriveFollowUpCandidate(buildInput({ sourceId: "wamid.HIGH", reason: "read_no_reply" }), 1000);

  const sorted = sortFollowUpCandidates([completed, mediumCandidate, highCandidate]);
  assert.deepEqual(
    sorted.map((i) => i.id),
    [highCandidate.id, mediumCandidate.id, completed.id],
  );
});

test("sortFollowUpCandidates never mutates the input array", () => {
  const items = [deriveFollowUpCandidate(buildInput(), 1000)];
  const original = [...items];
  sortFollowUpCandidates(items);
  assert.deepEqual(items, original);
});

/* ── Safety ─────────────────────────────────────────────────────── */

test("a derived follow-up candidate never includes a raw phone or full reply body field", () => {
  const item = deriveFollowUpCandidate(buildInput(), 1000);
  const serialized = JSON.stringify(item);
  assert.equal(serialized.includes("905551234567"), false);
  assert.equal("textPreview" in item, false);
  assert.equal("fromMasked" in item, false);
  assert.equal("accessToken" in item, false);
});

test("no fetch() call or WhatsApp send import is present in the pure runtime source", () => {
  const source = readFileSync(fileURLToPath(new URL("./follow-up-runtime.ts", import.meta.url)), "utf8");
  assert.equal(source.includes("fetch("), false);
  assert.equal(source.includes("process.env."), false);
  assert.equal(/from\s+["']\.\/whatsapp-controlled-live/i.test(source), false);
});
