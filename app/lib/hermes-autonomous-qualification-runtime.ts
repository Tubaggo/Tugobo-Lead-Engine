import type { HermesQualificationPolicy } from "./hermes-qualification-policy.ts";

/**
 * Hermes Autonomous Qualification Runtime (Sprint C2).
 *
 * Saf, deterministik karar katmanı: mevcut sinyalleri (verifiedOpportunityScore,
 * leadScore, icpFitScore, signal verification, ICP alignment, website
 * intelligence, enrichment freshness) TEK ve açıklanabilir bir ticari
 * qualification kararında toplar. Yeni skor HESAPLAMAZ — her okuma, mevcut
 * bir motorun zaten ürettiği alanın lookup'ıdır:
 *
 *  - skor barı: acquisition policy'nin `minVerifiedOpportunityScore`'u
 *    (deriveQualificationPolicy tek kaynaktan türetir);
 *  - "sıcak fırsat" okuması: `computeLeadLifecycleStatus`'un HOT_OPPORTUNITY
 *    kriterinin aynısı (skor ≥ 80 VEYA website doğrulanmış + rezervasyon
 *    sinyali + WhatsApp/Instagram kanalı);
 *  - iletişim yolu okuması: acquisition'ın mission-candidate gate'iyle aynı
 *    (telefon veya website), üstüne v1.3 doğrulama durumları.
 *
 * Bu modül yapısal olarak asla:
 *  - lead'i mutate edemez (girdi read-only tüketilir),
 *  - dış API çağıramaz (import yok),
 *  - mission yazamaz (registry import'u yok),
 *  - founder onayı veya gönderim izni üretemez (böyle bir alan çıktıda yok;
 *    outreach hâlâ mevcut Founder Approval → Courier → Delivery Gateway
 *    zincirinin arkasındadır).
 *
 * Kasıtlı olarak bağımsız ("@/" import'u, React, browser API yok) —
 * `node --test` altında koşar; tüm mevcut Hermes lib modülleriyle aynı kalıp.
 */

/* ── tipler ─────────────────────────────────────────────────── */

export type QualificationStatus =
  | "sales_ready"
  | "review_required"
  | "data_needed"
  | "watch"
  | "not_qualified"
  | "blocked";

export type QualificationConfidence = "high" | "medium" | "low";

export type QualificationPriority = "critical" | "high" | "medium" | "low";

export type QualificationReasonCode =
  | "strong_icp_fit"
  | "verified_opportunity"
  | "direct_contact_available"
  | "website_verified"
  | "reservation_readiness"
  | "high_digital_demand"
  | "high_ota_dependency"
  | "multi_channel_ready"
  | "marketing_active"
  | "property_scale_fit"
  | "fresh_enrichment"
  | "missing_contact_path"
  | "missing_website"
  | "stale_enrichment"
  | "low_signal_confidence"
  | "low_opportunity_score"
  | "duplicate_mission"
  | "insufficient_data"
  | "manual_review_needed"
  | "policy_blocked";

export type QualificationNextAction =
  | "prepare_outreach"
  | "founder_review"
  | "run_enrichment"
  | "verify_contact"
  | "watch"
  | "skip"
  | "blocked";

/**
 * ScoredLead'in yapısal alt kümesi — gerçek her ScoredLead bu tipi otomatik
 * karşılar (intake/explainability adapter kalıbı). `name` dışında her alan
 * opsiyoneldir; eksik sinyal karar kurallarında "veri yok" olarak okunur.
 */
export type QualificationLeadLike = {
  id?: string;
  name?: string;
  city?: string;
  phone?: string;
  website?: string;
  websiteCandidateUrl?: string;
  doNotContact?: boolean;
  whatsappInvalid?: boolean;
  leadScore?: number;
  opportunityScore?: number;
  verifiedOpportunityScore?: number;
  icpFitScore?: number;
  whatsappConfidence?: string;
  adsLikelihood?: string;
  otaDependencyLikelihood?: number;
  units?: number;
  reviewsCount?: number;
  lastEnrichedAt?: string;
  enrichmentCount?: number;
  businessOwnershipType?: string;
  signalVerification?: {
    whatsappVerification?: string;
    websiteVerification?: string;
    reservationSignal?: string;
    instagramVerification?: string;
  };
  icpAlignment?: {
    tugoboFitScore?: number;
    operationalFit?: boolean;
    estimatedPropertySize?: string;
    estimatedDemandVolume?: string;
    otaDependencyLevel?: string;
    multiChannelScore?: number;
  };
  websiteIntelligence?: {
    hasWhatsAppLink?: boolean;
    hasBookingEngine?: boolean;
    hasOtaOutboundLinks?: boolean;
  };
};

export type QualificationInput = {
  lead: QualificationLeadLike;
  /** Bu lead için zaten açık bir satış işi varsa onun id'si — duplicate blok kaynağı. */
  existingMissionId?: string | null;
  acquisitionRunId?: string | null;
  policy: HermesQualificationPolicy;
  currentTime: number;
};

export type QualificationScoreSnapshot = {
  verifiedOpportunityScore: number | null;
  leadScore: number | null;
  icpScore: number | null;
};

export type QualificationAuditEventType =
  | "hermes_qualification_requested"
  | "hermes_qualification_started"
  | "hermes_qualification_sales_ready"
  | "hermes_qualification_review_required"
  | "hermes_qualification_data_needed"
  | "hermes_qualification_watch"
  | "hermes_qualification_not_qualified"
  | "hermes_qualification_blocked"
  | "hermes_qualification_completed"
  | "hermes_qualification_failed";

export type QualificationAuditEvent = {
  type: QualificationAuditEventType;
  at: number;
  leadId: string | null;
  acquisitionRunId: string | null;
  status: QualificationStatus | null;
  reasonCodes: QualificationReasonCode[];
  eligibleForMission: boolean;
  scoreSnapshot: QualificationScoreSnapshot | null;
  /** Türkçe, founder-güvenli detay — asla ham telefon, secret veya provider verisi içermez. */
  detailTr: string;
};

export type QualificationResult = {
  id: string;
  leadId: string | null;
  acquisitionRunId: string | null;
  status: QualificationStatus;
  confidence: QualificationConfidence;
  priority: QualificationPriority;
  scoreSnapshot: QualificationScoreSnapshot;
  positiveReasons: QualificationReasonCode[];
  cautionReasons: QualificationReasonCode[];
  blockingReasons: QualificationReasonCode[];
  founderSummaryTr: string;
  hermesRecommendationTr: string;
  nextAction: QualificationNextAction;
  eligibleForMission: boolean;
  eligibleForOutreachDraft: boolean;
  requiresFounderReview: boolean;
  evaluatedAt: number;
  auditEvents: QualificationAuditEvent[];
};

/* ── founder sözlüğü ────────────────────────────────────────── */

export const QUALIFICATION_STATUS_LABELS_TR: Record<QualificationStatus, string> = {
  sales_ready: "Satışa Hazır",
  review_required: "Founder İncelemesi Gerekli",
  data_needed: "Daha Fazla Veri Gerekli",
  watch: "İzlemeye Alındı",
  not_qualified: "Şimdilik Uygun Değil",
  blocked: "İşlem Engellendi",
};

export const QUALIFICATION_CONFIDENCE_LABELS_TR: Record<QualificationConfidence, string> = {
  high: "Güven Yüksek",
  medium: "Güven Orta",
  low: "Güven Düşük",
};

export const QUALIFICATION_NEXT_ACTION_LABELS_TR: Record<QualificationNextAction, string> = {
  prepare_outreach: "Mesaj hazırlığı yapılacak — son onay founder'da.",
  founder_review: "Founder incelemesi bekleniyor.",
  run_enrichment: "Website analizi yenilenecek.",
  verify_contact: "İletişim bilgisi doğrulanacak.",
  watch: "Hermes izlemeye devam edecek.",
  skip: "Şimdilik işlem yapılmayacak.",
  blocked: "Bu işletmede şu anda işlem yapılamıyor.",
};

/** Reason code → founder-güvenli Türkçe cümle. Teknik terim içermez. */
export const QUALIFICATION_REASON_LABELS_TR: Record<QualificationReasonCode, string> = {
  strong_icp_fit: "İşletme profili hedef müşteri tanımına güçlü uyuyor",
  verified_opportunity: "Fırsat puanı satış eşiğinin üzerinde",
  direct_contact_available: "Doğrudan iletişim kanalı hazır",
  website_verified: "Web sitesi doğrulandı",
  reservation_readiness: "Rezervasyon altyapısı bulundu",
  high_digital_demand: "Dijital talep yüksek",
  high_ota_dependency: "OTA bağımlılığı yüksek — doğrudan satış ihtiyacı belirgin",
  multi_channel_ready: "Çok kanallı iletişim hazır",
  marketing_active: "Dijital reklam izi bulundu",
  property_scale_fit: "Tesis ölçeği hedefe uygun",
  fresh_enrichment: "Veriler güncel",
  missing_contact_path: "İletişim kanalı eksik",
  missing_website: "Web sitesi bulunamadı",
  stale_enrichment: "Veriler eski — yenileme gerekiyor",
  low_signal_confidence: "Sinyaller henüz yeterince doğrulanmadı",
  low_opportunity_score: "Fırsat puanı şimdilik düşük",
  duplicate_mission: "Bu işletme için zaten açık bir satış işi var",
  insufficient_data: "Değerlendirme için yeterli veri yok",
  manual_review_needed: "Bir nokta founder doğrulaması gerektiriyor",
  policy_blocked: "Çalışma kuralları şu anda işleme izin vermiyor",
};

/* ── sinyal okumaları — hepsi mevcut alan lookup'ı ──────────── */

/** Intake/acquisition ile aynı fallback zinciri. */
function opportunityScoreOf(lead: QualificationLeadLike): number | null {
  const v = lead.verifiedOpportunityScore ?? lead.opportunityScore ?? lead.leadScore;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function icpScoreOf(lead: QualificationLeadLike): number | null {
  const v = lead.icpFitScore ?? lead.icpAlignment?.tugoboFitScore;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function hasWebsite(lead: QualificationLeadLike): boolean {
  return Boolean(lead.website?.trim()) || Boolean(lead.websiteCandidateUrl?.trim());
}

function hasPhone(lead: QualificationLeadLike): boolean {
  return Boolean(lead.phone?.trim()) && lead.whatsappInvalid !== true;
}

function whatsappState(lead: QualificationLeadLike): "verified" | "likely" | "none" {
  const v = lead.signalVerification?.whatsappVerification;
  if (v === "verified") return "verified";
  if (v === "likely") return "likely";
  if (lead.whatsappConfidence === "confirmed") return "verified";
  if (lead.whatsappConfidence === "likely" || lead.websiteIntelligence?.hasWhatsAppLink === true) {
    return "likely";
  }
  return "none";
}

/** Acquisition'ın mission-candidate gate'iyle aynı taban: telefon veya website; üstüne WhatsApp sinyali. */
function hasContactPath(lead: QualificationLeadLike): boolean {
  return hasPhone(lead) || whatsappState(lead) !== "none" || hasWebsite(lead);
}

/** Outreach taslağına güvenilir kanal: telefon ya da doğrulanmış/olası WhatsApp. Yalnız website yetmez. */
function hasTrustedContactChannel(lead: QualificationLeadLike): boolean {
  return hasPhone(lead) || whatsappState(lead) !== "none";
}

function websiteVerified(lead: QualificationLeadLike): boolean {
  const v = lead.signalVerification?.websiteVerification;
  return v === "verified" || v === "reachable";
}

function reservationReady(lead: QualificationLeadLike): boolean {
  const r = lead.signalVerification?.reservationSignal;
  return r === "verified" || r === "detected" || lead.websiteIntelligence?.hasBookingEngine === true;
}

function highDigitalDemand(lead: QualificationLeadLike): boolean {
  return (
    lead.icpAlignment?.estimatedDemandVolume === "high" || (lead.reviewsCount ?? 0) >= 100
  );
}

function highOtaDependency(lead: QualificationLeadLike): boolean {
  return (
    lead.icpAlignment?.otaDependencyLevel === "high" ||
    (lead.otaDependencyLikelihood ?? 0) >= 60 ||
    lead.websiteIntelligence?.hasOtaOutboundLinks === true
  );
}

function multiChannelReady(lead: QualificationLeadLike): boolean {
  return (lead.icpAlignment?.multiChannelScore ?? 0) >= 60;
}

function marketingActive(lead: QualificationLeadLike): boolean {
  return lead.adsLikelihood === "confirmed" || lead.adsLikelihood === "likely";
}

function propertyScaleFit(lead: QualificationLeadLike): boolean {
  const size = lead.icpAlignment?.estimatedPropertySize;
  return size === "medium" || size === "large" || (lead.units ?? 0) >= 10;
}

/** ICP uyumu güçlü mü — mevcut icpFitScore/operationalFit okuması, yeni model değil. */
function strongIcpFit(lead: QualificationLeadLike): boolean {
  const icp = icpScoreOf(lead);
  if (lead.icpAlignment?.operationalFit === true) return true;
  return icp !== null && icp >= 62; // icp-alignment.ts'in kendi operationalFit barı
}

function weakIcpFit(lead: QualificationLeadLike): boolean {
  const icp = icpScoreOf(lead);
  return icp !== null && icp < 35;
}

type EnrichmentFreshness = "fresh" | "stale" | "missing";

/**
 * Enrichment kanıtı: lifecycle motorunun ENRICHED okumasıyla aynı alanlar
 * (lastEnrichedAt, enrichmentCount, signalVerification). Tarih varsa yaşına
 * bakılır; tarih yoksa kanıt yeterlidir (bayat sayılmaz) — yalnız hiç kanıt
 * yoksa "missing".
 */
function enrichmentFreshness(
  lead: QualificationLeadLike,
  policy: HermesQualificationPolicy,
  now: number,
): EnrichmentFreshness {
  const hasEvidence =
    typeof lead.lastEnrichedAt === "string" ||
    (typeof lead.enrichmentCount === "number" && lead.enrichmentCount > 0) ||
    lead.signalVerification != null ||
    lead.websiteIntelligence != null;
  if (!hasEvidence) return "missing";
  if (typeof lead.lastEnrichedAt === "string") {
    const at = Date.parse(lead.lastEnrichedAt);
    if (Number.isFinite(at)) {
      const ageHours = (now - at) / (60 * 60 * 1000);
      if (ageHours > policy.maxEnrichmentAgeHours) return "stale";
    }
  }
  return "fresh";
}

/** Doğrulanmış tek bir sinyal bile yoksa güven düşer. */
function hasAnyVerifiedSignal(lead: QualificationLeadLike): boolean {
  const v = lead.signalVerification;
  if (!v) return false;
  return (
    v.whatsappVerification === "verified" ||
    v.websiteVerification === "verified" ||
    v.reservationSignal === "verified" ||
    v.instagramVerification === "verified"
  );
}

/**
 * `computeLeadLifecycleStatus`'un HOT_OPPORTUNITY kanal kriterinin aynısı —
 * kopya kural değil, aynı okumanın qualification tarafındaki tüketimi.
 */
function channelHot(lead: QualificationLeadLike): boolean {
  const v = lead.signalVerification;
  if (!v) return false;
  return (
    v.websiteVerification === "verified" &&
    (v.reservationSignal === "verified" || v.reservationSignal === "detected") &&
    (v.whatsappVerification === "verified" ||
      v.whatsappVerification === "likely" ||
      v.instagramVerification === "verified" ||
      v.instagramVerification === "likely")
  );
}

/* ── nedenler ───────────────────────────────────────────────── */

export type QualificationReasons = {
  positive: QualificationReasonCode[];
  caution: QualificationReasonCode[];
  blocking: QualificationReasonCode[];
};

export function deriveQualificationReasons(input: QualificationInput): QualificationReasons {
  const { lead, policy } = input;
  const positive: QualificationReasonCode[] = [];
  const caution: QualificationReasonCode[] = [];
  const blocking: QualificationReasonCode[] = [];

  const score = opportunityScoreOf(lead);
  const freshness = enrichmentFreshness(lead, policy, input.currentTime);

  /* blokaj nedenleri */
  if (!policy.enabled) blocking.push("policy_blocked");
  if (!lead.id?.trim() || !lead.name?.trim()) blocking.push("insufficient_data");
  if (lead.doNotContact === true) blocking.push("policy_blocked");
  if (policy.blockDuplicateMission && input.existingMissionId) blocking.push("duplicate_mission");

  /* olumlu sinyaller */
  if (strongIcpFit(lead)) positive.push("strong_icp_fit");
  if (score !== null && score >= policy.minVerifiedOpportunityScore) {
    positive.push("verified_opportunity");
  }
  if (hasTrustedContactChannel(lead)) positive.push("direct_contact_available");
  if (websiteVerified(lead)) positive.push("website_verified");
  if (reservationReady(lead)) positive.push("reservation_readiness");
  if (highDigitalDemand(lead)) positive.push("high_digital_demand");
  if (highOtaDependency(lead)) positive.push("high_ota_dependency");
  if (multiChannelReady(lead)) positive.push("multi_channel_ready");
  if (marketingActive(lead)) positive.push("marketing_active");
  if (propertyScaleFit(lead)) positive.push("property_scale_fit");
  if (freshness === "fresh" && typeof lead.lastEnrichedAt === "string") {
    positive.push("fresh_enrichment");
  }

  /* dikkat nedenleri */
  if (!hasContactPath(lead)) caution.push("missing_contact_path");
  if (!hasWebsite(lead)) caution.push("missing_website");
  if (freshness === "stale") caution.push("stale_enrichment");
  if (freshness === "missing") caution.push("insufficient_data");
  if (score === null || score < policy.minVerifiedOpportunityScore) {
    caution.push("low_opportunity_score");
  }
  if (!hasAnyVerifiedSignal(lead) && lead.signalVerification != null) {
    caution.push("low_signal_confidence");
  }
  // Skor güçlü ama kritik bir veri çelişkili → founder doğrulaması.
  const scoreStrong = score !== null && score >= policy.minVerifiedOpportunityScore;
  const chainBusiness = lead.businessOwnershipType === "chain";
  const contactConflict =
    (Boolean(lead.phone?.trim()) && lead.whatsappInvalid === true) ||
    (scoreStrong && !hasTrustedContactChannel(lead) && hasWebsite(lead));
  const websiteConflict = scoreStrong && policy.requireWebsite && !hasWebsite(lead);
  if (scoreStrong && (chainBusiness || contactConflict || websiteConflict)) {
    caution.push("manual_review_needed");
  }

  return { positive, caution, blocking };
}

/* ── durum ──────────────────────────────────────────────────── */

/** Bu barın altındaki skor, güçlü sinyal de yoksa "şimdilik uygun değil" okunur. */
const NOT_QUALIFIED_SCORE_FLOOR = 40;

export function deriveQualificationStatus(input: QualificationInput): QualificationStatus {
  const { lead, policy } = input;
  const reasons = deriveQualificationReasons(input);
  if (reasons.blocking.length > 0) return "blocked";

  const score = opportunityScoreOf(lead);
  const freshness = enrichmentFreshness(lead, policy, input.currentTime);
  const scoreStrong = score !== null && score >= policy.minVerifiedOpportunityScore;
  const leadScoreOk =
    policy.minLeadScore === null ||
    (typeof lead.leadScore === "number" && lead.leadScore >= policy.minLeadScore);

  /* NOT_QUALIFIED: skor açıkça düşük ve potansiyel sinyali yok */
  const clearlyLow =
    score !== null &&
    score < NOT_QUALIFIED_SCORE_FLOOR &&
    !channelHot(lead) &&
    !highOtaDependency(lead) &&
    !reservationReady(lead);
  if (clearlyLow || (weakIcpFit(lead) && !scoreStrong)) return "not_qualified";

  /* DATA_NEEDED: enrichment eksik/bayat ya da iletişim yolu hiç yok ama potansiyel var */
  if (freshness === "missing") return "data_needed";
  if (policy.requireFreshEnrichment && freshness === "stale") return "data_needed";
  if (!hasContactPath(lead)) {
    // Hiç kanal yoksa: potansiyel varsa veri bekle, yoksa uygun değil.
    return scoreStrong || score === null || score >= NOT_QUALIFIED_SCORE_FLOOR
      ? "data_needed"
      : "not_qualified";
  }

  /* REVIEW_REQUIRED: skor güçlü ama kritik bir çelişki founder kararı istiyor */
  if (reasons.caution.includes("manual_review_needed")) {
    return policy.allowManualReview ? "review_required" : "watch";
  }

  /* SALES_READY: tüm zorunlu koşullar */
  const websiteOk = !policy.requireWebsite || hasWebsite(lead);
  const contactOk = !policy.requireContactPath || hasTrustedContactChannel(lead);
  if (scoreStrong && leadScoreOk && websiteOk && contactOk && strongIcpFit(lead)) {
    return "sales_ready";
  }
  // Güçlü eşdeğer: HOT_OPPORTUNITY kanal kriteri skor barını telafi eder.
  if (channelHot(lead) && websiteOk && contactOk && !weakIcpFit(lead)) {
    return "sales_ready";
  }
  // Skor güçlü ama ICP uyumu belirsiz → founder baksın (izin yoksa izle).
  if (scoreStrong && leadScoreOk && websiteOk && contactOk) {
    return policy.allowManualReview ? "review_required" : "watch";
  }

  return "watch";
}

/* ── güven / öncelik / aksiyon ──────────────────────────────── */

export function deriveQualificationConfidence(input: QualificationInput): QualificationConfidence {
  const { lead } = input;
  const freshness = enrichmentFreshness(lead, input.policy, input.currentTime);
  if (freshness === "missing") return "low";
  const verifiedCount = [
    lead.signalVerification?.whatsappVerification === "verified",
    websiteVerified(lead),
    lead.signalVerification?.reservationSignal === "verified",
    lead.signalVerification?.instagramVerification === "verified",
  ].filter(Boolean).length;
  const hasScore = typeof lead.verifiedOpportunityScore === "number";
  if (hasScore && verifiedCount >= 2 && freshness === "fresh") return "high";
  if (hasScore || verifiedCount >= 1) return "medium";
  return "low";
}

export function deriveQualificationPriority(input: QualificationInput): QualificationPriority {
  const status = deriveQualificationStatus(input);
  const score = opportunityScoreOf(input.lead) ?? 0;
  switch (status) {
    case "sales_ready":
      // Lifecycle'ın HOT barı (80) veya kanal sıcaklığı → kritik öncelik.
      return score >= 80 || channelHot(input.lead) ? "critical" : "high";
    case "review_required":
      return "high";
    case "data_needed":
      return score >= input.policy.minVerifiedOpportunityScore ? "high" : "medium";
    case "watch":
      return "medium";
    case "not_qualified":
    case "blocked":
      return "low";
  }
}

export function deriveQualificationNextAction(input: QualificationInput): QualificationNextAction {
  const status = deriveQualificationStatus(input);
  switch (status) {
    case "sales_ready":
      return "prepare_outreach";
    case "review_required":
      return "founder_review";
    case "data_needed": {
      const freshness = enrichmentFreshness(input.lead, input.policy, input.currentTime);
      // İletişim yolu hiç yoksa önce onu doğrula; aksi halde veriyi tazele.
      return !hasContactPath(input.lead) && freshness !== "missing"
        ? "verify_contact"
        : "run_enrichment";
    }
    case "watch":
      return "watch";
    case "not_qualified":
      return "skip";
    case "blocked":
      return "blocked";
  }
}

/* ── founder copy ───────────────────────────────────────────── */

function founderSummaryFor(
  status: QualificationStatus,
  lead: QualificationLeadLike,
): string {
  const name = lead.name?.trim() || "Bu işletme";
  switch (status) {
    case "sales_ready":
      return `Hermes ${name} işletmesini satışa hazır gördü.`;
    case "review_required":
      return `Hermes ${name} işletmesinde güçlü fırsat sinyalleri buldu ancak bir nokta doğrulama gerektiriyor.`;
    case "data_needed":
      return `Hermes ${name} işletmesi için daha fazla veri bekliyor.`;
    case "watch":
      return `Hermes ${name} işletmesini izlemeye aldı.`;
    case "not_qualified":
      return `Hermes ${name} işletmesini şimdilik satışa uygun görmedi.`;
    case "blocked":
      return `${name} işletmesinde şu anda işlem yapılamıyor.`;
  }
}

function hermesRecommendationFor(
  status: QualificationStatus,
  nextAction: QualificationNextAction,
  lead: QualificationLeadLike,
): string {
  switch (status) {
    case "sales_ready":
      return hasTrustedContactChannel(lead)
        ? "Mesaj hazırlamaya uygun — taslak hazırlanınca onay sana gelecek."
        : "Satış hazırlığı başlatılabilir — iletişim kanalı önce doğrulanacak.";
    case "review_required":
      return "Hermes önce senin incelemeni istiyor — karar sana ait.";
    case "data_needed":
      return nextAction === "verify_contact"
        ? "Hermes önce iletişim bilgisini doğrulamak istiyor."
        : "Hermes önce verileri tazelemek istiyor.";
    case "watch":
      return "Hermes yeni sinyaller geldikçe değerlendirmeyi güncelleyecek.";
    case "not_qualified":
      return "Hermes bu işletmeyi daha sonra tekrar değerlendirecek.";
    case "blocked":
      return "Hermes bu işletmeyi güvenli nedenlerle beklemeye aldı.";
  }
}

/* ── audit ──────────────────────────────────────────────────── */

const STATUS_AUDIT_TYPE: Record<QualificationStatus, QualificationAuditEventType> = {
  sales_ready: "hermes_qualification_sales_ready",
  review_required: "hermes_qualification_review_required",
  data_needed: "hermes_qualification_data_needed",
  watch: "hermes_qualification_watch",
  not_qualified: "hermes_qualification_not_qualified",
  blocked: "hermes_qualification_blocked",
};

export type BuildQualificationAuditEventInput = {
  type: QualificationAuditEventType;
  at: number;
  leadId?: string | null;
  acquisitionRunId?: string | null;
  status?: QualificationStatus | null;
  reasonCodes?: QualificationReasonCode[];
  eligibleForMission?: boolean;
  scoreSnapshot?: QualificationScoreSnapshot | null;
  detailTr: string;
};

/**
 * Qualification audit event'lerinin tek kurucusu — acquisition'ın scrubber
 * kalıbının aynısı: token/secret görünümlü her şey son savunma hattı olarak
 * temizlenir (çağıranlar zaten asla geçirmez).
 */
export function buildQualificationAuditEvent(
  input: BuildQualificationAuditEventInput,
): QualificationAuditEvent {
  const scrubbed = input.detailTr
    .replace(/Bearer\s+\S+/gi, "Bearer [gizli]")
    .replace(/(key|token|secret)=\S+/gi, "$1=[gizli]")
    .replace(/\+?\d[\d\s\-()]{8,}\d/g, "[numara gizli]");
  return {
    type: input.type,
    at: input.at,
    leadId: input.leadId ?? null,
    acquisitionRunId: input.acquisitionRunId ?? null,
    status: input.status ?? null,
    reasonCodes: [...(input.reasonCodes ?? [])],
    eligibleForMission: input.eligibleForMission ?? false,
    scoreSnapshot: input.scoreSnapshot ?? null,
    detailTr: scrubbed,
  };
}

/* ── ana değerlendirme ──────────────────────────────────────── */

export function evaluateHermesQualification(input: QualificationInput): QualificationResult {
  const { lead, policy } = input;
  const now = input.currentTime;
  const leadId = lead.id?.trim() || null;
  const runId = input.acquisitionRunId ?? null;

  const scoreSnapshot: QualificationScoreSnapshot = {
    verifiedOpportunityScore:
      typeof lead.verifiedOpportunityScore === "number" ? lead.verifiedOpportunityScore : null,
    leadScore: typeof lead.leadScore === "number" ? lead.leadScore : null,
    icpScore: icpScoreOf(lead),
  };

  const status = deriveQualificationStatus(input);
  const confidence = deriveQualificationConfidence(input);
  const priority = deriveQualificationPriority(input);
  const nextAction = deriveQualificationNextAction(input);
  const reasons = deriveQualificationReasons(input);

  /* Sert eligibility koruması (Scope 3): yalnız sales_ready + tüm guard'lar. */
  const score = opportunityScoreOf(lead);
  const eligibleForMission =
    status === "sales_ready" &&
    leadId !== null &&
    !(policy.blockDuplicateMission && input.existingMissionId) &&
    hasContactPath(lead) &&
    score !== null &&
    (score >= policy.minVerifiedOpportunityScore || channelHot(lead)) &&
    policy.enabled;

  const eligibleForOutreachDraft = eligibleForMission && hasTrustedContactChannel(lead);
  const requiresFounderReview = status === "review_required";

  const founderSummaryTr = founderSummaryFor(status, lead);
  const hermesRecommendationTr = hermesRecommendationFor(status, nextAction, lead);

  const auditBase = {
    leadId,
    acquisitionRunId: runId,
    scoreSnapshot,
  };
  const auditEvents: QualificationAuditEvent[] = [
    buildQualificationAuditEvent({
      ...auditBase,
      type: "hermes_qualification_started",
      at: now,
      detailTr: `Değerlendirme başladı: ${lead.name?.trim() || "isimsiz işletme"}.`,
    }),
    buildQualificationAuditEvent({
      ...auditBase,
      type: STATUS_AUDIT_TYPE[status],
      at: now,
      status,
      reasonCodes: [...reasons.positive, ...reasons.caution, ...reasons.blocking],
      eligibleForMission,
      detailTr: founderSummaryTr,
    }),
    buildQualificationAuditEvent({
      ...auditBase,
      type: "hermes_qualification_completed",
      at: now,
      status,
      eligibleForMission,
      detailTr: `Değerlendirme tamamlandı: ${QUALIFICATION_STATUS_LABELS_TR[status]}.`,
    }),
  ];

  return {
    id: `qualification:${leadId ?? "unknown"}:${now}`,
    leadId,
    acquisitionRunId: runId,
    status,
    confidence,
    priority,
    scoreSnapshot,
    positiveReasons: reasons.positive,
    cautionReasons: reasons.caution,
    blockingReasons: reasons.blocking,
    founderSummaryTr,
    hermesRecommendationTr,
    nextAction,
    eligibleForMission,
    eligibleForOutreachDraft,
    requiresFounderReview,
    evaluatedAt: now,
    auditEvents,
  };
}

/* ── özet + sıralama ────────────────────────────────────────── */

export type QualificationSummary = {
  total: number;
  salesReady: number;
  reviewRequired: number;
  dataNeeded: number;
  watch: number;
  notQualified: number;
  blocked: number;
  eligibleForMission: number;
  eligibleForOutreachDraft: number;
};

export function summarizeQualificationResults(
  items: QualificationResult[],
): QualificationSummary {
  const byStatus = (s: QualificationStatus) => items.filter((i) => i.status === s).length;
  return {
    total: items.length,
    salesReady: byStatus("sales_ready"),
    reviewRequired: byStatus("review_required"),
    dataNeeded: byStatus("data_needed"),
    watch: byStatus("watch"),
    notQualified: byStatus("not_qualified"),
    blocked: byStatus("blocked"),
    eligibleForMission: items.filter((i) => i.eligibleForMission).length,
    eligibleForOutreachDraft: items.filter((i) => i.eligibleForOutreachDraft).length,
  };
}

const STATUS_SORT_WEIGHT: Record<QualificationStatus, number> = {
  sales_ready: 0,
  review_required: 1,
  data_needed: 2,
  watch: 3,
  not_qualified: 4,
  blocked: 5,
};

const PRIORITY_SORT_WEIGHT: Record<QualificationPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Deterministik: durum → öncelik → skor (desc) → leadId. Girdi mutate edilmez. */
export function sortQualificationResults(items: QualificationResult[]): QualificationResult[] {
  return [...items].sort((a, b) => {
    const s = STATUS_SORT_WEIGHT[a.status] - STATUS_SORT_WEIGHT[b.status];
    if (s !== 0) return s;
    const p = PRIORITY_SORT_WEIGHT[a.priority] - PRIORITY_SORT_WEIGHT[b.priority];
    if (p !== 0) return p;
    const scoreA = a.scoreSnapshot.verifiedOpportunityScore ?? a.scoreSnapshot.leadScore ?? 0;
    const scoreB = b.scoreSnapshot.verifiedOpportunityScore ?? b.scoreSnapshot.leadScore ?? 0;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return (a.leadId ?? "").localeCompare(b.leadId ?? "");
  });
}

/* ── founder preview (Scope 7) ──────────────────────────────── */

export type QualificationPreviewItem = {
  businessName: string;
  statusLabelTr: string;
  confidenceLabelTr: string;
  /** "Fırsat Puanı 91" — skor yoksa null; asla formül veya iç enum değil. */
  scoreLabel: string | null;
  positiveReasonsTr: string[];
  cautionReasonsTr: string[];
  hermesRecommendationTr: string;
  nextActionLabelTr: string;
  eligibleForMission: boolean;
  eligibleForOutreachDraft: boolean;
};

export type QualificationPreview = {
  items: QualificationPreviewItem[];
  summary: QualificationSummary;
};

const PREVIEW_MAX_SALES_READY = 5;
const PREVIEW_MAX_REVIEW_REQUIRED = 3;
const PREVIEW_MAX_REASONS = 5;

function toPreviewItem(result: QualificationResult, businessName: string): QualificationPreviewItem {
  const score = result.scoreSnapshot.verifiedOpportunityScore ?? result.scoreSnapshot.leadScore;
  return {
    businessName,
    statusLabelTr: QUALIFICATION_STATUS_LABELS_TR[result.status],
    confidenceLabelTr: QUALIFICATION_CONFIDENCE_LABELS_TR[result.confidence],
    scoreLabel: typeof score === "number" ? `Fırsat Puanı ${Math.round(score)}` : null,
    positiveReasonsTr: result.positiveReasons
      .slice(0, PREVIEW_MAX_REASONS)
      .map((c) => QUALIFICATION_REASON_LABELS_TR[c]),
    cautionReasonsTr: result.cautionReasons
      .slice(0, PREVIEW_MAX_REASONS)
      .map((c) => QUALIFICATION_REASON_LABELS_TR[c]),
    hermesRecommendationTr: result.hermesRecommendationTr,
    nextActionLabelTr: QUALIFICATION_NEXT_ACTION_LABELS_TR[result.nextAction],
    eligibleForMission: result.eligibleForMission,
    eligibleForOutreachDraft: result.eligibleForOutreachDraft,
  };
}

/**
 * Founder-facing dry-run/status önizlemesi: ilk 5 sales_ready + ilk 3
 * review_required kart, kalan durumlar yalnız özet sayaçlarda. Ham telefon,
 * iç id veya ham enum asla çıkmaz — isimler çağıran tarafından verilen
 * görünen adlardır.
 */
export function buildQualificationPreview(
  results: { result: QualificationResult; businessName: string }[],
): QualificationPreview {
  const sorted = sortQualificationResults(results.map((r) => r.result));
  const nameById = new Map(
    results.map((r) => [r.result.id, r.businessName?.trim() || "İsimsiz işletme"]),
  );
  const salesReady = sorted
    .filter((r) => r.status === "sales_ready")
    .slice(0, PREVIEW_MAX_SALES_READY);
  const reviewRequired = sorted
    .filter((r) => r.status === "review_required")
    .slice(0, PREVIEW_MAX_REVIEW_REQUIRED);
  return {
    items: [...salesReady, ...reviewRequired].map((r) =>
      toPreviewItem(r, nameById.get(r.id) ?? "İsimsiz işletme"),
    ),
    summary: summarizeQualificationResults(sorted),
  };
}
