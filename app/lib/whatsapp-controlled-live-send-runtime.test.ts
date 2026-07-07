import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BLOCKING_REASONS,
  evaluateControlledWhatsAppLiveSend,
  maskWhatsAppRecipient,
  validateWhatsAppMessageText,
  type WhatsAppControlledSendInput,
} from "./whatsapp-controlled-live-send-runtime.ts";

const BASE_INPUT: WhatsAppControlledSendInput = {
  missionId: "mission-1",
  leadId: "lead-1",
  provider: "whatsapp",
  runtimeMode: "controlled_test_live",
  founderApproved: true,
  courierDraftApproved: true,
  deliveryGatewayAllowed: true,
  whatsappReadinessStatus: "controlled_live_ready",
  liveSendGateAllowed: true,
  controlledLivePolicyAllowed: true,
  recipientPhone: "+90 555 123 45 67",
  configuredTestRecipient: "+905551234567",
  messageText: "Merhaba, otel işletmeniz için görüşme talebimiz var.",
  requestedAt: 1000,
};

test("controlled_live_ready when every gate and validation passes", () => {
  const result = evaluateControlledWhatsAppLiveSend(BASE_INPUT);
  assert.equal(result.status, "controlled_live_ready");
  assert.equal(result.canAttemptLiveSend, true);
  assert.equal(result.forcedDryRun, false);
  assert.deepEqual(result.blockingReasons, []);
});

test("blocked when founder approval is false", () => {
  const result = evaluateControlledWhatsAppLiveSend({ ...BASE_INPUT, founderApproved: false });
  assert.equal(result.status, "blocked");
  assert.equal(result.canAttemptLiveSend, false);
  assert.ok(result.blockingReasons.includes(BLOCKING_REASONS.founderApproval));
});

test("blocked when courier draft is not approved", () => {
  const result = evaluateControlledWhatsAppLiveSend({ ...BASE_INPUT, courierDraftApproved: false });
  assert.equal(result.status, "blocked");
  assert.ok(result.blockingReasons.includes(BLOCKING_REASONS.courierDraft));
});

test("blocked when delivery gateway does not allow live send", () => {
  const result = evaluateControlledWhatsAppLiveSend({ ...BASE_INPUT, deliveryGatewayAllowed: false });
  assert.equal(result.status, "blocked");
  assert.ok(result.blockingReasons.includes(BLOCKING_REASONS.deliveryGateway));
});

test("blocked when WhatsApp readiness is not controlled_live_ready", () => {
  const result = evaluateControlledWhatsAppLiveSend({
    ...BASE_INPUT,
    whatsappReadinessStatus: "dry_run_ready",
  });
  assert.equal(result.status, "blocked");
  assert.ok(result.blockingReasons.includes(BLOCKING_REASONS.providerReadiness));
});

test("blocked when Live Send Gate is closed", () => {
  const result = evaluateControlledWhatsAppLiveSend({ ...BASE_INPUT, liveSendGateAllowed: false });
  assert.equal(result.status, "blocked");
  assert.ok(result.blockingReasons.includes(BLOCKING_REASONS.liveSendGate));
});

test("blocked when Controlled Live Provider policy disallows live send", () => {
  const result = evaluateControlledWhatsAppLiveSend({ ...BASE_INPUT, controlledLivePolicyAllowed: false });
  assert.equal(result.status, "blocked");
  assert.ok(result.blockingReasons.includes(BLOCKING_REASONS.controlledLivePolicy));
});

test("blocked when recipient does not match the configured test recipient", () => {
  const result = evaluateControlledWhatsAppLiveSend({
    ...BASE_INPUT,
    recipientPhone: "+905559999999",
  });
  assert.equal(result.status, "blocked");
  assert.ok(result.blockingReasons.includes(BLOCKING_REASONS.recipientMismatch));
});

test("blocked when recipientPhone is missing entirely", () => {
  const result = evaluateControlledWhatsAppLiveSend({ ...BASE_INPUT, recipientPhone: null });
  assert.equal(result.status, "blocked");
  assert.ok(result.blockingReasons.includes(BLOCKING_REASONS.recipientMismatch));
});

test("blocked when configuredTestRecipient is missing entirely", () => {
  const result = evaluateControlledWhatsAppLiveSend({ ...BASE_INPUT, configuredTestRecipient: null });
  assert.equal(result.status, "blocked");
  assert.ok(result.blockingReasons.includes(BLOCKING_REASONS.recipientMismatch));
});

test("forced dry-run when runtimeMode is dry_run and every other gate passes", () => {
  const result = evaluateControlledWhatsAppLiveSend({ ...BASE_INPUT, runtimeMode: "dry_run" });
  assert.equal(result.status, "dry_run");
  assert.equal(result.forcedDryRun, true);
  assert.equal(result.canAttemptLiveSend, false);
  assert.deepEqual(result.blockingReasons, [BLOCKING_REASONS.runtimeMode]);
});

test("blocked (not merely dry_run) when runtimeMode is dry_run AND another gate also fails", () => {
  const result = evaluateControlledWhatsAppLiveSend({
    ...BASE_INPUT,
    runtimeMode: "dry_run",
    founderApproved: false,
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.forcedDryRun, false);
  assert.ok(result.blockingReasons.includes(BLOCKING_REASONS.founderApproval));
  assert.ok(result.blockingReasons.includes(BLOCKING_REASONS.runtimeMode));
});

test("validation blocks empty message text", () => {
  const validation = validateWhatsAppMessageText("   ");
  assert.equal(validation.valid, false);
  assert.equal(validation.reason, BLOCKING_REASONS.emptyMessage);

  const result = evaluateControlledWhatsAppLiveSend({ ...BASE_INPUT, messageText: "" });
  assert.equal(result.status, "blocked");
  assert.ok(result.blockingReasons.includes(BLOCKING_REASONS.emptyMessage));
});

test("validation blocks unresolved placeholders", () => {
  for (const unsafe of ["Merhaba {{name}}", "Merhaba }}", "Numaranız [PHONE]", "Sayın [NAME]", "Değer: undefined", "Değer: null"]) {
    const validation = validateWhatsAppMessageText(unsafe);
    assert.equal(validation.valid, false, `expected "${unsafe}" to be invalid`);
    assert.equal(validation.reason, BLOCKING_REASONS.unsafeMessage);
  }

  const result = evaluateControlledWhatsAppLiveSend({ ...BASE_INPUT, messageText: "Merhaba {{name}}" });
  assert.equal(result.status, "blocked");
  assert.ok(result.blockingReasons.includes(BLOCKING_REASONS.unsafeMessage));
});

test("validation blocks messages longer than 1500 characters", () => {
  const validation = validateWhatsAppMessageText("a".repeat(1501));
  assert.equal(validation.valid, false);
  assert.equal(validation.reason, BLOCKING_REASONS.unsafeMessage);
});

test("validation accepts a normal, non-empty message", () => {
  const validation = validateWhatsAppMessageText("Merhaba, size nasıl yardımcı olabiliriz?");
  assert.equal(validation.valid, true);
  assert.equal(validation.reason, null);
});

test("maskWhatsAppRecipient never returns more than the last 2 characters", () => {
  assert.equal(maskWhatsAppRecipient("+905551234567"), "••• ••• 67");
  assert.equal(maskWhatsAppRecipient(null), null);
  assert.equal(maskWhatsAppRecipient(undefined), null);
  assert.equal(maskWhatsAppRecipient("  "), null);
});

test("raw configuredTestRecipient never leaks into the serialized result", () => {
  const result = evaluateControlledWhatsAppLiveSend(BASE_INPUT);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(BASE_INPUT.configuredTestRecipient as string), false);
});

test("payloadPreview carries only the masked recipient and a short preview, never the full message", () => {
  const longMessage = "x".repeat(200);
  const result = evaluateControlledWhatsAppLiveSend({ ...BASE_INPUT, messageText: longMessage });
  const serialized = JSON.stringify(result.payloadPreview);
  assert.equal(serialized.includes(BASE_INPUT.recipientPhone as string), false);
  assert.equal(serialized.includes(longMessage), false);
});
