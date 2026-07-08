import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  __resetRecentReceiptsForTests,
  getRecentProcessedReceipts,
  parseJsonBodySafely,
  processWhatsAppDeliveryWebhookPayload,
} from "./whatsapp-delivery-receipt-processor.ts";
import { __resetProviderMessageRegistryForTests, registerProviderMessageMapping } from "./hermes-provider-message-registry.ts";
import { __resetWhatsAppReplyRegistryForTests, recordWhatsAppReply } from "./whatsapp-reply-registry.ts";
import { __resetReplyIntelligenceRegistryForTests } from "./reply-intelligence-registry.ts";
import { __resetDemoSchedulingRegistryForTests } from "./demo-scheduling-registry.ts";
import { __resetFollowUpRegistryForTests, getRecentFollowUpCandidates } from "./follow-up-registry.ts";
import type { WhatsAppInboundReply } from "./whatsapp-reply-listener-runtime.ts";

beforeEach(() => {
  __resetProviderMessageRegistryForTests();
  __resetRecentReceiptsForTests();
  __resetWhatsAppReplyRegistryForTests();
  __resetReplyIntelligenceRegistryForTests();
  __resetDemoSchedulingRegistryForTests();
  __resetFollowUpRegistryForTests();
});

function buildReply(overrides: Partial<WhatsAppInboundReply> = {}): WhatsAppInboundReply {
  return {
    provider: "whatsapp",
    providerMessageId: "wamid.REPLY1",
    fromMasked: "••• ••• 67",
    fromWaIdMasked: "••• ••• 67",
    messageType: "text",
    textPreview: "Merhaba",
    rawType: "text",
    occurredAt: 1000,
    conversationIdSafe: null,
    contactProfileNameSafe: null,
    auditType: "whatsapp_reply_received",
    ...overrides,
  };
}

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

/* ── v6.5 Follow-up integration ──────────────────────────────────── */

test("a read receipt seeds a read_no_reply follow-up candidate", () => {
  registerProviderMessageMapping({ providerMessageId: "wamid.READ1", missionId: "m1", leadId: "l1", recipientMasked: null, now: 1000 });
  processWhatsAppDeliveryWebhookPayload(buildPayload([{ id: "wamid.READ1", status: "read" }]), 1000);
  const followUps = getRecentFollowUpCandidates(10, 1000);
  assert.equal(followUps.length, 1);
  assert.equal(followUps[0].reason, "read_no_reply");
  assert.equal(followUps[0].missionId, "m1");
});

test("a delivered receipt seeds a delivered_no_reply follow-up candidate", () => {
  registerProviderMessageMapping({ providerMessageId: "wamid.DELIV1", missionId: "m1", leadId: "l1", recipientMasked: null, now: 1000 });
  processWhatsAppDeliveryWebhookPayload(buildPayload([{ id: "wamid.DELIV1", status: "delivered" }]), 1000);
  const followUps = getRecentFollowUpCandidates(10, 1000);
  assert.equal(followUps[0].reason, "delivered_no_reply");
});

test("a failed receipt always seeds a failed_delivery_recovery follow-up candidate", () => {
  registerProviderMessageMapping({ providerMessageId: "wamid.FAIL1", missionId: "m1", leadId: "l1", recipientMasked: null, now: 1000 });
  processWhatsAppDeliveryWebhookPayload(buildPayload([{ id: "wamid.FAIL1", status: "failed" }]), 1000);
  const followUps = getRecentFollowUpCandidates(10, 1000);
  assert.equal(followUps[0].reason, "failed_delivery_recovery");
});

test("read/delivered receipts do not seed a follow-up when a reply already exists for the mission", () => {
  registerProviderMessageMapping({ providerMessageId: "wamid.READ2", missionId: "m2", leadId: "l2", recipientMasked: null, now: 1000 });
  registerProviderMessageMapping({ providerMessageId: "wamid.ORIGINAL_M2", missionId: "m2", leadId: "l2", recipientMasked: null, now: 1000 });
  // A reply is attributed to mission "m2" via conversationIdSafe (the quoted wamid), not a direct missionId field.
  recordWhatsAppReply(buildReply({ providerMessageId: "wamid.EXISTING", conversationIdSafe: "wamid.ORIGINAL_M2" }), 1000);
  processWhatsAppDeliveryWebhookPayload(buildPayload([{ id: "wamid.READ2", status: "read" }]), 1000);
  assert.equal(getRecentFollowUpCandidates(10, 1000).length, 0);
});

test("an unmapped receipt (no reliable correlation) still seeds a conservative follow-up candidate", () => {
  processWhatsAppDeliveryWebhookPayload(buildPayload([{ id: "wamid.UNMAPPED2", status: "read" }]), 1000);
  const followUps = getRecentFollowUpCandidates(10, 1000);
  assert.equal(followUps.length, 1);
  assert.equal(followUps[0].missionId, null);
});

test("a sent receipt does not seed any follow-up candidate", () => {
  registerProviderMessageMapping({ providerMessageId: "wamid.SENT1", missionId: "m1", leadId: "l1", recipientMasked: null, now: 1000 });
  processWhatsAppDeliveryWebhookPayload(buildPayload([{ id: "wamid.SENT1", status: "sent" }]), 1000);
  assert.equal(getRecentFollowUpCandidates(10, 1000).length, 0);
});
