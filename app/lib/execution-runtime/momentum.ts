import type { PipelineHealth } from "@/lib/verified-opportunity/pipeline-health";
import type { OpportunityStage } from "@/lib/verified-opportunity/opportunity-stage";
import { OPPORTUNITY_STAGE_RANK } from "@/lib/verified-opportunity/opportunity-stage";
import type { RiskLevel } from "@/app/components/v2/adapters/revenue-risk-adapter";
import type { RecoveryLevel } from "@/app/components/v2/adapters/revenue-recovery-adapter";
import type { OperationalMomentum, ExecutionReason } from "./types";

/**
 * Momentum answers "is this conversation gaining or losing ground over
 * time" — the one axis none of Priority/State/Risk/Stage capture, since
 * all four are point-in-time snapshots. No new persisted field is used:
 * every rung is a re-reading of existing facts (health, follow-up
 * overdue-ness, recovery level, contact recency vs. attempt count) that
 * already imply direction.
 */
export function computeOperationalMomentum(input: {
  health: PipelineHealth;
  stage: OpportunityStage;
  isFollowUpOverdue: boolean;
  riskLevel: RiskLevel;
  recoveryLevel: RecoveryLevel;
  contactAttempts: number;
  lastContactedAtMs: number | null;
  now: number;
}): { momentum: OperationalMomentum; reasons: ExecutionReason[] } {
  const daysSinceLastContact =
    input.lastContactedAtMs !== null
      ? (input.now - input.lastContactedAtMs) / (1000 * 60 * 60 * 24)
      : null;

  const result = (momentum: OperationalMomentum, message: string) => ({
    momentum,
    reasons: [{ source: "momentum" as const, message, judgement: "operationalMomentum" as const }],
  });

  if (input.health === "Lost") {
    return result("stalled", "Fırsat kaybedildi veya iletişim engeli var");
  }

  if (
    daysSinceLastContact !== null &&
    daysSinceLastContact < 2 &&
    input.contactAttempts >= 2 &&
    input.health !== "Healthy"
  ) {
    return result(
      "reactivated",
      "Durgun bir dönemin ardından son 48 saat içinde yeniden temas kuruldu",
    );
  }

  if (
    (input.riskLevel === "high" || input.riskLevel === "critical") &&
    (input.recoveryLevel === "high" || input.recoveryLevel === "medium")
  ) {
    return result(
      "recovering",
      `Risk altında ama kurtarma potansiyeli ${input.recoveryLevel === "high" ? "yüksek" : "orta"}`,
    );
  }

  if (input.health === "Stale" && input.isFollowUpOverdue) {
    return result("stalled", "Fırsat durgunlaştı ve takip tarihi geçti");
  }

  if (input.health === "Stale") {
    return result("slowing", "Fırsat durgunlaşıyor — son aktivite üzerinden zaman geçti");
  }

  if (input.health === "At Risk") {
    return result("slowing", "Sinyal eksiklikleri momentumu yavaşlatıyor");
  }

  if (
    input.health === "Healthy" &&
    OPPORTUNITY_STAGE_RANK[input.stage] >= OPPORTUNITY_STAGE_RANK.REPLIED &&
    input.contactAttempts <= 2
  ) {
    return result("accelerating", "Az sayıda temasla hızlı ilerleme kaydedildi");
  }

  return result("stable", "Fırsat beklenen seyrinde ilerliyor");
}
