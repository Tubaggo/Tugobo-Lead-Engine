/**
 * Hermes Qualification Founder adapter (Sprint C2 — Scope 9).
 *
 * Saf sunum katmanı projeksiyonu: `/api/hermes/qualification` payload'ını
 * "Hermes Satışa Hazır Fırsatlar" bölümünün founder copy'sine çevirir.
 * Hiçbir şey hesaplamaz — her satır, qualification çalışma katmanının zaten
 * ürettiği Türkçe cümlelerin/etiketlerin seçimi ve sıralamasıdır.
 *
 * Founder-language sözleşmesi: teknik kelime yok (release-audit
 * `findForbiddenFounderTerm` ile doğrular), ham enum yok, iç skor formülü
 * yok, ham telefon yok. Founder yalnız şunları okur: Satışa Hazır /
 * İnceleme Gerekiyor / Daha Fazla Veri Gerekiyor / İzleniyor.
 *
 * Kasıtlı olarak bağımsız (no "@/", no React, no browser API) —
 * `node --test` altında koşar; her v8 adapter'ının izlediği kalıp.
 */

/** API payload'ının yapısal alt kümesi — yalnız founder görünümünün okuduğu alanlar. */
export type QualificationApiResultLike = {
  leadId: string | null;
  businessName: string;
  status: string;
  statusLabelTr: string;
  confidenceLabelTr?: string;
  scoreSnapshot?: {
    verifiedOpportunityScore: number | null;
    leadScore: number | null;
    icpScore: number | null;
  };
  positiveReasonsTr?: string[];
  cautionReasonsTr?: string[];
  founderSummaryTr?: string;
  hermesRecommendationTr?: string;
  nextActionLabelTr?: string;
  eligibleForOutreachDraft?: boolean;
  requiresFounderReview?: boolean;
};

export type QualificationApiSummaryLike = {
  total: number;
  salesReady: number;
  reviewRequired: number;
  dataNeeded: number;
  watch: number;
  notQualified: number;
  blocked: number;
};

export type QualificationFounderCard = {
  leadId: string | null;
  title: string;
  /** "Satışa Hazır" | "Founder İncelemesi Gerekli" — çalışma katmanının kendi etiketi. */
  statusLabelTr: string;
  /** "Fırsat Puanı 91" — skor yoksa null. */
  scoreLabel: string | null;
  /** Hermes'in neden hazır gördüğü — founder cümleleri. */
  whyReadyTr: string[];
  /** Varsa dikkat edilmesi gereken tek nokta. */
  attentionTr: string | null;
  /** Önerilen sonraki adım. */
  nextStepTr: string;
  /** "Mesaj Hazırlamaya Uygun" | "Founder İncelemesi Gerekli" rozeti. */
  draftBadgeTr: string;
  isSalesReady: boolean;
};

export type HermesQualificationFounderView = {
  mode: "loading" | "error" | "empty" | "ready";
  counters: {
    salesReady: number;
    reviewRequired: number;
    dataNeeded: number;
    watch: number;
  };
  cards: QualificationFounderCard[];
};

export const HERMES_QUALIFICATION_FOUNDER_LABELS = {
  sectionTitle: "Hermes Satışa Hazır Fırsatlar",
  sectionSubtitle: "Hermes'in ticari değerlendirmesi — hangi işletme satışa hazır, hangisi neyi bekliyor.",
  counterSalesReady: "Satışa Hazır",
  counterReviewRequired: "İnceleme Gerekiyor",
  counterDataNeeded: "Daha Fazla Veri Gerekiyor",
  counterWatch: "İzleniyor",
  whyReady: "Hermes neden hazır gördü",
  attention: "Dikkat",
  nextStep: "Sonraki adım",
  draftEligible: "Mesaj Hazırlamaya Uygun",
  reviewNeeded: "Founder İncelemesi Gerekli",
  loading: "Hermes satış hazırlığını değerlendiriyor...",
  error: "Satış hazırlığı bilgileri şu anda yüklenemedi.",
  retry: "Tekrar Dene",
  emptyTitle: "Henüz satışa hazır yeni fırsat yok.",
  emptySubtitle: "Hermes yeni işletmeleri değerlendirdikçe sonuçlar burada görünecek.",
  scorePrefix: "Fırsat Puanı",
} as const;

const MAX_SALES_READY_CARDS = 5;
const MAX_REVIEW_CARDS = 3;

function toCard(item: QualificationApiResultLike): QualificationFounderCard {
  const isSalesReady = item.status === "sales_ready";
  const score =
    item.scoreSnapshot?.verifiedOpportunityScore ?? item.scoreSnapshot?.leadScore ?? null;
  return {
    leadId: item.leadId,
    title: item.businessName?.trim() || "İsimsiz işletme",
    statusLabelTr: item.statusLabelTr,
    scoreLabel:
      typeof score === "number"
        ? `${HERMES_QUALIFICATION_FOUNDER_LABELS.scorePrefix} ${Math.round(score)}`
        : null,
    whyReadyTr: (item.positiveReasonsTr ?? []).slice(0, 5),
    attentionTr: (item.cautionReasonsTr ?? [])[0] ?? null,
    nextStepTr:
      item.nextActionLabelTr?.trim() ||
      item.hermesRecommendationTr?.trim() ||
      "Hermes değerlendirmeye devam ediyor.",
    draftBadgeTr:
      isSalesReady && item.eligibleForOutreachDraft === true
        ? HERMES_QUALIFICATION_FOUNDER_LABELS.draftEligible
        : HERMES_QUALIFICATION_FOUNDER_LABELS.reviewNeeded,
    isSalesReady,
  };
}

export type ComputeQualificationFounderViewInput = {
  results: QualificationApiResultLike[] | null;
  summary: QualificationApiSummaryLike | null;
  fetchState: "loading" | "ready" | "error";
};

export function computeQualificationFounderView(
  input: ComputeQualificationFounderViewInput,
): HermesQualificationFounderView {
  const results = input.results ?? [];
  const summary = input.summary;

  const counters = {
    salesReady: summary?.salesReady ?? results.filter((r) => r.status === "sales_ready").length,
    reviewRequired:
      summary?.reviewRequired ?? results.filter((r) => r.status === "review_required").length,
    dataNeeded: summary?.dataNeeded ?? results.filter((r) => r.status === "data_needed").length,
    watch: summary?.watch ?? results.filter((r) => r.status === "watch").length,
  };

  const salesReadyCards = results
    .filter((r) => r.status === "sales_ready")
    .slice(0, MAX_SALES_READY_CARDS)
    .map(toCard);
  const reviewCards = results
    .filter((r) => r.status === "review_required")
    .slice(0, MAX_REVIEW_CARDS)
    .map(toCard);
  const cards = [...salesReadyCards, ...reviewCards];

  // Kartlar her zaman kazanır — gerçek veri varken loading/error gösterilmez.
  if (cards.length > 0 || counters.salesReady + counters.reviewRequired + counters.dataNeeded + counters.watch > 0) {
    return { mode: "ready", counters, cards };
  }
  if (input.fetchState === "loading") return { mode: "loading", counters, cards: [] };
  if (input.fetchState === "error") return { mode: "error", counters, cards: [] };
  return { mode: "empty", counters, cards: [] };
}

/** Karar Merkezi'ne yalnız GERÇEK founder incelemesi gerektiren sonuçlar gider (Scope 10). */
export function selectQualificationReviewItems(
  results: QualificationApiResultLike[] | null,
): QualificationApiResultLike[] {
  return (results ?? []).filter((r) => r.status === "review_required" && r.requiresFounderReview === true);
}
