import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BLOCKING_REASON_LABELS,
  buildWhatsAppProviderConfig,
  evaluateWhatsAppProviderReadiness,
  maskTestRecipient,
} from "./whatsapp-provider-runtime.ts";

const NONE = {
  accessTokenPresent: false,
  phoneNumberIdPresent: false,
  businessAccountIdPresent: false,
  testRecipientConfigured: false,
  controlledLivePolicyAllowed: false,
  liveSendGateOk: false,
};

test("returns not_configured when nothing is present", () => {
  const result = evaluateWhatsAppProviderReadiness(NONE);
  assert.equal(result.readinessStatus, "not_configured");
  assert.equal(result.mode, "disabled");
  assert.equal(result.liveSendEligible, false);
  assert.equal(result.blockingReasons.length, 6);
});

test("returns partial when only some credentials exist", () => {
  const result = evaluateWhatsAppProviderReadiness({
    ...NONE,
    accessTokenPresent: true,
  });
  assert.equal(result.readinessStatus, "partial");
  assert.equal(result.mode, "disabled");
  assert.equal(result.liveSendEligible, false);
});

test("returns dry_run_ready once core credentials (token + phone number id) exist", () => {
  const result = evaluateWhatsAppProviderReadiness({
    ...NONE,
    accessTokenPresent: true,
    phoneNumberIdPresent: true,
  });
  assert.equal(result.readinessStatus, "dry_run_ready");
  assert.equal(result.mode, "dry_run");
  assert.equal(result.liveSendEligible, false);
});

test("returns blocked when every credential exists but policy/gate are off", () => {
  const result = evaluateWhatsAppProviderReadiness({
    accessTokenPresent: true,
    phoneNumberIdPresent: true,
    businessAccountIdPresent: true,
    testRecipientConfigured: true,
    controlledLivePolicyAllowed: false,
    liveSendGateOk: false,
  });
  assert.equal(result.readinessStatus, "blocked");
  assert.equal(result.liveSendEligible, false);
  assert.deepEqual(result.blockingReasons, [
    BLOCKING_REASON_LABELS.controlledLivePolicy,
    BLOCKING_REASON_LABELS.liveSendGate,
  ]);
});

test("returns controlled_live_ready only when every requirement AND every policy gate pass", () => {
  const result = evaluateWhatsAppProviderReadiness({
    accessTokenPresent: true,
    phoneNumberIdPresent: true,
    businessAccountIdPresent: true,
    testRecipientConfigured: true,
    controlledLivePolicyAllowed: true,
    liveSendGateOk: true,
  });
  assert.equal(result.readinessStatus, "controlled_live_ready");
  assert.equal(result.mode, "controlled_live_ready");
  assert.equal(result.liveSendEligible, true);
  assert.deepEqual(result.blockingReasons, []);
});

test("controlled_live_ready is NOT reached if only one policy gate is missing", () => {
  const missingGate = evaluateWhatsAppProviderReadiness({
    accessTokenPresent: true,
    phoneNumberIdPresent: true,
    businessAccountIdPresent: true,
    testRecipientConfigured: true,
    controlledLivePolicyAllowed: true,
    liveSendGateOk: false,
  });
  assert.equal(missingGate.readinessStatus, "blocked");
  assert.equal(missingGate.liveSendEligible, false);
  assert.deepEqual(missingGate.blockingReasons, [BLOCKING_REASON_LABELS.liveSendGate]);
});

test("blocking reasons are the exact expected Turkish strings, in order", () => {
  const result = evaluateWhatsAppProviderReadiness(NONE);
  assert.deepEqual(result.blockingReasons, [
    "WhatsApp access token tanımlı değil",
    "Phone Number ID tanımlı değil",
    "Business Account ID tanımlı değil",
    "Test alıcısı tanımlı değil",
    "Controlled live gönderim politikası şu anda kapalı",
    "Live Send Gate aktif değil veya bloklu",
  ]);
});

test("maskTestRecipient never returns more than the last 2 characters", () => {
  assert.equal(maskTestRecipient("+905551234567"), "••• ••• 67");
  assert.equal(maskTestRecipient(null), null);
  assert.equal(maskTestRecipient(undefined), null);
  assert.equal(maskTestRecipient("  "), null);
});

test("buildWhatsAppProviderConfig never leaks the raw test recipient value", () => {
  const raw = "+905551234567";
  const config = buildWhatsAppProviderConfig({
    accessTokenPresent: true,
    phoneNumberIdPresent: true,
    businessAccountIdPresent: true,
    testRecipientRaw: raw,
    controlledLivePolicyAllowed: false,
    liveSendGateOk: false,
    now: 1000,
  });

  const serialized = JSON.stringify(config);
  assert.equal(serialized.includes(raw), false);
  assert.equal(config.testRecipientMasked, "••• ••• 67");
  assert.equal(config.testRecipientConfigured, true);

  // The config shape itself must never carry an accessToken/phoneNumberId/
  // businessAccountId *value* field — only presence booleans.
  assert.equal("accessToken" in config, false);
  assert.equal("phoneNumberId" in config, false);
  assert.equal("businessAccountId" in config, false);
  assert.equal(typeof config.accessTokenPresent, "boolean");
});

test("buildWhatsAppProviderConfig produces a fresh audit trail starting with config_checked", () => {
  const config = buildWhatsAppProviderConfig({
    accessTokenPresent: false,
    phoneNumberIdPresent: false,
    businessAccountIdPresent: false,
    testRecipientRaw: null,
    controlledLivePolicyAllowed: false,
    liveSendGateOk: false,
    now: 5000,
  });
  assert.equal(config.audit[0]?.action, "whatsapp_provider_config_checked");
  assert.ok(config.audit.some((e) => e.action === "whatsapp_provider_partial"));
  assert.equal(config.readinessStatus, "not_configured");
  assert.equal(config.updatedAt, 5000);
});
