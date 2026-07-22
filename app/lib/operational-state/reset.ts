/**
 * Clearing test operating state without losing the lead.
 *
 * Leads were queued, staged, noted and drafted against during development.
 * None of it was real selling, but all of it is indistinguishable from real
 * selling to every list in the app. This module removes that layer and leaves
 * the lead itself — the business, the scores, the enrichment, the verified
 * channels — exactly as it was.
 *
 * The split that makes this safe is already in the store: the roster
 * (`file.roster`) holds what we *learned* about a business, and `file.leads`
 * holds what we *did* about it. Only the second is ever touched here, and the
 * roster is never read or written by this module at all.
 *
 * Pure: no `fs`, no `server-only`. The repository applies the plan.
 */

import type { LeadStatusUpdate } from "../leads.ts";
import type { DailyQueueState, LeadOperationalState } from "./schema.ts";

export const RESET_PROFILES = ["followup_only", "untouched"] as const;
export type ResetProfile = (typeof RESET_PROFILES)[number];

export function isResetProfile(value: unknown): value is ResetProfile {
  return typeof value === "string" && (RESET_PROFILES as readonly string[]).includes(value);
}

/** Bounds one request. Chosen to keep a single atomic write reasonable. */
export const MAX_RESET_LEADS = 200;

export type ResetLeadResult = {
  leadId: string;
  profile: ResetProfile;
  changed: boolean;
  clearedFields: string[];
  preservedFields: string[];
};

/**
 * The plan for one lead.
 *
 * `next: null` means "remove the operational record entirely" — see
 * {@link planUntouchedReset} for why that is the correct untouched state
 * rather than a record full of defaults.
 */
export type LeadResetPlan = {
  next: LeadOperationalState | null;
  result: ResetLeadResult;
};

/* -------------------------------------------------------------------------- */
/* follow-up only                                                             */
/* -------------------------------------------------------------------------- */

/** Contact evidence, used to pick the stage a follow-up lead falls back to. */
function hasContactEvidence(workflow: Partial<LeadStatusUpdate> | undefined): boolean {
  if (!workflow) return false;
  const stamp = (value: unknown): boolean =>
    typeof value === "number" && Number.isFinite(value) && value > 0;
  return (
    (workflow.contactAttempts ?? 0) > 0 ||
    stamp(workflow.lastContactedAt) ||
    stamp(workflow.contactedAt) ||
    stamp(workflow.repliedAt)
  );
}

/**
 * Takes the lead out of the follow-up queue and schedule, keeping its history.
 *
 * `status: "needs_follow_up"` is demoted, which looks like a stage change but
 * is not one: that status has no meaning in this app beyond "is in the
 * follow-up list", and leaving it would make the profile a no-op. The real
 * sales stage lives in `salesStage` / `pipelineStage` and is untouched, as are
 * won, lost, meeting, DNC, notes, activity and message drafts.
 *
 * Known limitation: a `contacted` lead's due date is *derived* from its last
 * contact timestamp when no explicit date is stored, so clearing the schedule
 * cannot keep it out of the due list without deleting contact history. That is
 * what the untouched profile is for.
 */
export function planFollowUpOnlyReset(
  current: LeadOperationalState,
  now: string,
): LeadResetPlan {
  const cleared: string[] = [];
  const workflow: Partial<LeadStatusUpdate> = { ...(current.workflow ?? {}) };

  if (current.nextFollowUpAt != null || workflow.nextFollowUpAt != null) {
    cleared.push("nextFollowUpAt");
  }
  if (current.queued === true || workflow.queuedToday === true) {
    cleared.push("queued");
  }
  if (workflow.lastQueuedAt != null) cleared.push("lastQueuedAt");
  if (workflow.followUpAfterHours != null) cleared.push("followUpAfterHours");
  if (workflow.status === "needs_follow_up") cleared.push("followUpStatus");

  workflow.nextFollowUpAt = null;
  workflow.queuedToday = false;
  workflow.lastQueuedAt = null;
  delete workflow.followUpAfterHours;
  if (workflow.status === "needs_follow_up") {
    workflow.status = hasContactEvidence(current.workflow) ? "contacted" : "new";
  }

  const next: LeadOperationalState = {
    ...current,
    queued: false,
    nextFollowUpAt: null,
    workflow,
    updatedAt: now,
    revision: current.revision + 1,
  };

  return {
    next,
    result: {
      leadId: current.leadId,
      profile: "followup_only",
      changed: cleared.length > 0,
      clearedFields: cleared,
      preservedFields: describePreserved(current, "followup_only"),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* untouched                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Returns the lead to never-been-worked.
 *
 * Implemented by dropping the whole operational record rather than by blanking
 * fields one at a time. Two reasons, and both matter:
 *
 *  - *Absence is the real default.* A lead with no record already reads as
 *    `DEFAULT_STATE` everywhere in the dashboard, so this produces exactly the
 *    state a freshly imported lead has — not an approximation of it.
 *  - *No field can be missed.* Enumerating fields to clear means a field added
 *    next sprint silently survives the reset. Removing the record cannot leave
 *    a stale draft, note or timestamp behind, and it cannot touch the roster,
 *    which lives in a different part of the file.
 */
export function planUntouchedReset(current: LeadOperationalState): LeadResetPlan {
  const cleared: string[] = [];
  if (current.queued !== undefined) cleared.push("queued");
  if (current.salesStage !== undefined && current.salesStage !== null) {
    cleared.push("salesStage");
  }
  if (current.nextFollowUpAt) cleared.push("nextFollowUpAt");
  if (current.founderNotes) cleared.push("founderNotes");
  if (current.workflow && Object.keys(current.workflow).length > 0) {
    cleared.push("workflow");
    if (current.workflow.doNotContact) cleared.push("doNotContact");
    if (current.workflow.wonAt) cleared.push("wonAt");
    if (current.workflow.lostAt) cleared.push("lostAt");
    if (current.workflow.meetingAt) cleared.push("meetingAt");
    if ((current.workflow.contactAttempts ?? 0) > 0) cleared.push("contactAttempts");
  }
  if (current.manualOverrides) cleared.push("manualOverrides");
  if (current.aiSnapshot) cleared.push("aiSnapshot");
  if (current.messageWorkspace) cleared.push("messageWorkspace");
  if (current.activity.length > 0) cleared.push("activity");

  return {
    next: null,
    result: {
      leadId: current.leadId,
      profile: "untouched",
      changed: true,
      clearedFields: cleared,
      preservedFields: describePreserved(current, "untouched"),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* reporting                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * What the founder keeps. Reported so the confirmation is a statement of fact
 * rather than a promise — the roster entry is never in scope for either
 * profile, and the follow-up profile keeps the working history too.
 */
function describePreserved(
  current: LeadOperationalState,
  profile: ResetProfile,
): string[] {
  const preserved = ["roster", "scores", "enrichment", "channelVerification"];
  if (profile === "followup_only") {
    if (current.salesStage) preserved.push("salesStage");
    if (current.activity.length > 0) preserved.push("activity");
    if (current.founderNotes) preserved.push("founderNotes");
    if (current.messageWorkspace) preserved.push("messageWorkspace");
    if (current.workflow?.doNotContact) preserved.push("doNotContact");
    if (current.workflow?.wonAt || current.workflow?.lostAt) preserved.push("outcome");
  }
  return preserved;
}

/** Applies the profile, or reports a no-op for a lead with no record at all. */
export function planLeadReset(
  current: LeadOperationalState | undefined,
  leadId: string,
  profile: ResetProfile,
  now: string,
): LeadResetPlan {
  if (!current) {
    // Already untouched. Idempotent by construction: nothing to remove.
    return {
      next: null,
      result: {
        leadId,
        profile,
        changed: false,
        clearedFields: [],
        preservedFields: ["roster", "scores", "enrichment", "channelVerification"],
      },
    };
  }
  return profile === "untouched"
    ? planUntouchedReset(current)
    : planFollowUpOnlyReset(current, now);
}

/* -------------------------------------------------------------------------- */
/* daily queue                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Drops the given leads from today's outreach queue.
 *
 * The queue is a workspace-level record keyed by lead id, so a lead removed
 * from `file.leads` would otherwise linger in today's list as a ghost row with
 * no state behind it. Applies to both profiles: queue membership is scheduling,
 * not history.
 */
export function removeLeadsFromDailyQueue(
  queue: DailyQueueState | null,
  leadIds: readonly string[],
  now: string,
): DailyQueueState | null {
  if (!queue) return null;
  const drop = new Set(leadIds);

  const todayQueue = queue.todayQueue.filter((id) => !drop.has(id));
  const todayLog = queue.todayLog.filter((id) => !drop.has(id));
  const queueItems = Object.fromEntries(
    Object.entries(queue.queueItems).filter(([id]) => !drop.has(id)),
  );

  const unchanged =
    todayQueue.length === queue.todayQueue.length &&
    todayLog.length === queue.todayLog.length &&
    Object.keys(queueItems).length === Object.keys(queue.queueItems).length;
  if (unchanged) return queue;

  return { ...queue, todayQueue, todayLog, queueItems, updatedAt: now };
}

/* -------------------------------------------------------------------------- */
/* request normalization                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Deduplicates and bounds a requested id list, preserving order.
 *
 * Validation of each id is the caller's job (`isValidLeadId`); this only makes
 * the batch well-formed.
 */
export function normalizeResetIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_RESET_LEADS) break;
  }
  return out;
}
