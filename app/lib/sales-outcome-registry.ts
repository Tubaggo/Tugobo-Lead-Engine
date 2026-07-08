import {
  applySalesOutcomeStatusUpdate,
  buildSalesOutcomeItem,
  isValidSalesOutcomeStatusUpdate,
  sortSalesOutcomeItems,
  type SalesOutcomeInput,
  type SalesOutcomeItem,
  type SalesOutcomeStatus,
  type SalesOutcomeStatusUpdateInput,
} from "./sales-outcome-runtime.ts";

/**
 * Sales Outcome Registry (v6.6).
 *
 * Server-only, in-memory store of sales outcomes — the terminal stage of
 * the revenue loop. `Map` keyed by a deterministic id (`outcome:<missionId>`,
 * falling back to `leadId` then a source identifier), same convention as
 * `demo-scheduling-registry.ts`/`follow-up-registry.ts`: each entry is a
 * real opportunity, not disposable log noise.
 *
 * TTL is status-dependent, not uniform: `open`/`paused`/`no_decision` items
 * expire after 30 days (pruned like every other registry — if the founder
 * never resolved it, it eventually ages out of the feed). `won`/`lost`
 * items never expire on their own — per this sprint's spec, closed deals
 * "remain in memory until hard cleanup" since there's no DB persistence
 * yet; only an explicit `clearExpiredSalesOutcomes` call (never auto-run)
 * can remove them.
 */

/** 30 days — only applies while status is open/paused/no_decision. */
const OPEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type RegistryEntry = SalesOutcomeItem & { expiresAt: number | null };

const items = new Map<string, RegistryEntry>();

function computeExpiresAt(status: SalesOutcomeStatus, now: number): number | null {
  if (status === "won" || status === "lost") return null;
  return now + OPEN_TTL_MS;
}

function pruneExpired(now: number): void {
  for (const [id, entry] of items) {
    if (entry.expiresAt !== null && entry.expiresAt <= now) items.delete(id);
  }
}

function stripInternal(entry: RegistryEntry): SalesOutcomeItem {
  const { expiresAt, ...rest } = entry;
  void expiresAt;
  return rest;
}

/**
 * Derives a candidate and stores it only if no item already exists for
 * that identity — a mission that already has an outcome (of *any* status,
 * even `won`) is never overwritten by a later demo/follow-up completion
 * event. This is what makes "create if none exists" safe to call
 * unconditionally from every integration point, with no separate read
 * needed first.
 */
export function upsertSalesOutcomeItem(input: SalesOutcomeInput, now: number = Date.now()): SalesOutcomeItem {
  pruneExpired(now);
  const candidate = buildSalesOutcomeItem(input, now);
  const existing = items.get(candidate.id);
  if (existing) return stripInternal(existing);

  const entry: RegistryEntry = { ...candidate, expiresAt: computeExpiresAt(candidate.status, now) };
  items.set(candidate.id, entry);
  return stripInternal(entry);
}

export function getSalesOutcomeItem(id: string, now: number = Date.now()): SalesOutcomeItem | undefined {
  pruneExpired(now);
  const entry = items.get(id);
  return entry ? stripInternal(entry) : undefined;
}

export function getSalesOutcomeByMissionId(missionId: string, now: number = Date.now()): SalesOutcomeItem | undefined {
  pruneExpired(now);
  for (const entry of items.values()) {
    if (entry.missionId === missionId) return stripInternal(entry);
  }
  return undefined;
}

/** Business-priority order (undecided items first) via `sortSalesOutcomeItems` — never insertion order. */
export function getRecentSalesOutcomeItems(limit: number = 50, now: number = Date.now()): SalesOutcomeItem[] {
  pruneExpired(now);
  return sortSalesOutcomeItems(Array.from(items.values()).map(stripInternal)).slice(0, limit);
}

export type UpdateSalesOutcomeResult = { ok: true; item: SalesOutcomeItem } | { ok: false; error: "not_found" | "invalid_update" };

/**
 * The only path that can move an item to `won`/`lost`/`paused`/
 * `no_decision`/`open` — always founder-initiated via the status API
 * route. Two distinct failure modes (unlike the `null`-on-failure
 * convention in `demo-scheduling-registry.ts`/`follow-up-registry.ts`)
 * because the route needs to tell an unknown-id 404 apart from a
 * business-rule-violation 400 (e.g. marking `won` with no package or
 * revenue estimate).
 */
export function updateSalesOutcomeStatus(id: string, update: SalesOutcomeStatusUpdateInput, now: number = Date.now()): UpdateSalesOutcomeResult {
  pruneExpired(now);
  const existing = items.get(id);
  if (!existing) return { ok: false, error: "not_found" };
  if (!isValidSalesOutcomeStatusUpdate(update)) return { ok: false, error: "invalid_update" };

  const updated = applySalesOutcomeStatusUpdate(stripInternal(existing), update, now);
  const entry: RegistryEntry = { ...updated, expiresAt: computeExpiresAt(updated.status, now) };
  items.set(id, entry);
  return { ok: true, item: stripInternal(entry) };
}

/** Sweeps every expired item out of the registry (won/lost items, having no expiry, are never touched); returns how many were removed. */
export function clearExpiredSalesOutcomes(now: number = Date.now()): number {
  const before = items.size;
  pruneExpired(now);
  return before - items.size;
}

/** Test-only escape hatch — resets the module-level registry between test cases. */
export function __resetSalesOutcomeRegistryForTests(): void {
  items.clear();
}
