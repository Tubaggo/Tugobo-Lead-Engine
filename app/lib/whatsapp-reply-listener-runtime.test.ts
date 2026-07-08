import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildWhatsAppReplyAuditEvent,
  maskWhatsAppSender,
  normalizeWhatsAppInboundMessageType,
  parseWhatsAppInboundReplies,
} from "./whatsapp-reply-listener-runtime.ts";

function buildPayload(messages: unknown[], contacts: unknown[] = []): unknown {
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
              contacts,
              messages,
            },
          },
        ],
      },
    ],
  };
}

test("parser extracts a text message", () => {
  const replies = parseWhatsAppInboundReplies(
    buildPayload([{ id: "wamid.TXT1", from: "905551234567", timestamp: "1700000000", type: "text", text: { body: "Merhaba, fiyat bilgisi alabilir miyim?" } }]),
  );
  assert.equal(replies.length, 1);
  assert.equal(replies[0].messageType, "text");
  assert.equal(replies[0].textPreview, "Merhaba, fiyat bilgisi alabilir miyim?");
  assert.equal(replies[0].auditType, "whatsapp_reply_received");
  assert.equal(replies[0].occurredAt, 1700000000 * 1000);
});

test("parser extracts a button reply", () => {
  const replies = parseWhatsAppInboundReplies(
    buildPayload([{ id: "wamid.BTN1", from: "905551234567", type: "button", button: { text: "Evet, ilgileniyorum", payload: "yes" } }]),
  );
  assert.equal(replies[0].messageType, "button");
  assert.equal(replies[0].textPreview, "Evet, ilgileniyorum");
  assert.equal(replies[0].auditType, "whatsapp_reply_received");
});

test("parser extracts an interactive button_reply", () => {
  const replies = parseWhatsAppInboundReplies(
    buildPayload([
      {
        id: "wamid.INT1",
        from: "905551234567",
        type: "interactive",
        interactive: { type: "button_reply", button_reply: { id: "opt-1", title: "Demo istiyorum" } },
      },
    ]),
  );
  assert.equal(replies[0].messageType, "interactive");
  assert.equal(replies[0].textPreview, "Demo istiyorum");
});

test("parser extracts an interactive list_reply", () => {
  const replies = parseWhatsAppInboundReplies(
    buildPayload([
      {
        id: "wamid.INT2",
        from: "905551234567",
        type: "interactive",
        interactive: { type: "list_reply", list_reply: { id: "opt-2", title: "Fiyat listesi" } },
      },
    ]),
  );
  assert.equal(replies[0].textPreview, "Fiyat listesi");
});

test("an unrecognized type becomes unknown", () => {
  const replies = parseWhatsAppInboundReplies(buildPayload([{ id: "wamid.IMG1", from: "905551234567", type: "image", image: { id: "media-1" } }]));
  assert.equal(replies[0].messageType, "unknown");
  assert.equal(replies[0].rawType, "image");
  assert.equal(replies[0].auditType, "whatsapp_reply_unknown_type");
  assert.equal(replies[0].textPreview, null);
});

test("normalizeWhatsAppInboundMessageType rejects anything outside the supported set", () => {
  assert.equal(normalizeWhatsAppInboundMessageType("text"), "text");
  assert.equal(normalizeWhatsAppInboundMessageType("button"), "button");
  assert.equal(normalizeWhatsAppInboundMessageType("interactive"), "interactive");
  assert.equal(normalizeWhatsAppInboundMessageType("image"), "unknown");
  assert.equal(normalizeWhatsAppInboundMessageType(null), "unknown");
  assert.equal(normalizeWhatsAppInboundMessageType(undefined), "unknown");
  assert.equal(normalizeWhatsAppInboundMessageType(42), "unknown");
});

test("malformed payloads never throw and yield an empty array", () => {
  assert.deepEqual(parseWhatsAppInboundReplies(null), []);
  assert.deepEqual(parseWhatsAppInboundReplies(undefined), []);
  assert.deepEqual(parseWhatsAppInboundReplies("a string"), []);
  assert.deepEqual(parseWhatsAppInboundReplies(42), []);
  assert.deepEqual(parseWhatsAppInboundReplies([]), []);
  assert.deepEqual(parseWhatsAppInboundReplies({}), []);
  assert.deepEqual(parseWhatsAppInboundReplies({ entry: "not-an-array" }), []);
  assert.deepEqual(parseWhatsAppInboundReplies({ entry: [{ changes: "nope" }] }), []);
  assert.deepEqual(parseWhatsAppInboundReplies({ entry: [{ changes: [{ value: "nope" }] }] }), []);
  assert.deepEqual(parseWhatsAppInboundReplies({ entry: [{ changes: [{ value: { messages: "nope" } }] }] }), []);
  assert.deepEqual(parseWhatsAppInboundReplies({ entry: [null, 42, "x"] }), []);
});

test("a message entry without an id is skipped, not thrown", () => {
  const replies = parseWhatsAppInboundReplies(buildPayload([{ from: "905551234567", type: "text", text: { body: "hi" } }]));
  assert.equal(replies.length, 0);
});

test("textPreview is truncated to 160 characters and the raw longer text never appears", () => {
  const longText = "A".repeat(400);
  const replies = parseWhatsAppInboundReplies(buildPayload([{ id: "wamid.LONG1", from: "905551234567", type: "text", text: { body: longText } }]));
  assert.equal(replies[0].textPreview?.length, 160);
  const serialized = JSON.stringify(replies);
  assert.equal(serialized.includes(longText), false);
});

test("sender is masked — maskWhatsAppSender never returns more than the last 2 characters", () => {
  assert.equal(maskWhatsAppSender("905551234567"), "••• ••• 67");
  assert.equal(maskWhatsAppSender(null), null);
  assert.equal(maskWhatsAppSender(undefined), null);
  assert.equal(maskWhatsAppSender("  "), null);
});

test("raw phone number never appears anywhere in a serialized reply", () => {
  const replies = parseWhatsAppInboundReplies(
    buildPayload(
      [{ id: "wamid.PHONE1", from: "905551234567", type: "text", text: { body: "test" } }],
      [{ wa_id: "905551234567", profile: { name: "Ahmet" } }],
    ),
  );
  assert.equal(replies[0].fromMasked, "••• ••• 67");
  assert.equal(replies[0].fromWaIdMasked, "••• ••• 67");
  const serialized = JSON.stringify(replies);
  assert.equal(serialized.includes("905551234567"), false);
});

test("contact profile name and context id are captured when present", () => {
  const replies = parseWhatsAppInboundReplies(
    buildPayload(
      [{ id: "wamid.CTX1", from: "905551234567", type: "text", text: { body: "test" }, context: { id: "wamid.ORIGINAL1" } }],
      [{ wa_id: "905551234567", profile: { name: "Ahmet Yılmaz" } }],
    ),
  );
  assert.equal(replies[0].conversationIdSafe, "wamid.ORIGINAL1");
  assert.equal(replies[0].contactProfileNameSafe, "Ahmet Yılmaz");
});

test("missing context/contacts default to null, never throw", () => {
  const replies = parseWhatsAppInboundReplies(buildPayload([{ id: "wamid.MIN1", from: "905551234567", type: "text", text: { body: "test" } }]));
  assert.equal(replies[0].conversationIdSafe, null);
  assert.equal(replies[0].contactProfileNameSafe, null);
  assert.equal(replies[0].fromWaIdMasked, null);
});

test("invalid timestamp falls back to Date.now() instead of throwing or producing NaN", () => {
  const before = Date.now();
  const replies = parseWhatsAppInboundReplies(buildPayload([{ id: "wamid.BADTS", from: "905551234567", type: "text", text: { body: "hi" }, timestamp: "not-a-number" }]));
  const after = Date.now();
  assert.ok(replies[0].occurredAt >= before && replies[0].occurredAt <= after);
});

test("multiple messages across multiple entries/changes are all collected", () => {
  const payload = {
    entry: [
      { changes: [{ value: { messages: [{ id: "wamid.A", from: "905551111111", type: "text", text: { body: "a" } }] } }] },
      {
        changes: [
          {
            value: {
              messages: [
                { id: "wamid.B", from: "905552222222", type: "text", text: { body: "b" } },
                { id: "wamid.C", from: "905553333333", type: "text", text: { body: "c" } },
              ],
            },
          },
        ],
      },
    ],
  };
  const replies = parseWhatsAppInboundReplies(payload);
  assert.equal(replies.length, 3);
  assert.deepEqual(replies.map((r) => r.providerMessageId), ["wamid.A", "wamid.B", "wamid.C"]);
});

test("buildWhatsAppReplyAuditEvent produces a safe, deterministic audit entry", () => {
  const replies = parseWhatsAppInboundReplies(buildPayload([{ id: "wamid.AUDIT1", from: "905551234567", type: "text", text: { body: "test" }, timestamp: "1700000005" }]));
  const event = buildWhatsAppReplyAuditEvent(replies[0]);
  assert.equal(event.action, "whatsapp_reply_received");
  assert.equal(event.actor, "WhatsApp");
  assert.equal(event.timestamp, 1700000005 * 1000);
  assert.ok(event.details.includes("wamid.AUDIT1"));
});
