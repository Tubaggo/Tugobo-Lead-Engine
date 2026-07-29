/**
 * The durable daily run — "Hermes'i Çalıştır" session state.
 *
 * v3.8.1 — Hermes Daily Loop Wiring.
 *
 * One run per calendar date, keyed by `localDate` so a second "Hermes'i
 * Çalıştır" for the same day resumes rather than duplicates — the id *is*
 * the date, so idempotency is structural, not a check a caller can forget.
 * The queue itself is never computed here: this module only tracks which
 * item ids belong to the run, which one is current, and which the founder
 * has skipped this session. The actual ranking is `daily-queue.ts`'s, which
 * is itself a thin wrapper over the existing `action-stage.ts` ladder — this
 * file has no opinion about priority at all.
 *
 * Pure: no React, no I/O, no `server-only`.
 */

import type { HermesDailyRun, HermesDailyRunStatus, HermesDailyRunSummary } from "./schema.ts";
import { emptyDailyRunSummary } from "./schema.ts";

/** `waiting_founder` only when there is something left to act on; otherwise `completed`. */
export function deriveDailyRunStatus(summary: HermesDailyRunSummary): HermesDailyRunStatus {
  return summary.actionable > 0 || summary.waitingFounder > 0 ? "waiting_founder" : "completed";
}

/** First item id that is not in `skippedItemIds`, or `null` if none remain. */
function firstSelectable(itemIds: readonly string[], skippedItemIds: readonly string[]): string | null {
  const skipped = new Set(skippedItemIds);
  return itemIds.find((id) => !skipped.has(id)) ?? null;
}

export type StartDailyRunInput = {
  localDate: string;
  itemIds: string[];
  summary: HermesDailyRunSummary;
};

/** A brand-new run for a date that has never had one. */
export function buildDailyRun(input: StartDailyRunInput, nowIsoString: string): HermesDailyRun {
  return {
    id: input.localDate,
    localDate: input.localDate,
    status: deriveDailyRunStatus(input.summary),
    startedAt: nowIsoString,
    updatedAt: nowIsoString,
    completedAt: null,
    queueRevision: 1,
    currentItemId: firstSelectable(input.itemIds, []),
    itemIds: input.itemIds,
    skippedItemIds: [],
    summary: input.summary,
    revision: 0,
  };
}

export type RefreshDailyRunInput = {
  itemIds: string[];
  summary: HermesDailyRunSummary;
};

/**
 * Recomputes an existing run's item list from a fresh queue read.
 *
 * `currentItemId` is sticky: if the founder's current item is still in the
 * new list and not skipped, it stays selected — a queue recompute triggered
 * by someone else's action must not yank the founder to a different lead
 * mid-decision. Skipped ids that fell out of the new list are dropped, so a
 * lead that later needs attention again is not permanently hidden.
 */
export function refreshDailyRun(
  run: HermesDailyRun,
  input: RefreshDailyRunInput,
  nowIsoString: string,
): HermesDailyRun {
  const itemSet = new Set(input.itemIds);
  const skippedItemIds = run.skippedItemIds.filter((id) => itemSet.has(id));
  const currentItemId =
    run.currentItemId && itemSet.has(run.currentItemId) && !skippedItemIds.includes(run.currentItemId)
      ? run.currentItemId
      : firstSelectable(input.itemIds, skippedItemIds);
  const status = deriveDailyRunStatus(input.summary);

  return {
    ...run,
    status,
    updatedAt: nowIsoString,
    completedAt: status === "completed" ? (run.completedAt ?? nowIsoString) : null,
    queueRevision: run.queueRevision + 1,
    currentItemId,
    itemIds: input.itemIds,
    skippedItemIds,
    summary: input.summary,
    revision: run.revision + 1,
  };
}

export class UnknownDailyRunItemError extends Error {
  constructor() {
    super("item is not in the current daily run queue");
    this.name = "UnknownDailyRunItemError";
  }
}

/** The founder clicked a specific queue row. */
export function selectDailyRunItem(
  run: HermesDailyRun,
  itemId: string,
  nowIsoString: string,
): HermesDailyRun {
  if (!run.itemIds.includes(itemId)) throw new UnknownDailyRunItemError();
  if (run.currentItemId === itemId) return run;
  return { ...run, currentItemId: itemId, updatedAt: nowIsoString, revision: run.revision + 1 };
}

/**
 * Skip or snooze: both move the founder past this item for the rest of the
 * session without mutating any lead-level state. Distinct verbs, identical
 * mechanics — neither invents a second clock or a second timeline; the
 * underlying lead is untouched, so the item simply reappears in tomorrow's
 * run if it is still ranked.
 */
export function skipDailyRunItem(
  run: HermesDailyRun,
  itemId: string,
  nowIsoString: string,
): HermesDailyRun {
  if (!run.itemIds.includes(itemId)) throw new UnknownDailyRunItemError();
  const skippedItemIds = run.skippedItemIds.includes(itemId)
    ? run.skippedItemIds
    : [...run.skippedItemIds, itemId];
  const currentItemId =
    run.currentItemId === itemId ? firstSelectable(run.itemIds, skippedItemIds) : run.currentItemId;

  return {
    ...run,
    currentItemId,
    skippedItemIds,
    updatedAt: nowIsoString,
    revision: run.revision + 1,
  };
}

/** After a founder action resolves an item, advance the pointer past it (the recompute that follows may drop it from the queue entirely). */
export function advancePastDailyRunItem(
  run: HermesDailyRun,
  itemId: string,
  nowIsoString: string,
): HermesDailyRun {
  if (run.currentItemId !== itemId) return run;
  return {
    ...run,
    currentItemId: firstSelectable(run.itemIds, [...run.skippedItemIds, itemId]),
    updatedAt: nowIsoString,
    revision: run.revision + 1,
  };
}

export { emptyDailyRunSummary };
