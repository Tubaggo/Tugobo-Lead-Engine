import type { SalesPriority } from "@/lib/verified-opportunity/priority-engine";
import type { RiskLevel } from "@/app/components/v2/adapters/revenue-risk-adapter";
import type { RecoveryLevel } from "@/app/components/v2/adapters/revenue-recovery-adapter";
import type { ExecutionPriority, ExecutionReason } from "./types";

export const EXECUTION_PRIORITY_RANK: Record<ExecutionPriority, number> = {
  CRITICAL: 5,
  URGENT: 4,
  HIGH: 3,
  NORMAL: 2,
  LOW: 1,
};

/**
 * Priority answers "how important is this lead" — nothing else. It is a
 * rule ladder, not a weighted score, so every rung can be explained in one
 * sentence and reproduced by hand from the same inputs.
 *
 * SalesPriority (priority-engine.ts) already runs a deterministic rule
 * cascade over confidence/VOS/ICP/stage/health/blockers, so it is reused
 * as the base rung rather than reinvented. On top of it, risk/recovery
 * evidence can only escalate the rung, never lower it — this is the
 * "worst signal wins" merge rule: a lead that looks fine on one axis but
 * is genuinely at risk on another must not have that risk hidden by a
 * lower base priority.
 *
 * Automation readiness/blocked/overdue status is deliberately NOT an
 * input here. Whether a lead can be acted on right now is an Execution
 * State question (see state.ts), not an importance question — conflating
 * the two would let a merely-overdue automation task outrank a genuinely
 * important opportunity, or vice versa.
 */
export function computeExecutionPriority(input: {
  salesPriority: SalesPriority;
  riskLevel: RiskLevel;
  recoveryLevel: RecoveryLevel;
}): { priority: ExecutionPriority; reasons: ExecutionReason[] } {
  const base: ExecutionPriority = input.salesPriority;
  const reasons: ExecutionReason[] = [
    {
      source: "priority",
      message: `Temel öncelik ${base} (güven skoru, VOS, aşama ve sağlık kuralından)`,
      judgement: "priority",
    },
  ];

  // A lead already classified as recovery-lost has no upside left to escalate for.
  if (input.recoveryLevel === "lost") {
    return { priority: base, reasons };
  }

  if (
    input.riskLevel === "critical" &&
    EXECUTION_PRIORITY_RANK[base] < EXECUTION_PRIORITY_RANK.URGENT
  ) {
    reasons.push({
      source: "risk",
      message: "Risk seviyesi kritik — öncelik URGENT'e yükseltildi",
      severity: "critical",
      judgement: "priority",
    });
    return { priority: "URGENT", reasons };
  }

  if (
    input.riskLevel === "high" &&
    EXECUTION_PRIORITY_RANK[base] < EXECUTION_PRIORITY_RANK.HIGH
  ) {
    reasons.push({
      source: "risk",
      message: "Risk seviyesi yüksek — öncelik HIGH'a yükseltildi",
      severity: "major",
      judgement: "priority",
    });
    return { priority: "HIGH", reasons };
  }

  return { priority: base, reasons };
}
