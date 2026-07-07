import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDeliveryReceiptAuditEvent,
  maskWhatsAppId,
  normalizeWhatsAppDeliveryStatus,
  parseWhatsAppDeliveryReceipts,
} from "./whatsapp-delivery-receipt-runtime.ts";

function buildPayload(statuses: unknown[]): unknown {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "entry-1",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              statuses,
            },
          },
        ],
      },
    ],
  };
}

test("parses a sent status", () => {
  const receipts = parseWhatsAppDeliveryReceipts(
    buildPayload([{ id: "wamid.SENT1", status: "sent", timestamp: "1700000000", recipient_id: "905551234567" }]),
  );
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].status, "sent");
  assert.equal(receipts[0].auditType, "whatsapp_delivery_sent");
  assert.equal(receipts[0].occurredAt, 1700000000 * 1000);
});

test("parses a delivered status", () => {
  const receipts = parseWhatsAppDeliveryReceipts(
    buildPayload([{ id: "wamid.DELIV1", status: "delivered", timestamp: "1700000001" }]),
  );
  assert.equal(receipts[0].status, "delivered");
  assert.equal(receipts[0].auditType, "whatsapp_delivery_delivered");
});

test("parses a read status", () => {
  const receipts = parseWhatsAppDeliveryReceipts(
    buildPayload([{ id: "wamid.READ1", status: "read", timestamp: "1700000002" }]),
  );
  assert.equal(receipts[0].status, "read");
  assert.equal(receipts[0].auditType, "whatsapp_delivery_read");
});

test("parses a failed status and sanitizes error details", () => {
  const receipts = parseWhatsAppDeliveryReceipts(
    buildPayload([
      {
        id: "wamid.FAIL1",
        status: "failed",
        timestamp: "1700000003",
        errors: [{ code: 131047, title: "Re-engagement message", message: "Message failed to send because more than 24 hours have passed." }],
      },
    ]),
  );
  assert.equal(receipts[0].status, "failed");
  assert.equal(receipts[0].auditType, "whatsapp_delivery_failed");
  assert.equal(receipts[0].errorCodeSafe, 131047);
  assert.equal(receipts[0].errorTypeSafe, "Re-engagement message");
  assert.equal(receipts[0].errorMessageSafe, "Message failed to send because more than 24 hours have passed.");
});

test("unrecognized status string normalizes to unknown", () => {
  const receipts = parseWhatsAppDeliveryReceipts(buildPayload([{ id: "wamid.WEIRD1", status: "deleted" }]));
  assert.equal(receipts[0].status, "unknown");
  assert.equal(receipts[0].auditType, "whatsapp_delivery_unknown");
  assert.equal(receipts[0].rawStatus, "deleted");
});

test("normalizeWhatsAppDeliveryStatus rejects non-string/invalid values", () => {
  assert.equal(normalizeWhatsAppDeliveryStatus("sent"), "sent");
  assert.equal(normalizeWhatsAppDeliveryStatus("delivered"), "delivered");
  assert.equal(normalizeWhatsAppDeliveryStatus("read"), "read");
  assert.equal(normalizeWhatsAppDeliveryStatus("failed"), "failed");
  assert.equal(normalizeWhatsAppDeliveryStatus("bogus"), "unknown");
  assert.equal(normalizeWhatsAppDeliveryStatus(null), "unknown");
  assert.equal(normalizeWhatsAppDeliveryStatus(42), "unknown");
  assert.equal(normalizeWhatsAppDeliveryStatus(undefined), "unknown");
});

test("recipient_id is masked, never returned raw", () => {
  const receipts = parseWhatsAppDeliveryReceipts(
    buildPayload([{ id: "wamid.MASK1", status: "delivered", recipient_id: "905551234567" }]),
  );
  assert.equal(receipts[0].recipientMasked, "••• ••• 67");
  const serialized = JSON.stringify(receipts);
  assert.equal(serialized.includes("905551234567"), false);
});

test("maskWhatsAppId never returns more than the last 2 characters", () => {
  assert.equal(maskWhatsAppId("905551234567"), "••• ••• 67");
  assert.equal(maskWhatsAppId(null), null);
  assert.equal(maskWhatsAppId(undefined), null);
  assert.equal(maskWhatsAppId("  "), null);
});

test("conversation id and pricing category are captured when present", () => {
  const receipts = parseWhatsAppDeliveryReceipts(
    buildPayload([
      {
        id: "wamid.CONV1",
        status: "delivered",
        conversation: { id: "conv-abc-123", origin: { type: "service" } },
        pricing: { billable: true, pricing_model: "CBP", category: "service" },
      },
    ]),
  );
  assert.equal(receipts[0].conversationIdSafe, "conv-abc-123");
  assert.equal(receipts[0].pricingCategorySafe, "service");
});

test("missing conversation/pricing/errors fields default to null, never throw", () => {
  const receipts = parseWhatsAppDeliveryReceipts(buildPayload([{ id: "wamid.MIN1", status: "sent" }]));
  assert.equal(receipts[0].conversationIdSafe, null);
  assert.equal(receipts[0].pricingCategorySafe, null);
  assert.equal(receipts[0].errorCodeSafe, null);
  assert.equal(receipts[0].errorTypeSafe, null);
  assert.equal(receipts[0].errorMessageSafe, null);
});

test("a status entry without an id is skipped, not thrown", () => {
  const receipts = parseWhatsAppDeliveryReceipts(buildPayload([{ status: "sent" }]));
  assert.equal(receipts.length, 0);
});

test("invalid timestamp falls back to Date.now() instead of throwing or producing NaN", () => {
  const before = Date.now();
  const receipts = parseWhatsAppDeliveryReceipts(buildPayload([{ id: "wamid.BADTS", status: "sent", timestamp: "not-a-number" }]));
  const after = Date.now();
  assert.ok(receipts[0].occurredAt >= before && receipts[0].occurredAt <= after);
});

/* ── Malformed payload safety ───────────────────────────────────── */

test("parser never throws on completely malformed payloads", () => {
  assert.deepEqual(parseWhatsAppDeliveryReceipts(null), []);
  assert.deepEqual(parseWhatsAppDeliveryReceipts(undefined), []);
  assert.deepEqual(parseWhatsAppDeliveryReceipts("a string"), []);
  assert.deepEqual(parseWhatsAppDeliveryReceipts(42), []);
  assert.deepEqual(parseWhatsAppDeliveryReceipts([]), []);
  assert.deepEqual(parseWhatsAppDeliveryReceipts({}), []);
  assert.deepEqual(parseWhatsAppDeliveryReceipts({ entry: "not-an-array" }), []);
  assert.deepEqual(parseWhatsAppDeliveryReceipts({ entry: [{ changes: "nope" }] }), []);
  assert.deepEqual(parseWhatsAppDeliveryReceipts({ entry: [{ changes: [{ value: "nope" }] }] }), []);
  assert.deepEqual(parseWhatsAppDeliveryReceipts({ entry: [{ changes: [{ value: { statuses: "nope" } }] }] }), []);
  assert.deepEqual(parseWhatsAppDeliveryReceipts({ entry: [null, 42, "x"] }), []);
});

test("multiple statuses across multiple entries/changes are all collected", () => {
  const payload = {
    entry: [
      { changes: [{ value: { statuses: [{ id: "wamid.A", status: "sent" }] } }] },
      { changes: [{ value: { statuses: [{ id: "wamid.B", status: "delivered" }, { id: "wamid.C", status: "read" }] } }] },
    ],
  };
  const receipts = parseWhatsAppDeliveryReceipts(payload);
  assert.equal(receipts.length, 3);
  assert.deepEqual(receipts.map((r) => r.providerMessageId), ["wamid.A", "wamid.B", "wamid.C"]);
});

test("buildDeliveryReceiptAuditEvent produces a safe, deterministic audit entry", () => {
  const receipts = parseWhatsAppDeliveryReceipts(buildPayload([{ id: "wamid.AUDIT1", status: "delivered", timestamp: "1700000005" }]));
  const event = buildDeliveryReceiptAuditEvent(receipts[0]);
  assert.equal(event.action, "whatsapp_delivery_delivered");
  assert.equal(event.actor, "WhatsApp");
  assert.equal(event.timestamp, 1700000005 * 1000);
  assert.ok(event.details.includes("wamid.AUDIT1"));
  assert.ok(event.details.includes("Teslim Edildi"));
});
