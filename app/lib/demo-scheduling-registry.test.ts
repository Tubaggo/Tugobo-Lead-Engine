import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  __resetDemoSchedulingRegistryForTests,
  clearExpiredDemoScheduleItems,
  getDemoScheduleItem,
  getRecentDemoScheduleItems,
  updateDemoScheduleStatus,
  upsertDemoScheduleItem,
} from "./demo-scheduling-registry.ts";
import type { DemoScheduleCandidateInput } from "./demo-scheduling-runtime.ts";
import { __resetFollowUpRegistryForTests, getRecentFollowUpCandidates } from "./follow-up-registry.ts";

beforeEach(() => {
  __resetDemoSchedulingRegistryForTests();
  __resetFollowUpRegistryForTests();
});

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

test("upsertDemoScheduleItem creates a new item keyed by providerMessageId", () => {
  const item = upsertDemoScheduleItem(buildInput(), 1000);
  assert.equal(item.id, "demo:wamid.R1");
  assert.equal(item.status, "demo_requested");
  const recent = getRecentDemoScheduleItems(10, 1000);
  assert.equal(recent.length, 1);
});

test("duplicate providerMessageId does not create a duplicate item", () => {
  upsertDemoScheduleItem(buildInput({ providerMessageId: "wamid.DUP" }), 1000);
  upsertDemoScheduleItem(buildInput({ providerMessageId: "wamid.DUP" }), 2000);
  const recent = getRecentDemoScheduleItems(10, 2000);
  assert.equal(recent.length, 1);
});

test("a duplicate upsert never clobbers a founder-set status on the existing item", () => {
  upsertDemoScheduleItem(buildInput({ providerMessageId: "wamid.KEEP" }), 1000);
  updateDemoScheduleStatus("demo:wamid.KEEP", "scheduled", undefined, 1500);
  upsertDemoScheduleItem(buildInput({ providerMessageId: "wamid.KEEP" }), 2000);
  const item = getDemoScheduleItem("demo:wamid.KEEP", 2000);
  assert.equal(item?.status, "scheduled");
});

test("getDemoScheduleItem returns undefined for an unknown id", () => {
  assert.equal(getDemoScheduleItem("demo:never", 1000), undefined);
});

test("status update to scheduled works", () => {
  upsertDemoScheduleItem(buildInput({ providerMessageId: "wamid.SCHED" }), 1000);
  const updated = updateDemoScheduleStatus("demo:wamid.SCHED", "scheduled", { scheduledAt: 5000 }, 2000);
  assert.equal(updated?.status, "scheduled");
  assert.equal(updated?.scheduledAt, 5000);
});

test("status update to completed works", () => {
  upsertDemoScheduleItem(buildInput({ providerMessageId: "wamid.DONE" }), 1000);
  const updated = updateDemoScheduleStatus("demo:wamid.DONE", "completed", undefined, 2000);
  assert.equal(updated?.status, "completed");
  assert.equal(updated?.completedAt, 2000);
});

test("status update returns null for an unknown id, never throws", () => {
  assert.doesNotThrow(() => updateDemoScheduleStatus("demo:never", "scheduled", undefined, 1000));
  assert.equal(updateDemoScheduleStatus("demo:never", "scheduled", undefined, 1000), null);
});

test("registry expires items past the 14-day TTL", () => {
  upsertDemoScheduleItem(buildInput({ providerMessageId: "wamid.OLD" }), 1000);
  const withinTtl = getRecentDemoScheduleItems(10, 1000 + 13 * 24 * 60 * 60 * 1000);
  assert.equal(withinTtl.length, 1);
  const pastTtl = getRecentDemoScheduleItems(10, 1000 + 15 * 24 * 60 * 60 * 1000);
  assert.equal(pastTtl.length, 0);
});

test("clearExpiredDemoScheduleItems evicts expired entries and reports the count", () => {
  upsertDemoScheduleItem(buildInput({ providerMessageId: "wamid.A" }), 1000);
  upsertDemoScheduleItem(buildInput({ providerMessageId: "wamid.B" }), 1000);
  const cleared = clearExpiredDemoScheduleItems(1000 + 15 * 24 * 60 * 60 * 1000);
  assert.equal(cleared, 2);
});

test("unmapped candidates are still stored safely", () => {
  const item = upsertDemoScheduleItem(buildInput({ providerMessageId: "wamid.UNMAPPED", missionId: null, leadId: null }), 1000);
  assert.equal(item.missionId, null);
  const recent = getRecentDemoScheduleItems(10, 1000);
  assert.equal(recent.length, 1);
  assert.equal(recent[0].missionId, null);
});

test("getRecentDemoScheduleItems returns pending items sorted before completed/cancelled ones", () => {
  upsertDemoScheduleItem(buildInput({ providerMessageId: "wamid.PENDING", intent: "demo_requested" }), 1000);
  upsertDemoScheduleItem(buildInput({ providerMessageId: "wamid.SCHED", intent: "demo_requested" }), 1000);
  updateDemoScheduleStatus("demo:wamid.SCHED", "completed", undefined, 1000);

  const recent = getRecentDemoScheduleItems(10, 1000);
  assert.equal(recent[0].sourceProviderMessageId, "wamid.PENDING");
});

/* ── v6.5 Follow-up integration ──────────────────────────────────── */

test("a freshly created demo_requested item seeds a demo_not_scheduled follow-up candidate", () => {
  upsertDemoScheduleItem(buildInput({ providerMessageId: "wamid.DNS1", intent: "demo_requested" }), 1000);
  const followUps = getRecentFollowUpCandidates(10, 1000);
  const demoNotScheduled = followUps.find((f) => f.reason === "demo_not_scheduled");
  assert.ok(demoNotScheduled);
  assert.equal(demoNotScheduled?.missionId, "mission-1");
});

test("a freshly created scheduling_needed item also seeds a demo_not_scheduled follow-up candidate", () => {
  upsertDemoScheduleItem(buildInput({ providerMessageId: "wamid.DNS2", intent: "interested" }), 1000);
  const followUps = getRecentFollowUpCandidates(10, 1000);
  assert.ok(followUps.some((f) => f.reason === "demo_not_scheduled"));
});

test("an item that resolves to not_requested (not_interested/wrong_number) never seeds a demo_not_scheduled follow-up", () => {
  upsertDemoScheduleItem(buildInput({ providerMessageId: "wamid.NR1", intent: "not_interested" }), 1000);
  assert.equal(getRecentFollowUpCandidates(10, 1000).length, 0);
});

test("transitioning a demo item to no_show seeds a demo_no_show follow-up candidate", () => {
  upsertDemoScheduleItem(buildInput({ providerMessageId: "wamid.NOSHOW1", intent: "demo_requested" }), 1000);
  updateDemoScheduleStatus("demo:wamid.NOSHOW1", "no_show", undefined, 2000);
  const followUps = getRecentFollowUpCandidates(10, 2000);
  const noShow = followUps.find((f) => f.reason === "demo_no_show");
  assert.ok(noShow);
});
