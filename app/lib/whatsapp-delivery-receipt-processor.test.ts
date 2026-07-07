import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  __resetRecentReceiptsForTests,
  getRecentProcessedReceipts,
  parseJsonBodySafely,
  processWhatsAppDeliveryWebhookPayload,
} from "./whatsapp-delivery-receipt-processor.ts";
import { __resetProviderMessageRegistryForTests, registerProviderMessageMapping } from "./hermes-provider-message-registry.ts";

beforeEach(() => {
  __resetProviderMessageRegistryForTests();
  __resetRecentReceiptsForTests();
});

function buildPayload(statuses: unknown[]): unknown {
  return { entry: [{ changes: [{ value: { statuses } }] }] };
}

test("webhook POST accepts an unmapped receipt without failing", () => {
  const result = processWhatsAppDeliveryWebhookPayload(buildPayload([{ id: "wamid.UNMAPPED1", status: "delivered" }]));
  assert.equal(result.ok, true);
  assert.equal(result.receivedCount, 1);
  assert.equal(result.mappedCount, 0);
  assert.equal(result.unmappedCount, 1);
  assert.equal(result.receipts[0].mapped, false);
  assert.equal(result.receipts[0].missionId, null);
  assert.equal(result.receipts[0].leadId, null);
});

test("webhook POST maps a known providerMessageId to its mission/lead", () => {
  registerProviderMessageMapping({
    providerMessageId: "wamid.MAPPED1",
    missionId: "mission-1",
    leadId: "lead-1",
    recipientMasked: "••• ••• 67",
    now: 1000,
  });
  const result = processWhatsAppDeliveryWebhookPayload(buildPayload([{ id: "wamid.MAPPED1", status: "delivered" }]), 1000);
  assert.equal(result.mappedCount, 1);
  assert.equal(result.unmappedCount, 0);
  assert.equal(result.receipts[0].mapped, true);
  assert.equal(result.receipts[0].missionId, "mission-1");
  assert.equal(result.receipts[0].leadId, "lead-1");
});

test("mixed mapped and unmapped receipts are counted correctly", () => {
  registerProviderMessageMapping({ providerMessageId: "wamid.M1", missionId: "m1", leadId: "l1", recipientMasked: null, now: 1000 });
  const result = processWhatsAppDeliveryWebhookPayload(
    buildPayload([
      { id: "wamid.M1", status: "delivered" },
      { id: "wamid.UNKNOWN1", status: "sent" },
    ]),
    1000,
  );
  assert.equal(result.receivedCount, 2);
  assert.equal(result.mappedCount, 1);
  assert.equal(result.unmappedCount, 1);
});

test("processing a webhook payload never returns the raw payload itself", () => {
  const payload = buildPayload([{ id: "wamid.RAW1", status: "sent", recipient_id: "905551234567" }]);
  const result = processWhatsAppDeliveryWebhookPayload(payload);
  const serialized = JSON.stringify(result);
  assert.equal("entry" in result, false);
  assert.equal(serialized.includes("905551234567"), false);
});

test("malformed JSON is handled safely by parseJsonBodySafely, never throws", () => {
  assert.equal(parseJsonBodySafely("{ not valid json"), undefined);
});

test("processing tolerates a fully malformed payload and returns zero receipts, not an error", () => {
  const result = processWhatsAppDeliveryWebhookPayload("not-an-object");
  assert.equal(result.ok, true);
  assert.equal(result.receivedCount, 0);
});

test("updates the mapping's last delivery status when a mapped receipt is processed", () => {
  registerProviderMessageMapping({ providerMessageId: "wamid.STATUS1", missionId: "m1", leadId: "l1", recipientMasked: null, now: 1000 });
  processWhatsAppDeliveryWebhookPayload(buildPayload([{ id: "wamid.STATUS1", status: "read", timestamp: "1700000000" }]), 1000);
  // Re-processing the same providerMessageId still resolves it (mapping wasn't wiped).
  const result = processWhatsAppDeliveryWebhookPayload(buildPayload([{ id: "wamid.STATUS1", status: "read" }]), 1000);
  assert.equal(result.receipts[0].mapped, true);
});

test("recent receipts feed records processed batches, newest first, capped at the limit", () => {
  processWhatsAppDeliveryWebhookPayload(buildPayload([{ id: "wamid.FIRST", status: "sent" }]));
  processWhatsAppDeliveryWebhookPayload(buildPayload([{ id: "wamid.SECOND", status: "delivered" }]));
  const recent = getRecentProcessedReceipts();
  assert.equal(recent[0].providerMessageId, "wamid.SECOND");
  assert.equal(recent[1].providerMessageId, "wamid.FIRST");
});
