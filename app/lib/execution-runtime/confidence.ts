import type { Blocker } from "@/lib/verified-opportunity/blocker-engine";
import type { RiskLevel } from "@/app/components/v2/adapters/revenue-risk-adapter";
import type { PipelineHealth } from "@/lib/verified-opportunity/pipeline-health";
import type { ExecutionConfidence, ExecutionReason } from "./types";

/**
 * Execution Confidence answers "how complete and internally consistent is
 * the evidence behind the recommendation" — it is not a model probability.
 * It reuses the existing 0-100 evidence-quality score from
 * computeVerifiedOpportunity (channel verification, ICP fit, maturity,
 * enrichment recency) and cross-checks it against blockers and an explicit
 * agreement check between risk and pipeline-health signals.
 */
export function computeExecutionConfidence(input: {
  confidenceScoreRaw: number;
  blockers: Blocker[];
  riskLevel: RiskLevel;
  health: PipelineHealth;
}): { confidence: ExecutionConfidence; reasons: ExecutionReason[] } {
  const criticalBlockers = input.blockers.filter((b) => b.severity === "critical");
  const majorBlockers = input.blockers.filter((b) => b.severity === "major");
  const contradictsHealth =
    (input.riskLevel === "high" || input.riskLevel === "critical") && input.health === "Healthy";

  const result = (confidence: ExecutionConfidence, message: string, severity?: ExecutionReason["severity"]) => ({
    confidence,
    reasons: [
      { source: "confidence" as const, message, severity, judgement: "executionConfidence" as const },
    ],
  });

  if (criticalBlockers.length > 0) {
    return result("low", `Kritik engel mevcut: ${criticalBlockers[0].label}`, "critical");
  }

  if (contradictsHealth) {
    return result("low", "Risk ve pipeline sağlığı sinyalleri birbiriyle çelişiyor", "major");
  }

  if (input.confidenceScoreRaw < 35) {
    return result("low", `Kanıt tamlığı düşük (skor ${input.confidenceScoreRaw})`);
  }

  if (majorBlockers.length >= 2) {
    return result("low", `${majorBlockers.length} büyük engel birikmiş durumda`, "major");
  }

  if (majorBlockers.length === 1 || (input.confidenceScoreRaw >= 35 && input.confidenceScoreRaw < 65)) {
    return result("medium", `Kanıt kısmen tam (skor ${input.confidenceScoreRaw})`);
  }

  return result("high", `Kanıt tutarlı ve tam (skor ${input.confidenceScoreRaw})`);
}
