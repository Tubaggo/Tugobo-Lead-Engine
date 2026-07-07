import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { parseControlledSendRequestFields, parseJsonBodySafely } from "./whatsapp-controlled-live-send-request.ts";
import { resolveMissionApprovalState } from "./hermes-mission-approval-resolver.ts";
import { evaluateControlledWhatsAppLiveSend } from "./whatsapp-controlled-live-send-runtime.ts";
import { __resetMissionStateBridgeForTests, publishHermesMissionStateSnapshot } from "./hermes-mission-state-bridge.ts";

/**
 * v5.1.1/v5.1.2 regression test — reproduces the exact chain the route runs
 * (parse → resolve mission approval [now bridge-backed] → evaluate), without
 * importing `next/server`. Proves a malicious client cannot force a live
 * send by submitting execution-authority booleans, and that a real,
 * server-published mission-state snapshot is what actually unlocks
 * `canAttemptLiveSend` — not anything the client sends.
 */

beforeEach(() => {
  __resetMissionStateBridgeForTests();
});

function runChain(rawBody: string, serverSignals: {
  whatsappReadinessStatus: "not_configured" | "partial" | "dry_run_ready" | "controlled_live_ready" | "blocked";
  liveSendGateAllowed: boolean;
  controlledLivePolicyAllowed: boolean;
  configuredTestRecipient: string | null;
}) {
  const parsedBody = parseJsonBodySafely(rawBody);
  assert.notEqual(parsedBody, undefined, "expected valid JSON in this helper");
  const fields = parseControlledSendRequestFields(parsedBody);
  assert.ok(fields, "expected a parseable object body in this helper");

  const approval = resolveMissionApprovalState({ missionId: fields.missionId, leadId: fields.leadId });

  return evaluateControlledWhatsAppLiveSend({
    missionId: fields.missionId,
    leadId: fields.leadId,
    provider: "whatsapp",
    runtimeMode: fields.runtimeMode,
    founderApproved: approval.founderApproved,
    courierDraftApproved: approval.courierDraftApproved,
    deliveryGatewayAllowed: approval.deliveryGatewayAllowed,
    whatsappReadinessStatus: serverSignals.whatsappReadinessStatus,
    liveSendGateAllowed: serverSignals.liveSendGateAllowed,
    controlledLivePolicyAllowed: serverSignals.controlledLivePolicyAllowed,
    recipientPhone: fields.recipientPhone,
    configuredTestRecipient: serverSignals.configuredTestRecipient,
    messageText: fields.messageText,
  });
}

const FAVORABLE_SERVER_SIGNALS = {
  whatsappReadinessStatus: "controlled_live_ready" as const,
  liveSendGateAllowed: true,
  controlledLivePolicyAllowed: true,
  configuredTestRecipient: "+905551234567",
};

test("a malicious client cannot force canAttemptLiveSend true by submitting approval booleans, even when every server signal is favorable", () => {
  const maliciousBody = JSON.stringify({
    missionId: "m1",
    leadId: "l1",
    runtimeMode: "controlled_test_live",
    recipientPhone: "+905551234567",
    messageText: "Merhaba, otel işletmeniz için görüşme talebimiz var.",
    founderApproved: true,
    courierDraftApproved: true,
    deliveryGatewayAllowed: true,
    liveSendGateAllowed: true,
    controlledLivePolicyAllowed: true,
    whatsappReadinessStatus: "controlled_live_ready",
  });

  const result = runChain(maliciousBody, FAVORABLE_SERVER_SIGNALS);

  assert.equal(result.status, "blocked");
  assert.equal(result.canAttemptLiveSend, false);
  assert.ok(result.blockingReasons.includes("Founder onayı yok"));
  assert.ok(result.blockingReasons.includes("Courier taslağı onaylı değil"));
  assert.ok(result.blockingReasons.includes("Delivery Gateway canlı gönderime izin vermiyor"));
});

test("an honest client with no approval booleans in the body reaches the same blocked result", () => {
  const honestBody = JSON.stringify({
    missionId: "m1",
    leadId: "l1",
    runtimeMode: "controlled_test_live",
    recipientPhone: "+905551234567",
    messageText: "Merhaba, otel işletmeniz için görüşme talebimiz var.",
  });

  const result = runChain(honestBody, FAVORABLE_SERVER_SIGNALS);

  assert.equal(result.status, "blocked");
  assert.equal(result.canAttemptLiveSend, false);
});

test("malformed JSON never reaches the resolver or evaluator", () => {
  const parsed = parseJsonBodySafely("{ not valid json");
  assert.equal(parsed, undefined);
});

/* ── v5.1.2: Mission State Bridge integration ── */

test("after publishing an approved snapshot, canAttemptLiveSend becomes true when every other gate also passes", () => {
  publishHermesMissionStateSnapshot({
    missionId: "m1",
    leadId: "l1",
    founderApprovalStatus: "approved",
    courierDraftStatus: "approved",
    deliveryGatewayStatus: "allowed",
  });

  const honestBody = JSON.stringify({
    missionId: "m1",
    leadId: "l1",
    runtimeMode: "controlled_test_live",
    recipientPhone: "+905551234567",
    messageText: "Merhaba, otel işletmeniz için görüşme talebimiz var.",
  });

  const result = runChain(honestBody, FAVORABLE_SERVER_SIGNALS);

  assert.equal(result.status, "controlled_live_ready");
  assert.equal(result.canAttemptLiveSend, true);
});

test("a malicious client cannot force approval through the request body even when a real approved snapshot exists for a different mission", () => {
  publishHermesMissionStateSnapshot({
    missionId: "some-other-approved-mission",
    leadId: "some-other-lead",
    founderApprovalStatus: "approved",
    courierDraftStatus: "approved",
    deliveryGatewayStatus: "allowed",
  });

  const maliciousBody = JSON.stringify({
    missionId: "m1",
    leadId: "l1",
    runtimeMode: "controlled_test_live",
    recipientPhone: "+905551234567",
    messageText: "Merhaba, otel işletmeniz için görüşme talebimiz var.",
    founderApproved: true,
    courierDraftApproved: true,
    deliveryGatewayAllowed: true,
  });

  const result = runChain(maliciousBody, FAVORABLE_SERVER_SIGNALS);

  assert.equal(result.status, "blocked");
  assert.equal(result.canAttemptLiveSend, false);
});

test("send stays blocked when WhatsApp readiness is not controlled_live_ready, even with a fully-approved mission snapshot", () => {
  publishHermesMissionStateSnapshot({
    missionId: "m1",
    leadId: "l1",
    founderApprovalStatus: "approved",
    courierDraftStatus: "approved",
    deliveryGatewayStatus: "allowed",
  });

  const honestBody = JSON.stringify({
    missionId: "m1",
    leadId: "l1",
    runtimeMode: "controlled_test_live",
    recipientPhone: "+905551234567",
    messageText: "Merhaba, otel işletmeniz için görüşme talebimiz var.",
  });

  const result = runChain(honestBody, { ...FAVORABLE_SERVER_SIGNALS, whatsappReadinessStatus: "dry_run_ready" });

  assert.equal(result.status, "blocked");
  assert.equal(result.canAttemptLiveSend, false);
  assert.ok(result.blockingReasons.includes("WhatsApp provider controlled live hazır değil"));
});

test("send stays blocked when the Controlled Live Policy gate is false, even with a fully-approved mission snapshot", () => {
  publishHermesMissionStateSnapshot({
    missionId: "m1",
    leadId: "l1",
    founderApprovalStatus: "approved",
    courierDraftStatus: "approved",
    deliveryGatewayStatus: "allowed",
  });

  const honestBody = JSON.stringify({
    missionId: "m1",
    leadId: "l1",
    runtimeMode: "controlled_test_live",
    recipientPhone: "+905551234567",
    messageText: "Merhaba, otel işletmeniz için görüşme talebimiz var.",
  });

  const result = runChain(honestBody, { ...FAVORABLE_SERVER_SIGNALS, controlledLivePolicyAllowed: false });

  assert.equal(result.status, "blocked");
  assert.equal(result.canAttemptLiveSend, false);
});
