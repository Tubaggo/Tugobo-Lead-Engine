import "server-only";

import {
  deriveMissionApprovalFromSnapshot,
  getHermesMissionStateSnapshot,
} from "./mission-state-bridge.ts";

/**
 * Hermes Mission Approval Resolver — durable edition.
 *
 * Ported from `app/lib/hermes-mission-approval-resolver.ts` on `main` (v5.1.2),
 * with its central property intact and non-negotiable:
 *
 *   **approval is derived server-side, never read from a request body.**
 *
 * That was the v5.1 bug v5.1.1 closed, and porting it faithfully is the whole
 * reason to port rather than rewrite. A caller can ask *whether* a mission is
 * approved; it can never assert that it is.
 *
 * When no snapshot exists for a `missionId` — never published, or expired — the
 * resolver falls back to the original's exact conservative behaviour:
 * `source: "unresolved"`, every approval `false`, the same Turkish reason.
 * Approval is never granted by default in either branch.
 *
 * v3.8.0 additions, both narrowing rather than widening:
 *  - the snapshot now comes from a durable file, so an approval survives the
 *    restart that used to silently revoke it
 *  - `currentMessage` binds the resolution to the copy actually on screen, so a
 *    regenerated draft cannot inherit the previous draft's approval
 */

export type MissionApprovalSource = "mission_state_bridge" | "unresolved";

export const MISSION_APPROVAL_UNRESOLVED_REASON =
  "Mission approval state server tarafında çözümlenemedi";

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
  /** The copy the caller intends to act on, if any. See the stale-approval rule. */
  currentMessage?: string | null;
  now?: number;
};

/**
 * Never throws, never grants approval as a fallback.
 *
 * An empty or unknown identifier simply never matches a stored snapshot, so it
 * resolves exactly like any other unresolved case — callers must not treat a
 * missing id as a reason to skip this call.
 */
export async function resolveMissionApprovalState(
  input: MissionApprovalResolverInput,
): Promise<MissionApprovalResolution> {
  const now = input.now ?? Date.now();
  const snapshot = await getHermesMissionStateSnapshot(input.missionId, now);

  if (!snapshot) {
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

  const derived = deriveMissionApprovalFromSnapshot(snapshot, input.currentMessage);

  return {
    missionId: input.missionId,
    leadId: input.leadId,
    founderApproved: derived.founderApproved,
    courierDraftApproved: derived.courierDraftApproved,
    deliveryGatewayAllowed: derived.deliveryGatewayAllowed,
    source: "mission_state_bridge",
    blockingReasons: derived.blockingReasons,
    resolvedAt: now,
  };
}

/**
 * The single question every future external-send path must ask.
 *
 * All three authorities must be true at once — the founder approved *this*
 * copy, the courier draft is approved, and the delivery gateway is open. In
 * Milestone 1 nothing calls this to send: there is no send path on this branch.
 * It exists so that when one arrives it has exactly one gate to pass, already
 * proven to fail closed.
 */
export function isExternalSendAuthorized(resolution: MissionApprovalResolution): boolean {
  return (
    resolution.founderApproved &&
    resolution.courierDraftApproved &&
    resolution.deliveryGatewayAllowed
  );
}
