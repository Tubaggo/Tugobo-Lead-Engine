/**
 * Commercial Packaging Engine v3.7.0
 *
 * Maps an evaluated lead's signals to a TUGOBO subscription tier
 * (Starter / Professional / Growth / Enterprise) using a deterministic,
 * weighted commercialFitScore (0–100).
 *
 * No AI, no I/O, no schema changes. Pure function — safe to call anywhere.
 *
 * Score thresholds → package:
 *   0–39   → Starter      (₺5.000/ay)
 *   40–59  → Professional (₺10.000/ay)
 *   60–79  → Growth       (₺20.000/ay)
 *   80–100 → Enterprise   (₺40.000/ay)
 */

import type { IcpAlignmentProfile } from "@/app/lib/intelligence/icp-alignment";
import type { SignalVerificationProfile } from "@/app/lib/signal-verification";
import type { AcquisitionIntelligenceProfile } from "@/app/lib/intelligence/acquisition-intelligence";
import type { SignalConfidence } from "@/app/lib/intelligence/confidence";

// ── Public types ──────────────────────────────────────────────────────────────

export type CommercialPackage =
  | "starter"
  | "professional"
  | "growth"
  | "enterprise";

export interface CommercialPackagingResult {
  package: CommercialPackage;
  packagePrice: number;
  monthlyRevenue: number;
  annualRevenue: number;
  commercialFitScore: number;
  reasoning: string[];
}

export interface CommercialPackagingInput {
  // ICP alignment (v1.2 profile — estimatedPropertySize, estimatedDemandVolume,
  // multiChannelScore, operationalComplexityScore)
  icpFitScore: number;
  icpAlignment?: IcpAlignmentProfile | null;

  // Verified Opportunity Score — v1.4 unified sales-priority layer (0–100)
  verifiedOpportunityScore: number;

  // Signal verification — verified channel states (v1.3)
  signalVerification?: SignalVerificationProfile | null;

  // Raw presence flags (fallback when signalVerification is absent)
  hasOwnWebsite: boolean;
  hasInstagram: boolean;
  phone?: string | null;

  // Marketing intensity proxies
  adsLikelihood?: SignalConfidence;
  acquisitionIntelligence?: AcquisitionIntelligenceProfile | null;

  // Revenue potential proxies
  digitalMaturity?: number;
  leadScore?: number;
}

// ── Pricing constants ─────────────────────────────────────────────────────────

export const COMMERCIAL_PACKAGE_PRICES: Record<CommercialPackage, number> = {
  starter: 5_000,
  professional: 10_000,
  growth: 20_000,
  enterprise: 40_000,
};

export const COMMERCIAL_PACKAGE_LABELS: Record<CommercialPackage, string> = {
  starter: "Starter",
  professional: "Professional",
  growth: "Growth",
  enterprise: "Enterprise",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const clamp = (n: number, min = 0, max = 100): number =>
  Math.max(min, Math.min(max, n));

// ── Component scorers (weights sum to 100 across max values) ──────────────────

/**
 * Verified Opportunity Score component — max 25 pts.
 * Highest weight: this is the primary sales-readiness signal.
 */
function scoreVerifiedOpportunity(vos: number): number {
  return clamp(vos) * 0.25;
}

/**
 * ICP alignment component — max 20 pts.
 * How well the lead fits the TUGOBO target customer profile.
 */
function scoreIcpAlignment(icpFitScore: number): number {
  return clamp(icpFitScore) * 0.20;
}

/**
 * Demand volume component — max 15 pts.
 * High inbound demand = greater need for TUGOBO's automation layer.
 */
function scoreDemandVolume(
  demandVolume: IcpAlignmentProfile["estimatedDemandVolume"] | undefined,
): number {
  if (demandVolume === "high") return 15;
  if (demandVolume === "medium") return 9;
  if (demandVolume === "low") return 3;
  return 0; // "unknown"
}

/**
 * Marketing intensity component — max 12 pts.
 * Active acquisition spend / channels signal budget willingness.
 */
function scoreMarketingIntensity(
  adsLikelihood: SignalConfidence | undefined,
  acqIntel: AcquisitionIntelligenceProfile | null | undefined,
): number {
  let pts = 0;

  // Ads-likelihood: confirmed (5) / likely (3) / weak (1)
  if (adsLikelihood === "confirmed") pts += 5;
  else if (adsLikelihood === "likely") pts += 3;
  else if (adsLikelihood === "weak") pts += 1;

  // Active acquisition intelligence
  const acq = acqIntel?.acquisition;
  if (acq?.isAcquisitionActive) pts += 4;
  if ((acq?.acquisitionChannels?.length ?? 0) >= 2) pts += 3;

  return Math.min(12, pts);
}

/**
 * Revenue potential component — max 12 pts.
 * Derived from three proxies (4 pts each):
 *   digitalMaturity, operationalComplexityScore, leadScore
 */
function scoreRevenuePotential(
  digitalMaturity: number,
  operationalComplexityScore: number,
  leadScore: number,
): number {
  return (
    (clamp(digitalMaturity) / 100) * 4 +
    (clamp(operationalComplexityScore) / 100) * 4 +
    (clamp(leadScore) / 100) * 4
  );
}

/**
 * Website presence component — max 7 pts.
 * Verified presence strongest; raw flag is a fallback.
 */
function scoreWebsitePresence(
  sv: SignalVerificationProfile | null | undefined,
  hasOwnWebsite: boolean,
): number {
  const webVerif = sv?.websiteVerification;
  if (webVerif === "verified") return 7;
  if (webVerif === "reachable") return 4;
  if (hasOwnWebsite) return 3;
  return 0;
}

/**
 * WhatsApp presence component — max 5 pts.
 * Phone number alone earns 1 pt as a bare-minimum reachability signal.
 */
function scoreWhatsAppPresence(
  sv: SignalVerificationProfile | null | undefined,
  phone: string | null | undefined,
): number {
  const waVerif = sv?.whatsappVerification;
  if (waVerif === "verified") return 5;
  if (waVerif === "likely") return 3;
  if (phone?.trim()) return 1;
  return 0;
}

/**
 * Instagram presence component — max 4 pts.
 * Raw flag earns 2 pts as a confirmed channel existence signal.
 */
function scoreInstagramPresence(
  sv: SignalVerificationProfile | null | undefined,
  hasInstagram: boolean,
): number {
  const igVerif = sv?.instagramVerification;
  if (igVerif === "verified") return 4;
  if (igVerif === "likely") return 3;
  if (igVerif === "candidate") return 2;
  if (hasInstagram) return 2;
  return 0;
}

// ── Package mapping ───────────────────────────────────────────────────────────

function packageFromScore(score: number): CommercialPackage {
  if (score >= 80) return "enterprise";
  if (score >= 60) return "growth";
  if (score >= 40) return "professional";
  return "starter";
}

// ── Reasoning builder ─────────────────────────────────────────────────────────

const PRICE_LABELS: Record<CommercialPackage, string> = {
  starter: "₺5.000/ay",
  professional: "₺10.000/ay",
  growth: "₺20.000/ay",
  enterprise: "₺40.000/ay",
};

const PKG_NAMES_TR: Record<CommercialPackage, string> = {
  starter: "Starter",
  professional: "Professional",
  growth: "Growth",
  enterprise: "Enterprise",
};

function buildReasoning(
  input: CommercialPackagingInput,
  pkg: CommercialPackage,
  score: number,
  sv: SignalVerificationProfile | null | undefined,
): string[] {
  const out: string[] = [];

  // Headline: score + package assignment
  out.push(
    `Ticari uyum skoru ${score}/100 — ${PKG_NAMES_TR[pkg]} paketi öneriliyor (${PRICE_LABELS[pkg]})`,
  );

  // Verified Opportunity Score
  const vos = input.verifiedOpportunityScore ?? 0;
  if (vos >= 80) out.push("Doğrulanmış fırsat skoru çok yüksek (≥80)");
  else if (vos >= 60) out.push("Güçlü doğrulanmış fırsat skoru (≥60)");
  else if (vos >= 40) out.push("Orta düzey doğrulanmış fırsat skoru (≥40)");
  else out.push("Doğrulanmış fırsat skoru düşük (<40)");

  // ICP alignment
  const icp = input.icpFitScore ?? 0;
  if (icp >= 75) out.push("ICP uyumu yüksek (≥75)");
  else if (icp >= 55) out.push("ICP uyumu orta düzey (≥55)");
  else out.push("ICP uyumu zayıf (<55)");

  // Demand volume
  const dv = input.icpAlignment?.estimatedDemandVolume;
  if (dv === "high") out.push("Yüksek dijital talep hacmi");
  else if (dv === "medium") out.push("Orta düzey dijital talep");
  else if (dv === "low") out.push("Düşük dijital talep");

  // Marketing intensity
  const adsL = input.adsLikelihood;
  if (adsL === "confirmed") out.push("Yüksek pazarlama aktivitesi tespit edildi");
  else if (adsL === "likely") out.push("Orta düzey pazarlama aktivitesi");
  if (input.acquisitionIntelligence?.acquisition.isAcquisitionActive) {
    out.push("Aktif dijital edinim kanalları mevcut");
  }

  // Website
  if (sv?.websiteVerification === "verified") out.push("Web sitesi doğrulandı");
  else if (sv?.websiteVerification === "reachable") out.push("Web sitesi erişilebilir");
  else if (input.hasOwnWebsite) out.push("Web sitesi mevcut");

  // WhatsApp
  if (sv?.whatsappVerification === "verified") out.push("WhatsApp hattı doğrulandı");
  else if (sv?.whatsappVerification === "likely") out.push("WhatsApp hattı muhtemelen aktif");

  // Instagram
  if (sv?.instagramVerification === "verified") out.push("Instagram kanalı doğrulandı");
  else if (input.hasInstagram) out.push("Instagram kanalı mevcut");

  // Digital maturity bonus
  const dm = input.digitalMaturity ?? 0;
  if (dm >= 70) out.push("Yüksek dijital olgunluk (≥70)");

  return out.slice(0, 8);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Compute the commercial package for a lead.
 *
 * Pure deterministic function — safe to call in render, server actions, or
 * background jobs without side effects.
 *
 * @example
 * const result = computeCommercialPackaging({
 *   icpFitScore: lead.icpFitScore ?? 0,
 *   icpAlignment: lead.icpAlignment,
 *   verifiedOpportunityScore: lead.verifiedOpportunityScore ?? 0,
 *   signalVerification: lead.signalVerification,
 *   hasOwnWebsite: lead.hasOwnWebsite,
 *   hasInstagram: lead.hasInstagram,
 *   phone: lead.phone,
 *   adsLikelihood: lead.adsLikelihood,
 *   acquisitionIntelligence: lead.acquisitionIntelligence,
 *   digitalMaturity: lead.digitalMaturity,
 *   leadScore: lead.leadScore,
 * });
 */
export function computeCommercialPackaging(
  input: CommercialPackagingInput,
): CommercialPackagingResult {
  const sv = input.signalVerification ?? null;
  const icp = input.icpAlignment ?? null;

  const rawScore =
    scoreVerifiedOpportunity(input.verifiedOpportunityScore ?? 0) +
    scoreIcpAlignment(input.icpFitScore ?? 0) +
    scoreDemandVolume(icp?.estimatedDemandVolume) +
    scoreMarketingIntensity(input.adsLikelihood, input.acquisitionIntelligence) +
    scoreRevenuePotential(
      input.digitalMaturity ?? 0,
      icp?.operationalComplexityScore ?? 0,
      input.leadScore ?? 0,
    ) +
    scoreWebsitePresence(sv, input.hasOwnWebsite) +
    scoreWhatsAppPresence(sv, input.phone) +
    scoreInstagramPresence(sv, input.hasInstagram);

  const commercialFitScore = Math.round(clamp(rawScore));
  const pkg = packageFromScore(commercialFitScore);
  const packagePrice = COMMERCIAL_PACKAGE_PRICES[pkg];
  const reasoning = buildReasoning(input, pkg, commercialFitScore, sv);

  return {
    package: pkg,
    packagePrice,
    monthlyRevenue: packagePrice,
    annualRevenue: packagePrice * 12,
    commercialFitScore,
    reasoning,
  };
}
