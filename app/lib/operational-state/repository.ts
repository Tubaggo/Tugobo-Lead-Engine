import "server-only";

import type { ScoredLead } from "../leads.ts";
import { backupBeforeMutation } from "./backup.ts";
import { resolveDataDir, resolveStateFilePath } from "./env.ts";
import { isValidLeadId } from "./lead-id.ts";
import { SEED_LEAD_IDS } from "./seed-lead-ids.ts";
import {
  normalizeResetIds,
  planLeadReset,
  removeLeadsFromDailyQueue,
  type ResetLeadResult,
  type ResetProfile,
} from "./reset.ts";
import {
  isStorageWritable,
  readStateFileOrEmpty,
  updateStateFile,
} from "./file-store.ts";
import {
  applyLeadStatePatch,
  mergeActivity,
  normalizeActivityEntry,
  normalizeDailyQueue,
  normalizeRoster,
  nowIso,
  type ActivityEntry,
  type DailyQueueState,
  type LeadOperationalState,
  type LeadStatePatch,
  type OperationalStateFile,
} from "./schema.ts";

/**
 * The operational-state API used by route handlers.
 *
 * This is the boundary: routes and UI never touch `fs` or resolve a path.
 * Everything here resolves the configured data directory itself, so the
 * storage location is decided in exactly one place (`env.ts`).
 */

/** Raised when the caller's `expectedRevision` no longer matches the store. */
export class RevisionConflictError extends Error {
  readonly currentRevision: number;
  constructor(currentRevision: number) {
    super("revision conflict");
    this.name = "RevisionConflictError";
    this.currentRevision = currentRevision;
  }
}

/** Raised when a write names a well-formed id the workspace has never seen. */
export class UnknownLeadError extends Error {
  constructor() {
    super("unknown lead");
    this.name = "UnknownLeadError";
  }
}

/* -------------------------------------------------------------------------- */
/* lead membership                                                            */
/* -------------------------------------------------------------------------- */

const SEED_IDS = new Set(SEED_LEAD_IDS);

/**
 * Whether the workspace has any basis for judging membership at all.
 *
 * A fresh install has no roster, no records and no queue. Refusing writes there
 * would mean the first save after the very first import can never land, so an
 * empty workspace accepts any well-formed id and the roster takes over as soon
 * as one exists.
 */
function canJudgeMembership(file: OperationalStateFile): boolean {
  return (
    file.roster.length > 0 ||
    Object.keys(file.leads).length > 0 ||
    file.dailyQueue !== null
  );
}

/**
 * True when this lead is one the workspace already knows.
 *
 * Four sources, because a lead legitimately appears in any of them first: the
 * imported roster, an existing operational record, today's queue, or the seed
 * catalogue. What is *not* a source is the request itself — that is the whole
 * point.
 */
export function isKnownLead(file: OperationalStateFile, leadId: string): boolean {
  if (!canJudgeMembership(file)) return true;
  if (file.leads[leadId]) return true;
  if (file.roster.some((lead) => lead.id === leadId)) return true;

  const queue = file.dailyQueue;
  if (
    queue &&
    (queue.todayQueue.includes(leadId) ||
      queue.todayLog.includes(leadId) ||
      Object.hasOwn(queue.queueItems, leadId))
  ) {
    return true;
  }

  return SEED_IDS.has(leadId);
}

/**
 * The guard every mutation runs *inside* its transaction.
 *
 * Checked against the state the write is about to modify rather than in the
 * route, so there is no window between "the lead exists" and "the record is
 * written", and a refusal throws before `updateStateFile` produces a new file.
 */
function assertWritableLead(file: OperationalStateFile, leadId: string): void {
  if (!isValidLeadId(leadId) || !isKnownLead(file, leadId)) {
    throw new UnknownLeadError();
  }
}

export async function getState(): Promise<OperationalStateFile> {
  return readStateFileOrEmpty(resolveStateFilePath());
}

export async function getLeadState(
  leadId: string,
): Promise<LeadOperationalState | null> {
  const file = await getState();
  return file.leads[leadId] ?? null;
}

/**
 * Applies a patch to one lead.
 *
 * When `expectedRevision` is supplied it must match the stored revision, so a
 * client working from a stale copy is rejected rather than silently clobbering
 * a newer edit made on another device.
 */
export async function patchLeadState(
  leadId: string,
  patch: LeadStatePatch,
  expectedRevision?: number,
): Promise<LeadOperationalState> {
  const file = await updateStateFile(resolveStateFilePath(), (current) => {
    assertWritableLead(current, leadId);
    const existing = current.leads[leadId];
    if (
      expectedRevision !== undefined &&
      existing !== undefined &&
      existing.revision !== expectedRevision
    ) {
      throw new RevisionConflictError(existing.revision);
    }
    const next = applyLeadStatePatch(existing, leadId, patch, nowIso());
    return { ...current, leads: { ...current.leads, [leadId]: next } };
  });
  return file.leads[leadId];
}

/**
 * Appends timeline entries for one lead.
 *
 * Deduplicated on entry `id` (see {@link mergeActivity}), so a retried request
 * or a re-run migration cannot double an event.
 */
export async function appendLeadActivity(
  leadId: string,
  entries: unknown[],
): Promise<LeadOperationalState> {
  const now = nowIso();
  const incoming = entries
    .map((entry) => normalizeActivityEntry(entry, now))
    .filter((entry): entry is ActivityEntry => entry !== null);

  const file = await updateStateFile(resolveStateFilePath(), (current) => {
    assertWritableLead(current, leadId);
    const existing: LeadOperationalState = current.leads[leadId] ?? {
      leadId,
      activity: [],
      createdAt: now,
      updatedAt: now,
      revision: 0,
    };
    const merged = mergeActivity(existing.activity, incoming);
    // No new entries survived deduplication — leave the revision alone so a
    // replayed request is a true no-op.
    if (merged.length === existing.activity.length && current.leads[leadId]) {
      return current;
    }
    const next: LeadOperationalState = {
      ...existing,
      activity: merged,
      updatedAt: now,
      revision: existing.revision + 1,
    };
    return { ...current, leads: { ...current.leads, [leadId]: next } };
  });
  return file.leads[leadId];
}

/* -------------------------------------------------------------------------- */
/* reset                                                                      */
/* -------------------------------------------------------------------------- */

export type ResetOutcome = {
  results: ResetLeadResult[];
  changedCount: number;
  /** Filename of the pre-reset snapshot, or `null` on a fresh install. */
  backupFile: string | null;
};

/**
 * Clears test operating state for a batch of leads.
 *
 * Ordering is the safety property: the snapshot is taken *before* the write
 * lock is acquired and the transaction begins, so a failed backup throws
 * before anything is modified. The mutation itself is a single
 * `updateStateFile` call, which means one read-modify-write under the per-file
 * lock and one atomic rename — a batch is all-or-nothing, and a concurrent
 * PATCH is serialized behind it rather than interleaved.
 *
 * `file.roster` is never read or written here. Deleting a lead's *record* is
 * not deleting the lead.
 */
export async function resetLeadOperationalStates(
  leadIds: readonly string[],
  profile: ResetProfile,
): Promise<ResetOutcome> {
  // Filtered before the snapshot, not inside the transaction: a batch of
  // unusable ids must cost nothing at all — no backup file, no write, no
  // revision.
  //
  // Only the *format* is filtered here. A well-formed id the store has never
  // seen stays in the batch and comes back as a reported no-op, because a
  // reset deletes rather than creates: "that lead had nothing to clear" is an
  // answer the founder asked for, not an error.
  const ids = normalizeResetIds(leadIds.filter(isValidLeadId));
  if (ids.length === 0) {
    return { results: [], changedCount: 0, backupFile: null };
  }

  // Fail closed: no snapshot, no reset.
  const backupFile = await backupBeforeMutation();

  const results: ResetLeadResult[] = [];
  await updateStateFile(resolveStateFilePath(), (current) => {
    results.length = 0;
    const now = nowIso();
    const leads = { ...current.leads };

    for (const leadId of ids) {
      const plan = planLeadReset(leads[leadId], leadId, profile, now);
      results.push(plan.result);
      if (plan.next === null) delete leads[leadId];
      else leads[leadId] = plan.next;
    }

    return {
      ...current,
      leads,
      dailyQueue: removeLeadsFromDailyQueue(current.dailyQueue, ids, now),
    };
  });

  return {
    results,
    changedCount: results.filter((r) => r.changed).length,
    backupFile,
  };
}

/** Replaces the imported lead roster. */
export async function putRoster(raw: unknown): Promise<number> {
  const roster = normalizeRoster(raw);
  const file = await updateStateFile(resolveStateFilePath(), (current) => ({
    ...current,
    roster,
    rosterUpdatedAt: nowIso(),
  }));
  return file.roster.length;
}

export async function getRoster(): Promise<ScoredLead[]> {
  return (await getState()).roster;
}

/** Replaces the daily outreach queue record. */
export async function putDailyQueue(raw: unknown): Promise<DailyQueueState | null> {
  const now = nowIso();
  const queue = normalizeDailyQueue(raw, now);
  const file = await updateStateFile(resolveStateFilePath(), (current) => ({
    ...current,
    dailyQueue: queue,
  }));
  return file.dailyQueue;
}

/**
 * Merges legacy browser state into the store without overwriting it.
 *
 * Server data always wins: a lead already present server-side is left exactly
 * as-is, because the server copy may carry edits made on another device that
 * this browser never saw. Only leads the server has never heard of are
 * adopted. Activity is merged by id, so re-running is a no-op.
 *
 * Returns what actually changed, for the client to report and to decide
 * whether clearing the legacy keys is safe.
 */
export async function migrateLegacyState(input: {
  leads?: Record<string, unknown>;
  activity?: Record<string, unknown[]>;
  roster?: unknown;
  dailyQueue?: unknown;
}): Promise<{
  leadsAdded: number;
  activityAdded: number;
  rosterAdded: number;
  dailyQueueAdopted: boolean;
}> {
  const now = nowIso();
  let leadsAdded = 0;
  let activityAdded = 0;
  let rosterAdded = 0;
  let dailyQueueAdopted = false;

  await updateStateFile(resolveStateFilePath(), (current) => {
    const leads = { ...current.leads };

    for (const [leadId, value] of Object.entries(input.leads ?? {})) {
      // Legacy browser state is untrusted input like any other body: it is
      // where a stringified `undefined` would have been keyed years ago, and
      // adopting it would rebuild exactly the record this guard removes.
      if (!isValidLeadId(leadId)) continue;
      if (leads[leadId]) continue; // server wins
      const patch = value as LeadStatePatch;
      leads[leadId] = applyLeadStatePatch(undefined, leadId, patch, now);
      leadsAdded += 1;
    }

    for (const [leadId, rawEntries] of Object.entries(input.activity ?? {})) {
      if (!isValidLeadId(leadId)) continue;
      if (!Array.isArray(rawEntries)) continue;
      const incoming = rawEntries
        .map((entry) => normalizeActivityEntry(entry, now))
        .filter((entry): entry is ActivityEntry => entry !== null);
      if (incoming.length === 0) continue;

      const existing: LeadOperationalState = leads[leadId] ?? {
        leadId,
        activity: [],
        createdAt: now,
        updatedAt: now,
        revision: 0,
      };
      const merged = mergeActivity(existing.activity, incoming);
      const gained = merged.length - existing.activity.length;
      if (gained <= 0 && leads[leadId]) continue;
      activityAdded += Math.max(0, gained);
      leads[leadId] = { ...existing, activity: merged, updatedAt: now };
    }

    // Roster entries the server does not have yet are appended; existing
    // entries keep the server's copy.
    const legacyRoster = normalizeRoster(input.roster);
    let roster = current.roster;
    if (legacyRoster.length > 0) {
      const known = new Set(current.roster.map((lead) => lead.id));
      const additions = legacyRoster.filter((lead) => !known.has(lead.id));
      rosterAdded = additions.length;
      if (additions.length > 0) roster = [...current.roster, ...additions];
    }

    // The queue is a single day's list, so it is adopted only when the server
    // has none at all.
    let dailyQueue = current.dailyQueue;
    if (!dailyQueue && input.dailyQueue) {
      const parsed = normalizeDailyQueue(input.dailyQueue, now);
      if (parsed) {
        dailyQueue = parsed;
        dailyQueueAdopted = true;
      }
    }

    return {
      ...current,
      leads,
      roster,
      rosterUpdatedAt: rosterAdded > 0 ? now : current.rosterUpdatedAt,
      dailyQueue,
    };
  });

  return { leadsAdded, activityAdded, rosterAdded, dailyQueueAdopted };
}

/**
 * Storage readiness for the health probe. Reports only whether the directory
 * can be written — never the path, the lead count, or any content.
 */
export async function isStorageReady(): Promise<boolean> {
  return isStorageWritable(resolveDataDir());
}
