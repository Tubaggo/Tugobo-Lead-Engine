import type { BusinessSignal } from "./signals";

/** Mirrors {@link import("./ai-insight").OpportunityLevel} — duplicated here to avoid circular imports. */
type OpportunityLevel = "low" | "medium" | "high";

/**
 * Lightweight, rule-based "how to approach this lead" layer.
 *
 * Sits on top of the existing scoring + AI insight stack.
 * No LLM calls, no async work — pure derivation from already-scored fields.
 *
 * Keep IDs stable; downstream UI / message generation matches on them.
 */

export type OutreachStyle =
  | "consultative"
  | "direct"
  | "educational"
  | "relationship"
  | "conversion-focused";

export type OutreachUrgency = "low" | "medium" | "high";

export type SalesApproach =
  | "whatsapp-speed"
  | "direct-booking"
  | "conversion-gap"
  | "operational-efficiency"
  | "social-demand"
  | "guest-experience";

export type RecommendedChannel =
  | "whatsapp"
  | "instagram"
  | "phone"
  | "website-form";

export type LeadTemperature = "cold" | "warm" | "hot";

export type BusinessTierLike =
  | "micro"
  | "small"
  | "medium"
  | "premium"
  | "enterprise";

export type OutreachIntelligenceProfile = {
  outreachStyle: OutreachStyle;
  urgencyLevel: OutreachUrgency;
  salesApproach: SalesApproach;
  recommendedChannel: RecommendedChannel;
  leadTemperature: LeadTemperature;
  /** Short, human-readable rationale lines for UI / debug; never user-facing copy. */
  rationale: string[];
};

/** Narrow input — does not import from `leads.ts` to avoid circular deps. */
export type OutreachIntelligenceInput = {
  businessTier?: BusinessTierLike;
  hasWhatsAppPath: boolean;
  hasInstagram: boolean;
  hasOwnWebsite: boolean;
  contactQuality: "high" | "medium" | "low";
  channels: readonly string[];
  businessSignals?: readonly BusinessSignal[];
  reviewPainPoints?: ReadonlyArray<{
    category: string;
    severity: "low" | "medium" | "high";
  }>;
  hotScore: number;
  leadScore: number;
  opportunityScore?: number;
  opportunityLevel?: OpportunityLevel;
  communicationRisk?: number;
  intelligenceScore?: number;
  websiteIntelligence?: {
    hasBookingCtaText?: boolean;
    hasBookingEngine?: boolean;
  };
  /** Optional fallback inputs when v3 fields are missing. */
  units?: number;
  pricePerNight?: number;
};

const COMMUNICATION_PAIN_CATEGORIES = new Set<string>([
  "response_delay",
  "unreachable",
  "communication",
  "reservation",
]);

function tierFromUnits(input: OutreachIntelligenceInput): BusinessTierLike {
  if (input.businessTier) return input.businessTier;
  const units = typeof input.units === "number" && Number.isFinite(input.units)
    ? input.units
    : 0;
  if (units >= 140) return "enterprise";
  if (units >= 60) return "premium";
  if (units >= 20) return "medium";
  if (units >= 6) return "small";
  return "micro";
}

function hasOtaChannel(channels: readonly string[]): boolean {
  return channels.some((c) => c === "Booking" || c === "Airbnb" || c === "Tatilsepeti");
}

function hasDirectChannel(channels: readonly string[]): boolean {
  return channels.includes("Direct");
}

function hasCommunicationPain(input: OutreachIntelligenceInput): boolean {
  const points = input.reviewPainPoints ?? [];
  for (const p of points) {
    if (COMMUNICATION_PAIN_CATEGORIES.has(p.category)) return true;
  }
  const sigs = input.businessSignals ?? [];
  if (sigs.includes("reputation_risk")) return true;
  if ((input.communicationRisk ?? 0) >= 50) return true;
  return false;
}

function hasWeakBookingFlow(input: OutreachIntelligenceInput): boolean {
  const sigs = input.businessSignals ?? [];
  if (sigs.includes("conversion_gap")) return true;
  if (sigs.includes("missing_own_website")) return true;
  if (input.websiteIntelligence?.hasBookingCtaText === false) return true;
  if (
    input.hasOwnWebsite &&
    input.websiteIntelligence?.hasBookingEngine === false
  ) {
    return true;
  }
  return false;
}

function hasStrongOtaDependency(input: OutreachIntelligenceInput): boolean {
  const sigs = input.businessSignals ?? [];
  if (sigs.includes("ota_dependency")) return true;
  if (sigs.includes("single_channel_risk") && hasOtaChannel(input.channels)) {
    return true;
  }
  if (hasOtaChannel(input.channels) && !hasDirectChannel(input.channels)) {
    return true;
  }
  return false;
}

function pickSalesApproach(input: OutreachIntelligenceInput): {
  approach: SalesApproach;
  reason: string;
} {
  const reachableViaWhatsApp =
    input.hasWhatsAppPath && input.contactQuality !== "low";
  const commPain = hasCommunicationPain(input);
  const weakBooking = hasWeakBookingFlow(input);
  const strongOta = hasStrongOtaDependency(input);
  const sigs = input.businessSignals ?? [];

  if (reachableViaWhatsApp && commPain) {
    return {
      approach: "whatsapp-speed",
      reason: "WhatsApp reachable + communication pain signals",
    };
  }
  if (strongOta) {
    return {
      approach: "direct-booking",
      reason: "OTA-leaning channel mix without strong direct path",
    };
  }
  if (input.hasInstagram && weakBooking) {
    return {
      approach: "social-demand",
      reason: "Active Instagram with weak booking flow",
    };
  }
  if (sigs.includes("conversion_gap") || weakBooking) {
    return {
      approach: "conversion-gap",
      reason: "Conversion gap between attention and reservation",
    };
  }
  if (
    sigs.includes("reputation_risk") ||
    (input.reviewPainPoints?.length ?? 0) > 0
  ) {
    return {
      approach: "guest-experience",
      reason: "Review-derived guest experience signals",
    };
  }
  return {
    approach: "operational-efficiency",
    reason: "No dominant pain — lead with operational efficiency",
  };
}

function styleFromTier(tier: BusinessTierLike): OutreachStyle {
  if (tier === "premium" || tier === "medium") return "consultative";
  if (tier === "micro") return "relationship";
  if (tier === "small") return "educational";
  return "educational";
}

function pickOutreachStyle(
  input: OutreachIntelligenceInput,
  approach: SalesApproach,
): { style: OutreachStyle; reason: string } {
  const tier = tierFromUnits(input);
  const baseStyle = styleFromTier(tier);
  const opp = input.opportunityScore ?? 0;
  const reachable =
    (input.hasWhatsAppPath && input.contactQuality !== "low") ||
    input.hasInstagram;

  if (
    (approach === "direct-booking" || approach === "conversion-gap") &&
    reachable &&
    (opp >= 65 || input.opportunityLevel === "high")
  ) {
    return {
      style: "conversion-focused",
      reason: "High direct-booking opportunity on a reachable lead",
    };
  }

  if (approach === "whatsapp-speed" && (input.communicationRisk ?? 0) >= 60) {
    return {
      style: "direct",
      reason: "Communication risk high — keep tone brief and concrete",
    };
  }

  if (approach === "guest-experience" && tier === "premium") {
    return {
      style: "consultative",
      reason: "Premium tier — guest experience deserves a strategic frame",
    };
  }

  if (approach === "guest-experience" && tier === "micro") {
    return {
      style: "relationship",
      reason: "Micro tier — keep tone warm, avoid sounding transactional",
    };
  }

  return { style: baseStyle, reason: `Tier '${tier}' default style` };
}

function pickUrgencyLevel(input: OutreachIntelligenceInput): {
  urgency: OutreachUrgency;
  reason: string;
} {
  const opp = input.opportunityScore ?? 0;
  const reachable =
    (input.hasWhatsAppPath && input.contactQuality !== "low") ||
    input.hasInstagram;
  const commRisk = input.communicationRisk ?? 0;

  if (opp >= 75 && reachable) {
    return { urgency: "high", reason: "High opportunity score and reachable" };
  }
  if (input.opportunityLevel === "high" && reachable && commRisk >= 50) {
    return {
      urgency: "high",
      reason: "High opportunity + communication risk window",
    };
  }
  if (input.hotScore >= 75 && reachable) {
    return { urgency: "high", reason: "Hot score above 75 with a reachable channel" };
  }
  if (
    opp >= 55 ||
    input.opportunityLevel === "medium" ||
    input.hotScore >= 60
  ) {
    return { urgency: "medium", reason: "Medium opportunity / hot score" };
  }
  return { urgency: "low", reason: "No strong urgency signals" };
}

function pickRecommendedChannel(input: OutreachIntelligenceInput): {
  channel: RecommendedChannel;
  reason: string;
} {
  if (input.hasWhatsAppPath && input.contactQuality === "high") {
    return { channel: "whatsapp", reason: "WhatsApp-ready mobile" };
  }
  if (input.hasWhatsAppPath && input.contactQuality === "medium") {
    return { channel: "whatsapp", reason: "Mobile WhatsApp likely usable" };
  }
  if (input.hasInstagram) {
    return { channel: "instagram", reason: "Active Instagram is the next-best surface" };
  }
  if (input.contactQuality === "low" && input.hasOwnWebsite) {
    return {
      channel: "website-form",
      reason: "Phone unclear — owned site form is the safest path",
    };
  }
  if (input.contactQuality !== "low") {
    return { channel: "phone", reason: "Phone available for outbound call" };
  }
  return {
    channel: "website-form",
    reason: "No fast channel — fall back to website form",
  };
}

function pickLeadTemperature(input: OutreachIntelligenceInput): {
  temperature: LeadTemperature;
  reason: string;
} {
  const reachable =
    (input.hasWhatsAppPath && input.contactQuality !== "low") ||
    input.hasInstagram;
  const opp = input.opportunityScore ?? 0;
  const intel = input.intelligenceScore ?? 0;

  if (
    reachable &&
    input.hotScore >= 65 &&
    (input.opportunityLevel === "high" || opp >= 70)
  ) {
    return { temperature: "hot", reason: "Reachable + hot + high opportunity" };
  }
  if (
    reachable &&
    (input.hotScore >= 55 || opp >= 55 || intel >= 60 ||
      input.opportunityLevel === "medium")
  ) {
    return { temperature: "warm", reason: "Reachable with mid-range signals" };
  }
  if (!reachable && input.hotScore >= 70 && opp >= 70) {
    return {
      temperature: "warm",
      reason: "Strong potential but channel fit weak",
    };
  }
  return { temperature: "cold", reason: "Limited urgency / reachability" };
}

/** Pure rule-based outreach intelligence layer. Stable for the same input. */
export function deriveOutreachIntelligence(
  input: OutreachIntelligenceInput,
): OutreachIntelligenceProfile {
  const sales = pickSalesApproach(input);
  const style = pickOutreachStyle(input, sales.approach);
  const urgency = pickUrgencyLevel(input);
  const channel = pickRecommendedChannel(input);
  const temperature = pickLeadTemperature(input);

  return {
    outreachStyle: style.style,
    urgencyLevel: urgency.urgency,
    salesApproach: sales.approach,
    recommendedChannel: channel.channel,
    leadTemperature: temperature.temperature,
    rationale: [sales.reason, style.reason, urgency.reason, channel.reason, temperature.reason],
  };
}

// ---------------------------------------------------------------------------
// Display labels (used by UI; kept here so any consumer renders consistently)
// ---------------------------------------------------------------------------

export const OUTREACH_STYLE_LABEL: Record<OutreachStyle, string> = {
  consultative: "Consultative",
  direct: "Direct",
  educational: "Educational",
  relationship: "Relationship",
  "conversion-focused": "Conversion-focused",
};

export const SALES_APPROACH_LABEL: Record<SalesApproach, string> = {
  "whatsapp-speed": "WhatsApp Speed",
  "direct-booking": "Direct Booking",
  "conversion-gap": "Close Conversion Gap",
  "operational-efficiency": "Operational Efficiency",
  "social-demand": "Social Demand",
  "guest-experience": "Guest Experience",
};

export const RECOMMENDED_CHANNEL_LABEL: Record<RecommendedChannel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  phone: "Phone",
  "website-form": "Website Form",
};

export const URGENCY_LABEL: Record<OutreachUrgency, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const LEAD_TEMPERATURE_LABEL: Record<LeadTemperature, string> = {
  cold: "Cold",
  warm: "Warm",
  hot: "Hot",
};
