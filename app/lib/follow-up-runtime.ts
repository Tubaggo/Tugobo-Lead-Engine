/**
 * Autonomous Follow-up Runtime (v6.5).
 *
 * Pure, deterministic — no `fetch`, no `process.env` read, no WhatsApp API
 * call, no AI provider call, no import of `next/server`. This module only
 * *recommends*: it derives a follow-up candidate from signals three other
 * registries already produce (delivery receipts, reply intelligence, demo
 * scheduling) and computes founder-facing Turkish text for it. It never
 * sends anything — the only way a candidate moves to
 * `approval_required`/`approved`/`dismissed`/`completed` is a founder
 * clicking a button, via `applyFollowUpStatusUpdate`, which is only ever
 * called from `POST /api/hermes/follow-ups/status`.
 */

export type FollowUpStatus =
  | "not_needed"
  | "candidate"
  | "approval_required"
  | "approved"
  | "dismissed"
  | "completed"
  | "expired"
  | "unknown";

export type FollowUpReason =
  | "read_no_reply"
  | "delivered_no_reply"
  | "hot_reply_needs_action"
  | "demo_not_scheduled"
  | "demo_no_show"
  | "failed_delivery_recovery"
  | "later_requested"
  | "unknown";

export type FollowUpPriority = "high" | "medium" | "low";

export type FollowUpSource = "delivery_receipt" | "reply_intelligence" | "demo_scheduling" | "manual" | "unknown";

export type FollowUpCandidate = {
  id: string;
  missionId: string | null;
  leadId: string | null;
  provider: "whatsapp";
  reason: FollowUpReason;
  status: FollowUpStatus;
  priority: FollowUpPriority;
  source: FollowUpSource;
  suggestedAction: string;
  suggestedTiming: string;
  draftHint: string | null;
  sourceProviderMessageId: string | null;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
};

export const FOLLOW_UP_STATUS_LABELS_TR: Record<FollowUpStatus, string> = {
  not_needed: "Gerekmiyor",
  candidate: "Takip Adayı",
  approval_required: "Onay Bekliyor",
  approved: "Onaylandı",
  dismissed: "Vazgeçildi",
  completed: "Tamamlandı",
  expired: "Süresi Doldu",
  unknown: "Bilinmiyor",
};

export const FOLLOW_UP_REASON_LABELS_TR: Record<FollowUpReason, string> = {
  read_no_reply: "Okundu, Cevap Yok",
  delivered_no_reply: "Teslim Edildi, Cevap Yok",
  hot_reply_needs_action: "Sıcak Cevap — Aksiyon Gerekli",
  demo_not_scheduled: "Demo Planlanmadı",
  demo_no_show: "Demoya Gelinmedi",
  failed_delivery_recovery: "Teslimat Başarısız",
  later_requested: "Sonra Talep Edildi",
  unknown: "Bilinmiyor",
};

/* ── Rule table: reason → status/priority/timing/action/draft hint ─ */

const STATUS_BY_REASON: Record<FollowUpReason, FollowUpStatus> = {
  read_no_reply: "candidate",
  delivered_no_reply: "candidate",
  hot_reply_needs_action: "candidate",
  demo_not_scheduled: "candidate",
  demo_no_show: "candidate",
  failed_delivery_recovery: "candidate",
  later_requested: "candidate",
  unknown: "unknown",
};

const PRIORITY_BY_REASON: Record<FollowUpReason, FollowUpPriority> = {
  read_no_reply: "high",
  delivered_no_reply: "medium",
  hot_reply_needs_action: "high",
  demo_not_scheduled: "high",
  demo_no_show: "high",
  failed_delivery_recovery: "high",
  later_requested: "medium",
  unknown: "low",
};

const TIMING_BY_REASON: Record<FollowUpReason, string> = {
  read_no_reply: "24 saat içinde",
  delivered_no_reply: "48 saat içinde",
  hot_reply_needs_action: "En kısa sürede",
  demo_not_scheduled: "En kısa sürede",
  demo_no_show: "1-2 gün içinde",
  failed_delivery_recovery: "Hemen",
  later_requested: "Birkaç gün sonra",
  unknown: "Belirsiz",
};

const ACTION_BY_REASON: Record<FollowUpReason, string> = {
  read_no_reply: "Okundu ancak cevap yok, takip mesajı öner",
  delivered_no_reply: "Teslim edildi ancak cevap yok, takip mesajı öner",
  hot_reply_needs_action: "Sıcak cevap var ancak demo planlanmadı, aksiyon alın",
  demo_not_scheduled: "Demo talebi var, planlama yapılmadı",
  demo_no_show: "Müşteri demoya gelmedi, tekrar planlamayı öner",
  failed_delivery_recovery: "Teslimat başarısız, farklı kanal dene",
  later_requested: "Sonra görüşelim dedi, uygun zamanda tekrar temas kur",
  unknown: "Net bir takip sinyali yok",
};

/**
 * Guidance text for a founder drafting a message by hand — never a literal
 * message body, never personalized, never sent anywhere. This is the
 * sprint's "safe draft placeholder": a hint about *what kind* of message
 * would help, not a ready-to-send template.
 */
const DRAFT_HINT_BY_REASON: Record<FollowUpReason, string | null> = {
  read_no_reply: "Kısa bir hatırlatma mesajı önerilir.",
  delivered_no_reply: "Nazik bir takip mesajı önerilir.",
  hot_reply_needs_action: "Demo teklifi içeren bir mesaj önerilir.",
  demo_not_scheduled: "Demo için uygun saat teklif eden bir mesaj önerilir.",
  demo_no_show: "Yeniden planlama teklif eden bir mesaj önerilir.",
  failed_delivery_recovery: "Alternatif iletişim kanalı önerilir (telefon/e-posta).",
  later_requested: "Belirtilen zamana göre nazik bir hatırlatma önerilir.",
  unknown: null,
};

export function deriveFollowUpPriority(input: Pick<FollowUpCandidateInput, "reason">): FollowUpPriority {
  return PRIORITY_BY_REASON[input.reason];
}

export function deriveFollowUpSuggestedTiming(candidate: Pick<FollowUpCandidate, "reason">): string {
  return TIMING_BY_REASON[candidate.reason];
}

/**
 * A pending candidate (`candidate`/`approval_required`) without a
 * `missionId` gets the mapping-limitation hint instead of the normal
 * per-reason text — the founder can't act on it without first finding the
 * lead manually. A resolved/inactive item (`approved`/`dismissed`/
 * `completed`/`expired`/`not_needed`) keeps its plain text regardless.
 */
export function deriveFollowUpSuggestedAction(candidate: Pick<FollowUpCandidate, "reason" | "missionId" | "status">): string {
  const isActive = candidate.status === "candidate" || candidate.status === "approval_required";
  if (isActive && !candidate.missionId) {
    return "Takip adayı var ancak mission eşleşmedi";
  }
  return ACTION_BY_REASON[candidate.reason];
}

/* ── Candidate derivation ───────────────────────────────────────── */

/**
 * `sourceId` uniquely identifies the triggering event within its `source`
 * — a `providerMessageId` for `delivery_receipt`/`reply_intelligence`, a
 * demo schedule item id for `demo_scheduling`. It is what makes the
 * deterministic id (`followup:<reason>:<sourceId>`) collision-free across
 * sources: the same reply can never collide with the same demo item.
 * `providerMessageId` is kept separately (nullable) purely for the DTO's
 * own `sourceProviderMessageId` field — a demo-scheduling-sourced
 * candidate has no provider message of its own.
 */
export type FollowUpCandidateInput = {
  source: FollowUpSource;
  reason: FollowUpReason;
  provider: "whatsapp";
  sourceId: string;
  providerMessageId: string | null;
  missionId: string | null;
  leadId: string | null;
};

/** `missingMissionId` never crashes: `missionId`/`leadId` simply pass through as `null`. */
export function deriveFollowUpCandidate(input: FollowUpCandidateInput, now: number = Date.now()): FollowUpCandidate {
  const status = STATUS_BY_REASON[input.reason];
  const candidate: FollowUpCandidate = {
    id: `followup:${input.reason}:${input.sourceId}`,
    missionId: input.missionId,
    leadId: input.leadId,
    provider: input.provider,
    reason: input.reason,
    status,
    priority: deriveFollowUpPriority(input),
    source: input.source,
    suggestedAction: "",
    suggestedTiming: deriveFollowUpSuggestedTiming({ reason: input.reason }),
    draftHint: DRAFT_HINT_BY_REASON[input.reason],
    sourceProviderMessageId: input.providerMessageId,
    createdAt: now,
    updatedAt: now,
    expiresAt: null,
  };
  candidate.suggestedAction = deriveFollowUpSuggestedAction(candidate);
  return candidate;
}

/* ── Founder-driven status transitions ─────────────────────────── */

export const FOLLOW_UP_STATUS_UPDATE_TARGETS = ["approval_required", "approved", "dismissed", "completed"] as const;
export type FollowUpStatusUpdateTarget = (typeof FOLLOW_UP_STATUS_UPDATE_TARGETS)[number];

export function isValidFollowUpStatusUpdateTarget(value: unknown): value is FollowUpStatusUpdateTarget {
  return typeof value === "string" && (FOLLOW_UP_STATUS_UPDATE_TARGETS as readonly string[]).includes(value);
}

/**
 * Applies a founder-initiated status transition. Never called from
 * anywhere but the manual status API route — nothing in this codebase
 * moves a candidate to `approval_required`/`approved`/`dismissed`/
 * `completed` on its own.
 */
export function applyFollowUpStatusUpdate(
  candidate: FollowUpCandidate,
  status: FollowUpStatusUpdateTarget,
  now: number = Date.now(),
): FollowUpCandidate {
  const updated: FollowUpCandidate = { ...candidate, status, updatedAt: now, suggestedAction: "" };
  updated.suggestedAction = deriveFollowUpSuggestedAction(updated);
  return updated;
}

/* ── Audit ──────────────────────────────────────────────────────── */

export type FollowUpAuditType =
  | "follow_up_candidate_created"
  | "follow_up_status_approval_required"
  | "follow_up_status_approved"
  | "follow_up_status_dismissed"
  | "follow_up_status_completed"
  | "follow_up_candidate_expired";

export type FollowUpAuditEvent = {
  timestamp: number;
  actor: string;
  action: FollowUpAuditType;
  details: string;
};

const HERMES_AUDIT_TYPES: ReadonlySet<FollowUpAuditType> = new Set(["follow_up_candidate_created", "follow_up_candidate_expired"]);

/** `missionId` is an opaque internal identifier, not PII — safe to include in full. Never includes reason/textPreview from the source reply. */
export function buildFollowUpAuditEvent(candidate: FollowUpCandidate, eventType: FollowUpAuditType, now: number = Date.now()): FollowUpAuditEvent {
  const actor = HERMES_AUDIT_TYPES.has(eventType) ? "Hermes" : "Founder";
  const target = candidate.missionId ?? "eşleşmemiş";
  const detailsByType: Record<FollowUpAuditType, string> = {
    follow_up_candidate_created: `Takip adayı oluşturuldu — ${target}`,
    follow_up_status_approval_required: `Takip onay bekliyor — ${target}`,
    follow_up_status_approved: `Takip onaylandı — ${target}`,
    follow_up_status_dismissed: `Takip vazgeçildi — ${target}`,
    follow_up_status_completed: `Takip tamamlandı — ${target}`,
    follow_up_candidate_expired: `Takip adayının süresi doldu — ${target}`,
  };
  return { timestamp: now, actor, action: eventType, details: detailsByType[eventType] };
}

/* ── Summary ────────────────────────────────────────────────────── */

export type FollowUpSummary = {
  total: number;
  candidate: number;
  approvalRequired: number;
  approved: number;
  dismissed: number;
  completed: number;
  expired: number;
  highPriority: number;
};

export function summarizeFollowUpCandidates(items: FollowUpCandidate[]): FollowUpSummary {
  return {
    total: items.length,
    candidate: items.filter((i) => i.status === "candidate").length,
    approvalRequired: items.filter((i) => i.status === "approval_required").length,
    approved: items.filter((i) => i.status === "approved").length,
    dismissed: items.filter((i) => i.status === "dismissed").length,
    completed: items.filter((i) => i.status === "completed").length,
    expired: items.filter((i) => i.status === "expired").length,
    highPriority: items.filter((i) => i.priority === "high").length,
  };
}

/* ── Sorting ────────────────────────────────────────────────────── */

const STATUS_SORT_RANK: Record<FollowUpStatus, number> = {
  candidate: 0,
  approval_required: 1,
  approved: 2,
  completed: 3,
  dismissed: 4,
  expired: 5,
  not_needed: 6,
  unknown: 7,
};

const PRIORITY_SORT_RANK: Record<FollowUpPriority, number> = { high: 0, medium: 1, low: 2 };

/** Active/pending items first (by status, then priority), most-recently-updated first within a tie. Never mutates the input array. */
export function sortFollowUpCandidates(items: FollowUpCandidate[]): FollowUpCandidate[] {
  return [...items].sort((a, b) => {
    const statusDiff = STATUS_SORT_RANK[a.status] - STATUS_SORT_RANK[b.status];
    if (statusDiff !== 0) return statusDiff;
    const priorityDiff = PRIORITY_SORT_RANK[a.priority] - PRIORITY_SORT_RANK[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.updatedAt - a.updatedAt;
  });
}
