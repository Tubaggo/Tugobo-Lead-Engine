import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { processWhatsAppWebhookEvent } from "./whatsapp-webhook-event-processor.ts";
import { __resetRecentReceiptsForTests } from "./whatsapp-delivery-receipt-processor.ts";
import { __resetProviderMessageRegistryForTests, registerProviderMessageMapping } from "./hermes-provider-message-registry.ts";
import { __resetWhatsAppReplyRegistryForTests } from "./whatsapp-reply-registry.ts";
import { __resetReplyIntelligenceRegistryForTests } from "./reply-intelligence-registry.ts";

beforeEach(() => {
  __resetProviderMessageRegistryForTests();
  __resetRecentReceiptsForTests();
  __resetWhatsAppReplyRegistryForTests();
  __resetReplyIntelligenceRegistryForTests();
});

function buildCombinedPayload(statuses: unknown[], messages: unknown[]): unknown {
  return { entry: [{ changes: [{ value: { statuses, messages } }] }] };
}

test("webhook processor handles statuses and replies present in the same payload", () => {
  const payload = buildCombinedPayload(
    [{ id: "wamid.STATUS1", status: "delivered" }],
    [{ id: "wamid.REPLY1", from: "905551234567", type: "text", text: { body: "Merhaba" } }],
  );
  const result = processWhatsAppWebhookEvent(payload, 1000);
  assert.equal(result.ok, true);
  assert.equal(result.receivedReceiptCount, 1);
  assert.equal(result.receivedReplyCount, 1);
  assert.equal(result.receipts[0].providerMessageId, "wamid.STATUS1");
  assert.equal(result.replies[0].providerMessageId, "wamid.REPLY1");
});

test("webhook processor still handles a statuses-only payload (delivery receipts unaffected)", () => {
  const payload = buildCombinedPayload([{ id: "wamid.STATUSONLY", status: "sent" }], []);
  const result = processWhatsAppWebhookEvent(payload, 1000);
  assert.equal(result.receivedReceiptCount, 1);
  assert.equal(result.receivedReplyCount, 0);
});

test("webhook processor still handles a messages-only payload", () => {
  const payload = buildCombinedPayload([], [{ id: "wamid.MSGONLY", from: "905551234567", type: "text", text: { body: "hi" } }]);
  const result = processWhatsAppWebhookEvent(payload, 1000);
  assert.equal(result.receivedReceiptCount, 0);
  assert.equal(result.receivedReplyCount, 1);
});

test("mapped and unmapped replies are counted correctly via the provider message registry", () => {
  registerProviderMessageMapping({ providerMessageId: "wamid.ORIGINAL1", missionId: "m1", leadId: "l1", recipientMasked: null, now: 1000 });
  const payload = buildCombinedPayload(
    [],
    [
      { id: "wamid.R1", from: "905551111111", type: "text", text: { body: "a" }, context: { id: "wamid.ORIGINAL1" } },
      { id: "wamid.R2", from: "905552222222", type: "text", text: { body: "b" } },
    ],
  );
  const result = processWhatsAppWebhookEvent(payload, 1000);
  assert.equal(result.mappedReplyCount, 1);
  assert.equal(result.unmappedReplyCount, 1);
});

test("a fully malformed payload yields zero receipts and zero replies, never throws", () => {
  const result = processWhatsAppWebhookEvent("not-an-object", 1000);
  assert.equal(result.ok, true);
  assert.equal(result.receivedReceiptCount, 0);
  assert.equal(result.receivedReplyCount, 0);
});
