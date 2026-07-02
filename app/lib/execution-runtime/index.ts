import type { ScoredLead } from "@/app/lib/leads";
import { buildExecutionContexts } from "./context-builder";
import { projectExecutionQueue } from "./queue";
import type { ExecutionState, ExecutionTier } from "./types";

export * from "./types";
export { computeExecutionPriority, EXECUTION_PRIORITY_RANK } from "./priority";
export { computeExecutionState } from "./state";
export { computeRecommendedAction, ACTION_LABELS } from "./actions";
export { computeOperationalMomentum } from "./momentum";
export { computeExecutionConfidence } from "./confidence";
export { buildExecutionContext, buildExecutionContexts } from "./context-builder";
export { projectExecutionQueue, computeTier } from "./queue";
export { buildFounderCoachInsights } from "./coach";

/**
 * Read-only snapshot for manual inspection/validation — not wired into any
 * screen or route. Intended for a scratch script or a temporary console
 * call while validating the runtime against real lead-pool data.
 */
export function debugExecutionRuntime(leads: ScoredLead[]) {
  const contexts = buildExecutionContexts(leads);
  const queue = projectExecutionQueue(contexts);

  const byState = contexts.reduce<Record<ExecutionState, number>>(
    (acc, c) => {
      acc[c.judgements.executionState] = (acc[c.judgements.executionState] ?? 0) + 1;
      return acc;
    },
    { dormant: 0, ready: 0, blocked: 0, waiting: 0, scheduled: 0, completed: 0 },
  );

  const byTier = queue.reduce<Record<ExecutionTier, number>>(
    (acc, i) => {
      acc[i.tier] = (acc[i.tier] ?? 0) + 1;
      return acc;
    },
    { "tier-1": 0, "tier-2": 0, "tier-3": 0 },
  );

  const leadIds = queue.map((i) => i.leadId);
  const hasDuplicates = new Set(leadIds).size !== leadIds.length;

  return {
    totalLeads: leads.length,
    totalContexts: contexts.length,
    visibleQueueSize: queue.length,
    byState,
    byTier,
    hasDuplicateQueueEntries: hasDuplicates,
    queue,
    contexts,
  };
}
