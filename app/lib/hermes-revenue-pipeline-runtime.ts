import type { HermesRevenuePipelinePolicy } from "./hermes-revenue-pipeline-policy.ts";

/**
 * Hermes Revenue Pipeline Runtime (Sprint C6 — Revenue Pipeline Intelligence).
 *
 * Saf, deterministik BİRLEŞTİRME katmanı. YENİ bir Sales Outcome / CRM /
 * finans motoru DEĞİLDİR: mevcut runtime kayıtlarını (qualification, outreach,
 * teslimat, conversation, demo, follow-up, sales outcome) OKUYUP her fırsat
 * için TEK bir ticari pipeline durumu üretir.
 *
 * Sert kurallar (yapısal):
 *  - Hiçbir gelir değeri UYDURMAZ. `estimatedMrr` yalnız mevcut Sales
 *    Outcome kaydından gelir; yoksa `null` kalır (asla sahte 0).
 *  - Hiçbir satış sonucunu otomatik `won`/`lost` yapmaz — Sales Outcome tek
 *    doğruluk kaynağıdır.
 *  - Hiçbir fiyat/paket/olasılık tahmin etmez.
 *  - `estimatedArr = estimatedMrr × 12` yalnız mevcut kurala göre türetilir.
 *  - Girdi mutate edilmez, API çağrılmaz, mesaj gönderilmez.
 *
 * Kasıtlı olarak bağımsız (no "@/", no React) — `node --test` altında koşar.
 *
 * NOT: Pipeline zekâsı muhasebe DEĞİLDİR. Tahmini gelir, tahsil edilmiş gelir
 * değildir.
 */

/* ── tipler ─────────────────────────────────────────────────── */

export type RevenuePipelineStage =
  | "discovered"
  | "qualified"
  | "outreach_prepared"
  | "approval_pending"
  | "contacted"
  | "reply_received"
  | "conversation_active"
  | "demo_pending"
  | "demo_scheduled"
  | "follow_up_due"
  | "outcome_pending"
  | "won"
  | "lost"
  | "paused"
  | "blocked";

export type RevenuePipelineHealth = "healthy" | "attention" | "at_risk" | "closed";

export type RevenuePipelinePriority = "critical" | "high" | "medium" | "low";

export type RevenueRiskCode =
  | "delivery_failed"
  | "reply_waiting"
  | "hot_reply_unhandled"
  | "demo_not_scheduled"
  | "demo_no_show"
  | "follow_up_overdue"
  | "outcome_missing"
  | "stale_opportunity"
  | "missing_revenue_estimate"
  | "blocked_contact"
  | "wrong_number"
  | "not_interested"
  | "duplicate_process"
  | "none";

/* ── mevcut modellerin yapısal alt kümeleri ─────────────────── */

export type RevenueLeadLike = { id?: string | null; name?: string | null };
export type RevenueMissionLike = { missionId: string; stage?: string } | null;
export type RevenueQualificationLike = { status: string } | null;
export type RevenueOutreachLike = { status: string } | null;
export type RevenueDeliveryReceiptLike = { status: string; occurredAt: number };
export type RevenueConversationLike = { state: string; updatedAt?: number } | null;
export type RevenueDemoLike = { status: string; updatedAt?: number; createdAt?: number } | null;
export type RevenueFollowUpLike = { status: string } | null;
export type RevenueFollowUpOrchestrationLike = {
  state: string;
  dueAt?: number | null;
  overdueByMinutes?: number | null;
} | null;
export type RevenueSalesOutcomeLike = {
  status: string;
  estimatedMrr?: number | null;
  estimatedArr?: number | null;
  updatedAt?: number;
} | null;

export type RevenuePipelineInput = {
  lead: RevenueLeadLike;
  mission?: RevenueMissionLike;
  qualification?: RevenueQualificationLike;
  outreach?: RevenueOutreachLike;
  deliveryReceipts?: RevenueDeliveryReceiptLike[];
  conversation?: RevenueConversationLike;
  demoItem?: RevenueDemoLike;
  followUpItem?: RevenueFollowUpLike;
  followUpOrchestration?: RevenueFollowUpOrchestrationLike;
  salesOutcome?: RevenueSalesOutcomeLike;
  /** Bu fırsat için en son gelen cevabın zamanı (varsa). */
  lastReplyAt?: number | null;
  currentTime: number;
  policy: HermesRevenuePipelinePolicy;
};

export type RevenuePipelineAuditType =
  | "hermes_revenue_pipeline_evaluated"
  | "hermes_revenue_stage_changed"
  | "hermes_revenue_risk_detected"
  | "hermes_revenue_risk_resolved"
  | "hermes_revenue_estimate_missing"
  | "hermes_revenue_outcome_pending"
  | "hermes_revenue_won"
  | "hermes_revenue_lost"
  | "hermes_revenue_pipeline_updated"
  | "hermes_revenue_pipeline_failed";

export type RevenuePipelineAuditEvent = {
  type: RevenuePipelineAuditType;
  at: number;
  leadId: string | null;
  missionId: string | null;
  stage: RevenuePipelineStage | null;
  health: RevenuePipelineHealth | null;
  riskCodes: RevenueRiskCode[];
  estimatedMrr: number | null;
  realizedMrr: number | null;
  /** Türkçe, founder-güvenli detay — asla ham cevap/telefon/secret/mesaj içermez. */
  detailTr: string;
};

export type RevenuePipelineItem = {
  id: string;
  missionId: string | null;
  leadId: string | null;
  title: string;
  stage: RevenuePipelineStage;
  health: RevenuePipelineHealth;
  priority: RevenuePipelinePriority;
  currentStateLabelTr: string;
  revenueSignalLabelTr: string;
  estimatedMrr: number | null;
  estimatedArr: number | null;
  realizedMrr: number | null;
  realizedArr: number | null;
  potentialMrr: number | null;
  riskedMrr: number | null;
  lostMrr: number | null;
  ageInStageHours: number | null;
  lastActivityAt: number | null;
  riskCodes: RevenueRiskCode[];
  riskReasonsTr: string[];
  positiveSignalsTr: string[];
  whatHappenedTr: string;
  whyItMattersTr: string;
  hermesRecommendationTr: string;
  founderNextActionTr: string;
  founderActionRequired: boolean;
  founderActionLabelTr: string | null;
  closed: boolean;
  createdAt: number;
  updatedAt: number;
  auditEvents: RevenuePipelineAuditEvent[];
};

/* ── founder sözlüğü ────────────────────────────────────────── */

export const REVENUE_STAGE_LABELS_TR: Record<RevenuePipelineStage, string> = {
  discovered: "Yeni Fırsat",
  qualified: "Satışa Hazır",
  outreach_prepared: "Mesaj Hazır",
  approval_pending: "Onay Bekliyor",
  contacted: "İlk Temas Yapıldı",
  reply_received: "Cevap Geldi",
  conversation_active: "Görüşme Sürüyor",
  demo_pending: "Demo Bekliyor",
  demo_scheduled: "Demo Planlandı",
  follow_up_due: "Takip Gerekli",
  outcome_pending: "Sonuç Bekliyor",
  won: "Kazanıldı",
  lost: "Kaybedildi",
  paused: "Beklemede",
  blocked: "İşlem Engellendi",
};

export const REVENUE_HEALTH_LABELS_TR: Record<RevenuePipelineHealth, string> = {
  healthy: "Yolunda",
  attention: "Dikkat Gerekiyor",
  at_risk: "Risk Altında",
  closed: "Kapandı",
};

export const REVENUE_RISK_LABELS_TR: Record<RevenueRiskCode, string> = {
  delivery_failed: "Mesaj teslim edilemedi",
  reply_waiting: "Cevap bekleniyor — süre uzadı",
  hot_reply_unhandled: "Sıcak cevap yanıtsız kaldı",
  demo_not_scheduled: "Demo talebi var ama planlanmadı",
  demo_no_show: "Demoya gelinmedi",
  follow_up_overdue: "Takip zamanı geçti",
  outcome_missing: "Satış sonucu uzun süredir girilmedi",
  stale_opportunity: "Fırsat uzun süredir hareketsiz",
  missing_revenue_estimate: "Gelir tahmini eksik",
  blocked_contact: "İletişim engellendi",
  wrong_number: "Yanlış numara",
  not_interested: "İşletme ilgilenmiyor",
  duplicate_process: "Yinelenen süreç",
  none: "Risk yok",
};

/* ── gelir tutarları — yalnız mevcut tahminden ─────────────── */

const ARR_MULTIPLIER = 12;

/** Mevcut kural: ARR = MRR × 12. Bilinmeyen MRR → null (asla 0). */
export function calculateRevenueArr(mrr: number | null): number | null {
  if (mrr == null || !Number.isFinite(mrr)) return null;
  return mrr * ARR_MULTIPLIER;
}

function sanitizeMrr(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

/* ── zaman yardımcıları ─────────────────────────────────────── */

const HOUR_MS = 60 * 60 * 1000;

function collectTimestamps(input: RevenuePipelineInput): number[] {
  const ts: number[] = [];
  for (const r of input.deliveryReceipts ?? []) ts.push(r.occurredAt);
  if (input.lastReplyAt != null) ts.push(input.lastReplyAt);
  if (input.conversation?.updatedAt != null) ts.push(input.conversation.updatedAt);
  if (input.demoItem?.updatedAt != null) ts.push(input.demoItem.updatedAt);
  if (input.demoItem?.createdAt != null) ts.push(input.demoItem.createdAt);
  if (input.salesOutcome?.updatedAt != null) ts.push(input.salesOutcome.updatedAt);
  return ts.filter((t) => typeof t === "number" && Number.isFinite(t));
}

export function deriveLastActivityAt(input: RevenuePipelineInput): number | null {
  const ts = collectTimestamps(input);
  return ts.length > 0 ? Math.max(...ts) : null;
}

function latestReceipt(input: RevenuePipelineInput): RevenueDeliveryReceiptLike | null {
  const receipts = input.deliveryReceipts ?? [];
  if (receipts.length === 0) return null;
  return receipts.reduce((a, b) => (b.occurredAt > a.occurredAt ? b : a));
}

function hasSuccessfulDelivery(input: RevenuePipelineInput): boolean {
  return (input.deliveryReceipts ?? []).some((r) => r.status === "sent" || r.status === "delivered" || r.status === "read");
}

function hasReply(input: RevenuePipelineInput): boolean {
  if (input.lastReplyAt != null) return true;
  const s = input.conversation?.state;
  return s != null && s !== "awaiting_reply";
}

/* ── conversation durum grupları ────────────────────────────── */

const CONVERSATION_ACTIVE_STATES: ReadonlySet<string> = new Set([
  "hot_opportunity",
  "pricing_discussion",
  "call_requested",
  "human_review_required",
]);
const CONVERSATION_DEMO_STATES: ReadonlySet<string> = new Set(["demo_requested"]);
const CONVERSATION_BLOCK_STATES: ReadonlySet<string> = new Set(["wrong_number", "blocked"]);
const CONVERSATION_NOT_INTERESTED: ReadonlySet<string> = new Set(["not_interested"]);

const DEMO_PENDING: ReadonlySet<string> = new Set(["demo_requested", "scheduling_needed"]);
const FOLLOW_UP_DUE_STATES: ReadonlySet<string> = new Set(["due", "draft_needed", "approval_required"]);

/* ── aşama önceliği (deterministik) ─────────────────────────── */

/**
 * Tek deterministik precedence. Kapalı sonuçlar her şeyi geçersiz kılar;
 * sonra güvenlik blokları; sonra funnel en ileri aşamadan en geriye.
 */
export function deriveRevenuePipelineStage(input: RevenuePipelineInput): RevenuePipelineStage {
  const outcome = input.salesOutcome;
  // 1. Kapalı sonuçlar (Sales Outcome source-of-truth).
  if (outcome?.status === "won") return "won";
  if (outcome?.status === "lost") return "lost";
  if (outcome?.status === "paused") return "paused";

  // 2. Güvenlik blokları.
  const convState = input.conversation?.state;
  if (convState && CONVERSATION_BLOCK_STATES.has(convState)) return "blocked";
  if (input.qualification?.status === "blocked") return "blocked";
  if (input.followUpOrchestration?.state === "blocked") {
    // Yalnız gerçek güvenlik bloğu (DNC/yanlış numara) — kanal kontrolü değil.
    if (convState && (CONVERSATION_BLOCK_STATES.has(convState) || CONVERSATION_NOT_INTERESTED.has(convState))) {
      return "blocked";
    }
  }

  // 3. Sonuç bekliyor: demo/takip tamamlandı ama sonuç henüz açık.
  const outcomeOpen = outcome?.status === "open" || outcome?.status === "no_decision";
  const demoCompleted = input.demoItem?.status === "completed";
  const followUpCompleted = input.followUpItem?.status === "completed";
  if (outcomeOpen && (demoCompleted || followUpCompleted)) return "outcome_pending";

  // 4. Takip gerekli (orchestration due/draft/approval).
  if (input.followUpOrchestration && FOLLOW_UP_DUE_STATES.has(input.followUpOrchestration.state)) {
    return "follow_up_due";
  }

  // 5. Demo planlandı.
  if (input.demoItem?.status === "scheduled") return "demo_scheduled";

  // 6. Demo bekliyor.
  if (input.demoItem && DEMO_PENDING.has(input.demoItem.status)) return "demo_pending";
  if (convState && CONVERSATION_DEMO_STATES.has(convState)) return "demo_pending";

  // 7. Aktif görüşme (sıcak/fiyat/arama/inceleme).
  if (convState && CONVERSATION_ACTIVE_STATES.has(convState)) return "conversation_active";

  // 8. Cevap geldi.
  if (hasReply(input)) return "reply_received";

  // 9. Başarılı gönderim/teslimat.
  if (hasSuccessfulDelivery(input)) return "contacted";

  // 10. Onay bekliyor (outreach onayı veya mission approval).
  if (input.outreach?.status === "approval_required" || input.mission?.stage === "approval") {
    return "approval_pending";
  }

  // 11. Mesaj hazır (outreach hazırlandı).
  if (input.outreach?.status === "draft_ready" || input.outreach?.status === "approval_required") {
    return "outreach_prepared";
  }

  // 12. Satışa hazır (qualification).
  if (input.qualification?.status === "sales_ready") return "qualified";

  // 13. Aksi halde yeni fırsat.
  return "discovered";
}

/* ── gelir tutarları ────────────────────────────────────────── */

export type RevenueAmounts = {
  estimatedMrr: number | null;
  estimatedArr: number | null;
  realizedMrr: number | null;
  realizedArr: number | null;
  potentialMrr: number | null;
  riskedMrr: number | null;
  lostMrr: number | null;
};

/**
 * Gelir kategorilerini KESİN olarak ayırır. Kaynak yalnız mevcut Sales
 * Outcome tahminidir; yoksa hepsi null (asla uydurma, asla sahte 0).
 * `health` at_risk ise ve tahmin varsa riskedMrr doldurulur.
 */
export function deriveRevenueAmounts(
  input: RevenuePipelineInput,
  stage: RevenuePipelineStage,
  health: RevenuePipelineHealth,
): RevenueAmounts {
  const estimatedMrr = sanitizeMrr(input.salesOutcome?.estimatedMrr);
  const estimatedArr = calculateRevenueArr(estimatedMrr);

  const empty: RevenueAmounts = {
    estimatedMrr,
    estimatedArr,
    realizedMrr: null,
    realizedArr: null,
    potentialMrr: null,
    riskedMrr: null,
    lostMrr: null,
  };

  if (stage === "won") {
    return { ...empty, realizedMrr: estimatedMrr, realizedArr: estimatedArr };
  }
  if (stage === "lost") {
    return { ...empty, lostMrr: estimatedMrr };
  }
  if (stage === "paused") {
    // Beklemede: policy dahil etmiyorsa potansiyele sayılmaz.
    return input.policy.includePausedInPotential ? { ...empty, potentialMrr: estimatedMrr } : empty;
  }
  if (stage === "blocked") {
    return empty;
  }

  // Açık pipeline: potansiyel; at_risk ise ayrıca risked.
  return {
    ...empty,
    potentialMrr: estimatedMrr,
    riskedMrr: health === "at_risk" ? estimatedMrr : null,
  };
}

/* ── risk zekâsı ────────────────────────────────────────────── */

function hoursSince(now: number, at: number | null): number | null {
  if (at == null) return null;
  return (now - at) / HOUR_MS;
}

const COMMERCIALLY_ADVANCED: ReadonlySet<RevenuePipelineStage> = new Set([
  "conversation_active",
  "demo_pending",
  "demo_scheduled",
  "follow_up_due",
  "outcome_pending",
]);

export type RevenueRiskResult = { codes: RevenueRiskCode[]; reasonsTr: string[] };

/**
 * Riskleri mevcut operasyonel sinyallerden türetir. Başka bir runtime'ın
 * zaten sahiplendiği kararı burada TEKRAR karar kartına çevirmeyiz — bu
 * yalnız bilgilendirici risk kodudur.
 */
export function deriveRevenueRisks(input: RevenuePipelineInput, stage: RevenuePipelineStage): RevenueRiskResult {
  const now = input.currentTime;
  const policy = input.policy;
  const codes: RevenueRiskCode[] = [];

  const convState = input.conversation?.state;
  // Güvenli kapanış/blok sinyalleri.
  if (convState && CONVERSATION_BLOCK_STATES.has(convState)) {
    codes.push(convState === "wrong_number" ? "wrong_number" : "blocked_contact");
  }
  if (convState && CONVERSATION_NOT_INTERESTED.has(convState)) codes.push("not_interested");

  // Teslimat hatası.
  const receipt = latestReceipt(input);
  if (receipt?.status === "failed") codes.push("delivery_failed");

  // Cevap bekliyor.
  if (receipt && (receipt.status === "read" || receipt.status === "delivered") && !hasReply(input)) {
    const h = hoursSince(now, receipt.occurredAt);
    if (h != null && h >= policy.replyWaitingRiskHours) codes.push("reply_waiting");
  }

  // Sıcak cevap yanıtsız.
  if (convState && (convState === "hot_opportunity" || convState === "pricing_discussion")) {
    const hasDemo = input.demoItem != null && input.demoItem.status !== "not_requested";
    const hasFollowUp = input.followUpOrchestration != null;
    if (!hasDemo && !hasFollowUp) codes.push("hot_reply_unhandled");
  }

  // Demo planlanmadı.
  if (input.demoItem && DEMO_PENDING.has(input.demoItem.status)) {
    const at = input.demoItem.updatedAt ?? input.demoItem.createdAt ?? null;
    const h = hoursSince(now, at);
    if (h != null && h >= policy.demoSchedulingRiskHours) codes.push("demo_not_scheduled");
  }

  // Demoya gelinmedi.
  if (input.demoItem?.status === "no_show") codes.push("demo_no_show");

  // Takip gecikti.
  const orch = input.followUpOrchestration;
  if (orch && FOLLOW_UP_DUE_STATES.has(orch.state)) {
    const overdueMin = orch.overdueByMinutes ?? 0;
    if (overdueMin >= policy.followUpOverdueRiskHours * 60) codes.push("follow_up_overdue");
  }

  // Sonuç eksik.
  const outcomeOpen = input.salesOutcome?.status === "open" || input.salesOutcome?.status === "no_decision";
  if (outcomeOpen && (input.demoItem?.status === "completed" || input.followUpItem?.status === "completed")) {
    const h = hoursSince(now, input.salesOutcome?.updatedAt ?? null);
    if (h == null || h >= policy.outcomePendingRiskHours) codes.push("outcome_missing");
  }

  // Bayat fırsat (yalnız açık fırsatlar).
  const isOpen = stage !== "won" && stage !== "lost" && stage !== "paused" && stage !== "blocked";
  if (isOpen) {
    const h = hoursSince(now, deriveLastActivityAt(input));
    if (h != null && h >= policy.staleOpportunityHours) codes.push("stale_opportunity");
  }

  // Gelir tahmini eksik (yalnız ticari olarak ilerlemiş aşamada).
  if (COMMERCIALLY_ADVANCED.has(stage) && sanitizeMrr(input.salesOutcome?.estimatedMrr) == null) {
    codes.push("missing_revenue_estimate");
  }

  const unique = [...new Set(codes)];
  if (unique.length === 0) unique.push("none");
  const reasonsTr = unique.filter((c) => c !== "none").map((c) => REVENUE_RISK_LABELS_TR[c]);
  return { codes: unique, reasonsTr };
}

/* ── sağlık ─────────────────────────────────────────────────── */

const CRITICAL_RISKS: ReadonlySet<RevenueRiskCode> = new Set(["delivery_failed", "wrong_number", "blocked_contact"]);
const AT_RISK_CODES: ReadonlySet<RevenueRiskCode> = new Set([
  "delivery_failed",
  "reply_waiting",
  "hot_reply_unhandled",
  "demo_not_scheduled",
  "demo_no_show",
  "follow_up_overdue",
  "outcome_missing",
  "stale_opportunity",
]);
const ATTENTION_CODES: ReadonlySet<RevenueRiskCode> = new Set(["missing_revenue_estimate"]);

export function deriveRevenuePipelineHealth(
  stage: RevenuePipelineStage,
  risks: RevenueRiskResult,
): RevenuePipelineHealth {
  if (stage === "won" || stage === "lost" || stage === "paused" || stage === "blocked") return "closed";
  if (risks.codes.some((c) => AT_RISK_CODES.has(c))) return "at_risk";
  if (risks.codes.some((c) => ATTENTION_CODES.has(c))) return "attention";
  return "healthy";
}

/* ── öncelik ────────────────────────────────────────────────── */

export function deriveRevenuePipelinePriority(
  stage: RevenuePipelineStage,
  health: RevenuePipelineHealth,
  risks: RevenueRiskResult,
): RevenuePipelinePriority {
  if (risks.codes.some((c) => CRITICAL_RISKS.has(c))) return "critical";
  if (health === "at_risk") return "high";
  if (stage === "outcome_pending" || stage === "follow_up_due" || stage === "conversation_active" || stage === "demo_pending") {
    return "high";
  }
  if (health === "attention") return "medium";
  if (stage === "won" || stage === "lost" || stage === "paused" || stage === "blocked") return "low";
  return "medium";
}

/* ── founder aksiyonu + copy ────────────────────────────────── */

const STAGE_FOUNDER_ACTION: Record<RevenuePipelineStage, { label: string | null; required: boolean }> = {
  discovered: { label: null, required: false },
  qualified: { label: "Fırsatı İncele", required: false },
  outreach_prepared: { label: "Mesajı İncele", required: true },
  approval_pending: { label: "Mesajı Onayla", required: true },
  contacted: { label: null, required: false },
  reply_received: { label: "Cevabı İncele", required: true },
  conversation_active: { label: "Görüşmeyi İncele", required: true },
  demo_pending: { label: "Demo Planla", required: true },
  demo_scheduled: { label: null, required: false },
  follow_up_due: { label: "Takibi İncele", required: true },
  outcome_pending: { label: "Sonucu Belirle", required: true },
  won: { label: null, required: false },
  lost: { label: null, required: false },
  paused: { label: null, required: false },
  blocked: { label: "Kapatmayı İncele", required: false },
};

export function deriveRevenueFounderAction(stage: RevenuePipelineStage): {
  founderActionRequired: boolean;
  founderActionLabelTr: string | null;
} {
  const a = STAGE_FOUNDER_ACTION[stage];
  return { founderActionRequired: a.required, founderActionLabelTr: a.label };
}

function whatHappenedFor(stage: RevenuePipelineStage): string {
  switch (stage) {
    case "discovered": return "Yeni bir fırsat keşfedildi.";
    case "qualified": return "Fırsat satışa hazır olarak değerlendirildi.";
    case "outreach_prepared": return "İşletme için bir mesaj hazırlandı.";
    case "approval_pending": return "Hazırlanan mesaj founder onayını bekliyor.";
    case "contacted": return "İşletmeyle ilk temas kuruldu.";
    case "reply_received": return "İşletmeden bir cevap geldi.";
    case "conversation_active": return "İşletmeyle aktif bir satış görüşmesi sürüyor.";
    case "demo_pending": return "Demo talebi var, planlama bekliyor.";
    case "demo_scheduled": return "Demo planlandı.";
    case "follow_up_due": return "Fırsat için takip zamanı geldi.";
    case "outcome_pending": return "Demo/takip tamamlandı, satış sonucu bekleniyor.";
    case "won": return "Bu fırsat kazanılan satış olarak işaretlendi.";
    case "lost": return "Bu fırsat kaybedilen satış olarak işaretlendi.";
    case "paused": return "Bu fırsat şimdilik beklemeye alındı.";
    case "blocked": return "Bu fırsatta iletişim güvenli nedenlerle durduruldu.";
  }
}

function whyItMattersFor(stage: RevenuePipelineStage, health: RevenuePipelineHealth): string {
  if (health === "at_risk") return "Bu fırsat risk altında — zamanında müdahale gelir kaybını önler.";
  switch (stage) {
    case "qualified": return "Satışa hazır fırsatlar hızlı ilerletildiğinde dönüşür.";
    case "outreach_prepared":
    case "approval_pending": return "Onaylanmazsa mesaj gitmez, fırsat ilerlemez.";
    case "reply_received":
    case "conversation_active": return "Sıcak temas hızlı yanıt ister.";
    case "demo_pending": return "Demo planlanmazsa fırsat ilerlemez.";
    case "demo_scheduled": return "Demo, satışa en yakın aşamalardan biridir.";
    case "follow_up_due": return "Zamanında takip fırsatı canlı tutar.";
    case "outcome_pending": return "Sonuç girilmezse gelir tablosu güncel kalmaz.";
    case "won": return "Kazanılan gelir tablonun temelidir.";
    case "lost": return "Kaybın nedeni gelecekteki satışları iyileştirir.";
    case "paused": return "Beklemedeki fırsat doğru zamanda yeniden açılabilir.";
    case "blocked": return "Güvenlik gereği bu fırsatta işlem yapılmıyor.";
    case "discovered":
    case "contacted": return "Fırsat henüz erken aşamada — süreç ilerledikçe değer netleşir.";
  }
}

function hermesRecommendationFor(stage: RevenuePipelineStage, health: RevenuePipelineHealth, risks: RevenueRiskResult): string {
  if (health === "at_risk" && risks.reasonsTr.length > 0) {
    return `Riski gözden geçir: ${risks.reasonsTr[0]}.`;
  }
  switch (stage) {
    case "outcome_pending": return "Demo/takip sonrası satış sonucunu belirle.";
    case "follow_up_due": return "Takibi incele; gönderim yalnız senin onayınla.";
    case "demo_pending": return "Demo için uygun bir zaman planla.";
    case "demo_scheduled": return "Demoya hazırlan; süreç yolunda.";
    case "conversation_active": return "Görüşmeyi ilerlet; cevaba uygun aksiyonu al.";
    case "reply_received": return "Cevabı incele ve nasıl ilerleyeceğine karar ver.";
    case "approval_pending":
    case "outreach_prepared": return "Hazırlanan mesajı incele ve onayla.";
    case "qualified": return "Fırsatı satışa hazır olarak değerlendir.";
    case "won": return "Kazanıldı — ek işlem gerekmiyor.";
    case "lost": return "Kaybedildi — nedeni kayıtlı.";
    case "paused": return "Doğru zamanda yeniden değerlendir.";
    case "blocked": return "Güvenli nedenlerle durduruldu.";
    case "discovered":
    case "contacted": return "Hermes fırsatı ilerletmeye devam ediyor.";
  }
}

function revenueSignalLabelFor(amounts: RevenueAmounts, stage: RevenuePipelineStage): string {
  if (stage === "won" && amounts.realizedMrr != null) {
    return `Kazanılan aylık gelir: ₺${amounts.realizedMrr.toLocaleString("tr-TR")}`;
  }
  if (stage === "lost") {
    return amounts.lostMrr != null ? `Kaybedilen aylık gelir: ₺${amounts.lostMrr.toLocaleString("tr-TR")}` : "Kaybedildi";
  }
  if (amounts.potentialMrr != null) {
    return `Potansiyel aylık gelir: ₺${amounts.potentialMrr.toLocaleString("tr-TR")}`;
  }
  return "Gelir tahmini henüz belirlenmedi";
}

function positiveSignalsFor(stage: RevenuePipelineStage, amounts: RevenueAmounts): string[] {
  const s: string[] = [];
  if (stage === "won") s.push("Satış kazanıldı");
  if (stage === "demo_scheduled") s.push("Demo planlandı");
  if (stage === "conversation_active") s.push("Aktif görüşme var");
  if (stage === "qualified") s.push("Satışa hazır");
  if (amounts.estimatedMrr != null) s.push("Gelir tahmini mevcut");
  return s;
}

/* ── audit ──────────────────────────────────────────────────── */

export type BuildRevenuePipelineAuditEventInput = {
  type: RevenuePipelineAuditType;
  at: number;
  leadId?: string | null;
  missionId?: string | null;
  stage?: RevenuePipelineStage | null;
  health?: RevenuePipelineHealth | null;
  riskCodes?: RevenueRiskCode[];
  estimatedMrr?: number | null;
  realizedMrr?: number | null;
  detailTr: string;
};

export function buildRevenuePipelineAuditEvent(input: BuildRevenuePipelineAuditEventInput): RevenuePipelineAuditEvent {
  const scrubbed = input.detailTr
    .replace(/Bearer\s+\S+/gi, "Bearer [gizli]")
    .replace(/(key|token|secret)=\S+/gi, "$1=[gizli]")
    .replace(/\+?\d[\d\s\-()]{8,}\d/g, "[numara gizli]");
  return {
    type: input.type,
    at: input.at,
    leadId: input.leadId ?? null,
    missionId: input.missionId ?? null,
    stage: input.stage ?? null,
    health: input.health ?? null,
    riskCodes: input.riskCodes ?? [],
    estimatedMrr: input.estimatedMrr ?? null,
    realizedMrr: input.realizedMrr ?? null,
    detailTr: scrubbed,
  };
}

/* ── ana değerlendirme ──────────────────────────────────────── */

export function evaluateRevenuePipelineItem(input: RevenuePipelineInput): RevenuePipelineItem {
  const now = input.currentTime;
  const leadId = input.lead.id ?? input.mission?.missionId ?? null;
  const missionId = input.mission?.missionId ?? null;
  const title = input.lead.name?.trim() || "İsimsiz işletme";

  const stage = deriveRevenuePipelineStage(input);
  const risks = deriveRevenueRisks(input, stage);
  const health = deriveRevenuePipelineHealth(stage, risks);
  const priority = deriveRevenuePipelinePriority(stage, health, risks);
  const amounts = deriveRevenueAmounts(input, stage, health);
  const lastActivityAt = deriveLastActivityAt(input);
  const ageInStageHours = lastActivityAt != null ? Math.max(0, (now - lastActivityAt) / HOUR_MS) : null;
  const closed = stage === "won" || stage === "lost";

  const { founderActionRequired, founderActionLabelTr } = deriveRevenueFounderAction(stage);
  const currentStateLabelTr = REVENUE_STAGE_LABELS_TR[stage];
  const revenueSignalLabelTr = revenueSignalLabelFor(amounts, stage);
  const whatHappenedTr = whatHappenedFor(stage);
  const whyItMattersTr = whyItMattersFor(stage, health);
  const hermesRecommendationTr = hermesRecommendationFor(stage, health, risks);
  const founderNextActionTr = founderActionLabelTr
    ? `${founderActionLabelTr} — ${REVENUE_HEALTH_LABELS_TR[health]}`
    : "Şimdilik founder aksiyonu gerekmiyor.";
  const positiveSignalsTr = positiveSignalsFor(stage, amounts);

  const auditEvents: RevenuePipelineAuditEvent[] = [
    buildRevenuePipelineAuditEvent({
      type: "hermes_revenue_pipeline_evaluated",
      at: now,
      leadId,
      missionId,
      stage,
      health,
      riskCodes: risks.codes,
      estimatedMrr: amounts.estimatedMrr,
      realizedMrr: amounts.realizedMrr,
      detailTr: `Fırsat değerlendirildi: ${currentStateLabelTr} (${REVENUE_HEALTH_LABELS_TR[health]}).`,
    }),
  ];
  if (health === "at_risk") {
    auditEvents.push(
      buildRevenuePipelineAuditEvent({
        type: "hermes_revenue_risk_detected",
        at: now,
        leadId,
        missionId,
        stage,
        health,
        riskCodes: risks.codes,
        detailTr: risks.reasonsTr[0] ?? "Fırsat risk altında.",
      }),
    );
  }

  return {
    id: `revenue:${missionId ?? leadId ?? title}`,
    missionId,
    leadId,
    title,
    stage,
    health,
    priority,
    currentStateLabelTr,
    revenueSignalLabelTr,
    estimatedMrr: amounts.estimatedMrr,
    estimatedArr: amounts.estimatedArr,
    realizedMrr: amounts.realizedMrr,
    realizedArr: amounts.realizedArr,
    potentialMrr: amounts.potentialMrr,
    riskedMrr: amounts.riskedMrr,
    lostMrr: amounts.lostMrr,
    ageInStageHours,
    lastActivityAt,
    riskCodes: risks.codes,
    riskReasonsTr: risks.reasonsTr,
    positiveSignalsTr,
    whatHappenedTr,
    whyItMattersTr,
    hermesRecommendationTr,
    founderNextActionTr,
    founderActionRequired,
    founderActionLabelTr,
    closed,
    createdAt: lastActivityAt ?? now,
    updatedAt: now,
    auditEvents,
  };
}

/* ── özet + dönüşüm ─────────────────────────────────────────── */

export type RevenueConversion = {
  qualifiedToContacted: number | null;
  contactedToReply: number | null;
  replyToDemo: number | null;
  demoToWon: number | null;
};

export type RevenuePipelineSummary = {
  total: number;
  active: number;
  attentionRequired: number;
  atRisk: number;
  discovered: number;
  qualified: number;
  outreachPrepared: number;
  approvalPending: number;
  contacted: number;
  replyReceived: number;
  conversationActive: number;
  demoPending: number;
  demoScheduled: number;
  followUpDue: number;
  outcomePending: number;
  won: number;
  lost: number;
  paused: number;
  blocked: number;
  potentialMrr: number | null;
  potentialArr: number | null;
  realizedMrr: number | null;
  realizedArr: number | null;
  riskedMrr: number | null;
  lostMrr: number | null;
  missingRevenueEstimateCount: number;
  conversion: RevenueConversion;
};

const CLOSED_STAGES: ReadonlySet<RevenuePipelineStage> = new Set(["won", "lost", "paused", "blocked"]);

/** null-safe toplam: hiç gerçek tahmin yoksa null döner (sahte 0 değil). */
function sumNullable(values: (number | null)[]): number | null {
  const real = values.filter((v): v is number => v != null);
  if (real.length === 0) return null;
  return real.reduce((a, b) => a + b, 0);
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 100);
}

/**
 * Kümülatif funnel sıralaması — dönüşüm hesabı için. Aşama bu eşiğe ULAŞMIŞ
 * mı? (mevcut aşama sırası ≥ eşik). won/lost funnel'in sonuna ulaşmış sayılır;
 * paused/blocked/discovered funnel dışıdır (0).
 */
const FUNNEL_RANK: Record<RevenuePipelineStage, number> = {
  discovered: 0,
  qualified: 1,
  outreach_prepared: 2,
  approval_pending: 3,
  contacted: 4,
  reply_received: 5,
  conversation_active: 6,
  demo_pending: 7,
  demo_scheduled: 7,
  follow_up_due: 8,
  outcome_pending: 9,
  won: 10,
  lost: 10,
  paused: 0,
  blocked: 0,
};

export function summarizeRevenuePipeline(items: RevenuePipelineItem[]): RevenuePipelineSummary {
  const byStage = (s: RevenuePipelineStage) => items.filter((i) => i.stage === s).length;
  const active = items.filter((i) => !CLOSED_STAGES.has(i.stage)).length;

  const won = byStage("won");

  // Dönüşüm: kümülatif "en az bu aşamaya ulaşmış" sayıları; yalnız payda > 0
  // iken yüzde hesaplanır, aksi halde null (yanıltıcı %0 yok).
  const reachedAtLeast = (rank: number) => items.filter((i) => FUNNEL_RANK[i.stage] >= rank).length;
  const reachedQualified = reachedAtLeast(1);
  const reachedContact = reachedAtLeast(4);
  const reachedReply = reachedAtLeast(5);
  const reachedDemo = reachedAtLeast(7);

  return {
    total: items.length,
    active,
    attentionRequired: items.filter((i) => i.health === "attention").length,
    atRisk: items.filter((i) => i.health === "at_risk").length,
    discovered: byStage("discovered"),
    qualified: byStage("qualified"),
    outreachPrepared: byStage("outreach_prepared"),
    approvalPending: byStage("approval_pending"),
    contacted: byStage("contacted"),
    replyReceived: byStage("reply_received"),
    conversationActive: byStage("conversation_active"),
    demoPending: byStage("demo_pending"),
    demoScheduled: byStage("demo_scheduled"),
    followUpDue: byStage("follow_up_due"),
    outcomePending: byStage("outcome_pending"),
    won,
    lost: byStage("lost"),
    paused: byStage("paused"),
    blocked: byStage("blocked"),
    potentialMrr: sumNullable(items.map((i) => i.potentialMrr)),
    potentialArr: sumNullable(items.map((i) => (i.potentialMrr != null ? calculateRevenueArr(i.potentialMrr) : null))),
    realizedMrr: sumNullable(items.map((i) => i.realizedMrr)),
    realizedArr: sumNullable(items.map((i) => i.realizedArr)),
    riskedMrr: sumNullable(items.map((i) => i.riskedMrr)),
    lostMrr: sumNullable(items.map((i) => i.lostMrr)),
    missingRevenueEstimateCount: items.filter((i) => i.riskCodes.includes("missing_revenue_estimate")).length,
    conversion: {
      qualifiedToContacted: pct(reachedContact, reachedQualified),
      contactedToReply: pct(reachedReply, reachedContact),
      replyToDemo: pct(reachedDemo, reachedReply),
      demoToWon: pct(won, reachedDemo),
    },
  };
}

/* ── aktif / sıralama ───────────────────────────────────────── */

export function isActiveRevenueItem(item: Pick<RevenuePipelineItem, "stage">): boolean {
  return !CLOSED_STAGES.has(item.stage);
}

const PRIORITY_SORT_WEIGHT: Record<RevenuePipelinePriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const STAGE_SORT_WEIGHT: Record<RevenuePipelineStage, number> = {
  outcome_pending: 0,
  follow_up_due: 1,
  demo_scheduled: 2,
  demo_pending: 3,
  conversation_active: 4,
  reply_received: 5,
  approval_pending: 6,
  contacted: 7,
  outreach_prepared: 8,
  qualified: 9,
  discovered: 10,
  won: 11,
  paused: 12,
  blocked: 13,
  lost: 14,
};

/** Deterministik: öncelik → aşama (satışa yakınlık) → estimatedMrr (yüksek önce) → id. Girdi mutate edilmez. */
export function sortRevenuePipeline(items: RevenuePipelineItem[]): RevenuePipelineItem[] {
  return [...items].sort((a, b) => {
    const p = PRIORITY_SORT_WEIGHT[a.priority] - PRIORITY_SORT_WEIGHT[b.priority];
    if (p !== 0) return p;
    const s = STAGE_SORT_WEIGHT[a.stage] - STAGE_SORT_WEIGHT[b.stage];
    if (s !== 0) return s;
    const am = a.estimatedMrr ?? -1;
    const bm = b.estimatedMrr ?? -1;
    if (am !== bm) return bm - am;
    return a.id.localeCompare(b.id);
  });
}

/** "Gelire en yakın" fırsatlar: açık, satışa yakın aşamalar, öncelik/aşama sırasıyla. */
export function selectClosestToRevenue(items: RevenuePipelineItem[], limit: number = 5): RevenuePipelineItem[] {
  const near: ReadonlySet<RevenuePipelineStage> = new Set([
    "outcome_pending", "follow_up_due", "demo_scheduled", "demo_pending", "conversation_active",
  ]);
  return sortRevenuePipeline(items.filter((i) => near.has(i.stage))).slice(0, Math.max(0, limit));
}

/** Riskteki fırsatlar: yalnız at_risk sağlığı olanlar, öncelik sırasıyla. */
export function selectAtRiskRevenue(items: RevenuePipelineItem[], limit: number = 5): RevenuePipelineItem[] {
  return sortRevenuePipeline(items.filter((i) => i.health === "at_risk")).slice(0, Math.max(0, limit));
}
