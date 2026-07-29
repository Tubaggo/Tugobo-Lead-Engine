/**
 * Follow-up model and the one canonical due-date helper.
 *
 * v3.8.1 — Hermes Daily Loop Wiring.
 *
 * Model and status vocabulary ported from the Hermes line's
 * `app/lib/follow-up-runtime.ts` and delay policy from
 * `app/lib/hermes-follow-up-policy.ts` (both `main`, v6.5). What changes is
 * the storage owner (the durable Hermes runtime file, not an in-memory `Map`)
 * and — this is the point of the milestone — that there is now exactly *one*
 * function that computes a due instant. The reconciliation discovery on
 * `main` found two: `Dashboard.tsx`'s `applyOutreachConfirmed` (+24h/+72h on
 * `nextFollowUpAt`) and a second, unconditional +3-day write into the
 * activity timeline. Nothing here is allowed to grow a second one — every
 * caller that needs a due instant, including the timeline entry text, reads
 * it from a `FollowUpRecord.dueAt` that was produced by
 * {@link computeFollowUpDueAt}.
 *
 * Pure: no React, no I/O, no `server-only`.
 */

import type { FollowUpReason, FollowUpRecord, FollowUpStatus } from "./schema.ts";

/**
 * Per-reason delay, ported value-for-value from `HermesFollowUpPolicy` on
 * `main`. A founder-picked preset (`+1 gün` / `+3 gün`) overrides the
 * reason-derived delay — the founder is naming the instant directly, not
 * asking Hermes to infer one — and `manual`/`later_requested`/`unknown` share
 * the policy's own 72h fallback.
 */
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const REASON_DELAY_MS: Record<FollowUpReason, number> = {
  read_no_reply: 24 * HOUR_MS,
  delivered_no_reply: 48 * HOUR_MS,
  hot_reply_needs_action: 30 * MINUTE_MS,
  demo_not_scheduled: 4 * HOUR_MS,
  demo_no_show: 24 * HOUR_MS,
  failed_delivery_recovery: 15 * MINUTE_MS,
  later_requested: 72 * HOUR_MS,
  manual: 72 * HOUR_MS,
  unknown: 72 * HOUR_MS,
};

/** Founder-facing presets for `PLAN_FOLLOW_UP`. Deterministic, nothing else. */
export type FollowUpPreset = 1 | 3;

/**
 * The one canonical due-date helper.
 *
 * `presetDays`, when given, wins over the reason-derived delay: it is the
 * founder naming "+1 gün" / "+3 gün" directly in the workspace. Otherwise the
 * delay is looked up by {@link FollowUpReason}, matching the Hermes policy's
 * per-trigger cadence rather than a single flat rule.
 */
export function computeFollowUpDueAt(
  now: number,
  reason: FollowUpReason,
  presetDays?: FollowUpPreset,
): number {
  if (presetDays === 1) return now + 24 * HOUR_MS;
  if (presetDays === 3) return now + 72 * HOUR_MS;
  return now + REASON_DELAY_MS[reason];
}

/** Which statuses still need a founder decision — the ladder's own definition of "active". */
export function isActiveFollowUpStatus(status: FollowUpStatus): boolean {
  return status === "candidate" || status === "approval_required";
}

const ALLOWED_FOLLOW_UP_TRANSITIONS: Record<FollowUpStatus, readonly FollowUpStatus[]> = {
  not_needed: [],
  candidate: ["approval_required", "approved", "dismissed", "completed", "expired"],
  approval_required: ["approved", "dismissed", "completed", "expired"],
  approved: ["completed", "dismissed", "expired"],
  dismissed: [],
  completed: [],
  expired: [],
  unknown: ["candidate", "approval_required", "approved", "dismissed", "completed"],
};

export function canTransitionFollowUpStatus(
  from: FollowUpStatus,
  to: FollowUpStatus,
): boolean {
  return ALLOWED_FOLLOW_UP_TRANSITIONS[from].includes(to);
}

export class InvalidFollowUpTransitionError extends Error {
  readonly from: FollowUpStatus;
  readonly to: FollowUpStatus;
  constructor(from: FollowUpStatus, to: FollowUpStatus) {
    super(`illegal follow-up transition: ${from} → ${to}`);
    this.name = "InvalidFollowUpTransitionError";
    this.from = from;
    this.to = to;
  }
}

export type BuildFollowUpInput = {
  missionId: string;
  leadId: string;
  reason: FollowUpReason;
  presetDays?: FollowUpPreset;
  note?: string;
};

/** A fresh, active follow-up record. Always starts life as `candidate`. */
export function buildFollowUpRecord(
  input: BuildFollowUpInput,
  nowIsoString: string,
): FollowUpRecord {
  const now = Date.parse(nowIsoString);
  return {
    followUpId: `followup:${input.missionId}`,
    missionId: input.missionId,
    leadId: input.leadId,
    reason: input.reason,
    status: "candidate",
    dueAt: computeFollowUpDueAt(now, input.reason, input.presetDays),
    note: input.note ?? "",
    createdAt: nowIsoString,
    updatedAt: nowIsoString,
    completedAt: null,
    cancelledAt: null,
    revision: 0,
  };
}

/** Re-plans an existing follow-up (e.g. re-opened after a reply). Bumps the due instant, nothing else structural. */
export function replanFollowUpRecord(
  record: FollowUpRecord,
  reason: FollowUpReason,
  nowIsoString: string,
  presetDays?: FollowUpPreset,
): FollowUpRecord {
  const now = Date.parse(nowIsoString);
  return {
    ...record,
    reason,
    status: "candidate",
    dueAt: computeFollowUpDueAt(now, reason, presetDays),
    updatedAt: nowIsoString,
    completedAt: null,
    cancelledAt: null,
    revision: record.revision + 1,
  };
}

export function applyFollowUpStatusTransition(
  record: FollowUpRecord,
  to: FollowUpStatus,
  nowIsoString: string,
): FollowUpRecord {
  if (!canTransitionFollowUpStatus(record.status, to)) {
    throw new InvalidFollowUpTransitionError(record.status, to);
  }
  const at = Date.parse(nowIsoString);
  return {
    ...record,
    status: to,
    completedAt: to === "completed" ? at : record.completedAt,
    cancelledAt: to === "dismissed" || to === "expired" ? at : record.cancelledAt,
    updatedAt: nowIsoString,
    revision: record.revision + 1,
  };
}

/**
 * Soft-expires active follow-ups whose due instant is far enough in the past
 * to be stale rather than merely overdue. Ported threshold: 14 days, the
 * Hermes registry's own TTL for an unresolved candidate.
 */
const STALE_THRESHOLD_MS = 14 * 24 * HOUR_MS;

export function isStaleFollowUp(record: FollowUpRecord, now: number): boolean {
  return isActiveFollowUpStatus(record.status) && now - record.dueAt > STALE_THRESHOLD_MS;
}
