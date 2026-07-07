import type {
  CourierDraftStatus,
  DeliveryGatewayStatus,
  FounderApprovalStatus,
} from "./hermes-mission-state-bridge.ts";
import {
  COURIER_DRAFT_STATUSES,
  DELIVERY_GATEWAY_STATUSES,
  FOUNDER_APPROVAL_STATUSES,
} from "./hermes-mission-state-bridge.ts";

/**
 * Mission State Snapshot — request parsing (v5.1.2).
 *
 * Pure, framework-agnostic (no `next/server` import) so it can be tested
 * directly under `node --test`, same convention as
 * `whatsapp-controlled-live-send-request.ts`.
 *
 * Only ever reads five fields: missionId, leadId, and the three status
 * enums. It never reads (and therefore can never forward) a provider
 * credential, message text, recipient phone, or an approval boolean — those
 * fields are simply never destructured from the body, structurally, not by
 * filtering.
 *
 * Status validation: a field that is *omitted* defaults to the safe
 * "missing" value. A field that is *present but not a recognized literal*
 * (a typo, a boolean, a number, an invented status) makes the whole request
 * invalid — the route returns a safe 400 rather than silently guessing.
 */

export type MissionStateSnapshotRequestFields = {
  missionId: string;
  leadId: string;
  founderApprovalStatus: FounderApprovalStatus;
  courierDraftStatus: CourierDraftStatus;
  deliveryGatewayStatus: DeliveryGatewayStatus;
};

/** Returns `undefined` for anything that isn't valid, parseable JSON — never throws. */
export function parseJsonBodySafely(raw: string): unknown | undefined {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function normalizeStatus<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T | null {
  if (value === undefined) return fallback;
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  return null;
}

/** Returns `null` when the body isn't a plain object, missionId/leadId are missing, or a status field is present but invalid. */
export function parseMissionStateSnapshotRequestFields(body: unknown): MissionStateSnapshotRequestFields | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;

  if (typeof b.missionId !== "string" || !b.missionId.trim()) return null;
  if (typeof b.leadId !== "string" || !b.leadId.trim()) return null;

  const founderApprovalStatus = normalizeStatus(b.founderApprovalStatus, FOUNDER_APPROVAL_STATUSES, "missing");
  if (founderApprovalStatus === null) return null;

  const courierDraftStatus = normalizeStatus(b.courierDraftStatus, COURIER_DRAFT_STATUSES, "missing");
  if (courierDraftStatus === null) return null;

  const deliveryGatewayStatus = normalizeStatus(b.deliveryGatewayStatus, DELIVERY_GATEWAY_STATUSES, "missing");
  if (deliveryGatewayStatus === null) return null;

  return {
    missionId: b.missionId,
    leadId: b.leadId,
    founderApprovalStatus,
    courierDraftStatus,
    deliveryGatewayStatus,
  };
}
