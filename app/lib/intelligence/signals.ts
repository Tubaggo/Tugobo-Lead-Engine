import { applyAcquisitionToIntelligenceScore } from "./acquisition-intelligence";
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
  | "paid_traffic_candidate"
  | "commercially_active"
  | "operationally_mature"
  | "growth_oriented"
  | "high_roi_potential";

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
  commercially_active: 8,
  operationally_mature: 6,
  growth_oriented: 7,
  high_roi_potential: 10,
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
    const commercial = e.commercialReadiness;
    if (
      commercial.commercialReadinessLevel === "high" ||
      commercial.commercialReadinessLevel === "very_high"
    ) {
      out.push("commercially_active");
      out.push("growth_oriented");
    }
    if (e.operationalActivity >= 60 && commercial.commercialReadinessScore >= 62) {
      out.push("operationally_mature");
    }
    if (
      acq.acquisition.isAcquisitionActive &&
      (acq.socialConversionGap === "medium" || acq.socialConversionGap === "high") &&
      commercial.commercialReadinessScore >= 64
    ) {
      out.push("high_roi_potential");
    }
  }

  return uniq(out);
}

const SIGNAL_COPY: Record<BusinessSignal, string> = {
  weak_digital_presence: "Sınırlı dijital varlık (site + sosyal medya)",
  active_marketing_surface: "Site veya Instagram üzerinden pazarlama yüzeyi mevcut",
  conversion_gap: "İlgi ile doğrudan rezervasyon akışı arasında olası bir kopukluk",
  reputation_risk: "Değerlendirme profili itibar yönetimine dikkat çekiyor",
  direct_contact_possible: "Doğrudan iletişim muhtemel (ör. WhatsApp uyumlu hat)",
  ota_dependency: "Güçlü OTA dağıtımı; doğrudan rezervasyon kanalı yetersiz olabilir",
  single_channel_risk: "Gelir az sayıda kanala bağımlı",
  missing_own_website: "Listede net bir sahip olunan web sitesi yok",
  instagram_presence_gap: "Bu ölçekte Instagram dönüşüm hunisinde daha fazla işlev üstlenebilir",
  review_recency_stale: "Değerlendirmeler güncel görünmüyor; misafirler daha az aktif olabilir",
  review_volume_operational_scale: "Yüksek değerlendirme hacmi — optimize edilirse operasyonel kaldıraç sağlar",
  landline_or_unclear_phone: "Telefon sabit hat veya anlık iletişim için uygun değil",
  no_listed_phone: "Listede telefon yok — hızlı iletişim güçleşiyor",
  premium_without_owned_funnel: "Yüksek günlük fiyat, zayıf sahipli site dönüşüm hunisi",
  weak_booking_cta: "Rezervasyon yönlendirmesi zayıf veya belirsiz görünüyor",
  no_booking_flow: "Net bir doğrudan rezervasyon akışı tespit edilemedi",
  external_only_booking_dependency: "Rezervasyon yolu yalnızca harici OTA yüzeylerine bağımlı görünüyor",
  weak_contact_visibility: "İletişim bilgisi zayıf (net ve hızlı bir iletişim yolu yok)",
  low_operational_activity: "Son dönemde operasyonel aktivite görece düşük görünüyor",
  social_acquisition_intent:
    "Sosyal yüzeyler talep sinyali gösterirken doğrudan rezervasyon yakalama zayıf kalıyor",
  paid_traffic_candidate:
    "Sinyaller ücretli / tanıtımlı trafiğin halihazırda devrede olabileceğine işaret ediyor",
  commercially_active: "Ticari hazırlık sinyalleri aktif büyüme duruşunu gösteriyor",
  operationally_mature: "Operasyonel ve iletişim sinyalleri ticari açıdan olgunluğa işaret ediyor",
  growth_oriented: "Profil büyüme odaklı bir karar duruşuna işaret ediyor",
  high_roi_potential: "Edinme + dönüşüm açığı yüksek ROI potansiyeli öneriyor",
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
    "high_roi_potential",
    "growth_oriented",
    "commercially_active",
    "operationally_mature",
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
    return "Misafir değerlendirmelerindeki örüntüler, talep yönetimi sürecinizi uçtan uca gözden geçirmeyi değerli kılıyor olabilir.";
  }
  if (signals.includes("social_acquisition_intent")) {
    return "Misafirler sizi sosyal kanallarda hızla keşfediyor; rezervasyon yakalama akışını sıkılaştırmak anında etki yaratabilir.";
  }
  if (signals.includes("conversion_gap")) {
    return "Misafirlerin sizi keşfettiği yer ile gerçekten rezervasyon yaptıkları yer arasında bir kopukluk olabilir — özellikle aynı gün ya da akşam saatlerindeki talepler için.";
  }
  if (signals.includes("ota_dependency")) {
    return "Platform bağımlılığı çoğunlukla doluluk düşmeden önce marj ve kontrol sorunlarına yansır — doğrudan kanal geliştirmek yaygın bir sonraki adımdır.";
  }
  if (signals.includes("weak_digital_presence")) {
    return "Zayıf dijital varlıkla talebin büyük bölümü muhtemelen platformlar veya DM üzerinden geliyor — bu yolu sıkılaştırmak hızlı kazanımlar ortaya çıkarır.";
  }
  if (signals.includes("direct_contact_possible")) {
    return "Misafirlerle doğrudan bir hattınız var — bu kanalın yönetimindeki küçük iyileştirmeler çoğunlukla hızla fark yaratır.";
  }
  return "İşletmenin dijital ve operasyonel sinyalleri, kısa bir görüşmeye değer birkaç somut optimizasyon yolu olduğunu gösteriyor.";
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
  const baseIntel = scoreIntelligence(signals);
  const enrichment = input.enrichment;
  const intelligenceScore = applyAcquisitionToIntelligenceScore(
    baseIntel,
    enrichment?.acquisitionIntelligence,
    enrichment?.operationalActivity ?? 0,
  );
  return {
    signals,
    whyThisLead: whyBullets(signals).slice(0, 8),
    heuristicOutreachAngle: pickOutreachAngle(signals),
    intelligenceScore,
  };
}
