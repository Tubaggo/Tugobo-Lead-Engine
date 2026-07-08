import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  __resetWhatsAppReplyRegistryForTests,
  clearExpiredWhatsAppReplies,
  getRecentWhatsAppReplies,
  mapReplyToMissionContext,
  recordWhatsAppReply,
} from "./whatsapp-reply-registry.ts";
import { __resetProviderMessageRegistryForTests, registerProviderMessageMapping } from "./hermes-provider-message-registry.ts";
import type { WhatsAppInboundReply } from "./whatsapp-reply-listener-runtime.ts";

beforeEach(() => {
  __resetProviderMessageRegistryForTests();
  __resetWhatsAppReplyRegistryForTests();
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

test("mapReplyToMissionContext resolves via a known provider message mapping", () => {
  registerProviderMessageMapping({ providerMessageId: "wamid.ORIGINAL1", missionId: "mission-1", leadId: "lead-1", recipientMasked: null, now: 1000 });
  const reply = buildReply({ conversationIdSafe: "wamid.ORIGINAL1" });
  const context = mapReplyToMissionContext(reply, 1000);
  assert.equal(context.mapped, true);
  assert.equal(context.missionId, "mission-1");
  assert.equal(context.leadId, "lead-1");
  assert.equal(context.source, "provider_message_registry");
});

test("mapReplyToMissionContext does not fake a mapping when the quoted message id is unknown", () => {
  const reply = buildReply({ conversationIdSafe: "wamid.NEVER" });
  const context = mapReplyToMissionContext(reply, 1000);
  assert.equal(context.mapped, false);
  assert.equal(context.missionId, null);
  assert.equal(context.leadId, null);
  assert.equal(context.source, "unmapped");
});

test("mapReplyToMissionContext is unmapped when there is no conversationIdSafe at all", () => {
  const reply = buildReply({ conversationIdSafe: null });
  const context = mapReplyToMissionContext(reply, 1000);
  assert.equal(context.mapped, false);
  assert.equal(context.source, "unmapped");
});

test("recordWhatsAppReply records a mapped reply and returns its stored shape", () => {
  registerProviderMessageMapping({ providerMessageId: "wamid.ORIGINAL2", missionId: "mission-2", leadId: "lead-2", recipientMasked: null, now: 1000 });
  const reply = buildReply({ conversationIdSafe: "wamid.ORIGINAL2" });
  const stored = recordWhatsAppReply(reply, 1000);
  assert.equal(stored.mapped, true);
  assert.equal(stored.missionId, "mission-2");
  assert.equal(stored.source, "provider_message_registry");
  assert.equal("expiresAt" in stored, false);
});

test("unmapped reply is accepted and still surfaced, never dropped", () => {
  const reply = buildReply({ providerMessageId: "wamid.UNMAPPED1", conversationIdSafe: "wamid.NEVER" });
  recordWhatsAppReply(reply, 1000);
  const recent = getRecentWhatsAppReplies(10, 1000);
  assert.equal(recent.length, 1);
  assert.equal(recent[0].mapped, false);
  assert.equal(recent[0].source, "unmapped");
});

test("registry records and returns recent replies, newest first", () => {
  recordWhatsAppReply(buildReply({ providerMessageId: "wamid.FIRST" }), 1000);
  recordWhatsAppReply(buildReply({ providerMessageId: "wamid.SECOND" }), 2000);
  const recent = getRecentWhatsAppReplies(10, 2000);
  assert.equal(recent[0].providerMessageId, "wamid.SECOND");
  assert.equal(recent[1].providerMessageId, "wamid.FIRST");
});

test("registry expires replies past the 7-day TTL", () => {
  recordWhatsAppReply(buildReply({ providerMessageId: "wamid.OLD" }), 1000);
  const withinTtl = getRecentWhatsAppReplies(10, 1000 + 6 * 24 * 60 * 60 * 1000);
  assert.equal(withinTtl.length, 1);
  const pastTtl = getRecentWhatsAppReplies(10, 1000 + 8 * 24 * 60 * 60 * 1000);
  assert.equal(pastTtl.length, 0);
});

test("clearExpiredWhatsAppReplies evicts expired entries and reports the count", () => {
  recordWhatsAppReply(buildReply({ providerMessageId: "wamid.A" }), 1000);
  recordWhatsAppReply(buildReply({ providerMessageId: "wamid.B" }), 1000);
  const cleared = clearExpiredWhatsAppReplies(1000 + 8 * 24 * 60 * 60 * 1000);
  assert.equal(cleared, 2);
  assert.equal(getRecentWhatsAppReplies(10, 1000 + 8 * 24 * 60 * 60 * 1000).length, 0);
});

test("stored reply shape never includes a raw phone, full body, or provider payload field", () => {
  const stored = recordWhatsAppReply(buildReply(), 1000);
  assert.equal("from" in stored, false);
  assert.equal("rawPayload" in stored, false);
  assert.equal("accessToken" in stored, false);
  assert.equal("text" in stored, false);
});
