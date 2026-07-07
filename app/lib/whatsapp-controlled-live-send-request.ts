import type { WhatsAppControlledLiveSendRuntimeMode } from "./whatsapp-controlled-live-send-runtime.ts";

/**
 * Controlled WhatsApp Live Send — request parsing (v5.1.0).
 *
 * Pure, framework-agnostic (no `next/server` import, no `process.env` read)
 * so it can be tested directly under `node --test` — the route handler is
 * just a thin `next/server` wrapper around these two functions.
 *
 * `parseControlledSendRequestFields` only ever reads the seven fields listed
 * in the sprint spec. `accessToken` / `phoneNumberId` / any other client
 * field is never destructured, so it can never reach the evaluator or leak
 * into a response — not because it is filtered out, but because nothing
 * here ever looks at it.
 */

export type ControlledSendRequestFields = {
  missionId: string;
  leadId: string;
  runtimeMode: WhatsAppControlledLiveSendRuntimeMode;
  founderApproved: boolean;
  courierDraftApproved: boolean;
  deliveryGatewayAllowed: boolean;
  recipientPhone: string | null;
  messageText: string;
};

/** Returns `undefined` for anything that isn't valid, parseable JSON — never throws. */
export function parseJsonBodySafely(raw: string): unknown | undefined {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Returns `null` when `body` isn't a plain object — the route treats that as a safe 400. */
export function parseControlledSendRequestFields(body: unknown): ControlledSendRequestFields | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;

  return {
    missionId: typeof b.missionId === "string" ? b.missionId : "",
    leadId: typeof b.leadId === "string" ? b.leadId : "",
    runtimeMode: b.runtimeMode === "controlled_test_live" ? "controlled_test_live" : "dry_run",
    founderApproved: b.founderApproved === true,
    courierDraftApproved: b.courierDraftApproved === true,
    deliveryGatewayAllowed: b.deliveryGatewayAllowed === true,
    recipientPhone: typeof b.recipientPhone === "string" ? b.recipientPhone : null,
    messageText: typeof b.messageText === "string" ? b.messageText : "",
  };
}
