import type { OpportunityStage } from "./opportunity-stage";
import { OPPORTUNITY_STAGE_RANK } from "./opportunity-stage";

export type PipelineHealth = "Healthy" | "Needs Attention" | "At Risk" | "Stale" | "Lost";

export const PIPELINE_HEALTH_META: Record<
  PipelineHealth,
  { tr: string; colorClass: string }
> = {
  Healthy: { tr: "Sağlıklı", colorClass: "text-emerald-400" },
  "Needs Attention": { tr: "Dikkat Gerek", colorClass: "text-amber-400" },
  "At Risk": { tr: "Risk Altında", colorClass: "text-orange-400" },
  Stale: { tr: "Durgun", colorClass: "text-rose-400" },
  Lost: { tr: "Kaybedildi", colorClass: "text-zinc-500" },
};

export function computePipelineHealth(input: {
  stage: OpportunityStage;
  daysSinceLastContact: number | null;
  contactAttempts: number;
  verifiedOpportunityScore: number;
  blockerCount: number;
  doNotContact: boolean;
}): PipelineHealth {
  if (input.doNotContact || input.stage === "LOST") return "Lost";

  const stageRank = OPPORTUNITY_STAGE_RANK[input.stage];
  const days = input.daysSinceLastContact;

  // Stale: meaningful progress made but no recent activity
  if (stageRank >= 4 && days !== null && days > 14) return "Stale";
  if (stageRank >= 3 && days !== null && days > 21) return "Stale";

  // At Risk: critical signal gaps or high blocker count
  if (input.blockerCount >= 3) return "At Risk";
  if (input.blockerCount >= 2 && input.verifiedOpportunityScore < 50) return "At Risk";

  // Needs Attention: minor gaps or ready-but-uncontacted
  if (input.blockerCount >= 1) return "Needs Attention";
  if (input.stage === "CONTACT_READY" && input.contactAttempts === 0) {
    return "Needs Attention";
  }
  if (stageRank >= 2 && days !== null && days > 10) return "Needs Attention";

  return "Healthy";
}
