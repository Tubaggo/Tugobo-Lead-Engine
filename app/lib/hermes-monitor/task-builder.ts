import type { ExecutionContext } from "@/app/lib/execution-runtime";
import type { ShadowDecision, ShadowDecisionResult, ShadowTask, ShadowTaskStatus } from "./types";

/**
 * Shadow Task Builder — ExecutionContext + ShadowDecisionResult → ShadowTask.
 *
 * Pure assembly: every judgement field (priority, confidence, state,
 * reasons, recommended action) is carried over verbatim from the context.
 * The builder adds nothing but identity, the decision, and the impact
 * figure the queue already uses.
 */

/** SKIP is intentionally absent — a skipped lead produces no task, only a ledger entry. */
const STATUS_BY_DECISION: Record<Exclude<ShadowDecision, "SKIP">, ShadowTaskStatus> = {
  RUN: "would-run",
  WAIT: "deferred",
  APPROVAL: "awaiting-founder",
  ESCALATE: "escalated",
};

/**
 * Returns null when the decision implies no work item (SKIP, or a decision
 * without a task type). Ids are deterministic — same context, same task id —
 * so repeated monitor passes stay comparable.
 */
export function buildShadowTask(
  context: ExecutionContext,
  result: ShadowDecisionResult,
  now: number,
): ShadowTask | null {
  if (result.decision === "SKIP" || result.taskType === null) return null;

  return {
    id: `shadow:${context.leadId}:${result.taskType}`,
    leadId: context.leadId,
    hotelName: context.hotelName,
    city: context.city,
    createdAt: now,
    taskType: result.taskType,
    priority: context.judgements.priority,
    confidence: context.judgements.executionConfidence,
    executionState: context.judgements.executionState,
    reasons: context.judgements.reasons,
    source: "hermes-monitor",
    suggestedAgent: result.suggestedAgent,
    suggestedAction: context.judgements.recommendedAction,
    requiresApproval: result.requiresApproval,
    decision: result.decision,
    decisionReason: result.decisionReason,
    status: STATUS_BY_DECISION[result.decision],
    // Same convention as ExecutionQueueItem.estimatedValue.
    estimatedImpact:
      context.facts.commercial.weightedMrr || context.facts.commercial.forecastContribution,
  };
}
