"use client";

import { migrate, toPatchBody } from "./client.ts";

/**
 * One-shot migration of pre-v3.7.5 browser state into the server store.
 *
 * Runs once per browser after hydration. The contract is deliberately
 * conservative, because the alternative to "migrated nothing" is "destroyed
 * the founder's pipeline":
 *
 *  - the server always wins; legacy data only fills gaps the server does not
 *    already cover (enforced server-side in `migrateLegacyState`)
 *  - activity is deduplicated on entry id, so replaying changes nothing
 *  - legacy keys are cleared **only** after the server confirms the write
 *  - a failure leaves every legacy key untouched, so the next load retries
 *
 * UI-preference keys are never touched. They are correct in localStorage and
 * stay there.
 */

/** Marker written after a confirmed migration. Presence means "do not re-run". */
export const MIGRATION_MARKER_KEY = "tugobo-lead-engine:server-migration-v1";

/** Critical keys that move to the server and are cleared once adopted. */
export const LEGACY_CRITICAL_KEYS = {
  state: "tugobo-lead-engine:state-v1",
  roster: "tugobo-lead-engine:imported-leads-v2",
  legacyRoster: "tugobo-lead-engine:extra-leads-v1",
  activity: "tugobo-lead-engine:outreach-log-v1",
  dailyQueue: "tugobo-lead-engine:daily-outreach-v1",
} as const;

/**
 * Keys that stay in the browser on purpose: view preferences and regenerable
 * caches. Listed so the intent is explicit and a future reader does not
 * "finish the job" by deleting them.
 */
export const UI_ONLY_KEYS = [
  "tugobo-lead-engine:ui-locale",
  "tugobo-lead-engine:ai-interpretation-cache-v1",
  "tugobo-lead-engine:contact-finder-map-v1",
  "tugobo-lead-engine:lead-enrichment-overrides-v1",
  "tugobo-lead-engine:import-cache-v1",
  "tugobo-lead-engine:import-meta-v1",
  "tugobo-lead-engine:last-import-v1",
] as const;

export type MigrationResult = {
  ran: boolean;
  leadsAdded: number;
  activityAdded: number;
  rosterAdded: number;
  dailyQueueAdopted: boolean;
};

const NOOP: MigrationResult = {
  ran: false,
  leadsAdded: 0,
  activityAdded: 0,
  rosterAdded: 0,
  dailyQueueAdopted: false,
};

function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Activity ids were generated as `${leadId}-${Date.now()}-${random}`, which is
 * unique in practice but not guaranteed across two browsers that both logged
 * an event in the same millisecond. Entries missing an id are given a
 * deterministic one derived from their content, so re-running the migration
 * produces the same id and therefore deduplicates instead of duplicating.
 */
function normalizeLegacyActivity(
  leadId: string,
  raw: unknown,
): unknown[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry, index) => {
    if (!isRecord(entry)) return entry;
    const createdAt = typeof entry.createdAt === "string" ? entry.createdAt : "";
    const type = typeof entry.type === "string" ? entry.type : "note";
    const id =
      typeof entry.id === "string" && entry.id.length > 0
        ? entry.id
        : `legacy:${leadId}:${index}:${type}:${createdAt}`;
    return {
      id,
      type,
      title: typeof entry.title === "string" ? entry.title : type,
      detail:
        typeof entry.messagePreview === "string" ? entry.messagePreview : entry.detail,
      createdAt,
    };
  });
}

/** Collects the legacy payload without modifying anything. */
export function collectLegacyPayload(): {
  leads: Record<string, unknown>;
  activity: Record<string, unknown[]>;
  roster: unknown;
  dailyQueue: unknown;
  isEmpty: boolean;
} {
  const stateRaw = readJson(LEGACY_CRITICAL_KEYS.state);
  const leads: Record<string, unknown> = {};
  if (isRecord(stateRaw)) {
    for (const [leadId, value] of Object.entries(stateRaw)) {
      if (!isRecord(value)) continue;
      leads[leadId] = toPatchBody(value);
    }
  }

  const activityRaw = readJson(LEGACY_CRITICAL_KEYS.activity);
  const activity: Record<string, unknown[]> = {};
  if (isRecord(activityRaw)) {
    for (const [leadId, value] of Object.entries(activityRaw)) {
      const entries = normalizeLegacyActivity(leadId, value);
      if (entries.length > 0) activity[leadId] = entries;
    }
  }

  const roster =
    readJson(LEGACY_CRITICAL_KEYS.roster) ?? readJson(LEGACY_CRITICAL_KEYS.legacyRoster);
  const dailyQueue = readJson(LEGACY_CRITICAL_KEYS.dailyQueue);

  const isEmpty =
    Object.keys(leads).length === 0 &&
    Object.keys(activity).length === 0 &&
    !(Array.isArray(roster) && roster.length > 0) &&
    !isRecord(dailyQueue);

  return { leads, activity, roster, dailyQueue, isEmpty };
}

function markComplete(): void {
  try {
    window.localStorage.setItem(
      MIGRATION_MARKER_KEY,
      JSON.stringify({ migratedAt: new Date().toISOString() }),
    );
  } catch {
    // A failed marker only costs an extra idempotent re-run next load.
  }
}

/** Clears the adopted keys. Called only after the server confirmed the write. */
function clearLegacyKeys(): void {
  for (const key of Object.values(LEGACY_CRITICAL_KEYS)) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Leaving a key behind is harmless: the migration is idempotent.
    }
  }
}

export function hasMigrated(): boolean {
  try {
    return window.localStorage.getItem(MIGRATION_MARKER_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Runs the migration if it has not run in this browser.
 *
 * A browser with no legacy data (a second device) marks itself complete
 * without calling the server and simply reads server state — there is nothing
 * to adopt.
 */
export async function runLegacyMigration(): Promise<MigrationResult> {
  if (typeof window === "undefined") return NOOP;
  if (hasMigrated()) return NOOP;

  const payload = collectLegacyPayload();
  if (payload.isEmpty) {
    markComplete();
    return NOOP;
  }

  // Any throw here propagates: legacy keys stay put and the next load retries.
  const result = await migrate({
    leads: payload.leads,
    activity: payload.activity,
    roster: payload.roster,
    dailyQueue: payload.dailyQueue,
  });

  markComplete();
  clearLegacyKeys();

  return { ran: true, ...result };
}
