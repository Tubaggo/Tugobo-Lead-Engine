import type { SalesPriority } from "@/lib/verified-opportunity/priority-engine";
import type { OpportunityStage } from "@/lib/verified-opportunity/opportunity-stage";
import type { PipelineHealth } from "@/lib/verified-opportunity/pipeline-health";
import type { Blocker } from "@/lib/verified-opportunity/blocker-engine";
import type { NextBestAction } from "@/lib/verified-opportunity/next-best-action";
import type { RiskLevel } from "@/app/components/v2/adapters/revenue-risk-adapter";
import type { RecoveryLevel } from "@/app/components/v2/adapters/revenue-recovery-adapter";
import type {
  AutomationQueueType,
  AutomationStatus,
} from "@/app/components/v2/adapters/automation-center-adapter";

/**
 * Canonical Execution Priority ladder. Reuses the existing SalesPriority
 * rule cascade (lib/verified-opportunity/priority-engine.ts) verbatim —
 * this sprint does not introduce a second, competing priority vocabulary.
 * See priority.ts for the risk-escalation translation layered on top of it.
 */
export type ExecutionPriority = SalesPriority;

/**
 * Actionability, independent of importance. A CRITICAL-priority lead can
 * still be Blocked (no verified channel) or Waiting (message sent, no
 * reply yet) — Execution State never feeds back into Priority.
 */
export type ExecutionState =
  | "dormant"
  | "ready"
  | "blocked"
  | "waiting"
  | "scheduled"
  | "completed";

/** Conversation/commercial velocity — not priority, not risk, not stage. */
export type OperationalMomentum =
  | "accelerating"
  | "stable"
  | "slowing"
  | "stalled"
  | "recovering"
  | "reactivated";

/** How complete and internally consistent the evidence behind the recommendation is. */
export type ExecutionConfidence = "high" | "medium" | "low";

export type ExecutionTier = "tier-1" | "tier-2" | "tier-3";

export type RecommendedActionKey =
  | "verify_contact"
  | "re_enrich"
  | "call"
  | "whatsapp"
  | "follow_up"
  | "book_demo"
  | "prepare_proposal"
  | "close_opportunity"
  | "recover"
  | "ai_review"
  | "wait"
  | "no_action";

export type ExecutionReasonSource =
  | "blocker"
  | "risk"
  | "recovery"
  | "follow-up"
  | "automation"
  | "opportunity"
  | "momentum"
  | "priority"
  | "confidence";

/** Every reason must trace back to one borrowed fact — no synthesized prose. */
export type ExecutionReason = {
  source: ExecutionReasonSource;
  message: string;
  severity?: "critical" | "major" | "minor";
  judgement?:
    | "priority"
    | "executionState"
    | "recommendedAction"
    | "operationalMomentum"
    | "executionConfidence";
};

export type RecommendedActionResult = {
  action: RecommendedActionKey;
  label: string;
  reason: string;
};

/** Layer A — borrowed facts. Referenced from existing adapters/engines, never recalculated. */
export type ExecutionContextFacts = {
  commercial: {
    opportunityScore: number;
    icpScore: number;
    baseMrr: number;
    weightedMrr: number;
    forecastContribution: number;
    stageProbability: number;
  };
  risk: {
    riskScore: number;
    riskLevel: RiskLevel;
    riskRevenue: number;
  };
  recovery: {
    recoveryScore: number;
    recoveryLevel: RecoveryLevel;
    recoveryRevenue: number;
  };
  pipeline: {
    stage: OpportunityStage;
    stageLabel: string;
    health: PipelineHealth;
    healthLabel: string;
  };
  contact: {
    contactAttempts: number;
    lastContactedAtMs: number | null;
    nextFollowUpAtMs: number | null;
    isFollowUpOverdue: boolean;
    doNotContact: boolean;
  };
  automation: {
    status: AutomationStatus;
    primaryQueue: AutomationQueueType;
    reason: string;
  } | null;
  blockers: Blocker[];
  nextBestActionRaw: NextBestAction;
  /** 0-100 evidence-quality score from computeVerifiedOpportunity (channel verification, ICP, maturity, enrichment recency). */
  confidenceScoreRaw: number;
};

/** Layer B — derived judgements. Computed fresh per read; never persisted. */
export type ExecutionContextJudgements = {
  priority: ExecutionPriority;
  executionState: ExecutionState;
  recommendedAction: RecommendedActionResult;
  operationalMomentum: OperationalMomentum;
  executionConfidence: ExecutionConfidence;
  reasons: ExecutionReason[];
};

/** One lead's operational identity right now. Recomputed on every read — never persisted. */
export type ExecutionContext = {
  leadId: string;
  hotelName: string;
  city: string;
  hotelType: string;
  generatedAt: number;
  facts: ExecutionContextFacts;
  judgements: ExecutionContextJudgements;
};

/** One projection of an ExecutionContext — the queue is not the model, only one view of it. */
export type ExecutionQueueItem = {
  leadId: string;
  hotelName: string;
  city: string;
  priority: ExecutionPriority;
  tier: ExecutionTier;
  executionState: ExecutionState;
  recommendedAction: RecommendedActionResult;
  topReason: string;
  reasons: ExecutionReason[];
  estimatedValue: number;
  operationalMomentum: OperationalMomentum;
  executionConfidence: ExecutionConfidence;
};
