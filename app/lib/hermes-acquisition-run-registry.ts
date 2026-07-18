import type {
  AcquisitionAuditEvent,
  AcquisitionMode,
  AcquisitionRunStatus,
  AcquisitionTrigger,
} from "./hermes-autonomous-acquisition-policy.ts";

/**
 * Hermes Acquisition Run Registry (Sprint C1 — Scope 3/5).
 *
 * Server-only, in-memory bookkeeping for autonomous acquisition runs — the
 * same tradeoff as every other Hermes registry (`demo-scheduling-registry`,
 * `whatsapp-reply-registry`, the Mission State Bridge): a module-level
 * store, lost on server restart, bounded so it can never grow unbounded.
 *
 * What it holds:
 *  - a capped list of sanitized run records (counts, statuses, Turkish
 *    summaries, audit events — never an API key, raw provider response,
 *    token, or full business payload);
 *  - the active-run lock (with a stale-lock timeout so a crashed run can
 *    never deadlock acquisition forever);
 *  - recent idempotency keys (cron/webhook retry protection);
 *  - per-region last-run timestamps (cooldown source);
 *  - the dedupe keys of every business already handed off, so a later run
 *    skips it server-side before the client-side merge dedupe even runs;
 *  - a bounded, TTL'd store of pending mission-candidate leads awaiting
 *    client pickup (the handoff to the existing import merge path).
 *
 * Candidate leads are the one place richer objects are stored: they are the
 * exact `ScoredLead`-shaped objects the existing `/api/import-leads` route
 * already returns to the browser — a handoff payload, not a second copy of
 * provider data. They are typed opaquely here (`AcquisitionCandidateLead`)
 * so this module never imports the heavy `leads.ts` chain and stays
 * node-testable.
 */

export type HermesAcquisitionRun = {
  id: string;
  trigger: AcquisitionTrigger;
  status: AcquisitionRunStatus;
  mode: AcquisitionMode;
  dryRun: boolean;
  /** City names only — safe for the founder, no query text, no key. */
  selectedRegionsSafe: string[];
  startedAt: number;
  completedAt: number | null;
  evaluatedCount: number;
  importedCount: number;
  duplicateCount: number;
  enrichedCount: number;
  qualifiedCount: number;
  missionCandidateCount: number;
  missionCreatedCount: number;
  skippedCount: number;
  externalRequestCount: number;
  /** Sprint C2 — qualification aşamasının run düzeyi sayaçları. */
  qualificationEvaluatedCount: number;
  salesReadyCount: number;
  reviewRequiredCount: number;
  dataNeededCount: number;
  watchCount: number;
  notQualifiedCount: number;
  qualificationBlockedCount: number;
  blockingReasons: string[];
  /** Sanitized, operator-safe error notes — never a raw provider error body. */
  safeErrors: string[];
  summaryTr: string;
  auditEvents: AcquisitionAuditEvent[];
};

/** Structural stand-in for ScoredLead — keeps this module free of the heavy leads.ts import chain. */
export type AcquisitionCandidateLead = {
  id: string;
  name: string;
  city: string;
  phone?: string;
  website?: string;
} & Record<string, unknown>;

const MAX_STORED_RUNS = 20;
const MAX_IDEMPOTENCY_KEYS = 100;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
/** A run that never completed releases its lock after this long — no deadlock after a crash. */
const STALE_LOCK_MS = 10 * 60 * 1000;
const CANDIDATE_TTL_MS = 48 * 60 * 60 * 1000;
const MAX_PENDING_CANDIDATES = 200;
const MAX_SEEN_DEDUPE_KEYS = 5000;

type CandidateBatch = {
  runId: string;
  leads: AcquisitionCandidateLead[];
  storedAt: number;
};

const runs: HermesAcquisitionRun[] = [];
let activeRunId: string | null = null;
const idempotencyKeys = new Map<string, number>();
const regionLastRunAt = new Map<string, number>();
const seenDedupeKeys = new Set<string>();
const pendingCandidates: CandidateBatch[] = [];
let runSeq = 0;

function pruneIdempotencyKeys(now: number): void {
  for (const [key, at] of idempotencyKeys) {
    if (now - at > IDEMPOTENCY_TTL_MS) idempotencyKeys.delete(key);
  }
  if (idempotencyKeys.size > MAX_IDEMPOTENCY_KEYS) {
    const sorted = [...idempotencyKeys.entries()].sort((a, b) => a[1] - b[1]);
    for (const [key] of sorted.slice(0, idempotencyKeys.size - MAX_IDEMPOTENCY_KEYS)) {
      idempotencyKeys.delete(key);
    }
  }
}

function pruneCandidates(now: number): void {
  for (let i = pendingCandidates.length - 1; i >= 0; i -= 1) {
    if (now - pendingCandidates[i].storedAt > CANDIDATE_TTL_MS) pendingCandidates.splice(i, 1);
  }
  let total = pendingCandidates.reduce((s, b) => s + b.leads.length, 0);
  while (total > MAX_PENDING_CANDIDATES && pendingCandidates.length > 0) {
    const dropped = pendingCandidates.shift()!;
    total -= dropped.leads.length;
  }
}

function findRun(runId: string): HermesAcquisitionRun | undefined {
  return runs.find((r) => r.id === runId);
}

export function getActiveAcquisitionRun(now: number = Date.now()): HermesAcquisitionRun | null {
  if (!activeRunId) return null;
  const run = findRun(activeRunId);
  if (!run) {
    activeRunId = null;
    return null;
  }
  if (now - run.startedAt > STALE_LOCK_MS) {
    // Crashed mid-run: mark failed, release the lock.
    run.status = "failed";
    run.completedAt = now;
    run.safeErrors.push("Tarama beklenenden uzun sürdüğü için güvenli şekilde sonlandırıldı.");
    activeRunId = null;
    return null;
  }
  return run;
}

export type StartAcquisitionRunInput = {
  trigger: AcquisitionTrigger;
  mode: AcquisitionMode;
  dryRun: boolean;
  selectedRegionsSafe: string[];
  idempotencyKey: string;
  now?: number;
};

export type StartAcquisitionRunResult =
  | { ok: true; run: HermesAcquisitionRun }
  | { ok: false; reason: "active_run" | "duplicate_idempotency" };

/**
 * Registers a run and takes the active-run lock. Dry runs still take the
 * lock (they're near-instant) but never consume an idempotency slot — a
 * preview must always be repeatable.
 */
export function startAcquisitionRun(input: StartAcquisitionRunInput): StartAcquisitionRunResult {
  const now = input.now ?? Date.now();
  pruneIdempotencyKeys(now);

  if (getActiveAcquisitionRun(now)) return { ok: false, reason: "active_run" };
  if (!input.dryRun && idempotencyKeys.has(input.idempotencyKey)) {
    return { ok: false, reason: "duplicate_idempotency" };
  }

  runSeq += 1;
  const run: HermesAcquisitionRun = {
    id: `acq-${now}-${runSeq}`,
    trigger: input.trigger,
    status: "running",
    mode: input.mode,
    dryRun: input.dryRun,
    selectedRegionsSafe: [...input.selectedRegionsSafe],
    startedAt: now,
    completedAt: null,
    evaluatedCount: 0,
    importedCount: 0,
    duplicateCount: 0,
    enrichedCount: 0,
    qualifiedCount: 0,
    missionCandidateCount: 0,
    missionCreatedCount: 0,
    skippedCount: 0,
    externalRequestCount: 0,
    qualificationEvaluatedCount: 0,
    salesReadyCount: 0,
    reviewRequiredCount: 0,
    dataNeededCount: 0,
    watchCount: 0,
    notQualifiedCount: 0,
    qualificationBlockedCount: 0,
    blockingReasons: [],
    safeErrors: [],
    summaryTr: "",
    auditEvents: [],
  };

  runs.unshift(run);
  if (runs.length > MAX_STORED_RUNS) runs.length = MAX_STORED_RUNS;
  activeRunId = run.id;
  if (!input.dryRun) idempotencyKeys.set(input.idempotencyKey, now);

  return { ok: true, run };
}

export type RecordBlockedRunInput = {
  trigger: AcquisitionTrigger;
  mode: AcquisitionMode;
  dryRun: boolean;
  blockingReasons: string[];
  summaryTr: string;
  auditEvents: AcquisitionAuditEvent[];
  now?: number;
};

/**
 * Records a blocked run as an already-finished audit entry. Never takes the
 * active-run lock and never consumes an idempotency slot — a blocked attempt
 * did nothing, so it must not prevent a corrected retry.
 */
export function recordBlockedAcquisitionRun(input: RecordBlockedRunInput): HermesAcquisitionRun {
  const now = input.now ?? Date.now();
  runSeq += 1;
  const run: HermesAcquisitionRun = {
    id: `acq-${now}-${runSeq}`,
    trigger: input.trigger,
    status: "blocked",
    mode: input.mode,
    dryRun: input.dryRun,
    selectedRegionsSafe: [],
    startedAt: now,
    completedAt: now,
    evaluatedCount: 0,
    importedCount: 0,
    duplicateCount: 0,
    enrichedCount: 0,
    qualifiedCount: 0,
    missionCandidateCount: 0,
    missionCreatedCount: 0,
    skippedCount: 0,
    externalRequestCount: 0,
    qualificationEvaluatedCount: 0,
    salesReadyCount: 0,
    reviewRequiredCount: 0,
    dataNeededCount: 0,
    watchCount: 0,
    notQualifiedCount: 0,
    qualificationBlockedCount: 0,
    blockingReasons: [...input.blockingReasons],
    safeErrors: [],
    summaryTr: input.summaryTr,
    auditEvents: [...input.auditEvents],
  };
  runs.unshift(run);
  if (runs.length > MAX_STORED_RUNS) runs.length = MAX_STORED_RUNS;
  return run;
}

export type FinishAcquisitionRunPatch = Partial<
  Pick<
    HermesAcquisitionRun,
    | "status"
    | "selectedRegionsSafe"
    | "evaluatedCount"
    | "importedCount"
    | "duplicateCount"
    | "enrichedCount"
    | "qualifiedCount"
    | "missionCandidateCount"
    | "missionCreatedCount"
    | "skippedCount"
    | "externalRequestCount"
    | "qualificationEvaluatedCount"
    | "salesReadyCount"
    | "reviewRequiredCount"
    | "dataNeededCount"
    | "watchCount"
    | "notQualifiedCount"
    | "qualificationBlockedCount"
    | "blockingReasons"
    | "safeErrors"
    | "summaryTr"
    | "auditEvents"
  >
>;

/** Applies the final counters/status and releases the active-run lock. */
export function finishAcquisitionRun(
  runId: string,
  patch: FinishAcquisitionRunPatch,
  now: number = Date.now(),
): HermesAcquisitionRun | null {
  const run = findRun(runId);
  if (!run) return null;
  Object.assign(run, patch);
  if (!patch.status || patch.status === "running") run.status = "completed";
  run.completedAt = now;
  if (activeRunId === runId) activeRunId = null;
  return run;
}

/** Marks per-region last-run moments — the cooldown source for region selection. */
export function markRegionsScanned(regionIds: string[], now: number = Date.now()): void {
  for (const id of regionIds) regionLastRunAt.set(id, now);
}

export function getRegionLastRunAt(regionId: string): number | null {
  return regionLastRunAt.get(regionId) ?? null;
}

/**
 * Türkiye Region Rotation v1.0 — seeds the in-memory cursor map from a
 * durable source (a disk-backed state store, wired in only by the
 * production route) without ever overwriting an already-set in-memory
 * value. Additive only: this registry stays a pure in-memory store with no
 * fs coupling of its own — the caller decides where `entries` came from.
 */
export function hydrateRegionLastRunAt(entries: Record<string, number>): void {
  for (const [id, at] of Object.entries(entries)) {
    if (!regionLastRunAt.has(id)) regionLastRunAt.set(id, at);
  }
}

/** A snapshot of the full in-memory rotation cursor map — the source a durable store persists from. */
export function getAllRegionLastRunAt(): Record<string, number> {
  return Object.fromEntries(regionLastRunAt);
}

/* ── duplicate control across runs ──────────────────────────── */

export function hasSeenAcquisitionDedupeKey(keys: string[]): boolean {
  return keys.some((k) => seenDedupeKeys.has(k));
}

export function rememberAcquisitionDedupeKeys(keys: string[]): void {
  for (const k of keys) {
    seenDedupeKeys.add(k);
  }
  // Bounded: clearing all when overfull is safe — the client merge dedupe
  // remains the authoritative duplicate gate.
  if (seenDedupeKeys.size > MAX_SEEN_DEDUPE_KEYS) seenDedupeKeys.clear();
}

/* ── candidate handoff ──────────────────────────────────────── */

/** Stores qualified candidate leads for client pickup. No-op for an unknown run or a dry run. */
export function registerAcquisitionCandidates(
  runId: string,
  leads: AcquisitionCandidateLead[],
  now: number = Date.now(),
): number {
  const run = findRun(runId);
  if (!run || run.dryRun || leads.length === 0) return 0;
  pruneCandidates(now);
  pendingCandidates.push({ runId, leads: [...leads], storedAt: now });
  pruneCandidates(now);
  return leads.length;
}

export type PendingCandidateBatch = {
  runId: string;
  storedAt: number;
  leads: AcquisitionCandidateLead[];
};

export function getPendingAcquisitionCandidates(now: number = Date.now()): PendingCandidateBatch[] {
  pruneCandidates(now);
  return pendingCandidates.map((b) => ({ runId: b.runId, storedAt: b.storedAt, leads: [...b.leads] }));
}

/* ── read model ─────────────────────────────────────────────── */

export function getRecentAcquisitionRuns(limit: number = 5): HermesAcquisitionRun[] {
  return runs.slice(0, Math.max(0, limit)).map((r) => ({
    ...r,
    selectedRegionsSafe: [...r.selectedRegionsSafe],
    blockingReasons: [...r.blockingReasons],
    safeErrors: [...r.safeErrors],
    auditEvents: [...r.auditEvents],
  }));
}

export type AcquisitionTodayCounters = {
  importedToday: number;
  externalRequestsToday: number;
  runsToday: number;
  evaluatedToday: number;
  duplicatesToday: number;
  missionCandidatesToday: number;
};

function isSameCalendarDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

/** Today's totals across recorded runs — the daily budget source. Dry runs never consume budget. */
export function getAcquisitionTodayCounters(now: number = Date.now()): AcquisitionTodayCounters {
  const today = runs.filter((r) => isSameCalendarDay(r.startedAt, now));
  const real = today.filter((r) => !r.dryRun);
  return {
    importedToday: real.reduce((s, r) => s + r.importedCount, 0),
    externalRequestsToday: real.reduce((s, r) => s + r.externalRequestCount, 0),
    runsToday: real.length,
    evaluatedToday: real.reduce((s, r) => s + r.evaluatedCount, 0),
    duplicatesToday: real.reduce((s, r) => s + r.duplicateCount, 0),
    missionCandidatesToday: real.reduce((s, r) => s + r.missionCandidateCount, 0),
  };
}

/** Test-only escape hatch — resets every module-level store between test cases. */
export function __resetAcquisitionRunRegistryForTests(): void {
  runs.length = 0;
  activeRunId = null;
  idempotencyKeys.clear();
  regionLastRunAt.clear();
  seenDedupeKeys.clear();
  pendingCandidates.length = 0;
  runSeq = 0;
}
