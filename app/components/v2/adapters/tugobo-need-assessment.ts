/**
 * TUGOBO Need Assessment adapter (TUGOBO Need-Based Acquisition Engine).
 *
 * Answers one deterministic question from EXISTING verified signals only:
 * "Would this business get real operational value from TUGOBO AI tomorrow?"
 * — never "is it in a touristic city" and never "is it a luxury/chain/
 * boutique/budget property."
 *
 * This module computes NOTHING new from scratch. Every evidence flag below
 * is a read of a field an existing engine already produced:
 *   - `signalVerification` — Signal Verification Engine v1.3
 *     (`signal-verification.ts`);
 *   - `icpAlignment` — ICP Alignment Engine (`intelligence/icp-alignment.ts`,
 *     whose own `tugoboFitScore`/`operationalValueSummary` already answer a
 *     near-identical question — this adapter reuses its
 *     `directBookingReadiness`/`otaDependencyLevel`/`multiChannelScore`/
 *     `operationalComplexityScore` outputs rather than recompute them);
 *   - `verifiedOpportunityScore` — Verified Opportunity Score v1.4
 *     (`opportunity-scoring.ts`);
 *   - `websiteIntelligence`, `reviewsCount`, `businessOwnershipType`,
 *     `hasInstagram`, `otaDependencyLikelihood` — existing enrichment/lead
 *     fields.
 *
 * Deliberately excluded from the input type on purpose (not merely unused):
 * city, region, star rating, segment/tier, chain/independent label alone,
 * price. A field that isn't in `TugoboNeedLeadLike` structurally cannot
 * influence `score` — geography and segment are sourcing/display context
 * only, never a scoring input.
 *
 * Missing evidence is never read as negative evidence: an `undefined` field
 * is skipped and listed in `missingEvidence`; only an explicitly-checked
 * and explicitly-negative state (`"not_found"`, `false` after a real check)
 * counts toward a low score. When too little was ever checked to judge
 * either way, `level` is `"insufficient_evidence"` — never elided, never
 * treated as a rejection.
 *
 * Deliberately dependency-free (no "@/" imports, no React, no browser API)
 * so it runs under plain `node --test` — the same convention every v8
 * adapter in this codebase follows.
 */

export type TugoboNeedLevel = "high" | "medium" | "low" | "insufficient_evidence";
export type TugoboNeedConfidence = "high" | "medium" | "low";

export type TugoboNeedReasonCode =
  | "MULTI_CHANNEL_DEMAND"
  | "WHATSAPP_ACTIVE"
  | "INSTAGRAM_ACTIVE"
  | "WEBSITE_ACTIVE"
  | "BOOKING_CTA_PRESENT"
  | "DIRECT_BOOKING_GAP"
  | "OTA_DEPENDENCY"
  | "HIGH_REVIEW_VOLUME"
  | "CHAIN_COMPLEXITY"
  | "REVENUE_OPPORTUNITY"
  | "INSUFFICIENT_VERIFIED_SIGNALS";

export type TugoboNeedAssessment = {
  /** 0–100. Purely additive from verified evidence — never a city/segment input. */
  score: number;
  level: TugoboNeedLevel;
  /** How much of this assessment rests on verified (not just inferred) signals. */
  confidence: TugoboNeedConfidence;
  reasonCodes: TugoboNeedReasonCode[];
  /** Founder-facing Turkish sentences, one per reason code, same order. */
  reasonsTr: string[];
  /** Granular factual observations that back the reasons (for an evidence panel). */
  evidence: string[];
  /** What was never checked/verified — read as "unknown", never as "no." */
  missingEvidence: string[];
};

/**
 * Structural subset of `ScoredLead` this module reads — any real ScoredLead
 * satisfies it automatically (the `hermes-acquisition-explainability-adapter`
 * convention). Deliberately has NO `city`, `region`, star/segment/tier, or
 * price field — see the module doc for why that's load-bearing, not an
 * oversight.
 */
export type TugoboNeedLeadLike = {
  name: string;
  website?: string;
  websiteCandidateUrl?: string;
  hasInstagram?: boolean;
  reviewsCount?: number;
  verifiedOpportunityScore?: number;
  businessOwnershipType?: "independent" | "chain" | "unknown";
  otaDependencyLikelihood?: number;
  signalVerification?: {
    whatsappVerification?: string;
    websiteVerification?: string;
    reservationSignal?: string;
    instagramVerification?: string;
  };
  websiteIntelligence?: {
    hasWhatsAppLink?: boolean;
    hasBookingEngine?: boolean;
    hasOtaOutboundLinks?: boolean;
  };
  icpAlignment?: {
    multiChannelScore?: number;
    operationalComplexityScore?: number;
    directBookingReadiness?: string;
    otaDependencyLevel?: string;
  };
};

const clamp100 = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

type Signal = { present: boolean; checked: boolean; verified: boolean };

function whatsappSignal(lead: TugoboNeedLeadLike): Signal {
  const v = lead.signalVerification?.whatsappVerification;
  if (v === "verified") return { present: true, checked: true, verified: true };
  if (v === "likely") return { present: true, checked: true, verified: false };
  if (v === "not_found") return { present: false, checked: true, verified: false };
  if (lead.websiteIntelligence?.hasWhatsAppLink === true) {
    return { present: true, checked: true, verified: false };
  }
  if (lead.websiteIntelligence?.hasWhatsAppLink === false) {
    return { present: false, checked: true, verified: false };
  }
  return { present: false, checked: false, verified: false };
}

function instagramSignal(lead: TugoboNeedLeadLike): Signal {
  const v = lead.signalVerification?.instagramVerification;
  if (v === "verified") return { present: true, checked: true, verified: true };
  if (v === "likely" || v === "candidate") return { present: true, checked: true, verified: false };
  if (v === "not_found") return { present: false, checked: true, verified: false };
  if (lead.hasInstagram === true) return { present: true, checked: true, verified: false };
  if (lead.hasInstagram === false) return { present: false, checked: true, verified: false };
  return { present: false, checked: false, verified: false };
}

function websiteSignal(lead: TugoboNeedLeadLike): Signal {
  const v = lead.signalVerification?.websiteVerification;
  if (v === "verified") return { present: true, checked: true, verified: true };
  if (v === "reachable") return { present: true, checked: true, verified: false };
  if (v === "broken" || v === "not_found") return { present: false, checked: true, verified: false };
  if (lead.website?.trim() || lead.websiteCandidateUrl?.trim()) {
    return { present: true, checked: true, verified: false };
  }
  return { present: false, checked: false, verified: false };
}

function bookingCtaSignal(lead: TugoboNeedLeadLike): Signal {
  const v = lead.signalVerification?.reservationSignal;
  if (v === "verified") return { present: true, checked: true, verified: true };
  if (v === "detected") return { present: true, checked: true, verified: false };
  if (v === "not_found") return { present: false, checked: true, verified: false };
  if (lead.websiteIntelligence?.hasBookingEngine === true) {
    return { present: true, checked: true, verified: false };
  }
  if (lead.websiteIntelligence?.hasBookingEngine === false) {
    return { present: false, checked: true, verified: false };
  }
  return { present: false, checked: false, verified: false };
}

function otaDependencySignal(lead: TugoboNeedLeadLike): Signal {
  const level = lead.icpAlignment?.otaDependencyLevel;
  if (level === "high") return { present: true, checked: true, verified: false };
  if (level === "low" || level === "medium") return { present: false, checked: true, verified: false };
  if (typeof lead.otaDependencyLikelihood === "number") {
    return { present: lead.otaDependencyLikelihood >= 60, checked: true, verified: false };
  }
  if (lead.websiteIntelligence?.hasOtaOutboundLinks === true) {
    return { present: true, checked: true, verified: false };
  }
  return { present: false, checked: false, verified: false };
}

function reviewVolumeSignal(lead: TugoboNeedLeadLike): Signal {
  if (typeof lead.reviewsCount !== "number") return { present: false, checked: false, verified: false };
  return { present: lead.reviewsCount >= 30, checked: true, verified: false };
}

function revenueOpportunitySignal(lead: TugoboNeedLeadLike): Signal {
  if (typeof lead.verifiedOpportunityScore !== "number") {
    return { present: false, checked: false, verified: false };
  }
  return { present: lead.verifiedOpportunityScore >= 60, checked: true, verified: false };
}

/** Informational only — never contributes score points (a chain/complex operation is not itself a need signal). */
function chainComplexitySignal(lead: TugoboNeedLeadLike): Signal {
  const checked =
    lead.businessOwnershipType !== undefined || lead.icpAlignment?.operationalComplexityScore !== undefined;
  const present =
    lead.businessOwnershipType === "chain" || (lead.icpAlignment?.operationalComplexityScore ?? 0) >= 65;
  return { present, checked, verified: false };
}

const REASON_LABELS: Record<TugoboNeedReasonCode, string> = {
  MULTI_CHANNEL_DEMAND: "Birden fazla dijital kanal (WhatsApp/Instagram/Web) birlikte aktif",
  WHATSAPP_ACTIVE: "WhatsApp üzerinden talep/rezervasyon kanalı aktif",
  INSTAGRAM_ACTIVE: "Instagram üzerinden müşteri edinimi aktif",
  WEBSITE_ACTIVE: "Web sitesi aktif",
  BOOKING_CTA_PRESENT: "Web üzerinde rezervasyon kanalı bulundu",
  DIRECT_BOOKING_GAP: "Doğrudan rezervasyon (direct booking) kanalı zayıf — fırsat var",
  OTA_DEPENDENCY: "OTA bağımlılığı yüksek görünüyor",
  HIGH_REVIEW_VOLUME: "Yüksek yorum hacmi — talep yoğunluğu proxy'si",
  CHAIN_COMPLEXITY: "Çoklu/karmaşık operasyon yapısı",
  REVENUE_OPPORTUNITY: "Mevcut doğrulanmış fırsat skoru yüksek",
  INSUFFICIENT_VERIFIED_SIGNALS: "Bu işletme için doğrulanmış dijital sinyal bulunamadı",
};

const MISSING_LABELS = {
  whatsapp: "WhatsApp durumu doğrulanmadı",
  instagram: "Instagram durumu doğrulanmadı",
  website: "Web sitesi durumu doğrulanmadı",
  bookingCta: "Web rezervasyon/CTA sinyali kontrol edilmedi",
  ota: "OTA bağımlılığı hesaplanmadı",
  reviews: "Yorum hacmi bilinmiyor",
  revenue: "Doğrulanmış fırsat skoru henüz hesaplanmadı",
} as const;

const MAX_REASONS = 6;

export function computeTugoboNeedAssessment(lead: TugoboNeedLeadLike): TugoboNeedAssessment {
  const whatsapp = whatsappSignal(lead);
  const instagram = instagramSignal(lead);
  const website = websiteSignal(lead);
  const bookingCta = bookingCtaSignal(lead);
  const ota = otaDependencySignal(lead);
  const reviews = reviewVolumeSignal(lead);
  const revenue = revenueOpportunitySignal(lead);
  const chain = chainComplexitySignal(lead);

  const checkedCount = [whatsapp, instagram, website, bookingCta, ota, reviews, revenue].filter(
    (s) => s.checked,
  ).length;

  const missingEvidence: string[] = [];
  if (!whatsapp.checked) missingEvidence.push(MISSING_LABELS.whatsapp);
  if (!instagram.checked) missingEvidence.push(MISSING_LABELS.instagram);
  if (!website.checked) missingEvidence.push(MISSING_LABELS.website);
  if (!bookingCta.checked) missingEvidence.push(MISSING_LABELS.bookingCta);
  if (!ota.checked) missingEvidence.push(MISSING_LABELS.ota);
  if (!reviews.checked) missingEvidence.push(MISSING_LABELS.reviews);
  if (!revenue.checked) missingEvidence.push(MISSING_LABELS.revenue);

  if (checkedCount <= 1) {
    return {
      score: 0,
      level: "insufficient_evidence",
      confidence: "low",
      reasonCodes: ["INSUFFICIENT_VERIFIED_SIGNALS"],
      reasonsTr: [REASON_LABELS.INSUFFICIENT_VERIFIED_SIGNALS],
      evidence: [],
      missingEvidence,
    };
  }

  const multiChannelCount = [whatsapp.present, instagram.present, website.present].filter(Boolean).length;
  const multiChannelDemand = multiChannelCount >= 2 || (lead.icpAlignment?.multiChannelScore ?? 0) >= 45;
  const directBookingGap =
    lead.icpAlignment?.directBookingReadiness === "low" || (ota.present && !bookingCta.present);

  let score = 0;
  if (whatsapp.present) score += 20;
  if (instagram.present) score += 15;
  if (website.present) score += 10;
  if (bookingCta.present) score += 15;
  if (multiChannelDemand) score += 10;
  if (ota.present) score += 10;
  if (directBookingGap) score += 10;
  if (reviews.present) score += 10;
  // Weighted higher than a single raw channel check — verifiedOpportunityScore
  // is itself already a blend of communication verification, demand, ICP fit,
  // and multi-channel signals (see opportunity-scoring.ts), so a high value
  // here is meaningful standalone evidence, not a single weak proxy.
  if (revenue.present) score += 25;
  score = clamp100(score);

  const level: TugoboNeedLevel = score >= 65 ? "high" : score >= 35 ? "medium" : "low";

  const verifiedCount = [whatsapp, instagram, website, bookingCta].filter((s) => s.verified).length;
  const hasDemandEvidence = reviews.checked || revenue.checked;
  const confidence: TugoboNeedConfidence =
    verifiedCount >= 2 && hasDemandEvidence
      ? "high"
      : verifiedCount >= 1 || checkedCount >= 4
        ? "medium"
        : "low";

  const reasonCodes: TugoboNeedReasonCode[] = [];
  if (multiChannelDemand) reasonCodes.push("MULTI_CHANNEL_DEMAND");
  if (whatsapp.present) reasonCodes.push("WHATSAPP_ACTIVE");
  if (instagram.present) reasonCodes.push("INSTAGRAM_ACTIVE");
  if (website.present) reasonCodes.push("WEBSITE_ACTIVE");
  if (bookingCta.present) reasonCodes.push("BOOKING_CTA_PRESENT");
  if (directBookingGap) reasonCodes.push("DIRECT_BOOKING_GAP");
  if (ota.present) reasonCodes.push("OTA_DEPENDENCY");
  if (reviews.present) reasonCodes.push("HIGH_REVIEW_VOLUME");
  if (chain.present) reasonCodes.push("CHAIN_COMPLEXITY");
  if (revenue.present) reasonCodes.push("REVENUE_OPPORTUNITY");

  const evidence: string[] = [];
  if (whatsapp.checked) evidence.push(`WhatsApp: ${whatsapp.present ? (whatsapp.verified ? "doğrulandı" : "muhtemel") : "bulunamadı"}`);
  if (instagram.checked) evidence.push(`Instagram: ${instagram.present ? "aktif" : "bulunamadı"}`);
  if (website.checked) evidence.push(`Web sitesi: ${website.present ? (website.verified ? "doğrulandı" : "aktif") : "bulunamadı"}`);
  if (bookingCta.checked) evidence.push(`Rezervasyon kanalı: ${bookingCta.present ? "bulundu" : "bulunamadı"}`);
  if (ota.checked) evidence.push(`OTA bağımlılığı: ${ota.present ? "yüksek" : "düşük/orta"}`);
  if (reviews.checked) evidence.push(`Yorum sayısı: ${lead.reviewsCount}`);
  if (revenue.checked) evidence.push(`Doğrulanmış fırsat skoru: ${lead.verifiedOpportunityScore}`);

  return {
    score,
    level,
    confidence,
    reasonCodes: reasonCodes.slice(0, MAX_REASONS),
    reasonsTr: reasonCodes.slice(0, MAX_REASONS).map((code) => REASON_LABELS[code]),
    evidence,
    missingEvidence,
  };
}

/**
 * One founder sentence combining the sourcing context and the real reason —
 * the exact pattern the sprint requires: geography is stated as *where*
 * this was found, never as *why* it was picked. Falls back to a neutral
 * sentence when there isn't enough evidence to name a reason yet.
 */
export function buildTugoboNeedFounderSentence(
  assessment: TugoboNeedAssessment,
  sourceCity?: string,
): string {
  const where = sourceCity ? `${sourceCity} pazarında bulundu; ancak ` : "";
  if (assessment.level === "insufficient_evidence") {
    return `${where}fırsat değerlendirmesi için yeterli doğrulanmış sinyal henüz yok.`;
  }
  if (assessment.reasonsTr.length === 0) {
    return `${where}fırsat olarak seçilmesi için yeterli dijital talep kanıtı bulunmuyor.`;
  }
  const reasonList = assessment.reasonsTr.join(", ");
  return `${where}fırsat olarak seçilmesinin temel nedeni: ${reasonList}.`;
}

/**
 * The "TUGOBO ihtiyacı:" line of the two-gate founder explanation (Strict
 * Target Market Allowlist fix, Part 4) — always the need-evidence half,
 * never geography. Paired with
 * `tugobo-target-market-eligibility.ts`'s `buildTargetMarketFounderLine`
 * (the "Pazar uygunluğu:" half) by the Working Queue adapter.
 */
export function buildTugoboNeedFounderLine(assessment: TugoboNeedAssessment): string {
  if (assessment.level === "insufficient_evidence") {
    return "TUGOBO ihtiyacı: yeterli doğrulanmış sinyal henüz yok.";
  }
  if (assessment.reasonsTr.length === 0) {
    return "TUGOBO ihtiyacı: yeterli dijital talep kanıtı bulunmuyor.";
  }
  return `TUGOBO ihtiyacı: ${assessment.reasonsTr.join(", ")} sinyalleri var.`;
}
