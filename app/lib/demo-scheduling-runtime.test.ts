import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyDemoStatusUpdate,
  buildDemoSchedulingTimelineEvent,
  deriveDemoPriority,
  deriveDemoScheduleCandidateFromReplyIntelligence,
  deriveDemoSuggestedAction,
  isValidDemoStatusUpdateTarget,
  sortDemoScheduleItems,
  summarizeDemoScheduleItems,
  type DemoScheduleCandidateInput,
  type DemoScheduleItem,
} from "./demo-scheduling-runtime.ts";

function buildInput(overrides: Partial<DemoScheduleCandidateInput> = {}): DemoScheduleCandidateInput {
  return {
    provider: "whatsapp",
    providerMessageId: "wamid.R1",
    missionId: "mission-1",
    leadId: "lead-1",
    intent: "demo_requested",
    ...overrides,
  };
}

/* ── Rule table ─────────────────────────────────────────────────── */

test("demo_requested creates a high-priority demo_requested item", () => {
  const item = deriveDemoScheduleCandidateFromReplyIntelligence(buildInput({ intent: "demo_requested" }), 1000);
  assert.equal(item.status, "demo_requested");
  assert.equal(item.priority, "high");
  assert.equal(item.sourceIntent, "demo_requested");
});

test("call_requested creates a high-priority scheduling_needed item", () => {
  const item = deriveDemoScheduleCandidateFromReplyIntelligence(buildInput({ intent: "call_requested" }), 1000);
  assert.equal(item.status, "scheduling_needed");
  assert.equal(item.priority, "high");
  assert.equal(item.sourceIntent, "call_requested");
});

test("interested creates a medium-priority scheduling_needed item", () => {
  const item = deriveDemoScheduleCandidateFromReplyIntelligence(buildInput({ intent: "interested" }), 1000);
  assert.equal(item.status, "scheduling_needed");
  assert.equal(item.priority, "medium");
  assert.equal(item.sourceIntent, "interested");
});

test("pricing_question creates a medium-priority scheduling_needed item", () => {
  const item = deriveDemoScheduleCandidateFromReplyIntelligence(buildInput({ intent: "pricing_question" }), 1000);
  assert.equal(item.status, "scheduling_needed");
  assert.equal(item.priority, "medium");
  assert.equal(item.sourceIntent, "pricing_question");
});

test("not_interested produces a not_requested, low-priority item (never active)", () => {
  const item = deriveDemoScheduleCandidateFromReplyIntelligence(buildInput({ intent: "not_interested" }), 1000);
  assert.equal(item.status, "not_requested");
  assert.equal(item.priority, "low");
});

test("wrong_number produces a not_requested, low-priority item (never active)", () => {
  const item = deriveDemoScheduleCandidateFromReplyIntelligence(buildInput({ intent: "wrong_number" }), 1000);
  assert.equal(item.status, "not_requested");
  assert.equal(item.priority, "low");
});

test("deriveDemoPriority matches the rule table for every intent", () => {
  assert.equal(deriveDemoPriority({ intent: "demo_requested" }), "high");
  assert.equal(deriveDemoPriority({ intent: "call_requested" }), "high");
  assert.equal(deriveDemoPriority({ intent: "interested" }), "medium");
  assert.equal(deriveDemoPriority({ intent: "pricing_question" }), "medium");
  assert.equal(deriveDemoPriority({ intent: "not_interested" }), "low");
  assert.equal(deriveDemoPriority({ intent: "wrong_number" }), "low");
  assert.equal(deriveDemoPriority({ intent: "later" }), "low");
  assert.equal(deriveDemoPriority({ intent: "human_review_required" }), "low");
  assert.equal(deriveDemoPriority({ intent: "unknown" }), "low");
});

/* ── missing missionId never crashes ───────────────────────────── */

test("a missing missionId never crashes candidate derivation", () => {
  assert.doesNotThrow(() => deriveDemoScheduleCandidateFromReplyIntelligence(buildInput({ missionId: null, leadId: null }), 1000));
  const item = deriveDemoScheduleCandidateFromReplyIntelligence(buildInput({ missionId: null, leadId: null }), 1000);
  assert.equal(item.missionId, null);
  assert.equal(item.leadId, null);
});

/* ── unmapped action hint ───────────────────────────────────────── */

test("an unmapped pending item's suggested action mentions the mapping limitation", () => {
  const item = deriveDemoScheduleCandidateFromReplyIntelligence(buildInput({ intent: "demo_requested", missionId: null, leadId: null }), 1000);
  assert.ok(item.suggestedAction.includes("mission eşleşmedi"));
});

test("a mapped pending item's suggested action does not mention the mapping limitation", () => {
  const item = deriveDemoScheduleCandidateFromReplyIntelligence(buildInput({ intent: "demo_requested" }), 1000);
  assert.equal(item.suggestedAction.includes("mission eşleşmedi"), false);
});

test("an unmapped but inactive item (not_requested) does not use the mapping-limitation hint", () => {
  const item = deriveDemoScheduleCandidateFromReplyIntelligence(buildInput({ intent: "not_interested", missionId: null, leadId: null }), 1000);
  assert.equal(item.suggestedAction.includes("mission eşleşmedi"), false);
});

/* ── deriveDemoSuggestedAction directly ────────────────────────── */

test("deriveDemoSuggestedAction returns the plan-a-demo hint for pending, mapped items", () => {
  assert.equal(deriveDemoSuggestedAction({ status: "demo_requested", missionId: "m1" }), "Demo zamanı planla");
  assert.equal(deriveDemoSuggestedAction({ status: "scheduling_needed", missionId: "m1" }), "Demo zamanı planla");
});

/* ── status update targets ─────────────────────────────────────── */

test("isValidDemoStatusUpdateTarget accepts only the four allowed targets", () => {
  assert.equal(isValidDemoStatusUpdateTarget("scheduled"), true);
  assert.equal(isValidDemoStatusUpdateTarget("completed"), true);
  assert.equal(isValidDemoStatusUpdateTarget("cancelled"), true);
  assert.equal(isValidDemoStatusUpdateTarget("no_show"), true);
  assert.equal(isValidDemoStatusUpdateTarget("demo_requested"), false);
  assert.equal(isValidDemoStatusUpdateTarget("not_requested"), false);
  assert.equal(isValidDemoStatusUpdateTarget("anything"), false);
  assert.equal(isValidDemoStatusUpdateTarget(null), false);
  assert.equal(isValidDemoStatusUpdateTarget(42), false);
});

test("applyDemoStatusUpdate to scheduled sets scheduledAt and refreshes the action hint", () => {
  const item = deriveDemoScheduleCandidateFromReplyIntelligence(buildInput({ intent: "demo_requested" }), 1000);
  const updated = applyDemoStatusUpdate(item, "scheduled", undefined, 2000);
  assert.equal(updated.status, "scheduled");
  assert.equal(updated.scheduledAt, 2000);
  assert.equal(updated.suggestedAction, "Planlanan demo zamanını takip edin");
  assert.equal(updated.updatedAt, 2000);
});

test("applyDemoStatusUpdate to scheduled honors an explicit scheduledAt from metadata", () => {
  const item = deriveDemoScheduleCandidateFromReplyIntelligence(buildInput({ intent: "demo_requested" }), 1000);
  const updated = applyDemoStatusUpdate(item, "scheduled", { scheduledAt: 5000 }, 2000);
  assert.equal(updated.scheduledAt, 5000);
});

test("applyDemoStatusUpdate to completed sets completedAt", () => {
  const item = deriveDemoScheduleCandidateFromReplyIntelligence(buildInput({ intent: "demo_requested" }), 1000);
  const updated = applyDemoStatusUpdate(item, "completed", undefined, 3000);
  assert.equal(updated.status, "completed");
  assert.equal(updated.completedAt, 3000);
});

test("applyDemoStatusUpdate to cancelled sets cancelledAt", () => {
  const item = deriveDemoScheduleCandidateFromReplyIntelligence(buildInput({ intent: "demo_requested" }), 1000);
  const updated = applyDemoStatusUpdate(item, "cancelled", undefined, 4000);
  assert.equal(updated.status, "cancelled");
  assert.equal(updated.cancelledAt, 4000);
});

test("applyDemoStatusUpdate to no_show updates status without requiring a new timestamp field", () => {
  const item = deriveDemoScheduleCandidateFromReplyIntelligence(buildInput({ intent: "demo_requested" }), 1000);
  const updated = applyDemoStatusUpdate(item, "no_show", undefined, 4000);
  assert.equal(updated.status, "no_show");
  assert.equal(updated.updatedAt, 4000);
});

/* ── Audit events ───────────────────────────────────────────────── */

test("buildDemoSchedulingTimelineEvent produces a safe event for every audit type", () => {
  const item = deriveDemoScheduleCandidateFromReplyIntelligence(buildInput({ intent: "demo_requested" }), 1000);
  const created = buildDemoSchedulingTimelineEvent(item, "demo_scheduling_candidate_created", 1000);
  assert.equal(created.actor, "Hermes");
  assert.ok(created.details.includes("mission-1"));

  const scheduled = buildDemoSchedulingTimelineEvent(item, "demo_scheduling_status_scheduled", 2000);
  assert.equal(scheduled.actor, "Founder");

  for (const type of [
    "demo_scheduling_status_scheduled",
    "demo_scheduling_status_completed",
    "demo_scheduling_status_cancelled",
    "demo_scheduling_status_no_show",
  ] as const) {
    const event = buildDemoSchedulingTimelineEvent(item, type, 1000);
    assert.equal(event.action, type);
  }
});

/* ── Summary ────────────────────────────────────────────────────── */

test("summarizeDemoScheduleItems counts every status bucket", () => {
  const items: DemoScheduleItem[] = [
    deriveDemoScheduleCandidateFromReplyIntelligence(buildInput({ providerMessageId: "wamid.1", intent: "demo_requested" }), 1000),
    deriveDemoScheduleCandidateFromReplyIntelligence(buildInput({ providerMessageId: "wamid.2", intent: "call_requested" }), 1000),
    applyDemoStatusUpdate(
      deriveDemoScheduleCandidateFromReplyIntelligence(buildInput({ providerMessageId: "wamid.3", intent: "demo_requested" }), 1000),
      "scheduled",
      undefined,
      1000,
    ),
    applyDemoStatusUpdate(
      deriveDemoScheduleCandidateFromReplyIntelligence(buildInput({ providerMessageId: "wamid.4", intent: "demo_requested" }), 1000),
      "completed",
      undefined,
      1000,
    ),
    applyDemoStatusUpdate(
      deriveDemoScheduleCandidateFromReplyIntelligence(buildInput({ providerMessageId: "wamid.5", intent: "demo_requested" }), 1000),
      "cancelled",
      undefined,
      1000,
    ),
    applyDemoStatusUpdate(
      deriveDemoScheduleCandidateFromReplyIntelligence(buildInput({ providerMessageId: "wamid.6", intent: "demo_requested" }), 1000),
      "no_show",
      undefined,
      1000,
    ),
  ];
  const summary = summarizeDemoScheduleItems(items);
  assert.equal(summary.total, 6);
  assert.equal(summary.demoRequested, 1);
  assert.equal(summary.schedulingNeeded, 1);
  assert.equal(summary.scheduled, 1);
  assert.equal(summary.completed, 1);
  assert.equal(summary.cancelled, 1);
  assert.equal(summary.noShow, 1);
});

/* ── Sorting ────────────────────────────────────────────────────── */

test("sortDemoScheduleItems prioritizes pending demos over scheduled/completed/cancelled", () => {
  const completed = applyDemoStatusUpdate(
    deriveDemoScheduleCandidateFromReplyIntelligence(buildInput({ providerMessageId: "wamid.DONE", intent: "demo_requested" }), 1000),
    "completed",
    undefined,
    1000,
  );
  const scheduled = applyDemoStatusUpdate(
    deriveDemoScheduleCandidateFromReplyIntelligence(buildInput({ providerMessageId: "wamid.SCHED", intent: "demo_requested" }), 1000),
    "scheduled",
    undefined,
    1000,
  );
  const pendingMedium = deriveDemoScheduleCandidateFromReplyIntelligence(buildInput({ providerMessageId: "wamid.MED", intent: "interested" }), 1000);
  const pendingHigh = deriveDemoScheduleCandidateFromReplyIntelligence(buildInput({ providerMessageId: "wamid.HIGH", intent: "demo_requested" }), 1000);

  const sorted = sortDemoScheduleItems([completed, scheduled, pendingMedium, pendingHigh]);
  assert.deepEqual(
    sorted.map((i) => i.sourceProviderMessageId),
    ["wamid.HIGH", "wamid.MED", "wamid.SCHED", "wamid.DONE"],
  );
});

test("sortDemoScheduleItems never mutates the input array", () => {
  const items = [deriveDemoScheduleCandidateFromReplyIntelligence(buildInput(), 1000)];
  const original = [...items];
  sortDemoScheduleItems(items);
  assert.deepEqual(items, original);
});

/* ── Safety ─────────────────────────────────────────────────────── */

test("a derived demo item never includes a raw phone or full reply body field", () => {
  const item = deriveDemoScheduleCandidateFromReplyIntelligence(buildInput(), 1000);
  const serialized = JSON.stringify(item);
  assert.equal(serialized.includes("905551234567"), false);
  assert.equal("textPreview" in item, false);
  assert.equal("fromMasked" in item, false);
  assert.equal("accessToken" in item, false);
});
