import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  __resetFollowUpRegistryForTests,
  clearExpiredFollowUpCandidates,
  getFollowUpCandidate,
  getRecentFollowUpCandidates,
  updateFollowUpStatus,
  upsertFollowUpCandidate,
} from "./follow-up-registry.ts";
import type { FollowUpCandidateInput } from "./follow-up-runtime.ts";

beforeEach(() => {
  __resetFollowUpRegistryForTests();
});

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

test("upsertFollowUpCandidate creates a new candidate keyed deterministically by reason+sourceId", () => {
  const item = upsertFollowUpCandidate(buildInput(), 1000);
  assert.equal(item.id, "followup:read_no_reply:wamid.R1");
  assert.equal(item.status, "candidate");
  assert.equal(getRecentFollowUpCandidates(10, 1000).length, 1);
});

test("duplicate source does not create a duplicate candidate", () => {
  upsertFollowUpCandidate(buildInput({ sourceId: "wamid.DUP" }), 1000);
  upsertFollowUpCandidate(buildInput({ sourceId: "wamid.DUP" }), 2000);
  assert.equal(getRecentFollowUpCandidates(10, 2000).length, 1);
});

test("a duplicate upsert never clobbers a founder-set status on the existing candidate", () => {
  const created = upsertFollowUpCandidate(buildInput({ sourceId: "wamid.KEEP" }), 1000);
  updateFollowUpStatus(created.id, "approved", 1500);
  upsertFollowUpCandidate(buildInput({ sourceId: "wamid.KEEP" }), 2000);
  const item = getFollowUpCandidate(created.id, 2000);
  assert.equal(item?.status, "approved");
});

test("different reasons for the same sourceId never collide", () => {
  upsertFollowUpCandidate(buildInput({ sourceId: "wamid.SAME", reason: "read_no_reply" }), 1000);
  upsertFollowUpCandidate(buildInput({ sourceId: "wamid.SAME", reason: "delivered_no_reply" }), 1000);
  assert.equal(getRecentFollowUpCandidates(10, 1000).length, 2);
});

test("getFollowUpCandidate returns undefined for an unknown id", () => {
  assert.equal(getFollowUpCandidate("followup:never:x", 1000), undefined);
});

test("status update to approval_required works", () => {
  const created = upsertFollowUpCandidate(buildInput({ sourceId: "wamid.AR" }), 1000);
  const updated = updateFollowUpStatus(created.id, "approval_required", 2000);
  assert.equal(updated?.status, "approval_required");
});

test("status update to approved works", () => {
  const created = upsertFollowUpCandidate(buildInput({ sourceId: "wamid.AP" }), 1000);
  const updated = updateFollowUpStatus(created.id, "approved", 2000);
  assert.equal(updated?.status, "approved");
});

test("status update to completed works", () => {
  const created = upsertFollowUpCandidate(buildInput({ sourceId: "wamid.CO" }), 1000);
  const updated = updateFollowUpStatus(created.id, "completed", 2000);
  assert.equal(updated?.status, "completed");
});

test("status update to dismissed works", () => {
  const created = upsertFollowUpCandidate(buildInput({ sourceId: "wamid.DI" }), 1000);
  const updated = updateFollowUpStatus(created.id, "dismissed", 2000);
  assert.equal(updated?.status, "dismissed");
});

test("status update returns null for an unknown id, never throws", () => {
  assert.doesNotThrow(() => updateFollowUpStatus("followup:never:x", "approved", 1000));
  assert.equal(updateFollowUpStatus("followup:never:x", "approved", 1000), null);
});

test("unmapped candidates are still stored safely", () => {
  const item = upsertFollowUpCandidate(buildInput({ sourceId: "wamid.UNMAPPED", missionId: null, leadId: null }), 1000);
  assert.equal(item.missionId, null);
  assert.equal(getRecentFollowUpCandidates(10, 1000).length, 1);
});

test("an active candidate past its 14-day TTL is soft-transitioned to expired, not silently dropped", () => {
  upsertFollowUpCandidate(buildInput({ sourceId: "wamid.OLD" }), 1000);
  const pastTtl = getRecentFollowUpCandidates(10, 1000 + 15 * 24 * 60 * 60 * 1000);
  assert.equal(pastTtl.length, 1);
  assert.equal(pastTtl[0].status, "expired");
});

test("clearExpiredFollowUpCandidates hard-deletes past-TTL entries and reports the count", () => {
  upsertFollowUpCandidate(buildInput({ sourceId: "wamid.A" }), 1000);
  upsertFollowUpCandidate(buildInput({ sourceId: "wamid.B" }), 1000);
  const cleared = clearExpiredFollowUpCandidates(1000 + 15 * 24 * 60 * 60 * 1000);
  assert.equal(cleared, 2);
  assert.equal(getRecentFollowUpCandidates(10, 1000 + 15 * 24 * 60 * 60 * 1000).length, 0);
});

test("getRecentFollowUpCandidates sorts candidates before completed/dismissed items", () => {
  const pending = upsertFollowUpCandidate(buildInput({ sourceId: "wamid.PENDING" }), 1000);
  const done = upsertFollowUpCandidate(buildInput({ sourceId: "wamid.DONE" }), 1000);
  updateFollowUpStatus(done.id, "completed", 1000);

  const recent = getRecentFollowUpCandidates(10, 1000);
  assert.equal(recent[0].id, pending.id);
});
