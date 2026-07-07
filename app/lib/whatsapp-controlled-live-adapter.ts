import {
  evaluateControlledWhatsAppLiveSend,
  type WhatsAppControlledSendInput,
  type WhatsAppControlledSendResult,
} from "./whatsapp-controlled-live-send-runtime.ts";

/**
 * Controlled WhatsApp Live Adapter (v5.1.0).
 *
 * The future execution shell for a real WhatsApp Cloud API send — but no
 * network call exists in this file. `WHATSAPP_CONTROLLED_LIVE_SEND_ENABLED`
 * is read by the caller (the API route) and passed in as `liveSendEnvFlagOn`;
 * this module never reads `process.env` itself.
 *
 * Even when the evaluator returns `"controlled_live_ready"` AND the env flag
 * is on, this adapter still never calls the WhatsApp Cloud API — the actual
 * request is isolated behind `sendWhatsAppCloudApiMessage_DISABLED_BY_DEFAULT`,
 * which nothing in this codebase invokes. This is the explicitly-allowed safe
 * fallback: leave the real call as a named, unreachable stub rather than wire
 * up fetch/token handling this sprint.
 */

export type ControlledWhatsAppAdapterInput = WhatsAppControlledSendInput & {
  liveSendEnvFlagOn: boolean;
};

export type ControlledWhatsAppAdapterResult = WhatsAppControlledSendResult & {
  liveSendEnvFlagOn: boolean;
};

export const ENV_FLAG_OFF_REASON = "WhatsApp gerçek gönderim env bayrağı kapalı";

export function executeControlledWhatsAppSend(
  input: ControlledWhatsAppAdapterInput,
): ControlledWhatsAppAdapterResult {
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

  // Every gate passed and the env flag is on — recipient is still guaranteed
  // to be exactly WHATSAPP_TEST_RECIPIENT (enforced inside the evaluator
  // above). The real API call is never made this sprint; see the stub below.
  return { ...evaluation, liveSendEnvFlagOn: true };
}

/**
 * Deliberately unreachable this sprint — no caller in this codebase invokes
 * this function. `executeControlledWhatsAppSend` always returns before
 * reaching a real network call, regardless of gate state or env flag.
 */
export function sendWhatsAppCloudApiMessage_DISABLED_BY_DEFAULT(): never {
  throw new Error("WhatsApp Cloud API çağrısı bu sprintte devre dışı bırakıldı.");
}
