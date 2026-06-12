/**
 * Verified Opportunity Score v1.4.
 *
 * A unified sales-prioritization layer that blends EXISTING signals into a
 * single 0–100 estimate of how strong a sales opportunity a business is for
 * TUGOBO AI right now. This is an additional metric — it never replaces or
 * mutates leadScore, hotScore, icpFitScore, or operational value calculations.
 *
 * Philosophy: reward verified communication channels, direct-booking potential,
 * operational complexity, active digital presence and inbound demand — not raw
 * property size.
 */

import type { SignalVerificationProfile } from "./signal-verification";

export type OpportunityTier = "elite" | "high" | "medium" | "low";

export type VerifiedOpportunityResult = {
  /** 0–100 unified opportunity estimate. */
  score: number;
  tier: OpportunityTier;
  /** Stable reason keys (see {@link OPPORTUNITY_REASON_LABELS}) explaining the score. */
  reasons: string[];
};

export type VerifiedOpportunityInput = {
  leadScore: number;
  hotScore: number;
  icpFitScore: number;
  digitalMaturity: number;
  multiChannelScore: number;
  operationalComplexityScore: number;
  estimatedDemandVolume: "low" | "medium" | "high" | "unknown";
  reviewsCount: number;
  daysSinceLastReview: number;
  hasWhatsAppPath: boolean;
  /** Contextual accessibility only — gentle, never an aggressive penalty (Part 5). */
  businessOwnershipType?: "independent" | "chain" | "unknown";
  verification?: SignalVerificationProfile | null;
};

const clamp100 = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Stable opportunity reason keys → localized labels (UI + AI reasoning). */
export const OPPORTUNITY_REASON_LABELS: Record<string, { tr: string; en: string }> = {
  wa_verified: { tr: "WhatsApp doğrulandı", en: "WhatsApp verified" },
  website_verified: { tr: "Web sitesi doğrulandı", en: "Website verified" },
  reservation_verified: { tr: "Rezervasyon CTA bulundu", en: "Reservation CTA found" },
  multi_channel: { tr: "Çok kanallı iletişim", en: "Multi-channel communication" },
  high_demand: { tr: "Yüksek dijital talep", en: "High digital demand" },
  ig_verified: { tr: "Instagram doğrulandı", en: "Instagram verified" },
  high_complexity: { tr: "Yüksek operasyonel karmaşıklık", en: "High operational complexity" },
  direct_booking: { tr: "Doğrudan rezervasyon potansiyeli", en: "Direct booking potential" },
  independent_fast_access: {
    tr: "Bağımsız işletme — hızlı erişim",
    en: "Independent business — faster sales access",
  },
};

export const OPPORTUNITY_TIER_LABELS: Record<OpportunityTier, { tr: string; en: string }> = {
  elite: { tr: "Elite Fırsat", en: "Elite Opportunity" },
  high: { tr: "Yüksek Fırsat", en: "High Opportunity" },
  medium: { tr: "Orta Fırsat", en: "Medium Opportunity" },
  low: { tr: "Düşük Fırsat", en: "Low Opportunity" },
};

export function opportunityTierFromScore(score: number): OpportunityTier {
  if (score >= 90) return "elite";
  if (score >= 75) return "high";
  if (score >= 60) return "medium";
  return "low";
}

/** Numeric rank for tier-change detection (higher = stronger). */
export function opportunityTierRank(tier: OpportunityTier): number {
  return { low: 0, medium: 1, high: 2, elite: 3 }[tier];
}

/** Verified communication strength (0–100) from the v1.3 verification layer. */
function verifiedCommunicationScore(
  v: SignalVerificationProfile | null | undefined,
  hasWhatsAppPath: boolean,
): number {
  let s = 0;
  const wa = v?.whatsappVerification;
  if (wa === "verified") s += 35;
  else if (wa === "likely") s += 15;
  else if (hasWhatsAppPath) s += 8;

  const web = v?.websiteVerification;
  if (web === "verified") s += 25;
  else if (web === "reachable") s += 12;

  const res = v?.reservationSignal;
  if (res === "verified") s += 25;
  else if (res === "detected") s += 12;

  const ig = v?.instagramVerification;
  if (ig === "verified") s += 15;
  else if (ig === "likely") s += 10;
  else if (ig === "candidate") s += 6;

  return clamp100(s);
}

/** Inbound demand strength (0–100) from review volume + recency + ICP demand band. */
function demandActivityScore(
  reviewsCount: number,
  daysSinceLastReview: number,
  demandVolume: VerifiedOpportunityInput["estimatedDemandVolume"],
): number {
  let s = Math.min(60, Math.max(0, reviewsCount) * 0.4);
  if (daysSinceLastReview <= 3) s += 40;
  else if (daysSinceLastReview <= 7) s += 28;
  else if (daysSinceLastReview <= 14) s += 12;
  if (demandVolume === "high") s = Math.max(s, 75);
  else if (demandVolume === "medium") s = Math.max(s, 50);
  return clamp100(s);
}

/**
 * Compute the verified opportunity score (0–100), tier and reason keys.
 * Pure — no I/O, no mutation of existing scores.
 */
export function calculateVerifiedOpportunityScore(
  input: VerifiedOpportunityInput,
): VerifiedOpportunityResult {
  const v = input.verification ?? null;
  const comm = verifiedCommunicationScore(v, input.hasWhatsAppPath);
  const demand = demandActivityScore(
    input.reviewsCount,
    input.daysSinceLastReview,
    input.estimatedDemandVolume,
  );
  const momentum = clamp100((clamp100(input.hotScore) + clamp100(input.leadScore)) / 2);

  // Weighted blend of normalized 0–100 components (weights sum to 1.0).
  let score =
    comm * 0.3 +
    clamp100(input.icpFitScore) * 0.22 +
    demand * 0.16 +
    clamp100(input.operationalComplexityScore) * 0.1 +
    clamp100(input.multiChannelScore) * 0.08 +
    clamp100(input.digitalMaturity) * 0.06 +
    momentum * 0.08;

  // Part 5: chain ownership is contextual accessibility — gentle, not a penalty engine.
  if (input.businessOwnershipType === "independent") score += 3;
  else if (input.businessOwnershipType === "chain") score -= 5;

  const finalScore = clamp100(score);
  const tier = opportunityTierFromScore(finalScore);

  const reasons: string[] = [];
  if (v?.whatsappVerification === "verified") reasons.push("wa_verified");
  if (v?.websiteVerification === "verified") reasons.push("website_verified");
  if (v?.reservationSignal === "verified") reasons.push("reservation_verified");
  if (demand >= 70) reasons.push("high_demand");
  if (input.multiChannelScore >= 60) reasons.push("multi_channel");
  if (v?.instagramVerification === "verified") reasons.push("ig_verified");
  if (input.operationalComplexityScore >= 60) reasons.push("high_complexity");
  if (
    (v?.reservationSignal === "verified" || v?.reservationSignal === "detected") &&
    input.hasWhatsAppPath
  ) {
    reasons.push("direct_booking");
  }
  if (input.businessOwnershipType === "independent" && finalScore >= 75) {
    reasons.push("independent_fast_access");
  }

  return { score: finalScore, tier, reasons: reasons.slice(0, 6) };
}
