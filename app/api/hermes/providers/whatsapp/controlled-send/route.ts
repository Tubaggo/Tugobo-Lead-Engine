import { NextResponse } from "next/server";
import { buildWhatsAppProviderConfig } from "@/app/lib/whatsapp-provider-runtime";
import { DEFAULT_LIVE_SEND_POLICY } from "@/app/components/v2/hermes-live-send-gate";
import { DEFAULT_CONTROLLED_LIVE_SEND_POLICY } from "@/app/components/v2/hermes-live-provider-adapters";
import { executeControlledWhatsAppSend } from "@/app/lib/whatsapp-controlled-live-adapter";
import { parseControlledSendRequestFields, parseJsonBodySafely } from "@/app/lib/whatsapp-controlled-live-send-request";

/**
 * Controlled WhatsApp Live Send — preflight/execution shell (v5.1.0).
 *
 * POST-only. Accepts only safe runtime fields from the client — missionId,
 * leadId, runtimeMode, founderApproved, courierDraftApproved,
 * deliveryGatewayAllowed, recipientPhone, messageText. It never reads an
 * access token or phone_number_id from the request body, even if present;
 * those fields are simply never destructured from `body`.
 *
 * Everything else — the configured test recipient, WhatsApp readiness,
 * live-send-gate policy, controlled-live policy, and the
 * WHATSAPP_CONTROLLED_LIVE_SEND_ENABLED env flag — is derived server-side
 * from existing v5.0 runtime + the already-hardcoded-false policy singletons.
 * The route never sends anything by itself; it only calls the pure evaluator
 * + adapter and returns their safe result object.
 */

function hasEnv(name: string): boolean {
  const v = process.env[name]?.trim();
  return Boolean(v && v.length > 0);
}

function safeErrorResponse(message: string) {
  return NextResponse.json({ error: message, status: "blocked" as const }, { status: 400 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  const parsedBody = parseJsonBodySafely(raw);
  if (parsedBody === undefined) {
    return safeErrorResponse("Geçersiz istek gövdesi.");
  }

  const fields = parseControlledSendRequestFields(parsedBody);
  if (!fields) {
    return safeErrorResponse("Geçersiz istek gövdesi.");
  }

  const { missionId, leadId, runtimeMode, founderApproved, courierDraftApproved, deliveryGatewayAllowed, recipientPhone, messageText } =
    fields;

  const providerConfig = buildWhatsAppProviderConfig({
    accessTokenPresent: hasEnv("WHATSAPP_ACCESS_TOKEN"),
    phoneNumberIdPresent: hasEnv("WHATSAPP_PHONE_NUMBER_ID"),
    businessAccountIdPresent: hasEnv("WHATSAPP_BUSINESS_ACCOUNT_ID"),
    testRecipientRaw: process.env.WHATSAPP_TEST_RECIPIENT,
    controlledLivePolicyAllowed: DEFAULT_CONTROLLED_LIVE_SEND_POLICY.liveSendEnabled,
    liveSendGateOk: DEFAULT_LIVE_SEND_POLICY.liveSendEnabled,
  });

  const result = executeControlledWhatsAppSend({
    missionId,
    leadId,
    provider: "whatsapp",
    runtimeMode,
    founderApproved,
    courierDraftApproved,
    deliveryGatewayAllowed,
    whatsappReadinessStatus: providerConfig.readinessStatus,
    liveSendGateAllowed: DEFAULT_LIVE_SEND_POLICY.liveSendEnabled,
    controlledLivePolicyAllowed: DEFAULT_CONTROLLED_LIVE_SEND_POLICY.liveSendEnabled,
    recipientPhone,
    configuredTestRecipient: process.env.WHATSAPP_TEST_RECIPIENT,
    messageText,
    liveSendEnvFlagOn: process.env.WHATSAPP_CONTROLLED_LIVE_SEND_ENABLED === "true",
  });

  return NextResponse.json(result);
}
