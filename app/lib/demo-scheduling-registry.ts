import {
  applyDemoStatusUpdate,
  deriveDemoScheduleCandidateFromReplyIntelligence,
  sortDemoScheduleItems,
  type DemoScheduleCandidateInput,
  type DemoScheduleItem,
  type DemoStatusUpdateMetadata,
  type DemoStatusUpdateTarget,
} from "./demo-scheduling-runtime.ts";
import { upsertFollowUpCandidate } from "./follow-up-registry.ts";

/**
 * Demo Scheduling Registry (v6.4, feeds Follow-up candidates in v6.5).
 *
 * Server-only, in-memory store of demo scheduling opportunities. Unlike the
 * capped-array feeds in `whatsapp-reply-registry.ts` /
 * `reply-intelligence-registry.ts` (append-only logs where dropping old
 * noise is fine), this is a `Map` keyed by a deterministic id
 * (`demo:<providerMessageId>`) — each entry represents an opportunity the
 * founder is actively expected to act on, so a hard count cap could
 * silently hide a still-open demo. Bounded instead by a 14-day TTL, pruned
 * on read/write. Lost on server restart — same tradeoff as every other
 * Hermes registry.
 *
 * v6.5: a freshly-created item still in `demo_requested`/
 * `scheduling_needed` seeds a `demo_not_scheduled` follow-up candidate;
 * transitioning an item to `no_show` seeds `demo_no_show`. Both wrapped so
 * a follow-up failure can never break demo scheduling itself.
 */

type RegistryEntry = DemoScheduleItem & { expiresAt: number };

/** 14 days — longer than the 7-day reply/intelligence TTLs, since a demo can legitimately be scheduled more than a week out. */
const DEMO_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const items = new Map<string, RegistryEntry>();

function pruneExpired(now: number): void {
  for (const [id, entry] of items) {
    if (entry.expiresAt <= now) items.delete(id);
  }
}

function stripInternal(entry: RegistryEntry): DemoScheduleItem {
  const { expiresAt, ...rest } = entry;
  void expiresAt;
  return rest;
}

/**
 * Derives a candidate from the reply-intelligence input and stores it only
 * if no item already exists for that `providerMessageId` — a re-processed
 * webhook (e.g. a Meta retry) never creates a second item or clobbers a
 * founder's own status change on the existing one.
 */
export function upsertDemoScheduleItem(input: DemoScheduleCandidateInput, now: number = Date.now()): DemoScheduleItem {
  pruneExpired(now);
  const candidate = deriveDemoScheduleCandidateFromReplyIntelligence(input, now);
  const existing = items.get(candidate.id);
  if (existing) return stripInternal(existing);

  const entry: RegistryEntry = { ...candidate, expiresAt: now + DEMO_TTL_MS };
  items.set(candidate.id, entry);

  if (candidate.status === "demo_requested" || candidate.status === "scheduling_needed") {
    try {
      upsertFollowUpCandidate(
        {
          source: "demo_scheduling",
          reason: "demo_not_scheduled",
          provider: "whatsapp",
          sourceId: candidate.id,
          providerMessageId: null,
          missionId: candidate.missionId,
          leadId: candidate.leadId,
        },
        now,
      );
    } catch {
      // Follow-up seeding must never break demo scheduling.
    }
  }

  return stripInternal(entry);
}

export function getDemoScheduleItem(id: string, now: number = Date.now()): DemoScheduleItem | undefined {
  pruneExpired(now);
  const entry = items.get(id);
  return entry ? stripInternal(entry) : undefined;
}

/** Business-priority order (pending demos first) via `sortDemoScheduleItems` — never insertion order. */
export function getRecentDemoScheduleItems(limit: number = 50, now: number = Date.now()): DemoScheduleItem[] {
  pruneExpired(now);
  return sortDemoScheduleItems(Array.from(items.values()).map(stripInternal)).slice(0, limit);
}

/**
 * The only path that can move an item to `scheduled`/`completed`/
 * `cancelled`/`no_show` — always founder-initiated via the status API
 * route. Returns `null` (never throws) for an unknown id or an invalid
 * target status, so the route can turn that into a safe 404/400.
 */
export function updateDemoScheduleStatus(
  id: string,
  status: DemoStatusUpdateTarget,
  metadata?: DemoStatusUpdateMetadata,
  now: number = Date.now(),
): DemoScheduleItem | null {
  pruneExpired(now);
  const existing = items.get(id);
  if (!existing) return null;

  const updated = applyDemoStatusUpdate(existing, status, metadata, now);
  const entry: RegistryEntry = { ...updated, expiresAt: now + DEMO_TTL_MS };
  items.set(id, entry);

  if (status === "no_show") {
    try {
      upsertFollowUpCandidate(
        {
          source: "demo_scheduling",
          reason: "demo_no_show",
          provider: "whatsapp",
          sourceId: id,
          providerMessageId: null,
          missionId: updated.missionId,
          leadId: updated.leadId,
        },
        now,
      );
    } catch {
      // Follow-up seeding must never break demo scheduling.
    }
  }

  return stripInternal(entry);
}

/** Sweeps every expired item out of the registry; returns how many were removed. */
export function clearExpiredDemoScheduleItems(now: number = Date.now()): number {
  const before = items.size;
  pruneExpired(now);
  return before - items.size;
}

/** Test-only escape hatch — resets the module-level registry between test cases. */
export function __resetDemoSchedulingRegistryForTests(): void {
  items.clear();
}
