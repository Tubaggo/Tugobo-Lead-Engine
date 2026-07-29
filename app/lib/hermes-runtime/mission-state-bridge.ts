/**
 * Hermes Mission State Bridge — durable edition.
 *
 * Ported from `app/lib/hermes-mission-state-bridge.ts` on `main` (v5.1.2). The
 * derivation rules below are that module's, unchanged: approval is granted only
 * on an exact literal match (`"approved"` / `"approved"` / `"allowed"`), every
 * other value — including unrecognized ones — derives to `false`, and a missing
 * snapshot derives to all-false with an empty reason list so the resolver can
 * distinguish "never published" from "published but blocked".
 *
 * One thing changed, and it is the point of this milestone: the storage owner.
 * The original kept snapshots in a module-level `Map` and said so in its own
 * header — "In-memory only … Lost on server restart". Publishing and reading now
 * go through the durable Hermes repository instead. The *contract* is
 * deliberately preserved so the layers above bind to the new store with minimal
 * change; the functions are async because a file is.
 *
 * One rule is added, because durability alone does not make an approval safe:
 * a snapshot bound to a message hash only authorizes *that* message. See
 * `message-hash.ts`.
 */

import { approvalCoversMessage } from "./message-hash.ts";
import {
  getApprovalSnapshot,
  publishApprovalSnapshot,
  type PublishApprovalInput,
} from "./repository.ts";
import type { HermesApprovalRecord } from "./schema.ts";

export type {
  CourierDraftStatus,
  DeliveryGatewayStatus,
  FounderApprovalStatus,
  MissionStateSnapshotSource,
} from "./schema.ts";
export {
  COURIER_DRAFT_STATUSES,
  DELIVERY_GATEWAY_STATUSES,
  FOUNDER_APPROVAL_STATUSES,
} from "./schema.ts";

/** The stored snapshot. Named for continuity with the Hermes line's type. */
export type MissionStateSnapshot = HermesApprovalRecord;

export type PublishMissionStateSnapshotInput = PublishApprovalInput;

/** Overwrites any prior snapshot for the same missionId — the latest publish wins. */
export async function publishHermesMissionStateSnapshot(
  input: PublishMissionStateSnapshotInput,
): Promise<MissionStateSnapshot> {
  return publishApprovalSnapshot(input);
}

/** Returns `null` for a missing OR expired snapshot. */
export async function getHermesMissionStateSnapshot(
  missionId: string,
  now: number = Date.now(),
): Promise<MissionStateSnapshot | null> {
  return getApprovalSnapshot(missionId, now);
}

export type DerivedMissionApproval = {
  founderApproved: boolean;
  courierDraftApproved: boolean;
  deliveryGatewayAllowed: boolean;
  blockingReasons: string[];
};

export const BRIDGE_BLOCKING_REASONS = {
  founderNotApproved: "Founder onay durumu approved değil",
  courierDraftNotApproved: "Courier taslak durumu approved değil",
  deliveryGatewayNotAllowed: "Delivery Gateway durumu allowed değil",
  /** v3.8.0 — the stale-approval guard this milestone adds. */
  messageChangedSinceApproval: "Onaylanan mesaj değişti — onay geçersiz",
} as const;

/**
 * Pure — no repository access, no side effects.
 *
 * `null`/`undefined` (missing snapshot) derives to every approval `false` with
 * empty `blockingReasons`; the caller adds the "unresolved" reason, since this
 * function alone cannot distinguish "never published" from "expired".
 *
 * When `currentMessage` is supplied, the snapshot must be bound to exactly that
 * copy. A mismatch — including a snapshot that was never bound to any message —
 * revokes *founder* approval specifically, because the founder is the party
 * whose consent was given to particular words. Courier and gateway status are
 * about the channel, not the copy, so they are left alone.
 */
export function deriveMissionApprovalFromSnapshot(
  snapshot: MissionStateSnapshot | null | undefined,
  currentMessage?: string | null,
): DerivedMissionApproval {
  if (!snapshot) {
    return {
      founderApproved: false,
      courierDraftApproved: false,
      deliveryGatewayAllowed: false,
      blockingReasons: [],
    };
  }

  const messageMatches = approvalCoversMessage(snapshot.messageHash, currentMessage);
  const founderApproved = snapshot.founderApprovalStatus === "approved" && messageMatches;
  const courierDraftApproved = snapshot.courierDraftStatus === "approved";
  const deliveryGatewayAllowed = snapshot.deliveryGatewayStatus === "allowed";

  const blockingReasons: string[] = [];
  if (!founderApproved) {
    blockingReasons.push(
      snapshot.founderApprovalStatus === "approved" && !messageMatches
        ? BRIDGE_BLOCKING_REASONS.messageChangedSinceApproval
        : BRIDGE_BLOCKING_REASONS.founderNotApproved,
    );
  }
  if (!courierDraftApproved) {
    blockingReasons.push(BRIDGE_BLOCKING_REASONS.courierDraftNotApproved);
  }
  if (!deliveryGatewayAllowed) {
    blockingReasons.push(BRIDGE_BLOCKING_REASONS.deliveryGatewayNotAllowed);
  }

  return { founderApproved, courierDraftApproved, deliveryGatewayAllowed, blockingReasons };
}
