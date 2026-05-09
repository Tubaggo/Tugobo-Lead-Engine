import type { AcquisitionIntelligenceProfile } from "./acquisition-intelligence";
import type { CommercialReadiness } from "./commercial-readiness";
import type { ConversionLeak } from "./conversion-leak";

export type OpportunityLevel = "low" | "medium" | "high" | "very_high";

export type OpportunityProfile = {
  opportunityScore: number;
  opportunityLevel: OpportunityLevel;
  opportunityReasons: string[];
  opportunityRisks: string[];
  recommendedSalesAngle: string;
  recommendedChannel: string;
  recommendedUrgency: "low" | "medium" | "high";
};

export type OpportunityInput = {
  acquisitionIntentScore: number;
  conversionLeakScore: number;
  commercialReadinessScore: number;
  reachabilityScore: number;
  contactQuality: "high" | "medium" | "low";
  otaDependencyLikelihood: number;
  hasWhatsAppPath: boolean;
  socialDemandStrength: number;
  bookingFlowStrength: number;
  operationalActivity: number;
  outreachPriority?: number;
  intelligenceScore?: number;
  businessSignals?: readonly string[];
  acquisitionIntelligence?: AcquisitionIntelligenceProfile;
  conversionLeak?: ConversionLeak;
  commercialReadiness?: CommercialReadiness;
  hasInstagram?: boolean;
  hasOwnWebsite?: boolean;
};

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

function uniq(items: string[], max = 8): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= max) break;
  }
  return out;
}

export function getOpportunityLevel(score: number): OpportunityLevel {
  const s = clamp(score);
  if (s >= 80) return "very_high";
  if (s >= 64) return "high";
  if (s >= 42) return "medium";
  return "low";
}

export function calculateOpportunityScore(input: OpportunityInput): number {
  const acq = clamp(input.acquisitionIntentScore);
  const leak = clamp(input.conversionLeakScore);
  const comm = clamp(input.commercialReadinessScore);
  const reach = clamp(input.reachabilityScore);
  const ota = clamp(input.otaDependencyLikelihood);
  const social = clamp(input.socialDemandStrength);
  const bookingWeakness = clamp(100 - input.bookingFlowStrength);
  const ops = clamp(input.operationalActivity);
  const priority = clamp(input.outreachPriority ?? 0);
  const intel = clamp(input.intelligenceScore ?? 0);

  // Weighted opportunity logic:
  // - acquisition pressure + conversion leakage => strongest consultative upside
  // - commercial readiness + reachability determine execution realism
  // - outreach priority/intelligence provide bounded support
  let score =
    acq * 0.24 +
    leak * 0.22 +
    comm * 0.2 +
    reach * 0.15 +
    bookingWeakness * 0.07 +
    ota * 0.05 +
    social * 0.04 +
    priority * 0.02 +
    intel * 0.01;

  const acquisitionActive = Boolean(input.acquisitionIntelligence?.acquisition.isAcquisitionActive);
  const highLeak = leak >= 55;
  const reachable = reach >= 55;

  if (acquisitionActive && highLeak && comm >= 60) score += 10;
  if (input.hasWhatsAppPath && acquisitionActive) score += 5;

  if (acq < 35 && comm < 45 && ops < 35) score -= 16;
  if (acq >= 70 && reach < 40) score -= 8;
  if (comm >= 72 && acq < 42) score -= 6;
  if (!reachable && input.contactQuality === "low") score -= 7;

  return Math.round(clamp(score));
}

export function getOpportunityReasons(input: OpportunityInput): string[] {
  const reasons: string[] = [];
  const acq = input.acquisitionIntentScore;
  const leak = input.conversionLeakScore;
  const comm = input.commercialReadinessScore;
  const reach = input.reachabilityScore;

  if (acq >= 65) reasons.push("Acquisition intent is active");
  if (leak >= 52) reasons.push("Strong conversion opportunity from leak signals");
  if (comm >= 64) reasons.push("Commercial readiness supports ROI conversation");
  if (input.hasWhatsAppPath && input.contactQuality !== "low") reasons.push("WhatsApp-reachable contact path");
  if (input.otaDependencyLikelihood >= 65) reasons.push("OTA dependency indicates direct-booking upside");
  if (input.socialDemandStrength >= 58) reasons.push("Social activity indicates demand");
  if (input.bookingFlowStrength < 48) reasons.push("Booking flow weakness creates improvement potential");
  if (reach >= 65 && reasons.length > 0) reasons.push("High outreach execution likelihood");

  return uniq(reasons, 6);
}

function getOpportunityRisks(input: OpportunityInput): string[] {
  const risks: string[] = [];
  if (input.acquisitionIntentScore < 35) risks.push("Weak acquisition pressure");
  if (input.operationalActivity < 35) risks.push("Low operational activity");
  if (input.commercialReadinessScore < 44) risks.push("Commercial readiness is early-stage");
  if (input.reachabilityScore < 45 || input.contactQuality === "low") risks.push("Reachability is limited");
  if (!input.hasWhatsAppPath) risks.push("No WhatsApp channel");
  return uniq(risks, 5);
}

export function getRecommendedSalesAngle(input: OpportunityInput): string {
  const leak = input.conversionLeakScore;
  const ota = input.otaDependencyLikelihood;
  const weakBooking = input.bookingFlowStrength < 50;
  const socialStrong = input.socialDemandStrength >= 58;

  if (ota >= 65 && weakBooking) return "ota_dependency_reduction";
  if (leak >= 60 && weakBooking) return "conversion_optimization";
  if (socialStrong && weakBooking) return "guest_conversion";
  if (input.hasWhatsAppPath && input.contactQuality !== "low") return "response_automation";
  return "direct_booking_growth";
}

export function getRecommendedChannel(input: OpportunityInput): string {
  if (input.hasWhatsAppPath && input.contactQuality !== "low") return "whatsapp";
  if (input.hasInstagram) return "instagram";
  if (input.contactQuality !== "low") return "phone";
  return "website_form";
}

function getRecommendedUrgency(score: number, input: OpportunityInput): "low" | "medium" | "high" {
  if (score >= 78 && input.reachabilityScore >= 55) return "high";
  if (score >= 54) return "medium";
  return "low";
}

export function calculateOpportunityProfile(input: OpportunityInput): OpportunityProfile {
  const opportunityScore = calculateOpportunityScore(input);
  return {
    opportunityScore,
    opportunityLevel: getOpportunityLevel(opportunityScore),
    opportunityReasons: getOpportunityReasons(input),
    opportunityRisks: getOpportunityRisks(input),
    recommendedSalesAngle: getRecommendedSalesAngle(input),
    recommendedChannel: getRecommendedChannel(input),
    recommendedUrgency: getRecommendedUrgency(opportunityScore, input),
  };
}
