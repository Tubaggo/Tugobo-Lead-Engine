/**
 * Hermes Outreach Founder adapter (Sprint C3 — Autonomous Outreach).
 *
 * Saf sunum katmanı projeksiyonu: `/api/hermes/outreach` payload'ını
 * "Hermes Hazırladığı Mesajlar" bölümünün founder copy'sine çevirir.
 * Hiçbir şey hesaplamaz — her satır, outreach çalışma katmanının zaten
 * ürettiği Türkçe cümlelerin/etiketlerin seçimi ve sıralamasıdır.
 *
 * MUTLAK KURAL: bu bölümün hiçbir çıktısı mesaj GÖNDERMEZ. Founder yalnız
 * "Mesajı İncele" / "Taslağı Gör" görür — gönderim butonu yoktur; gönderim
 * mevcut Founder Approval → Courier → Delivery Gateway zincirinin
 * arkasındadır.
 *
 * Founder-language sözleşmesi: teknik kelime yok (release-audit
 * `findForbiddenFounderTerm` ile doğrular), ham enum yok, iç template metni
 * yok, ham telefon yok.
 *
 * Kasıtlı olarak bağımsız (no "@/", no React, no browser API) —
 * `node --test` altında koşar; her v8 adapter'ının izlediği kalıp.
 */

/** API payload'ının yapısal alt kümesi — yalnız founder görünümünün okuduğu alanlar. */
export type OutreachApiResultLike = {
  leadId: string | null;
  businessName: string;
  status: string;
  statusLabelTr: string;
  channelLabelTr?: string;
  templateLabelTr?: string;
  languageLabelTr?: string;
  toneLabelTr?: string;
  lengthLabelTr?: string;
  personalizationSignalsTr?: string[];
  founderSummaryTr?: string;
  hermesRecommendationTr?: string;
  nextActionLabelTr?: string;
  approvalNeeded?: boolean;
};

export type OutreachApiSummaryLike = {
  total: number;
  waiting: number;
  draftReady: number;
  approvalRequired: number;
  awaitingFounder: number;
};

export type OutreachFounderCard = {
  leadId: string | null;
  title: string;
  statusLabelTr: string;
  channelLabelTr: string;
  templateLabelTr: string;
  languageLabelTr: string;
  toneLabelTr: string;
  /** Hermes'in neden bu mesajı hazırladığı — founder cümleleri (personalization). */
  whyPreparedTr: string[];
  /** Founder'ın atacağı sonraki adım. */
  nextStepTr: string;
  /** Founder onayı gerekiyorsa true — kart "Founder Onayı Bekliyor" olarak renklenir. */
  approvalNeeded: boolean;
};

export type HermesOutreachFounderView = {
  mode: "loading" | "error" | "empty" | "ready";
  counters: {
    awaitingFounder: number;
    approvalRequired: number;
    draftReady: number;
    waiting: number;
  };
  cards: OutreachFounderCard[];
};

export const HERMES_OUTREACH_FOUNDER_LABELS = {
  sectionTitle: "Hermes Hazırladığı Mesajlar",
  sectionSubtitle:
    "Hermes satışa hazır fırsatlar için mesaj taslağı hazırladı — gönderim yalnız senin onayınla yapılır.",
  counterAwaiting: "Onayını Bekliyor",
  counterApprovalRequired: "Onay Gerekiyor",
  counterDraftReady: "Taslak Hazır",
  counterWaiting: "Hazırlanıyor",
  channel: "Kanal",
  template: "Şablon",
  language: "Dil",
  tone: "Ton",
  whyPrepared: "Hermes neden bu mesajı hazırladı",
  nextStep: "Sonraki adım",
  reviewMessage: "Mesajı İncele",
  viewDraft: "Taslağı Gör",
  noSendNote: "Bu bölümden mesaj gönderilmez — gönderim founder onayının arkasındadır.",
  loading: "Hermes mesaj hazırlığını değerlendiriyor...",
  error: "Hazırlanan mesaj bilgileri şu anda yüklenemedi.",
  retry: "Tekrar Dene",
  emptyTitle: "Henüz hazırlanmış yeni mesaj yok.",
  emptySubtitle: "Bir fırsat satışa hazır olduğunda Hermes mesaj taslağını burada hazırlayacak.",
} as const;

const MAX_CARDS = 6;
/** Yalnız founder'ın onayını bekleyen hazır mesajlar kart olur — waiting durumu sayaçta kalır. */
const CARD_STATUSES = new Set(["approval_required", "draft_ready"]);

function toCard(item: OutreachApiResultLike): OutreachFounderCard {
  return {
    leadId: item.leadId,
    title: item.businessName?.trim() || "İsimsiz işletme",
    statusLabelTr: item.statusLabelTr,
    channelLabelTr: item.channelLabelTr?.trim() || "Kanal Belirsiz",
    templateLabelTr: item.templateLabelTr?.trim() || "Genel İlk Temas",
    languageLabelTr: item.languageLabelTr?.trim() || "Türkçe",
    toneLabelTr: item.toneLabelTr?.trim() || "Danışman",
    whyPreparedTr: (item.personalizationSignalsTr ?? []).slice(0, 4),
    nextStepTr:
      item.nextActionLabelTr?.trim() ||
      item.hermesRecommendationTr?.trim() ||
      "Founder onayı bekleniyor.",
    approvalNeeded: item.approvalNeeded === true,
  };
}

export type ComputeOutreachFounderViewInput = {
  results: OutreachApiResultLike[] | null;
  summary: OutreachApiSummaryLike | null;
  fetchState: "loading" | "ready" | "error";
};

export function computeOutreachFounderView(
  input: ComputeOutreachFounderViewInput,
): HermesOutreachFounderView {
  const results = input.results ?? [];
  const summary = input.summary;

  const counters = {
    awaitingFounder:
      summary?.awaitingFounder ??
      results.filter((r) => CARD_STATUSES.has(r.status)).length,
    approvalRequired:
      summary?.approvalRequired ?? results.filter((r) => r.status === "approval_required").length,
    draftReady: summary?.draftReady ?? results.filter((r) => r.status === "draft_ready").length,
    waiting: summary?.waiting ?? results.filter((r) => r.status === "waiting").length,
  };

  const cards = results
    .filter((r) => CARD_STATUSES.has(r.status))
    .slice(0, MAX_CARDS)
    .map(toCard);

  // Kartlar her zaman kazanır — gerçek veri varken loading/error gösterilmez.
  if (
    cards.length > 0 ||
    counters.awaitingFounder + counters.waiting > 0
  ) {
    return { mode: "ready", counters, cards };
  }
  if (input.fetchState === "loading") return { mode: "loading", counters, cards: [] };
  if (input.fetchState === "error") return { mode: "error", counters, cards: [] };
  return { mode: "empty", counters, cards: [] };
}

/** Fırsat Odağı'na verilecek seçili lead'in outreach hazırlık özeti (varsa). */
export function selectOutreachForLead(
  results: OutreachApiResultLike[] | null,
  leadId: string | null,
): OutreachApiResultLike | null {
  if (!leadId) return null;
  return (results ?? []).find((r) => r.leadId === leadId) ?? null;
}
