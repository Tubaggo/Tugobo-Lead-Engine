/**
 * Splits a lead's data into what we can *state* and what we can only *suggest*.
 *
 * This is the grounding boundary for outreach copy. A verified signal is
 * something observed directly (the site has a booking CTA, the phone yields a
 * WhatsApp link). A likely signal is an inference from a score — real enough to
 * shape the angle, never real enough to assert to the hotel.
 *
 * Getting this wrong is the expensive failure: telling a hotelier "you are
 * losing bookings at night" when we only inferred it from a communication-risk
 * score reads as a lie to someone who knows their own operation.
 */

export type SignalConfidence = "verified" | "likely" | "unknown";

export type OutreachSignal = {
  key: string;
  label: string;
  value: string | boolean | number;
  confidence: SignalConfidence;
  source?: string;
};

/** The lead fields the signal builder is allowed to look at. */
export type SignalInput = {
  city?: string;
  businessType?: string;
  hasWhatsAppPath?: boolean;
  hasInstagram?: boolean;
  hasOwnWebsite?: boolean;
  channels?: string[];
  businessSignals?: string[];
  reviewsCount?: number | null;
  websiteIntelligence?: {
    hasBookingCtaText?: boolean;
    hasWhatsAppLink?: boolean;
    hasBookingEngine?: boolean;
  } | null;
  bookingFlowStrength?: number | null;
  otaDependencyLikelihood?: number | null;
  socialDemandStrength?: number | null;
  communicationRisk?: number | null;
};

export type SignalSet = {
  verified: OutreachSignal[];
  likely: OutreachSignal[];
};

const OTA_CHANNELS = new Set(["Booking", "Airbnb", "Expedia", "Hotels.com"]);

function num(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Builds the verified/likely split.
 *
 * Anything not derivable from the input is simply absent — there is no
 * "unknown" list to pad the prompt with, because naming an unknown invites the
 * model to speculate about it.
 */
export function buildOutreachSignals(input: SignalInput): SignalSet {
  const verified: OutreachSignal[] = [];
  const likely: OutreachSignal[] = [];

  const city = input.city?.trim();
  if (city) {
    verified.push({
      key: "city",
      label: "Şehir",
      value: city,
      confidence: "verified",
      source: "lead",
    });
  }

  const businessType = input.businessType?.trim();
  if (businessType) {
    verified.push({
      key: "business_type",
      label: "İşletme tipi",
      value: businessType,
      confidence: "verified",
      source: "google_places",
    });
  }

  if (input.hasOwnWebsite === true) {
    verified.push({
      key: "own_website",
      label: "Kendi web sitesi var",
      value: true,
      confidence: "verified",
      source: "website",
    });
  }

  if (input.hasWhatsAppPath === true) {
    verified.push({
      key: "whatsapp_reachable",
      label: "WhatsApp'tan ulaşılabilir",
      value: true,
      confidence: "verified",
      source: "phone",
    });
  }

  if (input.hasInstagram === true) {
    verified.push({
      key: "instagram_present",
      label: "Instagram hesabı var",
      value: true,
      confidence: "verified",
      source: "profile",
    });
  }

  const wi = input.websiteIntelligence;
  if (wi?.hasBookingEngine === true) {
    verified.push({
      key: "booking_engine",
      label: "Sitede rezervasyon motoru var",
      value: true,
      confidence: "verified",
      source: "website",
    });
  }
  if (wi?.hasBookingCtaText === true) {
    verified.push({
      key: "booking_cta",
      label: "Sitede rezervasyon butonu var",
      value: true,
      confidence: "verified",
      source: "website",
    });
  }
  // Absence is only meaningful when we actually looked at the site.
  if (input.hasOwnWebsite === true && wi && wi.hasWhatsAppLink === false) {
    verified.push({
      key: "no_website_whatsapp_link",
      label: "Sitede WhatsApp bağlantısı görünmüyor",
      value: false,
      confidence: "verified",
      source: "website",
    });
  }
  if (wi?.hasWhatsAppLink === true) {
    verified.push({
      key: "website_whatsapp_link",
      label: "Sitede WhatsApp bağlantısı var",
      value: true,
      confidence: "verified",
      source: "website",
    });
  }

  const otaListed = (input.channels ?? []).filter((c) => OTA_CHANNELS.has(c));
  if (otaListed.length > 0) {
    verified.push({
      key: "ota_listed",
      label: "OTA kanallarında listeleniyor",
      value: otaListed.join(", "),
      confidence: "verified",
      source: "channels",
    });
  }

  const reviews = num(input.reviewsCount);
  if (reviews !== null && reviews > 0) {
    verified.push({
      key: "reviews_count",
      label: "Google yorum sayısı",
      value: reviews,
      confidence: "verified",
      source: "google_places",
    });
  }

  /* ---- inferred ---- */

  const ota = num(input.otaDependencyLikelihood);
  // Only inferable when there is channel evidence to infer from; a score with
  // no listing behind it is not enough to raise OTA dependency at all.
  if (ota !== null && ota >= 55 && otaListed.length > 0) {
    likely.push({
      key: "ota_dependency",
      label: "OTA ağırlıklı talep ihtimali",
      value: ota,
      confidence: "likely",
      source: "score",
    });
  }

  const booking = num(input.bookingFlowStrength);
  if (booking !== null && booking < 55 && input.hasOwnWebsite === true) {
    likely.push({
      key: "weak_direct_booking",
      label: "Direkt rezervasyon akışı zayıf olabilir",
      value: booking,
      confidence: "likely",
      source: "score",
    });
  }

  const social = num(input.socialDemandStrength);
  if (social !== null && social >= 60 && input.hasInstagram === true) {
    likely.push({
      key: "social_demand",
      label: "Sosyal medyadan talep ihtimali",
      value: social,
      confidence: "likely",
      source: "score",
    });
  }

  const comm = num(input.communicationRisk);
  if (comm !== null && comm >= 55) {
    likely.push({
      key: "response_delay",
      label: "Yanıt hızında zorlanma ihtimali",
      value: comm,
      confidence: "likely",
      source: "score",
    });
  }

  const bs = new Set(input.businessSignals ?? []);
  if (bs.has("conversion_gap") || bs.has("no_booking_flow") || bs.has("weak_booking_cta")) {
    likely.push({
      key: "conversion_gap",
      label: "Talep–rezervasyon adımında kopma ihtimali",
      value: true,
      confidence: "likely",
      source: "rules",
    });
  }

  const channelCount = (input.channels ?? []).length;
  if (channelCount >= 3) {
    likely.push({
      key: "multi_channel_load",
      label: "Çok kanallı talep takibi yükü",
      value: channelCount,
      confidence: "likely",
      source: "channels",
    });
  }

  return { verified, likely };
}

/** Signal keys present at either confidence, for validator and prompt use. */
export function signalKeys(set: SignalSet): string[] {
  return [...set.verified, ...set.likely].map((s) => s.key);
}

export function hasSignal(set: SignalSet, key: string): boolean {
  return signalKeys(set).includes(key);
}

/** True when there is too little to say anything property-specific. */
export function isLowSignal(set: SignalSet): boolean {
  const substantive = set.verified.filter(
    (s) => s.key !== "city" && s.key !== "business_type",
  );
  return substantive.length === 0 && set.likely.length === 0;
}
