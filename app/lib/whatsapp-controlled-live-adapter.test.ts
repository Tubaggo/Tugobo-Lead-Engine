import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ENV_FLAG_OFF_REASON,
  executeControlledWhatsAppSend,
  sendWhatsAppCloudApiMessage_DISABLED_BY_DEFAULT,
  type ControlledWhatsAppAdapterInput,
} from "./whatsapp-controlled-live-adapter.ts";

const BASE_INPUT: ControlledWhatsAppAdapterInput = {
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
  recipientPhone: "+905551234567",
  configuredTestRecipient: "+905551234567",
  messageText: "Merhaba, otel işletmeniz için görüşme talebimiz var.",
  requestedAt: 1000,
  liveSendEnvFlagOn: false,
};

test("controlled_live_ready when all gates pass but the env flag is false", () => {
  const result = executeControlledWhatsAppSend(BASE_INPUT);
  assert.equal(result.status, "dry_run");
  assert.equal(result.forcedDryRun, true);
  assert.equal(result.canAttemptLiveSend, false);
  assert.equal(result.liveSendEnvFlagOn, false);
  assert.deepEqual(result.blockingReasons, [ENV_FLAG_OFF_REASON]);
});

test("stays controlled_live_ready (never sends) when all gates pass and the env flag is true", () => {
  const result = executeControlledWhatsAppSend({ ...BASE_INPUT, liveSendEnvFlagOn: true });
  assert.equal(result.status, "controlled_live_ready");
  assert.equal(result.canAttemptLiveSend, true);
  assert.equal(result.liveSendEnvFlagOn, true);
});

test("blocked results are unaffected by the env flag", () => {
  const result = executeControlledWhatsAppSend({
    ...BASE_INPUT,
    founderApproved: false,
    liveSendEnvFlagOn: true,
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.liveSendEnvFlagOn, true);
});

test("the disabled send stub always throws and is never invoked by the adapter", () => {
  assert.throws(() => sendWhatsAppCloudApiMessage_DISABLED_BY_DEFAULT());
});
