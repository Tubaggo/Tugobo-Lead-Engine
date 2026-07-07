import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseJsonBodySafely,
  parseMissionStateSnapshotRequestFields,
} from "./hermes-mission-state-snapshot-request.ts";

test("valid snapshot body is accepted with all fields", () => {
  const fields = parseMissionStateSnapshotRequestFields({
    missionId: "m1",
    leadId: "l1",
    founderApprovalStatus: "approved",
    courierDraftStatus: "approved",
    deliveryGatewayStatus: "allowed",
  });
  assert.deepEqual(fields, {
    missionId: "m1",
    leadId: "l1",
    founderApprovalStatus: "approved",
    courierDraftStatus: "approved",
    deliveryGatewayStatus: "allowed",
  });
});

test("omitted status fields default to the safe missing value", () => {
  const fields = parseMissionStateSnapshotRequestFields({ missionId: "m1", leadId: "l1" });
  assert.deepEqual(fields, {
    missionId: "m1",
    leadId: "l1",
    founderApprovalStatus: "missing",
    courierDraftStatus: "missing",
    deliveryGatewayStatus: "missing",
  });
});

test("invalid founderApprovalStatus is rejected (returns null)", () => {
  assert.equal(
    parseMissionStateSnapshotRequestFields({ missionId: "m1", leadId: "l1", founderApprovalStatus: "yes" }),
    null,
  );
});

test("invalid courierDraftStatus is rejected (returns null)", () => {
  assert.equal(
    parseMissionStateSnapshotRequestFields({ missionId: "m1", leadId: "l1", courierDraftStatus: "sent" }),
    null,
  );
});

test("invalid deliveryGatewayStatus is rejected (returns null)", () => {
  assert.equal(
    parseMissionStateSnapshotRequestFields({ missionId: "m1", leadId: "l1", deliveryGatewayStatus: true }),
    null,
  );
});

test("missing missionId or leadId is rejected", () => {
  assert.equal(parseMissionStateSnapshotRequestFields({ leadId: "l1" }), null);
  assert.equal(parseMissionStateSnapshotRequestFields({ missionId: "m1" }), null);
  assert.equal(parseMissionStateSnapshotRequestFields({ missionId: "", leadId: "l1" }), null);
});

test("non-object bodies are rejected", () => {
  assert.equal(parseMissionStateSnapshotRequestFields(null), null);
  assert.equal(parseMissionStateSnapshotRequestFields(42), null);
  assert.equal(parseMissionStateSnapshotRequestFields(["array"]), null);
});

test("client-submitted approval booleans are ignored — never present on the output", () => {
  const fields = parseMissionStateSnapshotRequestFields({
    missionId: "m1",
    leadId: "l1",
    founderApproved: true,
    courierDraftApproved: true,
    deliveryGatewayAllowed: true,
  });
  assert.ok(fields);
  assert.equal("founderApproved" in fields!, false);
  assert.equal("courierDraftApproved" in fields!, false);
  assert.equal("deliveryGatewayAllowed" in fields!, false);
});

test("messageText is ignored — never read, never present on the output", () => {
  const fields = parseMissionStateSnapshotRequestFields({
    missionId: "m1",
    leadId: "l1",
    messageText: "Merhaba, bu gizlice gönderilmeye çalışılan bir mesaj.",
  });
  assert.ok(fields);
  assert.equal("messageText" in fields!, false);
});

test("recipientPhone is ignored — never read, never present on the output", () => {
  const fields = parseMissionStateSnapshotRequestFields({
    missionId: "m1",
    leadId: "l1",
    recipientPhone: "+905551234567",
  });
  assert.ok(fields);
  assert.equal("recipientPhone" in fields!, false);
});

test("provider secrets are ignored — never read, never present on the output", () => {
  const fields = parseMissionStateSnapshotRequestFields({
    missionId: "m1",
    leadId: "l1",
    accessToken: "super-secret-token",
    phoneNumberId: "should-be-ignored",
  });
  assert.ok(fields);
  const serialized = JSON.stringify(fields);
  assert.equal(serialized.includes("super-secret-token"), false);
  assert.equal("accessToken" in fields!, false);
  assert.equal("phoneNumberId" in fields!, false);
});

test("parseJsonBodySafely returns undefined for malformed JSON instead of throwing", () => {
  assert.equal(parseJsonBodySafely("{ not valid json"), undefined);
});
