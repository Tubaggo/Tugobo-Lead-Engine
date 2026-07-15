import {
  actionStageOf,
  computeMissionFocus,
  type ActionStage,
  type MissionLike,
} from "./founder-revenue-workspace-adapter.ts";
import type { HermesDecisionItem } from "./hermes-decision-queue-adapter.ts";
import { DELIVERY_STATUS_LABELS_TR } from "../../../lib/whatsapp-delivery-receipt-runtime.ts";
import type { ProcessedWhatsAppDeliveryReceipt } from "../../../lib/whatsapp-delivery-receipt-processor.ts";
import type { StoredWhatsAppReply } from "../../../lib/whatsapp-reply-registry.ts";
import { REPLY_INTENT_LABELS_TR, type ReplyIntelligenceItem } from "../../../lib/reply-intelligence-runtime.ts";
import type { DemoScheduleItem } from "../../../lib/demo-scheduling-runtime.ts";
import type { FollowUpCandidate } from "../../../lib/follow-up-runtime.ts";
import type { SalesOutcomeItem } from "../../../lib/sales-outcome-runtime.ts";

/**
 * Hermes Opportunity Focus adapter (v8.3 — Opportunity Focus Operating
 * Layer).
 *
 * Pure presentation-layer transform that answers one question for the
 * founder's currently-selected mission: "Bu otel için şimdi ne yapmalıyım?"
 * It recreates nothing `actionStageOf`/`computeMissionFocus`
 * (`founder-revenue-workspace-adapter.ts`) already decide — it calls both
 * directly and translates their output into founder-operational Turkish
 * copy plus one primary (and, only for `approve_message`, one secondary)
 * action. When a matching `HermesDecisionItem` exists (the same object
 * `hermes-decision-queue-adapter.ts` already produced for Karar Merkezi),
 * this module reuses its `hermesRecommendation`/`primaryActionLabel`/
 * `secondaryActionLabel` verbatim instead of inventing a second copy of the
 * same sentence — single source of truth for "what Hermes recommends."
 *
 * Not a debug panel, not a mission object viewer, not a CRM detail screen:
 * raw stage labels, provider message ids, and registry/runtime/bridge/
 * webhook vocabulary never appear here.
 */

export type HermesOpportunityUrgency = "critical" | "high" | "medium" | "low" | "none";
export type HermesOpportunityTimelineTone = "success" | "warning" | "danger" | "info" | "neutral";

export type HermesOpportunityTimelineEntry = {
  label: string;
  occurredAt: number | null;
  tone: HermesOpportunityTimelineTone;
};

export type HermesOpportunityFocus = {
  id: string;
  missionId: string | null;
  leadId: string | null;
  title: string;
  subtitle: string;
  currentStateLabel: string;
  revenueSignalLabel: string;
  urgency: HermesOpportunityUrgency;
  whyThisMatters: string;
  hermesRecommendation: string;
  founderNextAction: string;
  primaryActionLabel: string | null;
  secondaryActionLabel: string | null;
  whatsappStatusLabel: string | null;
  replyIntentLabel: string | null;
  demoStatusLabel: string | null;
  followUpStatusLabel: string | null;
  outcomeStatusLabel: string | null;
  estimatedMrrLabel: string | null;
  timeline: HermesOpportunityTimelineEntry[];
  emptyState: string | null;
  /** Sprint C2 — "Satışa Hazır" vb. hazırlık etiketi; değerlendirme yoksa null. */
  salesReadinessLabel: string | null;
  /** Sprint C2 — güçlü sinyaller + dikkat noktası tek paragrafta; değerlendirme yoksa null. */
  salesReadinessSummary: string | null;
  /** Sprint C2 — "Mesaj Hazırlamaya Uygun" | "Founder İncelemesi Gerekli"; değerlendirme yoksa null. */
  draftEligibilityLabel: string | null;
  /** Sprint C3 — Outreach hazırlık durumu ("Founder Onayı Bekliyor" vb.); hazırlık yoksa null. */
  outreachStatusLabel: string | null;
  /** Sprint C3 — önerilen kanal; hazırlık yoksa null. */
  outreachChannelLabel: string | null;
  /** Sprint C3 — seçilen şablon; hazırlık yoksa null. */
  outreachTemplateLabel: string | null;
  /** Sprint C3 — önerilen dil; hazırlık yoksa null. */
  outreachLanguageLabel: string | null;
  /** Sprint C3 — personalization sinyallerinin tek satır özeti; hazırlık yoksa null. */
  outreachPersonalizationSummary: string | null;
  /** Sprint C3 — founder'ın atacağı sonraki adım (mesajı incele/onayla); hazırlık yoksa null. */
  outreachFounderAction: string | null;
};

/** Sprint C3 — seçili lead'in outreach hazırlık özetinin bu panelin okuduğu alt kümesi. */
export type OpportunityFocusOutreachLike = {
  statusLabelTr: string;
  channelLabelTr?: string;
  templateLabelTr?: string;
  languageLabelTr?: string;
  personalizationSignalsTr?: string[];
  nextActionLabelTr?: string;
};

/**
 * Founder Mission Feedback Loop fix — a pre-classified, mission-scoped
 * timeline entry the caller (`FounderRevenueWorkspace.tsx`) already derived
 * from real runtime records (`HermesPipeline`'s own step timestamps via
 * `buildPipelineTimelineEntries`, `HermesOutboundDraft`'s own timestamps via
 * `buildDraftTimelineEntries`). This adapter never imports those modules
 * itself — both live under `@/`-aliased paths, which would break this
 * file's plain-`node --test` runnability — so it only accepts their
 * already-computed, already-toned output as plain data. The caller is
 * responsible for scoping entries to the one selected mission; this module
 * trusts that contract and merges them in unfiltered, same as every other
 * `*Like` input this file already accepts.
 */
export type OpportunityFocusExtraTimelineEntryLike = {
  at: number;
  text: string;
  tone: HermesOpportunityTimelineTone;
};

/** Sprint C2 — seçili lead'in qualification özetinin bu panelin okuduğu alt kümesi. */
export type OpportunityFocusQualificationLike = {
  statusLabelTr: string;
  founderSummaryTr?: string;
  positiveReasonsTr?: string[];
  cautionReasonsTr?: string[];
  eligibleForOutreachDraft?: boolean;
  status?: string;
};

/** Structural superset of `MissionLike` — the extra fields Opportunity Focus needs that Karar Merkezi's `MissionLike` doesn't carry. Any real `HermesMission` satisfies this automatically. */
export type OpportunityFocusMissionLike = MissionLike & {
  leadId: string;
  city: string;
  estimatedImpact: number;
};

export type ComputeHermesOpportunityFocusInput = {
  selectedMission: OpportunityFocusMissionLike | null;
  /** The same array `hermes-decision-queue-adapter.ts` already produced — reused for its copy, never recomputed. */
  decisionItems?: HermesDecisionItem[];
  recentReceipts?: ProcessedWhatsAppDeliveryReceipt[];
  recentReplies?: StoredWhatsAppReply[];
  recentIntelligence?: ReplyIntelligenceItem[];
  recentDemoItems?: DemoScheduleItem[];
  recentFollowUps?: FollowUpCandidate[];
  recentSalesOutcomes?: SalesOutcomeItem[];
  /** Sprint C2 — seçili mission'ın lead'i için kayıtlı qualification özeti (varsa). */
  qualificationForLead?: OpportunityFocusQualificationLike | null;
  /** Sprint C3 — seçili mission'ın lead'i için kayıtlı outreach hazırlık özeti (varsa). */
  outreachForLead?: OpportunityFocusOutreachLike | null;
  /**
   * Founder Mission Feedback Loop fix — the selected mission's real pipeline
   * step / courier draft events, already converted to timeline entries by
   * the caller. Optional and additive: omitting it reproduces the exact
   * pre-existing timeline (mission.timeline + receipts/replies/demo/
   * follow-up/outcome).
   */
  extraTimelineEntries?: OpportunityFocusExtraTimelineEntryLike[];
  /**
   * Founder Mission Execution Experience fix — true only when the caller's
   * real `HermesPipeline.state === "running"` for this mission. Swaps the
   * generic "ready" headline for an honest "Hermes is working right now"
   * one; every other stage is unaffected. Optional and additive — omitting
   * it (or passing false) reproduces the exact pre-existing copy.
   */
  pipelineRunning?: boolean;
};

const EMPTY_STATE_MESSAGE = "Bir fırsat seçtiğinde Hermes bu otel için önerilen sonraki adımı gösterecek.";
const NO_ACTION_NEEDED = "Şimdilik aksiyon gerekmiyor";

function emptyFocus(): HermesOpportunityFocus {
  return {
    id: "opportunity-focus:none",
    missionId: null,
    leadId: null,
    title: "",
    subtitle: "",
    currentStateLabel: "",
    revenueSignalLabel: "",
    urgency: "none",
    whyThisMatters: "",
    hermesRecommendation: "",
    founderNextAction: "",
    primaryActionLabel: null,
    secondaryActionLabel: null,
    whatsappStatusLabel: null,
    replyIntentLabel: null,
    demoStatusLabel: null,
    followUpStatusLabel: null,
    outcomeStatusLabel: null,
    estimatedMrrLabel: null,
    timeline: [],
    emptyState: EMPTY_STATE_MESSAGE,
    salesReadinessLabel: null,
    salesReadinessSummary: null,
    draftEligibilityLabel: null,
    outreachStatusLabel: null,
    outreachChannelLabel: null,
    outreachTemplateLabel: null,
    outreachLanguageLabel: null,
    outreachPersonalizationSummary: null,
    outreachFounderAction: null,
  };
}

/**
 * Sprint C3 — outreach hazırlık özetini panelin outreach satırlarına çevirir.
 * Saf seçim; ham mesaj metni, template içeriği veya teknik terim üretmez.
 */
function outreachReadinessOf(o: OpportunityFocusOutreachLike | null | undefined): {
  statusLabel: string | null;
  channelLabel: string | null;
  templateLabel: string | null;
  languageLabel: string | null;
  personalizationSummary: string | null;
  founderAction: string | null;
} {
  if (!o) {
    return {
      statusLabel: null,
      channelLabel: null,
      templateLabel: null,
      languageLabel: null,
      personalizationSummary: null,
      founderAction: null,
    };
  }
  const signals = (o.personalizationSignalsTr ?? []).slice(0, 3);
  return {
    statusLabel: o.statusLabelTr,
    channelLabel: o.channelLabelTr ?? null,
    templateLabel: o.templateLabelTr ?? null,
    languageLabel: o.languageLabelTr ?? null,
    personalizationSummary: signals.length > 0 ? signals.join(" · ") : null,
    founderAction: o.nextActionLabelTr ?? null,
  };
}

/**
 * Sprint C2 — qualification özetini panelin iki satırına çevirir: hazırlık
 * etiketi + "neden hazır / neden henüz değil" paragrafı. Saf seçim; skor
 * formülü, iç enum veya teknik terim üretmez.
 */
function salesReadinessOf(q: OpportunityFocusQualificationLike | null | undefined): {
  label: string | null;
  summary: string | null;
  draftLabel: string | null;
} {
  if (!q) return { label: null, summary: null, draftLabel: null };
  const parts: string[] = [];
  if (q.founderSummaryTr?.trim()) parts.push(q.founderSummaryTr.trim());
  const positives = (q.positiveReasonsTr ?? []).slice(0, 3);
  if (positives.length > 0) parts.push(`Güçlü sinyaller: ${positives.join(", ").toLowerCase()}.`);
  const caution = (q.cautionReasonsTr ?? [])[0];
  if (caution) parts.push(`Dikkat: ${caution.toLowerCase()}.`);
  return {
    label: q.statusLabelTr,
    summary: parts.join(" ") || null,
    draftLabel:
      q.status === "sales_ready"
        ? q.eligibleForOutreachDraft === true
          ? "Mesaj Hazırlamaya Uygun"
          : "Founder İncelemesi Gerekli"
        : null,
  };
}

/** Reuses the same 75/50 banding convention already used elsewhere in this codebase (e.g. `automation-center-adapter.ts`'s priority tiers) — not a new scoring rule, just a qualitative read of `mission.estimatedImpact`. */
function revenueSignalLabelFor(estimatedImpact: number): string {
  if (estimatedImpact >= 75) return "Yüksek Gelir Potansiyeli";
  if (estimatedImpact >= 50) return "Orta Gelir Potansiyeli";
  return "Standart Fırsat";
}

type StateCopy = {
  currentStateLabel: string;
  urgency: HermesOpportunityUrgency;
  whyThisMatters: string;
  founderNextAction: string;
  defaultRecommendation: string;
};

/**
 * Focus rules 2–10 — one Turkish description per `ActionStage`, matched to
 * the sprint's exact required copy for the 9 explicitly-specified states.
 * `reply_needs_review` (not explicitly listed) extends the same "active
 * decision" spirit `hermes-decision-queue-adapter.ts` already gives it
 * (`review_unknown`) rather than being folded into the passive rule.
 */
const STATE_COPY: Record<ActionStage, StateCopy> = {
  failed: {
    currentStateLabel: "Teslimat sorunu var",
    urgency: "critical",
    whyThisMatters: "Fırsat mesajsız kalırsa iletişim tamamen kopabilir.",
    founderNextAction: "Teslimat hatasını çöz",
    defaultRecommendation: "Farklı kanal veya manuel kontrol önerilir.",
  },
  hot_reply: {
    currentStateLabel: "Sıcak cevap geldi",
    urgency: "high",
    whyThisMatters: "Hızlı yanıt vermezsen ilgi soğuyabilir.",
    founderNextAction: "Cevabı incele",
    defaultRecommendation: "Cevabı incele ve uygun aksiyonu al.",
  },
  demo_pending: {
    currentStateLabel: "Demo planlanmalı",
    urgency: "high",
    whyThisMatters: "Demo planlanmazsa fırsat ilerlemez.",
    founderNextAction: "Demo zamanı planla",
    defaultRecommendation: "Demo zamanı planla.",
  },
  follow_up_required: {
    currentStateLabel: "Takip gerekiyor",
    urgency: "high",
    whyThisMatters: "Zamanında takip edilmezse fırsat soğuyabilir.",
    founderNextAction: "Takip kararını ver",
    defaultRecommendation: "Takip mesajı öner.",
  },
  outcome_required: {
    currentStateLabel: "Satış sonucu bekliyor",
    urgency: "medium",
    whyThisMatters: "Sonuç işaretlenmezse pipeline güncel kalmaz.",
    founderNextAction: "Sonucu işaretle",
    defaultRecommendation: "Demo/follow-up sonrası satış sonucunu belirle.",
  },
  approval_required: {
    currentStateLabel: "Mesaj onayı bekliyor",
    urgency: "high",
    whyThisMatters: "Onaylanmazsa mesaj gönderilmez, fırsat ilerlemez.",
    founderNextAction: "Mesajı onayla veya reddet",
    defaultRecommendation: "Hazırlanan mesaj gözden geçirilip onaylanmayı bekliyor.",
  },
  reply_needs_review: {
    currentStateLabel: "İnceleme gerekiyor",
    urgency: "medium",
    whyThisMatters: "Manuel incelenmezse fırsat gözden kaçabilir.",
    founderNextAction: "Cevabı incele",
    defaultRecommendation: "Cevabı manuel incele.",
  },
  won: {
    currentStateLabel: "Satış kazanıldı",
    urgency: "low",
    whyThisMatters: "Onboarding başlamazsa yeni müşteri deneyimi gecikir.",
    founderNextAction: "Onboarding sürecine geç",
    defaultRecommendation: "Satış kazanıldı, onboarding sürecine geç.",
  },
  lost: {
    currentStateLabel: "Satış kaybedildi",
    urgency: "low",
    whyThisMatters: "Kayıp nedeni değerlendirilmezse aynı hata tekrar edebilir.",
    founderNextAction: "Kayıp nedenini değerlendir",
    defaultRecommendation: "Kayıp nedeni kaydedildi.",
  },
  sent: {
    currentStateLabel: "Mesaj gönderildi",
    urgency: "low",
    whyThisMatters: "Hermes yanıtı bekliyor, şu an ek bir aksiyon gerekmiyor.",
    founderNextAction: NO_ACTION_NEEDED,
    defaultRecommendation: "Hermes bu fırsatı izlemeye devam ediyor.",
  },
  delivered: {
    currentStateLabel: "Teslim edildi",
    urgency: "low",
    whyThisMatters: "Mesaj ulaştı, yanıt bekleniyor.",
    founderNextAction: NO_ACTION_NEEDED,
    defaultRecommendation: "Hermes bu fırsatı izlemeye devam ediyor.",
  },
  read: {
    currentStateLabel: "Okundu",
    urgency: "low",
    whyThisMatters: "Mesaj okundu, yanıt bekleniyor.",
    founderNextAction: NO_ACTION_NEEDED,
    defaultRecommendation: "Hermes bu fırsatı izlemeye devam ediyor.",
  },
  reply_received: {
    currentStateLabel: "Hermes takipte",
    urgency: "low",
    whyThisMatters: "Cevap değerlendirildi, şu an ek bir aksiyon gerekmiyor.",
    founderNextAction: NO_ACTION_NEEDED,
    defaultRecommendation: "Hermes bu fırsatı izlemeye devam ediyor.",
  },
  ready: {
    currentStateLabel: "Hermes takipte",
    urgency: "none",
    whyThisMatters: "Fırsat yürütmeye hazır, sırası geldiğinde ilerleyecek.",
    founderNextAction: NO_ACTION_NEEDED,
    defaultRecommendation: "Hermes bu fırsatı izlemeye devam ediyor.",
  },
  unknown: {
    currentStateLabel: "Hermes takipte",
    urgency: "none",
    whyThisMatters: "Şu an belirgin bir sinyal yok.",
    founderNextAction: NO_ACTION_NEEDED,
    defaultRecommendation: "Hermes bu fırsatı izlemeye devam ediyor.",
  },
};

/**
 * Founder Mission Execution Experience fix — `STATE_COPY.ready`'s copy
 * ("Hermes takipte" / "sırası geldiğinde ilerleyecek") was written for a
 * mission with no pipeline at all, but it's also what "ready" falls back to
 * the instant a mission is approved and its pipeline is actively
 * `"running"` — which reads as passive/idle exactly when Hermes is doing
 * real work. This is the one, narrowly-targeted override: only replaces the
 * "ready" stage's copy, only when the caller has confirmed (via the real
 * `HermesPipeline.state`) that work is actually in progress right now.
 */
const RUNNING_STATE_COPY: StateCopy = {
  currentStateLabel: "Hermes şu anda çalışıyor",
  urgency: "none",
  whyThisMatters: "Hermes fırsatı hazırlıyor — tamamlandığında bir sonraki adım burada görünecek.",
  founderNextAction: NO_ACTION_NEEDED,
  defaultRecommendation: "Hermes bu fırsat için hazırlığını sürdürüyor.",
};

function isSameMission(missionId: string | null, targetMissionId: string): boolean {
  return missionId === targetMissionId;
}

/** Combines mission.timeline (already-sanitized Turkish text) with a handful of other existing, timestamped, per-mission records into one compact feed — never more than the 8 most recent. */
function buildTimeline(
  mission: OpportunityFocusMissionLike,
  input: ComputeHermesOpportunityFocusInput,
): HermesOpportunityTimelineEntry[] {
  const entries: HermesOpportunityTimelineEntry[] = [];

  for (const t of mission.timeline) {
    let tone: HermesOpportunityTimelineTone = "info";
    if (t.text.startsWith("Onayladı")) tone = "success";
    else if (t.text.startsWith("Reddetti")) tone = "danger";
    entries.push({ label: t.text, occurredAt: t.at, tone });
  }

  // Founder Mission Feedback Loop fix — real pipeline-stage / courier-draft
  // events for this same mission, pre-toned by the caller.
  for (const extra of input.extraTimelineEntries ?? []) {
    entries.push({ label: extra.text, occurredAt: extra.at, tone: extra.tone });
  }

  const receipt = (input.recentReceipts ?? [])
    .filter((r) => isSameMission(r.missionId, mission.missionId))
    .sort((a, b) => b.occurredAt - a.occurredAt)[0];
  if (receipt) {
    const tone: HermesOpportunityTimelineTone =
      receipt.status === "failed" ? "danger" : receipt.status === "read" || receipt.status === "delivered" ? "success" : "info";
    entries.push({ label: DELIVERY_STATUS_LABELS_TR[receipt.status], occurredAt: receipt.occurredAt, tone });
  }

  const reply = (input.recentReplies ?? []).find((r) => isSameMission(r.missionId, mission.missionId));
  if (reply) {
    entries.push({ label: "Cevap geldi", occurredAt: reply.occurredAt, tone: "info" });
  }

  const demoItem = (input.recentDemoItems ?? []).find((d) => isSameMission(d.missionId, mission.missionId));
  if (demoItem) {
    const tone: HermesOpportunityTimelineTone = demoItem.status === "scheduled" || demoItem.status === "completed" ? "success" : "info";
    entries.push({ label: "Demo adayı oluştu", occurredAt: demoItem.updatedAt, tone });
  }

  const followUp = (input.recentFollowUps ?? []).find((f) => isSameMission(f.missionId, mission.missionId));
  if (followUp) {
    entries.push({ label: "Takip önerildi", occurredAt: followUp.updatedAt, tone: followUp.priority === "high" ? "warning" : "info" });
  }

  const outcome = (input.recentSalesOutcomes ?? []).find(
    (o) => isSameMission(o.missionId, mission.missionId) && (o.status === "won" || o.status === "lost"),
  );
  if (outcome) {
    entries.push({
      label: "Satış sonucu kaydedildi",
      occurredAt: outcome.closedAt ?? outcome.updatedAt,
      tone: outcome.status === "won" ? "success" : "danger",
    });
  }

  return entries.sort((a, b) => (b.occurredAt ?? 0) - (a.occurredAt ?? 0)).slice(0, 8);
}

export function computeHermesOpportunityFocus(input: ComputeHermesOpportunityFocusInput): HermesOpportunityFocus {
  const mission = input.selectedMission;
  if (!mission) return emptyFocus();

  const recentReceipts = input.recentReceipts ?? [];
  const recentReplies = input.recentReplies ?? [];
  const recentIntelligence = input.recentIntelligence ?? [];
  const recentDemoItems = input.recentDemoItems ?? [];
  const recentFollowUps = input.recentFollowUps ?? [];
  const recentSalesOutcomes = input.recentSalesOutcomes ?? [];

  const stage = actionStageOf(
    mission,
    recentReceipts,
    recentReplies,
    recentIntelligence,
    recentDemoItems,
    recentFollowUps,
    recentSalesOutcomes,
  );
  const missionFocus = computeMissionFocus(
    mission,
    recentReceipts,
    recentReplies,
    recentIntelligence,
    recentDemoItems,
    recentFollowUps,
    recentSalesOutcomes,
  );
  const matchingDecisionItem = (input.decisionItems ?? []).find((d) => isSameMission(d.missionId, mission.missionId)) ?? null;
  const intelligence = recentIntelligence.find((i) => isSameMission(i.missionId, mission.missionId)) ?? null;

  const copy = input.pipelineRunning && stage === "ready" ? RUNNING_STATE_COPY : STATE_COPY[stage];
  const readiness = salesReadinessOf(input.qualificationForLead);
  const outreach = outreachReadinessOf(input.outreachForLead);

  return {
    id: `opportunity-focus:${mission.missionId}`,
    missionId: mission.missionId,
    leadId: mission.leadId,
    title: mission.hotelName,
    subtitle: mission.city,
    currentStateLabel: copy.currentStateLabel,
    revenueSignalLabel: revenueSignalLabelFor(mission.estimatedImpact),
    urgency: copy.urgency,
    whyThisMatters: copy.whyThisMatters,
    // Priority: the matching decision item's own recommendation (single
    // source of truth with Karar Merkezi) → the reply intelligence hint
    // directly (rules 3/"reply_needs_review" both cite it as their source,
    // and it should apply even when no decision item was passed in) → the
    // stage's generic default.
    hermesRecommendation: matchingDecisionItem?.hermesRecommendation ?? intelligence?.founderActionHint ?? copy.defaultRecommendation,
    founderNextAction: copy.founderNextAction,
    primaryActionLabel: matchingDecisionItem?.primaryActionLabel ?? null,
    secondaryActionLabel: matchingDecisionItem?.secondaryActionLabel ?? null,
    whatsappStatusLabel: missionFocus.deliveryStateLabel,
    replyIntentLabel: intelligence ? REPLY_INTENT_LABELS_TR[intelligence.intent] : null,
    demoStatusLabel: missionFocus.demoStatusLabel,
    followUpStatusLabel: missionFocus.followUpStatusLabel,
    outcomeStatusLabel: missionFocus.outcomeStatusLabel,
    estimatedMrrLabel: missionFocus.outcomeEstimatedMrrLabel,
    timeline: buildTimeline(mission, input),
    emptyState: null,
    salesReadinessLabel: readiness.label,
    salesReadinessSummary: readiness.summary,
    draftEligibilityLabel: readiness.draftLabel,
    outreachStatusLabel: outreach.statusLabel,
    outreachChannelLabel: outreach.channelLabel,
    outreachTemplateLabel: outreach.templateLabel,
    outreachLanguageLabel: outreach.languageLabel,
    outreachPersonalizationSummary: outreach.personalizationSummary,
    outreachFounderAction: outreach.founderAction,
  };
}
