"use client";

import type { LeadStatusUpdate, ScoredLead } from "../leads.ts";
import type { LeadMessageWorkspaceState } from "../outreach/workspace.ts";
import type {
  ActivityEntry,
  DailyQueueState,
  LeadOperationalState,
  OperationalStateFile,
} from "./schema.ts";

/**
 * Browser-side access to server operational state.
 *
 * Why a mirror. The dashboard's existing `loadState()` / `saveState()` helpers
 * are synchronous and are called from ~24 render and event-handler sites. The
 * server is async. Rewriting every call site would mean restructuring the
 * component, which this sprint explicitly does not do. Instead the module
 * hydrates a mirror once on mount and serves the synchronous reads from it,
 * while writes go to the server and update the mirror.
 *
 * The mirror is a cache of the server, never a second source of truth: it is
 * only ever populated from a server response or from a write that the server
 * accepted.
 */

/* -------------------------------------------------------------------------- */
/* mirror                                                                     */
/* -------------------------------------------------------------------------- */

type Mirror = {
  hydrated: boolean;
  leads: Record<string, LeadOperationalState>;
  roster: ScoredLead[];
  dailyQueue: DailyQueueState | null;
};

const mirror: Mirror = {
  hydrated: false,
  leads: {},
  roster: [],
  dailyQueue: null,
};

export function isHydrated(): boolean {
  return mirror.hydrated;
}

/* -------------------------------------------------------------------------- */
/* change notifications                                                       */
/* -------------------------------------------------------------------------- */

type LeadStateListener = (leadId: string | null) => void;

const leadStateListeners = new Set<LeadStateListener>();

/**
 * Subscribes to accepted writes, so two views of the same lead cannot drift.
 *
 * The AI message modal and the lead detail workspace can be open over the same
 * lead at once. Both read their drafts from the mirror; without this channel
 * the one that did not perform the write would keep rendering the copy it
 * loaded on mount, and the founder would see two different "current" drafts.
 *
 * `null` means "everything changed" (a full hydrate).
 */
export function subscribeLeadState(listener: LeadStateListener): () => void {
  leadStateListeners.add(listener);
  return () => {
    leadStateListeners.delete(listener);
  };
}

function notifyLeadState(leadId: string | null): void {
  for (const listener of leadStateListeners) listener(leadId);
}

/* -------------------------------------------------------------------------- */
/* shape conversion                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The dashboard works in `LeadStatusUpdate` (epoch-ms numbers). The store works
 * in ISO strings for the fields it promotes to top level. These two functions
 * are the only place that translation happens.
 */

function isoToEpoch(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function epochToIso(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value).toISOString();
}

/** Server record → the workflow shape the dashboard renders. */
export function toStatusUpdate(
  state: LeadOperationalState,
): Partial<LeadStatusUpdate> {
  const workflow: Partial<LeadStatusUpdate> = { ...(state.workflow ?? {}) };
  if (state.salesStage !== undefined) workflow.pipelineStage = state.salesStage;
  if (state.nextFollowUpAt !== undefined) {
    workflow.nextFollowUpAt = isoToEpoch(state.nextFollowUpAt);
  }
  if (state.founderNotes !== undefined) workflow.note = state.founderNotes;
  if (state.queued !== undefined) workflow.queuedToday = state.queued;
  return workflow;
}

/**
 * Dashboard workflow record → a patch body for the store.
 *
 * Four fields are promoted to top-level store columns (`salesStage`,
 * `nextFollowUpAt`, `founderNotes`, `queued`) because they are the ones the
 * audit called critical and the ones a backup reader should be able to find
 * without knowing the dashboard's internals. They are *also* left in
 * `workflow` so the round-trip through {@link toStatusUpdate} is lossless for
 * the numeric/epoch representation the dashboard actually renders.
 */
export function toPatchBody(update: Partial<LeadStatusUpdate>): Record<string, unknown> {
  const patch: Record<string, unknown> = { workflow: { ...update } };

  if (update.pipelineStage !== undefined) {
    patch.salesStage = update.pipelineStage ?? null;
  }
  if (update.nextFollowUpAt !== undefined) {
    patch.nextFollowUpAt = epochToIso(update.nextFollowUpAt);
  }
  if (update.note !== undefined) patch.founderNotes = update.note;
  if (update.queuedToday !== undefined) patch.queued = update.queuedToday;

  return patch;
}

/* -------------------------------------------------------------------------- */
/* synchronous reads (served from the mirror)                                 */
/* -------------------------------------------------------------------------- */

export function readStateMap(): Record<string, Partial<LeadStatusUpdate>> {
  const out: Record<string, Partial<LeadStatusUpdate>> = {};
  for (const [leadId, state] of Object.entries(mirror.leads)) {
    out[leadId] = toStatusUpdate(state);
  }
  return out;
}

export function readRoster(): ScoredLead[] {
  return mirror.roster;
}

export function readDailyQueue(): DailyQueueState | null {
  return mirror.dailyQueue;
}

export function readActivity(): Record<string, ActivityEntry[]> {
  const out: Record<string, ActivityEntry[]> = {};
  for (const [leadId, state] of Object.entries(mirror.leads)) {
    if (state.activity.length > 0) out[leadId] = state.activity;
  }
  return out;
}

export function readRevision(leadId: string): number | undefined {
  return mirror.leads[leadId]?.revision;
}

/* -------------------------------------------------------------------------- */
/* transport                                                                  */
/* -------------------------------------------------------------------------- */

export class OperationalStateError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "OperationalStateError";
    this.status = status;
  }
}

/* -------------------------------------------------------------------------- */
/* failure reporting                                                          */
/* -------------------------------------------------------------------------- */

type PersistErrorListener = (message: string) => void;

const persistErrorListeners = new Set<PersistErrorListener>();

/**
 * Subscribes to write failures. The dashboard renders these as a banner.
 *
 * This exists because the existing save call sites are synchronous and cannot
 * await a result. Without a channel like this, a rejected write would be an
 * unhandled promise and the founder would believe a change was saved when it
 * was not — the precise failure mode this sprint removes.
 */
export function onPersistError(listener: PersistErrorListener): () => void {
  persistErrorListeners.add(listener);
  return () => {
    persistErrorListeners.delete(listener);
  };
}

/** Turns a rejected write into a user-visible message. */
export function reportPersistFailure(err: unknown): void {
  const message =
    err instanceof OperationalStateError
      ? err.message
      : "Değişiklik sunucuya kaydedilemedi. Bağlantınızı kontrol edin.";
  for (const listener of persistErrorListeners) listener(message);
}

async function request(
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new OperationalStateError(
      response.status === 401
        ? "Oturum sona erdi. Lütfen tekrar giriş yapın."
        : "Sunucuya kaydedilemedi.",
      response.status,
    );
  }
  return (await response.json()) as unknown;
}

/* -------------------------------------------------------------------------- */
/* hydration                                                                  */
/* -------------------------------------------------------------------------- */

/** Loads the full workspace and replaces the mirror. Call once on mount. */
export async function hydrate(): Promise<OperationalStateFile> {
  const file = (await request("/api/operational-state")) as OperationalStateFile;
  mirror.leads = file.leads ?? {};
  mirror.roster = Array.isArray(file.roster) ? file.roster : [];
  mirror.dailyQueue = file.dailyQueue ?? null;
  mirror.hydrated = true;
  notifyLeadState(null);
  return file;
}

/* -------------------------------------------------------------------------- */
/* writes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Persists one lead's workflow record.
 *
 * Throws on failure so the caller can roll the optimistic update back — a
 * write that silently disappears is exactly the failure this sprint exists to
 * remove.
 */
export async function patchLead(
  leadId: string,
  update: Partial<LeadStatusUpdate>,
): Promise<void> {
  const next = (await request(`/api/operational-state/${encodeURIComponent(leadId)}`, {
    method: "PATCH",
    body: JSON.stringify(toPatchBody(update)),
  })) as LeadOperationalState;
  mirror.leads[leadId] = next;
  notifyLeadState(leadId);
}

/* -------------------------------------------------------------------------- */
/* message workspace                                                          */
/* -------------------------------------------------------------------------- */

/** The stored outreach drafts for one lead, or `undefined` if it has none. */
export function readMessageWorkspace(
  leadId: string,
): LeadMessageWorkspaceState | undefined {
  return mirror.leads[leadId]?.messageWorkspace;
}

/** Re-reads one lead from the server and replaces its mirror entry. */
export async function refreshLead(leadId: string): Promise<LeadOperationalState | null> {
  try {
    const state = (await request(
      `/api/operational-state/${encodeURIComponent(leadId)}`,
    )) as LeadOperationalState;
    mirror.leads[leadId] = state;
    notifyLeadState(leadId);
    return state;
  } catch (err) {
    // A lead with no server record yet is a 404, not a failure.
    if (err instanceof OperationalStateError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Persists a lead's outreach drafts.
 *
 * Sent with the mirror's revision so a second device editing the same lead is
 * rejected instead of clobbering. On rejection the server copy is pulled back
 * into the mirror and the caller is handed it — the founder's unsaved text
 * lives in component state and is never part of what gets discarded here.
 */
export async function patchMessageWorkspace(
  leadId: string,
  workspace: LeadMessageWorkspaceState,
): Promise<LeadMessageWorkspaceState | undefined> {
  const expectedRevision = mirror.leads[leadId]?.revision;
  try {
    const next = (await request(`/api/operational-state/${encodeURIComponent(leadId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        messageWorkspace: workspace,
        ...(expectedRevision !== undefined ? { expectedRevision } : {}),
      }),
    })) as LeadOperationalState;
    mirror.leads[leadId] = next;
    notifyLeadState(leadId);
    return next.messageWorkspace;
  } catch (err) {
    if (err instanceof OperationalStateError && err.status === 409) {
      await refreshLead(leadId);
      throw new OperationalStateError(
        "Bu lead başka bir cihazda güncellendi. Sunucudaki hâli yüklendi; metniniz korundu.",
        409,
      );
    }
    throw err;
  }
}

/**
 * The dashboard's `normalizeStateEntry`, injected so change detection can
 * compare like with like.
 *
 * Without it, a mirror record (server shape, sparse) never equals a dashboard
 * record (normalized, every default filled in), so the first save after page
 * load would PATCH every lead in the roster instead of the one that changed.
 */
type StateNormalizer = (value: Partial<LeadStatusUpdate>) => Partial<LeadStatusUpdate>;

let normalizeState: StateNormalizer = (value) => value;

export function setStateNormalizer(normalizer: StateNormalizer): void {
  normalizeState = normalizer;
}

/** Persists only the leads whose record actually differs from the mirror. */
export async function patchLeads(
  stateMap: Record<string, Partial<LeadStatusUpdate>>,
): Promise<void> {
  const changed = Object.entries(stateMap).filter(([leadId, update]) => {
    const current = mirror.leads[leadId];
    if (!current) return true;
    return (
      JSON.stringify(normalizeState(toStatusUpdate(current))) !==
      JSON.stringify(normalizeState(update))
    );
  });
  for (const [leadId, update] of changed) {
    await patchLead(leadId, update);
  }
}

export async function appendActivity(
  leadId: string,
  entries: ActivityEntry[],
): Promise<void> {
  if (entries.length === 0) return;
  const next = (await request(
    `/api/operational-state/${encodeURIComponent(leadId)}/activity`,
    { method: "POST", body: JSON.stringify({ entries }) },
  )) as LeadOperationalState;
  mirror.leads[leadId] = next;
  notifyLeadState(leadId);
}

export async function putRoster(roster: ScoredLead[]): Promise<void> {
  await request("/api/operational-workspace/roster", {
    method: "PUT",
    body: JSON.stringify({ roster }),
  });
  mirror.roster = roster;
}

export async function putDailyQueue(queue: unknown): Promise<void> {
  const result = (await request("/api/operational-workspace/daily-queue", {
    method: "PUT",
    body: JSON.stringify({ dailyQueue: queue }),
  })) as { dailyQueue: DailyQueueState | null };
  mirror.dailyQueue = result.dailyQueue;
}

/* -------------------------------------------------------------------------- */
/* migration                                                                  */
/* -------------------------------------------------------------------------- */

export async function migrate(payload: {
  leads?: Record<string, unknown>;
  activity?: Record<string, unknown[]>;
  roster?: unknown;
  dailyQueue?: unknown;
}): Promise<{
  leadsAdded: number;
  activityAdded: number;
  rosterAdded: number;
  dailyQueueAdopted: boolean;
}> {
  return (await request("/api/operational-state", {
    method: "POST",
    body: JSON.stringify(payload),
  })) as {
    leadsAdded: number;
    activityAdded: number;
    rosterAdded: number;
    dailyQueueAdopted: boolean;
  };
}
