import type { HermesConversationPolicy } from "./hermes-conversation-policy.ts";

/**
 * Hermes Autonomous Conversation Runtime (Sprint C4 — Autonomous
 * Conversation).
 *
 * Saf, deterministik BİRLEŞTİRME katmanı. Zincirin son eksik halkasını
 * doldurur: gelen bir cevabın parçalı sinyallerini (mevcut Reply
 * Intelligence çıktısı + demo/follow-up/outcome durumları) TEK bir
 * `ConversationDecision` altında birleştirir.
 *
 * Bu modül YENİ bir sınıflandırıcı/parser DEĞİLDİR — mevcut
 * `reply-intelligence-runtime.ts` intent'lerini OKUR, tahmin ETMEZ. Yeni skor
 * hesaplamaz, serbest metin üretmez, dış çağrı yapmaz.
 *
 * Sert güvenlik (yapısal): hiçbir mesajlaşma/provider/gateway/send/onay
 * modülünü import ETMEZ → gönderim tip düzeyinde imkânsızdır.
 * `ConversationDecision` üzerinde `sendAllowed`/`founderApproved` diye bir alan
 * YOKTUR → onay üretemez. `replyDraftNeeded=true` yalnız "mevcut Courier
 * taslak motoru + founder onay akışı çalışsın" demektir; bu modül metni
 * üretmez ve göndermez.
 *
 * Kasıtlı olarak bağımsız ("@/" import'u, React, browser API yok) —
 * `node --test` altında koşar; her Hermes lib modülünün izlediği kalıp.
 */

/* ── tipler ─────────────────────────────────────────────────── */

export type ConversationState =
  | "awaiting_reply"
  | "reply_received"
  | "hot_opportunity"
  | "pricing_discussion"
  | "demo_requested"
  | "call_requested"
  | "follow_up_later"
  | "human_review_required"
  | "not_interested"
  | "wrong_number"
  | "closed_won"
  | "closed_lost"
  | "blocked";

export type ConversationPriority = "critical" | "high" | "medium" | "low";

export type ConversationNextAction =
  | "prepare_reply_draft"
  | "founder_review"
  | "schedule_demo"
  | "schedule_call"
  | "create_follow_up"
  | "mark_not_interested"
  | "mark_wrong_number"
  | "mark_outcome"
  | "wait"
  | "blocked";

/** Mevcut `ReplyIntent`'in yapısal kopyası — gerçek `ReplyIntelligenceItem.intent` bunu otomatik karşılar. */
export type ConversationReplyIntent =
  | "demo_requested"
  | "pricing_question"
  | "interested"
  | "call_requested"
  | "later"
  | "not_interested"
  | "wrong_number"
  | "human_review_required"
  | "unknown";

export type ConversationConfidence = "high" | "medium" | "low";
export type ConversationUrgency = "high" | "medium" | "low";

/** Sanitize edilmiş cevabın yapısal alt kümesi — gerçek `StoredWhatsAppReply` bunu otomatik karşılar. */
export type ConversationReplyLike = {
  provider: "whatsapp";
  providerMessageId: string;
  /** v6.2 parser'da zaten 160 karaktere kadar kısaltılmış güvenli önizleme; burada policy ile yeniden kısaltılır. */
  textPreview: string | null;
  mapped: boolean;
  missionId: string | null;
  leadId: string | null;
  occurredAt: number;
};

/** Reply Intelligence çıktısının yapısal alt kümesi — gerçek `ReplyIntelligenceItem` bunu otomatik karşılar. */
export type ConversationIntelligenceLike = {
  intent: ConversationReplyIntent;
  confidence: ConversationConfidence;
  urgency: ConversationUrgency;
  founderActionHint: string;
};

/** Sales Outcome'un source-of-truth override'ı için okunan alt küme. */
export type ConversationOutcomeLike = {
  status: string;
} | null;

/** Var olan demo/follow-up öğelerinin yapısal alt kümesi — yalnız varlık/kanal bilgisi için okunur. */
export type ConversationDemoLike = { status: string } | null;
export type ConversationFollowUpLike = { status: string } | null;
export type ConversationOutreachLike = { status: string; recommendedChannel?: string } | null;

export type ConversationInput = {
  reply: ConversationReplyLike;
  replyIntelligence: ConversationIntelligenceLike;
  missionId?: string | null;
  leadId?: string | null;
  outreachDecision?: ConversationOutreachLike;
  demoItem?: ConversationDemoLike;
  followUpItem?: ConversationFollowUpLike;
  salesOutcome?: ConversationOutcomeLike;
  currentTime: number;
  policy: HermesConversationPolicy;
};

export type ConversationAuditEventType =
  | "hermes_conversation_requested"
  | "hermes_conversation_started"
  | "hermes_conversation_reply_received"
  | "hermes_conversation_hot_opportunity"
  | "hermes_conversation_pricing_discussion"
  | "hermes_conversation_demo_requested"
  | "hermes_conversation_call_requested"
  | "hermes_conversation_follow_up_created"
  | "hermes_conversation_review_required"
  | "hermes_conversation_closed"
  | "hermes_conversation_blocked"
  | "hermes_conversation_completed"
  | "hermes_conversation_failed";

export type ConversationAuditEvent = {
  type: ConversationAuditEventType;
  at: number;
  leadId: string | null;
  missionId: string | null;
  providerMessageIdSafe: string;
  state: ConversationState | null;
  nextAction: ConversationNextAction | null;
  confidence: ConversationConfidence | null;
  urgency: ConversationUrgency | null;
  mapped: boolean;
  /** Türkçe, founder-güvenli detay — asla ham cevap, ham telefon, secret veya provider verisi içermez. */
  detailTr: string;
};

export type ConversationDecision = {
  id: string;
  missionId: string | null;
  leadId: string | null;
  providerMessageIdSafe: string;
  state: ConversationState;
  priority: ConversationPriority;
  mapped: boolean;
  confidence: ConversationConfidence;
  urgency: ConversationUrgency;
  /** Güvenli, policy ile kısaltılmış cevap önizlemesi — ham mesaj gövdesi asla değil. */
  replyPreviewSafe: string | null;
  whatHappenedTr: string;
  whyItMattersTr: string;
  hermesRecommendationTr: string;
  nextAction: ConversationNextAction;
  founderActionRequired: boolean;
  founderActionLabelTr: string | null;
  replyDraftNeeded: boolean;
  approvalRequired: boolean;
  demoSchedulingNeeded: boolean;
  callSchedulingNeeded: boolean;
  followUpNeeded: boolean;
  outcomeUpdateNeeded: boolean;
  conversationClosed: boolean;
  createdAt: number;
  auditEvents: ConversationAuditEvent[];
};

/* ── founder sözlüğü ────────────────────────────────────────── */

export const CONVERSATION_STATE_LABELS_TR: Record<ConversationState, string> = {
  awaiting_reply: "Yanıt Bekleniyor",
  reply_received: "Cevap Geldi",
  hot_opportunity: "Sıcak Fırsat",
  pricing_discussion: "Fiyat Görüşmesi",
  demo_requested: "Demo Talebi",
  call_requested: "Görüşme Talebi",
  follow_up_later: "Daha Sonra Takip",
  human_review_required: "Founder İncelemesi Gerekli",
  not_interested: "İlgilenmiyor",
  wrong_number: "Yanlış Numara",
  closed_won: "Satış Kazanıldı",
  closed_lost: "Satış Kaybedildi",
  blocked: "İşlem Engellendi",
};

export const CONVERSATION_PRIORITY_LABELS_TR: Record<ConversationPriority, string> = {
  critical: "Kritik",
  high: "Yüksek",
  medium: "Orta",
  low: "Düşük",
};

export const CONVERSATION_NEXT_ACTION_LABELS_TR: Record<ConversationNextAction, string> = {
  prepare_reply_draft: "Mesaj taslağını incele ve onayla — gönderim yalnız senin onayınla.",
  founder_review: "Cevabı incele ve nasıl ilerleyeceğine karar ver.",
  schedule_demo: "Demo zamanını planla.",
  schedule_call: "Telefon görüşmesini planla.",
  create_follow_up: "Takip kararını ver.",
  mark_not_interested: "Bu fırsatı kapatmayı değerlendir.",
  mark_wrong_number: "Yanlış numarayı işaretle ve bu işletmeyi durdur.",
  mark_outcome: "Satış sonucunu belirle.",
  wait: "Şimdilik işlem yapılmayacak — Hermes izliyor.",
  blocked: "Bu konuşma güvenli nedenlerle durduruldu.",
};

/** Founder'ın kartta göreceği aksiyon butonu etiketi (null → pasif, buton yok). */
const FOUNDER_ACTION_LABELS: Record<ConversationState, string | null> = {
  awaiting_reply: null,
  reply_received: null,
  hot_opportunity: "Mesaj Taslağını İncele",
  pricing_discussion: "Mesaj Taslağını İncele",
  demo_requested: "Demo Planla",
  call_requested: "Görüşme Planla",
  follow_up_later: "Takip Kararı Ver",
  human_review_required: "Cevabı İncele",
  not_interested: "Kapatmayı İncele",
  wrong_number: "Kapatmayı İncele",
  closed_won: null,
  closed_lost: null,
  blocked: null,
};

/* ── state tabloları ─────────────────────────────────────────── */

const PRIORITY_BY_STATE: Record<ConversationState, ConversationPriority> = {
  awaiting_reply: "low",
  reply_received: "low",
  hot_opportunity: "high",
  pricing_discussion: "high",
  demo_requested: "high",
  call_requested: "high",
  follow_up_later: "medium",
  human_review_required: "medium",
  not_interested: "low",
  wrong_number: "critical",
  closed_won: "low",
  closed_lost: "low",
  blocked: "critical",
};

const NEXT_ACTION_BY_STATE: Record<ConversationState, ConversationNextAction> = {
  awaiting_reply: "wait",
  reply_received: "wait",
  hot_opportunity: "prepare_reply_draft",
  pricing_discussion: "prepare_reply_draft",
  demo_requested: "schedule_demo",
  call_requested: "schedule_call",
  follow_up_later: "create_follow_up",
  human_review_required: "founder_review",
  not_interested: "mark_not_interested",
  wrong_number: "mark_wrong_number",
  closed_won: "wait",
  closed_lost: "wait",
  blocked: "blocked",
};

/** Intent → konuşma durumu. Tahmin YOK: unknown/human_review özel olarak ele alınır (aşağıda). */
const STATE_BY_INTENT: Record<ConversationReplyIntent, ConversationState> = {
  demo_requested: "demo_requested",
  call_requested: "call_requested",
  pricing_question: "pricing_discussion",
  interested: "hot_opportunity",
  later: "follow_up_later",
  not_interested: "not_interested",
  wrong_number: "wrong_number",
  human_review_required: "human_review_required",
  unknown: "reply_received",
};

/** Otomasyon (demo/call/draft aday oluşturma) gerektiren durumlar — eşleşme yoksa güvenli düşüş yapılır. */
const AUTOMATION_STATES: ReadonlySet<ConversationState> = new Set([
  "hot_opportunity",
  "pricing_discussion",
  "demo_requested",
  "call_requested",
]);

/* ── durum türetme ───────────────────────────────────────────── */

/**
 * Konuşma durumunu türetir. Öncelik sırası:
 *  1. Sales Outcome source-of-truth override (won → closed_won, lost →
 *     closed_lost) — founder zaten sonucu belirlediyse konuşma kapalıdır.
 *  2. Intent → state eşlemesi.
 *  3. unknown intent: mapped + güvenli ise `reply_received`; aksi halde
 *     `human_review_required`. TAHMİN YOK.
 *  4. Eşleşmemiş (unmapped) otomasyon durumları: policy
 *     `requireMappedReplyForAutomation` ise `human_review_required`'a düşürülür
 *     (founder önce lead'i bulmalı).
 */
export function deriveConversationState(input: ConversationInput): ConversationState {
  const outcomeStatus = input.salesOutcome?.status;
  if (outcomeStatus === "won") return "closed_won";
  if (outcomeStatus === "lost") return "closed_lost";

  const intent = input.replyIntelligence.intent;
  const mapped = input.reply.mapped;

  let state: ConversationState;
  if (intent === "unknown") {
    state = mapped ? "reply_received" : "human_review_required";
  } else {
    state = STATE_BY_INTENT[intent];
  }

  // Güvenli düşüş: otomasyon gerektiren bir durum ama cevap eşleşmemişse
  // (lead/mission bilinmiyor) — founder önce lead'i bulmalı, Hermes tahmin
  // yürütmez ya da otomatik aday oluşturmaz.
  if (input.policy.requireMappedReplyForAutomation && !mapped && AUTOMATION_STATES.has(state)) {
    return "human_review_required";
  }

  return state;
}

export function deriveConversationPriority(state: ConversationState): ConversationPriority {
  return PRIORITY_BY_STATE[state];
}

export function deriveConversationNextAction(state: ConversationState): ConversationNextAction {
  return NEXT_ACTION_BY_STATE[state];
}

/* ── bayraklar ───────────────────────────────────────────────── */

export type ConversationFlags = {
  founderActionRequired: boolean;
  replyDraftNeeded: boolean;
  approvalRequired: boolean;
  demoSchedulingNeeded: boolean;
  callSchedulingNeeded: boolean;
  followUpNeeded: boolean;
  outcomeUpdateNeeded: boolean;
  conversationClosed: boolean;
};

function emptyFlags(): ConversationFlags {
  return {
    founderActionRequired: false,
    replyDraftNeeded: false,
    approvalRequired: false,
    demoSchedulingNeeded: false,
    callSchedulingNeeded: false,
    followUpNeeded: false,
    outcomeUpdateNeeded: false,
    conversationClosed: false,
  };
}

/**
 * Durum + policy'den güvenli bayrakları türetir. Kritik güvenlik kuralı:
 *  - `replyDraftNeeded` her zaman `approvalRequired`'i beraberinde getirir —
 *    hazırlanan hiçbir taslak founder onayı olmadan ilerleyemez.
 *  - Otomasyon bayrakları (demo/call/draft/follow-up) policy kapalıysa veya
 *    ilgili "auto" izni kapalıysa temizlenir — ama founder yine bilgilendirilir
 *    (`founderActionRequired`).
 */
export function deriveConversationFlags(state: ConversationState, policy: HermesConversationPolicy): ConversationFlags {
  const flags = emptyFlags();

  switch (state) {
    case "hot_opportunity":
    case "pricing_discussion":
      flags.founderActionRequired = true;
      flags.replyDraftNeeded = true;
      // Yapısal koruma: taslak varsa onay HER ZAMAN zorunlu.
      flags.approvalRequired = policy.requireFounderApprovalForReplyDraft;
      break;
    case "demo_requested":
      flags.founderActionRequired = true;
      flags.demoSchedulingNeeded = policy.allowAutoDemoCandidateCreation;
      break;
    case "call_requested":
      flags.founderActionRequired = true;
      // Çağrı planlaması demo scheduling adayını kullanır (aynı "auto" izni).
      flags.callSchedulingNeeded = policy.allowAutoDemoCandidateCreation;
      break;
    case "follow_up_later":
      flags.followUpNeeded = policy.allowAutoFollowUpCandidateCreation;
      break;
    case "human_review_required":
      flags.founderActionRequired = true;
      break;
    case "not_interested":
      flags.conversationClosed = policy.closeOnNotInterested;
      break;
    case "wrong_number":
      flags.founderActionRequired = true;
      flags.conversationClosed = policy.closeOnWrongNumber;
      break;
    case "closed_won":
    case "closed_lost":
      flags.conversationClosed = true;
      break;
    case "blocked":
      flags.conversationClosed = true;
      break;
    case "awaiting_reply":
    case "reply_received":
      break;
  }

  return flags;
}

/* ── founder copy ────────────────────────────────────────────── */

function whatHappenedFor(state: ConversationState, intelligence: ConversationIntelligenceLike): string {
  switch (state) {
    case "hot_opportunity":
      return "İşletme ilgi gösterdi — sıcak bir fırsat oluştu.";
    case "pricing_discussion":
      return "İşletme fiyat/paket bilgisi sordu.";
    case "demo_requested":
      return "İşletme demo talep etti.";
    case "call_requested":
      return "İşletme telefonla görüşmek istedi.";
    case "follow_up_later":
      return "İşletme şu an uygun olmadığını, daha sonra iletişim kurulmasını belirtti.";
    case "human_review_required":
      return "Bir cevap geldi ama Hermes net bir ticari sinyal bulamadı.";
    case "not_interested":
      return "İşletme şu an ilgilenmediğini belirtti.";
    case "wrong_number":
      return "Bu numaranın işletmeye ait olmadığı anlaşıldı.";
    case "closed_won":
      return "Bu fırsat kazanılan satış olarak işaretlendi.";
    case "closed_lost":
      return "Bu fırsat kaybedilen satış olarak işaretlendi.";
    case "reply_received":
      return "İşletmeden bir cevap geldi.";
    case "awaiting_reply":
      return "Mesaj iletildi, işletmeden yanıt bekleniyor.";
    case "blocked":
      return "Bu konuşma güvenli nedenlerle durduruldu.";
    default: {
      void intelligence;
      return "İşletmeden bir cevap geldi.";
    }
  }
}

function whyItMattersFor(state: ConversationState): string {
  switch (state) {
    case "hot_opportunity":
      return "Sıcak ilgi hızlı yanıt ister — geç kalınırsa ilgi soğuyabilir.";
    case "pricing_discussion":
      return "Fiyat sorusu satın alma niyetinin güçlü işareti — net cevap dönüşümü artırır.";
    case "demo_requested":
      return "Demo planlanmazsa fırsat ilerlemez.";
    case "call_requested":
      return "Zamanında aranmazsa ilgi kaybolabilir.";
    case "follow_up_later":
      return "Doğru zamanda takip edilmezse fırsat unutulabilir.";
    case "human_review_required":
      return "Manuel incelenmezse gerçek bir fırsat gözden kaçabilir.";
    case "not_interested":
      return "Enerjini daha sıcak fırsatlara yönlendirmen için bu konuşma kapatılabilir.";
    case "wrong_number":
      return "Yanlış numaraya devam edilirse zaman ve itibar kaybı olur.";
    case "closed_won":
      return "Satış kazanıldı — bu konuşmada ek işlem gerekmiyor.";
    case "closed_lost":
      return "Satış kaybedildi — bu konuşmada ek işlem gerekmiyor.";
    case "reply_received":
      return "Cevap geldi; şu an founder aksiyonu gerekmiyor, Hermes izliyor.";
    case "awaiting_reply":
      return "Henüz yanıt gelmedi; Hermes bekliyor.";
    case "blocked":
      return "Güvenlik gereği bu konuşmada otomatik işlem yapılmıyor.";
  }
}

function hermesRecommendationFor(
  state: ConversationState,
  intelligence: ConversationIntelligenceLike,
): string {
  switch (state) {
    case "hot_opportunity":
    case "pricing_discussion":
      return "Hermes bir cevap taslağı hazırlayabilir — incele ve onayla; gönderim yalnız senin onayınla yapılır. Hermes hiçbir mesaj göndermez.";
    case "demo_requested":
      return "Demo için uygun bir zaman planla.";
    case "call_requested":
      return "İşletmeyi en kısa sürede aramak için görüşme planla.";
    case "follow_up_later":
      return "Uygun bir zamana takip kur; şimdilik ısrar etme.";
    case "human_review_required":
      return intelligence.founderActionHint?.trim() || "Cevabı manuel incele ve nasıl ilerleyeceğine karar ver.";
    case "not_interested":
      return "Bu konuşmayı kapatmayı değerlendir — Hermes otomatik olarak kaybedilen satış işaretlemez, karar sana ait.";
    case "wrong_number":
      return "Yanlış numarayı işaretle; Hermes bu işletme için otomatik hazırlığı durdurur.";
    case "closed_won":
    case "closed_lost":
      return "Bu konuşma tamamlandı; ek işlem gerekmiyor.";
    case "reply_received":
      return "Şimdilik yapılacak bir şey yok — Hermes cevabı izliyor.";
    case "awaiting_reply":
      return "Hermes yanıt gelene kadar bekliyor.";
    case "blocked":
      return "Hermes bu konuşmayı güvenli nedenlerle beklemeye aldı.";
  }
}

/* ── önizleme ────────────────────────────────────────────────── */

/** Güvenli önizleme: policy sınırına kadar kısaltır. Ham mesaj gövdesi asla dışarı çıkmaz. */
export function safeReplyPreview(textPreview: string | null, policy: HermesConversationPolicy): string | null {
  if (textPreview == null) return null;
  const trimmed = textPreview.trim();
  if (trimmed.length === 0) return null;
  const max = policy.maxReplyPreviewLength;
  if (max <= 0) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/* ── audit ───────────────────────────────────────────────────── */

const AUDIT_TYPE_BY_STATE: Record<ConversationState, ConversationAuditEventType> = {
  awaiting_reply: "hermes_conversation_reply_received",
  reply_received: "hermes_conversation_reply_received",
  hot_opportunity: "hermes_conversation_hot_opportunity",
  pricing_discussion: "hermes_conversation_pricing_discussion",
  demo_requested: "hermes_conversation_demo_requested",
  call_requested: "hermes_conversation_call_requested",
  follow_up_later: "hermes_conversation_follow_up_created",
  human_review_required: "hermes_conversation_review_required",
  not_interested: "hermes_conversation_closed",
  wrong_number: "hermes_conversation_blocked",
  closed_won: "hermes_conversation_closed",
  closed_lost: "hermes_conversation_closed",
  blocked: "hermes_conversation_blocked",
};

export type BuildConversationAuditEventInput = {
  type: ConversationAuditEventType;
  at: number;
  leadId?: string | null;
  missionId?: string | null;
  providerMessageIdSafe: string;
  state?: ConversationState | null;
  nextAction?: ConversationNextAction | null;
  confidence?: ConversationConfidence | null;
  urgency?: ConversationUrgency | null;
  mapped?: boolean;
  detailTr: string;
};

/**
 * Konuşma audit event'lerinin tek kurucusu — outreach/qualification scrubber
 * kalıbının aynısı: token/secret/telefon görünümlü her şey son savunma hattı
 * olarak temizlenir (çağıranlar zaten asla geçirmez). `providerMessageIdSafe`
 * bir mesaj kimliğidir (telefon değil); güvenli tutulur.
 */
export function buildConversationAuditEvent(input: BuildConversationAuditEventInput): ConversationAuditEvent {
  const scrubbed = input.detailTr
    .replace(/Bearer\s+\S+/gi, "Bearer [gizli]")
    .replace(/(key|token|secret)=\S+/gi, "$1=[gizli]")
    .replace(/\+?\d[\d\s\-()]{8,}\d/g, "[numara gizli]");
  return {
    type: input.type,
    at: input.at,
    leadId: input.leadId ?? null,
    missionId: input.missionId ?? null,
    providerMessageIdSafe: input.providerMessageIdSafe,
    state: input.state ?? null,
    nextAction: input.nextAction ?? null,
    confidence: input.confidence ?? null,
    urgency: input.urgency ?? null,
    mapped: input.mapped ?? false,
    detailTr: scrubbed,
  };
}

/* ── ana değerlendirme ───────────────────────────────────────── */

export function evaluateHermesConversation(input: ConversationInput): ConversationDecision {
  const now = input.currentTime;
  const reply = input.reply;
  const intelligence = input.replyIntelligence;
  const providerMessageIdSafe = reply.providerMessageId;
  const missionId = input.missionId ?? reply.missionId ?? null;
  const leadId = input.leadId ?? reply.leadId ?? null;
  const mapped = reply.mapped;

  const state = deriveConversationState(input);
  const priority = deriveConversationPriority(state);
  const nextAction = deriveConversationNextAction(state);
  const flags = deriveConversationFlags(state, input.policy);

  const replyPreviewSafe = safeReplyPreview(reply.textPreview, input.policy);
  const whatHappenedTr = whatHappenedFor(state, intelligence);
  const whyItMattersTr = whyItMattersFor(state);
  const hermesRecommendationTr = hermesRecommendationFor(state, intelligence);
  const founderActionLabelTr = flags.founderActionRequired ? FOUNDER_ACTION_LABELS[state] : null;

  const auditBase = {
    leadId,
    missionId,
    providerMessageIdSafe,
    confidence: intelligence.confidence,
    urgency: intelligence.urgency,
    mapped,
  };

  const auditEvents: ConversationAuditEvent[] = [
    buildConversationAuditEvent({
      ...auditBase,
      type: "hermes_conversation_requested",
      at: now,
      detailTr: "Gelen cevap için konuşma kararı değerlendirildi.",
    }),
    buildConversationAuditEvent({
      ...auditBase,
      type: "hermes_conversation_started",
      at: now,
      state,
      nextAction,
      detailTr: `Konuşma durumu belirlendi: ${CONVERSATION_STATE_LABELS_TR[state]}.`,
    }),
    buildConversationAuditEvent({
      ...auditBase,
      type: AUDIT_TYPE_BY_STATE[state],
      at: now,
      state,
      nextAction,
      detailTr: `${CONVERSATION_STATE_LABELS_TR[state]} — sonraki adım: ${CONVERSATION_NEXT_ACTION_LABELS_TR[nextAction]}`,
    }),
  ];

  if (flags.followUpNeeded) {
    auditEvents.push(
      buildConversationAuditEvent({
        ...auditBase,
        type: "hermes_conversation_follow_up_created",
        at: now,
        state,
        nextAction,
        detailTr: "Takip adayı oluşturulması önerildi — gönderim yok, karar founder'a ait.",
      }),
    );
  }

  auditEvents.push(
    buildConversationAuditEvent({
      ...auditBase,
      type: "hermes_conversation_completed",
      at: now,
      state,
      nextAction,
      detailTr: "Konuşma kararı hazır — hiçbir mesaj gönderilmedi.",
    }),
  );

  return {
    id: `conversation:${leadId ?? missionId ?? providerMessageIdSafe}:${providerMessageIdSafe}`,
    missionId,
    leadId,
    providerMessageIdSafe,
    state,
    priority,
    mapped,
    confidence: intelligence.confidence,
    urgency: intelligence.urgency,
    replyPreviewSafe,
    whatHappenedTr,
    whyItMattersTr,
    hermesRecommendationTr,
    nextAction,
    founderActionRequired: flags.founderActionRequired,
    founderActionLabelTr,
    replyDraftNeeded: flags.replyDraftNeeded,
    approvalRequired: flags.approvalRequired,
    demoSchedulingNeeded: flags.demoSchedulingNeeded,
    callSchedulingNeeded: flags.callSchedulingNeeded,
    followUpNeeded: flags.followUpNeeded,
    // C4 satış sonucunu ASLA kendisi güncellemez — outcome mevcut
    // demo→outcome zincirinin ve founder'ın işidir (Sales Outcome
    // source-of-truth). Bu bayrak yapısal olarak her zaman false.
    outcomeUpdateNeeded: false,
    conversationClosed: flags.conversationClosed,
    createdAt: now,
    auditEvents,
  };
}

/* ── özet + sıralama ─────────────────────────────────────────── */

export type ConversationSummary = {
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

const CLOSED_STATES: ReadonlySet<ConversationState> = new Set([
  "not_interested",
  "wrong_number",
  "closed_won",
  "closed_lost",
  "blocked",
]);

export function summarizeConversationDecisions(items: ConversationDecision[]): ConversationSummary {
  const byState = (s: ConversationState) => items.filter((i) => i.state === s).length;
  return {
    total: items.length,
    hotOpportunity: byState("hot_opportunity"),
    pricingDiscussion: byState("pricing_discussion"),
    demoRequested: byState("demo_requested"),
    callRequested: byState("call_requested"),
    followUpLater: byState("follow_up_later"),
    reviewRequired: byState("human_review_required"),
    notInterested: byState("not_interested"),
    wrongNumber: byState("wrong_number"),
    closed: items.filter((i) => CLOSED_STATES.has(i.state)).length,
  };
}

/** Aktif/ticari açıdan anlamlı konuşmalar — pasif ve kapalı durumlar hariç. */
export function isActiveConversation(item: Pick<ConversationDecision, "state">): boolean {
  return !CLOSED_STATES.has(item.state) && item.state !== "awaiting_reply" && item.state !== "reply_received";
}

const PRIORITY_SORT_WEIGHT: Record<ConversationPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Deterministik: öncelik → createdAt (yeni önce) → leadId. Girdi mutate edilmez. */
export function sortConversationDecisions(items: ConversationDecision[]): ConversationDecision[] {
  return [...items].sort((a, b) => {
    const p = PRIORITY_SORT_WEIGHT[a.priority] - PRIORITY_SORT_WEIGHT[b.priority];
    if (p !== 0) return p;
    if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
    return (a.leadId ?? "").localeCompare(b.leadId ?? "");
  });
}
