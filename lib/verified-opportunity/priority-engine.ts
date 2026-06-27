import type { OpportunityStage } from "./opportunity-stage";
import type { PipelineHealth } from "./pipeline-health";
import { OPPORTUNITY_STAGE_RANK } from "./opportunity-stage";

export type SalesPriority = "CRITICAL" | "URGENT" | "HIGH" | "NORMAL" | "LOW";

export const SALES_PRIORITY_LABELS: Record<SalesPriority, string> = {
  CRITICAL: "Kritik",
  URGENT: "Acil",
  HIGH: "Yüksek",
  NORMAL: "Normal",
  LOW: "Düşük",
};

export const SALES_PRIORITY_RANK: Record<SalesPriority, number> = {
  CRITICAL: 5,
  URGENT: 4,
  HIGH: 3,
  NORMAL: 2,
  LOW: 1,
};

export const SALES_PRIORITY_COLOR: Record<SalesPriority, string> = {
  CRITICAL: "text-rose-400",
  URGENT: "text-orange-400",
  HIGH: "text-amber-400",
  NORMAL: "text-sky-400",
  LOW: "text-zinc-500",
};

export function computeSalesPriority(input: {
  verifiedOpportunityScore: number;
  confidenceScore: number;
  icpFitScore: number;
  stage: OpportunityStage;
  health: PipelineHealth;
  daysSinceLastContact: number | null;
  blockerCount: number;
}): SalesPriority {
  const stageRank = OPPORTUNITY_STAGE_RANK[input.stage];

  if (input.stage === "LOST" || input.health === "Lost") return "LOW";

  // CRITICAL: high confidence + healthy + ready for contact, no blockers
  if (
    input.confidenceScore >= 75 &&
    input.verifiedOpportunityScore >= 72 &&
    stageRank >= 3 &&
    input.health === "Healthy" &&
    input.blockerCount === 0
  ) return "CRITICAL";

  // URGENT: stale with high value — window closing on a hot lead
  if (
    input.health === "Stale" &&
    (input.verifiedOpportunityScore >= 62 || input.confidenceScore >= 62)
  ) return "URGENT";

  // HIGH: solid scores, progressing past verification
  if (
    (input.verifiedOpportunityScore >= 62 || input.confidenceScore >= 58) &&
    stageRank >= 2
  ) return "HIGH";

  // LOW: very early stage with weak signals
  if (
    stageRank <= 0 &&
    input.verifiedOpportunityScore < 35 &&
    input.confidenceScore < 30
  ) return "LOW";

  return "NORMAL";
}
