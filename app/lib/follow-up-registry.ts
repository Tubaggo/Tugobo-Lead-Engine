import {
  applyFollowUpStatusUpdate,
  deriveFollowUpCandidate,
  sortFollowUpCandidates,
  type FollowUpCandidate,
  type FollowUpCandidateInput,
  type FollowUpStatus,
  type FollowUpStatusUpdateTarget,
} from "./follow-up-runtime.ts";
import { upsertSalesOutcomeItem } from "./sales-outcome-registry.ts";

/**
 * Follow-up Registry (v6.5, feeds Sales Outcome in v6.6).
 *
 * Server-only, in-memory store of follow-up candidates. `Map` keyed by the
 * deterministic id `follow-up-runtime.ts` computes
 * (`followup:<reason>:<sourceId>`) — the same pattern
 * `demo-scheduling-registry.ts` uses, for the same reason: each entry is an
 * opportunity the founder is expected to act on, not disposable log noise,
 * so it isn't count-capped, only TTL-bounded (14 days).
 *
 * Unlike the other registries in this codebase, an expired *active*
 * candidate (`candidate`/`approval_required`/`approved`) is never silently
 * dropped on read — it's transitioned in place to `status: "expired"` so
 * the founder can still see that a follow-up window passed. A genuinely
 * old, already-resolved item (already `completed`/`dismissed`/`expired`/
 * `not_needed`) is what `clearExpiredFollowUpCandidates` hard-deletes —
 * a separate, explicitly-invoked cleanup, never auto-run (no cron, per
 * this sprint's safety rules).
 *
 * v6.6: transitioning to `completed` seeds an `open` sales outcome item
 * (a decision is needed, never auto-won). `dismissed`/`approved` seed
 * nothing — per this sprint's spec, only completion implies "something
 * happened worth a decision." Wrapped so a sales-outcome failure can never
 * break follow-up status updates.
 */

/** 14 days — matches the demo scheduling registry TTL this feed is populated alongside. */
const FOLLOW_UP_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const ACTIVE_STATUSES: ReadonlySet<FollowUpStatus> = new Set(["candidate", "approval_required", "approved"]);

const items = new Map<string, FollowUpCandidate>();

function softExpireStale(now: number): void {
  for (const [id, item] of items) {
    if (item.expiresAt !== null && item.expiresAt <= now && ACTIVE_STATUSES.has(item.status)) {
      items.set(id, { ...item, status: "expired", updatedAt: now });
    }
  }
}

/**
 * Derives a candidate and stores it only if no item already exists for
 * that `(reason, sourceId)` pair — a re-processed webhook or a repeated
 * registry event never creates a second candidate or clobbers a founder's
 * own status change on the existing one.
 */
export function upsertFollowUpCandidate(input: FollowUpCandidateInput, now: number = Date.now()): FollowUpCandidate {
  softExpireStale(now);
  const candidate = deriveFollowUpCandidate(input, now);
  const existing = items.get(candidate.id);
  if (existing) return existing;

  const withExpiry: FollowUpCandidate = { ...candidate, expiresAt: now + FOLLOW_UP_TTL_MS };
  items.set(candidate.id, withExpiry);
  return withExpiry;
}

export function getFollowUpCandidate(id: string, now: number = Date.now()): FollowUpCandidate | undefined {
  softExpireStale(now);
  return items.get(id);
}

/** Business-priority order (active/high-priority first) via `sortFollowUpCandidates` — never insertion order. */
export function getRecentFollowUpCandidates(limit: number = 50, now: number = Date.now()): FollowUpCandidate[] {
  softExpireStale(now);
  return sortFollowUpCandidates(Array.from(items.values())).slice(0, limit);
}

/**
 * The only path that can move a candidate to `approval_required`/
 * `approved`/`dismissed`/`completed` — always founder-initiated via the
 * status API route. Returns `null` (never throws) for an unknown id, so
 * the route can turn that into a safe 404.
 */
export function updateFollowUpStatus(id: string, status: FollowUpStatusUpdateTarget, now: number = Date.now()): FollowUpCandidate | null {
  softExpireStale(now);
  const existing = items.get(id);
  if (!existing) return null;

  const updated = applyFollowUpStatusUpdate(existing, status, now);
  items.set(id, updated);

  if (status === "completed") {
    try {
      upsertSalesOutcomeItem(
        {
          missionId: updated.missionId,
          leadId: updated.leadId,
          source: "follow_up",
          sourceProviderMessageId: updated.sourceProviderMessageId ?? id,
        },
        now,
      );
    } catch {
      // Sales outcome seeding must never break follow-up status updates.
    }
  }

  return updated;
}

/** Hard-deletes any item past its TTL (active ones are soft-expired first, then swept alongside already-resolved ones). Returns how many were removed. */
export function clearExpiredFollowUpCandidates(now: number = Date.now()): number {
  softExpireStale(now);
  let cleared = 0;
  for (const [id, item] of items) {
    if (item.expiresAt !== null && item.expiresAt <= now) {
      items.delete(id);
      cleared += 1;
    }
  }
  return cleared;
}

/** Test-only escape hatch — resets the module-level registry between test cases. */
export function __resetFollowUpRegistryForTests(): void {
  items.clear();
}
