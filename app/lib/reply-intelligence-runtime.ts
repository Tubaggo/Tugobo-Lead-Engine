import type { WhatsAppInboundMessageType } from "./whatsapp-reply-listener-runtime.ts";

/**
 * Reply Intelligence Runtime (v6.3).
 *
 * Pure, deterministic, rule-based classifier — no `fetch`, no
 * `process.env` read, no AI provider call, no import of `next/server`.
 * Operates only on data `whatsapp-reply-listener-runtime.ts` already
 * sanitized in v6.2 (`textPreview` capped at 160 chars, sender masked,
 * mission mapping already resolved) — it never sees a raw phone number or
 * a full message body, because those never survive the v6.2 parser in the
 * first place.
 *
 * This module only classifies and suggests — it never sends, replies, or
 * follows up. `founderActionHint` is text for a human to read, not an
 * instruction Hermes acts on.
 */

export type ReplyIntent =
  | "demo_requested"
  | "pricing_question"
  | "interested"
  | "call_requested"
  | "later"
  | "not_interested"
  | "wrong_number"
  | "human_review_required"
  | "unknown";

export type ReplyConfidence = "high" | "medium" | "low";
export type ReplyUrgency = "high" | "medium" | "low";

export type ReplyIntelligenceAuditType =
  | "reply_intelligence_demo_requested"
  | "reply_intelligence_pricing_question"
  | "reply_intelligence_interested"
  | "reply_intelligence_call_requested"
  | "reply_intelligence_later"
  | "reply_intelligence_not_interested"
  | "reply_intelligence_wrong_number"
  | "reply_intelligence_human_review_required"
  | "reply_intelligence_unknown";

export const REPLY_INTENT_LABELS_TR: Record<ReplyIntent, string> = {
  demo_requested: "Demo Talebi",
  pricing_question: "Fiyat Sorusu",
  interested: "İlgileniyor",
  call_requested: "Arama İstiyor",
  later: "Daha Sonra",
  not_interested: "İlgilenmiyor",
  wrong_number: "Yanlış Numara",
  human_review_required: "İnsan İncelemesi Gerekli",
  unknown: "Bilinmiyor",
};

export type ReplyIntelligenceInput = {
  provider: "whatsapp";
  providerMessageId: string;
  messageType: WhatsAppInboundMessageType;
  textPreview: string | null;
  mapped: boolean;
  missionId: string | null;
  leadId: string | null;
  occurredAt: number;
  contactProfileNameSafe?: string | null;
};

export type ReplyIntentClassification = {
  intent: ReplyIntent;
  confidence: ReplyConfidence;
  reason: string;
};

export type ReplyIntelligenceItem = {
  provider: "whatsapp";
  providerMessageId: string;
  missionId: string | null;
  leadId: string | null;
  intent: ReplyIntent;
  confidence: ReplyConfidence;
  urgency: ReplyUrgency;
  founderActionHint: string;
  reason: string;
  textPreview: string | null;
  analyzedAt: number;
  auditType: ReplyIntelligenceAuditType;
};

/* ── Keyword rules (Turkish-first, basic English patterns included) ── */

const WRONG_NUMBER_KEYWORDS = ["yanlış numara", "burası değil", "otel değil", "wrong number"];
const NOT_INTERESTED_KEYWORDS = ["ilgilenmiyoruz", "ihtiyacımız yok", "gerek yok", "istemiyoruz", "no thanks", "not interested"];
const DEMO_REQUESTED_KEYWORDS = ["demo", "tanıtım", "görüşelim", "sunum", "randevu", "uygun zaman", "meeting"];
const PRICING_QUESTION_KEYWORDS = ["fiyat", "ücret", "paket", "abonelik", "kaç para", "maliyet", "price", "cost"];
const CALL_REQUESTED_KEYWORDS = ["arayın", "telefon", "beni ara", "call me", "numaramdan ulaşın"];
const LATER_KEYWORDS = ["sonra", "daha sonra", "şu an yoğun", "sezon sonrası", "haftaya", "later"];
const INTERESTED_KEYWORDS = ["ilgileniyoruz", "ilgilendik", "detay", "bilgi alabilir miyim", "anlatır mısınız", "send details"];

const MIN_USEFUL_TEXT_LENGTH = 4;

function normalize(text: string): string {
  return text.toLocaleLowerCase("tr-TR").trim();
}

function matchesAny(text: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

/**
 * Rule priority (highest first): wrong_number → not_interested →
 * demo_requested → pricing_question → call_requested → later → interested
 * → human_review_required → unknown. A message that matches two keyword
 * sets is resolved by this order alone — e.g. a reply containing both a
 * "not interested" and a "demo" phrase is `not_interested`, since that
 * category is checked first and returns immediately.
 */
export function classifyReplyIntent(input: ReplyIntelligenceInput): ReplyIntentClassification {
  const text = normalize(input.textPreview ?? "");

  if (matchesAny(text, WRONG_NUMBER_KEYWORDS)) {
    return { intent: "wrong_number", confidence: "high", reason: "Mesajda yanlış numara ifadesi bulundu." };
  }
  if (matchesAny(text, NOT_INTERESTED_KEYWORDS)) {
    return { intent: "not_interested", confidence: "high", reason: "Mesajda ilgisizlik belirten bir ifade bulundu." };
  }
  if (matchesAny(text, DEMO_REQUESTED_KEYWORDS)) {
    return { intent: "demo_requested", confidence: "high", reason: "Mesajda demo/tanıtım talebi belirten bir ifade bulundu." };
  }
  if (matchesAny(text, PRICING_QUESTION_KEYWORDS)) {
    return { intent: "pricing_question", confidence: "high", reason: "Mesajda fiyat/ücret ile ilgili bir ifade bulundu." };
  }
  if (matchesAny(text, CALL_REQUESTED_KEYWORDS)) {
    return { intent: "call_requested", confidence: "high", reason: "Mesajda arama talebi belirten bir ifade bulundu." };
  }
  if (matchesAny(text, LATER_KEYWORDS)) {
    return { intent: "later", confidence: "medium", reason: "Mesajda erteleme belirten bir ifade bulundu." };
  }
  if (matchesAny(text, INTERESTED_KEYWORDS)) {
    return { intent: "interested", confidence: "medium", reason: "Mesajda ilgi belirten bir ifade bulundu." };
  }

  if (text.length === 0) {
    return { intent: "human_review_required", confidence: "low", reason: "Metin önizlemesi yok — otomatik sınıflandırma yapılamadı." };
  }
  if (input.messageType === "button" || input.messageType === "interactive") {
    return { intent: "human_review_required", confidence: "low", reason: "Buton/etkileşimli yanıt net bir metin sinyali içermiyor." };
  }
  if (text.length < MIN_USEFUL_TEXT_LENGTH) {
    return { intent: "human_review_required", confidence: "low", reason: "Metin önizlemesi çok kısa — otomatik sınıflandırma güvenilir değil." };
  }
  if (!input.mapped) {
    return { intent: "human_review_required", confidence: "low", reason: "Mission eşleşmedi ve net bir sinyal yok — manuel inceleme gerekiyor." };
  }

  return { intent: "unknown", confidence: "low", reason: "Mesajda tanınan bir satış sinyali bulunamadı." };
}

/* ── Urgency ────────────────────────────────────────────────────── */

const URGENCY_BY_INTENT: Record<ReplyIntent, ReplyUrgency> = {
  demo_requested: "high",
  pricing_question: "high",
  call_requested: "high",
  wrong_number: "high",
  interested: "medium",
  later: "medium",
  human_review_required: "medium",
  not_interested: "low",
  unknown: "low",
};

export function deriveReplyUrgency(classification: Pick<ReplyIntentClassification, "intent">): ReplyUrgency {
  return URGENCY_BY_INTENT[classification.intent];
}

/**
 * "Hot" per the Founder Revenue Workspace's own definition (v6.3): any
 * high-urgency intent, or `interested` specifically (its urgency is
 * `medium`, but a founder still wants it surfaced alongside the sales-ready
 * signals). Shared by the summary tile and the Action Queue's `hot_reply`
 * stage so the two never drift out of sync.
 */
export function isHotReplyIntelligence(item: Pick<ReplyIntelligenceItem, "urgency" | "intent">): boolean {
  return item.urgency === "high" || item.intent === "interested";
}

/* ── Founder action hint ────────────────────────────────────────── */

const ACTION_HINT_BY_INTENT: Record<ReplyIntent, string> = {
  demo_requested: "Demo talebi var — hemen randevu planlayın.",
  pricing_question: "Fiyat sorusu geldi — paket bilgisini paylaşın.",
  interested: "İlgi gösterdi — detaylı bilgi gönderin.",
  call_requested: "Arama istedi — en kısa sürede arayın.",
  later: "Şu an uygun değil — daha sonra tekrar deneyin.",
  not_interested: "İlgilenmiyor — takipten çıkarmayı değerlendirin.",
  wrong_number: "Yanlış numara — lead bilgisini doğrulayın.",
  human_review_required: "Otomatik sınıflandırılamadı — mesajı manuel inceleyin.",
  unknown: "Net bir sinyal yok — mesajı gözden geçirin.",
};

export function deriveFounderActionHint(classification: Pick<ReplyIntentClassification, "intent"> & { mapped: boolean }): string {
  const base = ACTION_HINT_BY_INTENT[classification.intent];
  if (!classification.mapped) {
    return `${base} (mission eşleşmedi — lead'i manuel bulun.)`;
  }
  return base;
}

/* ── Audit ──────────────────────────────────────────────────────── */

const AUDIT_TYPE_BY_INTENT: Record<ReplyIntent, ReplyIntelligenceAuditType> = {
  demo_requested: "reply_intelligence_demo_requested",
  pricing_question: "reply_intelligence_pricing_question",
  interested: "reply_intelligence_interested",
  call_requested: "reply_intelligence_call_requested",
  later: "reply_intelligence_later",
  not_interested: "reply_intelligence_not_interested",
  wrong_number: "reply_intelligence_wrong_number",
  human_review_required: "reply_intelligence_human_review_required",
  unknown: "reply_intelligence_unknown",
};

/** Assembles the full sanitized classification item — the only thing ever stored or exposed. */
export function buildReplyIntelligenceEvent(
  input: ReplyIntelligenceInput,
  classification: ReplyIntentClassification,
  now: number = Date.now(),
): ReplyIntelligenceItem {
  return {
    provider: input.provider,
    providerMessageId: input.providerMessageId,
    missionId: input.missionId,
    leadId: input.leadId,
    intent: classification.intent,
    confidence: classification.confidence,
    urgency: deriveReplyUrgency(classification),
    founderActionHint: deriveFounderActionHint({ intent: classification.intent, mapped: input.mapped }),
    reason: classification.reason,
    textPreview: input.textPreview,
    analyzedAt: now,
    auditType: AUDIT_TYPE_BY_INTENT[classification.intent],
  };
}

/* ── Summary ────────────────────────────────────────────────────── */

export type ReplyIntelligenceSummary = {
  total: number;
  demoRequested: number;
  pricingQuestion: number;
  interested: number;
  callRequested: number;
  later: number;
  notInterested: number;
  wrongNumber: number;
  humanReviewRequired: number;
  unknown: number;
  highUrgency: number;
};

export function summarizeReplyIntelligence(items: ReplyIntelligenceItem[]): ReplyIntelligenceSummary {
  return {
    total: items.length,
    demoRequested: items.filter((i) => i.intent === "demo_requested").length,
    pricingQuestion: items.filter((i) => i.intent === "pricing_question").length,
    interested: items.filter((i) => i.intent === "interested").length,
    callRequested: items.filter((i) => i.intent === "call_requested").length,
    later: items.filter((i) => i.intent === "later").length,
    notInterested: items.filter((i) => i.intent === "not_interested").length,
    wrongNumber: items.filter((i) => i.intent === "wrong_number").length,
    humanReviewRequired: items.filter((i) => i.intent === "human_review_required").length,
    unknown: items.filter((i) => i.intent === "unknown").length,
    highUrgency: items.filter((i) => i.urgency === "high").length,
  };
}
