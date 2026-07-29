/**
 * Shape and validation for the durable Hermes runtime file.
 *
 * v3.8.0 — Hermes Durable Mission Runtime, Milestone 1.
 *
 * The Hermes line (`main` / `v7.0.0`) keeps mission state, approvals, replies,
 * demo items and delivery receipts in **module-level `Map`s** and, in the UI,
 * in `localStorage`. Its own source says so plainly: `hermes-mission-state-bridge.ts`
 * documents "In-memory only … Lost on server restart", and
 * `hermes-persisted-record-storage.ts` was written specifically because a
 * founder's approval click survived a re-render but not a refresh. That is the
 * one debt this milestone pays off.
 *
 * Nothing about the *vocabulary* is reinvented here. Every enum below is the
 * Hermes line's own, copied value-for-value:
 *   - `MissionStage`, `MISSION_STAGE_LABELS`, `MISSION_STAGE_PROGRESS`
 *     ← `app/components/v2/adapters/hermes-mission-adapter.ts`
 *   - `MissionDecisionState`                    ← same file
 *   - `FounderApprovalStatus` / `CourierDraftStatus` / `DeliveryGatewayStatus`
 *     ← `app/lib/hermes-mission-state-bridge.ts`
 *   - `WhatsAppInboundMessageType`, `StoredWhatsAppReply`
 *     ← `app/lib/whatsapp-reply-listener-runtime.ts` + `whatsapp-reply-registry.ts`
 *   - `DemoScheduleStatus` / `DemoPriority` / `DemoSourceIntent` / `DemoScheduleItem`
 *     ← `app/lib/demo-scheduling-runtime.ts`
 *   - `WhatsAppDeliveryStatus`                  ← `app/lib/whatsapp-delivery-receipt-runtime.ts`
 * What changes is the *storage owner*, not the model.
 *
 * Deliberately dependency-free and free of `fs` / `server-only`, exactly like
 * `operational-state/schema.ts`: the same normalizers run on the write path and
 * under `node --test` without a filesystem. Unknown keys are dropped rather
 * than preserved — the file is a record of real runtime state, not a bucket.
 *
 * This module stores state. It never sends anything.
 */

import { isValidLeadId } from "../operational-state/lead-id.ts";

export { isValidLeadId };

/**
 * v3.8.1 — Hermes Daily Loop Wiring.
 *
 * Bumped from 1 to 2 to add three new durable sections (`followUps`,
 * `salesOutcomes`, `dailyRuns`) that Milestone 1 explicitly deferred. A file
 * written under version 1 is still valid input — {@link parseHermesRuntimeFile}
 * accepts either version and always writes the current one back, so opening an
 * old file only ever adds empty sections, never rejects it.
 */
export const HERMES_SCHEMA_VERSION = 2;

/** Schema versions this reader accepts without quarantining. */
export const SUPPORTED_HERMES_SCHEMA_VERSIONS: readonly number[] = [1, 2];

/** Caps. Chosen to bound file growth, not to express product limits. */
export const MAX_MISSIONS = 5_000;
export const MAX_REPLIES = 2_000;
export const MAX_DEMOS = 2_000;
export const MAX_DELIVERIES = 2_000;
export const MAX_FOLLOW_UPS = 2_000;
export const MAX_SALES_OUTCOMES = 2_000;
export const MAX_DAILY_RUNS = 400;
export const MAX_ITEM_IDS_PER_RUN = 500;
export const MAX_TIMELINE_PER_MISSION = 100;
export const MAX_TASKS_PER_MISSION = 40;
export const MAX_TEXT_PREVIEW = 160;
export const MAX_ID_LENGTH = 140;
export const MAX_LABEL_LENGTH = 200;

/* -------------------------------------------------------------------------- */
/* ported vocabulary — mission                                                */
/* -------------------------------------------------------------------------- */

/** Ported verbatim from `hermes-mission-adapter.ts`. */
export type MissionStage =
  | "discover"
  | "verify"
  | "enrich"
  | "prepare"
  | "approval"
  | "execution-ready"
  | "completed";

export const MISSION_STAGE_LABELS: Record<MissionStage, string> = {
  discover: "Keşif",
  verify: "Doğrulama",
  enrich: "Zenginleştirme",
  prepare: "Hazırlık",
  approval: "Onay",
  "execution-ready": "Yürütmeye Hazır",
  completed: "Tamamlandı",
};

/** Fixed ladder position — not a computed score. Ported verbatim. */
export const MISSION_STAGE_PROGRESS: Record<MissionStage, number> = {
  discover: 10,
  verify: 25,
  enrich: 50,
  prepare: 65,
  approval: 75,
  "execution-ready": 90,
  completed: 100,
};

/**
 * The ladder, in order.
 *
 * Derived from `MISSION_STAGE_PROGRESS` rather than declared independently:
 * the Hermes line already encodes the ordering as a monotonically increasing
 * progress value, so reading the order back out of it is the one definition
 * that cannot drift from the labels the founder sees.
 */
export const MISSION_STAGE_ORDER: readonly MissionStage[] = (
  Object.keys(MISSION_STAGE_PROGRESS) as MissionStage[]
).sort((a, b) => MISSION_STAGE_PROGRESS[a] - MISSION_STAGE_PROGRESS[b]);

export function isMissionStage(value: unknown): value is MissionStage {
  return typeof value === "string" && value in MISSION_STAGE_PROGRESS;
}

/** Ported verbatim from `hermes-mission-adapter.ts`. */
export type MissionDecisionState = "not-required" | "pending" | "approved" | "rejected";

const MISSION_DECISION_STATES: readonly MissionDecisionState[] = [
  "not-required",
  "pending",
  "approved",
  "rejected",
];

export function isMissionDecisionState(value: unknown): value is MissionDecisionState {
  return (
    typeof value === "string" &&
    (MISSION_DECISION_STATES as readonly string[]).includes(value)
  );
}

/* -------------------------------------------------------------------------- */
/* ported vocabulary — approval snapshot                                      */
/* -------------------------------------------------------------------------- */

/** All three ported verbatim from `hermes-mission-state-bridge.ts`. */
export type FounderApprovalStatus = "approved" | "pending" | "rejected" | "missing";
export type CourierDraftStatus = "approved" | "draft" | "missing";
export type DeliveryGatewayStatus = "allowed" | "blocked" | "missing";
export type MissionStateSnapshotSource = "workspace_snapshot" | "mission_runtime";

export const FOUNDER_APPROVAL_STATUSES: readonly FounderApprovalStatus[] = [
  "approved",
  "pending",
  "rejected",
  "missing",
];
export const COURIER_DRAFT_STATUSES: readonly CourierDraftStatus[] = [
  "approved",
  "draft",
  "missing",
];
export const DELIVERY_GATEWAY_STATUSES: readonly DeliveryGatewayStatus[] = [
  "allowed",
  "blocked",
  "missing",
];

/**
 * Unrecognized input normalizes to the *conservative* member of each set, never
 * to the permissive one. This mirrors the Hermes bridge's own rule that
 * approval is granted only on an exact literal match, and makes it structurally
 * impossible for a malformed status to read as authority.
 */
function coerceFounderApprovalStatus(value: unknown): FounderApprovalStatus {
  return (FOUNDER_APPROVAL_STATUSES as readonly unknown[]).includes(value)
    ? (value as FounderApprovalStatus)
    : "missing";
}

function coerceCourierDraftStatus(value: unknown): CourierDraftStatus {
  return (COURIER_DRAFT_STATUSES as readonly unknown[]).includes(value)
    ? (value as CourierDraftStatus)
    : "missing";
}

function coerceDeliveryGatewayStatus(value: unknown): DeliveryGatewayStatus {
  return (DELIVERY_GATEWAY_STATUSES as readonly unknown[]).includes(value)
    ? (value as DeliveryGatewayStatus)
    : "blocked";
}

/* -------------------------------------------------------------------------- */
/* ported vocabulary — reply / demo / delivery                                */
/* -------------------------------------------------------------------------- */

/** Ported verbatim from `whatsapp-reply-listener-runtime.ts`. */
export type WhatsAppInboundMessageType = "text" | "button" | "interactive" | "unknown";

const INBOUND_MESSAGE_TYPES: readonly WhatsAppInboundMessageType[] = [
  "text",
  "button",
  "interactive",
  "unknown",
];

export const REPLY_MESSAGE_TYPE_LABELS_TR: Record<WhatsAppInboundMessageType, string> = {
  text: "Metin",
  button: "Buton",
  interactive: "Etkileşimli",
  unknown: "Bilinmiyor",
};

/** Ported verbatim from `reply-intelligence-runtime.ts`. */
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

export type ReplyUrgency = "high" | "medium" | "low";

const REPLY_INTENTS: readonly ReplyIntent[] = [
  "demo_requested",
  "pricing_question",
  "interested",
  "call_requested",
  "later",
  "not_interested",
  "wrong_number",
  "human_review_required",
  "unknown",
];

/** Ported verbatim from `demo-scheduling-runtime.ts`. */
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

export type DemoSourceIntent =
  | "demo_requested"
  | "call_requested"
  | "interested"
  | "pricing_question"
  | "unknown";

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

const DEMO_STATUSES = Object.keys(DEMO_STATUS_LABELS_TR) as DemoScheduleStatus[];

/** Ported verbatim from `whatsapp-delivery-receipt-runtime.ts`. */
export type WhatsAppDeliveryStatus = "sent" | "delivered" | "read" | "failed" | "unknown";

export const DELIVERY_STATUS_LABELS_TR: Record<WhatsAppDeliveryStatus, string> = {
  sent: "Gönderildi",
  delivered: "Teslim Edildi",
  read: "Okundu",
  failed: "Başarısız",
  unknown: "Bilinmiyor",
};

const DELIVERY_STATUSES = Object.keys(
  DELIVERY_STATUS_LABELS_TR,
) as WhatsAppDeliveryStatus[];

/* -------------------------------------------------------------------------- */
/* primitives                                                                 */
/* -------------------------------------------------------------------------- */

export function nowIso(): string {
  return new Date().toISOString();
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 40) return false;
  return Number.isFinite(Date.parse(value));
}

export function coerceIso(value: unknown, fallback: string): string {
  return isIsoDate(value) ? new Date(value).toISOString() : fallback;
}

export function coerceNullableIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return isIsoDate(value) ? new Date(value).toISOString() : null;
}

function coerceString(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function optionalString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Reduces a sender identifier to its last two characters.
 *
 * Ported verbatim from `whatsapp-reply-listener-runtime.ts` on `main`, where it
 * runs inside the webhook parser. That parser is not part of Milestone 1, so
 * without this the field would be named `fromMasked` and hold whatever the
 * caller passed — a phone number, in the one case that matters.
 *
 * Applied in {@link normalizeReplyRecord} rather than at a listener, so the
 * guarantee holds at the *storage* boundary: every path into the durable file
 * runs through the normalizer, including the webhook path that arrives later.
 * Masking an already-masked value is a no-op, so the future listener doing its
 * own masking first stays correct.
 */
export function maskWhatsAppSender(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const visible = trimmed.slice(-2);
  return `••• ••• ${visible}`;
}

function coerceEpoch(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback;
}

function coerceNullableEpoch(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

function coerceCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

/**
 * A record key that is safe to use as an object key and as an identifier.
 *
 * Same character class as `lead-id.ts` so mission / reply / demo ids obey one
 * rule rather than three. Not re-derived from a display name anywhere.
 */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_:.-]*$/;

export function isValidRecordId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    !value.includes("..") &&
    ID_PATTERN.test(value)
  );
}

/* -------------------------------------------------------------------------- */
/* mission record                                                             */
/* -------------------------------------------------------------------------- */

/**
 * One audit line. Matches `HermesMissionTimelineItem`'s `{ at, text }` core;
 * the Hermes UI's presentation fields (`actorCls`) are deliberately not stored
 * — a CSS class is not runtime state.
 */
export type HermesTimelineEntry = {
  at: number;
  actorLabel: string;
  text: string;
};

export type HermesMissionTask = {
  id: string;
  taskType: string;
};

/**
 * Why a mission stopped.
 *
 * Nullable rather than absent-when-fine so a cleared failure is representable:
 * a mission that recovered writes `null`, which is different from a mission
 * that was never asked.
 */
export type HermesMissionFailure = {
  code: string;
  messageTr: string;
  at: number;
} | null;

export type HermesMissionTransition = {
  from: MissionStage;
  to: MissionStage;
  at: number;
  reasonTr: string;
} | null;

/**
 * The durable mission record.
 *
 * Structurally a superset of the Hermes adapter's `MissionLike`, so
 * `actionStageOf` in `action-stage.ts` consumes it with no conversion — the
 * whole point of matching the field names exactly.
 */
export type HermesMissionRecord = {
  missionId: string;
  leadId: string;
  hotelName: string;
  stage: MissionStage;
  stageLabel: string;
  progress: number;
  status: string;
  decisionState: MissionDecisionState;
  approvalRequired: boolean;
  primaryTaskId: string;
  tasks: HermesMissionTask[];
  timeline: HermesTimelineEntry[];
  lastTransition: HermesMissionTransition;
  failure: HermesMissionFailure;
  createdAt: string;
  updatedAt: string;
  revision: number;
};

function normalizeTimeline(raw: unknown, fallbackAt: number): HermesTimelineEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: HermesTimelineEntry[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const o = entry as Record<string, unknown>;
    const text = coerceString(o.text, MAX_LABEL_LENGTH).trim();
    if (text.length === 0) continue;
    out.push({
      at: coerceEpoch(o.at, fallbackAt),
      actorLabel: coerceString(o.actorLabel, 60).trim() || "Hermes",
      text,
    });
  }
  out.sort((a, b) => a.at - b.at);
  return out.length > MAX_TIMELINE_PER_MISSION
    ? out.slice(out.length - MAX_TIMELINE_PER_MISSION)
    : out;
}

function normalizeTasks(raw: unknown): HermesMissionTask[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: HermesMissionTask[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const o = entry as Record<string, unknown>;
    if (!isValidRecordId(o.id) || seen.has(o.id)) continue;
    seen.add(o.id);
    out.push({ id: o.id, taskType: coerceString(o.taskType, 60).trim() || "unknown" });
    if (out.length >= MAX_TASKS_PER_MISSION) break;
  }
  return out;
}

function normalizeFailure(raw: unknown, fallbackAt: number): HermesMissionFailure {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const code = coerceString(o.code, 60).trim();
  if (code.length === 0) return null;
  return {
    code,
    messageTr: coerceString(o.messageTr, MAX_LABEL_LENGTH).trim(),
    at: coerceEpoch(o.at, fallbackAt),
  };
}

function normalizeTransition(raw: unknown, fallbackAt: number): HermesMissionTransition {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!isMissionStage(o.from) || !isMissionStage(o.to)) return null;
  return {
    from: o.from,
    to: o.to,
    at: coerceEpoch(o.at, fallbackAt),
    reasonTr: coerceString(o.reasonTr, MAX_LABEL_LENGTH).trim(),
  };
}

export function normalizeMissionRecord(
  missionId: string,
  raw: unknown,
  fallbackNow: string,
): HermesMissionRecord | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  // A mission is meaningless without a lead the workspace can name. Rejected
  // rather than repaired: an invented lead id would create a mission the
  // founder can never open.
  const leadId = o.leadId;
  if (!isValidLeadId(leadId)) return null;

  const fallbackAt = Date.parse(fallbackNow);
  const stage: MissionStage = isMissionStage(o.stage) ? o.stage : "discover";

  return {
    missionId,
    leadId,
    hotelName: coerceString(o.hotelName, MAX_LABEL_LENGTH),
    stage,
    stageLabel: MISSION_STAGE_LABELS[stage],
    progress: MISSION_STAGE_PROGRESS[stage],
    status: coerceString(o.status, MAX_LABEL_LENGTH),
    decisionState: isMissionDecisionState(o.decisionState) ? o.decisionState : "not-required",
    approvalRequired: Boolean(o.approvalRequired),
    primaryTaskId: isValidRecordId(o.primaryTaskId) ? o.primaryTaskId : "",
    tasks: normalizeTasks(o.tasks),
    timeline: normalizeTimeline(o.timeline, fallbackAt),
    lastTransition: normalizeTransition(o.lastTransition, fallbackAt),
    failure: normalizeFailure(o.failure, fallbackAt),
    createdAt: coerceIso(o.createdAt, fallbackNow),
    updatedAt: coerceIso(o.updatedAt, fallbackNow),
    revision: coerceCount(o.revision),
  };
}

/* -------------------------------------------------------------------------- */
/* approval record                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The durable equivalent of the Hermes line's `MissionStateSnapshot`.
 *
 * Two fields are added, both to satisfy this milestone's stale-approval rule:
 *
 *  - `messageHash` binds the approval to the exact copy that was approved.
 *    Regenerating the draft changes the hash, and the resolver then refuses to
 *    read the old snapshot as authority — which is the whole reason it exists.
 *    Never the message text itself; only an opaque digest of it.
 *  - `revision` so a stored approval participates in the same optimistic
 *    concurrency the rest of the store uses.
 *
 * Nothing here can hold a phone number, a message body or a credential: there
 * is no field of that shape, so it cannot happen by accident.
 */
export type HermesApprovalRecord = {
  missionId: string;
  leadId: string;
  founderApprovalStatus: FounderApprovalStatus;
  courierDraftStatus: CourierDraftStatus;
  deliveryGatewayStatus: DeliveryGatewayStatus;
  /** Opaque digest of the approved message, or null when no copy was bound. */
  messageHash: string | null;
  source: MissionStateSnapshotSource;
  updatedAt: number;
  expiresAt: number;
  revision: number;
};

export function normalizeApprovalRecord(
  missionId: string,
  raw: unknown,
  fallbackAt: number,
): HermesApprovalRecord | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!isValidLeadId(o.leadId)) return null;

  const updatedAt = coerceEpoch(o.updatedAt, fallbackAt);
  return {
    missionId,
    leadId: o.leadId,
    founderApprovalStatus: coerceFounderApprovalStatus(o.founderApprovalStatus),
    courierDraftStatus: coerceCourierDraftStatus(o.courierDraftStatus),
    deliveryGatewayStatus: coerceDeliveryGatewayStatus(o.deliveryGatewayStatus),
    messageHash: optionalString(o.messageHash, 128),
    source: o.source === "mission_runtime" ? "mission_runtime" : "workspace_snapshot",
    updatedAt,
    expiresAt: coerceEpoch(o.expiresAt, updatedAt),
    revision: coerceCount(o.revision),
  };
}

/* -------------------------------------------------------------------------- */
/* reply record                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Ported from `StoredWhatsAppReply`.
 *
 * The v6.2 privacy properties are preserved *structurally*: the sender is
 * carried already-masked, and `textPreview` is capped at 160 characters by the
 * normalizer below rather than being trusted from the caller. A raw phone
 * number has no field to live in.
 */
export type HermesReplyRecord = {
  replyId: string;
  provider: "whatsapp";
  providerMessageId: string;
  fromMasked: string | null;
  messageType: WhatsAppInboundMessageType;
  textPreview: string | null;
  occurredAt: number;
  conversationIdSafe: string | null;
  contactProfileNameSafe: string | null;
  mapped: boolean;
  missionId: string | null;
  leadId: string | null;
  intent: ReplyIntent;
  urgency: ReplyUrgency;
  source: "provider_message_registry" | "unmapped";
  createdAt: string;
  updatedAt: string;
  revision: number;
};

export function normalizeReplyRecord(
  replyId: string,
  raw: unknown,
  fallbackNow: string,
): HermesReplyRecord | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  const missionId = isValidRecordId(o.missionId) ? o.missionId : null;
  const leadId = isValidLeadId(o.leadId) ? o.leadId : null;
  const intent = (REPLY_INTENTS as readonly unknown[]).includes(o.intent)
    ? (o.intent as ReplyIntent)
    : "unknown";
  const urgency =
    o.urgency === "high" || o.urgency === "medium" || o.urgency === "low"
      ? o.urgency
      : "low";

  return {
    replyId,
    provider: "whatsapp",
    providerMessageId: optionalString(o.providerMessageId, MAX_ID_LENGTH) ?? "",
    // Masked here, not trusted from the caller: the field name is a promise,
    // and the storage boundary is the only place that can keep it.
    fromMasked: maskWhatsAppSender(optionalString(o.fromMasked, 40)),
    messageType: (INBOUND_MESSAGE_TYPES as readonly unknown[]).includes(o.messageType)
      ? (o.messageType as WhatsAppInboundMessageType)
      : "unknown",
    textPreview: optionalString(o.textPreview, MAX_TEXT_PREVIEW),
    occurredAt: coerceEpoch(o.occurredAt, Date.parse(fallbackNow)),
    conversationIdSafe: optionalString(o.conversationIdSafe, MAX_ID_LENGTH),
    contactProfileNameSafe: optionalString(o.contactProfileNameSafe, 80),
    // `mapped` is derived, never trusted: a reply is mapped exactly when it
    // actually carries a mission id, so the flag cannot disagree with the data.
    mapped: missionId !== null,
    missionId,
    leadId,
    intent,
    urgency,
    source: missionId !== null ? "provider_message_registry" : "unmapped",
    createdAt: coerceIso(o.createdAt, fallbackNow),
    updatedAt: coerceIso(o.updatedAt, fallbackNow),
    revision: coerceCount(o.revision),
  };
}

/** Ported verbatim from `reply-intelligence-runtime.ts` (v6.3). */
export function isHotReplyIntelligence(
  item: Pick<HermesReplyRecord, "urgency" | "intent">,
): boolean {
  return item.urgency === "high" || item.intent === "interested";
}

/* -------------------------------------------------------------------------- */
/* demo record                                                                */
/* -------------------------------------------------------------------------- */

/** Ported from `DemoScheduleItem`. */
export type HermesDemoRecord = {
  demoId: string;
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
  createdAt: string;
  updatedAt: string;
  revision: number;
};

const DEMO_SOURCE_INTENTS: readonly DemoSourceIntent[] = [
  "demo_requested",
  "call_requested",
  "interested",
  "pricing_question",
  "unknown",
];

export function normalizeDemoRecord(
  demoId: string,
  raw: unknown,
  fallbackNow: string,
): HermesDemoRecord | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  return {
    demoId,
    missionId: isValidRecordId(o.missionId) ? o.missionId : null,
    leadId: isValidLeadId(o.leadId) ? o.leadId : null,
    provider: "whatsapp",
    sourceProviderMessageId: optionalString(o.sourceProviderMessageId, MAX_ID_LENGTH),
    sourceIntent: (DEMO_SOURCE_INTENTS as readonly unknown[]).includes(o.sourceIntent)
      ? (o.sourceIntent as DemoSourceIntent)
      : "unknown",
    status: (DEMO_STATUSES as readonly unknown[]).includes(o.status)
      ? (o.status as DemoScheduleStatus)
      : "unknown",
    priority:
      o.priority === "high" || o.priority === "medium" || o.priority === "low"
        ? o.priority
        : "low",
    leadName: optionalString(o.leadName, MAX_LABEL_LENGTH),
    suggestedAction: coerceString(o.suggestedAction, MAX_LABEL_LENGTH),
    reason: coerceString(o.reason, MAX_LABEL_LENGTH),
    scheduledAt: coerceNullableEpoch(o.scheduledAt),
    completedAt: coerceNullableEpoch(o.completedAt),
    cancelledAt: coerceNullableEpoch(o.cancelledAt),
    createdAt: coerceIso(o.createdAt, fallbackNow),
    updatedAt: coerceIso(o.updatedAt, fallbackNow),
    revision: coerceCount(o.revision),
  };
}

/* -------------------------------------------------------------------------- */
/* delivery record                                                            */
/* -------------------------------------------------------------------------- */

/** Ported from `ProcessedWhatsAppDeliveryReceipt`. */
export type HermesDeliveryRecord = {
  providerMessageId: string;
  provider: "whatsapp";
  status: WhatsAppDeliveryStatus;
  rawStatus: string;
  occurredAt: number;
  missionId: string | null;
  leadId: string | null;
  mapped: boolean;
  createdAt: string;
  updatedAt: string;
  revision: number;
};

export function normalizeDeliveryRecord(
  providerMessageId: string,
  raw: unknown,
  fallbackNow: string,
): HermesDeliveryRecord | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const missionId = isValidRecordId(o.missionId) ? o.missionId : null;

  return {
    providerMessageId,
    provider: "whatsapp",
    status: (DELIVERY_STATUSES as readonly unknown[]).includes(o.status)
      ? (o.status as WhatsAppDeliveryStatus)
      : "unknown",
    rawStatus: coerceString(o.rawStatus, 60),
    occurredAt: coerceEpoch(o.occurredAt, Date.parse(fallbackNow)),
    missionId,
    leadId: isValidLeadId(o.leadId) ? o.leadId : null,
    mapped: missionId !== null,
    createdAt: coerceIso(o.createdAt, fallbackNow),
    updatedAt: coerceIso(o.updatedAt, fallbackNow),
    revision: coerceCount(o.revision),
  };
}

/* -------------------------------------------------------------------------- */
/* follow-up record (v3.8.1)                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Ported from the Hermes line's `FollowUpStatus`
 * (`app/lib/follow-up-runtime.ts` on `main`). `not_needed` is not persisted —
 * a follow-up record is simply not created when none is needed — but stays in
 * the union so a normalizer reading an old/foreign value has somewhere
 * conservative to fall back to.
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

const FOLLOW_UP_STATUSES: readonly FollowUpStatus[] = [
  "not_needed",
  "candidate",
  "approval_required",
  "approved",
  "dismissed",
  "completed",
  "expired",
  "unknown",
];

export const FOLLOW_UP_STATUS_LABELS_TR: Record<FollowUpStatus, string> = {
  not_needed: "Gerekli Değil",
  candidate: "Planlandı",
  approval_required: "Onay Bekliyor",
  approved: "Onaylandı",
  dismissed: "Vazgeçildi",
  completed: "Tamamlandı",
  expired: "Süresi Doldu",
  unknown: "Bilinmiyor",
};

/**
 * Ported from the Hermes line's `FollowUpReason`. `manual` is v3.8.1's own
 * addition — a founder-initiated `PLAN_FOLLOW_UP` with no upstream signal —
 * and is treated exactly like `later_requested` by
 * {@link followUpDelayMsFor}, which is the Hermes policy's own fallback rule
 * for a founder-picked follow-up.
 */
export type FollowUpReason =
  | "read_no_reply"
  | "delivered_no_reply"
  | "hot_reply_needs_action"
  | "demo_not_scheduled"
  | "demo_no_show"
  | "failed_delivery_recovery"
  | "later_requested"
  | "manual"
  | "unknown";

const FOLLOW_UP_REASONS: readonly FollowUpReason[] = [
  "read_no_reply",
  "delivered_no_reply",
  "hot_reply_needs_action",
  "demo_not_scheduled",
  "demo_no_show",
  "failed_delivery_recovery",
  "later_requested",
  "manual",
  "unknown",
];

export const FOLLOW_UP_REASON_LABELS_TR: Record<FollowUpReason, string> = {
  read_no_reply: "Okundu, cevap yok",
  delivered_no_reply: "Teslim edildi, cevap yok",
  hot_reply_needs_action: "Sıcak cevap aksiyon bekliyor",
  demo_not_scheduled: "Demo planlanmadı",
  demo_no_show: "Demoya gelinmedi",
  failed_delivery_recovery: "Teslimat hatası kurtarma",
  later_requested: "Daha sonra istendi",
  manual: "Founder planladı",
  unknown: "Bilinmiyor",
};

export function isFollowUpReason(value: unknown): value is FollowUpReason {
  return (FOLLOW_UP_REASONS as readonly unknown[]).includes(value);
}

export type FollowUpRecord = {
  followUpId: string;
  missionId: string;
  leadId: string;
  reason: FollowUpReason;
  status: FollowUpStatus;
  /** Epoch ms. The one canonical due instant — nothing else computes a second. */
  dueAt: number;
  note: string;
  createdAt: string;
  updatedAt: string;
  completedAt: number | null;
  cancelledAt: number | null;
  revision: number;
};

export function normalizeFollowUpRecord(
  followUpId: string,
  raw: unknown,
  fallbackNow: string,
): FollowUpRecord | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!isValidRecordId(o.missionId)) return null;
  if (!isValidLeadId(o.leadId)) return null;

  const fallbackAt = Date.parse(fallbackNow);
  return {
    followUpId,
    missionId: o.missionId,
    leadId: o.leadId,
    reason: (FOLLOW_UP_REASONS as readonly unknown[]).includes(o.reason)
      ? (o.reason as FollowUpReason)
      : "unknown",
    status: (FOLLOW_UP_STATUSES as readonly unknown[]).includes(o.status)
      ? (o.status as FollowUpStatus)
      : "candidate",
    dueAt: coerceEpoch(o.dueAt, fallbackAt),
    note: coerceString(o.note, MAX_LABEL_LENGTH),
    createdAt: coerceIso(o.createdAt, fallbackNow),
    updatedAt: coerceIso(o.updatedAt, fallbackNow),
    completedAt: coerceNullableEpoch(o.completedAt),
    cancelledAt: coerceNullableEpoch(o.cancelledAt),
    revision: coerceCount(o.revision),
  };
}

/* -------------------------------------------------------------------------- */
/* sales outcome record (v3.8.1)                                             */
/* -------------------------------------------------------------------------- */

/** Ported from the Hermes line's `SalesOutcomeStatus` (`sales-outcome-runtime.ts`). */
export type SalesOutcomeStatus = "open" | "won" | "lost" | "paused" | "no_decision" | "unknown";

const SALES_OUTCOME_STATUSES: readonly SalesOutcomeStatus[] = [
  "open",
  "won",
  "lost",
  "paused",
  "no_decision",
  "unknown",
];

export const SALES_OUTCOME_STATUS_LABELS_TR: Record<SalesOutcomeStatus, string> = {
  open: "Açık",
  won: "Kazanıldı",
  lost: "Kaybedildi",
  paused: "Duraklatıldı",
  no_decision: "Karar Yok",
  unknown: "Bilinmiyor",
};

/** Ported from the Hermes line's `SalesLostReason`. */
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

const SALES_LOST_REASONS: readonly SalesLostReason[] = [
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
];

/** Ported from the Hermes line's `SalesPackage`. */
export type SalesPackage = "starter" | "professional" | "growth" | "enterprise" | "custom" | "unknown";

const SALES_PACKAGES: readonly SalesPackage[] = [
  "starter",
  "professional",
  "growth",
  "enterprise",
  "custom",
  "unknown",
];

export function isSalesOutcomeStatus(value: unknown): value is SalesOutcomeStatus {
  return (SALES_OUTCOME_STATUSES as readonly unknown[]).includes(value);
}

export function isSalesLostReason(value: unknown): value is SalesLostReason {
  return (SALES_LOST_REASONS as readonly unknown[]).includes(value);
}

export function isSalesPackage(value: unknown): value is SalesPackage {
  return (SALES_PACKAGES as readonly unknown[]).includes(value);
}

export type SalesOutcomeRecord = {
  outcomeId: string;
  missionId: string;
  leadId: string;
  status: SalesOutcomeStatus;
  package: SalesPackage | null;
  estimatedMrr: number | null;
  lostReason: SalesLostReason | null;
  note: string;
  createdAt: string;
  updatedAt: string;
  closedAt: number | null;
  revision: number;
};

export function normalizeSalesOutcomeRecord(
  outcomeId: string,
  raw: unknown,
  fallbackNow: string,
): SalesOutcomeRecord | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!isValidRecordId(o.missionId)) return null;
  if (!isValidLeadId(o.leadId)) return null;

  const pkg = (SALES_PACKAGES as readonly unknown[]).includes(o.package)
    ? (o.package as SalesPackage)
    : null;
  const lostReason = (SALES_LOST_REASONS as readonly unknown[]).includes(o.lostReason)
    ? (o.lostReason as SalesLostReason)
    : null;
  const estimatedMrr =
    typeof o.estimatedMrr === "number" && Number.isFinite(o.estimatedMrr) && o.estimatedMrr >= 0
      ? o.estimatedMrr
      : null;

  return {
    outcomeId,
    missionId: o.missionId,
    leadId: o.leadId,
    status: (SALES_OUTCOME_STATUSES as readonly unknown[]).includes(o.status)
      ? (o.status as SalesOutcomeStatus)
      : "open",
    package: pkg,
    estimatedMrr,
    lostReason,
    note: coerceString(o.note, MAX_LABEL_LENGTH),
    createdAt: coerceIso(o.createdAt, fallbackNow),
    updatedAt: coerceIso(o.updatedAt, fallbackNow),
    closedAt: coerceNullableEpoch(o.closedAt),
    revision: coerceCount(o.revision),
  };
}

/* -------------------------------------------------------------------------- */
/* daily run record (v3.8.1)                                                 */
/* -------------------------------------------------------------------------- */

export type HermesDailyRunStatus = "idle" | "running" | "waiting_founder" | "completed";

const DAILY_RUN_STATUSES: readonly HermesDailyRunStatus[] = [
  "idle",
  "running",
  "waiting_founder",
  "completed",
];

export const DAILY_RUN_STATUS_LABELS_TR: Record<HermesDailyRunStatus, string> = {
  idle: "Başlamadı",
  running: "Taranıyor",
  waiting_founder: "Karar Bekliyor",
  completed: "Tamamlandı",
};

export type HermesDailyRunSummary = {
  scanned: number;
  actionable: number;
  waitingFounder: number;
  followUpDue: number;
  replyAttention: number;
  demoPending: number;
  completed: number;
};

export function emptyDailyRunSummary(): HermesDailyRunSummary {
  return {
    scanned: 0,
    actionable: 0,
    waitingFounder: 0,
    followUpDue: 0,
    replyAttention: 0,
    demoPending: 0,
    completed: 0,
  };
}

function normalizeDailyRunSummary(raw: unknown): HermesDailyRunSummary {
  const empty = emptyDailyRunSummary();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return empty;
  const o = raw as Record<string, unknown>;
  const out = { ...empty };
  for (const key of Object.keys(empty) as (keyof HermesDailyRunSummary)[]) {
    out[key] = coerceCount(o[key]);
  }
  return out;
}

/** `YYYY-MM-DD`, matching what the client is expected to pass explicitly. */
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidLocalDate(value: unknown): value is string {
  return typeof value === "string" && LOCAL_DATE_PATTERN.test(value);
}

export type HermesDailyRun = {
  /** Equal to `localDate` — one run per day is a structural guarantee, not a rule to enforce. */
  id: string;
  localDate: string;
  status: HermesDailyRunStatus;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  /** Bumped every time the queue is recomputed for this run. */
  queueRevision: number;
  currentItemId: string | null;
  itemIds: string[];
  /** Item ids the founder skipped/snoozed this run; excluded from auto-selection. */
  skippedItemIds: string[];
  summary: HermesDailyRunSummary;
  revision: number;
};

export function normalizeDailyRunRecord(
  id: string,
  raw: unknown,
  fallbackNow: string,
): HermesDailyRun | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!isValidLocalDate(o.localDate)) return null;

  const ids = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const entry of value) {
      if (!isValidRecordId(entry) || seen.has(entry)) continue;
      seen.add(entry);
      out.push(entry);
      if (out.length >= MAX_ITEM_IDS_PER_RUN) break;
    }
    return out;
  };

  return {
    id,
    localDate: o.localDate,
    status: (DAILY_RUN_STATUSES as readonly unknown[]).includes(o.status)
      ? (o.status as HermesDailyRunStatus)
      : "idle",
    startedAt: coerceIso(o.startedAt, fallbackNow),
    updatedAt: coerceIso(o.updatedAt, fallbackNow),
    completedAt: coerceNullableIso(o.completedAt),
    queueRevision: coerceCount(o.queueRevision),
    currentItemId: isValidRecordId(o.currentItemId) ? o.currentItemId : null,
    itemIds: ids(o.itemIds),
    skippedItemIds: ids(o.skippedItemIds),
    summary: normalizeDailyRunSummary(o.summary),
    revision: coerceCount(o.revision),
  };
}

/* -------------------------------------------------------------------------- */
/* file                                                                       */
/* -------------------------------------------------------------------------- */

export type HermesRuntimeFile = {
  schemaVersion: typeof HERMES_SCHEMA_VERSION;
  updatedAt: string;
  /** Monotonic, file-wide. Lets a caller detect "anything changed" cheaply. */
  revision: number;
  missions: Record<string, HermesMissionRecord>;
  approvals: Record<string, HermesApprovalRecord>;
  replies: Record<string, HermesReplyRecord>;
  demos: Record<string, HermesDemoRecord>;
  deliveries: Record<string, HermesDeliveryRecord>;
  followUps: Record<string, FollowUpRecord>;
  salesOutcomes: Record<string, SalesOutcomeRecord>;
  dailyRuns: Record<string, HermesDailyRun>;
};

export function emptyHermesRuntimeFile(now: string = nowIso()): HermesRuntimeFile {
  return {
    schemaVersion: HERMES_SCHEMA_VERSION,
    updatedAt: now,
    revision: 0,
    missions: {},
    approvals: {},
    replies: {},
    demos: {},
    deliveries: {},
    followUps: {},
    salesOutcomes: {},
    dailyRuns: {},
  };
}

function normalizeSection<T>(
  raw: unknown,
  cap: number,
  normalize: (key: string, value: unknown) => T | null,
): Record<string, T> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, T> = {};
  let count = 0;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isValidRecordId(key)) continue;
    const record = normalize(key, value);
    if (record === null) continue;
    out[key] = record;
    count += 1;
    if (count >= cap) break;
  }
  return out;
}

/**
 * Parses whatever was on disk into a valid file.
 *
 * Returns `null` for input that is structurally not our file, exactly like
 * `operational-state/schema.ts`: the caller quarantines rather than overwrites,
 * because silently resetting a founder's mission state would be the one failure
 * this store must not have.
 *
 * Accepts any version in {@link SUPPORTED_HERMES_SCHEMA_VERSIONS}. A v1 file
 * (pre-v3.8.1) has none of `followUps` / `salesOutcomes` / `dailyRuns` — those
 * sections are simply absent from the input and `normalizeSection` reads that
 * as empty, exactly like every other missing key it has always tolerated. The
 * returned file always stamps the *current* version, so the very next write
 * upgrades it in place; nothing here mutates the file it read.
 */
export function parseHermesRuntimeFile(
  raw: unknown,
  now: string = nowIso(),
): HermesRuntimeFile | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!(SUPPORTED_HERMES_SCHEMA_VERSIONS as readonly unknown[]).includes(o.schemaVersion)) {
    return null;
  }

  const fallbackAt = Date.parse(coerceIso(o.updatedAt, now));

  return {
    schemaVersion: HERMES_SCHEMA_VERSION,
    updatedAt: coerceIso(o.updatedAt, now),
    revision: coerceCount(o.revision),
    missions: normalizeSection(o.missions, MAX_MISSIONS, (key, value) =>
      normalizeMissionRecord(key, value, now),
    ),
    approvals: normalizeSection(o.approvals, MAX_MISSIONS, (key, value) =>
      normalizeApprovalRecord(key, value, fallbackAt),
    ),
    replies: normalizeSection(o.replies, MAX_REPLIES, (key, value) =>
      normalizeReplyRecord(key, value, now),
    ),
    demos: normalizeSection(o.demos, MAX_DEMOS, (key, value) =>
      normalizeDemoRecord(key, value, now),
    ),
    deliveries: normalizeSection(o.deliveries, MAX_DELIVERIES, (key, value) =>
      normalizeDeliveryRecord(key, value, now),
    ),
    // Absent on any v1 file — reads as empty, exactly like a v2 file that has
    // simply never had a follow-up/outcome/run recorded yet.
    followUps: normalizeSection(o.followUps, MAX_FOLLOW_UPS, (key, value) =>
      normalizeFollowUpRecord(key, value, now),
    ),
    salesOutcomes: normalizeSection(o.salesOutcomes, MAX_SALES_OUTCOMES, (key, value) =>
      normalizeSalesOutcomeRecord(key, value, now),
    ),
    dailyRuns: normalizeSection(o.dailyRuns, MAX_DAILY_RUNS, (key, value) =>
      normalizeDailyRunRecord(key, value, now),
    ),
  };
}
