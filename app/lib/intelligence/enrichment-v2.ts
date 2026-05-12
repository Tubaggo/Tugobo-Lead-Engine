import type { WebsiteIntelligenceSummary } from "../leads";
import {
  buildAcquisitionIntelligence,
  type AcquisitionIntelligenceProfile,
  type BusinessTierLike,
} from "./acquisition-intelligence";
import {
  calculateCommercialReadiness,
  type CommercialReadiness,
} from "./commercial-readiness";

type Channel = "Booking" | "Airbnb" | "Direct" | "Tatilsepeti";
type ContactQuality = "high" | "medium" | "low";

export type EnrichmentV2Input = {
  hasOwnWebsite: boolean;
  hasInstagram: boolean;
  website?: string;
  instagramHandle?: string;
  /** Lowercased concatenated listing copy + future cached homepage/bio text. */
  socialSignalText?: string;
  channels: readonly Channel[];
  rating: number;
  reviewsCount: number;
  daysSinceLastReview: number;
  occupancy30d: number;
  contactQuality: ContactQuality;
  hasWhatsAppPath: boolean;
  phoneMissing: boolean;
  /** Listing phone for WhatsApp confidence normalization. */
  listingPhone?: string;
  websiteIntelligence?: WebsiteIntelligenceSummary;
  businessTier?: BusinessTierLike;
  /** Optional listing fields used to discover plausible Instagram handles when none is on file. */
  businessName?: string;
  city?: string;
  type?: string;
};

export type EnrichmentV2Profile = {
  digitalMaturity: number;
  bookingFlowStrength: number;
  otaDependencyLikelihood: number;
  socialDemandStrength: number;
  communicationHealth: number;
  operationalActivity: number;
  hasWeakBookingCta: boolean;
  hasNoBookingFlow: boolean;
  hasExternalOnlyBooking: boolean;
  hasWeakContactVisibility: boolean;
  acquisitionIntelligence: AcquisitionIntelligenceProfile;
  commercialReadiness: CommercialReadiness;
};

const OTA_HOST_PATTERNS = [
  "booking.com",
  "airbnb.",
  "hotels.com",
  "expedia.",
] as const;

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

function looksLikeOtaUrl(raw?: string): boolean {
  if (!raw?.trim()) return false;
  const v = raw.toLowerCase();
  return OTA_HOST_PATTERNS.some((p) => v.includes(p));
}

function hasOtaChannel(channels: readonly Channel[]): boolean {
  return channels.some((c) => c === "Booking" || c === "Airbnb" || c === "Tatilsepeti");
}

function hasDirectChannel(channels: readonly Channel[]): boolean {
  return channels.includes("Direct");
}

export function detectBookingFlowStrength(input: EnrichmentV2Input): number {
  let score = 20;
  const hasWebsitePresence =
    input.hasOwnWebsite ||
    Boolean(input.website?.trim()) ||
    input.websiteIntelligence?.websiteCandidateMatch === "strong" ||
    typeof input.websiteIntelligence?.bookingFlowQuality === "number";
  const hasCta = input.websiteIntelligence?.hasBookingCtaText === true;
  const hasEngine = input.websiteIntelligence?.hasBookingEngine === true;
  const hasTel = input.websiteIntelligence?.hasTelLink === true;
  const externalOtaWebsite = looksLikeOtaUrl(input.website);
  const qualityHint = input.websiteIntelligence?.bookingFlowQuality;
  const hasContactPage = input.websiteIntelligence?.hasContactPage === true;
  const hasInquiryForm = input.websiteIntelligence?.hasInquiryForm === true;
  const hasOtaOutboundLinks = input.websiteIntelligence?.hasOtaOutboundLinks === true;

  if (hasWebsitePresence) score += 20;
  if (hasDirectChannel(input.channels)) score += 20;
  if (hasEngine) score += 18;
  if (hasCta) score += 16;
  if (input.hasWhatsAppPath || hasTel) score += 10;
  if (hasContactPage) score += 8;
  if (hasInquiryForm) score += 10;

  if (typeof qualityHint === "number" && Number.isFinite(qualityHint)) {
    score = Math.round(score * 0.45 + clamp(qualityHint) * 0.55);
  }
  if (!hasWebsitePresence) score -= 10;
  if (input.websiteIntelligence?.hasBookingCtaText === false) score -= 12;
  if (input.websiteIntelligence?.hasBookingEngine === false) score -= 10;
  if (externalOtaWebsite) score -= 22;
  if (hasOtaOutboundLinks) score -= 8;

  return Math.round(clamp(score));
}

export function detectOTADependency(input: EnrichmentV2Input): number {
  let score = 18;
  const otaChannels = input.channels.filter(
    (c) => c === "Booking" || c === "Airbnb" || c === "Tatilsepeti",
  ).length;
  const hasOta = hasOtaChannel(input.channels);
  const hasDirect = hasDirectChannel(input.channels) || input.hasOwnWebsite;
  const externalOtaWebsite = looksLikeOtaUrl(input.website);

  score += otaChannels * 15;
  if (hasOta && !hasDirect) score += 24;
  if (input.channels.length <= 1 && hasOta) score += 12;
  if (externalOtaWebsite) score += 24;
  if (hasDirect) score -= 18;
  if (input.hasOwnWebsite) score -= 10;

  return Math.round(clamp(score));
}

export function calculateOperationalActivity(input: EnrichmentV2Input): number {
  let score = 0;
  const reviews = Number.isFinite(input.reviewsCount) ? Math.max(0, input.reviewsCount) : 0;
  const recency = Number.isFinite(input.daysSinceLastReview)
    ? input.daysSinceLastReview
    : 999;
  const occ = Number.isFinite(input.occupancy30d) ? input.occupancy30d : 0;

  score += Math.min(45, reviews * 0.09);
  if (recency <= 1) score += 35;
  else if (recency <= 3) score += 26;
  else if (recency <= 7) score += 16;
  else if (recency <= 14) score += 10;
  else if (recency <= 30) score += 4;

  score += clamp((occ - 0.35) * 55, 0, 20);
  return Math.round(clamp(score));
}

export function calculateDigitalMaturity(input: EnrichmentV2Input): number {
  const bookingFlowStrength = detectBookingFlowStrength(input);
  let score = 24;
  if (input.hasOwnWebsite) score += 24;
  if (input.hasInstagram) score += 14;
  if (input.hasWhatsAppPath) score += 14;
  if (input.websiteIntelligence?.mobileViewportPresent === true) score += 10;
  if (input.websiteIntelligence?.hasWhatsAppLink === true) score += 8;
  if (hasDirectChannel(input.channels)) score += 10;
  score += bookingFlowStrength * 0.2;

  if (!input.hasOwnWebsite && !input.hasInstagram) score -= 16;
  if (input.websiteIntelligence?.mobileViewportPresent === false) score -= 8;
  return Math.round(clamp(score));
}

export function buildEnrichmentV2Profile(input: EnrichmentV2Input): EnrichmentV2Profile {
  const bookingFlowStrength = detectBookingFlowStrength(input);
  const otaDependencyLikelihood = detectOTADependency(input);
  const operationalActivity = calculateOperationalActivity(input);
  const digitalMaturity = calculateDigitalMaturity(input);

  let socialDemandStrength = 14;
  if (input.hasInstagram) socialDemandStrength += 28;
  socialDemandStrength += Math.min(35, input.reviewsCount * 0.06);
  if (input.daysSinceLastReview <= 3) socialDemandStrength += 18;
  else if (input.daysSinceLastReview <= 10) socialDemandStrength += 8;
  if (!input.hasInstagram && input.reviewsCount >= 120) socialDemandStrength -= 12;
  socialDemandStrength = Math.round(clamp(socialDemandStrength));

  let communicationHealth = 40;
  if (input.contactQuality === "high") communicationHealth += 18;
  else if (input.contactQuality === "medium") communicationHealth += 8;
  else communicationHealth -= 14;
  if (input.hasWhatsAppPath) communicationHealth += 10;
  if (input.phoneMissing) communicationHealth -= 18;
  if (input.rating >= 4.5) communicationHealth += 10;
  else if (input.rating > 0 && input.rating < 4.15) communicationHealth -= 14;
  if (input.daysSinceLastReview > 21) communicationHealth -= 8;
  communicationHealth = Math.round(clamp(communicationHealth));

  const hasNoBookingFlow = bookingFlowStrength < 36;
  const hasWeakBookingCta =
    input.websiteIntelligence?.hasBookingCtaText === false || bookingFlowStrength < 48;
  const hasExternalOnlyBooking =
    otaDependencyLikelihood >= 75 &&
    !input.hasOwnWebsite &&
    !hasDirectChannel(input.channels);
  const hasWeakContactVisibility =
    input.phoneMissing && !input.hasWhatsAppPath && !input.hasInstagram;

  const acquisitionIntelligence = buildAcquisitionIntelligence({
    hasInstagram: input.hasInstagram,
    instagramHandle: input.instagramHandle,
    socialSignalText: input.socialSignalText,
    website: input.website,
    channels: input.channels,
    hasWhatsAppPath: input.hasWhatsAppPath,
    contactQuality: input.contactQuality,
    bookingFlowStrength,
    socialDemandStrength,
    digitalMaturity,
    otaDependencyLikelihood,
    daysSinceLastReview: input.daysSinceLastReview,
    reviewsCount: input.reviewsCount,
    hasOwnWebsite: input.hasOwnWebsite,
    businessTier: input.businessTier,
    websiteIntelligence: input.websiteIntelligence,
    businessName: input.businessName,
    city: input.city,
    type: input.type,
    listingPhone: input.listingPhone,
  });
  const commercialReadiness = calculateCommercialReadiness({
    businessTier: input.businessTier,
    hasOwnWebsite: input.hasOwnWebsite,
    hasInstagram: input.hasInstagram,
    hasWhatsAppPath: input.hasWhatsAppPath,
    channels: input.channels,
    websiteIntelligence: input.websiteIntelligence,
    acquisition: acquisitionIntelligence.acquisition,
    bookingFlowStrength,
    digitalMaturity,
    communicationHealth,
    operationalActivity,
    reviewsCount: input.reviewsCount,
    daysSinceLastReview: input.daysSinceLastReview,
    socialDemandStrength,
    otaDependencyLikelihood,
  });

  return {
    digitalMaturity,
    bookingFlowStrength,
    otaDependencyLikelihood,
    socialDemandStrength,
    communicationHealth,
    operationalActivity,
    hasWeakBookingCta,
    hasNoBookingFlow,
    hasExternalOnlyBooking,
    hasWeakContactVisibility,
    acquisitionIntelligence,
    commercialReadiness,
  };
}
