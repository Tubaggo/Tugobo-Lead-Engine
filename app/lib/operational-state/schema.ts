/**
 * Shape and validation for the server-side operational state file.
 *
 * Deliberately dependency-free and free of `fs` / `server-only` so the same
 * normalizers run on the write path (API routes) and are available to tests
 * without a filesystem. Anything that touches disk lives in `file-store.ts`.
 *
 * Every value that comes off disk or off the wire goes through `normalize*`
 * before it is trusted. Unknown keys are dropped rather than preserved: the
 * file is the source of truth for real pipeline data, and silently carrying
 * arbitrary caller-supplied fields would make it a storage bucket.
 */

import type { LeadStatusUpdate, ScoredLead } from "../leads.ts";
import {
  mergeMessageWorkspace,
  normalizeMessageWorkspace,
  parseMessageWorkspace,
  type LeadMessageWorkspaceState,
} from "../outreach/workspace.ts";
import { isValidLeadId, MAX_LEAD_ID_LENGTH } from "./lead-id.ts";

export { isValidLeadId, MAX_LEAD_ID_LENGTH };

export const SCHEMA_VERSION = 1;

/** Caps. Chosen to bound file growth, not to express product limits. */
export const MAX_NOTE_LENGTH = 5_000;
export const MAX_ACTIVITY_PER_LEAD = 200;
export const MAX_ACTIVITY_TITLE_LENGTH = 200;
export const MAX_ACTIVITY_DETAIL_LENGTH = 1_000;
export const MAX_LEADS = 20_000;
export const MAX_AI_SUMMARY_LENGTH = 4_000;

/**
 * A lead id is used only as an object key, never as a path segment, but it is
 * still constrained so neither a hostile value nor a stringified `undefined`
 * can become a record. The rules live in `lead-id.ts` and are re-exported
 * above, so this module, the routes and the browser client all agree.
 */

/**
 * One timeline event.
 *
 * `messageVariant` and `followUpAt` are carried explicitly rather than being
 * packed into `detail`, so the outreach log round-trips without lossy string
 * encoding and a backup file stays readable by a human.
 */
export type ActivityEntry = {
  id: string;
  type: string;
  title: string;
  detail?: string;
  createdAt: string;
  messageVariant?: string;
  followUpAt?: string;
};

export type AiSnapshot = {
  summary?: string;
  generatedAt?: string;
  model?: string;
};

export type LeadOperationalState = {
  leadId: string;
  queued?: boolean;
  salesStage?: string | null;
  nextFollowUpAt?: string | null;
  founderNotes?: string;
  /** The `LeadStatusUpdate` workflow record, minus the fields promoted above. */
  workflow?: Partial<LeadStatusUpdate>;
  manualOverrides?: Record<string, unknown>;
  aiSnapshot?: AiSnapshot;
  /** Outreach drafts per tone. See `outreach/workspace.ts` for the shape. */
  messageWorkspace?: LeadMessageWorkspaceState;
  activity: ActivityEntry[];
  createdAt: string;
  updatedAt: string;
  revision: number;
};

/**
 * The daily outreach queue. One record for the whole workspace rather than
 * per-lead, because it is inherently a single ordered list scoped to a
 * calendar day.
 */
export type DailyQueueState = {
  queueDate: string;
  todayQueue: string[];
  todayLog: string[];
  queueItems: Record<string, unknown>;
  completedToday: number;
  skippedToday: number;
  dncToday: number;
  updatedAt: string;
};

export type OperationalStateFile = {
  schemaVersion: typeof SCHEMA_VERSION;
  updatedAt: string;
  leads: Record<string, LeadOperationalState>;
  /** Imported lead roster. Server-side so a second device is not empty. */
  roster: ScoredLead[];
  rosterUpdatedAt: string | null;
  dailyQueue: DailyQueueState | null;
};

/* -------------------------------------------------------------------------- */
/* primitives                                                                 */
/* -------------------------------------------------------------------------- */

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 40) {
    return false;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

/** An ISO 8601 string, or `fallback` when the input is not a usable date. */
export function coerceIso(value: unknown, fallback: string): string {
  if (isIsoDate(value)) return new Date(value).toISOString();
  return fallback;
}

/** An ISO string or `null`. Used for genuinely optional instants. */
export function coerceNullableIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (isIsoDate(value)) return new Date(value).toISOString();
  return null;
}

function coerceString(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.slice(0, max);
}

function coerceCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function nowIso(): string {
  return new Date().toISOString();
}

/* -------------------------------------------------------------------------- */
/* activity                                                                   */
/* -------------------------------------------------------------------------- */

export function normalizeActivityEntry(
  raw: unknown,
  fallbackNow: string,
): ActivityEntry | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const id = coerceString(o.id, 200).trim();
  if (id.length === 0) return null;
  const type = coerceString(o.type, 80).trim() || "note";
  const entry: ActivityEntry = {
    id,
    type,
    title: coerceString(o.title, MAX_ACTIVITY_TITLE_LENGTH),
    createdAt: coerceIso(o.createdAt, fallbackNow),
  };
  const detail = coerceString(o.detail, MAX_ACTIVITY_DETAIL_LENGTH);
  if (detail.length > 0) entry.detail = detail;
  const messageVariant = coerceString(o.messageVariant, 40).trim();
  if (messageVariant.length > 0) entry.messageVariant = messageVariant;
  const followUpAt = coerceNullableIso(o.followUpAt);
  if (followUpAt) entry.followUpAt = followUpAt;
  return entry;
}

/**
 * Appends while preserving idempotency: an entry whose `id` is already present
 * is dropped rather than duplicated. This is what makes the legacy migration
 * safe to run more than once, and what stops a retried request from doubling
 * the timeline.
 *
 * Sorted by `createdAt` so out-of-order arrivals still read chronologically,
 * then trimmed to the newest {@link MAX_ACTIVITY_PER_LEAD}.
 */
export function mergeActivity(
  existing: ActivityEntry[],
  incoming: ActivityEntry[],
): ActivityEntry[] {
  const byId = new Map<string, ActivityEntry>();
  for (const entry of existing) byId.set(entry.id, entry);
  for (const entry of incoming) {
    if (!byId.has(entry.id)) byId.set(entry.id, entry);
  }
  const merged = [...byId.values()].sort((a, b) => {
    const cmp = a.createdAt.localeCompare(b.createdAt);
    return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
  });
  return merged.length > MAX_ACTIVITY_PER_LEAD
    ? merged.slice(merged.length - MAX_ACTIVITY_PER_LEAD)
    : merged;
}

/* -------------------------------------------------------------------------- */
/* lead state                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The workflow fields mirrored from `LeadStatusUpdate`. Listed explicitly so a
 * caller cannot widen the stored record by inventing keys.
 */
const WORKFLOW_NUMBER_FIELDS = [
  "updatedAt",
  "contactedAt",
  "lastContactedAt",
  "nextFollowUpAt",
  "lastQueuedAt",
  "followUpAfterHours",
  "repliedAt",
  "meetingAt",
  "wonAt",
  "lostAt",
  "contactAttempts",
] as const;

const WORKFLOW_BOOLEAN_FIELDS = [
  "doNotContact",
  "whatsappInvalid",
  "queuedToday",
] as const;

function normalizeWorkflow(raw: unknown): Partial<LeadStatusUpdate> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  if (typeof o.status === "string") out.status = o.status.slice(0, 60);
  if (typeof o.channel === "string") out.channel = o.channel.slice(0, 30);
  else if (o.channel === null) out.channel = null;

  for (const key of WORKFLOW_NUMBER_FIELDS) {
    const v = o[key];
    if (v === null) out[key] = null;
    else if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
  }
  for (const key of WORKFLOW_BOOLEAN_FIELDS) {
    if (key in o) out[key] = Boolean(o[key]);
  }
  return Object.keys(out).length > 0 ? (out as Partial<LeadStatusUpdate>) : undefined;
}

function normalizeAiSnapshot(raw: unknown): AiSnapshot | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const snapshot: AiSnapshot = {};
  const summary = coerceString(o.summary, MAX_AI_SUMMARY_LENGTH);
  if (summary.length > 0) snapshot.summary = summary;
  const generatedAt = coerceNullableIso(o.generatedAt);
  if (generatedAt) snapshot.generatedAt = generatedAt;
  const model = coerceString(o.model, 120).trim();
  if (model.length > 0) snapshot.model = model;
  return Object.keys(snapshot).length > 0 ? snapshot : undefined;
}

function normalizeManualOverrides(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const entries = Object.entries(raw as Record<string, unknown>).slice(0, 100);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
}

export function normalizeLeadState(
  leadId: string,
  raw: unknown,
  fallbackNow: string,
): LeadOperationalState {
  const o =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const activityRaw = Array.isArray(o.activity) ? o.activity : [];
  const activity = mergeActivity(
    [],
    activityRaw
      .map((entry) => normalizeActivityEntry(entry, fallbackNow))
      .filter((entry): entry is ActivityEntry => entry !== null),
  );

  const state: LeadOperationalState = {
    leadId,
    activity,
    createdAt: coerceIso(o.createdAt, fallbackNow),
    updatedAt: coerceIso(o.updatedAt, fallbackNow),
    revision: coerceCount(o.revision),
  };

  if ("queued" in o) state.queued = Boolean(o.queued);
  if (typeof o.salesStage === "string") state.salesStage = o.salesStage.slice(0, 120);
  else if (o.salesStage === null) state.salesStage = null;
  if ("nextFollowUpAt" in o) state.nextFollowUpAt = coerceNullableIso(o.nextFollowUpAt);
  if (typeof o.founderNotes === "string") {
    state.founderNotes = o.founderNotes.slice(0, MAX_NOTE_LENGTH);
  }

  const workflow = normalizeWorkflow(o.workflow);
  if (workflow) state.workflow = workflow;
  const overrides = normalizeManualOverrides(o.manualOverrides);
  if (overrides) state.manualOverrides = overrides;
  const ai = normalizeAiSnapshot(o.aiSnapshot);
  if (ai) state.aiSnapshot = ai;
  const workspace = normalizeMessageWorkspace(o.messageWorkspace, fallbackNow);
  if (workspace) state.messageWorkspace = workspace;

  return state;
}

/* -------------------------------------------------------------------------- */
/* roster + daily queue                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The roster is the imported lead list. Its full shape is `ScoredLead`, which
 * is wide and evolving, so it is validated structurally (object with a valid
 * `id`) rather than field-by-field — re-validating every scoring field here
 * would duplicate `leads.ts` and drift from it.
 */
export function normalizeRoster(raw: unknown): ScoredLead[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ScoredLead[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const id = (entry as { id?: unknown }).id;
    if (!isValidLeadId(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(entry as ScoredLead);
    if (out.length >= MAX_LEADS) break;
  }
  return out;
}

export function normalizeDailyQueue(
  raw: unknown,
  fallbackNow: string,
): DailyQueueState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const queueDate = coerceString(o.queueDate, 20).trim();
  if (queueDate.length === 0) return null;

  const ids = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter(isValidLeadId).slice(0, MAX_LEADS) : [];

  const queueItemsRaw =
    o.queueItems && typeof o.queueItems === "object" && !Array.isArray(o.queueItems)
      ? (o.queueItems as Record<string, unknown>)
      : {};
  const queueItems: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(queueItemsRaw)) {
    if (isValidLeadId(id)) queueItems[id] = value;
  }

  return {
    queueDate,
    todayQueue: ids(o.todayQueue),
    todayLog: ids(o.todayLog),
    queueItems,
    completedToday: coerceCount(o.completedToday),
    skippedToday: coerceCount(o.skippedToday),
    dncToday: coerceCount(o.dncToday),
    updatedAt: coerceIso(o.updatedAt, fallbackNow),
  };
}

/* -------------------------------------------------------------------------- */
/* file                                                                       */
/* -------------------------------------------------------------------------- */

export function emptyStateFile(now: string = nowIso()): OperationalStateFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: now,
    leads: {},
    roster: [],
    rosterUpdatedAt: null,
    dailyQueue: null,
  };
}

/**
 * Parses whatever was on disk into a valid file.
 *
 * Returns `null` for input that is structurally not our file (not an object,
 * wrong/absent schema version). The caller treats `null` as corruption and
 * quarantines the file rather than overwriting it — losing the founder's
 * pipeline to a silent reset is the one failure this store must not have.
 */
export function parseStateFile(
  raw: unknown,
  now: string = nowIso(),
): OperationalStateFile | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== SCHEMA_VERSION) return null;

  const leadsRaw =
    o.leads && typeof o.leads === "object" && !Array.isArray(o.leads)
      ? (o.leads as Record<string, unknown>)
      : {};

  const leads: Record<string, LeadOperationalState> = {};
  for (const [leadId, value] of Object.entries(leadsRaw)) {
    if (!isValidLeadId(leadId)) continue;
    leads[leadId] = normalizeLeadState(leadId, value, now);
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: coerceIso(o.updatedAt, now),
    leads,
    roster: normalizeRoster(o.roster),
    rosterUpdatedAt: coerceNullableIso(o.rosterUpdatedAt),
    dailyQueue: normalizeDailyQueue(o.dailyQueue, now),
  };
}

/* -------------------------------------------------------------------------- */
/* patching                                                                   */
/* -------------------------------------------------------------------------- */

/** The subset of a lead record a client is allowed to PATCH. */
export type LeadStatePatch = {
  queued?: boolean;
  salesStage?: string | null;
  nextFollowUpAt?: string | null;
  founderNotes?: string;
  workflow?: Partial<LeadStatusUpdate>;
  manualOverrides?: Record<string, unknown>;
  aiSnapshot?: AiSnapshot;
  messageWorkspace?: LeadMessageWorkspaceState;
};

/**
 * Extracts the writable fields from an untrusted request body.
 * Absent keys stay absent so a patch never clears a field it did not mention.
 */
export function parseLeadStatePatch(raw: unknown): LeadStatePatch | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const patch: LeadStatePatch = {};

  if ("queued" in o) patch.queued = Boolean(o.queued);
  if ("salesStage" in o) {
    patch.salesStage =
      typeof o.salesStage === "string" ? o.salesStage.slice(0, 120) : null;
  }
  if ("nextFollowUpAt" in o) patch.nextFollowUpAt = coerceNullableIso(o.nextFollowUpAt);
  if ("founderNotes" in o) {
    if (typeof o.founderNotes !== "string") return null;
    if (o.founderNotes.length > MAX_NOTE_LENGTH) return null;
    patch.founderNotes = o.founderNotes;
  }
  if ("workflow" in o) {
    const workflow = normalizeWorkflow(o.workflow);
    if (workflow) patch.workflow = workflow;
  }
  if ("manualOverrides" in o) {
    const overrides = normalizeManualOverrides(o.manualOverrides);
    if (overrides) patch.manualOverrides = overrides;
  }
  if ("aiSnapshot" in o) {
    const ai = normalizeAiSnapshot(o.aiSnapshot);
    if (ai) patch.aiSnapshot = ai;
  }
  if ("messageWorkspace" in o) {
    // Strict on the write path: an over-length draft is rejected rather than
    // stored truncated, so the founder is never told a message was saved that
    // is not the message they wrote.
    const workspace = parseMessageWorkspace(o.messageWorkspace, nowIso());
    if (!workspace) return null;
    patch.messageWorkspace = workspace;
  }

  return patch;
}

/**
 * Applies a patch, bumping `revision` and `updatedAt`.
 *
 * `workflow` and `manualOverrides` merge key-by-key rather than replacing, so a
 * partial update from one screen cannot erase a field another screen owns.
 */
export function applyLeadStatePatch(
  current: LeadOperationalState | undefined,
  leadId: string,
  patch: LeadStatePatch,
  now: string,
): LeadOperationalState {
  const base: LeadOperationalState = current ?? {
    leadId,
    activity: [],
    createdAt: now,
    updatedAt: now,
    revision: 0,
  };

  const next: LeadOperationalState = {
    ...base,
    leadId,
    updatedAt: now,
    revision: base.revision + 1,
  };

  if (patch.queued !== undefined) next.queued = patch.queued;
  if (patch.salesStage !== undefined) next.salesStage = patch.salesStage;
  if (patch.nextFollowUpAt !== undefined) next.nextFollowUpAt = patch.nextFollowUpAt;
  if (patch.founderNotes !== undefined) {
    next.founderNotes = patch.founderNotes.slice(0, MAX_NOTE_LENGTH);
  }
  if (patch.workflow) next.workflow = { ...(base.workflow ?? {}), ...patch.workflow };
  if (patch.manualOverrides) {
    next.manualOverrides = { ...(base.manualOverrides ?? {}), ...patch.manualOverrides };
  }
  if (patch.aiSnapshot) next.aiSnapshot = { ...(base.aiSnapshot ?? {}), ...patch.aiSnapshot };
  if (patch.messageWorkspace) {
    next.messageWorkspace = mergeMessageWorkspace(
      base.messageWorkspace,
      patch.messageWorkspace,
    );
  }

  return next;
}
