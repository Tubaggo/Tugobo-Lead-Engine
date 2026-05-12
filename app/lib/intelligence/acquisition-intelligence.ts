import {
  determineInstagramDiscovery,
  type InstagramDiscoveryStatus,
} from "./instagram-discovery";
import {
  confidenceFromScore,
  maturityFromScore,
  type MaturityLevel,
  type SignalConfidence,
} from "./confidence";
import {
  detectWhatsAppConfidence,
  type WhatsAppConfidence,
} from "./whatsapp-verification";

export type AcquisitionIntentLevel = "low" | "medium" | "high" | "very_high";

export type AcquisitionChannel =
  | "instagram"
  | "meta_ads_possible"
  | "google_ads_possible"
  | "ota"
  | "website"
  | "whatsapp"
  | "influencer_possible"
  | "content_marketing"
  | "campaign_language";

export type AcquisitionIntelligence = {
  acquisitionIntentScore: number;
  acquisitionIntentLevel: AcquisitionIntentLevel;
  acquisitionChannels: AcquisitionChannel[];
  acquisitionSignals: string[];
  acquisitionWeaknesses: string[];
  isAcquisitionActive: boolean;
};

/** Narrow mirror of {@link import("../leads").WebsiteIntelligenceSummary} — avoid importing `leads` (cycle). */
export type WebsiteIntelForAcquisition = {
  hasWhatsAppLink?: boolean;
  hasTelLink?: boolean;
  hasBookingCtaText?: boolean;
  hasBookingEngine?: boolean;
  hasContactPage?: boolean;
  hasInquiryForm?: boolean;
  mobileViewportPresent?: boolean;
  confidence?: number;
  errors?: string[];
  socialLinksQuality?: number;
  /** Homepage enrichment booking-path quality (0–100), when available. */
  bookingFlowQuality?: number;
  hasSocialIcons?: boolean;
  websiteCandidateMatch?: "strong" | "uncertain";
  hasInvalidWhatsAppLinks?: boolean;
  whatsappSurfaceMeta?: import("./whatsapp-verification").WhatsAppSurfaceMeta;
};

type Channel = "Booking" | "Airbnb" | "Direct" | "Tatilsepeti";
type ContactQuality = "high" | "medium" | "low";

export type InstagramActivityLevel = "inactive" | "low" | "medium" | "high";
export type SocialDemandIntent = "low" | "medium" | "high";
export type SocialConversionGap = "low" | "medium" | "high";
export type InstagramStatus = "valid" | "invalid" | "unknown";

export type InstagramValidationResult = {
  status: InstagramStatus;
  confidence: number;
  reasons: string[];
  normalizedHandle: string;
};

export type BusinessTierLike =
  | "micro"
  | "small"
  | "medium"
  | "premium"
  | "enterprise";

export type AcquisitionIntelligenceProfile = {
  hasInstagram: boolean;
  instagramHandleDetected: boolean;
  instagramLinkQuality: number;
  instagramBioSignals: string[];
  instagramBookingSignals: string[];
  instagramActivityEstimate: number;
  instagramActivityLevel: InstagramActivityLevel;
  /** Lightweight, rule-based reachability check on the IG link/handle. */
  instagramStatus: InstagramStatus;
  /** Confidence label for IG discovery/surface quality. */
  instagramConfidence: SignalConfidence | number;
  /** Confidence layers for acquisition surfaces and maturity. */
  websiteConfidence: SignalConfidence;
  whatsappConfidence: WhatsAppConfidence;
  /** TR lines from {@link detectWhatsAppConfidence} for UI / persistence. */
  whatsappSignals: readonly string[];
  otaConfidence: SignalConfidence;
  adsLikelihood: SignalConfidence;
  directBookingMaturity: MaturityLevel;
  conversionMaturity: MaturityLevel;
  acquisitionMaturity: MaturityLevel;
  /** Reasons for an invalid/unknown validation status (debug + UI tooltip). */
  instagramInvalidReasons: string[];
  /** Discovery layer — `verified`/`broken`/`possible`/`unknown`. Use this for UI; `not_found` is reserved for explicit overrides. */
  instagramDiscoveryStatus: InstagramDiscoveryStatus;
  /** Plausible IG handle candidates derived from the business name (no scraping). */
  suggestedInstagramHandles: string[];
  /** True when the IG link is broken or could not be auto-detected but is plausible — surface a "Manual IG check" hint. */
  instagramNeedsManualCheck: boolean;
  socialDemandIntent: SocialDemandIntent;
  socialConversionGap: SocialConversionGap;
  metaAdsDetected: boolean;
  acquisitionPressureScore: number;
  paidTrafficLikelihood: number;
  adDrivenLeadPotential: number;
  /** Normalized acquisition intent, channels, and explainable signals. */
  acquisition: AcquisitionIntelligence;
};

export type AcquisitionIntelligenceInput = {
  hasInstagram: boolean;
  instagramHandle?: string;
  /** Concatenated lowercase text (e.g. listing fields, future cached bio/homepage copy). */
  socialSignalText?: string;
  website?: string;
  channels: readonly Channel[];
  hasWhatsAppPath: boolean;
  contactQuality: ContactQuality;
  bookingFlowStrength: number;
  socialDemandStrength: number;
  digitalMaturity: number;
  otaDependencyLikelihood: number;
  daysSinceLastReview: number;
  reviewsCount: number;
  hasOwnWebsite: boolean;
  businessTier?: BusinessTierLike;
  websiteIntelligence?: WebsiteIntelForAcquisition;
  /** Listing fields used to generate plausible handle suggestions when IG is missing. */
  businessName?: string;
  city?: string;
  type?: string;
  /** Primary listing phone for WhatsApp normalization (optional for tests). */
  listingPhone?: string;
};

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Acquisition sophistication (how well the business surfaces and captures demand).
 * Separate from lead fit / opportunity scoring — composite of observable channels only.
 */
export function calculateAcquisitionMaturity(input: {
  digitalMaturity: number;
  bookingFlowStrength: number;
  socialDemandStrength: number;
  otaDependencyLikelihood: number;
  reviewsCount: number;
  daysSinceLastReview: number;
  contactQuality: ContactQuality;
  hasWhatsAppPath: boolean;
  hasInstagram: boolean;
  instagramLinkQuality: number;
  channels: readonly Channel[];
  hasOwnWebsite: boolean;
  website?: string;
  websiteIntelligence?: WebsiteIntelForAcquisition;
}): MaturityLevel {
  const wi = input.websiteIntelligence;
  const hasSite =
    input.hasOwnWebsite ||
    Boolean(input.website?.trim()) ||
    wi?.websiteCandidateMatch === "strong" ||
    wi?.websiteCandidateMatch === "uncertain";
  let websiteQuality = clamp(
    input.digitalMaturity * 0.55 +
      (typeof wi?.confidence === "number" ? wi.confidence * 0.35 : hasSite ? 48 : 22) +
      (wi?.mobileViewportPresent === true ? 6 : 0) +
      (typeof wi?.socialLinksQuality === "number" ? wi.socialLinksQuality * 0.08 : 0) +
      (wi?.hasSocialIcons === true ? 8 : 0),
  );
  if (typeof wi?.bookingFlowQuality === "number" && Number.isFinite(wi.bookingFlowQuality)) {
    websiteQuality = Math.round(websiteQuality * 0.55 + clamp(wi.bookingFlowQuality) * 0.45);
  }

  const otaChannelCount = input.channels.filter(
    (c) => c === "Booking" || c === "Airbnb" || c === "Tatilsepeti",
  ).length;
  const otaPresence = clamp(
    input.otaDependencyLikelihood * 0.72 + Math.min(28, otaChannelCount * 9),
  );

  let socialSignals = clamp(
    input.socialDemandStrength * 0.55 +
      input.instagramLinkQuality * 0.35 +
      (input.hasInstagram ? 10 : 0),
  );
  if (typeof wi?.socialLinksQuality === "number") {
    socialSignals = Math.round(socialSignals * 0.85 + clamp(wi.socialLinksQuality) * 0.15);
  }

  const reviews = Number.isFinite(input.reviewsCount) ? Math.max(0, input.reviewsCount) : 0;
  let reviewVolume = clamp(22 + Math.min(78, Math.log10(reviews + 1) * 38));
  if (input.daysSinceLastReview <= 7) reviewVolume = clamp(reviewVolume + 8);
  else if (input.daysSinceLastReview <= 21) reviewVolume = clamp(reviewVolume + 4);

  let contactAccessibility =
    input.contactQuality === "high" ? 88 : input.contactQuality === "medium" ? 62 : 34;
  if (input.hasWhatsAppPath) contactAccessibility = clamp(contactAccessibility + 18);
  if (wi?.hasWhatsAppLink === true) contactAccessibility = clamp(contactAccessibility + 10);
  if (wi?.hasTelLink === true) contactAccessibility = clamp(contactAccessibility + 6);
  if (wi?.hasContactPage === true || wi?.hasInquiryForm === true) {
    contactAccessibility = clamp(contactAccessibility + 8);
  }

  const conversionFlow = clamp(input.bookingFlowStrength);

  const composite = Math.round(
    websiteQuality * 0.22 +
      otaPresence * 0.15 +
      socialSignals * 0.2 +
      reviewVolume * 0.13 +
      contactAccessibility * 0.15 +
      conversionFlow * 0.15,
  );

  return maturityFromScore(composite);
}

function normalizeScanText(
  socialSignalText: string | undefined,
  instagramHandle: string | undefined,
): string {
  const raw = `${socialSignalText ?? ""}\n${instagramHandle ?? ""}`.toLowerCase();
  return raw.trim();
}

function detectInstagramHandle(instagramRaw?: string): { detected: boolean; normalized: string } {
  const raw = instagramRaw?.trim() ?? "";
  if (!raw) return { detected: false, normalized: "" };
  try {
    if (/instagram\.com/i.test(raw)) {
      const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      const seg = u.pathname.split("/").filter(Boolean)[0] ?? "";
      return { detected: seg.length >= 2, normalized: seg.replace(/^@/, "") };
    }
  } catch {
    /* fall through */
  }
  const cleaned = raw.replace(/^@/, "").split(/[/?#]/)[0] ?? "";
  return { detected: cleaned.length >= 2, normalized: cleaned };
}

/** Reserved Instagram path segments that are *not* user handles. */
const IG_RESERVED_PATHS = new Set<string>([
  "accounts",
  "explore",
  "direct",
  "reels",
  "stories",
  "p",
  "web",
  "tv",
  "blog",
  "about",
  "press",
  "api",
  "privacy",
  "developer",
  "session",
  "login",
  "signup",
  "favicon.ico",
  "robots.txt",
]);

/**
 * Instagram username rules (deterministic check, no API call):
 *  - 1–30 characters
 *  - letters, digits, '.', '_'
 *  - cannot start or end with '.'
 *  - no consecutive '.'
 */
const IG_HANDLE_RE = /^(?!\.)(?!.*\.\.)[A-Za-z0-9._]{1,30}(?<!\.)$/;

/** Phrases observed when an IG profile is removed/unavailable (no scraping; matched on listing copy / cached scan text). */
const IG_INVALID_PHRASES: readonly RegExp[] = [
  /\bsorry,?\s*this\s*page\s*(?:isn['’]t|is\s*not)\s*available\b/i,
  /\bpage\s*(?:isn['’]t|is\s*not)\s*available\b/i,
  /\buser\s*not\s*found\b/i,
  /\bprofile\s*unavailable\b/i,
  /\bthis\s*account\s*doesn['’]t\s*exist\b/i,
  /\baccount\s*(?:has\s*been\s*)?deactivated\b/i,
  /\bsayfa\s*(?:mevcut\s*değil|kullanılamıyor)\b/i,
  /\bhesap\s*kullanılamıyor\b/i,
];

/**
 * Lightweight, deterministic Instagram link/handle validation.
 * Never throws; never fetches; safe on partial input.
 */
export function validateInstagram(
  handleOrUrl: string | undefined,
  scanText: string = "",
): InstagramValidationResult {
  const reasons: string[] = [];
  const raw = handleOrUrl?.trim() ?? "";
  if (!raw) {
    return { status: "unknown", confidence: 0, reasons, normalizedHandle: "" };
  }

  let normalizedHandle = "";
  let isUrl = false;
  if (/instagram\.com/i.test(raw)) {
    isUrl = true;
    try {
      const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      const segs = u.pathname.split("/").filter(Boolean);
      const seg = segs[0] ?? "";
      const lowerSeg = seg.toLowerCase();
      if (!seg) {
        reasons.push("empty_path");
      } else if (IG_RESERVED_PATHS.has(lowerSeg)) {
        reasons.push("reserved_path");
      }
      if (segs.length > 0 && segs[0].toLowerCase() === "accounts") {
        reasons.push("login_redirect");
      }
      normalizedHandle = seg.replace(/^@/, "");
    } catch {
      reasons.push("malformed_url");
    }
  } else {
    normalizedHandle = raw.replace(/^@/, "").split(/[/?#]/)[0] ?? "";
  }

  if (normalizedHandle && !IG_HANDLE_RE.test(normalizedHandle)) {
    reasons.push("invalid_handle_pattern");
  }
  if (normalizedHandle && normalizedHandle.length < 2) {
    reasons.push("handle_too_short");
  }

  const phraseHit = IG_INVALID_PHRASES.some((re) => re.test(scanText));
  if (phraseHit) reasons.push("unavailable_phrase");

  const hardInvalid =
    reasons.includes("reserved_path") ||
    reasons.includes("invalid_handle_pattern") ||
    reasons.includes("malformed_url") ||
    reasons.includes("login_redirect") ||
    reasons.includes("unavailable_phrase") ||
    reasons.includes("handle_too_short");

  if (hardInvalid) {
    return { status: "invalid", confidence: 12, reasons, normalizedHandle };
  }
  if (!normalizedHandle) {
    return { status: "unknown", confidence: 25, reasons, normalizedHandle };
  }

  let confidence = 55;
  if (isUrl) confidence += 15;
  if (normalizedHandle.length >= 4) confidence += 10;
  return {
    status: "valid",
    confidence: Math.round(clamp(confidence)),
    reasons,
    normalizedHandle,
  };
}

export function collectInstagramBioSignals(scanText: string): string[] {
  const hits: string[] = [];
  if (/\bdm\b/i.test(scanText)) hits.push("dm");
  if (/whatsapp|wa\.me/i.test(scanText)) hits.push("whatsapp");
  if (/rezervasyon/i.test(scanText)) hits.push("rezervasyon");
  if (/\bbook(?:\s*now)?\b/i.test(scanText)) hits.push("book");
  return [...new Set(hits)];
}

export function collectInstagramBookingSignals(scanText: string): string[] {
  const hits: string[] = [];
  if (/rezervasyon|hemen\s*rezervasyon/i.test(scanText)) hits.push("rezervasyon");
  if (/\bbook(?:\s*now)?\b|check\s*availability|müsait/i.test(scanText)) {
    hits.push("booking_language");
  }
  return [...new Set(hits)];
}

function scoreInstagramLinkQuality(input: AcquisitionIntelligenceInput, handleDetected: boolean): number {
  let q = 0;
  if (input.hasInstagram) q += 22;
  if (handleDetected) q += 28;
  const site = input.website ?? "";
  if (/instagram\.com/i.test(site)) q += 18;
  const sq = input.websiteIntelligence?.socialLinksQuality;
  if (typeof sq === "number" && sq >= 55) q += 22;
  else if (input.hasOwnWebsite && input.hasInstagram) q += 10;
  return Math.round(clamp(q));
}

/** Rule-based Instagram funnel / CTA activity estimate (0–100). */
export function calculateInstagramActivity(
  input: Pick<
    AcquisitionIntelligenceInput,
    | "hasInstagram"
    | "daysSinceLastReview"
    | "reviewsCount"
    | "socialDemandStrength"
  > & {
    bioSignalCount: number;
    bookingSignalCount: number;
  },
): number {
  if (!input.hasInstagram) return 0;
  let s = 18;
  s += Math.min(28, input.bioSignalCount * 12);
  s += Math.min(18, input.bookingSignalCount * 8);
  const recency = Number.isFinite(input.daysSinceLastReview) ? input.daysSinceLastReview : 999;
  if (recency <= 3) s += 20;
  else if (recency <= 10) s += 12;
  else if (recency <= 21) s += 6;
  s += Math.min(14, input.reviewsCount * 0.05);
  s += input.socialDemandStrength * 0.16;
  return Math.round(clamp(s));
}

export function detectSocialConversionGap(input: {
  hasInstagram: boolean;
  bookingFlowStrength: number;
  socialDemandIntent: SocialDemandIntent;
  bioSignalCount: number;
}): SocialConversionGap {
  if (!input.hasInstagram) return "low";
  const weakFlow = input.bookingFlowStrength < 52;
  if (!weakFlow) return "low";
  if (
    input.socialDemandIntent === "high" ||
    (input.bioSignalCount >= 2 && input.bookingFlowStrength < 38)
  ) {
    return "high";
  }
  if (input.socialDemandIntent === "medium" || input.bookingFlowStrength < 44) {
    return "medium";
  }
  return "low";
}

function triSocialDemandIntent(
  bioSignals: string[],
  input: AcquisitionIntelligenceInput,
): SocialDemandIntent {
  let d = bioSignals.length * 18;
  if (input.hasWhatsAppPath) d += 16;
  if (input.hasInstagram) d += 12;
  if (input.socialDemandStrength >= 62) d += 14;
  else if (input.socialDemandStrength >= 48) d += 8;
  if (input.contactQuality !== "low") d += 6;
  if (d >= 62) return "high";
  if (d >= 38) return "medium";
  return "low";
}

function triInstagramActivityLevel(
  activityEstimate: number,
  hasInstagram: boolean,
): InstagramActivityLevel {
  if (!hasInstagram) return "inactive";
  if (activityEstimate >= 72) return "high";
  if (activityEstimate >= 48) return "medium";
  return "low";
}

function paidParamsInUrl(url?: string): boolean {
  if (!url?.trim()) return false;
  return /(utm_(source|medium|campaign)=|fbclid|gclid|fb_action_types|fb_action_ids)/i.test(url);
}

function campaignLanguage(scanText: string): boolean {
  return /(kampanya|reklam|sponsor|özel\s*fiyat|indirim|%\s*off|special\s*offer|early\s*bird)/i.test(
    scanText,
  );
}

function paidMetaHints(url?: string): boolean {
  if (!url?.trim()) return false;
  return /(fbclid|utm_source=facebook|utm_source=fb|utm_medium=[^&]*(cpc|social|paid))/i.test(url);
}

function paidGoogleHints(url?: string): boolean {
  if (!url?.trim()) return false;
  return /(gclid|utm_source=google|utm_medium=[^&]*cpc)/i.test(url);
}

function influencerLanguage(scanText: string): boolean {
  return /(influencer|işbirliği|isbirligi|collab(?:oration)?|brand\s*partner|ugc|sponsorlu|sponsored|paid\s*partnership|pr\s*gift)/i.test(
    scanText,
  );
}

function contentMarketingSurface(
  scanText: string,
  bioSignalCount: number,
  bookingSignalCount: number,
): boolean {
  if (/(blog|e-?bülten|ebulten|newsletter|podcast|youtube\.com\/|tiktok\.com\/)/i.test(scanText)) {
    return true;
  }
  return bioSignalCount >= 2 && bookingSignalCount >= 1;
}

/** Profile fields used before the nested {@link AcquisitionIntelligence} is attached. */
export type AcquisitionIntelligenceProfileBase = Omit<AcquisitionIntelligenceProfile, "acquisition">;

export function getAcquisitionIntentLevel(score: number): AcquisitionIntentLevel {
  const s = clamp(score);
  if (s >= 78) return "very_high";
  if (s >= 62) return "high";
  if (s >= 44) return "medium";
  return "low";
}

/** Inputs for outreach prioritization — keeps deltas bounded so generic scores still matter. */
export type AcquisitionPriorityFactors = {
  profile: AcquisitionIntelligenceProfile;
  /** 0–100 operational proxy; use 0 when unknown. */
  operationalActivity: number;
  bookingFlowStrength?: number;
  otaDependencyLikelihood?: number;
  hasWhatsAppPath: boolean;
  /** Stable signal IDs from {@link import("./signals").BusinessSignal}. */
  businessSignals: ReadonlySet<string>;
};

const ACQ_PRIORITY_POS_CAP = 22;
const ACQ_PRIORITY_NEG_CAP = 14;

/**
 * Bounded adjustment for outreach priority (not leadScore).
 * Positive when acquisition is active and well-signaled; negative when thin or operationally cold.
 */
export function calculateAcquisitionPriorityBoost(f: AcquisitionPriorityFactors): number {
  const p = f.profile;
  const a = p.acquisition;
  let delta = 0;

  switch (a.acquisitionIntentLevel) {
    case "very_high":
      delta += 7;
      break;
    case "high":
      delta += 5;
      break;
    case "medium":
      delta += 1;
      break;
    default:
      delta -= 4;
      break;
  }

  const ch = a.acquisitionChannels.length;
  if (ch >= 4) delta += 5;
  else if (ch === 3) delta += 4;
  else if (ch === 2) delta += 2;

  if (p.socialDemandIntent === "high") delta += 3;
  else if (p.socialDemandIntent === "medium") delta += 1;

  const ota = typeof f.otaDependencyLikelihood === "number" ? f.otaDependencyLikelihood : 0;
  if (ota >= 72) delta += 3;
  else if (ota >= 58) delta += 2;

  if (
    f.hasWhatsAppPath &&
    (a.acquisitionIntentLevel === "high" ||
      a.acquisitionIntentLevel === "very_high" ||
      a.isAcquisitionActive)
  ) {
    delta += 2;
  }

  if (p.paidTrafficLikelihood >= 64) delta += 3;
  else if (p.paidTrafficLikelihood >= 56) delta += 1;

  const convGapSignal = f.businessSignals.has("conversion_gap");
  const convWeak =
    p.socialConversionGap !== "low" ||
    a.acquisitionWeaknesses.some((w) =>
      /booking|conversion|capture|funnel/i.test(w),
    );
  if (a.acquisitionIntentScore > 70 && convWeak) delta += 8;
  else if (
    (a.acquisitionIntentLevel === "high" || a.acquisitionIntentLevel === "very_high") &&
    convGapSignal
  ) {
    delta += 4;
  }

  if (
    p.instagramActivityLevel === "inactive" &&
    a.acquisitionIntentLevel !== "high" &&
    a.acquisitionIntentLevel !== "very_high"
  ) {
    delta -= 3;
  }

  const booking =
    typeof f.bookingFlowStrength === "number" && Number.isFinite(f.bookingFlowStrength)
      ? f.bookingFlowStrength
      : null;
  if (booking !== null && booking < 40 && a.isAcquisitionActive) delta += 3;

  if (f.operationalActivity > 0 && f.operationalActivity < 32) delta -= 5;
  if (f.businessSignals.has("low_operational_activity")) delta -= 4;

  if (
    a.acquisitionIntentLevel === "low" &&
    !a.isAcquisitionActive &&
    ch <= 1 &&
    a.acquisitionSignals.length < 2
  ) {
    delta -= 6;
  }

  return Math.round(clamp(delta, -ACQ_PRIORITY_NEG_CAP, ACQ_PRIORITY_POS_CAP));
}

/** Short rationale lines aligned with {@link calculateAcquisitionPriorityBoost} (debug / future telemetry). */
export function getAcquisitionPriorityReason(f: AcquisitionPriorityFactors): string[] {
  const p = f.profile;
  const a = p.acquisition;
  const reasons: string[] = [];

  if (a.acquisitionIntentLevel === "very_high" || a.acquisitionIntentLevel === "high") {
    reasons.push("Elevated acquisition intent");
  } else if (a.acquisitionIntentLevel === "low") {
    reasons.push("Low acquisition intent");
  }

  if (a.acquisitionChannels.length >= 3) {
    reasons.push("Multiple acquisition surfaces");
  } else if (a.acquisitionChannels.length <= 1 && !a.isAcquisitionActive) {
    reasons.push("Thin acquisition channel mix");
  }

  if (p.socialDemandIntent === "high") reasons.push("High social demand");
  if (typeof f.otaDependencyLikelihood === "number" && f.otaDependencyLikelihood >= 58) {
    reasons.push("Strong OTA-leaning distribution");
  }
  if (f.hasWhatsAppPath && a.isAcquisitionActive) reasons.push("WhatsApp path + active acquisition");
  if (p.paidTrafficLikelihood >= 58) reasons.push("Paid-traffic likelihood");

  const convWeak =
    f.businessSignals.has("conversion_gap") ||
    p.socialConversionGap !== "low" ||
    a.acquisitionWeaknesses.some((w) => /booking|conversion|capture/i.test(w));
  if (a.acquisitionIntentScore > 70 && convWeak) {
    reasons.push("High intent with conversion/booking gap");
  }

  if (f.operationalActivity > 0 && f.operationalActivity < 35) {
    reasons.push("Weak operational activity proxy");
  }

  return reasons.slice(0, 6);
}

/**
 * Small nudge on consultative opportunity score (0–100), incremental vs. existing signal weights.
 */
export function calculateAcquisitionOpportunityAdjustment(
  profile: AcquisitionIntelligenceProfile,
  businessSignals: ReadonlySet<string>,
): number {
  const a = profile.acquisition;
  let adj = 0;

  const convWeak =
    businessSignals.has("conversion_gap") ||
    profile.socialConversionGap !== "low" ||
    a.acquisitionWeaknesses.some((w) => /booking|conversion|capture|funnel/i.test(w));

  if (a.acquisitionIntentScore > 70 && convWeak) adj += 6;
  else if (
    (a.acquisitionIntentLevel === "high" || a.acquisitionIntentLevel === "very_high") &&
    a.isAcquisitionActive
  ) {
    adj += 3;
  }

  if (a.acquisitionChannels.length >= 3 && a.isAcquisitionActive) adj += 2;

  if (a.acquisitionIntentLevel === "low" && !a.isAcquisitionActive && a.acquisitionChannels.length <= 1) {
    adj -= 4;
  }

  return Math.round(clamp(adj, -5, 8));
}

/** Applies a light acquisition layer on top of signal-derived intelligence score. */
export function applyAcquisitionToIntelligenceScore(
  base: number,
  profile: AcquisitionIntelligenceProfile | undefined,
  operationalActivity: number,
): number {
  if (!profile) return Math.round(clamp(base));
  const a = profile.acquisition;
  let delta = 0;

  if (a.acquisitionIntentLevel === "very_high") delta += 4;
  else if (a.acquisitionIntentLevel === "high") delta += 3;
  else if (a.acquisitionIntentLevel === "low" && !a.isAcquisitionActive) delta -= 3;

  if (a.isAcquisitionActive && a.acquisitionChannels.length >= 2) delta += 2;

  if (operationalActivity > 0 && operationalActivity < 35) delta -= 2;
  if (a.acquisitionIntentLevel === "low" && a.acquisitionChannels.length <= 1 && !a.isAcquisitionActive) {
    delta -= 2;
  }

  return Math.round(clamp(base + delta));
}

export function detectAcquisitionChannels(
  input: AcquisitionIntelligenceInput,
  profile: AcquisitionIntelligenceProfileBase,
): AcquisitionChannel[] {
  const scanText = normalizeScanText(input.socialSignalText, input.instagramHandle);
  const out: AcquisitionChannel[] = [];
  const add = (c: AcquisitionChannel) => {
    if (!out.includes(c)) out.push(c);
  };

  const igPresent = profile.hasInstagram && profile.instagramStatus !== "invalid";
  if (igPresent) add("instagram");

  if (
    input.hasWhatsAppPath ||
    input.websiteIntelligence?.hasWhatsAppLink ||
    profile.whatsappConfidence !== "none"
  ) {
    add("whatsapp");
  }

  if (input.hasOwnWebsite || Boolean(input.website?.trim())) add("website");

  const listedOta = input.channels.some((c) => c === "Booking" || c === "Airbnb" || c === "Tatilsepeti");
  if (listedOta || input.otaDependencyLikelihood >= 52) add("ota");

  if (campaignLanguage(scanText)) add("campaign_language");

  const url = input.website ?? "";
  const paidParams = paidParamsInUrl(url);
  if (paidMetaHints(url) || (paidParams && /fbclid|facebook|fb_/i.test(url))) add("meta_ads_possible");
  if (paidGoogleHints(url) || (paidParams && /gclid|google/i.test(url))) add("google_ads_possible");

  if (!paidParams && profile.paidTrafficLikelihood >= 62) {
    add("meta_ads_possible");
    if (input.otaDependencyLikelihood >= 55 || input.digitalMaturity >= 60) add("google_ads_possible");
  }

  if (influencerLanguage(scanText)) add("influencer_possible");

  if (
    contentMarketingSurface(scanText, profile.instagramBioSignals.length, profile.instagramBookingSignals.length)
  ) {
    add("content_marketing");
  }

  return out;
}

export function getAcquisitionSignals(
  input: AcquisitionIntelligenceInput,
  profile: AcquisitionIntelligenceProfileBase,
): string[] {
  const scanText = normalizeScanText(input.socialSignalText, input.instagramHandle);
  const signals: string[] = [];
  const push = (s: string) => {
    if (!signals.includes(s)) signals.push(s);
  };

  if (profile.instagramDiscoveryStatus === "verified") {
    push("Instagram discovery: validated link/handle");
  } else if (profile.hasInstagram && profile.instagramStatus === "valid") {
    push("Instagram handle or URL present");
  } else if (profile.instagramDiscoveryStatus === "possible") {
    push("Instagram may exist (plausible handles; verify manually)");
  }

  if (profile.whatsappConfidence !== "none") {
    if (profile.whatsappConfidence === "confirmed") {
      push("WhatsApp path validated (healthy wa.me / api link or aligned GSM)");
    } else {
      push("WhatsApp signal present — verify before relying on outreach");
    }
  }

  if (input.hasOwnWebsite || input.website?.trim()) {
    push("Website exists");
  }

  if (input.channels.some((c) => c === "Booking" || c === "Airbnb" || c === "Tatilsepeti")) {
    push("OTA / platform listing footprint");
  }
  if (input.otaDependencyLikelihood >= 60) {
    push("Elevated OTA likelihood (distribution-led acquisition)");
  }

  if (profile.socialDemandIntent === "high") push("Strong social demand");
  else if (profile.socialDemandIntent === "medium") push("Moderate social demand");

  if (campaignLanguage(scanText)) push("Campaign / promo language in copy");

  if (profile.paidTrafficLikelihood >= 55 || paidParamsInUrl(input.website)) {
    push("Possible paid traffic (tracking params or modeled likelihood)");
  }

  if (profile.socialConversionGap !== "low") {
    push("Booking or conversion pressure relative to social attention");
  }
  if (input.bookingFlowStrength >= 58) {
    push("Stronger direct booking surface / CTAs");
  }

  return signals;
}

export function getAcquisitionWeaknesses(
  input: AcquisitionIntelligenceInput,
  profile: AcquisitionIntelligenceProfileBase,
): string[] {
  const weaknesses: string[] = [];
  const push = (s: string) => {
    if (!weaknesses.includes(s)) weaknesses.push(s);
  };

  if (profile.instagramStatus === "invalid") {
    push("Instagram surface appears invalid or broken");
  }
  if (profile.whatsappConfidence === "none") {
    push("No clear WhatsApp path");
  }
  if (!input.hasOwnWebsite && !input.website?.trim()) {
    push("No owned website");
  }
  if (input.bookingFlowStrength < 42) {
    push("Weak direct booking flow");
  }
  if (profile.socialConversionGap === "high") {
    push("Social attention may outpace booking capture");
  }

  const acqChannels = detectAcquisitionChannels(input, profile);
  if (acqChannels.length <= 1) {
    push("Limited acquisition channel mix (single-surface risk)");
  }
  if (input.otaDependencyLikelihood >= 72 && input.bookingFlowStrength < 50) {
    push("Heavy OTA reliance with thin owned conversion path");
  }

  return weaknesses;
}

export function calculateAcquisitionIntent(
  input: AcquisitionIntelligenceInput,
  profile: AcquisitionIntelligenceProfileBase,
): number {
  const scanText = normalizeScanText(input.socialSignalText, input.instagramHandle);
  const channels = detectAcquisitionChannels(input, profile);
  const distinct = channels.length;

  let s =
    profile.acquisitionPressureScore * 0.34 +
    profile.paidTrafficLikelihood * 0.22 +
    profile.adDrivenLeadPotential * 0.16;

  if (profile.socialDemandIntent === "high") s += 12;
  else if (profile.socialDemandIntent === "medium") s += 6;

  if (profile.socialConversionGap === "high") s += 8;
  else if (profile.socialConversionGap === "medium") s += 4;

  s += Math.min(10, input.otaDependencyLikelihood * 0.1);
  s += Math.min(8, input.digitalMaturity * 0.06);

  if (distinct >= 2) s += Math.min(18, (distinct - 1) * 6);

  s = clamp(s);

  const chSet = new Set(channels);
  const onlyIg = distinct === 1 && chSet.has("instagram");
  const onlyWeb = distinct === 1 && chSet.has("website");
  if (onlyIg) s = Math.min(s, 46);
  if (onlyWeb) s = Math.min(s, 46);

  if (
    distinct === 2 &&
    chSet.has("instagram") &&
    chSet.has("website") &&
    !chSet.has("whatsapp") &&
    !profile.metaAdsDetected &&
    !campaignLanguage(scanText)
  ) {
    s = Math.min(s, 58);
  }

  return Math.round(clamp(s));
}

function computeIsAcquisitionActive(
  score: number,
  channels: AcquisitionChannel[],
  profile: AcquisitionIntelligenceProfileBase,
): boolean {
  if (score < 50) return false;
  const diverse = channels.length >= 2;
  const paidLike =
    profile.paidTrafficLikelihood >= 58 ||
    profile.metaAdsDetected ||
    channels.includes("campaign_language") ||
    channels.includes("meta_ads_possible") ||
    channels.includes("google_ads_possible");
  const socialConvert =
    profile.socialDemandIntent === "high" && profile.socialConversionGap !== "low";
  return diverse || (paidLike && score >= 55) || (socialConvert && score >= 52);
}

export function buildAcquisitionIntelligenceStructured(
  input: AcquisitionIntelligenceInput,
  profile: AcquisitionIntelligenceProfileBase,
): AcquisitionIntelligence {
  const acquisitionChannels = detectAcquisitionChannels(input, profile);
  const acquisitionIntentScore = calculateAcquisitionIntent(input, profile);
  return {
    acquisitionIntentScore,
    acquisitionIntentLevel: getAcquisitionIntentLevel(acquisitionIntentScore),
    acquisitionChannels,
    acquisitionSignals: getAcquisitionSignals(input, profile),
    acquisitionWeaknesses: getAcquisitionWeaknesses(input, profile),
    isAcquisitionActive: computeIsAcquisitionActive(acquisitionIntentScore, acquisitionChannels, profile),
  };
}

/** Deterministic proxy for Meta / paid acquisition surface (no Meta API calls). */
export function calculateAcquisitionPressure(ctx: {
  hasInstagram: boolean;
  hasWhatsAppPath: boolean;
  socialDemandIntent: SocialDemandIntent;
  socialDemandStrength: number;
  digitalMaturity: number;
  paidHints: boolean;
  campaignLanguage: boolean;
}): number {
  let s = 24;
  if (ctx.hasInstagram) s += 16;
  if (ctx.hasWhatsAppPath) s += 14;
  if (ctx.socialDemandIntent === "high") s += 22;
  else if (ctx.socialDemandIntent === "medium") s += 12;
  if (ctx.socialDemandStrength >= 58) s += 12;
  else if (ctx.socialDemandStrength >= 42) s += 6;
  if (ctx.digitalMaturity >= 62) s += 10;
  if (ctx.paidHints) s += 16;
  if (ctx.campaignLanguage) s += 12;
  return Math.round(clamp(s));
}

export function estimatePaidTrafficLikelihood(ctx: {
  website?: string;
  businessTier?: BusinessTierLike;
  digitalMaturity: number;
  hasInstagram: boolean;
  hasWhatsAppPath: boolean;
  otaDependencyLikelihood: number;
  paidParams: boolean;
}): number {
  let s = 20;
  if (ctx.paidParams) s += 36;
  if (ctx.businessTier === "medium" || ctx.businessTier === "premium") s += 14;
  if (ctx.digitalMaturity >= 66) s += 16;
  else if (ctx.digitalMaturity >= 52) s += 8;
  if (ctx.hasInstagram && ctx.hasWhatsAppPath) s += 12;
  if (ctx.otaDependencyLikelihood >= 68 && ctx.hasInstagram) s += 14;
  return Math.round(clamp(s));
}

export function buildAcquisitionIntelligence(
  input: AcquisitionIntelligenceInput,
): AcquisitionIntelligenceProfile {
  const scanText = normalizeScanText(input.socialSignalText, input.instagramHandle);
  const validation = validateInstagram(input.instagramHandle, scanText);
  const { detected: rawHandleDetected } = detectInstagramHandle(input.instagramHandle);

  const discovery = determineInstagramDiscovery({
    hasInstagramRaw: input.hasInstagram,
    validationStatus: validation.status,
    validationConfidence: validation.confidence,
    businessName: input.businessName,
    city: input.city,
    type: input.type,
    website: input.website,
    socialSignalText: input.socialSignalText,
  });

  const isInvalidIg = validation.status === "invalid";
  /** Treat IG as absent for downstream scoring when its link/profile looks broken. */
  const effectiveHasInstagram = input.hasInstagram && !isInvalidIg;
  const effectiveHandleDetected = rawHandleDetected && !isInvalidIg;

  const instagramBioSignals = collectInstagramBioSignals(scanText);
  const instagramBookingSignals = collectInstagramBookingSignals(scanText);
  const instagramLinkQuality = scoreInstagramLinkQuality(
    { ...input, hasInstagram: effectiveHasInstagram },
    effectiveHandleDetected,
  );

  const socialDemandIntent = triSocialDemandIntent(instagramBioSignals, {
    ...input,
    hasInstagram: effectiveHasInstagram,
  });

  const instagramActivityEstimate = calculateInstagramActivity({
    hasInstagram: effectiveHasInstagram,
    daysSinceLastReview: input.daysSinceLastReview,
    reviewsCount: input.reviewsCount,
    socialDemandStrength: input.socialDemandStrength,
    bioSignalCount: instagramBioSignals.length,
    bookingSignalCount: instagramBookingSignals.length,
  });

  const instagramActivityLevel = triInstagramActivityLevel(
    instagramActivityEstimate,
    effectiveHasInstagram,
  );

  const socialConversionGap = detectSocialConversionGap({
    hasInstagram: effectiveHasInstagram,
    bookingFlowStrength: input.bookingFlowStrength,
    socialDemandIntent,
    bioSignalCount: instagramBioSignals.length,
  });

  const paidParams = paidParamsInUrl(input.website);
  const campLang = campaignLanguage(scanText);
  const metaAdsDetected = paidParams || campLang;

  const acquisitionPressureScore = calculateAcquisitionPressure({
    hasInstagram: effectiveHasInstagram,
    hasWhatsAppPath: input.hasWhatsAppPath,
    socialDemandIntent,
    socialDemandStrength: input.socialDemandStrength,
    digitalMaturity: input.digitalMaturity,
    paidHints: paidParams,
    campaignLanguage: campLang,
  });

  let paidTrafficLikelihood = estimatePaidTrafficLikelihood({
    website: input.website,
    businessTier: input.businessTier,
    digitalMaturity: input.digitalMaturity,
    hasInstagram: effectiveHasInstagram,
    hasWhatsAppPath: input.hasWhatsAppPath,
    otaDependencyLikelihood: input.otaDependencyLikelihood,
    paidParams,
  });
  /** When the only visible paid surface is a broken IG link, pull likelihood down a touch. */
  if (isInvalidIg && !paidParams) {
    paidTrafficLikelihood = Math.round(clamp(paidTrafficLikelihood * 0.85));
  }

  let adDrivenLeadPotential = 22;
  adDrivenLeadPotential += acquisitionPressureScore * 0.34;
  adDrivenLeadPotential += paidTrafficLikelihood * 0.26;
  if (input.otaDependencyLikelihood >= 65 && effectiveHasInstagram) adDrivenLeadPotential += 16;
  if (socialDemandIntent === "high" && socialConversionGap !== "low") adDrivenLeadPotential += 12;
  adDrivenLeadPotential = Math.round(clamp(adDrivenLeadPotential));

  const wiForWeb = input.websiteIntelligence;
  const hasListingWebsite = input.hasOwnWebsite || Boolean(input.website?.trim());
  const candidateStrong = wiForWeb?.websiteCandidateMatch === "strong";
  const candidateUncertain = wiForWeb?.websiteCandidateMatch === "uncertain";

  let websiteConfidence: SignalConfidence;
  if (candidateUncertain) {
    websiteConfidence = "weak";
  } else if (hasListingWebsite || candidateStrong) {
    websiteConfidence = confidenceFromScore(input.websiteIntelligence?.confidence ?? 70, {
      confirmed: 80,
      likely: 55,
      weak: 30,
    });
  } else {
    websiteConfidence = "missing";
  }
  const hasMobileLikeContact =
    input.hasWhatsAppPath || input.contactQuality === "high" || input.contactQuality === "medium";
  const hasContactCta =
    input.websiteIntelligence?.hasWhatsAppLink === true ||
    input.websiteIntelligence?.hasContactPage === true ||
    input.websiteIntelligence?.hasInquiryForm === true ||
    input.websiteIntelligence?.hasTelLink === true ||
    input.websiteIntelligence?.hasBookingCtaText === true;
  const onlyLandlineExists =
    input.contactQuality === "low" &&
    input.websiteIntelligence?.hasTelLink === true &&
    !input.hasWhatsAppPath &&
    input.websiteIntelligence?.hasWhatsAppLink !== true;
  const hasReachableChannel =
    input.hasWhatsAppPath ||
    input.websiteIntelligence?.hasWhatsAppLink === true ||
    input.hasInstagram ||
    input.websiteIntelligence?.hasContactPage === true ||
    input.websiteIntelligence?.hasInquiryForm === true;
  const isStrictMissingWhatsapp =
    !hasMobileLikeContact && !hasReachableChannel && onlyLandlineExists;

  const meta = wiForWeb?.whatsappSurfaceMeta;
  const validatedWaLinkCount = meta?.validatedLinkCount ?? 0;
  const waAllLinksInvalid = Boolean(
    meta?.allLinksInvalid ||
      (wiForWeb?.hasWhatsAppLink === true &&
        wiForWeb?.hasInvalidWhatsAppLinks === true &&
        validatedWaLinkCount === 0),
  );
  const waMixedValidation = meta?.mixedValidation ?? false;
  const bestValidLinkDigitsTr90 = meta?.bestValidTr90Digits ?? null;
  const socialScanImpliesWhatsApp = /(whatsapp|wa\.me)/i.test(scanText);

  let whatsappConfidence: WhatsAppConfidence;
  let whatsappSignals: string[];

  if (isStrictMissingWhatsapp) {
    whatsappConfidence = "none";
    whatsappSignals = [];
  } else {
    const waDetect = detectWhatsAppConfidence({
      listingPhoneRaw: input.listingPhone ?? "",
      hasWhatsAppPath: input.hasWhatsAppPath,
      websiteHasWhatsAppLink: wiForWeb?.hasWhatsAppLink === true,
      websiteHasInvalidWhatsAppLinks: wiForWeb?.hasInvalidWhatsAppLinks === true,
      validatedWaLinkCount,
      waAllLinksInvalid,
      waMixedValidation,
      bestValidLinkDigitsTr90,
      htmlHints: meta?.htmlHints ?? null,
      socialScanImpliesWhatsApp,
    });
    whatsappConfidence = waDetect.confidence;
    whatsappSignals = [...waDetect.signals];
  }
  const otaConfidence: SignalConfidence =
    input.channels.some((c) => c === "Booking" || c === "Airbnb" || c === "Tatilsepeti")
      ? confidenceFromScore(input.otaDependencyLikelihood, {
          confirmed: 80,
          likely: 55,
          weak: 30,
        })
      : "missing";
  const adsLikelihood: SignalConfidence = confidenceFromScore(paidTrafficLikelihood, {
    confirmed: 75,
    likely: 55,
    weak: 35,
  });
  const directBookingMaturity: MaturityLevel = maturityFromScore(input.bookingFlowStrength);
  const conversionMaturity: MaturityLevel = maturityFromScore(
    100 - input.bookingFlowStrength,
  );
  const acquisitionMaturity: MaturityLevel = calculateAcquisitionMaturity({
    digitalMaturity: input.digitalMaturity,
    bookingFlowStrength: input.bookingFlowStrength,
    socialDemandStrength: input.socialDemandStrength,
    otaDependencyLikelihood: input.otaDependencyLikelihood,
    reviewsCount: input.reviewsCount,
    daysSinceLastReview: input.daysSinceLastReview,
    contactQuality: input.contactQuality,
    hasWhatsAppPath: input.hasWhatsAppPath,
    hasInstagram: effectiveHasInstagram,
    instagramLinkQuality,
    channels: input.channels,
    hasOwnWebsite: input.hasOwnWebsite,
    website: input.website,
    websiteIntelligence: input.websiteIntelligence,
  });

  const instagramConfidence: SignalConfidence =
    discovery.instagramDiscoveryStatus === "verified"
      ? "confirmed"
      : discovery.instagramDiscoveryStatus === "broken"
        ? "weak"
        : "likely";

  const base: AcquisitionIntelligenceProfileBase = {
    hasInstagram: input.hasInstagram,
    instagramHandleDetected: effectiveHandleDetected,
    instagramLinkQuality,
    instagramBioSignals,
    instagramBookingSignals,
    instagramActivityEstimate,
    instagramActivityLevel,
    instagramStatus: validation.status,
    instagramConfidence,
    websiteConfidence,
    whatsappConfidence,
    whatsappSignals,
    otaConfidence,
    adsLikelihood,
    directBookingMaturity,
    conversionMaturity,
    acquisitionMaturity,
    instagramInvalidReasons: validation.reasons,
    instagramDiscoveryStatus: discovery.instagramDiscoveryStatus,
    suggestedInstagramHandles: discovery.suggestedInstagramHandles,
    instagramNeedsManualCheck: discovery.instagramNeedsManualCheck,
    socialDemandIntent,
    socialConversionGap,
    metaAdsDetected,
    acquisitionPressureScore,
    paidTrafficLikelihood,
    adDrivenLeadPotential,
  };

  return {
    ...base,
    acquisition: buildAcquisitionIntelligenceStructured(input, base),
  };
}
