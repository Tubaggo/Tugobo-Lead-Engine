/**
 * Sales outcome model.
 *
 * v3.8.1 — Hermes Daily Loop Wiring. Enum and validation rule ported from the
 * Hermes line's `app/lib/sales-outcome-runtime.ts` (`main`, v6.6): `won`
 * requires a real package or a positive MRR estimate, `lost` requires a real
 * reason or a note — an outcome that closes the loop without saying why or
 * what was sold is not recorded. What changes is the storage owner, not the
 * rule.
 *
 * Pure: no React, no I/O, no `server-only`.
 */

import type {
  SalesLostReason,
  SalesOutcomeRecord,
  SalesOutcomeStatus,
  SalesPackage,
} from "./schema.ts";

const ALLOWED_OUTCOME_TRANSITIONS: Record<SalesOutcomeStatus, readonly SalesOutcomeStatus[]> = {
  open: ["won", "lost", "paused", "no_decision"],
  paused: ["open", "won", "lost", "no_decision"],
  no_decision: ["open", "won", "lost", "paused"],
  // Terminal: a decided outcome is not silently reopened. See
  // `founder-os-release-audit.test.ts`-style "won/lost lead never resurfaces"
  // guarantee — the queue projection relies on this being a dead end.
  won: [],
  lost: [],
  unknown: ["open"],
};

export function canTransitionOutcomeStatus(
  from: SalesOutcomeStatus,
  to: SalesOutcomeStatus,
): boolean {
  return ALLOWED_OUTCOME_TRANSITIONS[from].includes(to);
}

export class InvalidOutcomeTransitionError extends Error {
  readonly from: SalesOutcomeStatus;
  readonly to: SalesOutcomeStatus;
  constructor(from: SalesOutcomeStatus, to: SalesOutcomeStatus) {
    super(`illegal sales outcome transition: ${from} → ${to}`);
    this.name = "InvalidOutcomeTransitionError";
    this.from = from;
    this.to = to;
  }
}

export type RecordOutcomeInput = {
  missionId: string;
  leadId: string;
  status: SalesOutcomeStatus;
  package?: SalesPackage | null;
  estimatedMrr?: number | null;
  lostReason?: SalesLostReason | null;
  note?: string;
};

/**
 * Whether an outcome update carries enough substance to close the loop.
 *
 * `won` without a package or a positive estimate is not a recorded sale, it
 * is an unfinished form. `lost` without a real reason or a note is the same
 * problem in the other direction — ported verbatim from the Hermes line's
 * `isValidSalesOutcomeStatusUpdate`.
 */
export function isValidOutcomeUpdate(input: RecordOutcomeInput): boolean {
  if (input.status === "won") {
    const hasPackage = Boolean(input.package && input.package !== "unknown");
    const hasMrr = typeof input.estimatedMrr === "number" && input.estimatedMrr > 0;
    return hasPackage || hasMrr;
  }
  if (input.status === "lost") {
    const hasReason = Boolean(input.lostReason && input.lostReason !== "unknown");
    const hasNote = Boolean(input.note && input.note.trim().length > 0);
    return hasReason || hasNote;
  }
  return true;
}

export function buildOutcomeRecord(
  input: RecordOutcomeInput,
  nowIsoString: string,
): SalesOutcomeRecord {
  const isClosed = input.status === "won" || input.status === "lost";
  return {
    outcomeId: `outcome:${input.missionId}`,
    missionId: input.missionId,
    leadId: input.leadId,
    status: input.status,
    package: input.package ?? null,
    estimatedMrr: input.estimatedMrr ?? null,
    lostReason: input.lostReason ?? null,
    note: input.note ?? "",
    createdAt: nowIsoString,
    updatedAt: nowIsoString,
    closedAt: isClosed ? Date.parse(nowIsoString) : null,
    revision: 0,
  };
}

export function applyOutcomeStatusTransition(
  record: SalesOutcomeRecord,
  input: RecordOutcomeInput,
  nowIsoString: string,
): SalesOutcomeRecord {
  if (!canTransitionOutcomeStatus(record.status, input.status)) {
    throw new InvalidOutcomeTransitionError(record.status, input.status);
  }
  const isClosed = input.status === "won" || input.status === "lost";
  return {
    ...record,
    status: input.status,
    package: input.package ?? record.package,
    estimatedMrr: input.estimatedMrr ?? record.estimatedMrr,
    lostReason: input.lostReason ?? record.lostReason,
    note: input.note ?? record.note,
    updatedAt: nowIsoString,
    closedAt: isClosed ? Date.parse(nowIsoString) : record.closedAt,
    revision: record.revision + 1,
  };
}

export function isTerminalOutcomeStatus(status: SalesOutcomeStatus): boolean {
  return status === "won" || status === "lost";
}
