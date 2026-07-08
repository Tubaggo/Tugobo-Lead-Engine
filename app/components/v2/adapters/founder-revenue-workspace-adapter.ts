import { DELIVERY_STATUS_LABELS_TR, type WhatsAppDeliveryStatus } from "../../../lib/whatsapp-delivery-receipt-runtime.ts";
import type { ProcessedWhatsAppDeliveryReceipt } from "../../../lib/whatsapp-delivery-receipt-processor.ts";
import type { WhatsAppReadinessStatus } from "../../../lib/whatsapp-provider-runtime.ts";
import type { StoredWhatsAppReply } from "../../../lib/whatsapp-reply-registry.ts";
import { isHotReplyIntelligence, type ReplyIntelligenceItem } from "../../../lib/reply-intelligence-runtime.ts";
import { DEMO_STATUS_LABELS_TR, type DemoScheduleItem } from "../../../lib/demo-scheduling-runtime.ts";
import { FOLLOW_UP_REASON_LABELS_TR, FOLLOW_UP_STATUS_LABELS_TR, type FollowUpCandidate } from "../../../lib/follow-up-runtime.ts";

/**
 * Founder Revenue Workspace adapter (v6.1, hot-reply intelligence added in
 * v6.3, demo scheduling added in v6.4, follow-up candidates added in v6.5).
 *
 * Pure presentation-layer aggregation over Hermes runtime state that
 * already exists — `HermesMission[]` (mission runtime), the mission's own
 * `decisionState`/`timeline` (founder approval + audit), and processed
 * WhatsApp delivery receipts (v6.0.1). It computes nothing Hermes doesn't
 * already know; it only translates existing fields into founder-facing
 * operational language (Turkish) and one priority ordering.
 *
 * Deliberately does NOT import `hermes-mission-adapter.ts` (or anything
 * that transitively imports a `@/`-aliased module) — this file needs to
 * run under plain `node --test`, which has no knowledge of tsconfig path
 * aliases. Instead of importing `HermesMission`, it declares `MissionLike`
 * — a structural subset of the same shape. Any real `HermesMission[]`
 * satisfies it automatically (TypeScript structural typing); nothing is
 * re-implemented, only read. The three types this module *does* import
 * (`whatsapp-delivery-receipt-runtime.ts`, `whatsapp-delivery-receipt-processor.ts`,
 * `whatsapp-provider-runtime.ts`) are themselves import-free/relative-only,
 * so the whole chain stays test-runnable.
 *
 * "Delivery state" here means the *WhatsApp delivery receipt* — never the
 * internal Delivery Gateway's own status vocabulary (queued/ready/sending/
 * etc.), which stays a Developer Mode concept per this sprint's design
 * principle.
 */

export type MissionLikeTask = { id: string; taskType: string };
export type MissionLikeTimelineItem = { at: number; text: string };

export type MissionLike = {
  missionId: string;
  hotelName: string;
  stage: string;
  stageLabel: string;
  status: string;
  decisionState: string;
  primaryTaskId: string;
  tasks: MissionLikeTask[];
  timeline: MissionLikeTimelineItem[];
};

/* ── Action stage (the founder's priority ladder) ──────────────────── */

export type ActionStage =
  | "failed"
  | "hot_reply"
  | "demo_pending"
  | "follow_up_required"
  | "reply_needs_review"
  | "reply_received"
  | "approval_required"
  | "read"
  | "delivered"
  | "sent"
  | "ready"
  | "unknown";

export const ACTION_STAGE_LABELS: Record<ActionStage, string> = {
  failed: "Başarısız",
  hot_reply: "Sıcak Cevap",
  demo_pending: "Demo Bekliyor",
  follow_up_required: "Takip Gerekli",
  reply_needs_review: "İnceleme Gerekiyor",
  reply_received: "Cevap Geldi",
  approval_required: "Onay Bekliyor",
  read: "Okundu",
  delivered: "Teslim Edildi",
  sent: "Gönderildi",
  ready: "Yürütmeye Hazır",
  unknown: "Bilinmiyor",
};

export const SUGGESTED_ACTION_LABELS: Record<ActionStage, string> = {
  failed: "Teslim edilemedi — tekrar deneyin",
  hot_reply: "Sıcak cevap — hemen aksiyon alın",
  demo_pending: "Demo zamanı planla",
  follow_up_required: "Takip mesajı öner",
  reply_needs_review: "Cevap net değil — manuel inceleyin",
  reply_received: "Cevap geldi, incele",
  approval_required: "Founder onayı bekleniyor",
  read: "Mesaj okundu — demo planlanabilir",
  delivered: "Teslim edildi — yanıt bekleniyor",
  sent: "Gönderildi — teslimat bekleniyor",
  ready: "Yürütmeye hazır",
  unknown: "İzleniyor",
};

/**
 * Lower rank = higher priority in the Action Queue: FAILED → HOT_REPLY →
 * DEMO_PENDING → FOLLOW_UP_REQUIRED → REPLY_NEEDS_REVIEW → REPLY_RECEIVED →
 * APPROVAL_REQUIRED → READ → DELIVERED → SENT → READY → UNKNOWN.
 * `reply_needs_review` ranks just below `follow_up_required` (not
 * explicitly ordered by the v6.3 spec) because an unclassifiable reply
 * might *be* a hot one — the founder just can't know that without opening
 * it, so it deserves attention almost as urgently.
 */
const ACTION_STAGE_RANK: Record<ActionStage, number> = {
  failed: 0,
  hot_reply: 1,
  demo_pending: 2,
  follow_up_required: 3,
  reply_needs_review: 4,
  reply_received: 5,
  approval_required: 6,
  read: 7,
  delivered: 8,
  sent: 9,
  ready: 10,
  unknown: 11,
};

/** `recentReceipts` is assumed newest-first (the processor's own feed convention) — `.find` returns the latest match. */
function latestReceiptForMission(
  missionId: string,
  recentReceipts: ProcessedWhatsAppDeliveryReceipt[],
): ProcessedWhatsAppDeliveryReceipt | undefined {
  return recentReceipts.find((r) => r.missionId === missionId);
}

/**
 * Only replies the registry already resolved to this mission
 * (`mapped: true`, via `mapReplyToMissionContext`) count here — an
 * unmapped reply has no `missionId` to match against, so it can never
 * attach itself to a specific mission's Action Queue entry. It still
 * shows up in the workspace-wide "Cevap Geldi" summary counter instead.
 */
function latestReplyForMission(missionId: string, recentReplies: StoredWhatsAppReply[]): StoredWhatsAppReply | undefined {
  return recentReplies.find((r) => r.missionId === missionId);
}

/** Same "mapped-only" caveat as `latestReplyForMission` — an intelligence item only carries a `missionId` when the reply it classifies was itself mapped. */
function latestIntelligenceForMission(missionId: string, recentIntelligence: ReplyIntelligenceItem[]): ReplyIntelligenceItem | undefined {
  return recentIntelligence.find((i) => i.missionId === missionId);
}

/** "Pending" = the founder hasn't scheduled/resolved it yet — matches `RevenueSummary.demoPendingCount`'s own definition. */
function hasPendingDemoForMission(missionId: string, recentDemoItems: DemoScheduleItem[]): boolean {
  return recentDemoItems.some((d) => d.missionId === missionId && (d.status === "demo_requested" || d.status === "scheduling_needed"));
}

/** "Active" = still needs a founder decision — matches `RevenueSummary`'s own "Takip Gerekli" definition (`candidate` + `approval_required`). */
function hasActiveFollowUpForMission(missionId: string, recentFollowUps: FollowUpCandidate[]): boolean {
  return recentFollowUps.some((f) => f.missionId === missionId && (f.status === "candidate" || f.status === "approval_required"));
}

/**
 * `demo_pending`/`follow_up_required` are checked independently of whether
 * a "latest mapped reply" is still in `recentReplies` (a capped, aging
 * feed) — a demo item or follow-up candidate lives in its own 14-day
 * registry and can outlive the specific reply that created it (e.g. the
 * customer sends a later, less-hot follow-up message). An unresolved
 * opportunity should keep surfacing regardless.
 */
export function actionStageOf(
  mission: MissionLike,
  recentReceipts: ProcessedWhatsAppDeliveryReceipt[],
  recentReplies: StoredWhatsAppReply[] = [],
  recentIntelligence: ReplyIntelligenceItem[] = [],
  recentDemoItems: DemoScheduleItem[] = [],
  recentFollowUps: FollowUpCandidate[] = [],
): ActionStage {
  const receipt = latestReceiptForMission(mission.missionId, recentReceipts);
  if (receipt?.status === "failed") return "failed";

  const reply = latestReplyForMission(mission.missionId, recentReplies);
  const intelligence = reply ? latestIntelligenceForMission(mission.missionId, recentIntelligence) : undefined;

  if (intelligence && isHotReplyIntelligence(intelligence)) return "hot_reply";
  if (hasPendingDemoForMission(mission.missionId, recentDemoItems)) return "demo_pending";
  if (hasActiveFollowUpForMission(mission.missionId, recentFollowUps)) return "follow_up_required";
  if (reply) {
    if (intelligence?.intent === "human_review_required") return "reply_needs_review";
    return "reply_received";
  }

  if (mission.stage === "approval") return "approval_required";
  if (receipt?.status === "read") return "read";
  if (receipt?.status === "delivered") return "delivered";
  if (receipt?.status === "sent") return "sent";
  if (mission.stage === "execution-ready") return "ready";
  return "unknown";
}

/* ── Section 1 — Revenue Summary ────────────────────────────────── */

export type RevenueSummary = {
  totalActiveMissions: number;
  founderApprovalPending: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  demoPendingCount: number;
  needsAttentionCount: number;
  replyReceivedCount: number;
  hotReplyCount: number;
  followUpRequiredCount: number;
};

export function computeRevenueSummary(
  missions: MissionLike[],
  recentReceipts: ProcessedWhatsAppDeliveryReceipt[],
  recentReplies: StoredWhatsAppReply[] = [],
  recentIntelligence: ReplyIntelligenceItem[] = [],
  recentDemoItems: DemoScheduleItem[] = [],
  recentFollowUps: FollowUpCandidate[] = [],
): RevenueSummary {
  const totalActiveMissions = missions.filter((m) => m.stage !== "completed").length;
  const founderApprovalPending = missions.filter((m) => m.stage === "approval").length;

  const sentCount = recentReceipts.filter((r) => r.status === "sent").length;
  const deliveredCount = recentReceipts.filter((r) => r.status === "delivered").length;
  const readCount = recentReceipts.filter((r) => r.status === "read").length;
  const failedCount = recentReceipts.filter((r) => r.status === "failed").length;

  const demoPendingCount = recentDemoItems.filter((d) => d.status === "demo_requested" || d.status === "scheduling_needed").length;

  const needsAttentionCount = missions.filter((m) => {
    const stage = actionStageOf(m, recentReceipts, recentReplies, recentIntelligence, recentDemoItems, recentFollowUps);
    return stage === "failed" || stage === "approval_required";
  }).length;

  const followUpRequiredCount = recentFollowUps.filter((f) => f.status === "candidate" || f.status === "approval_required").length;

  return {
    totalActiveMissions,
    founderApprovalPending,
    sentCount,
    deliveredCount,
    readCount,
    failedCount,
    demoPendingCount,
    needsAttentionCount,
    replyReceivedCount: recentReplies.length,
    hotReplyCount: recentIntelligence.filter(isHotReplyIntelligence).length,
    followUpRequiredCount,
  };
}

/* ── Section 2 — Action Queue ───────────────────────────────────── */

export type ActionQueueItem = {
  missionId: string;
  hotelName: string;
  stage: ActionStage;
  stageLabel: string;
  currentStageLabel: string;
  lastActivity: string;
  lastActivityAt: number;
  suggestedAction: string;
};

/**
 * Sorted by business priority: FAILED → APPROVAL_REQUIRED → READ →
 * DELIVERED → SENT → READY → UNKNOWN, then most-recently-active first
 * within the same stage. Completed missions never appear — there is
 * nothing left for the founder to act on.
 */
export function computeActionQueue(
  missions: MissionLike[],
  recentReceipts: ProcessedWhatsAppDeliveryReceipt[],
  recentReplies: StoredWhatsAppReply[] = [],
  recentIntelligence: ReplyIntelligenceItem[] = [],
  recentDemoItems: DemoScheduleItem[] = [],
  recentFollowUps: FollowUpCandidate[] = [],
): ActionQueueItem[] {
  return missions
    .filter((m) => m.stage !== "completed")
    .map((m) => {
      const stage = actionStageOf(m, recentReceipts, recentReplies, recentIntelligence, recentDemoItems, recentFollowUps);
      const lastTimelineEntry = m.timeline[m.timeline.length - 1];
      return {
        missionId: m.missionId,
        hotelName: m.hotelName,
        stage,
        stageLabel: ACTION_STAGE_LABELS[stage],
        currentStageLabel: m.stageLabel,
        lastActivity: lastTimelineEntry?.text ?? "Henüz aktivite yok",
        lastActivityAt: lastTimelineEntry?.at ?? 0,
        suggestedAction: SUGGESTED_ACTION_LABELS[stage],
      };
    })
    .sort((a, b) => {
      const rankDiff = ACTION_STAGE_RANK[a.stage] - ACTION_STAGE_RANK[b.stage];
      if (rankDiff !== 0) return rankDiff;
      return b.lastActivityAt - a.lastActivityAt;
    });
}

/* ── Section 3 — Mission Focus ──────────────────────────────────── */

export type MissionFocusSummary = {
  missionId: string;
  hotelName: string;
  currentMissionLabel: string;
  currentStageLabel: string;
  whatsappStatusLabel: string;
  deliveryStateLabel: string;
  latestReceiptLabel: string | null;
  suggestedNextAction: string;
  demoStatusLabel: string | null;
  demoSuggestedAction: string | null;
  demoScheduledAtLabel: string | null;
  followUpStatusLabel: string | null;
  followUpReasonLabel: string | null;
  followUpSuggestedAction: string | null;
  followUpSuggestedTiming: string | null;
};

export function computeMissionFocus(
  mission: MissionLike,
  recentReceipts: ProcessedWhatsAppDeliveryReceipt[],
  recentReplies: StoredWhatsAppReply[] = [],
  recentIntelligence: ReplyIntelligenceItem[] = [],
  recentDemoItems: DemoScheduleItem[] = [],
  recentFollowUps: FollowUpCandidate[] = [],
): MissionFocusSummary {
  const stage = actionStageOf(mission, recentReceipts, recentReplies, recentIntelligence, recentDemoItems, recentFollowUps);
  const receipt = latestReceiptForMission(mission.missionId, recentReceipts);
  const demoItem = recentDemoItems.find((d) => d.missionId === mission.missionId) ?? null;
  const followUp = recentFollowUps.find((f) => f.missionId === mission.missionId) ?? null;

  return {
    missionId: mission.missionId,
    hotelName: mission.hotelName,
    currentMissionLabel: mission.status,
    currentStageLabel: mission.stageLabel,
    whatsappStatusLabel: receipt ? "WhatsApp üzerinden iletişimde" : "Henüz WhatsApp gönderimi yok",
    deliveryStateLabel: receipt ? DELIVERY_STATUS_LABELS_TR[receipt.status] : "Henüz gönderim yok",
    latestReceiptLabel: receipt
      ? `${DELIVERY_STATUS_LABELS_TR[receipt.status]} — ${new Date(receipt.occurredAt).toLocaleString("tr-TR")}`
      : null,
    suggestedNextAction: SUGGESTED_ACTION_LABELS[stage],
    demoStatusLabel: demoItem ? DEMO_STATUS_LABELS_TR[demoItem.status] : null,
    demoSuggestedAction: demoItem ? demoItem.suggestedAction : null,
    demoScheduledAtLabel: demoItem?.scheduledAt ? new Date(demoItem.scheduledAt).toLocaleString("tr-TR") : null,
    followUpStatusLabel: followUp ? FOLLOW_UP_STATUS_LABELS_TR[followUp.status] : null,
    followUpReasonLabel: followUp ? FOLLOW_UP_REASON_LABELS_TR[followUp.reason] : null,
    followUpSuggestedAction: followUp ? followUp.suggestedAction : null,
    followUpSuggestedTiming: followUp ? followUp.suggestedTiming : null,
  };
}

/* ── Section 4 — Hermes Timeline (founder-meaningful events only) ─ */

export type FounderTimelineEvent = {
  id: string;
  at: number;
  label: string;
};

const RECEIPT_EVENT_LABEL: Record<WhatsAppDeliveryStatus, string | null> = {
  sent: "Mesaj gönderildi",
  delivered: "Teslim edildi",
  read: "Okundu",
  failed: "Teslim başarısız",
  unknown: null,
};

/**
 * Merges (a) each mission's own founder-decision moment and its earliest
 * timeline entry (treated as "mission created" — a founder never needs to
 * know what internal event actually produced it), and (b) recent delivery
 * receipts, into one global, newest-first feed. Internal debug/agent-hop
 * events are never included — only these six meaningful categories.
 */
export function computeHermesTimeline(
  missions: MissionLike[],
  recentReceipts: ProcessedWhatsAppDeliveryReceipt[],
  limit: number = 20,
): FounderTimelineEvent[] {
  const events: FounderTimelineEvent[] = [];

  for (const m of missions) {
    const first = m.timeline[0];
    const last = m.timeline[m.timeline.length - 1];
    if (first) {
      events.push({ id: `${m.missionId}:created`, at: first.at, label: `Mission oluşturuldu — ${m.hotelName}` });
    }
    if (m.decisionState === "approved") {
      const approvedEntry = m.timeline.find((t) => t.text.startsWith("Onayladı"));
      events.push({
        id: `${m.missionId}:approved`,
        at: approvedEntry?.at ?? last?.at ?? 0,
        label: `Founder onayı verildi — ${m.hotelName}`,
      });
    }
    if (m.decisionState === "rejected") {
      const rejectedEntry = m.timeline.find((t) => t.text.startsWith("Reddetti"));
      events.push({
        id: `${m.missionId}:rejected`,
        at: rejectedEntry?.at ?? last?.at ?? 0,
        label: `Founder reddetti — ${m.hotelName}`,
      });
    }
  }

  for (const r of recentReceipts) {
    const base = RECEIPT_EVENT_LABEL[r.status];
    if (!base) continue;
    events.push({
      id: `receipt:${r.providerMessageId}:${r.status}`,
      at: r.occurredAt,
      label: r.missionId ? `${base} — ${r.missionId}` : base,
    });
  }

  return events.sort((a, b) => b.at - a.at).slice(0, limit);
}

/* ── Section 5 — Hermes Health ──────────────────────────────────── */

export type HermesHealthSummary = {
  hermesRuntimeLabel: string;
  whatsappLabel: string;
  deliveryLabel: string;
  missionBridgeLabel: string;
};

const WHATSAPP_HEALTH_LABEL: Record<WhatsAppReadinessStatus, string> = {
  controlled_live_ready: "Bağlı",
  dry_run_ready: "Test Modu",
  blocked: "Politika ile Kısıtlı",
  partial: "Kısmi Yapılandırma",
  not_configured: "Yapılandırılmadı",
};

export type ComputeHermesHealthInput = {
  hermesRuntimeAvailable: boolean;
  whatsappReadinessStatus: WhatsAppReadinessStatus | null;
  deliveryFeedReachable: boolean | null;
};

/**
 * "Mission Bridge: Healthy" is structural, not a live probe — no server
 * endpoint exposes bridge health today, and adding one would mean adding
 * new runtime instrumentation, which this sprint explicitly avoids. If this
 * card renders at all, the bridge module it depends on loaded successfully.
 */
export function computeHermesHealth(input: ComputeHermesHealthInput): HermesHealthSummary {
  return {
    hermesRuntimeLabel: input.hermesRuntimeAvailable ? "Sağlıklı" : "Bilinmiyor",
    whatsappLabel: input.whatsappReadinessStatus ? WHATSAPP_HEALTH_LABEL[input.whatsappReadinessStatus] : "Bilinmiyor",
    deliveryLabel: input.deliveryFeedReachable === null ? "Bilinmiyor" : input.deliveryFeedReachable ? "Çalışıyor" : "Erişilemiyor",
    missionBridgeLabel: "Sağlıklı",
  };
}
