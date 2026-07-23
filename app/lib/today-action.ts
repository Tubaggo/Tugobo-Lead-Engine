// ─── v1.8 Today Action Status ────────────────────────────────────────────────
//
// Leaf module: only type-only imports from the heavy `leads` module, so this
// pure logic can be imported by the Node test runner without pulling the whole
// enrichment/AI chain. `leads.ts` re-exports everything here for existing
// callers, so import paths elsewhere are unchanged.

import type { LeadStatusUpdate, ScoredLead } from "./leads";

export type TodayActionStatus =
  | "HOT_NOW"
  | "DEMO_READY"
  | "FOLLOW_UP_DUE"
  | "NEEDS_CONTACT"
  | "NO_ACTION";

/** State fields `computeTodayActionStatus` reads — reused by the HOT_NOW selector. */
export type TodayActionState = Pick<
  LeadStatusUpdate,
  | "status"
  | "nextFollowUpAt"
  | "contactedAt"
  | "lastContactedAt"
  | "followUpAfterHours"
  | "doNotContact"
>;

/**
 * Derives today's recommended operator action from CRM state and opportunity
 * score. Pure — no I/O. Priority: HOT_NOW > DEMO_READY > FOLLOW_UP_DUE >
 * NEEDS_CONTACT > NO_ACTION.
 */
export function computeTodayActionStatus(
  lead: Pick<ScoredLead, "verifiedOpportunityScore">,
  s: TodayActionState,
  now: number,
): TodayActionStatus {
  if (s.status === "won" || s.status === "lost" || s.status === "meeting")
    return "NO_ACTION";

  const score = lead.verifiedOpportunityScore;

  if (s.status === "new") {
    if (typeof score === "number" && score >= 80) return "HOT_NOW";
    if (typeof score === "number" && score >= 60) return "NEEDS_CONTACT";
  }

  if (s.status === "replied" && typeof score === "number" && score >= 70)
    return "DEMO_READY";

  if (!s.doNotContact) {
    if (s.status === "needs_follow_up") return "FOLLOW_UP_DUE";
    if (s.status === "contacted") {
      const followUpAt =
        typeof s.nextFollowUpAt === "number" && Number.isFinite(s.nextFollowUpAt)
          ? s.nextFollowUpAt
          : (() => {
              const base =
                typeof s.lastContactedAt === "number" && s.lastContactedAt > 0
                  ? s.lastContactedAt
                  : typeof s.contactedAt === "number" && s.contactedAt > 0
                    ? s.contactedAt
                    : null;
              if (!base) return null;
              const hrs =
                typeof s.followUpAfterHours === "number" && s.followUpAfterHours > 0
                  ? s.followUpAfterHours
                  : 24;
              return base + hrs * 3600000;
            })();
      if (followUpAt !== null && now > followUpAt) return "FOLLOW_UP_DUE";
    }
  }

  return "NO_ACTION";
}

/**
 * v3.7.8 — Single source of truth for "today's hot opportunity".
 *
 * A lead is HOT_NOW exactly when `computeTodayActionStatus` says so — no
 * separate hotScore / opportunityScore threshold. Both the "Sıcak Fırsatları
 * İşle" card count and the destination list filter call this one predicate, so
 * the count and the shown rows are guaranteed to be the same lead id set.
 */
export function isHotNowLead(
  lead: Pick<ScoredLead, "verifiedOpportunityScore">,
  s: TodayActionState,
  now: number,
): boolean {
  return computeTodayActionStatus(lead, s, now) === "HOT_NOW";
}

/**
 * Filters a roster to exactly the HOT_NOW leads using {@link isHotNowLead}.
 * Rows must expose their workflow state as `_s` (as the dashboard rows do).
 */
export function selectHotNowLeads<
  T extends Pick<ScoredLead, "verifiedOpportunityScore"> & { _s: TodayActionState },
>(rows: readonly T[], now: number): T[] {
  return rows.filter((r) => isHotNowLead(r, r._s, now));
}
