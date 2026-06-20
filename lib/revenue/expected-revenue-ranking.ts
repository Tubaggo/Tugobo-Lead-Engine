/**
 * Expected Revenue Ranking Engine v3.9.1
 *
 * Answers: "Which leads should I prioritize because they are likely to generate
 * the highest recurring revenue?"
 *
 * Takes the output of computeExpectedRevenue + supplementary signals and
 * produces a deterministic 0–100 revenuePriorityScore with tier and reasoning.
 *
 * Score breakdown (max 100):
 *   Weighted MRR score      — 35 pts  (MRR × probability, normalized)
 *   Probability score       — 20 pts  (expectedCustomerProbability × 20)
 *   Package weight          — 15 pts  (Starter→3 / Pro→7 / Growth→11 / Enterprise→15)
 *   Opportunity strength    — 15 pts  ((hot + vos + lead) / 3)
 *   Readiness + reachability— 10 pts  (contactReadiness + WhatsApp/web channel)
 *   Confidence bonus        —  5 pts  (high→5 / medium→3 / low→1)
 *
 * No AI, no I/O, no schema changes. Pure function — safe to call anywhere.
 */

import type { CommercialPackage } from "@/lib/commercial/commercial-packaging";
import type { ExpectedRevenueResult } from "@/lib/revenue/expected-revenue";
import type { SignalVerificationProfile } from "@/app/lib/signal-verification";
import type { AcquisitionIntelligenceProfile } from "@/app/lib/intelligence/acquisition-intelligence";

// ── Public types ──────────────────────────────────────────────────────────────

export type RevenuePriorityTier = "critical" | "high" | "medium" | "low";

export interface ExpectedRevenueRankingInput {
  /** Output of computeExpectedRevenue — provides MRR, ARR, probability, confidence. */
  expectedRevenue: ExpectedRevenueResult;
  /** Commercial package tier — determines package weight component. */
  commercialPackage: CommercialPackage;
  /** Lead hot score (0–100). Used in opportunity strength component. */
  hotScore: number;
  /** Lead score (0–100). Used in opportunity strength component. */
  leadScore: number;
  /** Verified Opportunity Score (0–100). Used in opportunity strength component. */
  verifiedOpportunityScore: number;
  /** ICP fit score (0–100). Used in reasoning only. */
  icpFitScore: number;
  /** Contact readiness score (0–100). Optional — contributes to readiness component. */
  contactReadinessScore?: number;
  /** Pipeline / workflow status — used in reasoning. */
  pipelineStatus?: string | null;
  /** Signal verification layer — WhatsApp/website verification for reachability component. */
  signalVerification?: SignalVerificationProfile | null;
  /** Acquisition intelligence — used in reasoning. */
  acquisitionIntelligence?: AcquisitionIntelligenceProfile | null;
}

export interface ExpectedRevenueRankingResult {
  /** 0–100 revenue priority score. Higher = greater revenue priority. */
  revenuePriorityScore: number;
  /** Tier derived from score: critical (≥80), high (≥60), medium (≥35), low (<35). */
  revenuePriorityTier: RevenuePriorityTier;
  /** Founder-readable reasons (max 5). */
  rankingReasoning: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const clamp = (n: number, min = 0, max = 100): number =>
  Math.max(min, Math.min(max, n));

// ── Score components ──────────────────────────────────────────────────────────

/** Weighted MRR score — 0 to 35 pts. */
function scoreMrr(weightedMrr: number): number {
  if (weightedMrr <= 0) return 0;
  if (weightedMrr >= 30_000) return 35;
  if (weightedMrr >= 20_000) return 30 + ((weightedMrr - 20_000) / 10_000) * 5;
  if (weightedMrr >= 10_000) return 20 + ((weightedMrr - 10_000) / 10_000) * 10;
  if (weightedMrr >= 5_000) return 10 + ((weightedMrr - 5_000) / 5_000) * 10;
  return (weightedMrr / 5_000) * 10;
}

/** Package weight — fixed pts per tier. */
const PACKAGE_WEIGHT: Record<CommercialPackage, number> = {
  starter: 3,
  professional: 7,
  growth: 11,
  enterprise: 15,
};

/** Opportunity strength — 0 to 15 pts (average of hot/vos/lead scores). */
function scoreOpportunityStrength(
  hotScore: number,
  verifiedOpportunityScore: number,
  leadScore: number,
): number {
  const avg =
    (clamp(hotScore) + clamp(verifiedOpportunityScore) + clamp(leadScore)) / 3;
  return (avg / 100) * 15;
}

/** Readiness + reachability — 0 to 10 pts. */
function scoreReadiness(
  contactReadinessScore: number | undefined,
  sv: SignalVerificationProfile | null | undefined,
): number {
  // Contact readiness sub-score: up to 5 pts
  const cr = Math.min(5, clamp((contactReadinessScore ?? 0) / 100) * 5);

  // Reachability sub-score: up to 5 pts
  let reach = 0;
  const wa = sv?.whatsappVerification;
  if (wa === "verified") reach += 3;
  else if (wa === "likely") reach += 2;

  const web = sv?.websiteVerification;
  if (web === "verified") reach += 2;
  else if (web === "reachable") reach += 1;

  return cr + Math.min(5, reach);
}

// ── Reasoning builder ─────────────────────────────────────────────────────────

function buildRankingReasoning(
  input: ExpectedRevenueRankingInput,
  tier: RevenuePriorityTier,
): string[] {
  const out: string[] = [];
  const er = input.expectedRevenue;
  const mrr = er.weightedExpectedMonthlyRevenue;
  const prob = er.expectedCustomerProbability;
  const pct = Math.round(prob * 100);
  const sv = input.signalVerification ?? null;

  const pkgNames: Record<CommercialPackage, string> = {
    starter: "Starter",
    professional: "Professional",
    growth: "Growth",
    enterprise: "Enterprise",
  };
  const tierNames: Record<RevenuePriorityTier, string> = {
    critical: "Kritik",
    high: "Yüksek",
    medium: "Orta",
    low: "Düşük",
  };

  // Headline: tier + MRR
  out.push(
    `${tierNames[tier]} gelir önceliği — ağırlıklı MRR ${mrr.toLocaleString("tr-TR")} ₺`,
  );

  // Package
  out.push(`${pkgNames[input.commercialPackage]} paketi, dönüşüm olasılığı %${pct}`);

  // Revenue confidence
  if (er.expectedRevenueConfidence === "high")
    out.push("Yüksek güven — güçlü sinyaller mevcut");
  else if (er.expectedRevenueConfidence === "medium")
    out.push("Orta güven — bazı sinyaller doğrulandı");
  else out.push("Düşük güven — sınırlı doğrulanmış sinyal");

  // Opportunity signals
  if (input.verifiedOpportunityScore >= 70)
    out.push("Güçlü doğrulanmış fırsat skoru (≥70)");
  else if (input.verifiedOpportunityScore >= 50)
    out.push("Orta doğrulanmış fırsat skoru (≥50)");

  if (input.hotScore >= 65)
    out.push(`Yüksek sıcak lead skoru (${input.hotScore})`);

  // Reachability signals
  if (sv?.whatsappVerification === "verified") out.push("WhatsApp hattı doğrulandı");
  else if (sv?.whatsappVerification === "likely") out.push("WhatsApp muhtemelen aktif");

  if (sv?.websiteVerification === "verified") out.push("Web sitesi doğrulandı");

  // Pipeline status
  const status = (input.pipelineStatus ?? "").toLowerCase();
  if (status === "meeting") out.push("Demo/toplantı aşamasında");
  else if (status === "replied") out.push("Yanıt alındı");
  else if (status === "won") out.push("Satış tamamlandı");

  // Acquisition
  if (input.acquisitionIntelligence?.acquisition.isAcquisitionActive)
    out.push("Aktif dijital edinim kanalları");

  // Contact readiness warning
  if ((input.contactReadinessScore ?? 100) < 30)
    out.push("İletişim hazırlığı düşük — gelir önceliği baskılandı");

  return out.slice(0, 5);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Compute the revenue priority ranking score for a lead.
 *
 * Uses ExpectedRevenueResult + supplementary signals to produce a deterministic
 * 0–100 score with tier and founder-readable reasoning.
 *
 * Pure function — no I/O, no side effects.
 *
 * @example
 * const er = computeExpectedRevenue({ ... });
 * const pkg = packageByLeadId.get(lead.id) ?? "starter";
 * const rank = computeExpectedRevenueRanking({
 *   expectedRevenue: er,
 *   commercialPackage: pkg,
 *   hotScore: lead.hotScore,
 *   leadScore: lead.leadScore,
 *   verifiedOpportunityScore: lead.verifiedOpportunityScore ?? 0,
 *   icpFitScore: lead.icpFitScore ?? 0,
 *   contactReadinessScore: lead.contactReadinessScore,
 *   pipelineStatus: lead._s.status,
 *   signalVerification: lead.signalVerification,
 *   acquisitionIntelligence: lead.acquisitionIntelligence,
 * });
 */
export function computeExpectedRevenueRanking(
  input: ExpectedRevenueRankingInput,
): ExpectedRevenueRankingResult {
  const er = input.expectedRevenue;

  // ── Component scores ─────────────────────────────────────────────────────
  const mrrScore = scoreMrr(er.weightedExpectedMonthlyRevenue);               // 0–35
  const probScore = clamp(er.expectedCustomerProbability) * 20;                // 0–20
  const pkgScore = PACKAGE_WEIGHT[input.commercialPackage] ?? 3;               // 3–15
  const oppScore = scoreOpportunityStrength(
    input.hotScore,
    input.verifiedOpportunityScore,
    input.leadScore,
  );                                                                            // 0–15
  const readScore = scoreReadiness(
    input.contactReadinessScore,
    input.signalVerification,
  );                                                                            // 0–10
  const confScore =
    er.expectedRevenueConfidence === "high"
      ? 5
      : er.expectedRevenueConfidence === "medium"
        ? 3
        : 1;                                                                    // 1–5

  // ── Final score ──────────────────────────────────────────────────────────
  const raw = mrrScore + probScore + pkgScore + oppScore + readScore + confScore;
  const revenuePriorityScore = Math.round(clamp(raw));

  // ── Tier ─────────────────────────────────────────────────────────────────
  const revenuePriorityTier: RevenuePriorityTier =
    revenuePriorityScore >= 80
      ? "critical"
      : revenuePriorityScore >= 60
        ? "high"
        : revenuePriorityScore >= 35
          ? "medium"
          : "low";

  // ── Reasoning ────────────────────────────────────────────────────────────
  const rankingReasoning = buildRankingReasoning(input, revenuePriorityTier);

  return { revenuePriorityScore, revenuePriorityTier, rankingReasoning };
}
