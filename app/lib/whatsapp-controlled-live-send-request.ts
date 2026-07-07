import type { WhatsAppControlledLiveSendRuntimeMode } from "./whatsapp-controlled-live-send-runtime.ts";

/**
 * Controlled WhatsApp Live Send — request parsing (v5.1.1 hotfix).
 *
 * Pure, framework-agnostic (no `next/server` import, no `process.env` read)
 * so it can be tested directly under `node --test` — the route handler is
 * just a thin `next/server` wrapper around these two functions.
 *
 * v5.1.1: the client may only ever trigger a preflight by identifier — it
 * can no longer submit execution-authority booleans. `founderApproved`,
 * `courierDraftApproved`, `deliveryGatewayAllowed`, `liveSendGateAllowed`,
 * `controlledLivePolicyAllowed`, and `whatsappReadinessStatus` are not part
 * of `ControlledSendRequestFields` at all — even if a request body contains
 * them, this function never reads or forwards them. Approval state is
 * derived server-side only (see `hermes-mission-approval-resolver.ts`), and
 * readiness/policy/gate state is derived server-side from existing v5.0/v4.x
 * runtime + constants (see the route). Hermes must not let UI invent
 * execution authority.
 */

export type ControlledSendRequestFields = {
  missionId: string;
  leadId: string;
  runtimeMode: WhatsAppControlledLiveSendRuntimeMode;
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
    recipientPhone: typeof b.recipientPhone === "string" ? b.recipientPhone : null,
    messageText: typeof b.messageText === "string" ? b.messageText : "",
  };
}
