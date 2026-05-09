import type {
  AcquisitionIntelligence,
  BusinessTierLike,
} from "./acquisition-intelligence";

export type CommercialReadinessLevel = "low" | "medium" | "high" | "very_high";

export type CommercialReadiness = {
  commercialReadinessScore: number;
  commercialReadinessLevel: CommercialReadinessLevel;
  commercialSignals: string[];
  commercialWeaknesses: string[];
  commercialSummary: string[];
};

type WebsiteIntelLike = {
  hasBookingCtaText?: boolean;
  hasBookingEngine?: boolean;
  errors?: string[];
};

export type CommercialReadinessInput = {
  businessTier?: BusinessTierLike;
  hasOwnWebsite: boolean;
  hasInstagram: boolean;
  hasWhatsAppPath: boolean;
  channels: readonly string[];
  websiteIntelligence?: WebsiteIntelLike;
  acquisition: AcquisitionIntelligence;
  bookingFlowStrength: number;
  digitalMaturity: number;
  communicationHealth: number;
  operationalActivity: number;
  reviewsCount: number;
  daysSinceLastReview: number;
  socialDemandStrength: number;
  otaDependencyLikelihood: number;
  units?: number;
};

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

function hasOta(channels: readonly string[]): boolean {
  return channels.some((c) => c === "Booking" || c === "Airbnb" || c === "Tatilsepeti");
}

function uniq(items: string[]): string[] {
  return [...new Set(items)];
}

export function getCommercialReadinessLevel(score: number): CommercialReadinessLevel {
  const s = clamp(score);
  if (s >= 80) return "very_high";
  if (s >= 64) return "high";
  if (s >= 44) return "medium";
  return "low";
}

export function detectCommercialSignals(input: CommercialReadinessInput): string[] {
  const out: string[] = [];
  const push = (v: string) => {
    if (!out.includes(v)) out.push(v);
  };
  const tier = input.businessTier;
  const acq = input.acquisition;
  const channels = acq.acquisitionChannels;

  if (tier === "premium" || tier === "medium") push("Premium/medium business tier");
  if (acq.isAcquisitionActive && channels.length >= 2) push("Active multi-channel acquisition");
  if (input.hasOwnWebsite) push("Website exists");
  if (input.websiteIntelligence?.hasBookingCtaText || input.websiteIntelligence?.hasBookingEngine) {
    push("Direct booking attempt exists");
  }
  if (channels.includes("content_marketing")) push("Content production exists");
  if (input.hasInstagram) push("Active Instagram");
  if (channels.includes("meta_ads_possible") || channels.includes("google_ads_possible")) {
    push("Possible ad activity");
  }
  if (input.digitalMaturity >= 58 && input.communicationHealth >= 52) push("Branding consistency");
  if (hasOta(input.channels) && input.otaDependencyLikelihood >= 40 && input.bookingFlowStrength >= 44) {
    push("OTA optimization effort");
  }
  if (input.hasWhatsAppPath && input.communicationHealth >= 58) {
    push("WhatsApp responsiveness signals");
  }
  if (input.operationalActivity >= 58) push("Operational activity high");
  if (input.reviewsCount >= 40 && input.daysSinceLastReview <= 7) push("Recent review activity");

  return out;
}

export function detectCommercialWeaknesses(input: CommercialReadinessInput): string[] {
  const out: string[] = [];
  const push = (v: string) => {
    if (!out.includes(v)) out.push(v);
  };

  if (
    !input.hasOwnWebsite &&
    !input.hasInstagram &&
    input.acquisition.acquisitionChannels.length <= 1
  ) {
    push("Extremely weak digital presence");
  }
  if (input.operationalActivity < 35) push("Low operational activity");
  if (input.acquisition.acquisitionSignals.length <= 1) push("Low data quality");
  if (
    (input.websiteIntelligence?.errors?.length ?? 0) > 0 ||
    (input.hasOwnWebsite &&
      input.websiteIntelligence?.hasBookingCtaText === false &&
      input.websiteIntelligence?.hasBookingEngine === false)
  ) {
    push("Outdated or broken digital assets");
  }
  if (!input.hasWhatsAppPath && input.communicationHealth < 45) push("Fragmented communication");
  if (!input.hasInstagram && input.socialDemandStrength < 45) push("Inactive social signals");
  const units = typeof input.units === "number" && Number.isFinite(input.units) ? input.units : 0;
  if (units > 0 && units <= 2) push("Extremely micro scale");

  return out;
}

export function calculateCommercialReadiness(input: CommercialReadinessInput): CommercialReadiness {
  const signals = detectCommercialSignals(input);
  const weaknesses = detectCommercialWeaknesses(input);
  const acq = input.acquisition;

  let score = 24;
  score += signals.length * 4.8;
  score += Math.min(14, acq.acquisitionIntentScore * 0.16);
  score += Math.min(10, input.digitalMaturity * 0.08);
  score += Math.min(9, input.operationalActivity * 0.07);

  if (input.businessTier === "medium" || input.businessTier === "premium") score += 8;
  if (input.hasOwnWebsite) score += 6;
  if (input.websiteIntelligence?.hasBookingEngine || input.websiteIntelligence?.hasBookingCtaText) score += 5;
  if (acq.isAcquisitionActive && acq.acquisitionChannels.length >= 3) score += 7;
  if (input.bookingFlowStrength < 50 && acq.isAcquisitionActive) score += 4;
  if (input.reviewsCount >= 80 && input.daysSinceLastReview <= 10) score += 4;

  score -= weaknesses.length * 5.5;
  if (input.operationalActivity < 32) score -= 8;
  if (!input.hasOwnWebsite && !input.hasInstagram) score -= 8;
  if (input.communicationHealth < 40) score -= 6;

  const commercialReadinessScore = Math.round(clamp(score));
  const commercialReadinessLevel = getCommercialReadinessLevel(commercialReadinessScore);

  const commercialSummary = uniq([
    commercialReadinessLevel === "very_high"
      ? "Commercially active with strong ROI orientation"
      : commercialReadinessLevel === "high"
        ? "Likely to understand and invest in conversion optimization"
        : commercialReadinessLevel === "medium"
          ? "Some growth intent, but commercial maturity is mixed"
          : "Needs relationship-first education before conversion systems",
    signals[0] ?? "Commercial signals are limited",
    weaknesses[0] ?? "No major commercial weakness detected",
  ]);

  return {
    commercialReadinessScore,
    commercialReadinessLevel,
    commercialSignals: signals,
    commercialWeaknesses: weaknesses,
    commercialSummary,
  };
}
