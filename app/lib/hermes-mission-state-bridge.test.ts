import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  __resetMissionStateBridgeForTests,
  clearExpiredMissionStateSnapshots,
  deriveMissionApprovalFromSnapshot,
  getHermesMissionStateSnapshot,
  publishHermesMissionStateSnapshot,
  BRIDGE_BLOCKING_REASONS,
} from "./hermes-mission-state-bridge.ts";

beforeEach(() => {
  __resetMissionStateBridgeForTests();
});

test("missing snapshot returns unresolved/all false via deriveMissionApprovalFromSnapshot", () => {
  const derived = deriveMissionApprovalFromSnapshot(undefined);
  assert.equal(derived.founderApproved, false);
  assert.equal(derived.courierDraftApproved, false);
  assert.equal(derived.deliveryGatewayAllowed, false);
  assert.deepEqual(derived.blockingReasons, []);
});

test("getHermesMissionStateSnapshot returns undefined when nothing was published", () => {
  assert.equal(getHermesMissionStateSnapshot("mission-none"), undefined);
});

test("valid approved/approved/allowed snapshot derives all true", () => {
  const snapshot = publishHermesMissionStateSnapshot({
    missionId: "m1",
    leadId: "l1",
    founderApprovalStatus: "approved",
    courierDraftStatus: "approved",
    deliveryGatewayStatus: "allowed",
    now: 1000,
  });
  const derived = deriveMissionApprovalFromSnapshot(snapshot);
  assert.equal(derived.founderApproved, true);
  assert.equal(derived.courierDraftApproved, true);
  assert.equal(derived.deliveryGatewayAllowed, true);
  assert.deepEqual(derived.blockingReasons, []);
});

test("pending founder status blocks founderApproved only", () => {
  const snapshot = publishHermesMissionStateSnapshot({
    missionId: "m1",
    leadId: "l1",
    founderApprovalStatus: "pending",
    courierDraftStatus: "approved",
    deliveryGatewayStatus: "allowed",
    now: 1000,
  });
  const derived = deriveMissionApprovalFromSnapshot(snapshot);
  assert.equal(derived.founderApproved, false);
  assert.equal(derived.courierDraftApproved, true);
  assert.equal(derived.deliveryGatewayAllowed, true);
  assert.deepEqual(derived.blockingReasons, [BRIDGE_BLOCKING_REASONS.founderNotApproved]);
});

test("draft courier status blocks courierDraftApproved only", () => {
  const snapshot = publishHermesMissionStateSnapshot({
    missionId: "m1",
    leadId: "l1",
    founderApprovalStatus: "approved",
    courierDraftStatus: "draft",
    deliveryGatewayStatus: "allowed",
    now: 1000,
  });
  const derived = deriveMissionApprovalFromSnapshot(snapshot);
  assert.equal(derived.founderApproved, true);
  assert.equal(derived.courierDraftApproved, false);
  assert.equal(derived.deliveryGatewayAllowed, true);
  assert.deepEqual(derived.blockingReasons, [BRIDGE_BLOCKING_REASONS.courierDraftNotApproved]);
});

test("blocked delivery status blocks deliveryGatewayAllowed only", () => {
  const snapshot = publishHermesMissionStateSnapshot({
    missionId: "m1",
    leadId: "l1",
    founderApprovalStatus: "approved",
    courierDraftStatus: "approved",
    deliveryGatewayStatus: "blocked",
    now: 1000,
  });
  const derived = deriveMissionApprovalFromSnapshot(snapshot);
  assert.equal(derived.founderApproved, true);
  assert.equal(derived.courierDraftApproved, true);
  assert.equal(derived.deliveryGatewayAllowed, false);
  assert.deepEqual(derived.blockingReasons, [BRIDGE_BLOCKING_REASONS.deliveryGatewayNotAllowed]);
});

test("expired snapshot is treated as missing — getHermesMissionStateSnapshot returns undefined", () => {
  publishHermesMissionStateSnapshot({
    missionId: "m1",
    leadId: "l1",
    founderApprovalStatus: "approved",
    courierDraftStatus: "approved",
    deliveryGatewayStatus: "allowed",
    now: 1000,
  });
  // TTL is 10 minutes; ask far beyond that.
  const result = getHermesMissionStateSnapshot("m1", 1000 + 11 * 60 * 1000);
  assert.equal(result, undefined);
});

test("clearExpiredMissionStateSnapshots evicts expired entries and reports the count", () => {
  publishHermesMissionStateSnapshot({
    missionId: "m1",
    leadId: "l1",
    founderApprovalStatus: "approved",
    courierDraftStatus: "approved",
    deliveryGatewayStatus: "allowed",
    now: 1000,
  });
  publishHermesMissionStateSnapshot({
    missionId: "m2",
    leadId: "l2",
    founderApprovalStatus: "approved",
    courierDraftStatus: "approved",
    deliveryGatewayStatus: "allowed",
    now: 1000,
  });
  const cleared = clearExpiredMissionStateSnapshots(1000 + 11 * 60 * 1000);
  assert.equal(cleared, 2);
  assert.equal(getHermesMissionStateSnapshot("m1", 1000 + 11 * 60 * 1000), undefined);
  assert.equal(getHermesMissionStateSnapshot("m2", 1000 + 11 * 60 * 1000), undefined);
});

test("snapshot shape never includes messageText or recipientPhone fields", () => {
  const snapshot = publishHermesMissionStateSnapshot({
    missionId: "m1",
    leadId: "l1",
    founderApprovalStatus: "approved",
    courierDraftStatus: "approved",
    deliveryGatewayStatus: "allowed",
    now: 1000,
  });
  assert.equal("messageText" in snapshot, false);
  assert.equal("recipientPhone" in snapshot, false);
  assert.deepEqual(Object.keys(snapshot).sort(), [
    "courierDraftStatus",
    "deliveryGatewayStatus",
    "expiresAt",
    "founderApprovalStatus",
    "leadId",
    "missionId",
    "source",
    "updatedAt",
  ]);
});

test("a later publish for the same missionId overwrites the earlier snapshot", () => {
  publishHermesMissionStateSnapshot({
    missionId: "m1",
    leadId: "l1",
    founderApprovalStatus: "pending",
    courierDraftStatus: "draft",
    deliveryGatewayStatus: "blocked",
    now: 1000,
  });
  publishHermesMissionStateSnapshot({
    missionId: "m1",
    leadId: "l1",
    founderApprovalStatus: "approved",
    courierDraftStatus: "approved",
    deliveryGatewayStatus: "allowed",
    now: 2000,
  });
  const snapshot = getHermesMissionStateSnapshot("m1", 2000);
  assert.equal(snapshot?.founderApprovalStatus, "approved");
  assert.equal(snapshot?.updatedAt, 2000);
});
