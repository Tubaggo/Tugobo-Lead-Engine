import type { ActionQueueItem, ActionStage } from "./founder-revenue-workspace-adapter.ts";

/**
 * Hermes Decision Queue adapter (v8.2 — Decision Queue Operating Layer).
 *
 * Pure presentation-layer transform, one step downstream of
 * `founder-revenue-workspace-adapter.ts`'s own `computeActionQueue` — it
 * does not re-derive a mission's `ActionStage` (that stays
 * `actionStageOf`'s job), it only decides, per already-computed stage,
 * whether the item is something the founder can act on with a single
 * decision, and if so, translates it into operational Turkish copy plus one
 * primary (and optionally one secondary) action label. No mutation, no
 * fetch, no new runtime — every recommendation string is either a fixed
 * per-type sentence or a lookup into a founder-facing hint another runtime
 * already computed (`ReplyIntelligenceItem.founderActionHint`,
 * `DemoScheduleItem.suggestedAction`, `FollowUpCandidate.suggestedAction`,
 * `SalesOutcomeItem.suggestedAction`).
 *
 * Product principle this file encodes: "Bilgi ≠ karar." A passive status
 * (read/delivered/sent/ready/won/lost/unknown/reply_received — mere
 * information, nothing to decide) never becomes a `HermesDecisionItem`.
 * Only a stage where the founder can take one concrete, single-touch
 * decision does.
 */

export type HermesDecisionType =
  | "approve_message"
  | "review_hot_reply"
  | "plan_demo"
  | "decide_follow_up"
  | "mark_outcome"
  | "resolve_failed_delivery"
  | "review_unknown"
  /** Sprint C2 — yalnız gerçek founder incelemesi gerektiren qualification sonuçları. */
  | "review_qualification";

export type HermesDecisionPriority = "critical" | "high" | "medium" | "low";
export type HermesDecisionConfidence = "high" | "medium" | "low";
export type HermesDecisionUrgency = "high" | "medium" | "low";

export type HermesDecisionItem = {
  id: string;
  missionId: string | null;
  leadId: string | null;
  title: string;
  decisionType: HermesDecisionType;
  priority: HermesDecisionPriority;
  statusLabel: string;
  whatHappened: string;
  whyItMatters: string;
  hermesRecommendation: string;
  founderDecisionLabel: string;
  primaryActionLabel: string;
  secondaryActionLabel: string | null;
  lastActivityAt: number | null;
  sourceStage: ActionStage;
  mapped: boolean;
  confidence: HermesDecisionConfidence | null;
  urgency: HermesDecisionUrgency | null;
};

/* ── Structural input shapes — kept minimal and local so this module never
   needs an "@/"-aliased import and stays runnable under plain `node --test`,
   the same convention `founder-revenue-workspace-adapter.ts`'s `MissionLike`
   already established. Any real runtime object (`HermesMission`,
   `ProcessedWhatsAppDeliveryReceipt`, `ReplyIntelligenceItem`,
   `DemoScheduleItem`, `FollowUpCandidate`, `SalesOutcomeItem`) satisfies its
   corresponding type here automatically. ── */

export type DecisionQueueMissionLike = {
  missionId: string;
  leadId: string;
};

export type DecisionQueueReceiptLike = {
  missionId: string | null;
  status: string;
  errorMessageSafe: string | null;
  occurredAt: number;
};

export type DecisionQueueReplyIntelligenceLike = {
  missionId: string | null;
  confidence: string;
  urgency: string;
  founderActionHint: string;
  analyzedAt: number;
};

export type DecisionQueueDemoItemLike = {
  missionId: string | null;
  status: string;
  suggestedAction: string;
  updatedAt: number;
};

export type DecisionQueueFollowUpLike = {
  missionId: string | null;
  status: string;
  priority: string;
  suggestedAction: string;
  updatedAt: number;
};

export type DecisionQueueSalesOutcomeLike = {
  missionId: string | null;
  status: string;
  suggestedAction: string;
  updatedAt: number;
};

/** Sprint C2 — review_required qualification sonucunun karar öğesine giren alt kümesi. */
export type DecisionQueueQualificationReviewLike = {
  leadId: string | null;
  businessName: string;
  founderSummaryTr?: string;
  hermesRecommendationTr?: string;
  evaluatedAt?: number;
};

export type ComputeHermesDecisionQueueInput = {
  /** Already-computed by `computeActionQueue` — this module never re-derives a mission's stage. */
  actionQueue: ActionQueueItem[];
  missions: DecisionQueueMissionLike[];
  recentReceipts?: DecisionQueueReceiptLike[];
  recentIntelligence?: DecisionQueueReplyIntelligenceLike[];
  recentDemoItems?: DecisionQueueDemoItemLike[];
  recentFollowUps?: DecisionQueueFollowUpLike[];
  recentSalesOutcomes?: DecisionQueueSalesOutcomeLike[];
  /**
   * Sprint C2 — çağıran YALNIZ gerçek founder incelemesi gerektiren
   * (review_required) qualification sonuçlarını verir
   * (`selectQualificationReviewItems`); sales_ready/watch/data_needed asla
   * karar öğesi olmaz — kuyruk dashboard'a dönüşmez.
   */
  qualificationReviews?: DecisionQueueQualificationReviewLike[];
};

/** Stages that are mere information, never a single-touch decision — never become a `HermesDecisionItem`. */
const PASSIVE_STAGES: ReadonlySet<ActionStage> = new Set([
  "read",
  "delivered",
  "sent",
  "ready",
  "won",
  "lost",
  "unknown",
  "reply_received",
]);

const PRIORITY_RANK: Record<HermesDecisionPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function isValidConfidence(value: string): value is HermesDecisionConfidence {
  return value === "high" || value === "medium" || value === "low";
}

function isValidUrgency(value: string): value is HermesDecisionUrgency {
  return value === "high" || value === "medium" || value === "low";
}

function leadIdForMission(missionId: string, missions: DecisionQueueMissionLike[]): string | null {
  return missions.find((m) => m.missionId === missionId)?.leadId ?? null;
}

/**
 * Builds one `HermesDecisionItem` for an `ActionQueueItem` whose stage is
 * actionable, or `null` for a passive stage. This is the only place stage →
 * decisionType/priority/copy is decided — a single lookup table, not a
 * scoring model.
 */
function buildDecisionItem(item: ActionQueueItem, input: ComputeHermesDecisionQueueInput): HermesDecisionItem | null {
  if (PASSIVE_STAGES.has(item.stage)) return null;

  const leadId = leadIdForMission(item.missionId, input.missions);
  const lastActivityAt = item.lastActivityAt > 0 ? item.lastActivityAt : null;

  const base = {
    id: `decision:${item.missionId}:${item.stage}`,
    missionId: item.missionId,
    leadId,
    title: item.hotelName,
    lastActivityAt,
    sourceStage: item.stage,
    mapped: Boolean(item.missionId),
  };

  switch (item.stage) {
    case "failed": {
      const receipt = (input.recentReceipts ?? []).find(
        (r) => r.missionId === item.missionId && r.status === "failed",
      );
      return {
        ...base,
        decisionType: "resolve_failed_delivery",
        priority: "critical",
        statusLabel: "Teslimat Hatası",
        whatHappened: receipt?.errorMessageSafe
          ? `Mesaj teslim edilemedi (${receipt.errorMessageSafe}).`
          : "Mesaj teslim edilemedi.",
        whyItMatters: "Fırsat mesajsız kalırsa iletişim tamamen kopabilir.",
        hermesRecommendation: "Farklı kanal veya manuel kontrol önerilir.",
        founderDecisionLabel: "Teslimat sorununu nasıl çözeceğine karar ver.",
        primaryActionLabel: "Çöz",
        secondaryActionLabel: null,
        confidence: null,
        urgency: "high",
      };
    }
    case "hot_reply": {
      const intelligence = (input.recentIntelligence ?? []).find((i) => i.missionId === item.missionId);
      return {
        ...base,
        decisionType: "review_hot_reply",
        priority: "high",
        statusLabel: "Sıcak Cevap",
        whatHappened: "Müşteriden sıcak bir cevap geldi.",
        whyItMatters: "Hızlı yanıt vermezsen ilgi soğuyabilir.",
        hermesRecommendation: intelligence?.founderActionHint ?? "Cevabı incele ve uygun aksiyonu al.",
        founderDecisionLabel: "Cevaba nasıl karşılık vereceğine karar ver.",
        primaryActionLabel: "İncele",
        secondaryActionLabel: null,
        confidence: intelligence && isValidConfidence(intelligence.confidence) ? intelligence.confidence : null,
        urgency: intelligence && isValidUrgency(intelligence.urgency) ? intelligence.urgency : "high",
      };
    }
    case "demo_pending": {
      const demoItem = (input.recentDemoItems ?? []).find((d) => d.missionId === item.missionId);
      return {
        ...base,
        decisionType: "plan_demo",
        priority: "high",
        statusLabel: "Demo Bekliyor",
        whatHappened: "Müşteri demo talep etti ya da ilgi gösterdi.",
        whyItMatters: "Demo planlanmazsa fırsat ilerlemez.",
        hermesRecommendation: demoItem?.suggestedAction ?? "Demo zamanı planla.",
        founderDecisionLabel: "Demo zamanını planla.",
        primaryActionLabel: "Planla",
        secondaryActionLabel: null,
        confidence: null,
        urgency: "high",
      };
    }
    case "follow_up_required": {
      const followUp = (input.recentFollowUps ?? []).find((f) => f.missionId === item.missionId);
      const priority: HermesDecisionPriority = followUp?.priority === "high" ? "high" : "medium";
      return {
        ...base,
        decisionType: "decide_follow_up",
        priority,
        statusLabel: "Takip Gerekli",
        whatHappened: "Fırsat takip zamanına geldi.",
        whyItMatters: "Zamanında takip edilmezse fırsat soğuyabilir.",
        hermesRecommendation: followUp?.suggestedAction ?? "Takip mesajı öner.",
        founderDecisionLabel: "Takip yapılıp yapılmayacağına karar ver.",
        primaryActionLabel: "Karar Ver",
        secondaryActionLabel: null,
        confidence: null,
        urgency: priority === "high" ? "high" : "medium",
      };
    }
    case "outcome_required": {
      const outcome = (input.recentSalesOutcomes ?? []).find((o) => o.missionId === item.missionId);
      return {
        ...base,
        decisionType: "mark_outcome",
        priority: "medium",
        statusLabel: "Sonuç Bekliyor",
        whatHappened: "Demo veya takip süreci tamamlandı.",
        whyItMatters: "Sonuç işaretlenmezse pipeline güncel kalmaz.",
        hermesRecommendation: outcome?.suggestedAction ?? "Demo/follow-up sonrası satış sonucunu belirle.",
        founderDecisionLabel: "Satışı kazanıldı, kaybedildi ya da beklemede olarak işaretle.",
        primaryActionLabel: "Sonuçlandır",
        secondaryActionLabel: null,
        confidence: null,
        urgency: null,
      };
    }
    case "approval_required": {
      return {
        ...base,
        decisionType: "approve_message",
        priority: "high",
        statusLabel: "Onay Bekliyor",
        whatHappened: "Hermes bir mesaj taslağı hazırladı.",
        whyItMatters: "Onaylanmazsa mesaj gönderilmez, fırsat ilerlemez.",
        hermesRecommendation: "Hazırlanan mesaj gözden geçirilip onaylanmayı bekliyor.",
        founderDecisionLabel: "Mesajı onayla ya da reddet.",
        primaryActionLabel: "Onayla",
        secondaryActionLabel: "Reddet",
        confidence: null,
        urgency: null,
      };
    }
    case "reply_needs_review": {
      const intelligence = (input.recentIntelligence ?? []).find((i) => i.missionId === item.missionId);
      return {
        ...base,
        decisionType: "review_unknown",
        priority: "medium",
        statusLabel: "İnceleme Gerekli",
        whatHappened: "Bir cevap geldi ama Hermes net bir sinyal bulamadı.",
        whyItMatters: "Manuel incelenmezse fırsat gözden kaçabilir.",
        hermesRecommendation: intelligence?.founderActionHint ?? "Cevabı manuel incele.",
        founderDecisionLabel: "Cevabı incele ve nasıl ilerleyeceğine karar ver.",
        primaryActionLabel: "İncele",
        secondaryActionLabel: null,
        confidence: intelligence && isValidConfidence(intelligence.confidence) ? intelligence.confidence : null,
        urgency: intelligence && isValidUrgency(intelligence.urgency) ? intelligence.urgency : null,
      };
    }
    default:
      // Unreachable — every ActionStage not in PASSIVE_STAGES is handled above (unit-tested).
      return null;
  }
}

/**
 * Sorted critical → high → medium → low, then newest `lastActivityAt`
 * first within the same priority (a `null` lastActivityAt sorts last).
 */
/**
 * Sprint C2 — review_required qualification sonucunu tek dokunuşluk karar
 * öğesine çevirir. Mission yok (henüz satış işi açılmadı — konu tam olarak
 * bu karar); primary action UI'da qualification bölümüne odaklanır, hiçbir
 * mutation tetiklemez.
 */
function buildQualificationReviewItem(
  review: DecisionQueueQualificationReviewLike,
): HermesDecisionItem {
  return {
    id: `decision:qualification:${review.leadId ?? review.businessName}`,
    missionId: null,
    leadId: review.leadId,
    title: review.businessName?.trim() || "İsimsiz işletme",
    decisionType: "review_qualification",
    priority: "high",
    statusLabel: "Fırsatı İncele",
    whatHappened:
      "Hermes bu işletmede güçlü fırsat sinyalleri buldu ancak bir nokta doğrulama gerektiriyor.",
    whyItMatters:
      review.founderSummaryTr?.trim() ||
      "Doğrulama yapılmadan satış hazırlığı başlatılmayacak.",
    hermesRecommendation:
      review.hermesRecommendationTr?.trim() ||
      "Hermes önce senin incelemeni istiyor — karar sana ait.",
    founderDecisionLabel: "Bu fırsatın satışa uygun olup olmadığına karar ver.",
    primaryActionLabel: "İncele",
    secondaryActionLabel: null,
    lastActivityAt: review.evaluatedAt ?? null,
    sourceStage: "unknown",
    mapped: false,
    confidence: null,
    urgency: null,
  };
}

export function computeHermesDecisionQueue(input: ComputeHermesDecisionQueueInput): HermesDecisionItem[] {
  const items = input.actionQueue
    .map((item) => buildDecisionItem(item, input))
    .filter((item): item is HermesDecisionItem => item !== null);

  // Sprint C2 — qualification incelemeleri: zaten bir mission karar öğesi
  // taşıyan lead için ikinci kart üretilmez (tek varlık, tek karar).
  const leadIdsWithItems = new Set(items.map((i) => i.leadId).filter(Boolean));
  for (const review of input.qualificationReviews ?? []) {
    if (review.leadId && leadIdsWithItems.has(review.leadId)) continue;
    items.push(buildQualificationReviewItem(review));
  }

  return items.sort((a, b) => {
    const rankDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (rankDiff !== 0) return rankDiff;
    return (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0);
  });
}

export type HermesDecisionQueueSummary = {
  total: number;
  critical: number;
  high: number;
  medium: number;
  approveMessage: number;
  hotReply: number;
  demo: number;
  followUp: number;
  outcome: number;
  failedDelivery: number;
};

export function summarizeHermesDecisionQueue(items: HermesDecisionItem[]): HermesDecisionQueueSummary {
  return {
    total: items.length,
    critical: items.filter((i) => i.priority === "critical").length,
    high: items.filter((i) => i.priority === "high").length,
    medium: items.filter((i) => i.priority === "medium").length,
    approveMessage: items.filter((i) => i.decisionType === "approve_message").length,
    hotReply: items.filter((i) => i.decisionType === "review_hot_reply").length,
    demo: items.filter((i) => i.decisionType === "plan_demo").length,
    followUp: items.filter((i) => i.decisionType === "decide_follow_up").length,
    outcome: items.filter((i) => i.decisionType === "mark_outcome").length,
    failedDelivery: items.filter((i) => i.decisionType === "resolve_failed_delivery").length,
  };
}
