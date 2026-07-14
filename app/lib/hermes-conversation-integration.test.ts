import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { processWhatsAppWebhookEvent } from "./whatsapp-webhook-event-processor.ts";
import { __resetRecentReceiptsForTests } from "./whatsapp-delivery-receipt-processor.ts";
import { __resetProviderMessageRegistryForTests, registerProviderMessageMapping } from "./hermes-provider-message-registry.ts";
import { __resetWhatsAppReplyRegistryForTests } from "./whatsapp-reply-registry.ts";
import { __resetReplyIntelligenceRegistryForTests } from "./reply-intelligence-registry.ts";
import { __resetDemoSchedulingRegistryForTests, getRecentDemoScheduleItems } from "./demo-scheduling-registry.ts";
import { __resetFollowUpRegistryForTests, getRecentFollowUpCandidates } from "./follow-up-registry.ts";
import { __resetSalesOutcomeRegistryForTests, upsertSalesOutcomeItem, updateSalesOutcomeStatus, getSalesOutcomeByMissionId } from "./sales-outcome-registry.ts";
import {
  __resetConversationRegistryForTests,
  getConversationByMissionId,
  getConversationByProviderMessageId,
  getRecentConversationDecisions,
} from "./hermes-conversation-registry.ts";

/**
 * Sprint C4 — reply pipeline integration.
 * webhook → reply parser → reply registry → reply intelligence →
 * conversation decision → conversation registry.
 *
 * These prove: (1) an inbound reply produces exactly one conversation
 * decision; (2) a Meta retry does not duplicate it; (3) a classifier/
 * conversation failure never breaks the webhook; (4) the existing demo/
 * follow-up seeding is untouched; (5) no send/approval field is produced;
 * (6) not_interested does not auto-lost; (7) wrong_number blocks future
 * automation (no demo/follow-up).
 */

beforeEach(() => {
  __resetProviderMessageRegistryForTests();
  __resetRecentReceiptsForTests();
  __resetWhatsAppReplyRegistryForTests();
  __resetReplyIntelligenceRegistryForTests();
  __resetDemoSchedulingRegistryForTests();
  __resetFollowUpRegistryForTests();
  __resetSalesOutcomeRegistryForTests();
  __resetConversationRegistryForTests();
});

function payload(messages: unknown[]): unknown {
  return { entry: [{ changes: [{ value: { statuses: [], messages } }] }] };
}

test("webhook → reply → intelligence → conversation produces one decision", () => {
  registerProviderMessageMapping({ providerMessageId: "wamid.ORIG", missionId: "m1", leadId: "l1", recipientMasked: null, now: 1000 });
  processWhatsAppWebhookEvent(
    payload([{ id: "wamid.R1", from: "905551111111", type: "text", text: { body: "Demo görebilir miyiz?" }, context: { id: "wamid.ORIG" } }]),
    1000,
  );

  const conv = getConversationByProviderMessageId("wamid.R1");
  assert.ok(conv);
  assert.equal(conv!.decision.state, "demo_requested");
  assert.equal(conv!.decision.missionId, "m1");
  assert.equal(conv!.decision.leadId, "l1");
});

test("retry (same reply id) does not duplicate the conversation, demo, or follow-up", () => {
  registerProviderMessageMapping({ providerMessageId: "wamid.ORIG", missionId: "m1", leadId: "l1", recipientMasked: null, now: 1000 });
  const p = payload([{ id: "wamid.R1", from: "905551111111", type: "text", text: { body: "Demo görebilir miyiz?" }, context: { id: "wamid.ORIG" } }]);

  processWhatsAppWebhookEvent(p, 1000);
  processWhatsAppWebhookEvent(p, 2000); // Meta retry

  const convs = getRecentConversationDecisions(50, 3000).filter((v) => v.decision.providerMessageIdSafe === "wamid.R1");
  assert.equal(convs.length, 1);
  assert.equal(getRecentDemoScheduleItems(50, 3000).length, 1);
});

test("demo intent creates exactly one demo item AND one conversation decision", () => {
  registerProviderMessageMapping({ providerMessageId: "wamid.ORIG", missionId: "m1", leadId: "l1", recipientMasked: null, now: 1000 });
  processWhatsAppWebhookEvent(
    payload([{ id: "wamid.R1", from: "905551111111", type: "text", text: { body: "demo randevu" }, context: { id: "wamid.ORIG" } }]),
    1000,
  );
  assert.equal(getRecentDemoScheduleItems(50, 1000).length, 1);
  assert.equal(getConversationByMissionId("m1")?.decision.state, "demo_requested");
});

test("later intent creates one follow-up AND a follow_up_later conversation", () => {
  registerProviderMessageMapping({ providerMessageId: "wamid.ORIG", missionId: "m1", leadId: "l1", recipientMasked: null, now: 1000 });
  processWhatsAppWebhookEvent(
    payload([{ id: "wamid.R1", from: "905551111111", type: "text", text: { body: "daha sonra konuşalım" }, context: { id: "wamid.ORIG" } }]),
    1000,
  );
  assert.equal(getRecentFollowUpCandidates(50, 1000).length, 1);
  assert.equal(getConversationByMissionId("m1")?.decision.state, "follow_up_later");
});

test("pricing prepares an approval-required draft only — no send/approval fields", () => {
  registerProviderMessageMapping({ providerMessageId: "wamid.ORIG", missionId: "m1", leadId: "l1", recipientMasked: null, now: 1000 });
  processWhatsAppWebhookEvent(
    payload([{ id: "wamid.R1", from: "905551111111", type: "text", text: { body: "fiyat nedir?" }, context: { id: "wamid.ORIG" } }]),
    1000,
  );
  const d = getConversationByMissionId("m1")!.decision;
  assert.equal(d.state, "pricing_discussion");
  assert.equal(d.replyDraftNeeded, true);
  assert.equal(d.approvalRequired, true);
  assert.equal((d as Record<string, unknown>).sendAllowed, undefined);
  assert.equal((d as Record<string, unknown>).founderApproved, undefined);
});

test("not_interested closes operationally but never auto-lost", () => {
  registerProviderMessageMapping({ providerMessageId: "wamid.ORIG", missionId: "m1", leadId: "l1", recipientMasked: null, now: 1000 });
  processWhatsAppWebhookEvent(
    payload([{ id: "wamid.R1", from: "905551111111", type: "text", text: { body: "ilgilenmiyoruz" }, context: { id: "wamid.ORIG" } }]),
    1000,
  );
  const d = getConversationByMissionId("m1")!.decision;
  assert.equal(d.state, "not_interested");
  assert.equal(d.conversationClosed, true);
  assert.notEqual(d.state, "closed_lost");
  // No sales outcome auto-created as lost.
  assert.equal(getSalesOutcomeByMissionId("m1", 1000), undefined);
});

test("wrong_number blocks future automation (no demo, no follow-up)", () => {
  registerProviderMessageMapping({ providerMessageId: "wamid.ORIG", missionId: "m1", leadId: "l1", recipientMasked: null, now: 1000 });
  processWhatsAppWebhookEvent(
    payload([{ id: "wamid.R1", from: "905551111111", type: "text", text: { body: "yanlış numara" }, context: { id: "wamid.ORIG" } }]),
    1000,
  );
  const d = getConversationByMissionId("m1")!.decision;
  assert.equal(d.state, "wrong_number");
  assert.equal(d.conversationClosed, true);
  assert.equal(getRecentDemoScheduleItems(50, 1000).length, 0);
  assert.equal(getRecentFollowUpCandidates(50, 1000).length, 0);
});

test("won sales outcome overrides reply intent → closed_won", () => {
  registerProviderMessageMapping({ providerMessageId: "wamid.ORIG", missionId: "m1", leadId: "l1", recipientMasked: null, now: 1000 });
  // Founder already recorded a won outcome for this mission.
  upsertSalesOutcomeItem({ missionId: "m1", leadId: "l1", source: "founder_manual" }, 1000);
  const outcome = getSalesOutcomeByMissionId("m1", 1000)!;
  updateSalesOutcomeStatus(outcome.id, { status: "won", package: "starter" }, 1000);

  processWhatsAppWebhookEvent(
    payload([{ id: "wamid.R1", from: "905551111111", type: "text", text: { body: "fiyat nedir?" }, context: { id: "wamid.ORIG" } }]),
    2000,
  );
  assert.equal(getConversationByMissionId("m1")!.decision.state, "closed_won");
});

test("unmapped reply is not guessed — routes to human review, no demo item", () => {
  processWhatsAppWebhookEvent(
    payload([{ id: "wamid.R1", from: "905559999999", type: "text", text: { body: "demo randevu" } }]),
    1000,
  );
  const conv = getConversationByProviderMessageId("wamid.R1")!;
  assert.equal(conv.decision.state, "human_review_required");
  assert.equal(conv.decision.mapped, false);
});

test("malformed payload never throws and produces no conversation", () => {
  const result = processWhatsAppWebhookEvent("not-an-object", 1000);
  assert.equal(result.ok, true);
  assert.equal(getRecentConversationDecisions(50, 1000).length, 0);
});

test("no conversation decision exposes a send or delivery path (structural)", () => {
  registerProviderMessageMapping({ providerMessageId: "wamid.ORIG", missionId: "m1", leadId: "l1", recipientMasked: null, now: 1000 });
  processWhatsAppWebhookEvent(
    payload([{ id: "wamid.R1", from: "905551111111", type: "text", text: { body: "ilgileniyoruz detay alalım" }, context: { id: "wamid.ORIG" } }]),
    1000,
  );
  const d = getConversationByMissionId("m1")!.decision;
  const json = JSON.stringify(d);
  assert.equal(/sendAllowed|founderApproved|controlled-send|deliveryGateway/i.test(json), false);
});
