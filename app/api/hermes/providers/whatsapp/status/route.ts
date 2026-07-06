import { NextResponse } from "next/server";
import { buildWhatsAppProviderConfig } from "@/app/lib/whatsapp-provider-runtime";
import { DEFAULT_LIVE_SEND_POLICY } from "@/app/components/v2/hermes-live-send-gate";
import { DEFAULT_CONTROLLED_LIVE_SEND_POLICY } from "@/app/components/v2/hermes-live-provider-adapters";

/**
 * WhatsApp Provider Credential & Configuration status (v5.0.0).
 *
 * GET-only, read-only. Never sends anything, never calls the WhatsApp Cloud
 * API, never mutates any policy. Reads env var *presence* only (`hasEnv`)
 * — the raw values never leave this function. The response is built by
 * `buildWhatsAppProviderConfig`, which is pure and returns only booleans, a
 * masked test-recipient string, and readiness metadata — no access token,
 * phone number id, business account id, or unmasked recipient value ever
 * appears in the JSON this route returns.
 *
 * `controlledLivePolicyAllowed` / `liveSendGateOk` are read directly from
 * the existing, already-hardcoded-false policy singletons
 * (Controlled Live Provider Adapter's v4.9.0 policy and Live Send Gate's
 * v4.6.0 policy) — this route never re-implements or overrides them.
 */

function hasEnv(name: string): boolean {
  const v = process.env[name]?.trim();
  return Boolean(v && v.length > 0);
}

export async function GET() {
  const config = buildWhatsAppProviderConfig({
    accessTokenPresent: hasEnv("WHATSAPP_ACCESS_TOKEN"),
    phoneNumberIdPresent: hasEnv("WHATSAPP_PHONE_NUMBER_ID"),
    businessAccountIdPresent: hasEnv("WHATSAPP_BUSINESS_ACCOUNT_ID"),
    testRecipientRaw: process.env.WHATSAPP_TEST_RECIPIENT,
    controlledLivePolicyAllowed: DEFAULT_CONTROLLED_LIVE_SEND_POLICY.liveSendEnabled,
    liveSendGateOk: DEFAULT_LIVE_SEND_POLICY.liveSendEnabled,
  });

  return NextResponse.json(config);
}
