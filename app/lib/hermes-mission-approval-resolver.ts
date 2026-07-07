/**
 * Hermes Mission Approval Resolver (v5.1.1 hotfix).
 *
 * The controlled WhatsApp send route must derive founder/courier/delivery
 * approval server-side instead of trusting client-submitted booleans (the
 * v5.1 bug this hotfix closes). This module is the single place that
 * derivation happens.
 *
 * Existing Hermes mission/courier/delivery types — `HermesOutboundDraft`
 * (hermes-courier.ts), `HermesDeliveryRequest` (hermes-delivery-gateway.ts),
 * `HermesLiveSendGate` (hermes-live-send-gate.ts) — are all explicitly
 * "session state only", kept in `Record<missionId, X>` by the caller
 * (V2Shell's React state) and never persisted anywhere the server can read.
 * There is no database, no file store, no server-side mission registry in
 * this repository today. So there is nothing real to derive from yet.
 *
 * Per this sprint's explicit instruction, this resolver is therefore
 * conservative: every resolution is `"unresolved"` and every approval is
 * `false` — approval is never granted by default. The output shape already
 * matches what a real `mission_runtime` / `delivery_gateway`-backed resolver
 * would return, so the route and evaluator contracts never need to change
 * when real mission state becomes server-accessible — only this function's
 * body would.
 */

export type MissionApprovalSource = "mission_runtime" | "delivery_gateway" | "unresolved";

export const MISSION_APPROVAL_UNRESOLVED_REASON = "Mission approval state server tarafında çözümlenemedi";

export type MissionApprovalResolution = {
  missionId: string;
  leadId: string;
  founderApproved: boolean;
  courierDraftApproved: boolean;
  deliveryGatewayAllowed: boolean;
  source: MissionApprovalSource;
  blockingReasons: string[];
  resolvedAt: number;
};

export type MissionApprovalResolverInput = {
  missionId: string;
  leadId: string;
  now?: number;
};

/**
 * Pure — no env read, no network, no side effects. Always returns
 * `source: "unresolved"` and every approval `false` today; never throws,
 * never grants approval as a fallback. Callers must not treat a missing
 * `missionId`/`leadId` as a reason to skip calling this — an empty
 * identifier is exactly as unresolved as any other.
 */
export function resolveMissionApprovalState(input: MissionApprovalResolverInput): MissionApprovalResolution {
  const now = input.now ?? Date.now();

  return {
    missionId: input.missionId,
    leadId: input.leadId,
    founderApproved: false,
    courierDraftApproved: false,
    deliveryGatewayAllowed: false,
    source: "unresolved",
    blockingReasons: [MISSION_APPROVAL_UNRESOLVED_REASON],
    resolvedAt: now,
  };
}
