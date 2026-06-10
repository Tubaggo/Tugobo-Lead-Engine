import type { AcquisitionIntelligenceProfile } from "./acquisition-intelligence";

export type EstimatedPropertySize = "small" | "medium" | "large" | "unknown";
export type EstimatedDemandVolume = "low" | "medium" | "high" | "unknown";
export type DirectBookingReadiness = "low" | "medium" | "high" | "unknown";
export type OtaDependencyLevel = "low" | "medium" | "high" | "unknown";

export type IcpAlignmentProfile = {
  estimatedPropertySize: EstimatedPropertySize;
  estimatedDemandVolume: EstimatedDemandVolume;
  directBookingReadiness: DirectBookingReadiness;
  otaDependencyLevel: OtaDependencyLevel;
  /** Breadth and activity of digital channels (0–100). */
  multiChannelScore: number;
  /** How much operational demand this hotel has — more = more TUGOBO value (0–100). */
  operationalComplexityScore: number;
  /** Core ICP score: how much value TUGOBO AI would create if connected tomorrow (0–100). */
  tugoboFitScore: number;
  /** True if this lead has high TUGOBO operational fit (score ≥ 62 and active digital channel). */
  operationalFit: boolean;
  /** Short Turkish explanation of expected operational value for this business. */
  operationalValueSummary: string;
};

export type IcpAlignmentInput = {
  units: number;
  reviewsCount: number;
  daysSinceLastReview: number;
  occupancy30d: number;
  pricePerNight: number;
  hasInstagram: boolean;
  hasOwnWebsite: boolean;
  hasWhatsAppPath: boolean;
  channels: readonly string[];
  bookingFlowStrength: number;
  otaDependencyLikelihood: number;
  digitalMaturity: number;
  socialDemandStrength: number;
  operationalActivity: number;
  acquisitionIntelligence?: AcquisitionIntelligenceProfile;
};

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

function estimatePropertySize(units: number): EstimatedPropertySize {
  if (!Number.isFinite(units) || units <= 0) return "unknown";
  if (units < 20) return "small";
  if (units <= 80) return "medium";
  return "large";
}

function estimateDemandVolume(input: IcpAlignmentInput): EstimatedDemandVolume {
  const { reviewsCount, occupancy30d, hasInstagram, daysSinceLastReview } = input;
  if (!Number.isFinite(reviewsCount) || reviewsCount <= 0) return "unknown";
  const recentActivity = daysSinceLastReview <= 7;
  const highOccupancy = Number.isFinite(occupancy30d) && occupancy30d >= 0.65;
  const highReviews = reviewsCount >= 80;
  const mediumReviews = reviewsCount >= 30;

  if (highReviews && (highOccupancy || hasInstagram) && recentActivity) return "high";
  if (highReviews && (highOccupancy || hasInstagram)) return "high";
  if (mediumReviews && (highOccupancy || hasInstagram || recentActivity)) return "medium";
  if (mediumReviews) return "medium";
  return "low";
}

function estimateDirectBookingReadiness(input: IcpAlignmentInput): DirectBookingReadiness {
  const { bookingFlowStrength, hasOwnWebsite, channels } = input;
  if (!Number.isFinite(bookingFlowStrength)) return "unknown";
  const hasDirect = channels.includes("Direct");
  const adjusted = bookingFlowStrength + (hasDirect ? 10 : 0) + (hasOwnWebsite ? 5 : 0);
  if (adjusted >= 60) return "high";
  if (adjusted >= 35) return "medium";
  return "low";
}

function estimateOtaDependencyLevel(ota: number): OtaDependencyLevel {
  if (!Number.isFinite(ota)) return "unknown";
  if (ota >= 65) return "high";
  if (ota >= 35) return "medium";
  return "low";
}

function scoreMultiChannel(input: IcpAlignmentInput): number {
  const { hasInstagram, hasOwnWebsite, hasWhatsAppPath, channels, reviewsCount, daysSinceLastReview } = input;
  let score = 0;
  if (hasWhatsAppPath) score += 25;
  if (hasInstagram) score += 22;
  if (hasOwnWebsite) score += 15;
  const otaCount = channels.filter((c) => c === "Booking" || c === "Airbnb" || c === "Tatilsepeti").length;
  score += Math.min(2, otaCount) * 10;
  if (channels.includes("Direct")) score += 8;
  if (reviewsCount >= 50) score += 5;
  if (daysSinceLastReview <= 7) score += 5;
  return Math.round(clamp(score));
}

function scoreOperationalComplexity(input: IcpAlignmentInput): number {
  // How much operational demand exists — higher means more TUGOBO value.
  const { reviewsCount, daysSinceLastReview, occupancy30d, hasInstagram, hasWhatsAppPath, channels, pricePerNight } = input;
  let score = 10;
  score += Math.min(25, reviewsCount * 0.12);
  if (daysSinceLastReview <= 1) score += 15;
  else if (daysSinceLastReview <= 3) score += 12;
  else if (daysSinceLastReview <= 7) score += 8;
  else if (daysSinceLastReview <= 14) score += 4;
  if (Number.isFinite(occupancy30d)) {
    if (occupancy30d >= 0.8) score += 14;
    else if (occupancy30d >= 0.65) score += 10;
    else if (occupancy30d >= 0.5) score += 6;
  }
  if (hasInstagram) score += 10;
  if (hasWhatsAppPath) score += 10;
  const otaCount = channels.filter((c) => c === "Booking" || c === "Airbnb" || c === "Tatilsepeti").length;
  score += otaCount * 6;
  if (Number.isFinite(pricePerNight)) {
    if (pricePerNight >= 8000) score += 8;
    else if (pricePerNight >= 4000) score += 4;
  }
  return Math.round(clamp(score));
}

function scoreTugoboFit(input: IcpAlignmentInput): number {
  // Core question: "If this hotel connects Instagram and WhatsApp to TUGOBO AI tomorrow,
  // how much operational value would TUGOBO create?"
  const {
    hasInstagram,
    hasOwnWebsite,
    hasWhatsAppPath,
    reviewsCount,
    daysSinceLastReview,
    occupancy30d,
    bookingFlowStrength,
    otaDependencyLikelihood,
    socialDemandStrength,
    operationalActivity,
    channels,
    acquisitionIntelligence,
  } = input;

  let score = 10;

  // Instagram active = primary TUGOBO inbound channel
  if (hasInstagram) {
    score += 24;
    if (!hasOwnWebsite) score += 4; // Instagram-first property, even more dependent on DM management
  }

  // WhatsApp active = reservation/query channel TUGOBO can centralize
  if (hasWhatsAppPath) score += 20;

  // Both active = highest TUGOBO operational value (centralization of two live channels)
  if (hasInstagram && hasWhatsAppPath) score += 8;

  // High review volume = proxy for inbound demand volume
  const demandFromReviews = Math.min(18, reviewsCount * 0.07);
  score += demandFromReviews;

  // Recent activity = business actively receiving inquiries
  if (daysSinceLastReview <= 3) score += 8;
  else if (daysSinceLastReview <= 7) score += 5;
  else if (daysSinceLastReview <= 14) score += 2;

  // High occupancy = busy operation, more need for automation
  if (Number.isFinite(occupancy30d)) {
    if (occupancy30d >= 0.8) score += 6;
    else if (occupancy30d >= 0.65) score += 4;
  }

  // Social demand and operational activity support TUGOBO value
  score += socialDemandStrength * 0.06;
  score += operationalActivity * 0.04;

  // OTA dependency + weak booking = conversion gap TUGOBO can bridge
  if (otaDependencyLikelihood >= 65) score += 8;
  else if (otaDependencyLikelihood >= 40) score += 4;

  if (bookingFlowStrength < 40) score += 6;
  else if (bookingFlowStrength < 55) score += 3;

  // Multi-channel complexity increases centralization value
  const channelCount = channels.length;
  if (channelCount >= 3) score += 5;
  else if (channelCount >= 2) score += 3;

  if (acquisitionIntelligence?.acquisition.isAcquisitionActive) score += 5;

  // Penalties: minimal digital footprint = limited TUGOBO entry points
  if (!hasInstagram && !hasWhatsAppPath) score -= 18;
  if (reviewsCount < 5 && (!Number.isFinite(occupancy30d) || occupancy30d < 0.3)) score -= 10;
  if (reviewsCount < 10 && !hasInstagram && !hasWhatsAppPath) score -= 8;

  return Math.round(clamp(score));
}

function buildOperationalValueSummary(input: IcpAlignmentInput, tugoboFitScore: number): string {
  const { hasInstagram, hasWhatsAppPath, reviewsCount, occupancy30d, otaDependencyLikelihood, bookingFlowStrength, daysSinceLastReview, channels } = input;

  if (tugoboFitScore < 45) {
    if (!hasInstagram && !hasWhatsAppPath) {
      return "Dijital kanal sinyali yetersiz; TUGOBO operasyonel etki değeri belirsiz.";
    }
    return "Talep sinyalleri sınırlı; operasyonel etki için daha fazla dijital aktivite gerekiyor.";
  }

  const channelParts: string[] = [];
  if (hasInstagram) channelParts.push("Instagram");
  if (hasWhatsAppPath) channelParts.push("WhatsApp");
  const otaChannels = channels.filter((c) => c === "Booking" || c === "Airbnb" || c === "Tatilsepeti");
  if (otaChannels.length > 0) channelParts.push(...otaChannels.slice(0, 1));

  const highDemand = reviewsCount >= 60 || (Number.isFinite(occupancy30d) && occupancy30d >= 0.65 && daysSinceLastReview <= 7);
  const hasOtaDependency = otaDependencyLikelihood >= 60;
  const hasWeakDirect = bookingFlowStrength < 55;

  if (channelParts.length >= 2 && highDemand) {
    const channelStr = channelParts.join(", ");
    const impact = hasOtaDependency && hasWeakDirect
      ? "Taleplerin merkezileştirilmesi ve rezervasyon operasyonlarının otomasyonu ile yüksek operasyonel fayda sağlayabilir."
      : "Dijital taleplerin tek merkezden yönetilmesiyle operasyonel verimlilik ve dönüşüm artışı beklenir.";
    return `${channelStr} kanallarından yoğun talep alan işletme. ${impact}`;
  }

  const valueParts: string[] = [];
  if (hasInstagram && hasWhatsAppPath) {
    valueParts.push("Instagram ve WhatsApp kanalları aktif");
  } else if (hasInstagram) {
    valueParts.push("Instagram kanalı aktif");
  } else if (hasWhatsAppPath) {
    valueParts.push("WhatsApp üzerinden talep alınıyor");
  }
  if (highDemand) valueParts.push("yüksek talep hacmi mevcut");
  if (hasOtaDependency && hasWeakDirect) {
    valueParts.push("OTA bağımlılığı ve zayıf direkt kanal — merkezileştirme ile yüksek etki beklenir");
  } else if (hasOtaDependency) {
    valueParts.push("yüksek OTA bağımlılığı — doğrudan kanal geliştirme fırsatı var");
  } else if (bookingFlowStrength < 40) {
    valueParts.push("direkt rezervasyon akışı zayıf — otomasyon ile güçlendirilebilir");
  }

  if (valueParts.length === 0) return "Dijital varlık ve talep sinyalleri operasyonel otomasyon için uygun görünüyor.";
  return `${valueParts.join("; ")}.`;
}

export function calculateIcpAlignment(input: IcpAlignmentInput): IcpAlignmentProfile {
  const estimatedPropertySize = estimatePropertySize(input.units);
  const estimatedDemandVolume = estimateDemandVolume(input);
  const directBookingReadiness = estimateDirectBookingReadiness(input);
  const otaDependencyLevel = estimateOtaDependencyLevel(input.otaDependencyLikelihood);
  const multiChannelScore = scoreMultiChannel(input);
  const operationalComplexityScore = scoreOperationalComplexity(input);
  const tugoboFitScore = scoreTugoboFit(input);
  const operationalFit = tugoboFitScore >= 62 && (input.hasInstagram || input.hasWhatsAppPath);
  const operationalValueSummary = buildOperationalValueSummary(input, tugoboFitScore);

  return {
    estimatedPropertySize,
    estimatedDemandVolume,
    directBookingReadiness,
    otaDependencyLevel,
    multiChannelScore,
    operationalComplexityScore,
    tugoboFitScore,
    operationalFit,
    operationalValueSummary,
  };
}
