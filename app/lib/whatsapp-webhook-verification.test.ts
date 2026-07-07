import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyWhatsAppWebhookChallenge } from "./whatsapp-webhook-verification.ts";

test("succeeds with a matching mode/token/challenge", () => {
  const result = verifyWhatsAppWebhookChallenge({
    mode: "subscribe",
    verifyToken: "secret-token",
    challenge: "12345",
    configuredVerifyToken: "secret-token",
  });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.challenge, "12345");
});

test("fails when the verify token does not match", () => {
  const result = verifyWhatsAppWebhookChallenge({
    mode: "subscribe",
    verifyToken: "wrong-token",
    challenge: "12345",
    configuredVerifyToken: "secret-token",
  });
  assert.equal(result.ok, false);
});

test("fails when hub.mode is not subscribe", () => {
  const result = verifyWhatsAppWebhookChallenge({
    mode: "unsubscribe",
    verifyToken: "secret-token",
    challenge: "12345",
    configuredVerifyToken: "secret-token",
  });
  assert.equal(result.ok, false);
});

test("fails when hub.challenge is missing", () => {
  const result = verifyWhatsAppWebhookChallenge({
    mode: "subscribe",
    verifyToken: "secret-token",
    challenge: null,
    configuredVerifyToken: "secret-token",
  });
  assert.equal(result.ok, false);
});

test("fails safely when no verify token is configured server-side", () => {
  const result = verifyWhatsAppWebhookChallenge({
    mode: "subscribe",
    verifyToken: "anything",
    challenge: "12345",
    configuredVerifyToken: undefined,
  });
  assert.equal(result.ok, false);
});

test("never echoes the configured token in its result", () => {
  const result = verifyWhatsAppWebhookChallenge({
    mode: "subscribe",
    verifyToken: "wrong-token",
    challenge: "12345",
    configuredVerifyToken: "super-secret-verify-token",
  });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("super-secret-verify-token"), false);
});
