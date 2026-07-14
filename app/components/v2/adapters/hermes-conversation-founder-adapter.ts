/**
 * Hermes Conversation Founder adapter (Sprint C4 — Autonomous Conversation).
 *
 * Saf sunum katmanı projeksiyonu: `/api/hermes/conversations` payload'ını
 * "Hermes Konuşmaları" bölümünün founder copy'sine çevirir. Hiçbir şey
 * hesaplamaz — her satır, konuşma çalışma katmanının zaten ürettiği Türkçe
 * cümlelerin/etiketlerin seçimi ve sıralamasıdır.
 *
 * MUTLAK KURAL: bu bölümün hiçbir çıktısı mesaj GÖNDERMEZ. Founder yalnız
 * "Cevabı İncele" / "Mesaj Taslağını İncele" / "Demo Planla" / "Görüşme
 * Planla" / "Takip Kararı Ver" / "Kapatmayı İncele" görür — "Gönder" butonu
 * yoktur; gönderim mevcut Founder Approval → Courier → Delivery Gateway
 * zincirinin arkasındadır.
 *
 * Founder-language sözleşmesi: teknik kelime yok, ham enum yok, ham telefon
 * yok, mesaj kimliği yok. Kasıtlı olarak bağımsız (no "@/", no React) —
 * `node --test` altında koşar.
 */

/** API payload'ının yapısal alt kümesi — yalnız founder görünümünün okuduğu alanlar. */
export type ConversationApiResultLike = {
  leadId: string | null;
  missionId: string | null;
  businessName: string;
  state: string;
  stateLabelTr: string;
  priority?: string;
  priorityLabelTr?: string;
  replyPreviewSafe?: string | null;
  whatHappenedTr?: string;
  whyItMattersTr?: string;
  hermesRecommendationTr?: string;
  nextActionLabelTr?: string;
  founderActionRequired?: boolean;
  founderActionLabelTr?: string | null;
  replyDraftNeeded?: boolean;
  approvalRequired?: boolean;
  conversationClosed?: boolean;
};

export type ConversationApiSummaryLike = {
  total: number;
  hotOpportunity: number;
  pricingDiscussion: number;
  demoRequested: number;
  callRequested: number;
  followUpLater: number;
  reviewRequired: number;
  notInterested: number;
  wrongNumber: number;
  closed: number;
};

export type ConversationFounderCard = {
  leadId: string | null;
  missionId: string | null;
  title: string;
  stateLabelTr: string;
  priorityLabelTr: string;
  /** Güvenli cevap özeti (varsa) — ham mesaj gövdesi asla değil. */
  replyPreviewSafe: string | null;
  whatHappenedTr: string;
  whyItMattersTr: string;
  hermesRecommendationTr: string;
  /** Founder'ın atacağı sonraki adım (cümle). */
  nextStepTr: string;
  /** Founder aksiyon butonu etiketi (null → yalnız bilgilendirme, buton yok). ASLA "Gönder" olamaz. */
  founderActionLabelTr: string | null;
  /** Taslak founder onayını bekliyorsa true — kart vurgulanır. */
  approvalRequired: boolean;
};

export type HermesConversationFounderView = {
  mode: "loading" | "error" | "empty" | "ready";
  counters: {
    hotOpportunity: number;
    pricingDiscussion: number;
    demoRequested: number;
    callRequested: number;
    reviewRequired: number;
  };
  cards: ConversationFounderCard[];
};

export const HERMES_CONVERSATION_FOUNDER_LABELS = {
  sectionTitle: "Hermes Konuşmaları",
  sectionSubtitle:
    "Hermes gelen cevapların ticari anlamını tek durumda birleştirdi — karar senin, gönderim yalnız senin onayınla.",
  counterHot: "Sıcak Fırsat",
  counterPricing: "Fiyat Görüşmesi",
  counterDemo: "Demo Talebi",
  counterCall: "Görüşme Talebi",
  counterReview: "İncelemen Gerekiyor",
  whatHappened: "Ne oldu?",
  whyItMatters: "Neden önemli?",
  hermesRecommendation: "Hermes ne öneriyor?",
  founderDecision: "Senin kararın",
  lastReply: "Son cevap",
  noSendNote: "Bu bölümden mesaj gönderilmez — gönderim senin onayının arkasındadır.",
  loading: "Hermes konuşmaları hazırlıyor…",
  error: "Konuşma bilgileri şu anda yüklenemedi.",
  retry: "Tekrar Dene",
  emptyTitle: "Henüz aktif bir satış konuşması yok.",
  emptySubtitle: "Bir işletme cevap verdiğinde Hermes konuşmanın anlamını burada gösterecek.",
} as const;

const MAX_CARDS = 6;

/**
 * Kart olacak durumlar: yalnız aktif ve ticari açıdan anlamlı konuşmalar.
 * Pasif (awaiting_reply/reply_received) ve kapalı (closed_won/closed_lost/
 * blocked) durumlar kart olmaz. not_interested/wrong_number founder'ın bir
 * "kapatmayı incele" kararı verebilmesi için gösterilir.
 */
const CARD_STATES = new Set([
  "hot_opportunity",
  "pricing_discussion",
  "demo_requested",
  "call_requested",
  "follow_up_later",
  "human_review_required",
  "not_interested",
  "wrong_number",
]);

function displayName(item: ConversationApiResultLike, leadNameById?: Record<string, string>): string {
  const fromMap = item.leadId ? leadNameById?.[item.leadId]?.trim() : undefined;
  if (fromMap) return fromMap;
  const raw = item.businessName?.trim();
  if (raw && raw !== "İsimsiz işletme") return raw;
  return "İsimsiz işletme";
}

function toCard(item: ConversationApiResultLike, leadNameById?: Record<string, string>): ConversationFounderCard {
  return {
    leadId: item.leadId,
    missionId: item.missionId,
    title: displayName(item, leadNameById),
    stateLabelTr: item.stateLabelTr,
    priorityLabelTr: item.priorityLabelTr?.trim() || "Orta",
    replyPreviewSafe: item.replyPreviewSafe?.trim() || null,
    whatHappenedTr: item.whatHappenedTr?.trim() || "İşletmeden bir cevap geldi.",
    whyItMattersTr: item.whyItMattersTr?.trim() || "Bu konuşma yakından takip edilmeli.",
    hermesRecommendationTr:
      item.hermesRecommendationTr?.trim() || "Cevabı incele ve nasıl ilerleyeceğine karar ver.",
    nextStepTr: item.nextActionLabelTr?.trim() || "Founder kararı bekleniyor.",
    founderActionLabelTr: item.founderActionLabelTr?.trim() || null,
    approvalRequired: item.approvalRequired === true,
  };
}

export type ComputeConversationFounderViewInput = {
  results: ConversationApiResultLike[] | null;
  summary: ConversationApiSummaryLike | null;
  fetchState: "loading" | "ready" | "error";
  /** İsteğe bağlı leadId → işletme adı eşlemesi (ekranın zaten elindeki lead'lerden). */
  leadNameById?: Record<string, string>;
};

export function computeConversationFounderView(
  input: ComputeConversationFounderViewInput,
): HermesConversationFounderView {
  const results = input.results ?? [];
  const summary = input.summary;

  const counters = {
    hotOpportunity: summary?.hotOpportunity ?? results.filter((r) => r.state === "hot_opportunity").length,
    pricingDiscussion:
      summary?.pricingDiscussion ?? results.filter((r) => r.state === "pricing_discussion").length,
    demoRequested: summary?.demoRequested ?? results.filter((r) => r.state === "demo_requested").length,
    callRequested: summary?.callRequested ?? results.filter((r) => r.state === "call_requested").length,
    reviewRequired:
      summary?.reviewRequired ?? results.filter((r) => r.state === "human_review_required").length,
  };

  const cards = results
    .filter((r) => CARD_STATES.has(r.state))
    .slice(0, MAX_CARDS)
    .map((r) => toCard(r, input.leadNameById));

  // Kartlar her zaman kazanır — gerçek veri varken loading/error gösterilmez.
  if (cards.length > 0) {
    return { mode: "ready", counters, cards };
  }
  if (input.fetchState === "loading") return { mode: "loading", counters, cards: [] };
  if (input.fetchState === "error") return { mode: "error", counters, cards: [] };
  return { mode: "empty", counters, cards: [] };
}

/** Fırsat Odağı'na verilecek seçili lead'in konuşma özeti (varsa). */
export function selectConversationForLead(
  results: ConversationApiResultLike[] | null,
  leadId: string | null,
): ConversationApiResultLike | null {
  if (!leadId) return null;
  return (results ?? []).find((r) => r.leadId === leadId) ?? null;
}
