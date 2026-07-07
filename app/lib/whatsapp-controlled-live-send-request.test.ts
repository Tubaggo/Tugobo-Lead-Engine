import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseControlledSendRequestFields,
  parseJsonBodySafely,
} from "./whatsapp-controlled-live-send-request.ts";

test("parseJsonBodySafely returns undefined for malformed JSON instead of throwing", () => {
  assert.equal(parseJsonBodySafely("{ not valid json"), undefined);
  assert.equal(parseJsonBodySafely(""), undefined);
});

test("parseJsonBodySafely parses valid JSON", () => {
  assert.deepEqual(parseJsonBodySafely('{"a":1}'), { a: 1 });
});

test("parseControlledSendRequestFields returns null for non-object bodies", () => {
  assert.equal(parseControlledSendRequestFields(null), null);
  assert.equal(parseControlledSendRequestFields(42), null);
  assert.equal(parseControlledSendRequestFields("string"), null);
  assert.equal(parseControlledSendRequestFields(["array"]), null);
});

test("parseControlledSendRequestFields fills safe defaults for missing/invalid fields", () => {
  const fields = parseControlledSendRequestFields({});
  assert.deepEqual(fields, {
    missionId: "",
    leadId: "",
    runtimeMode: "dry_run",
    recipientPhone: null,
    messageText: "",
  });
});

test("parseControlledSendRequestFields never reads or echoes access token / phone number id fields", () => {
  const fields = parseControlledSendRequestFields({
    missionId: "m1",
    leadId: "l1",
    runtimeMode: "controlled_test_live",
    recipientPhone: "+905551234567",
    messageText: "Merhaba",
    accessToken: "super-secret-token",
    phoneNumberId: "should-be-ignored",
  });
  assert.ok(fields);
  const serialized = JSON.stringify(fields);
  assert.equal(serialized.includes("super-secret-token"), false);
  assert.equal("accessToken" in fields!, false);
  assert.equal("phoneNumberId" in fields!, false);
});

test("parseControlledSendRequestFields only accepts the literal controlled_test_live runtime mode", () => {
  assert.equal(parseControlledSendRequestFields({ runtimeMode: "controlled_test_live" })?.runtimeMode, "controlled_test_live");
  assert.equal(parseControlledSendRequestFields({ runtimeMode: "something_else" })?.runtimeMode, "dry_run");
  assert.equal(parseControlledSendRequestFields({ runtimeMode: 123 })?.runtimeMode, "dry_run");
});

/* ── v5.1.1 hotfix: client-submitted execution-authority booleans are ignored ── */

test("client-submitted approval booleans are completely ignored — the field doesn't exist on the output", () => {
  const fields = parseControlledSendRequestFields({
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
  assert.deepEqual(Object.keys(fields!).sort(), ["leadId", "messageText", "missionId", "recipientPhone", "runtimeMode"]);
});

test("client-submitted whatsappReadinessStatus is ignored", () => {
  const fields = parseControlledSendRequestFields({ whatsappReadinessStatus: "controlled_live_ready" });
  assert.ok(fields);
  assert.equal("whatsappReadinessStatus" in fields!, false);
});

test("client-submitted liveSendGateAllowed is ignored", () => {
  const fields = parseControlledSendRequestFields({ liveSendGateAllowed: true });
  assert.ok(fields);
  assert.equal("liveSendGateAllowed" in fields!, false);
});

test("client-submitted controlledLivePolicyAllowed is ignored", () => {
  const fields = parseControlledSendRequestFields({ controlledLivePolicyAllowed: true });
  assert.ok(fields);
  assert.equal("controlledLivePolicyAllowed" in fields!, false);
});

test("only safe fields (missionId/leadId/runtimeMode/recipientPhone/messageText) are ever returned, regardless of extra body fields", () => {
  const fields = parseControlledSendRequestFields({
    missionId: "m1",
    leadId: "l1",
    runtimeMode: "controlled_test_live",
    recipientPhone: "+905551234567",
    messageText: "Merhaba",
    founderApproved: true,
    courierDraftApproved: true,
    deliveryGatewayAllowed: true,
    liveSendGateAllowed: true,
    controlledLivePolicyAllowed: true,
    whatsappReadinessStatus: "controlled_live_ready",
    accessToken: "secret",
  });
  assert.deepEqual(fields, {
    missionId: "m1",
    leadId: "l1",
    runtimeMode: "controlled_test_live",
    recipientPhone: "+905551234567",
    messageText: "Merhaba",
  });
});
