import type { HermesOutreachPolicy, OutreachLanguage } from "./hermes-outreach-policy.ts";

/**
 * Hermes Autonomous Outreach Runtime (Sprint C3 — Autonomous Outreach).
 *
 * Saf, deterministik HAZIRLIK katmanı. Zincirin eksik halkasını doldurur:
 *
 *   Discovery → Qualification → Sales Ready → **Outreach Preparation** →
 *   Founder Approval → Controlled WhatsApp Send
 *
 * Bu modül YALNIZ hazırlar; ASLA göndermez, ASLA onaylamaz. Yapısal koruma:
 *  - hiçbir mesajlaşma/provider/gateway modülünü import etmez → gönderim
 *    tip düzeyinde imkânsızdır;
 *  - `AutonomousOutreachDecision` üzerinde `sendAllowed` / `founderApproved`
 *    diye bir alan yoktur → onay üretemez;
 *  - `recommendedTemplate` bir template ANAHTARIDIR, ham mesaj metni değildir
 *    — gerçek metin mevcut Courier Draft motoru (`hermes-courier.ts`)
 *    tarafından, founder onay döngüsünde üretilir. Bu modül yeni bir template
 *    sistemi kurmaz; var olanı SEÇER.
 *
 * Yeni skor/AI HESAPLAMAZ: her okuma mevcut bir alanın lookup'ıdır
 * (qualification sonucu + enrichment'lı lead sinyalleri). Personalization
 * yalnız var olan veriden türetilir; hiçbir dış çağrı, hiçbir LLM.
 *
 * Kasıtlı olarak bağımsız ("@/" import'u, React, browser API yok) —
 * `node --test` altında koşar; tüm mevcut Hermes lib modülleriyle aynı kalıp.
 */

/* ── tipler ─────────────────────────────────────────────────── */

export type OutreachStatus =
  | "waiting"
  | "draft_ready"
  | "approval_required"
  | "blocked"
  | "not_eligible"
  | "completed";

/** Öncelik: Doğrulanmış WhatsApp → Telefon → Instagram → Website → Bilinmiyor. Yalnız ÖNERİ — gönderim yok. */
export type OutreachChannel = "whatsapp" | "phone" | "instagram" | "website" | "unknown";

/** Courier template motorunun kanal anahtarlarıyla hizalı — yeni template sistemi değil, mevcut olanın seçimi. */
export type OutreachTemplateKey =
  | "whatsapp-intro"
  | "instagram-intro"
  | "email-intro"
  | "generic-intro";

export type OutreachTone = "consultative" | "direct" | "soft";

export type OutreachLength = "short" | "medium";

export type OutreachBlockedReason =
  | "not_sales_ready"
  | "no_mission"
  | "duplicate_draft"
  | "no_contact_path"
  | "do_not_contact"
  | "policy_disabled"
  | "invalid_lead";

export type OutreachNextAction =
  | "await_founder_approval"
  | "verify_contact"
  | "review_qualification"
  | "none";

/** ScoredLead'in yapısal alt kümesi — gerçek her ScoredLead bu tipi otomatik karşılar. */
export type OutreachLeadLike = {
  id?: string;
  name?: string;
  city?: string;
  phone?: string;
  website?: string;
  websiteCandidateUrl?: string;
  instagram?: string;
  leadType?: string;
  businessType?: string;
  doNotContact?: boolean;
  whatsappInvalid?: boolean;
  whatsappConfidence?: string;
  units?: number;
  adsLikelihood?: string;
  otaDependencyLikelihood?: number;
  signalVerification?: {
    whatsappVerification?: string;
    websiteVerification?: string;
    reservationSignal?: string;
    instagramVerification?: string;
  };
  icpAlignment?: {
    estimatedPropertySize?: string;
    estimatedDemandVolume?: string;
    otaDependencyLevel?: string;
  };
  websiteIntelligence?: {
    hasWhatsAppLink?: boolean;
    hasBookingEngine?: boolean;
    hasOtaOutboundLinks?: boolean;
  };
};

/** Qualification sonucunun outreach'ın okuduğu alt kümesi — gerçek `QualificationResult` bunu otomatik karşılar. */
export type OutreachQualificationLike = {
  leadId: string | null;
  status: string;
  eligibleForMission: boolean;
  eligibleForOutreachDraft: boolean;
  founderSummaryTr?: string;
  positiveReasons?: string[];
};

/** Mission'ın outreach'ın okuduğu alt kümesi. Server tarafında mission client'ta oluştuğundan null olabilir. */
export type OutreachMissionLike = {
  missionId: string;
} | null;

export type OutreachInput = {
  qualification: OutreachQualificationLike;
  lead: OutreachLeadLike;
  /** Bu lead için zaten oluşmuş bir satış işi (varsa). Server run'da null — mission client'ta oluşur. */
  mission?: OutreachMissionLike;
  /** Bu lead için zaten hazır bir taslak varsa true → duplicate hazırlık engellenir. */
  existingDraft?: boolean;
  acquisitionRunId?: string | null;
  policy: HermesOutreachPolicy;
  currentTime: number;
};

export type OutreachPersonalizationSignal = {
  key: string;
  /** Founder-güvenli Türkçe etiket — ham telefon/secret/iç enum asla içermez. */
  labelTr: string;
};

export type OutreachAuditEventType =
  | "hermes_outreach_requested"
  | "hermes_outreach_prepared"
  | "hermes_outreach_blocked"
  | "hermes_outreach_waiting"
  | "hermes_outreach_ready"
  | "hermes_outreach_approval_created"
  | "hermes_outreach_completed";

export type OutreachAuditEvent = {
  type: OutreachAuditEventType;
  at: number;
  leadId: string | null;
  missionId: string | null;
  acquisitionRunId: string | null;
  status: OutreachStatus | null;
  /** Türkçe, founder-güvenli detay — asla ham mesaj metni, telefon, secret veya provider verisi içermez. */
  detailTr: string;
};

export type AutonomousOutreachDecision = {
  id: string;
  missionId: string | null;
  leadId: string | null;
  status: OutreachStatus;
  eligible: boolean;
  blockedReason: OutreachBlockedReason | null;
  draftNeeded: boolean;
  approvalNeeded: boolean;
  recommendedChannel: OutreachChannel;
  recommendedLanguage: OutreachLanguage;
  recommendedTemplate: OutreachTemplateKey;
  recommendedTone: OutreachTone;
  recommendedLength: OutreachLength;
  personalizationSignals: OutreachPersonalizationSignal[];
  founderSummary: string;
  hermesRecommendation: string;
  nextAction: OutreachNextAction;
  acquisitionRunId: string | null;
  createdAt: number;
  auditEvents: OutreachAuditEvent[];
};

/* ── founder sözlüğü ────────────────────────────────────────── */

export const OUTREACH_STATUS_LABELS_TR: Record<OutreachStatus, string> = {
  waiting: "Hazırlanıyor",
  draft_ready: "Taslak Hazır",
  approval_required: "Founder Onayı Bekliyor",
  blocked: "Engellendi",
  not_eligible: "Uygun Değil",
  completed: "Tamamlandı",
};

export const OUTREACH_CHANNEL_LABELS_TR: Record<OutreachChannel, string> = {
  whatsapp: "WhatsApp",
  phone: "Telefon",
  instagram: "Instagram",
  website: "Web Sitesi",
  unknown: "Kanal Belirsiz",
};

export const OUTREACH_TEMPLATE_LABELS_TR: Record<OutreachTemplateKey, string> = {
  "whatsapp-intro": "WhatsApp İlk Temas",
  "instagram-intro": "Instagram İlk Temas",
  "email-intro": "E-posta İlk Temas",
  "generic-intro": "Genel İlk Temas",
};

export const OUTREACH_TONE_LABELS_TR: Record<OutreachTone, string> = {
  consultative: "Danışman",
  direct: "Doğrudan",
  soft: "Yumuşak",
};

export const OUTREACH_LENGTH_LABELS_TR: Record<OutreachLength, string> = {
  short: "Kısa",
  medium: "Orta",
};

export const OUTREACH_LANGUAGE_LABELS_TR: Record<OutreachLanguage, string> = {
  tr: "Türkçe",
  en: "İngilizce",
};

export const OUTREACH_BLOCKED_LABELS_TR: Record<OutreachBlockedReason, string> = {
  not_sales_ready: "İşletme henüz satışa hazır değil",
  no_mission: "Bu işletme için henüz satış işi açılmadı",
  duplicate_draft: "Bu işletme için zaten bir mesaj hazırlandı",
  no_contact_path: "Güvenilir iletişim kanalı doğrulanmadı",
  do_not_contact: "İletişim yasağı (DNC) aktif",
  policy_disabled: "Çalışma kuralları şu anda mesaj hazırlamaya izin vermiyor",
  invalid_lead: "Değerlendirme için yeterli işletme bilgisi yok",
};

export const OUTREACH_NEXT_ACTION_LABELS_TR: Record<OutreachNextAction, string> = {
  await_founder_approval: "Founder onayı bekleniyor — mesaj hazır, gönderim senin onayınla.",
  verify_contact: "İletişim kanalı önce doğrulanacak.",
  review_qualification: "Önce founder incelemesi bekleniyor.",
  none: "Şimdilik işlem yapılmayacak.",
};

/* ── sinyal okumaları — hepsi mevcut alan lookup'ı ──────────── */

function hasPhone(lead: OutreachLeadLike): boolean {
  return Boolean(lead.phone?.trim()) && lead.whatsappInvalid !== true;
}

function whatsappState(lead: OutreachLeadLike): "verified" | "likely" | "none" {
  const v = lead.signalVerification?.whatsappVerification;
  if (v === "verified") return "verified";
  if (v === "likely") return "likely";
  if (lead.whatsappConfidence === "confirmed") return "verified";
  if (lead.whatsappConfidence === "likely" || lead.websiteIntelligence?.hasWhatsAppLink === true) {
    return "likely";
  }
  return "none";
}

function instagramState(lead: OutreachLeadLike): "verified" | "likely" | "none" {
  const v = lead.signalVerification?.instagramVerification;
  if (v === "verified") return "verified";
  if (v === "likely") return "likely";
  if (lead.instagram?.trim()) return "likely";
  return "none";
}

function hasWebsite(lead: OutreachLeadLike): boolean {
  return Boolean(lead.website?.trim()) || Boolean(lead.websiteCandidateUrl?.trim());
}

/** Outreach taslağına güvenilir kanal: telefon ya da doğrulanmış/olası WhatsApp. Yalnız website yetmez. */
function hasTrustedContactChannel(lead: OutreachLeadLike): boolean {
  return hasPhone(lead) || whatsappState(lead) !== "none";
}

function reservationReady(lead: OutreachLeadLike): boolean {
  const r = lead.signalVerification?.reservationSignal;
  return r === "verified" || r === "detected" || lead.websiteIntelligence?.hasBookingEngine === true;
}

function highOtaDependency(lead: OutreachLeadLike): boolean {
  return (
    lead.icpAlignment?.otaDependencyLevel === "high" ||
    (lead.otaDependencyLikelihood ?? 0) >= 60 ||
    lead.websiteIntelligence?.hasOtaOutboundLinks === true
  );
}

function marketingActive(lead: OutreachLeadLike): boolean {
  return lead.adsLikelihood === "confirmed" || lead.adsLikelihood === "likely";
}

/* ── kanal ──────────────────────────────────────────────────── */

/**
 * Öncelik: Doğrulanmış WhatsApp → Telefon → Instagram → Website → Bilinmiyor.
 * Yalnız ÖNERİ döner — bu modül hiçbir şey göndermez. Policy Instagram/website
 * kanallarını kapatabilir (o zaman bir alt seçeneğe düşülür).
 */
export function deriveRecommendedChannel(
  lead: OutreachLeadLike,
  policy: HermesOutreachPolicy,
): OutreachChannel {
  const wa = whatsappState(lead);
  if (wa === "verified") return "whatsapp";
  if (hasPhone(lead)) return "phone";
  if (wa === "likely") return "whatsapp";
  if (policy.allowInstagramChannel && instagramState(lead) !== "none") return "instagram";
  if (policy.allowWebsiteChannel && hasWebsite(lead)) return "website";
  return "unknown";
}

/* ── template SEÇİMİ (yeni sistem değil) ────────────────────── */

/**
 * Kanal → Courier template anahtarı. Yeni template metni ÜRETMEZ; mevcut
 * Courier Draft motorunun (`hermes-courier.ts`) kanal-bazlı template'ini
 * SEÇER. Birden çok template varsa buradaki tek seçim kuralı geçerlidir.
 */
export function deriveTemplate(channel: OutreachChannel): OutreachTemplateKey {
  switch (channel) {
    case "instagram":
      return "instagram-intro";
    case "website":
      return "email-intro";
    case "whatsapp":
    case "phone":
      return "whatsapp-intro";
    case "unknown":
    default:
      return "generic-intro";
  }
}

/* ── ton ────────────────────────────────────────────────────── */

/**
 * Ton, outreach felsefesiyle (danışmanlık > iddia) hizalı biçimde mevcut
 * sinyallerden türetilir. Varsayılan "danışman"; güçlü ticari acı sinyali
 * (yüksek OTA bağımlılığı) doğrudan bir tona; sinyalsizlik yumuşak tona.
 */
export function deriveTone(lead: OutreachLeadLike): OutreachTone {
  if (highOtaDependency(lead) || reservationReady(lead)) return "consultative";
  if (marketingActive(lead)) return "direct";
  return "soft";
}

/* ── dil ────────────────────────────────────────────────────── */

/** Dil mevcut veriden türetilir; TR pazarı için varsayılan policy dilidir. */
export function deriveLanguage(
  lead: OutreachLeadLike,
  policy: HermesOutreachPolicy,
): OutreachLanguage {
  void lead;
  return policy.defaultLanguage;
}

/* ── uzunluk ────────────────────────────────────────────────── */

/** Mobil öncelikli, 2–4 satır → varsayılan kısa. */
function deriveLength(): OutreachLength {
  return "short";
}

/* ── personalization — yalnız mevcut veriden ────────────────── */

/**
 * Personalization sinyalleri YALNIZ zaten var olan lead alanlarından
 * türetilir — hiçbir dış çağrı, hiçbir LLM, hiçbir yeni veri. Her sinyal
 * founder-güvenli Türkçe bir etikettir; ham telefon veya iç payload asla
 * içermez.
 */
export function derivePersonalization(
  lead: OutreachLeadLike,
  channel: OutreachChannel,
): OutreachPersonalizationSignal[] {
  const signals: OutreachPersonalizationSignal[] = [];
  const name = lead.name?.trim();
  if (name) signals.push({ key: "hotel_name", labelTr: `Otel adı: ${name}` });
  if (lead.city?.trim()) signals.push({ key: "city", labelTr: `Şehir: ${lead.city.trim()}` });

  const propertyType = lead.leadType?.trim() || lead.businessType?.trim();
  if (propertyType) signals.push({ key: "property_type", labelTr: `Tesis türü: ${propertyType}` });

  const size = lead.icpAlignment?.estimatedPropertySize;
  if (size === "medium" || size === "large" || (lead.units ?? 0) >= 10) {
    signals.push({ key: "property_scale", labelTr: "Tesis ölçeği hedefe uygun" });
  }
  if (hasWebsite(lead)) signals.push({ key: "website", labelTr: "Web sitesi var" });
  if (reservationReady(lead)) {
    signals.push({ key: "reservation_cta", labelTr: "Rezervasyon altyapısı bulundu" });
  }
  if (highOtaDependency(lead)) {
    signals.push({ key: "ota_dependency", labelTr: "OTA bağımlılığı yüksek — doğrudan satış ihtiyacı belirgin" });
  }
  if (lead.icpAlignment?.estimatedDemandVolume === "high") {
    signals.push({ key: "digital_demand", labelTr: "Dijital talep yüksek" });
  }
  if (marketingActive(lead)) signals.push({ key: "ads", labelTr: "Dijital reklam izi bulundu" });
  if (channel !== "unknown") {
    signals.push({ key: "contact_channel", labelTr: `İletişim kanalı: ${OUTREACH_CHANNEL_LABELS_TR[channel]}` });
  }
  return signals;
}

/* ── sonraki aksiyon ────────────────────────────────────────── */

export function deriveNextAction(status: OutreachStatus): OutreachNextAction {
  switch (status) {
    case "draft_ready":
    case "approval_required":
      return "await_founder_approval";
    case "waiting":
      return "verify_contact";
    case "blocked":
    case "not_eligible":
      return "review_qualification";
    case "completed":
      return "none";
  }
}

/* ── uygunluk + blokaj ──────────────────────────────────────── */

type EligibilityResult = {
  eligible: boolean;
  blockedReason: OutreachBlockedReason | null;
};

/**
 * Outreach YALNIZ şu koşulların tamamında hazırlanır:
 *  - qualification == sales_ready
 *  - mission var (server run'da: qualification.eligibleForMission — mission
 *    client'ta oluşacağının server proxy'si; client entegrasyonunda gerçek
 *    mission objesi)
 *  - duplicate taslak yok
 *  - iletişim yolu doğrulanmış (qualification.eligibleForOutreachDraft +
 *    güvenilir kanal)
 *  - blokaj yok (DNC, geçersiz lead)
 *  - policy açık
 * Aksi halde ASLA hazırlanmaz.
 */
function evaluateEligibility(input: OutreachInput): EligibilityResult {
  const { qualification, lead, policy } = input;
  const block = (r: OutreachBlockedReason): EligibilityResult => ({ eligible: false, blockedReason: r });

  if (!policy.enabled) return block("policy_disabled");
  if (!lead.id?.trim() || !lead.name?.trim() || !qualification.leadId) return block("invalid_lead");
  if (lead.doNotContact === true) return block("do_not_contact");
  if (qualification.status !== "sales_ready") return block("not_sales_ready");
  // Mission proxy: server run'da eligibleForMission; client'ta gerçek mission.
  const missionKnown = Boolean(input.mission?.missionId) || qualification.eligibleForMission === true;
  if (!missionKnown) return block("no_mission");
  if (input.existingDraft === true) return block("duplicate_draft");
  if (policy.requireTrustedChannel && !hasTrustedContactChannel(lead)) return block("no_contact_path");
  if (!qualification.eligibleForOutreachDraft) return block("no_contact_path");

  return { eligible: true, blockedReason: null };
}

/* ── founder copy ───────────────────────────────────────────── */

function founderSummaryFor(
  status: OutreachStatus,
  lead: OutreachLeadLike,
  channel: OutreachChannel,
): string {
  const name = lead.name?.trim() || "Bu işletme";
  switch (status) {
    case "draft_ready":
    case "approval_required":
      return `Hermes ${name} için ${OUTREACH_CHANNEL_LABELS_TR[channel]} mesajı hazırladı — onayın bekleniyor.`;
    case "waiting":
      return `Hermes ${name} için mesaj hazırlığına başladı; önce iletişim kanalı doğrulanacak.`;
    case "blocked":
      return `${name} için şu anda mesaj hazırlanamıyor.`;
    case "not_eligible":
      return `Hermes ${name} işletmesini şu anda mesaj hazırlığına uygun görmedi.`;
    case "completed":
      return `${name} için mesaj hazırlığı tamamlandı.`;
  }
}

function hermesRecommendationFor(status: OutreachStatus): string {
  switch (status) {
    case "draft_ready":
    case "approval_required":
      return "Mesajı incele ve onayla — gönderim yalnız senin onayınla yapılır. Hermes hiçbir mesaj göndermez.";
    case "waiting":
      return "Hermes önce güvenilir iletişim kanalını doğrulamak istiyor.";
    case "blocked":
      return "Hermes bu işletmeyi güvenli nedenlerle beklemeye aldı.";
    case "not_eligible":
      return "Hermes bu işletme satışa hazır olduğunda yeniden değerlendirecek.";
    case "completed":
      return "Bu fırsat için mesaj hazırlığı tamamlandı.";
  }
}

/* ── audit ──────────────────────────────────────────────────── */

export type BuildOutreachAuditEventInput = {
  type: OutreachAuditEventType;
  at: number;
  leadId?: string | null;
  missionId?: string | null;
  acquisitionRunId?: string | null;
  status?: OutreachStatus | null;
  detailTr: string;
};

/**
 * Outreach audit event'lerinin tek kurucusu — qualification/acquisition'ın
 * scrubber kalıbının aynısı: token/secret/telefon görünümlü her şey son
 * savunma hattı olarak temizlenir (çağıranlar zaten asla geçirmez).
 */
export function buildOutreachAuditEvent(input: BuildOutreachAuditEventInput): OutreachAuditEvent {
  const scrubbed = input.detailTr
    .replace(/Bearer\s+\S+/gi, "Bearer [gizli]")
    .replace(/(key|token|secret)=\S+/gi, "$1=[gizli]")
    .replace(/\+?\d[\d\s\-()]{8,}\d/g, "[numara gizli]");
  return {
    type: input.type,
    at: input.at,
    leadId: input.leadId ?? null,
    missionId: input.missionId ?? null,
    acquisitionRunId: input.acquisitionRunId ?? null,
    status: input.status ?? null,
    detailTr: scrubbed,
  };
}

/* ── ana değerlendirme ──────────────────────────────────────── */

export function evaluateAutonomousOutreach(input: OutreachInput): AutonomousOutreachDecision {
  const { lead, policy } = input;
  const now = input.currentTime;
  const leadId = lead.id?.trim() || input.qualification.leadId || null;
  const missionId = input.mission?.missionId ?? null;
  const runId = input.acquisitionRunId ?? null;

  const { eligible, blockedReason } = evaluateEligibility(input);

  const channel = deriveRecommendedChannel(lead, policy);
  const language = deriveLanguage(lead, policy);
  const template = deriveTemplate(channel);
  const tone = deriveTone(lead);
  const length = deriveLength();
  const personalizationSignals = derivePersonalization(lead, channel);

  /**
   * Durum:
   *  - policy kapalı / DNC / geçersiz lead → blocked
   *  - sales_ready değil / mission yok / duplicate → not_eligible
   *  - uygun ama güvenilir kanal doğrulanmamış → waiting
   *  - uygun + kanal hazır → draft_ready → approval_required (founder onayı)
   */
  let status: OutreachStatus;
  if (!eligible) {
    const hardBlock: OutreachBlockedReason[] = ["policy_disabled", "do_not_contact", "invalid_lead"];
    status = blockedReason && hardBlock.includes(blockedReason) ? "blocked" : "not_eligible";
  } else if (!hasTrustedContactChannel(lead)) {
    status = "waiting";
  } else {
    // Taslak hazırlanmalı → mevcut Founder Approval akışına düşürülür.
    status = "approval_required";
  }

  // Bu runtime `draft_ready`'yi doğrudan `approval_required`'e taşır — hazırlanan
  // her taslak founder onay akışına düşer. `draft_ready` yine geçerli bir durumdur
  // (registry/founder katmanı okur) ama evaluate onu ara durum olarak üretmez.
  const draftNeeded = status === "approval_required";
  // Founder onayı HER hazırlanan taslak için zorunlu — asla auto-approve.
  const approvalNeeded = draftNeeded && policy.requireFounderApproval;
  const nextAction = deriveNextAction(status);

  const founderSummary = founderSummaryFor(status, lead, channel);
  const hermesRecommendation = hermesRecommendationFor(status);

  const auditBase = { leadId, missionId, acquisitionRunId: runId };
  const auditEvents: OutreachAuditEvent[] = [
    buildOutreachAuditEvent({
      ...auditBase,
      type: "hermes_outreach_requested",
      at: now,
      detailTr: `Mesaj hazırlığı değerlendirildi: ${lead.name?.trim() || "isimsiz işletme"}.`,
    }),
  ];

  if (status === "blocked" || status === "not_eligible") {
    auditEvents.push(
      buildOutreachAuditEvent({
        ...auditBase,
        type: "hermes_outreach_blocked",
        at: now,
        status,
        detailTr: blockedReason
          ? OUTREACH_BLOCKED_LABELS_TR[blockedReason]
          : "Mesaj hazırlığı için uygun değil.",
      }),
    );
  } else if (status === "waiting") {
    auditEvents.push(
      buildOutreachAuditEvent({
        ...auditBase,
        type: "hermes_outreach_waiting",
        at: now,
        status,
        detailTr: "İletişim kanalı doğrulanana kadar mesaj hazırlığı bekletiliyor.",
      }),
    );
  } else {
    auditEvents.push(
      buildOutreachAuditEvent({
        ...auditBase,
        type: "hermes_outreach_prepared",
        at: now,
        status,
        detailTr: `${OUTREACH_CHANNEL_LABELS_TR[channel]} mesajı hazırlandı — gönderilmedi.`,
      }),
      buildOutreachAuditEvent({
        ...auditBase,
        type: "hermes_outreach_approval_created",
        at: now,
        status,
        detailTr: "Founder onayı istendi — mevcut onay akışına düşürüldü. Gönderim yapılmadı.",
      }),
      buildOutreachAuditEvent({
        ...auditBase,
        type: "hermes_outreach_ready",
        at: now,
        status,
        detailTr: `Mesaj hazırlığı tamamlandı: ${OUTREACH_STATUS_LABELS_TR[status]}.`,
      }),
    );
  }

  return {
    id: `outreach:${leadId ?? "unknown"}:${now}`,
    missionId,
    leadId,
    status,
    eligible,
    blockedReason,
    draftNeeded,
    approvalNeeded,
    recommendedChannel: channel,
    recommendedLanguage: language,
    recommendedTemplate: template,
    recommendedTone: tone,
    recommendedLength: length,
    personalizationSignals,
    founderSummary,
    hermesRecommendation,
    nextAction,
    acquisitionRunId: runId,
    createdAt: now,
    auditEvents,
  };
}

/* ── özet + sıralama ────────────────────────────────────────── */

export type OutreachSummary = {
  total: number;
  waiting: number;
  draftReady: number;
  approvalRequired: number;
  blocked: number;
  notEligible: number;
  completed: number;
  /** Founder'ın onayını bekleyen hazır mesaj sayısı (draft_ready + approval_required). */
  awaitingFounder: number;
};

export function summarizeOutreach(items: AutonomousOutreachDecision[]): OutreachSummary {
  const byStatus = (s: OutreachStatus) => items.filter((i) => i.status === s).length;
  const draftReady = byStatus("draft_ready");
  const approvalRequired = byStatus("approval_required");
  return {
    total: items.length,
    waiting: byStatus("waiting"),
    draftReady,
    approvalRequired,
    blocked: byStatus("blocked"),
    notEligible: byStatus("not_eligible"),
    completed: byStatus("completed"),
    awaitingFounder: draftReady + approvalRequired,
  };
}

const STATUS_SORT_WEIGHT: Record<OutreachStatus, number> = {
  approval_required: 0,
  draft_ready: 1,
  waiting: 2,
  not_eligible: 3,
  blocked: 4,
  completed: 5,
};

/** Deterministik: durum → createdAt (yeni önce) → leadId. Girdi mutate edilmez. */
export function sortOutreach(items: AutonomousOutreachDecision[]): AutonomousOutreachDecision[] {
  return [...items].sort((a, b) => {
    const s = STATUS_SORT_WEIGHT[a.status] - STATUS_SORT_WEIGHT[b.status];
    if (s !== 0) return s;
    if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
    return (a.leadId ?? "").localeCompare(b.leadId ?? "");
  });
}
