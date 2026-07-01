import type { ExecutionContext, ExecutionQueueItem, ExecutionTier } from "./types";
import { EXECUTION_PRIORITY_RANK } from "./priority";

const TIER_RANK: Record<ExecutionTier, number> = {
  "tier-1": 0,
  "tier-2": 1,
  "tier-3": 2,
};

/**
 * Tier 1 (Do Now): CRITICAL/URGENT priority, overdue follow-up, or a
 * critical blocker — time-decaying or structurally broken, waiting costs.
 * Tier 2 (Do Today): HIGH priority or an automation-ready action.
 * Tier 3 (If Time Allows): everything else still visible in the queue.
 */
export function computeTier(context: ExecutionContext): ExecutionTier {
  const { priority, executionState } = context.judgements;
  const hasCriticalBlocker = context.facts.blockers.some((b) => b.severity === "critical");

  if (
    priority === "CRITICAL" ||
    priority === "URGENT" ||
    context.facts.contact.isFollowUpOverdue ||
    hasCriticalBlocker
  ) {
    return "tier-1";
  }

  if (priority === "HIGH" || context.facts.automation?.status === "ready" || executionState === "ready") {
    return "tier-2";
  }

  return "tier-3";
}

/**
 * Pure projection: ExecutionContext[] -> ExecutionQueueItem[].
 * One lead always produces at most one item (contexts are already
 * deduped by leadId upstream; the `seen` guard is a defensive backstop).
 * Completed/dormant contexts are excluded unless `includeInactive` is set,
 * which exists only for debugging/inspection, never for the live queue.
 */
export function projectExecutionQueue(
  contexts: ExecutionContext[],
  options: { includeInactive?: boolean } = {},
): ExecutionQueueItem[] {
  const seen = new Set<string>();
  const items: ExecutionQueueItem[] = [];

  for (const context of contexts) {
    if (seen.has(context.leadId)) continue;
    seen.add(context.leadId);

    const state = context.judgements.executionState;
    const isActive = state !== "completed" && state !== "dormant";
    if (!isActive && !options.includeInactive) continue;

    items.push({
      leadId: context.leadId,
      hotelName: context.hotelName,
      city: context.city,
      priority: context.judgements.priority,
      tier: computeTier(context),
      executionState: state,
      recommendedAction: context.judgements.recommendedAction,
      topReason: context.judgements.reasons[0]?.message ?? "Neden bulunamadı",
      reasons: context.judgements.reasons,
      estimatedValue: context.facts.commercial.weightedMrr || context.facts.commercial.forecastContribution,
      operationalMomentum: context.judgements.operationalMomentum,
      executionConfidence: context.judgements.executionConfidence,
    });
  }

  return items.sort((a, b) => {
    const priorityDiff = EXECUTION_PRIORITY_RANK[b.priority] - EXECUTION_PRIORITY_RANK[a.priority];
    if (priorityDiff !== 0) return priorityDiff;
    const tierDiff = TIER_RANK[a.tier] - TIER_RANK[b.tier];
    if (tierDiff !== 0) return tierDiff;
    return b.estimatedValue - a.estimatedValue;
  });
}
