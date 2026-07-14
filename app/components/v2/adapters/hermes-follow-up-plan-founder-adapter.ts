/**
 * Hermes Follow-up Plan Founder adapter (Sprint C5 — Autonomous Follow-up
 * Orchestration).
 *
 * Saf sunum katmanı projeksiyonu: `/api/hermes/follow-ups/orchestration`
 * payload'ını "Hermes Takip Planı" bölümünün founder copy'sine çevirir.
 * Hiçbir şey hesaplamaz — her satır, orchestration katmanının zaten ürettiği
 * Türkçe cümlelerin/etiketlerin seçimi ve gruplamasıdır.
 *
 * MUTLAK KURAL: bu bölümün hiçbir çıktısı mesaj GÖNDERMEZ. Founder yalnız
 * "Takibi İncele" / "Taslağı İncele" / "İletişim Kanalını Kontrol Et" /
 * "Vazgeç" / "Tamamlandı" görür — "Gönder" butonu yoktur.
 *
 * Founder-language sözleşmesi: teknik kelime yok, ham enum yok, ham telefon
 * yok, iç kimlik yok. Kasıtlı olarak bağımsız (no "@/", no React).
 */

export type FollowUpPlanApiResultLike = {
  followUpCandidateId: string;
  leadId: string | null;
  missionId: string | null;
  businessName: string;
  state: string;
  stateLabelTr: string;
  trigger?: string;
  triggerLabelTr?: string;
  priority?: string;
  dueAt?: number | null;
  overdueByMinutes?: number | null;
  channelStrategy?: string;
  draftNeeded?: boolean;
  approvalRequired?: boolean;
  founderActionRequired?: boolean;
  founderActionLabelTr?: string | null;
  whatHappenedTr?: string;
  whyItMattersTr?: string;
  hermesRecommendationTr?: string;
  suggestedTimingTr?: string;
  cancellationReasonTr?: string | null;
  blockedReasonsTr?: string[];
};

export type FollowUpPlanApiSummaryLike = {
  total: number;
  dueToday: number;
  upcoming: number;
  approvalRequired: number;
  channelReview: number;
  completed: number;
  cancelled: number;
  blocked: number;
};

export type FollowUpPlanCard = {
  followUpCandidateId: string;
  leadId: string | null;
  missionId: string | null;
  title: string;
  stateLabelTr: string;
  reasonLabelTr: string;
  whatHappenedTr: string;
  whyItMattersTr: string;
  hermesRecommendationTr: string;
  suggestedTimingTr: string;
  /** Founder aksiyon butonu (null → yalnız bilgilendirme). ASLA "Gönder" olamaz. */
  founderActionLabelTr: string | null;
  approvalRequired: boolean;
  /** Kanal kontrolü gereken takip (teslimat başarısız). */
  channelReview: boolean;
  overdueByMinutes: number | null;
};

export type HermesFollowUpPlanView = {
  mode: "loading" | "error" | "empty" | "ready";
  counters: {
    dueToday: number;
    upcoming: number;
    approvalRequired: number;
    channelReview: number;
  };
  /** Bugün yapılacak (due/draft_needed). */
  today: FollowUpPlanCard[];
  /** Yaklaşan (waiting). */
  upcoming: FollowUpPlanCard[];
  /** Founder onayı bekleyen (approval_required). */
  approval: FollowUpPlanCard[];
  /** Kanal kontrolü gereken (blocked + manual_channel_review). */
  channelReview: FollowUpPlanCard[];
};

export const HERMES_FOLLOW_UP_PLAN_LABELS = {
  sectionTitle: "Hermes Takip Planı",
  sectionSubtitle:
    "Hermes hangi takibin ne zaman yapılacağını planladı — gönderim yalnız senin onayınla yapılır.",
  counterDueToday: "Bugün Takip",
  counterUpcoming: "Yaklaşan",
  counterApproval: "Onayını Bekliyor",
  counterChannelReview: "Kanal Kontrolü",
  groupToday: "Bugün Takip Edilecek",
  groupUpcoming: "Yaklaşan Takipler",
  groupApproval: "Founder Onayı Bekleyen",
  groupChannelReview: "Kanal Kontrolü Gereken",
  whatHappened: "Ne oldu?",
  whyItMatters: "Neden önemli?",
  hermesRecommendation: "Hermes ne öneriyor?",
  founderDecision: "Senin kararın",
  timing: "Ne zaman",
  overdue: "Gecikti",
  noSendNote: "Bu bölümden mesaj gönderilmez — gönderim senin onayının arkasındadır.",
  loading: "Hermes takip planını hazırlıyor…",
  error: "Takip planı şu anda yüklenemedi.",
  retry: "Tekrar Dene",
  emptyTitle: "Şu anda takip gerektiren bir satış fırsatı yok.",
  emptySubtitle: "Bir işletmeyle iletişim ilerledikçe Hermes takip planını burada gösterecek.",
} as const;

const MAX_PER_GROUP = 6;

function displayName(item: FollowUpPlanApiResultLike, leadNameById?: Record<string, string>): string {
  const fromMap = item.leadId ? leadNameById?.[item.leadId]?.trim() : undefined;
  if (fromMap) return fromMap;
  const raw = item.businessName?.trim();
  if (raw && raw !== "İsimsiz işletme") return raw;
  return "İsimsiz işletme";
}

function toCard(item: FollowUpPlanApiResultLike, leadNameById?: Record<string, string>): FollowUpPlanCard {
  return {
    followUpCandidateId: item.followUpCandidateId,
    leadId: item.leadId,
    missionId: item.missionId,
    title: displayName(item, leadNameById),
    stateLabelTr: item.stateLabelTr,
    reasonLabelTr: item.triggerLabelTr?.trim() || "Takip",
    whatHappenedTr: item.whatHappenedTr?.trim() || "Bu işletme için bir takip planlandı.",
    whyItMattersTr: item.whyItMattersTr?.trim() || "Bu fırsat yakından takip edilmeli.",
    hermesRecommendationTr: item.hermesRecommendationTr?.trim() || "Takibi incele ve nasıl ilerleyeceğine karar ver.",
    suggestedTimingTr: item.suggestedTimingTr?.trim() || "—",
    founderActionLabelTr: item.founderActionLabelTr?.trim() || null,
    approvalRequired: item.approvalRequired === true,
    channelReview: item.channelStrategy === "manual_channel_review",
    overdueByMinutes: item.overdueByMinutes ?? null,
  };
}

export type ComputeFollowUpPlanViewInput = {
  results: FollowUpPlanApiResultLike[] | null;
  summary: FollowUpPlanApiSummaryLike | null;
  fetchState: "loading" | "ready" | "error";
  leadNameById?: Record<string, string>;
};

export function computeFollowUpPlanView(input: ComputeFollowUpPlanViewInput): HermesFollowUpPlanView {
  const results = input.results ?? [];
  const summary = input.summary;

  const byState = (states: Set<string>) =>
    results
      .filter((r) => states.has(r.state))
      .slice(0, MAX_PER_GROUP)
      .map((r) => toCard(r, input.leadNameById));

  // "Bugün Takip" kanal-kontrolü gerekenleri hariç tutar — onlar ayrı grupta.
  const today = results
    .filter((r) => (r.state === "due" || r.state === "draft_needed") && r.channelStrategy !== "manual_channel_review")
    .slice(0, MAX_PER_GROUP)
    .map((r) => toCard(r, input.leadNameById));
  const upcoming = byState(new Set(["waiting"]));
  const approval = byState(new Set(["approval_required"]));
  const channelReview = results
    .filter((r) => r.channelStrategy === "manual_channel_review" && (r.state === "blocked" || r.state === "due"))
    .slice(0, MAX_PER_GROUP)
    .map((r) => toCard(r, input.leadNameById));

  const counters = {
    dueToday: summary?.dueToday ?? today.length,
    upcoming: summary?.upcoming ?? upcoming.length,
    approvalRequired: summary?.approvalRequired ?? approval.length,
    channelReview: summary?.channelReview ?? channelReview.length,
  };

  const hasAnyCard = today.length + upcoming.length + approval.length + channelReview.length > 0;
  if (hasAnyCard) {
    return { mode: "ready", counters, today, upcoming, approval, channelReview };
  }
  if (input.fetchState === "loading") return { mode: "loading", counters, today: [], upcoming: [], approval: [], channelReview: [] };
  if (input.fetchState === "error") return { mode: "error", counters, today: [], upcoming: [], approval: [], channelReview: [] };
  return { mode: "empty", counters, today: [], upcoming: [], approval: [], channelReview: [] };
}

/** Fırsat Odağı'na verilecek seçili lead'in takip planı özeti (varsa). */
export function selectFollowUpPlanForLead(
  results: FollowUpPlanApiResultLike[] | null,
  leadId: string | null,
): FollowUpPlanApiResultLike | null {
  if (!leadId) return null;
  return (results ?? []).find((r) => r.leadId === leadId) ?? null;
}
