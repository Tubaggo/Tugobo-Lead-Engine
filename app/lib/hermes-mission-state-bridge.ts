/**
 * Hermes Mission State Bridge (v5.1.2).
 *
 * Server-only, in-memory snapshot registry. v5.1.1's resolver always
 * returned `"unresolved"` because founder/courier/delivery state lived only
 * in the browser's V2Shell React state, never reaching the server. This
 * module is the bridge: the UI publishes a *status snapshot* (three
 * enums, never an approval boolean) to `/api/hermes/mission-state/snapshot`,
 * this registry stores it keyed by `missionId`, and
 * `hermes-mission-approval-resolver.ts` reads it back.
 *
 * Deliberately minimal and conservative:
 *  - In-memory only (a module-level `Map`) — no database, no file, no
 *    Airtable field. Lost on server restart; that's acceptable per this
 *    sprint's explicit instruction, and the resolver's existing
 *    "unresolved → all false" fallback already covers that case.
 *  - Never stores message text, a recipient phone, a provider credential, or
 *    any other secret — the snapshot shape below has no field for any of
 *    those, so there is nothing to strip; it structurally cannot happen.
 *  - Snapshots expire (`expiresAt`) — a stale snapshot is treated exactly
 *    like a missing one, never silently trusted forever.
 *  - Approval is only ever derived as `true` when the corresponding status
 *    is the exact literal "approved"/"approved"/"allowed" — every other
 *    value (including unrecognized ones, which callers normalize to
 *    "missing"/"blocked" before publishing) resolves to `false`.
 */

export type FounderApprovalStatus = "approved" | "pending" | "rejected" | "missing";
export type CourierDraftStatus = "approved" | "draft" | "missing";
export type DeliveryGatewayStatus = "allowed" | "blocked" | "missing";
export type MissionStateSnapshotSource = "workspace_snapshot" | "mission_runtime";

export const FOUNDER_APPROVAL_STATUSES: readonly FounderApprovalStatus[] = [
  "approved",
  "pending",
  "rejected",
  "missing",
];
export const COURIER_DRAFT_STATUSES: readonly CourierDraftStatus[] = ["approved", "draft", "missing"];
export const DELIVERY_GATEWAY_STATUSES: readonly DeliveryGatewayStatus[] = ["allowed", "blocked", "missing"];

export type MissionStateSnapshot = {
  missionId: string;
  leadId: string;
  founderApprovalStatus: FounderApprovalStatus;
  courierDraftStatus: CourierDraftStatus;
  deliveryGatewayStatus: DeliveryGatewayStatus;
  source: MissionStateSnapshotSource;
  updatedAt: number;
  expiresAt: number;
};

/** 10 minutes — long enough for a founder's active session, short enough that a stale snapshot never lingers as silent authority. */
const SNAPSHOT_TTL_MS = 10 * 60 * 1000;

const registry = new Map<string, MissionStateSnapshot>();

export type PublishMissionStateSnapshotInput = {
  missionId: string;
  leadId: string;
  founderApprovalStatus: FounderApprovalStatus;
  courierDraftStatus: CourierDraftStatus;
  deliveryGatewayStatus: DeliveryGatewayStatus;
  source?: MissionStateSnapshotSource;
  now?: number;
};

/** Overwrites any prior snapshot for the same missionId — the latest publish always wins. */
export function publishHermesMissionStateSnapshot(input: PublishMissionStateSnapshotInput): MissionStateSnapshot {
  const now = input.now ?? Date.now();
  const snapshot: MissionStateSnapshot = {
    missionId: input.missionId,
    leadId: input.leadId,
    founderApprovalStatus: input.founderApprovalStatus,
    courierDraftStatus: input.courierDraftStatus,
    deliveryGatewayStatus: input.deliveryGatewayStatus,
    source: input.source ?? "workspace_snapshot",
    updatedAt: now,
    expiresAt: now + SNAPSHOT_TTL_MS,
  };
  registry.set(input.missionId, snapshot);
  return snapshot;
}

/** Returns `undefined` for a missing OR expired snapshot — an expired entry is evicted on read, never returned. */
export function getHermesMissionStateSnapshot(missionId: string, now: number = Date.now()): MissionStateSnapshot | undefined {
  const snapshot = registry.get(missionId);
  if (!snapshot) return undefined;
  if (snapshot.expiresAt <= now) {
    registry.delete(missionId);
    return undefined;
  }
  return snapshot;
}

/** Sweeps every expired entry out of the registry; returns how many were removed. Safe to call on a timer or opportunistically — not required for correctness since `get` already evicts lazily. */
export function clearExpiredMissionStateSnapshots(now: number = Date.now()): number {
  let cleared = 0;
  for (const [missionId, snapshot] of registry) {
    if (snapshot.expiresAt <= now) {
      registry.delete(missionId);
      cleared += 1;
    }
  }
  return cleared;
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
} as const;

/**
 * Pure — no registry access, no side effects. `undefined` (missing snapshot)
 * derives to every approval `false` with empty `blockingReasons`; the caller
 * (the resolver) is responsible for adding the "unresolved" reason, since
 * this function alone can't distinguish "never published" from "expired".
 */
export function deriveMissionApprovalFromSnapshot(snapshot: MissionStateSnapshot | undefined): DerivedMissionApproval {
  if (!snapshot) {
    return { founderApproved: false, courierDraftApproved: false, deliveryGatewayAllowed: false, blockingReasons: [] };
  }

  const founderApproved = snapshot.founderApprovalStatus === "approved";
  const courierDraftApproved = snapshot.courierDraftStatus === "approved";
  const deliveryGatewayAllowed = snapshot.deliveryGatewayStatus === "allowed";

  const blockingReasons: string[] = [];
  if (!founderApproved) blockingReasons.push(BRIDGE_BLOCKING_REASONS.founderNotApproved);
  if (!courierDraftApproved) blockingReasons.push(BRIDGE_BLOCKING_REASONS.courierDraftNotApproved);
  if (!deliveryGatewayAllowed) blockingReasons.push(BRIDGE_BLOCKING_REASONS.deliveryGatewayNotAllowed);

  return { founderApproved, courierDraftApproved, deliveryGatewayAllowed, blockingReasons };
}

/** Test-only escape hatch — resets the module-level registry between test cases. Not used by any route or resolver. */
export function __resetMissionStateBridgeForTests(): void {
  registry.clear();
}
