import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  __resetReplyIntelligenceRegistryForTests,
  clearExpiredReplyIntelligence,
  getRecentReplyIntelligence,
  recordReplyIntelligence,
} from "./reply-intelligence-registry.ts";
import { __resetDemoSchedulingRegistryForTests, getRecentDemoScheduleItems, updateDemoScheduleStatus } from "./demo-scheduling-registry.ts";
import { __resetFollowUpRegistryForTests, getRecentFollowUpCandidates } from "./follow-up-registry.ts";
import type { ReplyIntelligenceItem } from "./reply-intelligence-runtime.ts";

beforeEach(() => {
  __resetReplyIntelligenceRegistryForTests();
  __resetDemoSchedulingRegistryForTests();
  __resetFollowUpRegistryForTests();
});

function buildItem(overrides: Partial<ReplyIntelligenceItem> = {}): ReplyIntelligenceItem {
  return {
    provider: "whatsapp",
    providerMessageId: "wamid.I1",
    missionId: "mission-1",
    leadId: "lead-1",
    intent: "demo_requested",
    confidence: "high",
    urgency: "high",
    founderActionHint: "Demo talebi var — hemen randevu planlayın.",
    reason: "Mesajda demo/tanıtım talebi belirten bir ifade bulundu.",
    textPreview: "Demo görebilir miyiz?",
    analyzedAt: 1000,
    auditType: "reply_intelligence_demo_requested",
    ...overrides,
  };
}

test("registry records and returns recent intelligence, newest first", () => {
  recordReplyIntelligence(buildItem({ providerMessageId: "wamid.FIRST" }), 1000);
  recordReplyIntelligence(buildItem({ providerMessageId: "wamid.SECOND" }), 2000);
  const recent = getRecentReplyIntelligence(10, 2000);
  assert.equal(recent[0].providerMessageId, "wamid.SECOND");
  assert.equal(recent[1].providerMessageId, "wamid.FIRST");
});

test("registry expires items past the 7-day TTL", () => {
  recordReplyIntelligence(buildItem({ providerMessageId: "wamid.OLD" }), 1000);
  const withinTtl = getRecentReplyIntelligence(10, 1000 + 6 * 24 * 60 * 60 * 1000);
  assert.equal(withinTtl.length, 1);
  const pastTtl = getRecentReplyIntelligence(10, 1000 + 8 * 24 * 60 * 60 * 1000);
  assert.equal(pastTtl.length, 0);
});

test("clearExpiredReplyIntelligence evicts expired entries and reports the count", () => {
  recordReplyIntelligence(buildItem({ providerMessageId: "wamid.A" }), 1000);
  recordReplyIntelligence(buildItem({ providerMessageId: "wamid.B" }), 1000);
  const cleared = clearExpiredReplyIntelligence(1000 + 8 * 24 * 60 * 60 * 1000);
  assert.equal(cleared, 2);
  assert.equal(getRecentReplyIntelligence(10, 1000 + 8 * 24 * 60 * 60 * 1000).length, 0);
});

test("stored item shape never includes an internal expiresAt or raw payload field", () => {
  const stored = recordReplyIntelligence(buildItem(), 1000);
  assert.equal("expiresAt" in stored, false);
  assert.equal("rawPayload" in stored, false);
});

/* ── v6.4 Demo Scheduling integration ────────────────────────────── */

test("recording a demo-relevant classification also seeds a Demo Scheduling candidate", () => {
  recordReplyIntelligence(buildItem({ providerMessageId: "wamid.DEMO1", intent: "demo_requested", missionId: "mission-9" }), 1000);
  const demoItems = getRecentDemoScheduleItems(10, 1000);
  assert.equal(demoItems.length, 1);
  assert.equal(demoItems[0].sourceProviderMessageId, "wamid.DEMO1");
  assert.equal(demoItems[0].missionId, "mission-9");
  assert.equal(demoItems[0].status, "demo_requested");
});

test("recording a non-demo-relevant classification (not_interested) does not seed a demo candidate", () => {
  recordReplyIntelligence(buildItem({ providerMessageId: "wamid.NI1", intent: "not_interested" }), 1000);
  assert.equal(getRecentDemoScheduleItems(10, 1000).length, 0);
});

/* ── v6.5 Follow-up integration ──────────────────────────────────── */

test("a hot reply with no scheduled/completed demo item seeds hot_reply_needs_action", () => {
  recordReplyIntelligence(buildItem({ providerMessageId: "wamid.HOT1", missionId: "mission-1", intent: "call_requested" }), 1000);
  const followUps = getRecentFollowUpCandidates(10, 1000);
  const hot = followUps.find((f) => f.reason === "hot_reply_needs_action");
  assert.ok(hot);
  assert.equal(hot?.missionId, "mission-1");
});

test("a hot reply is suppressed from hot_reply_needs_action once its mission has a scheduled/completed demo item", () => {
  // The first hot reply is expected to seed its own hot_reply_needs_action
  // (no demo was on track yet at that point) — that's correct and left alone.
  recordReplyIntelligence(buildItem({ providerMessageId: "wamid.FIRST", missionId: "mission-X", intent: "demo_requested" }), 1000);
  const demoItems = getRecentDemoScheduleItems(10, 1000);
  updateDemoScheduleStatus(demoItems[0].id, "scheduled", undefined, 1000);

  // A second hot reply for the same mission, now that the demo is on track — this one must NOT seed its own hot_reply_needs_action.
  recordReplyIntelligence(buildItem({ providerMessageId: "wamid.SECOND", missionId: "mission-X", intent: "interested" }), 2000);

  const followUps = getRecentFollowUpCandidates(10, 2000);
  const hotForSecondReply = followUps.find((f) => f.reason === "hot_reply_needs_action" && f.sourceProviderMessageId === "wamid.SECOND");
  assert.equal(hotForSecondReply, undefined);
});

test("a later intent seeds a later_requested follow-up candidate", () => {
  recordReplyIntelligence(buildItem({ providerMessageId: "wamid.LATER1", intent: "later", urgency: "medium" }), 1000);
  const followUps = getRecentFollowUpCandidates(10, 1000);
  assert.equal(followUps.length, 1);
  assert.equal(followUps[0].reason, "later_requested");
});

test("not_interested never seeds a follow-up candidate", () => {
  recordReplyIntelligence(buildItem({ providerMessageId: "wamid.NI2", intent: "not_interested", urgency: "low" }), 1000);
  assert.equal(getRecentFollowUpCandidates(10, 1000).length, 0);
});

test("wrong_number never seeds a follow-up candidate, even though its urgency is high (hot)", () => {
  recordReplyIntelligence(buildItem({ providerMessageId: "wamid.WN1", intent: "wrong_number", urgency: "high" }), 1000);
  assert.equal(getRecentFollowUpCandidates(10, 1000).length, 0);
});
