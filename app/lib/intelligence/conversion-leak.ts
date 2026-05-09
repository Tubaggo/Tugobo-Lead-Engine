import type { AcquisitionIntelligenceProfile } from "./acquisition-intelligence";

/** Internal signal ids — stable for analytics; not guest-facing claims. */
export type ConversionLeakSignalId =
  | "social_to_booking_gap"
  | "response_delay_risk"
  | "ota_dependency_leak"
  | "website_conversion_gap"
  | "weak_booking_flow_leak"
  | "fragmented_contact_flow"
  | "unclear_reservation_path"
  | "direct_booking_weak_vs_ota";

export type ConversionLeakLevel = "low" | "medium" | "high" | "critical";

export type ConversionLeak = {
  conversionLeakScore: number;
  conversionLeakLevel: ConversionLeakLevel;
  conversionLeakSignals: string[];
  conversionLeakSummary: string[];
  likelyLeakSources: string[];
  /** When true, demand/acquisition proxies existed so leak scoring was not damped. */
  acquisitionTrafficProxy: boolean;
};

export type WebsiteIntelForConversionLeak = {
  hasBookingCtaText?: boolean;
  hasBookingEngine?: boolean;
  hasWhatsAppLink?: boolean;
  hasTelLink?: boolean;
};

type Channel = "Booking" | "Airbnb" | "Direct" | "Tatilsepeti";

const COMM_PAIN = new Set<string>(["response_delay", "unreachable", "communication", "reservation"]);

const SIGNAL_WEIGHT: Record<ConversionLeakSignalId, number> = {
  social_to_booking_gap: 22,
  response_delay_risk: 20,
  ota_dependency_leak: 18,
  website_conversion_gap: 17,
  weak_booking_flow_leak: 18,
  fragmented_contact_flow: 14,
  unclear_reservation_path: 12,
  direct_booking_weak_vs_ota: 14,
};

const LEAK_SOURCE_COPY: Record<ConversionLeakSignalId, string> = {
  social_to_booking_gap: "Instagram → booking disconnect",
  response_delay_risk: "WhatsApp response delays",
  ota_dependency_leak: "OTA dependency",
  website_conversion_gap: "Website conversion weakness",
  weak_booking_flow_leak: "Weak booking flow",
  fragmented_contact_flow: "Fragmented contact flow",
  unclear_reservation_path: "Unclear reservation path",
  direct_booking_weak_vs_ota: "Weak direct booking signals",
};

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

function hasOta(channels: readonly Channel[]): boolean {
  return channels.some((c) => c === "Booking" || c === "Airbnb" || c === "Tatilsepeti");
}

function hasDirect(channels: readonly Channel[]): boolean {
  return channels.includes("Direct");
}

export type ConversionLeakInput = {
  channels: readonly Channel[];
  hasOwnWebsite: boolean;
  hasInstagram: boolean;
  hasWhatsAppPath: boolean;
  bookingFlowStrength: number;
  otaDependencyLikelihood: number;
  socialDemandStrength: number;
  operationalActivity: number;
  digitalMaturity: number;
  reviewsCount: number;
  daysSinceLastReview: number;
  communicationRisk?: number;
  websiteIntelligence?: WebsiteIntelForConversionLeak;
  businessSignals: ReadonlySet<string>;
  reviewPainPoints?: ReadonlyArray<{ category: string }>;
  acquisitionIntelligence?: AcquisitionIntelligenceProfile;
};

/**
 * True when listing/enrichment suggests real demand or acquisition effort exists.
 * Leak scoring is damped when this is false to avoid overclaiming.
 */
export function hasAcquisitionTrafficProxy(input: ConversionLeakInput): boolean {
  const acq = input.acquisitionIntelligence?.acquisition;
  if (acq?.isAcquisitionActive) return true;
  if (typeof acq?.acquisitionIntentScore === "number" && acq.acquisitionIntentScore >= 52) {
    return true;
  }
  if ((input.operationalActivity ?? 0) >= 40) return true;
  if (input.hasInstagram && (input.socialDemandStrength ?? 0) >= 44) return true;
  const reviews = input.reviewsCount ?? 0;
  const recency = input.daysSinceLastReview ?? 999;
  if (reviews >= 35 && recency <= 21) return true;
  return false;
}

function hasCommunicationComplaints(input: ConversionLeakInput): boolean {
  for (const p of input.reviewPainPoints ?? []) {
    if (COMM_PAIN.has(p.category)) return true;
  }
  if (input.businessSignals.has("reputation_risk")) return true;
  if ((input.communicationRisk ?? 0) >= 48) return true;
  return false;
}

export function detectConversionLeakSignals(input: ConversionLeakInput): ConversionLeakSignalId[] {
  const out: ConversionLeakSignalId[] = [];
  const sig = input.businessSignals;
  const channels = input.channels;
  const booking = input.bookingFlowStrength;
  const otaL = input.otaDependencyLikelihood;
  const acq = input.acquisitionIntelligence;
  const socialGap = acq?.socialConversionGap ?? "low";
  const wi = input.websiteIntelligence;

  const igSurface = input.hasInstagram || (acq?.instagramHandleDetected ?? false);

  if (
    igSurface &&
    booking < 55 &&
    (!hasDirect(channels) || socialGap === "high" || socialGap === "medium")
  ) {
    out.push("social_to_booking_gap");
  }

  if (input.hasWhatsAppPath && hasCommunicationComplaints(input)) {
    out.push("response_delay_risk");
  }

  if (otaL >= 60 && (!hasDirect(channels) || booking < 58)) {
    out.push("ota_dependency_leak");
  }

  if (
    input.hasOwnWebsite &&
    (wi?.hasBookingCtaText === false ||
      wi?.hasBookingEngine === false ||
      sig.has("weak_booking_cta"))
  ) {
    out.push("website_conversion_gap");
  }

  if (booking < 48 || sig.has("no_booking_flow") || sig.has("weak_booking_cta")) {
    out.push("weak_booking_flow_leak");
  }

  if (
    sig.has("weak_contact_visibility") ||
    sig.has("no_listed_phone") ||
    (sig.has("landline_or_unclear_phone") && igSurface)
  ) {
    out.push("fragmented_contact_flow");
  }

  if (!input.hasOwnWebsite && hasOta(channels) && !hasDirect(channels)) {
    out.push("unclear_reservation_path");
  }

  if (hasOta(channels) && !hasDirect(channels) && otaL >= 55 && !out.includes("ota_dependency_leak")) {
    out.push("direct_booking_weak_vs_ota");
  }

  return [...new Set(out)];
}

export function getLikelyLeakSources(signals: readonly string[]): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const s of signals) {
    if (!(s in LEAK_SOURCE_COPY)) continue;
    const label = LEAK_SOURCE_COPY[s as ConversionLeakSignalId];
    if (seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

export function getConversionLeakLevel(score: number): ConversionLeakLevel {
  const s = clamp(score);
  if (s >= 75) return "critical";
  if (s >= 53) return "high";
  if (s >= 28) return "medium";
  return "low";
}

function summarizeSignals(signals: ConversionLeakSignalId[]): string[] {
  const lines: string[] = [
    "Heuristic only — inferred from public listing and enrichment signals, not measured funnel analytics.",
  ];
  const top = signals.slice(0, 4);
  for (const id of top) {
    switch (id) {
      case "social_to_booking_gap":
        lines.push("Social surface present; direct booking capture looks thin versus demand proxies.");
        break;
      case "response_delay_risk":
        lines.push("Guest-facing comms friction signals overlap with a WhatsApp contact path.");
        break;
      case "ota_dependency_leak":
        lines.push("Distribution leans OTA while owned/direct booking looks weaker.");
        break;
      case "website_conversion_gap":
        lines.push("Owned site present but booking CTAs/engine signals look weak.");
        break;
      case "weak_booking_flow_leak":
        lines.push("Overall booking-flow strength from enrichment looks below typical capture.");
        break;
      case "fragmented_contact_flow":
        lines.push("Contact paths look fragmented or harder for guests to use.");
        break;
      case "unclear_reservation_path":
        lines.push("Reservation path may be unclear without a strong owned/direct route.");
        break;
      case "direct_booking_weak_vs_ota":
        lines.push("Direct booking signals look weak relative to OTA-led distribution.");
        break;
      default:
        break;
    }
  }
  return lines.slice(0, 5);
}

export function calculateConversionLeak(input: ConversionLeakInput): ConversionLeak {
  const trafficProxy = hasAcquisitionTrafficProxy(input);
  const signals = detectConversionLeakSignals(input);
  let raw = 0;
  for (const id of signals) {
    raw += SIGNAL_WEIGHT[id] ?? 0;
  }
  raw = clamp(raw, 0, 100);

  if (!trafficProxy) {
    raw = Math.round(raw * 0.38);
  }

  const level = getConversionLeakLevel(raw);
  const likely = getLikelyLeakSources(signals);
  const summary = signals.length === 0 ? [summarizeSignals([])[0]] : summarizeSignals(signals);

  return {
    conversionLeakScore: Math.round(raw),
    conversionLeakLevel: level,
    conversionLeakSignals: signals,
    conversionLeakSummary: summary,
    likelyLeakSources: likely,
    acquisitionTrafficProxy: trafficProxy,
  };
}

/**
 * Bounded opportunity score delta (v3). Stronger when acquisition is active and leak is high.
 */
export function conversionLeakOpportunityDelta(
  leak: ConversionLeak,
  acquisition?: AcquisitionIntelligenceProfile,
): number {
  if (leak.conversionLeakSignals.length === 0) return 0;
  const leakN = leak.conversionLeakScore / 100;
  const acq = acquisition?.acquisition;
  const active = Boolean(acq?.isAcquisitionActive);
  const intentN = clamp((acq?.acquisitionIntentScore ?? 40) / 100, 0, 1);

  let delta = 0;
  if (active) {
    delta = Math.round(clamp(11 * leakN * (0.55 + 0.45 * intentN), 0, 10));
  } else {
    delta = Math.round(clamp(5 * leakN, 0, 4));
  }

  if (active && leak.conversionLeakLevel === "critical") delta = Math.min(10, delta + 1);
  return delta;
}

/** Subtle dashboard chips — labels are cautious by design. */
export function conversionLeakUiChipHints(leak: ConversionLeak | undefined): {
  key: string;
  label: string;
  title: string;
}[] {
  if (!leak || !leak.acquisitionTrafficProxy || leak.conversionLeakScore < 26) {
    return [];
  }
  if (leak.conversionLeakSignals.length === 0) {
    return [];
  }
  const hints: { key: string; label: string; title: string }[] = [];
  const title = "Heuristic signal — not on-site analytics.";
  const set = new Set(leak.conversionLeakSignals);

  if (set.has("social_to_booking_gap")) {
    hints.push({ key: "clk-gap", label: "Traffic → Booking Gap", title });
  }
  if (set.has("response_delay_risk")) {
    hints.push({ key: "clk-resp", label: "Response Delay Risk", title });
  }
  if (set.has("weak_booking_flow_leak") || set.has("website_conversion_gap")) {
    hints.push({ key: "clk-book", label: "Weak Booking Flow", title });
  }
  if (set.has("ota_dependency_leak") || set.has("direct_booking_weak_vs_ota")) {
    hints.push({ key: "clk-ota", label: "OTA Dependency Risk", title });
  }

  return hints.slice(0, 3);
}
