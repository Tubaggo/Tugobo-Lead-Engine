import type { ReplyIntelligenceItem, ReplyIntent } from "./reply-intelligence-runtime.ts";

/**
 * Demo Scheduling Runtime (v6.4).
 *
 * Pure, deterministic — no `fetch`, no `process.env` read, no calendar API,
 * no import of `next/server`. This module never decides a demo is
 * *confirmed*; it only derives a candidate opportunity from an already-safe
 * `ReplyIntelligenceItem` (v6.3) and computes the founder-facing label/hint
 * text for whatever status the item is currently in. The only way a demo
 * item ever becomes `scheduled`/`completed`/`cancelled`/`no_show` is a
 * founder clicking a button — see `applyDemoStatusUpdate`, which the
 * registry calls only from the `POST /api/hermes/demo-scheduling/status`
 * route, never automatically.
 */

export type DemoScheduleStatus =
  | "not_requested"
  | "demo_requested"
  | "scheduling_needed"
  | "scheduled"
  | "completed"
  | "cancelled"
  | "no_show"
  | "unknown";

export type DemoPriority = "high" | "medium" | "low";

export type DemoSourceIntent = "demo_requested" | "call_requested" | "interested" | "pricing_question" | "unknown";

export type DemoScheduleItem = {
  id: string;
  missionId: string | null;
  leadId: string | null;
  provider: "whatsapp";
  sourceProviderMessageId: string | null;
  sourceIntent: DemoSourceIntent;
  status: DemoScheduleStatus;
  priority: DemoPriority;
  leadName: string | null;
  suggestedAction: string;
  reason: string;
  scheduledAt: number | null;
  completedAt: number | null;
  cancelledAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export const DEMO_STATUS_LABELS_TR: Record<DemoScheduleStatus, string> = {
  not_requested: "Talep Yok",
  demo_requested: "Demo Talep Edildi",
  scheduling_needed: "Planlama Gerekiyor",
  scheduled: "Planlandı",
  completed: "Tamamlandı",
  cancelled: "İptal Edildi",
  no_show: "Gelmedi",
  unknown: "Bilinmiyor",
};

/* ── Rule table: reply intent → demo status/priority/sourceIntent ─── */

const STATUS_BY_REPLY_INTENT: Record<ReplyIntent, DemoScheduleStatus> = {
  demo_requested: "demo_requested",
  call_requested: "scheduling_needed",
  interested: "scheduling_needed",
  pricing_question: "scheduling_needed",
  not_interested: "not_requested",
  wrong_number: "not_requested",
  later: "unknown",
  human_review_required: "unknown",
  unknown: "unknown",
};

const PRIORITY_BY_REPLY_INTENT: Record<ReplyIntent, DemoPriority> = {
  demo_requested: "high",
  call_requested: "high",
  interested: "medium",
  pricing_question: "medium",
  not_interested: "low",
  wrong_number: "low",
  later: "low",
  human_review_required: "low",
  unknown: "low",
};

const SOURCE_INTENT_BY_REPLY_INTENT: Record<ReplyIntent, DemoSourceIntent> = {
  demo_requested: "demo_requested",
  call_requested: "call_requested",
  interested: "interested",
  pricing_question: "pricing_question",
  not_interested: "unknown",
  wrong_number: "unknown",
  later: "unknown",
  human_review_required: "unknown",
  unknown: "unknown",
};

const REASON_BY_STATUS: Record<DemoScheduleStatus, string> = {
  not_requested: "Yanıt demo ile ilgili değil.",
  demo_requested: "Müşteri doğrudan demo talep etti.",
  scheduling_needed: "Müşteri ilgi gösterdi — demo zamanı planlanmalı.",
  scheduled: "Demo zamanı planlandı.",
  completed: "Demo tamamlandı.",
  cancelled: "Demo iptal edildi.",
  no_show: "Müşteri planlanan demoya gelmedi.",
  unknown: "Net bir demo sinyali yok.",
};

const ACTION_BY_STATUS: Record<DemoScheduleStatus, string> = {
  not_requested: "Aksiyon gerekmiyor.",
  demo_requested: "Demo zamanı planla",
  scheduling_needed: "Demo zamanı planla",
  scheduled: "Planlanan demo zamanını takip edin",
  completed: "Demo tamamlandı — takip mesajını değerlendirin",
  cancelled: "Demo iptal edildi — gerekirse yeniden planlayın",
  no_show: "Müşteri gelmedi — tekrar planlamayı değerlendirin",
  unknown: "Net bir demo sinyali yok",
};

export function deriveDemoPriority(input: Pick<ReplyIntelligenceItem, "intent">): DemoPriority {
  return PRIORITY_BY_REPLY_INTENT[input.intent];
}

/**
 * `suggestedAction` for a pending (`demo_requested`/`scheduling_needed`)
 * item mentions the missing mission mapping instead of the generic
 * "plan a demo" text — the founder needs to know they must find the lead
 * manually before they can act. Every other status keeps its plain hint;
 * an already-scheduled/completed/cancelled item isn't ambiguous just
 * because it's unmapped.
 */
export function deriveDemoSuggestedAction(item: Pick<DemoScheduleItem, "status" | "missionId">): string {
  const isPending = item.status === "demo_requested" || item.status === "scheduling_needed";
  if (isPending && !item.missionId) {
    return "Demo talebi var ancak mission eşleşmedi";
  }
  return ACTION_BY_STATUS[item.status];
}

/* ── Candidate derivation ───────────────────────────────────────── */

export type DemoScheduleCandidateInput = {
  provider: "whatsapp";
  providerMessageId: string;
  missionId: string | null;
  leadId: string | null;
  intent: ReplyIntent;
};

/**
 * Deterministic id (`demo:<providerMessageId>`) so re-deriving from the
 * same reply always targets the same registry slot — this is what makes
 * "duplicate providerMessageId never creates a duplicate item" possible
 * without the registry needing its own dedup index. `missingMissionId`
 * never crashes: `missionId`/`leadId` simply pass through as `null`.
 */
export function deriveDemoScheduleCandidateFromReplyIntelligence(
  input: DemoScheduleCandidateInput,
  now: number = Date.now(),
): DemoScheduleItem {
  const status = STATUS_BY_REPLY_INTENT[input.intent];
  const item: DemoScheduleItem = {
    id: `demo:${input.providerMessageId}`,
    missionId: input.missionId,
    leadId: input.leadId,
    provider: input.provider,
    sourceProviderMessageId: input.providerMessageId,
    sourceIntent: SOURCE_INTENT_BY_REPLY_INTENT[input.intent],
    status,
    priority: deriveDemoPriority(input),
    leadName: null,
    suggestedAction: "",
    reason: REASON_BY_STATUS[status],
    scheduledAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
  };
  item.suggestedAction = deriveDemoSuggestedAction(item);
  return item;
}

/* ── Founder-driven status transitions ─────────────────────────── */

export const DEMO_STATUS_UPDATE_TARGETS = ["scheduled", "completed", "cancelled", "no_show"] as const;
export type DemoStatusUpdateTarget = (typeof DEMO_STATUS_UPDATE_TARGETS)[number];

export function isValidDemoStatusUpdateTarget(value: unknown): value is DemoStatusUpdateTarget {
  return typeof value === "string" && (DEMO_STATUS_UPDATE_TARGETS as readonly string[]).includes(value);
}

export type DemoStatusUpdateMetadata = { scheduledAt?: number };

/**
 * Applies a founder-initiated status transition. Never called from
 * anywhere but the manual status API route — nothing in this codebase
 * infers `scheduled`/`completed`/`cancelled`/`no_show` on its own.
 */
export function applyDemoStatusUpdate(
  item: DemoScheduleItem,
  status: DemoStatusUpdateTarget,
  metadata: DemoStatusUpdateMetadata | undefined,
  now: number = Date.now(),
): DemoScheduleItem {
  const updated: DemoScheduleItem = {
    ...item,
    status,
    scheduledAt: status === "scheduled" ? (metadata?.scheduledAt ?? item.scheduledAt ?? now) : item.scheduledAt,
    completedAt: status === "completed" ? now : item.completedAt,
    cancelledAt: status === "cancelled" ? now : item.cancelledAt,
    reason: REASON_BY_STATUS[status],
    updatedAt: now,
    suggestedAction: "",
  };
  updated.suggestedAction = deriveDemoSuggestedAction(updated);
  return updated;
}

/* ── Audit ──────────────────────────────────────────────────────── */

export type DemoSchedulingAuditType =
  | "demo_scheduling_candidate_created"
  | "demo_scheduling_status_scheduled"
  | "demo_scheduling_status_completed"
  | "demo_scheduling_status_cancelled"
  | "demo_scheduling_status_no_show";

export type DemoSchedulingAuditEvent = {
  timestamp: number;
  actor: string;
  action: DemoSchedulingAuditType;
  details: string;
};

/** `item.id`/`missionId` are opaque internal identifiers, not PII — safe to include in full. Never includes reason/textPreview from the source reply. */
export function buildDemoSchedulingTimelineEvent(
  item: DemoScheduleItem,
  eventType: DemoSchedulingAuditType,
  now: number = Date.now(),
): DemoSchedulingAuditEvent {
  const actor = eventType === "demo_scheduling_candidate_created" ? "Hermes" : "Founder";
  const target = item.missionId ?? "eşleşmemiş";
  const detailsByType: Record<DemoSchedulingAuditType, string> = {
    demo_scheduling_candidate_created: `Demo adayı oluşturuldu — ${target}`,
    demo_scheduling_status_scheduled: `Demo planlandı — ${target}`,
    demo_scheduling_status_completed: `Demo tamamlandı — ${target}`,
    demo_scheduling_status_cancelled: `Demo iptal edildi — ${target}`,
    demo_scheduling_status_no_show: `Müşteri demoya gelmedi — ${target}`,
  };
  return {
    timestamp: now,
    actor,
    action: eventType,
    details: detailsByType[eventType],
  };
}

/* ── Summary ────────────────────────────────────────────────────── */

export type DemoScheduleSummary = {
  total: number;
  demoRequested: number;
  schedulingNeeded: number;
  scheduled: number;
  completed: number;
  cancelled: number;
  noShow: number;
};

export function summarizeDemoScheduleItems(items: DemoScheduleItem[]): DemoScheduleSummary {
  return {
    total: items.length,
    demoRequested: items.filter((i) => i.status === "demo_requested").length,
    schedulingNeeded: items.filter((i) => i.status === "scheduling_needed").length,
    scheduled: items.filter((i) => i.status === "scheduled").length,
    completed: items.filter((i) => i.status === "completed").length,
    cancelled: items.filter((i) => i.status === "cancelled").length,
    noShow: items.filter((i) => i.status === "no_show").length,
  };
}

/* ── Sorting ────────────────────────────────────────────────────── */

const STATUS_SORT_RANK: Record<DemoScheduleStatus, number> = {
  demo_requested: 0,
  scheduling_needed: 1,
  scheduled: 2,
  no_show: 3,
  completed: 4,
  cancelled: 5,
  not_requested: 6,
  unknown: 7,
};

const PRIORITY_SORT_RANK: Record<DemoPriority, number> = { high: 0, medium: 1, low: 2 };

/** Unscheduled/pending items first (by status, then priority), most-recently-updated first within a tie. Never mutates the input array. */
export function sortDemoScheduleItems(items: DemoScheduleItem[]): DemoScheduleItem[] {
  return [...items].sort((a, b) => {
    const statusDiff = STATUS_SORT_RANK[a.status] - STATUS_SORT_RANK[b.status];
    if (statusDiff !== 0) return statusDiff;
    const priorityDiff = PRIORITY_SORT_RANK[a.priority] - PRIORITY_SORT_RANK[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.updatedAt - a.updatedAt;
  });
}
