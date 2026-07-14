import type { HermesFollowUpPolicy } from "./hermes-follow-up-policy.ts";

/**
 * Hermes Autonomous Follow-up Orchestrator (Sprint C5).
 *
 * Saf, deterministik ORKESTRASYON katmanı. YENİ bir follow-up runtime
 * DEĞİLDİR: mevcut `follow-up-runtime.ts`'in ürettiği `FollowUpCandidate`'ı
 * (reason/status/timing) OKUR ve onu conversation/demo/outcome/teslimat
 * sinyalleriyle + zamanlama policy'siyle tek bir güvenli
 * `FollowUpOrchestrationDecision`'a bağlar:
 *
 *   Takip sinyali → due değerlendirmesi → taslak kararı → founder onayı
 *
 * Sert güvenlik (yapısal): hiçbir mesajlaşma/provider/gateway/send/onay
 * modülünü import ETMEZ → gönderim tip düzeyinde imkânsızdır.
 * `FollowUpOrchestrationDecision` üzerinde `sendAllowed`/`founderApproved`
 * alanı YOKTUR. `draftNeeded=true` yalnız "mevcut Courier taslak motoru +
 * founder onay akışı çalışsın" demektir; bu modül metin üretmez, göndermez.
 *
 * Girdi mutate edilmez, API çağrısı yapılmaz, mesaj gönderilmez.
 * Kasıtlı olarak bağımsız (no "@/", no React) — `node --test` altında koşar.
 */

/* ── mevcut modellerin yapısal alt kümeleri ─────────────────── */

/** `FollowUpReason`'ın yapısal kopyası — gerçek `FollowUpCandidate.reason` bunu karşılar. */
export type FollowUpTrigger =
  | "read_no_reply"
  | "delivered_no_reply"
  | "hot_reply_needs_action"
  | "demo_not_scheduled"
  | "demo_no_show"
  | "failed_delivery_recovery"
  | "later_requested"
  | "manual"
  | "unknown";

export type FollowUpOrchestrationPriority = "critical" | "high" | "medium" | "low";

export type FollowUpOrchestrationState =
  | "not_needed"
  | "waiting"
  | "due"
  | "draft_needed"
  | "approval_required"
  | "approved_waiting_send"
  | "completed"
  | "cancelled"
  | "dismissed"
  | "expired"
  | "blocked";

export type FollowUpChannelStrategy = "same_channel" | "manual_channel_review" | "no_channel";

/** Mevcut `FollowUpCandidate`'ın orchestrator'ın okuduğu alt kümesi. */
export type FollowUpCandidateLike = {
  id: string;
  missionId: string | null;
  leadId: string | null;
  reason: FollowUpTrigger;
  /** Mevcut runtime durumu: candidate/approval_required/approved/dismissed/completed/expired/... */
  status: string;
  priority: "high" | "medium" | "low";
  source: string;
  createdAt: number;
  expiresAt: number | null;
};

/**
 * Orchestrator'ın güncel dünya durumu için okuduğu sinyaller. Hepsi başka
 * registry'lerin zaten ürettiği gerçeklerdir; bu saf modül registry'lere
 * erişmez — aggregator (server servisi) bu boolean'ları toplayıp geçirir.
 */
export type FollowUpSignals = {
  /** Takip oluşturulduktan SONRA gelen yeni bir cevap var mı? */
  hasNewerReply?: boolean;
  /** Bu lead/mission için demo scheduled ya da completed mı? */
  demoScheduledOrCompleted?: boolean;
  /** Satış sonucu kazanıldı mı? */
  outcomeWon?: boolean;
  /** Satış sonucu kaybedildi mi? */
  outcomeLost?: boolean;
  /** Aktif konuşma ilgilenmiyor/yanlış numara/kapandı mı? */
  conversationNotInterested?: boolean;
  conversationWrongNumber?: boolean;
  conversationClosed?: boolean;
  /** Lead'de iletişim yasağı (DNC) var mı? */
  doNotContact?: boolean;
  /** Mission kapandı mı / lead geçersiz mi? */
  missionClosed?: boolean;
  leadInvalid?: boolean;
  /** Bu mission için zaten founder onayı bekleyen bir taslak var mı? (duplicate approval koruması) */
  hasActiveApprovalDraft?: boolean;
  /** Güvenilir iletişim kanalı var mı? (yoksa taslak hazırlanamaz) */
  hasContactPath?: boolean;
  /** Bu lead için mevcut takip sayısı (bu aday dahil). */
  followUpCountForLead?: number;
  /** Bu lead için EN SON diğer takibin zamanı (min aralık kontrolü). */
  mostRecentOtherFollowUpAt?: number | null;
};

export type FollowUpOrchestrationInput = {
  candidate: FollowUpCandidateLike;
  signals: FollowUpSignals;
  policy: HermesFollowUpPolicy;
  currentTime: number;
};

export type FollowUpOrchestrationAuditType =
  | "hermes_follow_up_evaluation_requested"
  | "hermes_follow_up_waiting"
  | "hermes_follow_up_due"
  | "hermes_follow_up_draft_requested"
  | "hermes_follow_up_draft_prepared"
  | "hermes_follow_up_approval_required"
  | "hermes_follow_up_cancelled"
  | "hermes_follow_up_suppressed"
  | "hermes_follow_up_completed"
  | "hermes_follow_up_expired"
  | "hermes_follow_up_blocked"
  | "hermes_follow_up_failed";

export type FollowUpOrchestrationAuditEvent = {
  type: FollowUpOrchestrationAuditType;
  at: number;
  followUpCandidateId: string;
  missionId: string | null;
  leadId: string | null;
  trigger: FollowUpTrigger;
  state: FollowUpOrchestrationState | null;
  dueAt: number | null;
  priority: FollowUpOrchestrationPriority;
  approvalRequired: boolean;
  /** Türkçe, founder-güvenli detay — asla ham cevap/telefon/secret/mesaj içermez. */
  detailTr: string;
};

export type FollowUpOrchestrationDecision = {
  id: string;
  followUpCandidateId: string;
  missionId: string | null;
  leadId: string | null;
  state: FollowUpOrchestrationState;
  trigger: FollowUpTrigger;
  priority: FollowUpOrchestrationPriority;
  dueAt: number | null;
  overdueByMinutes: number | null;
  channelStrategy: FollowUpChannelStrategy;
  draftNeeded: boolean;
  approvalRequired: boolean;
  founderActionRequired: boolean;
  founderActionLabelTr: string | null;
  whatHappenedTr: string;
  whyItMattersTr: string;
  hermesRecommendationTr: string;
  suggestedTimingTr: string;
  cancellationReasonTr: string | null;
  blockedReasonsTr: string[];
  createdAt: number;
  updatedAt: number;
  auditEvents: FollowUpOrchestrationAuditEvent[];
};

/* ── founder sözlüğü ────────────────────────────────────────── */

export const FOLLOW_UP_ORCH_STATE_LABELS_TR: Record<FollowUpOrchestrationState, string> = {
  not_needed: "Gerekmiyor",
  waiting: "Zamanı Bekliyor",
  due: "Zamanı Geldi",
  draft_needed: "Taslak Hazırlanacak",
  approval_required: "Founder Onayı Bekliyor",
  approved_waiting_send: "Onaylandı — Gönderim Bekliyor",
  completed: "Tamamlandı",
  cancelled: "İptal Edildi",
  dismissed: "Vazgeçildi",
  expired: "Süresi Doldu",
  blocked: "Durduruldu",
};

export const FOLLOW_UP_TRIGGER_LABELS_TR: Record<FollowUpTrigger, string> = {
  read_no_reply: "Okundu, Cevap Yok",
  delivered_no_reply: "Teslim Edildi, Cevap Yok",
  hot_reply_needs_action: "Sıcak Cevap — Aksiyon Gerekli",
  demo_not_scheduled: "Demo Planlanmadı",
  demo_no_show: "Demoya Gelinmedi",
  failed_delivery_recovery: "Teslimat Başarısız",
  later_requested: "Daha Sonra Denmişti",
  manual: "Manuel Takip",
  unknown: "Belirsiz",
};

const FOUNDER_ACTION_LABELS: Record<FollowUpOrchestrationState, string | null> = {
  not_needed: null,
  waiting: null,
  due: "Takibi İncele",
  draft_needed: "Taslağı İncele",
  approval_required: "Taslağı İncele",
  approved_waiting_send: null,
  completed: null,
  cancelled: null,
  dismissed: null,
  expired: null,
  blocked: "İletişim Kanalını Kontrol Et",
};

/* ── trigger türetme ────────────────────────────────────────── */

const KNOWN_TRIGGERS: ReadonlySet<FollowUpTrigger> = new Set([
  "read_no_reply", "delivered_no_reply", "hot_reply_needs_action", "demo_not_scheduled",
  "demo_no_show", "failed_delivery_recovery", "later_requested", "manual", "unknown",
]);

export function deriveFollowUpTrigger(candidate: FollowUpCandidateLike): FollowUpTrigger {
  if (candidate.source === "manual") return "manual";
  return KNOWN_TRIGGERS.has(candidate.reason) ? candidate.reason : "unknown";
}

/* ── dueAt ──────────────────────────────────────────────────── */

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/** Trigger'a göre policy gecikmesi (ms). Tamamen deterministik ve server-kontrollü. */
function delayMsFor(trigger: FollowUpTrigger, policy: HermesFollowUpPolicy): number {
  switch (trigger) {
    case "read_no_reply":
      return policy.readNoReplyDelayHours * HOUR_MS;
    case "delivered_no_reply":
      return policy.deliveredNoReplyDelayHours * HOUR_MS;
    case "hot_reply_needs_action":
      return policy.hotReplyActionDelayMinutes * MINUTE_MS;
    case "demo_not_scheduled":
      return policy.demoNotScheduledDelayHours * HOUR_MS;
    case "demo_no_show":
      return policy.demoNoShowDelayHours * HOUR_MS;
    case "failed_delivery_recovery":
      return policy.failedDeliveryRecoveryDelayMinutes * MINUTE_MS;
    case "later_requested":
      return policy.laterRequestedDefaultDelayHours * HOUR_MS;
    case "manual":
    case "unknown":
      return policy.laterRequestedDefaultDelayHours * HOUR_MS;
  }
}

/** dueAt = takip oluşturma zamanı + policy gecikmesi. Deterministik; girdi mutate edilmez. */
export function deriveFollowUpDueAt(input: FollowUpOrchestrationInput): number {
  const trigger = deriveFollowUpTrigger(input.candidate);
  return input.candidate.createdAt + delayMsFor(trigger, input.policy);
}

/* ── iptal / bastırma ───────────────────────────────────────── */

export type FollowUpCancellation = {
  cancelled: boolean;
  /** Kapanma türü: cancel/suppress/block/expire — audit tipi seçimi için. */
  kind: "cancelled" | "blocked" | "expired" | null;
  reasonTr: string | null;
};

/**
 * Takip şu durumlarda otomatik kapanır. Sıra önemlidir: en güvenlik-kritik
 * bloklar (DNC, ilgilenmiyor, yanlış numara) önce; sonra ilerleme sinyalleri
 * (cevap geldi, demo planlandı, sonuç kesinleşti); sonra sayaç/aralık/süre.
 */
export function deriveFollowUpCancellation(input: FollowUpOrchestrationInput): FollowUpCancellation {
  const { candidate, signals, policy, currentTime } = input;

  // Mevcut runtime durumu zaten terminal ise onu yansıt.
  if (candidate.status === "completed") return { cancelled: true, kind: null, reasonTr: null };
  if (candidate.status === "dismissed") {
    return { cancelled: true, kind: "cancelled", reasonTr: "Founder bu takipten vazgeçti." };
  }
  if (candidate.status === "expired") {
    return { cancelled: true, kind: "expired", reasonTr: "Takip süresi dolduğu için kapatıldı." };
  }

  // Sert bloklar.
  if (policy.blockDoNotContact && signals.doNotContact) {
    return { cancelled: true, kind: "blocked", reasonTr: "İletişim yasağı nedeniyle takip yapılmıyor." };
  }
  if (policy.blockNotInterested && signals.conversationNotInterested) {
    return { cancelled: true, kind: "cancelled", reasonTr: "İşletme ilgilenmediğini belirttiği için takip durduruldu." };
  }
  if (policy.blockWrongNumber && signals.conversationWrongNumber) {
    return { cancelled: true, kind: "blocked", reasonTr: "Yanlış numara olduğu için takip durduruldu." };
  }

  // İlerleme sinyalleri.
  if (signals.outcomeWon) {
    return { cancelled: true, kind: "cancelled", reasonTr: "Satış kazanıldığı için takip kapatıldı." };
  }
  if (signals.outcomeLost) {
    return { cancelled: true, kind: "cancelled", reasonTr: "Satış kaybedildiği için takip kapatıldı." };
  }
  if (signals.conversationClosed) {
    return { cancelled: true, kind: "cancelled", reasonTr: "Konuşma kapandığı için takip durduruldu." };
  }
  if (signals.missionClosed) {
    return { cancelled: true, kind: "cancelled", reasonTr: "Satış işi kapandığı için takip kapatıldı." };
  }

  // Demo planlandı/tamamlandı → demo-ilişkili takipler artık gereksiz.
  const trigger = deriveFollowUpTrigger(candidate);
  const demoRelated = trigger === "demo_not_scheduled" || trigger === "hot_reply_needs_action";
  if (signals.demoScheduledOrCompleted && demoRelated) {
    return { cancelled: true, kind: "cancelled", reasonTr: "Demo planlandığı için takip kapatıldı." };
  }

  // Cevap-bekleyen takipler için yeni cevap geldiyse iptal.
  const noReplyTrigger = trigger === "read_no_reply" || trigger === "delivered_no_reply";
  if (signals.hasNewerReply && noReplyTrigger) {
    return { cancelled: true, kind: "cancelled", reasonTr: "İşletme cevap verdiği için takip durduruldu." };
  }

  // Daha güncel başka bir takip aynı lead için min aralıktan yakınsa bu adayı bastır.
  if (signals.mostRecentOtherFollowUpAt != null) {
    const gapMs = policy.minHoursBetweenFollowUps * HOUR_MS;
    if (Math.abs(candidate.createdAt - signals.mostRecentOtherFollowUpAt) < gapMs) {
      return { cancelled: true, kind: "cancelled", reasonTr: "Bu işletme için daha güncel bir takip mevcut." };
    }
  }

  // Süre dolumu.
  const expireAt = candidate.createdAt + policy.expireAfterHours * HOUR_MS;
  if (currentTime >= expireAt) {
    return { cancelled: true, kind: "expired", reasonTr: "Takip süresi dolduğu için kapatıldı." };
  }

  return { cancelled: false, kind: null, reasonTr: null };
}

/* ── blokaj nedenleri (henüz iptal değil, ama otomasyona giremez) ── */

export function deriveBlockedReasons(input: FollowUpOrchestrationInput): string[] {
  const { candidate, signals, policy } = input;
  const reasons: string[] = [];
  if (!policy.enabled) reasons.push("Çalışma kuralları şu anda takip hazırlamaya izin vermiyor.");
  if (policy.requireMappedLead && !candidate.missionId) {
    reasons.push("İşletme eşleşmedi — önce lead doğrulanmalı.");
  }
  if (signals.leadInvalid) reasons.push("Yeterli işletme bilgisi yok.");
  if (signals.followUpCountForLead != null && signals.followUpCountForLead > policy.maxFollowUpsPerLead) {
    reasons.push("Bu işletme için takip sınırına ulaşıldı.");
  }
  return reasons;
}

/* ── durum türetme ──────────────────────────────────────────── */

/**
 * Orchestration durumunu türetir. Öncelik: iptal/bastırma → blokaj →
 * onaylanmış → zamanlama (waiting/due) → taslak/onay.
 */
export function deriveFollowUpOrchestrationState(input: FollowUpOrchestrationInput): FollowUpOrchestrationState {
  const { candidate, signals, currentTime } = input;

  if (candidate.status === "completed") return "completed";

  const cancellation = deriveFollowUpCancellation(input);
  if (cancellation.cancelled) {
    if (cancellation.kind === "expired") return "expired";
    if (cancellation.kind === "blocked") return "blocked";
    return "cancelled";
  }

  const blocked = deriveBlockedReasons(input);
  if (blocked.length > 0) return "blocked";

  // Founder zaten onayladıysa gönderim bekliyor (mevcut controlled-send).
  if (candidate.status === "approved") return "approved_waiting_send";
  // Founder onayına sunulmuş bir aday.
  if (candidate.status === "approval_required") return "approval_required";

  const dueAt = deriveFollowUpDueAt(input);
  if (currentTime < dueAt) return "waiting";

  // Zamanı geldi. Teslimat başarısız takibi ASLA otomatik taslak hazırlamaz —
  // yalnız "zamanı geldi" (kanal kontrolü); otomatik yeniden gönderim yok.
  const trigger = deriveFollowUpTrigger(candidate);
  if (trigger === "failed_delivery_recovery") return "due";
  // Mission için zaten bir onay taslağı varsa duplicate approval üretme —
  // founder mevcut taslağı onaylamalı (approval_required); yoksa taslak hazırlanacak.
  if (signals.hasActiveApprovalDraft) return "approval_required";
  if (signals.hasContactPath === false) return "due"; // kanal yoksa yalnız "zamanı geldi" — taslak yok
  return "draft_needed";
}

/* ── kanal stratejisi ───────────────────────────────────────── */

export function deriveFollowUpChannelStrategy(input: FollowUpOrchestrationInput): FollowUpChannelStrategy {
  const trigger = deriveFollowUpTrigger(input.candidate);
  if (trigger === "failed_delivery_recovery") return "manual_channel_review";
  const cancellation = deriveFollowUpCancellation(input);
  if (cancellation.kind === "blocked") return "no_channel";
  if (input.signals.hasContactPath === false) return "manual_channel_review";
  return "same_channel";
}

/* ── öncelik ────────────────────────────────────────────────── */

export function deriveFollowUpOrchestrationPriority(input: FollowUpOrchestrationInput): FollowUpOrchestrationPriority {
  const trigger = deriveFollowUpTrigger(input.candidate);
  if (trigger === "failed_delivery_recovery") return "critical";
  if (input.candidate.priority === "high") return "high";
  if (input.candidate.priority === "medium") return "medium";
  return "low";
}

/* ── founder aksiyonu ───────────────────────────────────────── */

export function deriveFollowUpFounderAction(state: FollowUpOrchestrationState): {
  founderActionRequired: boolean;
  founderActionLabelTr: string | null;
} {
  const label = FOUNDER_ACTION_LABELS[state];
  return { founderActionRequired: label !== null, founderActionLabelTr: label };
}

/* ── founder copy ───────────────────────────────────────────── */

function whatHappenedFor(trigger: FollowUpTrigger): string {
  switch (trigger) {
    case "read_no_reply":
      return "Mesaj okundu ama işletme henüz cevap vermedi.";
    case "delivered_no_reply":
      return "Mesaj iletildi ama işletme henüz cevap vermedi.";
    case "hot_reply_needs_action":
      return "İşletme sıcak bir ilgi gösterdi ama henüz bir aksiyon alınmadı.";
    case "demo_not_scheduled":
      return "Demo talebi var ama demo henüz planlanmadı.";
    case "demo_no_show":
      return "İşletme planlanan demoya katılmadı.";
    case "failed_delivery_recovery":
      return "Mesaj teslim edilemedi.";
    case "later_requested":
      return "İşletme daha sonra iletişim kurulmasını istemişti.";
    case "manual":
      return "Bu işletme için manuel bir takip planlandı.";
    case "unknown":
      return "Bu işletme için bir takip adayı oluştu.";
  }
}

function whyItMattersFor(trigger: FollowUpTrigger): string {
  switch (trigger) {
    case "read_no_reply":
    case "delivered_no_reply":
      return "Zamanında bir hatırlatma ilgiyi canlı tutar; geç kalınırsa fırsat soğuyabilir.";
    case "hot_reply_needs_action":
      return "Sıcak ilgi hızlı aksiyon ister; bekletilirse dönüşüm düşer.";
    case "demo_not_scheduled":
      return "Demo planlanmazsa fırsat ilerlemez.";
    case "demo_no_show":
      return "Yeniden planlanmazsa fırsat kaybedilebilir.";
    case "failed_delivery_recovery":
      return "Mesaj ulaşmadıysa iletişim tamamen kopabilir — kanal kontrolü gerekir.";
    case "later_requested":
      return "Söz verilen zamanda dönülürse güven artar.";
    case "manual":
    case "unknown":
      return "Bu fırsat yakından takip edilmeli.";
  }
}

function hermesRecommendationFor(state: FollowUpOrchestrationState, trigger: FollowUpTrigger): string {
  const isFailedDelivery = trigger === "failed_delivery_recovery";
  switch (state) {
    case "waiting":
      return "Hermes doğru zamanı bekliyor; henüz aksiyon gerekmiyor.";
    case "due":
      if (isFailedDelivery) {
        return "Mesaj ulaşmadı — farklı bir iletişim kanalını kontrol et.";
      }
      return "Takip zamanı geldi — Hermes bir taslak hazırlayabilir; karar senin.";
    case "draft_needed":
      return "Hermes bir takip taslağı hazırlayabilir — incele ve onayla; gönderim yalnız senin onayınla yapılır. Hermes hiçbir mesaj göndermez.";
    case "approval_required":
      return "Hazırlanan takip taslağı onayını bekliyor — incele ve onayla; gönderim senin onayınla.";
    case "approved_waiting_send":
      return "Onayladın — takip mevcut güvenli gönderim akışında.";
    case "blocked":
      if (isFailedDelivery) {
        return "Mesaj ulaşmadı — farklı bir iletişim kanalını kontrol et. Otomatik yeniden gönderim yapılmaz.";
      }
      return "Hermes bu takibi güvenli nedenlerle durdurdu.";
    case "cancelled":
      return "Bu takip artık gerekmiyor — Hermes otomatik olarak kapattı.";
    case "expired":
      return "Takip zamanı geçti — istersen manuel olarak değerlendir.";
    case "completed":
      return "Bu takip tamamlandı.";
    case "dismissed":
      return "Bu takipten vazgeçildi.";
    case "not_needed":
      return "Şu an bu işletme için takip gerekmiyor.";
  }
}

function suggestedTimingFor(state: FollowUpOrchestrationState, dueAt: number | null, now: number): string {
  if (state === "waiting" && dueAt != null) {
    const diffMs = dueAt - now;
    const hours = Math.max(0, Math.round(diffMs / HOUR_MS));
    if (hours >= 24) {
      const days = Math.round(hours / 24);
      return `Yaklaşık ${days} gün sonra`;
    }
    if (hours >= 1) return `Yaklaşık ${hours} saat sonra`;
    const mins = Math.max(1, Math.round(diffMs / MINUTE_MS));
    return `Yaklaşık ${mins} dakika sonra`;
  }
  if (state === "due" || state === "draft_needed" || state === "approval_required") return "Şimdi";
  return "—";
}

/* ── audit ──────────────────────────────────────────────────── */

export type BuildFollowUpOrchestrationAuditEventInput = {
  type: FollowUpOrchestrationAuditType;
  at: number;
  followUpCandidateId: string;
  missionId?: string | null;
  leadId?: string | null;
  trigger: FollowUpTrigger;
  state?: FollowUpOrchestrationState | null;
  dueAt?: number | null;
  priority: FollowUpOrchestrationPriority;
  approvalRequired?: boolean;
  detailTr: string;
};

export function buildFollowUpOrchestrationAuditEvent(
  input: BuildFollowUpOrchestrationAuditEventInput,
): FollowUpOrchestrationAuditEvent {
  const scrubbed = input.detailTr
    .replace(/Bearer\s+\S+/gi, "Bearer [gizli]")
    .replace(/(key|token|secret)=\S+/gi, "$1=[gizli]")
    .replace(/\+?\d[\d\s\-()]{8,}\d/g, "[numara gizli]");
  return {
    type: input.type,
    at: input.at,
    followUpCandidateId: input.followUpCandidateId,
    missionId: input.missionId ?? null,
    leadId: input.leadId ?? null,
    trigger: input.trigger,
    state: input.state ?? null,
    dueAt: input.dueAt ?? null,
    priority: input.priority,
    approvalRequired: input.approvalRequired ?? false,
    detailTr: scrubbed,
  };
}

const AUDIT_TYPE_BY_STATE: Record<FollowUpOrchestrationState, FollowUpOrchestrationAuditType> = {
  not_needed: "hermes_follow_up_suppressed",
  waiting: "hermes_follow_up_waiting",
  due: "hermes_follow_up_due",
  draft_needed: "hermes_follow_up_draft_requested",
  approval_required: "hermes_follow_up_approval_required",
  approved_waiting_send: "hermes_follow_up_approval_required",
  completed: "hermes_follow_up_completed",
  cancelled: "hermes_follow_up_cancelled",
  dismissed: "hermes_follow_up_cancelled",
  expired: "hermes_follow_up_expired",
  blocked: "hermes_follow_up_blocked",
};

/* ── ana değerlendirme ──────────────────────────────────────── */

export function evaluateFollowUpOrchestration(
  input: FollowUpOrchestrationInput,
): FollowUpOrchestrationDecision {
  const now = input.currentTime;
  const candidate = input.candidate;
  const trigger = deriveFollowUpTrigger(candidate);
  const state = deriveFollowUpOrchestrationState(input);
  const priority = deriveFollowUpOrchestrationPriority(input);
  const dueAt = deriveFollowUpDueAt(input);
  const channelStrategy = deriveFollowUpChannelStrategy(input);
  const cancellation = deriveFollowUpCancellation(input);
  const blockedReasonsTr = state === "blocked" ? deriveBlockedReasons(input) : [];

  const overdueByMinutes =
    (state === "due" || state === "draft_needed" || state === "approval_required") && now >= dueAt
      ? Math.floor((now - dueAt) / MINUTE_MS)
      : null;

  const draftNeeded = state === "draft_needed";
  // Taslak gerektiğinde onay HER ZAMAN zorunlu; approval_required durumu da onay bekler.
  const approvalRequired =
    (draftNeeded || state === "approval_required") && input.policy.requireFounderApproval;

  const founderAction = deriveFollowUpFounderAction(state);
  const founderActionRequired = founderAction.founderActionRequired;
  // Kanal-kontrolü gereken takipte (teslimat başarısız) aksiyon etiketi
  // durumdan bağımsız olarak "İletişim Kanalını Kontrol Et" olur.
  const founderActionLabelTr =
    founderActionRequired && channelStrategy === "manual_channel_review"
      ? "İletişim Kanalını Kontrol Et"
      : founderAction.founderActionLabelTr;

  const whatHappenedTr = whatHappenedFor(trigger);
  const whyItMattersTr = whyItMattersFor(trigger);
  const hermesRecommendationTr = hermesRecommendationFor(state, trigger);
  const suggestedTimingTr = suggestedTimingFor(state, dueAt, now);
  const cancellationReasonTr = cancellation.reasonTr;

  const auditBase = {
    followUpCandidateId: candidate.id,
    missionId: candidate.missionId,
    leadId: candidate.leadId,
    trigger,
    priority,
  };

  const auditEvents: FollowUpOrchestrationAuditEvent[] = [
    buildFollowUpOrchestrationAuditEvent({
      ...auditBase,
      type: "hermes_follow_up_evaluation_requested",
      at: now,
      detailTr: "Takip zamanlaması değerlendirildi.",
    }),
    buildFollowUpOrchestrationAuditEvent({
      ...auditBase,
      type: AUDIT_TYPE_BY_STATE[state],
      at: now,
      state,
      dueAt,
      approvalRequired,
      detailTr: cancellationReasonTr ?? `Takip durumu: ${FOLLOW_UP_ORCH_STATE_LABELS_TR[state]}.`,
    }),
  ];

  return {
    id: `followup-orch:${candidate.id}`,
    followUpCandidateId: candidate.id,
    missionId: candidate.missionId,
    leadId: candidate.leadId,
    state,
    trigger,
    priority,
    dueAt,
    overdueByMinutes,
    channelStrategy,
    draftNeeded,
    approvalRequired,
    founderActionRequired,
    founderActionLabelTr,
    whatHappenedTr,
    whyItMattersTr,
    hermesRecommendationTr,
    suggestedTimingTr,
    cancellationReasonTr,
    blockedReasonsTr,
    createdAt: candidate.createdAt,
    updatedAt: now,
    auditEvents,
  };
}

/* ── özet + sıralama ────────────────────────────────────────── */

export type FollowUpOrchestrationSummary = {
  total: number;
  dueToday: number;
  upcoming: number;
  approvalRequired: number;
  channelReview: number;
  completed: number;
  cancelled: number;
  blocked: number;
};

const CHANNEL_REVIEW_STATES: ReadonlySet<FollowUpOrchestrationState> = new Set(["due", "blocked"]);

export function summarizeFollowUpOrchestration(
  items: FollowUpOrchestrationDecision[],
): FollowUpOrchestrationSummary {
  // "Bugün takip" = zamanı gelmiş normal takipler; kanal-kontrolü gerekenler
  // ayrı sayaçta (channelReview) — çift sayılmaz.
  const isDue = (i: FollowUpOrchestrationDecision) =>
    (i.state === "due" || i.state === "draft_needed") && i.channelStrategy !== "manual_channel_review";
  return {
    total: items.length,
    dueToday: items.filter(isDue).length,
    upcoming: items.filter((i) => i.state === "waiting").length,
    approvalRequired: items.filter((i) => i.state === "approval_required").length,
    channelReview: items.filter(
      (i) => CHANNEL_REVIEW_STATES.has(i.state) && i.channelStrategy === "manual_channel_review",
    ).length,
    completed: items.filter((i) => i.state === "completed").length,
    cancelled: items.filter((i) => i.state === "cancelled" || i.state === "dismissed").length,
    blocked: items.filter((i) => i.state === "blocked").length,
  };
}

/** Aktif (founder'ın görmesi gereken) durumlar. */
export function isActiveFollowUpOrchestration(item: Pick<FollowUpOrchestrationDecision, "state">): boolean {
  return (
    item.state === "waiting" ||
    item.state === "due" ||
    item.state === "draft_needed" ||
    item.state === "approval_required" ||
    item.state === "approved_waiting_send" ||
    item.state === "blocked"
  );
}

const PRIORITY_SORT_WEIGHT: Record<FollowUpOrchestrationPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const STATE_SORT_WEIGHT: Record<FollowUpOrchestrationState, number> = {
  approval_required: 0,
  draft_needed: 1,
  due: 2,
  approved_waiting_send: 3,
  waiting: 4,
  blocked: 5,
  not_needed: 6,
  cancelled: 7,
  dismissed: 8,
  expired: 9,
  completed: 10,
};

/** Deterministik: durum → öncelik → dueAt (erken önce) → id. Girdi mutate edilmez. */
export function sortFollowUpOrchestration(
  items: FollowUpOrchestrationDecision[],
): FollowUpOrchestrationDecision[] {
  return [...items].sort((a, b) => {
    const s = STATE_SORT_WEIGHT[a.state] - STATE_SORT_WEIGHT[b.state];
    if (s !== 0) return s;
    const p = PRIORITY_SORT_WEIGHT[a.priority] - PRIORITY_SORT_WEIGHT[b.priority];
    if (p !== 0) return p;
    const da = a.dueAt ?? Number.MAX_SAFE_INTEGER;
    const db = b.dueAt ?? Number.MAX_SAFE_INTEGER;
    if (da !== db) return da - db;
    return a.id.localeCompare(b.id);
  });
}
