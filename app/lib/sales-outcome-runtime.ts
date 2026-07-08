/**
 * Sales Outcome Runtime (v6.6).
 *
 * Pure, deterministic — no `fetch`, no `process.env` read, no external API
 * call, no import of `next/server`. This module completes the revenue
 * loop by letting the founder record a mission's final commercial outcome.
 * It never decides won/lost itself: the only way an item becomes `won`/
 * `lost`/`paused`/`no_decision` is a founder submitting
 * `applySalesOutcomeStatusUpdate` via `POST /api/hermes/sales-outcomes/status`.
 * Everything this module auto-creates (from demo/follow-up completion
 * signals) starts as `open` — "a decision is needed", never a decision
 * itself.
 */

export type SalesOutcomeStatus = "open" | "won" | "lost" | "paused" | "no_decision" | "unknown";

export type SalesLostReason =
  | "budget"
  | "timing"
  | "competitor"
  | "no_response"
  | "wrong_fit"
  | "not_decision_maker"
  | "already_has_solution"
  | "price_objection"
  | "hotel_closed"
  | "other"
  | "unknown";

export type SalesPackage = "starter" | "professional" | "growth" | "enterprise" | "custom" | "unknown";

export type SalesOutcomeSource = "founder_manual" | "demo_scheduling" | "follow_up" | "unknown";
export type SalesOutcomePriority = "high" | "medium" | "low";

export type SalesOutcomeItem = {
  id: string;
  missionId: string | null;
  leadId: string | null;
  leadName: string | null;
  status: SalesOutcomeStatus;
  package: SalesPackage;
  estimatedMrr: number | null;
  estimatedArr: number | null;
  lostReason: SalesLostReason | null;
  outcomeNotePreview: string | null;
  source: SalesOutcomeSource;
  priority: SalesOutcomePriority;
  suggestedAction: string;
  reason: string;
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
};

export const SALES_OUTCOME_STATUS_LABELS_TR: Record<SalesOutcomeStatus, string> = {
  open: "Sonuç Bekliyor",
  won: "Kazanıldı",
  lost: "Kaybedildi",
  paused: "Beklemede",
  no_decision: "Kararsız",
  unknown: "Bilinmiyor",
};

export const SALES_PACKAGE_LABELS_TR: Record<SalesPackage, string> = {
  starter: "Starter",
  professional: "Professional",
  growth: "Growth",
  enterprise: "Enterprise",
  custom: "Özel",
  unknown: "Belirtilmedi",
};

export const SALES_LOST_REASON_LABELS_TR: Record<SalesLostReason, string> = {
  budget: "Bütçe",
  timing: "Zamanlama",
  competitor: "Rakip",
  no_response: "Yanıt Yok",
  wrong_fit: "Uygun Değil",
  not_decision_maker: "Karar Verici Değil",
  already_has_solution: "Zaten Çözümü Var",
  price_objection: "Fiyat İtirazı",
  hotel_closed: "Otel Kapandı",
  other: "Diğer",
  unknown: "Belirtilmedi",
};

const NOTE_PREVIEW_MAX_LENGTH = 180;

/** Never returns more than 180 chars — this is a preview, the full raw note is never stored. */
export function sanitizeOutcomeNotePreview(text: string | null | undefined): string | null {
  const trimmed = text?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, NOTE_PREVIEW_MAX_LENGTH);
}

export function calculateEstimatedArr(mrr: number | null): number | null {
  if (mrr === null) return null;
  return mrr * 12;
}

function sanitizeMrrInput(value: number | null | undefined, fallback: number | null): number | null {
  if (value === undefined) return fallback;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  return fallback;
}

/* ── Rule table: status → reason/action/priority ───────────────── */

const REASON_BY_STATUS: Record<SalesOutcomeStatus, string> = {
  open: "Demo veya takip tamamlandı, satış sonucu belirlenmedi.",
  won: "Satış kazanıldı.",
  lost: "Satış kaybedildi.",
  paused: "Fırsat şimdilik beklemede.",
  no_decision: "Founder henüz karar veremedi.",
  unknown: "Net bir sonuç bilgisi yok.",
};

const ACTION_BY_STATUS: Record<SalesOutcomeStatus, string> = {
  open: "Demo/follow-up sonrası satış sonucunu belirle",
  won: "Satış kazanıldı, onboarding sürecine geç",
  lost: "Kayıp nedeni kaydedildi",
  paused: "Fırsat beklemede — uygun zamanda tekrar değerlendirin",
  no_decision: "Karar bekleniyor — mission'ı takip edin",
  unknown: "Net bir sonuç yok",
};

const PRIORITY_BY_STATUS: Record<SalesOutcomeStatus, SalesOutcomePriority> = {
  open: "high",
  won: "low",
  lost: "low",
  paused: "medium",
  no_decision: "medium",
  unknown: "low",
};

export function deriveSalesOutcomePriority(item: Pick<SalesOutcomeItem, "status">): SalesOutcomePriority {
  return PRIORITY_BY_STATUS[item.status];
}

/** An unmapped `open` item gets the mapping-limitation hint — every other status/mapping combination keeps its plain per-status text. */
export function deriveSalesOutcomeSuggestedAction(item: Pick<SalesOutcomeItem, "status" | "missionId">): string {
  if (item.status === "open" && !item.missionId) {
    return "Satış sonucu adayı var ancak mission eşleşmedi";
  }
  return ACTION_BY_STATUS[item.status];
}

/* ── Candidate derivation ───────────────────────────────────────── */

/**
 * Dedup identity, in priority order: `missionId` → `leadId` →
 * `sourceProviderMessageId`. Demo/follow-up integrations always pass at
 * least their own item's id as `sourceProviderMessageId` when neither
 * `missionId` nor `leadId` is available, so the "all three missing" branch
 * below is a theoretical safety net, not an expected path — it still never
 * crashes, it just falls back to a `now`-based id (deterministic per call,
 * not globally stable, which is acceptable since it only ever fires when
 * literally no identifying information exists).
 */
export type SalesOutcomeInput = {
  missionId: string | null;
  leadId: string | null;
  leadName?: string | null;
  source: SalesOutcomeSource;
  sourceProviderMessageId?: string | null;
  status?: SalesOutcomeStatus;
  package?: SalesPackage;
  estimatedMrr?: number | null;
  lostReason?: SalesLostReason;
  outcomeNote?: string | null;
  /** Overrides the default per-status suggested-action text — used by e.g. the demo no-show trigger, which needs more specific wording than the generic "open" hint. */
  suggestedActionOverride?: string;
};

function deriveSalesOutcomeId(input: Pick<SalesOutcomeInput, "missionId" | "leadId" | "sourceProviderMessageId">, now: number): string {
  if (input.missionId) return `outcome:${input.missionId}`;
  if (input.leadId) return `outcome:${input.leadId}`;
  if (input.sourceProviderMessageId) return `outcome:${input.sourceProviderMessageId}`;
  return `outcome:unknown:${now}`;
}

/** `missingMissionId` never crashes: `missionId`/`leadId` simply pass through as `null`. */
export function buildSalesOutcomeItem(input: SalesOutcomeInput, now: number = Date.now()): SalesOutcomeItem {
  const status = input.status ?? "open";
  const pkg = input.package ?? "unknown";
  const estimatedMrr = sanitizeMrrInput(input.estimatedMrr, null);
  const lostReason = status === "lost" ? (input.lostReason ?? "unknown") : (input.lostReason ?? null);

  const item: SalesOutcomeItem = {
    id: deriveSalesOutcomeId(input, now),
    missionId: input.missionId,
    leadId: input.leadId,
    leadName: input.leadName ?? null,
    status,
    package: pkg,
    estimatedMrr,
    estimatedArr: calculateEstimatedArr(estimatedMrr),
    lostReason,
    outcomeNotePreview: sanitizeOutcomeNotePreview(input.outcomeNote),
    source: input.source,
    priority: "medium",
    suggestedAction: "",
    reason: REASON_BY_STATUS[status],
    createdAt: now,
    updatedAt: now,
    closedAt: status === "won" || status === "lost" ? now : null,
  };
  item.priority = deriveSalesOutcomePriority(item);
  item.suggestedAction = input.suggestedActionOverride ?? deriveSalesOutcomeSuggestedAction(item);
  return item;
}

/* ── Founder-driven status transitions ─────────────────────────── */

export const SALES_OUTCOME_STATUS_UPDATE_TARGETS = ["won", "lost", "paused", "no_decision", "open"] as const;
export type SalesOutcomeStatusUpdateTarget = (typeof SALES_OUTCOME_STATUS_UPDATE_TARGETS)[number];

export function isValidSalesOutcomeStatusUpdateTarget(value: unknown): value is SalesOutcomeStatusUpdateTarget {
  return typeof value === "string" && (SALES_OUTCOME_STATUS_UPDATE_TARGETS as readonly string[]).includes(value);
}

export const SALES_PACKAGES = ["starter", "professional", "growth", "enterprise", "custom", "unknown"] as const;
export function isValidSalesPackage(value: unknown): value is SalesPackage {
  return typeof value === "string" && (SALES_PACKAGES as readonly string[]).includes(value);
}

export const SALES_LOST_REASONS = [
  "budget",
  "timing",
  "competitor",
  "no_response",
  "wrong_fit",
  "not_decision_maker",
  "already_has_solution",
  "price_objection",
  "hotel_closed",
  "other",
  "unknown",
] as const;
export function isValidSalesLostReason(value: unknown): value is SalesLostReason {
  return typeof value === "string" && (SALES_LOST_REASONS as readonly string[]).includes(value);
}

export type SalesOutcomeStatusUpdateInput = {
  status: SalesOutcomeStatusUpdateTarget;
  package?: SalesPackage;
  estimatedMrr?: number | null;
  lostReason?: SalesLostReason;
  outcomeNote?: string | null;
  closedAt?: number;
};

/**
 * `won` requires a real package (not `unknown`) OR a positive revenue
 * estimate; `lost` requires a real reason (not `unknown`) OR a note. Every
 * other target (`open`/`paused`/`no_decision`) has no extra requirement.
 * This is checked *before* `applySalesOutcomeStatusUpdate` is ever called —
 * an invalid won/lost update is rejected outright, never partially applied.
 */
export function isValidSalesOutcomeStatusUpdate(input: SalesOutcomeStatusUpdateInput): boolean {
  if (input.status === "won") {
    const hasPackage = input.package !== undefined && input.package !== "unknown";
    const hasRevenue = typeof input.estimatedMrr === "number" && Number.isFinite(input.estimatedMrr) && input.estimatedMrr > 0;
    return hasPackage || hasRevenue;
  }
  if (input.status === "lost") {
    const hasReason = input.lostReason !== undefined && input.lostReason !== "unknown";
    const hasNote = sanitizeOutcomeNotePreview(input.outcomeNote) !== null;
    return hasReason || hasNote;
  }
  return true;
}

/**
 * Applies a founder-initiated status transition. Never called from
 * anywhere but the manual status API route — nothing in this codebase
 * decides `won`/`lost` on its own. Caller must have already validated via
 * `isValidSalesOutcomeStatusUpdate`.
 */
export function applySalesOutcomeStatusUpdate(
  item: SalesOutcomeItem,
  update: SalesOutcomeStatusUpdateInput,
  now: number = Date.now(),
): SalesOutcomeItem {
  const estimatedMrr = sanitizeMrrInput(update.estimatedMrr, item.estimatedMrr);
  const lostReason =
    update.status === "lost" ? (update.lostReason ?? item.lostReason ?? "unknown") : (update.lostReason ?? item.lostReason);
  const outcomeNotePreview = update.outcomeNote !== undefined ? sanitizeOutcomeNotePreview(update.outcomeNote) : item.outcomeNotePreview;
  const isClosing = update.status === "won" || update.status === "lost";

  const updated: SalesOutcomeItem = {
    ...item,
    status: update.status,
    package: update.package ?? item.package,
    estimatedMrr,
    estimatedArr: calculateEstimatedArr(estimatedMrr),
    lostReason,
    outcomeNotePreview,
    updatedAt: now,
    closedAt: isClosing ? (update.closedAt ?? now) : item.closedAt,
    reason: REASON_BY_STATUS[update.status],
    suggestedAction: "",
  };
  updated.priority = deriveSalesOutcomePriority(updated);
  updated.suggestedAction = deriveSalesOutcomeSuggestedAction(updated);
  return updated;
}

/* ── Audit ──────────────────────────────────────────────────────── */

export type SalesOutcomeAuditType =
  | "sales_outcome_created"
  | "sales_outcome_won"
  | "sales_outcome_lost"
  | "sales_outcome_paused"
  | "sales_outcome_no_decision"
  | "sales_outcome_open";

export type SalesOutcomeAuditEvent = {
  timestamp: number;
  actor: string;
  action: SalesOutcomeAuditType;
  details: string;
};

/** `missionId`/`leadId` are opaque internal identifiers, not PII — safe to include in full. Never includes the note preview or any reply text. */
export function buildSalesOutcomeTimelineEvent(item: SalesOutcomeItem, eventType: SalesOutcomeAuditType, now: number = Date.now()): SalesOutcomeAuditEvent {
  const actor = eventType === "sales_outcome_created" ? "Hermes" : "Founder";
  const target = item.missionId ?? item.leadId ?? "eşleşmemiş";
  const detailsByType: Record<SalesOutcomeAuditType, string> = {
    sales_outcome_created: `Satış sonucu adayı oluşturuldu — ${target}`,
    sales_outcome_won: `Satış kazanıldı — ${target}`,
    sales_outcome_lost: `Satış kaybedildi — ${target}`,
    sales_outcome_paused: `Fırsat beklemeye alındı — ${target}`,
    sales_outcome_no_decision: `Karar verilemedi — ${target}`,
    sales_outcome_open: `Sonuç durumu açık olarak işaretlendi — ${target}`,
  };
  return { timestamp: now, actor, action: eventType, details: detailsByType[eventType] };
}

/* ── Summary ────────────────────────────────────────────────────── */

export type SalesOutcomeSummary = {
  total: number;
  open: number;
  won: number;
  lost: number;
  paused: number;
  noDecision: number;
  estimatedMrrTotal: number;
  estimatedArrTotal: number;
  closeRate: number | null;
};

/**
 * `estimatedMrrTotal`/`estimatedArrTotal` sum only `won` items — this is
 * meant to read as realized recurring revenue, not pipeline value.
 * `closeRate` is `won / (won + lost)`; `null` (not `0`) when nothing has
 * closed yet, so the UI can distinguish "no data" from "0% close rate".
 */
export function summarizeSalesOutcomes(items: SalesOutcomeItem[]): SalesOutcomeSummary {
  const open = items.filter((i) => i.status === "open").length;
  const won = items.filter((i) => i.status === "won").length;
  const lost = items.filter((i) => i.status === "lost").length;
  const paused = items.filter((i) => i.status === "paused").length;
  const noDecision = items.filter((i) => i.status === "no_decision").length;
  const estimatedMrrTotal = items.filter((i) => i.status === "won").reduce((sum, i) => sum + (i.estimatedMrr ?? 0), 0);
  const estimatedArrTotal = calculateEstimatedArr(estimatedMrrTotal) ?? 0;
  const closedTotal = won + lost;

  return {
    total: items.length,
    open,
    won,
    lost,
    paused,
    noDecision,
    estimatedMrrTotal,
    estimatedArrTotal,
    closeRate: closedTotal > 0 ? won / closedTotal : null,
  };
}

/* ── Sorting ────────────────────────────────────────────────────── */

const STATUS_SORT_RANK: Record<SalesOutcomeStatus, number> = {
  open: 0,
  no_decision: 1,
  paused: 2,
  won: 3,
  lost: 4,
  unknown: 5,
};

const PRIORITY_SORT_RANK: Record<SalesOutcomePriority, number> = { high: 0, medium: 1, low: 2 };

/** Undecided items first (by status, then priority), most-recently-updated first within a tie. Never mutates the input array. */
export function sortSalesOutcomeItems(items: SalesOutcomeItem[]): SalesOutcomeItem[] {
  return [...items].sort((a, b) => {
    const statusDiff = STATUS_SORT_RANK[a.status] - STATUS_SORT_RANK[b.status];
    if (statusDiff !== 0) return statusDiff;
    const priorityDiff = PRIORITY_SORT_RANK[a.priority] - PRIORITY_SORT_RANK[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.updatedAt - a.updatedAt;
  });
}
