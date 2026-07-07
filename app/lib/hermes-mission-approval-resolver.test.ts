import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MISSION_APPROVAL_UNRESOLVED_REASON,
  resolveMissionApprovalState,
} from "./hermes-mission-approval-resolver.ts";

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
