import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  MISSION_APPROVAL_UNRESOLVED_REASON,
  resolveMissionApprovalState,
} from "./hermes-mission-approval-resolver.ts";
import {
  __resetMissionStateBridgeForTests,
  publishHermesMissionStateSnapshot,
} from "./hermes-mission-state-bridge.ts";

beforeEach(() => {
  __resetMissionStateBridgeForTests();
});

test("unresolved state returns every approval as false", () => {
  const result = resolveMissionApprovalState({ missionId: "m1", leadId: "l1", now: 1000 });
  assert.equal(result.founderApproved, false);
  assert.equal(result.courierDraftApproved, false);
  assert.equal(result.deliveryGatewayAllowed, false);
  assert.equal(result.source, "unresolved");
});

test("unresolved state includes the exact Turkish blocking reason", () => {
  const result = resolveMissionApprovalState({ missionId: "m1", leadId: "l1", now: 1000 });
  assert.deepEqual(result.blockingReasons, [MISSION_APPROVAL_UNRESOLVED_REASON]);
  assert.equal(MISSION_APPROVAL_UNRESOLVED_REASON, "Mission approval state server tarafında çözümlenemedi");
});

test("resolver never grants approval by default, regardless of missionId/leadId shape", () => {
  const cases = [
    { missionId: "", leadId: "" },
    { missionId: "workspace-preflight", leadId: "workspace-preflight" },
    { missionId: "real-mission-123", leadId: "real-lead-456" },
  ];
  for (const input of cases) {
    const result = resolveMissionApprovalState(input);
    assert.equal(result.founderApproved, false, `expected founderApproved false for ${JSON.stringify(input)}`);
    assert.equal(result.courierDraftApproved, false, `expected courierDraftApproved false for ${JSON.stringify(input)}`);
    assert.equal(result.deliveryGatewayAllowed, false, `expected deliveryGatewayAllowed false for ${JSON.stringify(input)}`);
    assert.equal(result.source, "unresolved");
  }
});

test("resolver echoes back the missionId/leadId it was given", () => {
  const result = resolveMissionApprovalState({ missionId: "mission-42", leadId: "lead-7", now: 5000 });
  assert.equal(result.missionId, "mission-42");
  assert.equal(result.leadId, "lead-7");
  assert.equal(result.resolvedAt, 5000);
});

test("resolver defaults resolvedAt to now() when not provided", () => {
  const before = Date.now();
  const result = resolveMissionApprovalState({ missionId: "m1", leadId: "l1" });
  const after = Date.now();
  assert.ok(result.resolvedAt >= before && result.resolvedAt <= after);
});

/* ── v5.1.2: resolves from the mission state bridge when a snapshot exists ── */

test("resolves from the bridge when a fully-approved snapshot exists", () => {
  publishHermesMissionStateSnapshot({
    missionId: "m1",
    leadId: "l1",
    founderApprovalStatus: "approved",
    courierDraftStatus: "approved",
    deliveryGatewayStatus: "allowed",
    now: 1000,
  });
  const result = resolveMissionApprovalState({ missionId: "m1", leadId: "l1", now: 1000 });
  assert.equal(result.source, "mission_state_bridge");
  assert.equal(result.founderApproved, true);
  assert.equal(result.courierDraftApproved, true);
  assert.equal(result.deliveryGatewayAllowed, true);
  assert.deepEqual(result.blockingReasons, []);
});

test("resolves from the bridge but stays blocked when the snapshot is only partially approved", () => {
  publishHermesMissionStateSnapshot({
    missionId: "m1",
    leadId: "l1",
    founderApprovalStatus: "pending",
    courierDraftStatus: "approved",
    deliveryGatewayStatus: "allowed",
    now: 1000,
  });
  const result = resolveMissionApprovalState({ missionId: "m1", leadId: "l1", now: 1000 });
  assert.equal(result.source, "mission_state_bridge");
  assert.equal(result.founderApproved, false);
  assert.ok(result.blockingReasons.length > 0);
});

test("stays unresolved when no snapshot was ever published for this missionId", () => {
  publishHermesMissionStateSnapshot({
    missionId: "some-other-mission",
    leadId: "l1",
    founderApprovalStatus: "approved",
    courierDraftStatus: "approved",
    deliveryGatewayStatus: "allowed",
    now: 1000,
  });
  const result = resolveMissionApprovalState({ missionId: "m1", leadId: "l1", now: 1000 });
  assert.equal(result.source, "unresolved");
  assert.equal(result.founderApproved, false);
});

test("falls back to unresolved once the published snapshot has expired", () => {
  publishHermesMissionStateSnapshot({
    missionId: "m1",
    leadId: "l1",
    founderApprovalStatus: "approved",
    courierDraftStatus: "approved",
    deliveryGatewayStatus: "allowed",
    now: 1000,
  });
  const result = resolveMissionApprovalState({ missionId: "m1", leadId: "l1", now: 1000 + 11 * 60 * 1000 });
  assert.equal(result.source, "unresolved");
  assert.equal(result.founderApproved, false);
  assert.deepEqual(result.blockingReasons, [MISSION_APPROVAL_UNRESOLVED_REASON]);
});
