import type { EnrichmentV2Profile } from "./enrichment-v2";
/** Mirrors {@link import("@/app/lib/leads").Channel} — kept local to avoid circular imports. */
type Channel = "Booking" | "Airbnb" | "Direct" | "Tatilsepeti";

/**
 * Structured business signals derived from listing + operational proxies.
 * Expand as review / website / LLM layers land; keep IDs stable for analytics.
 */
export type BusinessSignal =
  | "weak_digital_presence"
  | "active_marketing_surface"
  | "conversion_gap"
  | "reputation_risk"
  | "direct_contact_possible"
  | "ota_dependency"
  | "single_channel_risk"
  | "missing_own_website"
  | "instagram_presence_gap"
  | "review_recency_stale"
  | "review_volume_operational_scale"
  | "landline_or_unclear_phone"
  | "no_listed_phone"
  | "premium_without_owned_funnel"
  | "weak_booking_cta"
  | "no_booking_flow"
  | "external_only_booking_dependency"
  | "weak_contact_visibility"
  | "low_operational_activity"
  | "social_acquisition_intent"
  | "paid_traffic_candidate";

export type LeadSignalInput = {
  hasOwnWebsite: boolean;
  hasInstagram: boolean;
  channels: Channel[];
  rating: number;
  reviewsCount: number;
  daysSinceLastReview: number;
  units: number;
  pricePerNight: number;
  occupancy30d: number;
  /** Mobile WhatsApp-eligible etc. — pass {@link getContactQuality} result as weight, not raw phone. */
  contactQuality: "high" | "medium" | "low";
  /** True when normalized WhatsApp / outbound channel exists */
  hasWhatsAppPath: boolean;
  /** True when phone field empty */
  phoneMissing: boolean;
  /** Optional deterministic enrichment outputs from existing structured fields. */
  enrichment?: EnrichmentV2Profile;
};

export type ExtractedSignals = {
  signals: BusinessSignal[];
  /** Short bullets for dashboard (“Why this lead?”) */
  whyThisLead: string[];
  /** Single consultative hook; complements (does not replace) LLM outreach later */
  heuristicOutreachAngle: string;
  /** 0–100: outreach + operational-gap potential from structured signals only */
  intelligenceScore: number;
};

const SIGNAL_WEIGHT: Partial<Record<BusinessSignal, number>> = {
  conversion_gap: 14,
  ota_dependency: 12,
  weak_digital_presence: 12,
  reputation_risk: 11,
  instagram_presence_gap: 9,
  missing_own_website: 9,
  single_channel_risk: 8,
  review_recency_stale: 7,
  no_listed_phone: 7,
  landline_or_unclear_phone: 6,
  premium_without_owned_funnel: 10,
  active_marketing_surface: 5,
  direct_contact_possible: 8,
  review_volume_operational_scale: 4,
  weak_booking_cta: 8,
  no_booking_flow: 10,
  external_only_booking_dependency: 11,
  weak_contact_visibility: 8,
  low_operational_activity: 6,
  social_acquisition_intent: 12,
  paid_traffic_candidate: 9,
};

function hasOta(channels: Channel[]): boolean {
  return channels.some((c) => c === "Booking" || c === "Airbnb" || c === "Tatilsepeti");
}

function hasDirect(channels: Channel[]): boolean {
  return channels.includes("Direct");
}

function uniq<T>(items: T[]): T[] {
  return [...new Set(items)];
}

/**
 * Pure feature extraction from fields already on the lead (no scraping, no LLM).
 */
export function extractBusinessSignals(input: LeadSignalInput): BusinessSignal[] {
  const out: BusinessSignal[] = [];

  if (!input.phoneMissing && input.contactQuality === "low") {
    out.push("landline_or_unclear_phone");
  }
  if (input.phoneMissing) {
    out.push("no_listed_phone");
  }

  if (!input.hasOwnWebsite) {
    out.push("missing_own_website");
  }

  /**
   * Avoid penalizing leads where IG is *probably* present but we couldn't auto-discover it.
   * `possible` ⇒ plausible handle candidates exist; defer to manual verification rather
   * than fire an "Instagram presence gap" against the lead.
   */
  const igDiscoveryStatus = input.enrichment?.acquisitionIntelligence?.instagramDiscoveryStatus;
  const igLikelyPresent = igDiscoveryStatus === "possible";
  if (!input.hasInstagram && !igLikelyPresent && input.units >= 6) {
    out.push("instagram_presence_gap");
  }
  if (!input.hasOwnWebsite && !input.hasInstagram && !igLikelyPresent) {
    out.push("weak_digital_presence");
  }
  if (input.hasInstagram || input.hasOwnWebsite) {
    out.push("active_marketing_surface");
  }

  if (input.channels.length <= 1) {
    out.push("single_channel_risk");
  }

  if (hasOta(input.channels) && !hasDirect(input.channels)) {
    out.push("ota_dependency");
  }

  if (
    (input.hasInstagram || hasOta(input.channels)) &&
    (!input.hasOwnWebsite || !hasDirect(input.channels))
  ) {
    out.push("conversion_gap");
  }

  if (input.rating > 0 && input.rating < 4.25 && input.reviewsCount >= 25) {
    out.push("reputation_risk");
  }

  if (input.daysSinceLastReview >= 10 && input.reviewsCount >= 15) {
    out.push("review_recency_stale");
  }

  if (input.reviewsCount >= 200) {
    out.push("review_volume_operational_scale");
  }

  if (input.hasWhatsAppPath && input.contactQuality === "high") {
    out.push("direct_contact_possible");
  }

  if (input.pricePerNight >= 8000 && !input.hasOwnWebsite) {
    out.push("premium_without_owned_funnel");
  }

  const e = input.enrichment;
  if (e) {
    if (e.hasWeakBookingCta) out.push("weak_booking_cta");
    if (e.hasNoBookingFlow) out.push("no_booking_flow");
    if (e.hasExternalOnlyBooking) out.push("external_only_booking_dependency");
    if (e.hasWeakContactVisibility) out.push("weak_contact_visibility");
    if (e.operationalActivity < 40) out.push("low_operational_activity");

    const acq = e.acquisitionIntelligence;
    if (
      acq.socialDemandIntent === "high" &&
      (acq.socialConversionGap === "medium" || acq.socialConversionGap === "high")
    ) {
      out.push("social_acquisition_intent");
    }
    if (acq.paidTrafficLikelihood >= 58) {
      out.push("paid_traffic_candidate");
    }
  }

  return uniq(out);
}

const SIGNAL_COPY: Record<BusinessSignal, string> = {
  weak_digital_presence: "Limited owned digital footprint (site + social)",
  active_marketing_surface: "Some marketing surface (site or Instagram)",
  conversion_gap: "Possible gap between attention and direct reservation flow",
  reputation_risk: "Rating/review mix suggests reputation attention may help",
  direct_contact_possible: "Direct outreach likely (e.g. WhatsApp-ready mobile)",
  ota_dependency: "Strong OTA-style distribution; direct booking may be underdeveloped",
  single_channel_risk: "Revenue concentrated on few channels",
  missing_own_website: "No clear owned website on listing",
  instagram_presence_gap: "Scale suggests Instagram could carry more of the funnel",
  review_recency_stale: "Reviews look less recent — guests may be quieter online",
  review_volume_operational_scale: "High review volume — operational leverage if optimized",
  landline_or_unclear_phone: "Phone looks like landline or unclear for instant chat",
  no_listed_phone: "No phone on listing — harder to reach quickly",
  premium_without_owned_funnel: "Premium ADR without a strong owned-site funnel",
  weak_booking_cta: "Booking call-to-action appears weak or unclear",
  no_booking_flow: "No clear direct booking flow detected",
  external_only_booking_dependency: "Booking path appears dependent on external OTA surfaces",
  weak_contact_visibility: "Contact visibility is weak (no clear fast contact path)",
  low_operational_activity: "Operational activity appears relatively low recently",
  social_acquisition_intent:
    "Social surfaces show demand signals while direct booking capture looks thin",
  paid_traffic_candidate:
    "Signals suggest paid / promoted traffic may already be part of the mix",
};

function whyBullets(signals: BusinessSignal[]): string[] {
  const priority: BusinessSignal[] = [
    "reputation_risk",
    "conversion_gap",
    "ota_dependency",
    "weak_digital_presence",
    "missing_own_website",
    "instagram_presence_gap",
    "single_channel_risk",
    "review_recency_stale",
    "direct_contact_possible",
    "review_volume_operational_scale",
    "premium_without_owned_funnel",
    "external_only_booking_dependency",
    "no_booking_flow",
    "weak_booking_cta",
    "weak_contact_visibility",
    "low_operational_activity",
    "social_acquisition_intent",
    "paid_traffic_candidate",
    "landline_or_unclear_phone",
    "no_listed_phone",
    "active_marketing_surface",
  ];
  const set = new Set(signals);
  const ordered = priority.filter((s) => set.has(s));
  return ordered.map((s) => SIGNAL_COPY[s]);
}

function pickOutreachAngle(signals: BusinessSignal[]): string {
  if (signals.includes("reputation_risk")) {
    return "Guest feedback patterns may be costing conversions before you see them in the P&L — worth a quick look at how inquiries are handled end-to-end.";
  }
  if (signals.includes("social_acquisition_intent")) {
    return "Guests may be discovering you on social and outbound surfaces faster than your booking capture path can absorb — tightening that path often unlocks immediate upside.";
  }
  if (signals.includes("conversion_gap")) {
    return "There may be a break between where guests discover you and where they actually book — especially for same-day or evening inquiries.";
  }
  if (signals.includes("ota_dependency")) {
    return "Heavy platform dependence often shows up as margin and control issues long before occupancy dips — direct flow is a common next lever.";
  }
  if (signals.includes("weak_digital_presence")) {
    return "With a thin owned presence, a lot of demand is probably mediated by platforms or DMs — tightening that path usually surfaces quick wins.";
  }
  if (signals.includes("direct_contact_possible")) {
    return "You already have a direct line to guests — small upgrades to how that channel is run often move the needle fast.";
  }
  return "Operational and digital signals on the listing suggest a few concrete optimization paths worth a short conversation.";
}

function scoreIntelligence(signals: BusinessSignal[]): number {
  let raw = 22;
  for (const s of signals) {
    raw += SIGNAL_WEIGHT[s] ?? 4;
  }
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function buildExtractedSignals(input: LeadSignalInput): ExtractedSignals {
  const signals = extractBusinessSignals(input);
  return {
    signals,
    whyThisLead: whyBullets(signals).slice(0, 8),
    heuristicOutreachAngle: pickOutreachAngle(signals),
    intelligenceScore: scoreIntelligence(signals),
  };
}
