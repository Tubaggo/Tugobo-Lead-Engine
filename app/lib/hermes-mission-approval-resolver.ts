import { deriveMissionApprovalFromSnapshot, getHermesMissionStateSnapshot } from "./hermes-mission-state-bridge.ts";

/**
 * Hermes Mission Approval Resolver (v5.1.2 — Mission State Bridge).
 *
 * The controlled WhatsApp send route must derive founder/courier/delivery
 * approval server-side instead of trusting client-submitted booleans (the
 * v5.1 bug v5.1.1 closed). This module is still the single place that
 * derivation happens — v5.1.2 gives it a real, server-accessible source to
 * read from: `hermes-mission-state-bridge.ts`'s in-memory snapshot registry,
 * which the UI publishes to via `/api/hermes/mission-state/snapshot`.
 *
 * When no snapshot exists for a `missionId` (never published, or expired),
 * this resolver falls back to v5.1.1's exact conservative behavior:
 * `source: "unresolved"`, every approval `false`, and the same Turkish
 * blocking reason. Approval is never granted by default in either branch.
 */

export type MissionApprovalSource = "mission_state_bridge" | "unresolved";

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
 * Pure with respect to its inputs (no env read, no network) but does read
 * the mission-state-bridge registry — never throws, never grants approval
 * as a fallback. Callers must not treat a missing `missionId`/`leadId` as a
 * reason to skip calling this — an empty identifier simply never matches a
 * published snapshot, so it resolves exactly like any other unresolved case.
 */
export function resolveMissionApprovalState(input: MissionApprovalResolverInput): MissionApprovalResolution {
  const now = input.now ?? Date.now();
  const snapshot = getHermesMissionStateSnapshot(input.missionId, now);

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

  const derived = deriveMissionApprovalFromSnapshot(snapshot);

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
