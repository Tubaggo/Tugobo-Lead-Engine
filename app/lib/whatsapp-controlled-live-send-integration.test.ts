import { test } from "node:test";
import assert from "node:assert/strict";
import { parseControlledSendRequestFields, parseJsonBodySafely } from "./whatsapp-controlled-live-send-request.ts";
import { resolveMissionApprovalState } from "./hermes-mission-approval-resolver.ts";
import { evaluateControlledWhatsAppLiveSend } from "./whatsapp-controlled-live-send-runtime.ts";

/**
 * v5.1.1 hotfix regression test — reproduces the exact chain the route runs
 * (parse → resolve mission approval → evaluate), without importing
 * `next/server`. Proves a malicious client cannot force a live send even
 * when it submits every execution-authority boolean as `true` and every
 * server-side readiness/gate/policy signal happens to be favorable.
 */

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
