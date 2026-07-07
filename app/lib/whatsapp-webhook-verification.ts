/**
 * WhatsApp Webhook Verification (v6.0.1).
 *
 * Pure — no `process.env` read, no `next/server` import. The route reads
 * `WHATSAPP_WEBHOOK_VERIFY_TOKEN` and the `hub.*` query params, then calls
 * this function; this module never reads the token itself and never logs
 * it — it only ever compares two already-extracted strings.
 *
 * Meta's verification handshake: GET request with `hub.mode=subscribe`,
 * `hub.verify_token=<your configured token>`, `hub.challenge=<random string>`.
 * Reply with the challenge as plain text only if the token matches exactly;
 * otherwise the webhook must be rejected.
 */

export type WhatsAppWebhookVerificationInput = {
  mode: string | null;
  verifyToken: string | null;
  challenge: string | null;
  configuredVerifyToken: string | null | undefined;
};

export type WhatsAppWebhookVerificationResult = { ok: true; challenge: string } | { ok: false; reason: string };

export function verifyWhatsAppWebhookChallenge(
  input: WhatsAppWebhookVerificationInput,
): WhatsAppWebhookVerificationResult {
  const configured = input.configuredVerifyToken?.trim();

  if (!configured) return { ok: false, reason: "Webhook doğrulama token'ı sunucu tarafında tanımlı değil" };
  if (input.mode !== "subscribe") return { ok: false, reason: "hub.mode subscribe değil" };
  if (!input.challenge) return { ok: false, reason: "hub.challenge eksik" };
  if (input.verifyToken !== configured) return { ok: false, reason: "hub.verify_token eşleşmiyor" };

  return { ok: true, challenge: input.challenge };
}
