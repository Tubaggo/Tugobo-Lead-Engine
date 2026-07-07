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
    founderApproved: false,
    courierDraftApproved: false,
    deliveryGatewayAllowed: false,
    recipientPhone: null,
    messageText: "",
  });
});

test("parseControlledSendRequestFields never reads or echoes access token / phone number id fields", () => {
  const fields = parseControlledSendRequestFields({
    missionId: "m1",
    leadId: "l1",
    runtimeMode: "controlled_test_live",
    founderApproved: true,
    courierDraftApproved: true,
    deliveryGatewayAllowed: true,
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
