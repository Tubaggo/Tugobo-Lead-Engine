import {
  BLOCKING_REASONS,
  evaluateControlledWhatsAppLiveSend,
  normalizePhoneForComparison,
  recipientMatchesConfiguredTestRecipient,
  validateWhatsAppMessageText,
  type WhatsAppControlledSendInput,
  type WhatsAppControlledSendResult,
} from "./whatsapp-controlled-live-send-runtime.ts";

/**
 * Controlled WhatsApp Live Adapter (v5.2 — WhatsApp Cloud API Test Runtime).
 *
 * This is the first sprint where a real WhatsApp Cloud API call is
 * *reachable* in this codebase — but only for a POST to
 * `graph.facebook.com/{version}/{phoneNumberId}/messages`, and only after
 * every one of the ten strict conditions in `assertWhatsAppCloudApiTestSendAllowed`
 * passes. `WHATSAPP_CONTROLLED_LIVE_SEND_ENABLED` is read by the caller (the
 * API route) and passed in as `liveSendEnvFlagOn`; likewise `accessToken` /
 * `phoneNumberId` are read by the route from `process.env` and passed in
 * here — this module never reads `process.env` itself, matching the
 * convention `whatsapp-provider-runtime.ts` established.
 *
 * The evaluator (`evaluateControlledWhatsAppLiveSend`) remains pure and
 * never fetches — it only ever answers "could this attempt happen". The
 * actual network call is isolated in exactly one function,
 * `sendWhatsAppCloudApiTestMessage`, which nothing calls except
 * `executeControlledWhatsAppSend`, and only after
 * `assertWhatsAppCloudApiTestSendAllowed` returns `allowed: true`.
 *
 * This is still not arbitrary lead messaging, campaign sending, or
 * autonomous outreach: the recipient is re-validated against
 * `WHATSAPP_TEST_RECIPIENT` in this file too (not just trusted from the
 * evaluator), so a bug in the evaluator alone can never cause a send to a
 * different number.
 */

export type ControlledWhatsAppAdapterInput = WhatsAppControlledSendInput & {
  liveSendEnvFlagOn: boolean;
  /** Raw value, read from `process.env.WHATSAPP_ACCESS_TOKEN` only by the route — never logged, never echoed. */
  accessToken: string | null | undefined;
  /** Raw value, read from `process.env.WHATSAPP_PHONE_NUMBER_ID` only by the route. */
  phoneNumberId: string | null | undefined;
  graphApiVersion?: string | null;
};

export type ControlledWhatsAppAdapterResult = WhatsAppControlledSendResult & {
  liveSendEnvFlagOn: boolean;
  providerMessageId?: string;
  httpStatus?: number;
  acceptedAt?: number;
  providerErrorCode?: string | number;
  providerErrorType?: string;
  providerErrorMessageSafe?: string;
};

export const ENV_FLAG_OFF_REASON = "WhatsApp gerçek gönderim env bayrağı kapalı";
export const MISSING_ACCESS_TOKEN_REASON = "WhatsApp access token sunucu tarafında tanımlı değil";
export const MISSING_PHONE_NUMBER_ID_REASON = "WhatsApp Phone Number ID sunucu tarafında tanımlı değil";
export const CLOUD_API_SEND_FAILED_REASON = "WhatsApp Cloud API test gönderimi başarısız oldu";
export const CLOUD_API_UNREACHABLE_REASON = "WhatsApp Cloud API isteğine ulaşılamadı";

export const DEFAULT_GRAPH_API_VERSION = "v23.0";

/* ── Final preflight guard ──────────────────────────────────────── */

export type CloudApiPreflightResult = { allowed: boolean; reasons: string[] };

/**
 * The last gate before a real network call — re-derives every hard
 * condition independently of the evaluator's own verdict, so a bug in one
 * layer can never be the sole thing standing between the founder and an
 * unintended send. Every reason is collected (not short-circuited), same
 * convention as the evaluator.
 */
export function assertWhatsAppCloudApiTestSendAllowed(
  input: ControlledWhatsAppAdapterInput,
  evaluation: WhatsAppControlledSendResult,
): CloudApiPreflightResult {
  const reasons: string[] = [];

  if (!evaluation.canAttemptLiveSend) {
    reasons.push(...(evaluation.blockingReasons.length > 0 ? evaluation.blockingReasons : ["Değerlendirme canlı gönderime izin vermiyor"]));
  }
  if (evaluation.forcedDryRun) reasons.push(ENV_FLAG_OFF_REASON);
  if (input.runtimeMode !== "controlled_test_live") reasons.push(BLOCKING_REASONS.runtimeMode);
  if (!input.liveSendEnvFlagOn) reasons.push(ENV_FLAG_OFF_REASON);
  if (!recipientMatchesConfiguredTestRecipient(input.recipientPhone, input.configuredTestRecipient)) {
    reasons.push(BLOCKING_REASONS.recipientMismatch);
  }
  if (!input.accessToken?.trim()) reasons.push(MISSING_ACCESS_TOKEN_REASON);
  if (!input.phoneNumberId?.trim()) reasons.push(MISSING_PHONE_NUMBER_ID_REASON);

  const messageValidation = validateWhatsAppMessageText(input.messageText);
  if (!messageValidation.valid && messageValidation.reason) reasons.push(messageValidation.reason);

  return { allowed: reasons.length === 0, reasons: [...new Set(reasons)] };
}

/* ── The one function that touches the network ──────────────────── */

export type WhatsAppCloudApiSendInput = {
  accessToken: string;
  phoneNumberId: string;
  graphApiVersion: string;
  normalizedRecipient: string;
  messageText: string;
};

export type WhatsAppCloudApiSendResult =
  | { ok: true; providerMessageId?: string; httpStatus: number; acceptedAt: number }
  | {
      ok: false;
      httpStatus?: number;
      providerErrorCode?: string | number;
      providerErrorType?: string;
      providerErrorMessageSafe?: string;
    };

/**
 * The only function in this codebase that calls the real WhatsApp Cloud
 * API. Never logs `accessToken` (not even on error). Never returns the raw
 * provider response — only a sanitized, narrow subset of it. Never throws;
 * every failure mode (network error, non-2xx, malformed JSON) resolves to
 * `{ ok: false, ... }`.
 */
export async function sendWhatsAppCloudApiTestMessage(
  input: WhatsAppCloudApiSendInput,
): Promise<WhatsAppCloudApiSendResult> {
  const url = `https://graph.facebook.com/${input.graphApiVersion}/${input.phoneNumberId}/messages`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: input.normalizedRecipient,
        type: "text",
        text: { preview_url: false, body: input.messageText },
      }),
    });
  } catch {
    return { ok: false, providerErrorMessageSafe: CLOUD_API_UNREACHABLE_REASON };
  }

  const httpStatus = response.status;
  const acceptedAt = Date.now();

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    const errorObj =
      json && typeof json === "object" && "error" in json
        ? (json as { error?: Record<string, unknown> }).error
        : undefined;
    const code = errorObj?.code;
    const type = errorObj?.type;
    const message = errorObj?.message;
    return {
      ok: false,
      httpStatus,
      providerErrorCode: typeof code === "number" || typeof code === "string" ? code : undefined,
      providerErrorType: typeof type === "string" ? type : undefined,
      providerErrorMessageSafe: typeof message === "string" ? message.slice(0, 200) : undefined,
    };
  }

  const messages =
    json && typeof json === "object" && "messages" in json
      ? (json as { messages?: Array<{ id?: string }> }).messages
      : undefined;
  const providerMessageId = Array.isArray(messages) && typeof messages[0]?.id === "string" ? messages[0].id : undefined;

  return { ok: true, providerMessageId, httpStatus, acceptedAt };
}

/* ── Orchestrator ───────────────────────────────────────────────── */

export async function executeControlledWhatsAppSend(
  input: ControlledWhatsAppAdapterInput,
): Promise<ControlledWhatsAppAdapterResult> {
  const evaluation = evaluateControlledWhatsAppLiveSend(input);

  if (evaluation.status !== "controlled_live_ready") {
    return { ...evaluation, liveSendEnvFlagOn: input.liveSendEnvFlagOn };
  }

  if (!input.liveSendEnvFlagOn) {
    return {
      ...evaluation,
      status: "dry_run",
      forcedDryRun: true,
      canAttemptLiveSend: false,
      blockingReasons: [ENV_FLAG_OFF_REASON],
      liveSendEnvFlagOn: false,
      audit: [
        ...evaluation.audit,
        {
          timestamp: evaluation.updatedAt + 2,
          actor: "Gateway",
          action: "whatsapp_controlled_send_forced_dry_run",
          details: ENV_FLAG_OFF_REASON,
        },
      ],
    };
  }

  const preflight = assertWhatsAppCloudApiTestSendAllowed(input, evaluation);
  const now = evaluation.updatedAt;

  if (!preflight.allowed) {
    return {
      ...evaluation,
      status: "blocked",
      canAttemptLiveSend: false,
      forcedDryRun: false,
      blockingReasons: preflight.reasons,
      liveSendEnvFlagOn: true,
      audit: [
        ...evaluation.audit,
        {
          timestamp: now + 2,
          actor: "Gateway",
          action: "whatsapp_cloud_api_test_send_blocked",
          details: preflight.reasons.join(" — "),
        },
      ],
    };
  }

  const auditAfterPreflight = [
    ...evaluation.audit,
    {
      timestamp: now + 2,
      actor: "Gateway",
      action: "whatsapp_cloud_api_test_send_preflight_passed",
      details: "Cloud API test gönderimi için son ön kontrol geçildi.",
    },
    {
      timestamp: now + 3,
      actor: "Gateway",
      action: "whatsapp_cloud_api_test_send_attempted",
      details: "WhatsApp Cloud API test gönderimi denendi.",
    },
  ];

  const sendResult = await sendWhatsAppCloudApiTestMessage({
    accessToken: input.accessToken as string,
    phoneNumberId: input.phoneNumberId as string,
    graphApiVersion: input.graphApiVersion?.trim() || DEFAULT_GRAPH_API_VERSION,
    normalizedRecipient: normalizePhoneForComparison(input.recipientPhone),
    messageText: input.messageText,
  });

  if (sendResult.ok) {
    return {
      ...evaluation,
      status: "controlled_live_sent",
      canAttemptLiveSend: true,
      forcedDryRun: false,
      blockingReasons: [],
      liveSendEnvFlagOn: true,
      providerMessageId: sendResult.providerMessageId,
      httpStatus: sendResult.httpStatus,
      acceptedAt: sendResult.acceptedAt,
      audit: [
        ...auditAfterPreflight,
        {
          timestamp: sendResult.acceptedAt,
          actor: "Gateway",
          action: "whatsapp_cloud_api_test_send_succeeded",
          details: "WhatsApp Cloud API test gönderimi başarılı — sağlayıcı kabul etti.",
        },
      ],
    };
  }

  return {
    ...evaluation,
    status: "failed",
    canAttemptLiveSend: false,
    forcedDryRun: false,
    blockingReasons: [CLOUD_API_SEND_FAILED_REASON],
    liveSendEnvFlagOn: true,
    httpStatus: sendResult.httpStatus,
    providerErrorCode: sendResult.providerErrorCode,
    providerErrorType: sendResult.providerErrorType,
    providerErrorMessageSafe: sendResult.providerErrorMessageSafe,
    audit: [
      ...auditAfterPreflight,
      {
        timestamp: Date.now(),
        actor: "Gateway",
        action: "whatsapp_cloud_api_test_send_failed",
        details: sendResult.providerErrorMessageSafe ?? CLOUD_API_SEND_FAILED_REASON,
      },
    ],
  };
}
