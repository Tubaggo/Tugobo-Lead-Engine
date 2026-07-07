import { NextResponse } from "next/server";
import { buildWhatsAppProviderConfig } from "@/app/lib/whatsapp-provider-runtime";
import { DEFAULT_LIVE_SEND_POLICY } from "@/app/components/v2/hermes-live-send-gate";
import { DEFAULT_CONTROLLED_LIVE_SEND_POLICY } from "@/app/components/v2/hermes-live-provider-adapters";
import { executeControlledWhatsAppSend } from "@/app/lib/whatsapp-controlled-live-adapter";
import { parseControlledSendRequestFields, parseJsonBodySafely } from "@/app/lib/whatsapp-controlled-live-send-request";
import { resolveMissionApprovalState } from "@/app/lib/hermes-mission-approval-resolver";

/**
 * Controlled WhatsApp Live Send — preflight/execution shell (v5.1.1 hotfix).
 *
 * POST-only. The client may only trigger a preflight by identifier —
 * missionId, leadId, runtimeMode, recipientPhone, messageText. It never
 * reads an access token, phone_number_id, or any execution-authority
 * boolean (founderApproved / courierDraftApproved / deliveryGatewayAllowed /
 * liveSendGateAllowed / controlledLivePolicyAllowed / whatsappReadinessStatus)
 * from the request body, even if present — `parseControlledSendRequestFields`
 * simply never destructures them, so a malicious or buggy client can never
 * force any of them to `true` server-side.
 *
 * Every one of those values is derived here, server-side only:
 *  - WhatsApp readiness ← v5.0 `buildWhatsAppProviderConfig` (reads env
 *    presence booleans, never raw secrets).
 *  - Live Send Gate / Controlled Live Policy ← the existing, already-
 *    hardcoded-false policy singletons.
 *  - founder/courier/delivery approval ← `resolveMissionApprovalState`
 *    (v5.1.1), which is conservative today (no server-accessible mission
 *    store exists yet) and always returns `false` + `"unresolved"`.
 *
 * The route never sends anything by itself; it only calls the pure resolver
 * + evaluator/adapter chain and returns their safe result object, plus
 * non-secret mission-approval metadata for the UI to explain *why*.
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

  const { missionId, leadId, runtimeMode, recipientPhone, messageText } = fields;

  const approval = resolveMissionApprovalState({ missionId, leadId });

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
    founderApproved: approval.founderApproved,
    courierDraftApproved: approval.courierDraftApproved,
    deliveryGatewayAllowed: approval.deliveryGatewayAllowed,
    whatsappReadinessStatus: providerConfig.readinessStatus,
    liveSendGateAllowed: DEFAULT_LIVE_SEND_POLICY.liveSendEnabled,
    controlledLivePolicyAllowed: DEFAULT_CONTROLLED_LIVE_SEND_POLICY.liveSendEnabled,
    recipientPhone,
    configuredTestRecipient: process.env.WHATSAPP_TEST_RECIPIENT,
    messageText,
    liveSendEnvFlagOn: process.env.WHATSAPP_CONTROLLED_LIVE_SEND_ENABLED === "true",
  });

  return NextResponse.json({
    ...result,
    missionApprovalSource: approval.source,
    missionApprovalResolvedAt: approval.resolvedAt,
    missionApprovalBlockingReasons: approval.blockingReasons,
  });
}
