import {
  determineInstagramDiscovery,
  type InstagramDiscoveryStatus,
} from "./instagram-discovery";

/** Narrow mirror of {@link import("../leads").WebsiteIntelligenceSummary} — avoid importing `leads` (cycle). */
export type WebsiteIntelForAcquisition = {
  hasWhatsAppLink?: boolean;
  hasTelLink?: boolean;
  hasBookingCtaText?: boolean;
  hasBookingEngine?: boolean;
  mobileViewportPresent?: boolean;
  confidence?: number;
  errors?: string[];
  socialLinksQuality?: number;
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
  /** 0–100 confidence in the *discovery* result (mirrors the discovery layer). */
  instagramConfidence: number;
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
};

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
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

  return {
    hasInstagram: input.hasInstagram,
    instagramHandleDetected: effectiveHandleDetected,
    instagramLinkQuality,
    instagramBioSignals,
    instagramBookingSignals,
    instagramActivityEstimate,
    instagramActivityLevel,
    instagramStatus: validation.status,
    instagramConfidence: discovery.instagramConfidence,
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
}
