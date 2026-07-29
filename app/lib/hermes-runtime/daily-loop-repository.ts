import "server-only";

import type { ScoredLead } from "../leads.ts";
import {
  appendLeadActivity,
  getState as getOperationalState,
  isKnownLead,
  patchLeadState,
  UnknownLeadError,
} from "../operational-state/repository.ts";
import { isValidLeadId } from "../operational-state/lead-id.ts";
import {
  computeHermesDailyActionItems,
  summarizeDailyQueue,
  type HermesDailyActionItem,
  type LeadQueueContext,
} from "./daily-queue.ts";
import {
  advancePastDailyRunItem,
  buildDailyRun,
  refreshDailyRun,
  selectDailyRunItem,
  skipDailyRunItem,
  UnknownDailyRunItemError,
} from "./daily-run.ts";
import { resolveHermesRuntimeFilePath } from "./env.ts";
import {
  applyFollowUpStatusTransition,
  buildFollowUpRecord,
  isActiveFollowUpStatus,
  replanFollowUpRecord,
  type FollowUpPreset,
} from "./follow-up.ts";
import {
  applyOutcomeStatusTransition,
  buildOutcomeRecord,
  isValidOutcomeUpdate,
  type RecordOutcomeInput,
} from "./outcome.ts";
import {
  applyMissionStageTransition,
  applyMissionDecision,
} from "./mission.ts";
import { publishApprovalSnapshot } from "./repository.ts";
import {
  resolveMissionApprovalState,
} from "./mission-approval-resolver.ts";
import { readHermesFileOrEmpty, updateHermesFile } from "./store.ts";
import {
  isValidRecordId,
  isValidLocalDate,
  nowIso,
  normalizeDemoRecord,
  normalizeDeliveryRecord,
  normalizeReplyRecord,
  type FollowUpReason,
  type FollowUpRecord,
  type HermesDailyRun,
  type HermesMissionRecord,
  type HermesRuntimeFile,
  type SalesOutcomeRecord,
} from "./schema.ts";

/**
 * The daily loop's own repository surface — Founder mutations, one canonical
 * queue projection, and the durable daily run.
 *
 * v3.8.1 — Hermes Daily Loop Wiring.
 *
 * Kept separate from `repository.ts` (the v3.8.0 mission/approval/reply/demo/
 * delivery surface, already tested and load-bearing) rather than folded into
 * it: every function below is *composed* from that module's primitives —
 * `publishApprovalSnapshot`, `recordReply`, `recordDemo`, `getMission` — plus
 * the pure helpers in `follow-up.ts` / `outcome.ts` / `daily-run.ts` /
 * `daily-queue.ts`. Nothing here reimplements mission state, approval
 * binding, or the action-stage ladder.
 *
 * Sends nothing. No provider import, no `fetch` to an external host.
 */

export class UnknownMissionError extends Error {
  constructor() {
    super("unknown mission");
    this.name = "UnknownMissionError";
  }
}

export class InvalidRecordIdError extends Error {
  constructor() {
    super("invalid record id");
    this.name = "InvalidRecordIdError";
  }
}

export class InvalidLocalDateError extends Error {
  constructor() {
    super("invalid local date");
    this.name = "InvalidLocalDateError";
  }
}

export class UnknownDailyRunError extends Error {
  constructor() {
    super("no daily run for this date");
    this.name = "UnknownDailyRunError";
  }
}

export class UnknownFollowUpError extends Error {
  constructor() {
    super("no follow-up for this mission");
    this.name = "UnknownFollowUpError";
  }
}

export class InvalidOutcomeUpdateError extends Error {
  constructor() {
    super("outcome update is missing required detail");
    this.name = "InvalidOutcomeUpdateError";
  }
}

/**
 * The stale-approval guard, applied to a manual action instead of an
 * automated send: the founder must have approved *this exact copy*, and a
 * regenerated or edited draft invalidates the approval. See `message-hash.ts`
 * and section 12 of the sprint brief.
 */
export class StaleApprovalError extends Error {
  readonly blockingReasons: string[];
  constructor(blockingReasons: string[]) {
    super("approval does not cover the current message");
    this.name = "StaleApprovalError";
    this.blockingReasons = blockingReasons;
  }
}

function filePath(): string {
  return resolveHermesRuntimeFilePath();
}

async function assertKnownLead(leadId: unknown): Promise<string> {
  if (!isValidLeadId(leadId)) throw new UnknownLeadError();
  const operational = await getOperationalState();
  if (!isKnownLead(operational, leadId)) throw new UnknownLeadError();
  return leadId;
}

/** `YYYY-MM-DD` read as UTC midnight — deterministic and TZ-database-free, matching whatever local date the client already computed. */
export function startOfLocalDayMs(localDate: string): number {
  if (!isValidLocalDate(localDate)) throw new InvalidLocalDateError();
  const ms = Date.parse(`${localDate}T00:00:00.000Z`);
  if (!Number.isFinite(ms)) throw new InvalidLocalDateError();
  return ms;
}

/* -------------------------------------------------------------------------- */
/* lead context for the queue projection                                     */
/* -------------------------------------------------------------------------- */

function hasVerifiedWhatsApp(lead: ScoredLead | undefined): boolean {
  const confidence = lead?.whatsappConfidence;
  return confidence === "confirmed" || confidence === "likely";
}

function buildLeadLookup(
  operational: Awaited<ReturnType<typeof getOperationalState>>,
): (leadId: string) => LeadQueueContext | undefined {
  const rosterById = new Map(operational.roster.map((lead) => [lead.id, lead]));
  return (leadId: string) => {
    const lead = rosterById.get(leadId);
    const state = operational.leads[leadId];
    return {
      hasWhatsAppChannel: hasVerifiedWhatsApp(lead),
      workspace: state?.messageWorkspace,
      icpFitScore: lead?.icpFitScore ?? null,
      verifiedOpportunityScore: lead?.verifiedOpportunityScore ?? null,
      whatsappConfidence: lead?.whatsappConfidence ?? null,
    };
  };
}

export type DailyQueueSnapshot = {
  items: HermesDailyActionItem[];
  summary: ReturnType<typeof summarizeDailyQueue>;
};

/**
 * Builds the canonical queue from current durable state. Never mutates
 * anything and never calls a provider — a pure read followed by a pure
 * projection.
 */
export async function buildDailyQueueSnapshot(
  localDate: string,
  now: number = Date.now(),
): Promise<DailyQueueSnapshot> {
  const startOfDay = startOfLocalDayMs(localDate);
  const [hermes, operational] = await Promise.all([
    readHermesFileOrEmpty(filePath()),
    getOperationalState(),
  ]);

  const items = computeHermesDailyActionItems({
    missions: Object.values(hermes.missions),
    replies: Object.values(hermes.replies),
    demos: Object.values(hermes.demos),
    deliveries: Object.values(hermes.deliveries),
    followUps: Object.values(hermes.followUps),
    salesOutcomes: Object.values(hermes.salesOutcomes),
    leadLookup: buildLeadLookup(operational),
    now,
    startOfLocalDayMs: startOfDay,
  });

  return { items, summary: summarizeDailyQueue(items) };
}

/* -------------------------------------------------------------------------- */
/* daily run                                                                  */
/* -------------------------------------------------------------------------- */

export async function getDailyRun(localDate: string): Promise<HermesDailyRun | null> {
  if (!isValidLocalDate(localDate)) throw new InvalidLocalDateError();
  const file = await readHermesFileOrEmpty(filePath());
  return file.dailyRuns[localDate] ?? null;
}

/**
 * Starts today's run, or resumes the one already there — idempotent on
 * `localDate` because the run's id *is* the date. Always recomputes the
 * queue against current state before returning, so a resume after other
 * activity (a reply recorded from elsewhere, a follow-up going overdue) is
 * never stale.
 */
export async function startOrResumeDailyRun(localDate: string): Promise<HermesDailyRun> {
  const now = Date.now();
  const snapshot = await buildDailyQueueSnapshot(localDate, now);
  const itemIds = snapshot.items.map((item) => item.id);
  const nowIsoString = nowIso();

  const file = await updateHermesFile(filePath(), (current) => {
    const existing = current.dailyRuns[localDate];
    const run = existing
      ? refreshDailyRun(existing, { itemIds, summary: snapshot.summary }, nowIsoString)
      : buildDailyRun({ localDate, itemIds, summary: snapshot.summary }, nowIsoString);
    return { ...current, dailyRuns: { ...current.dailyRuns, [localDate]: run } };
  });
  return file.dailyRuns[localDate];
}

export async function refreshDailyQueue(localDate: string): Promise<HermesDailyRun> {
  const now = Date.now();
  const snapshot = await buildDailyQueueSnapshot(localDate, now);
  const itemIds = snapshot.items.map((item) => item.id);
  const nowIsoString = nowIso();

  const file = await updateHermesFile(filePath(), (current) => {
    const existing = current.dailyRuns[localDate];
    if (!existing) throw new UnknownDailyRunError();
    const run = refreshDailyRun(existing, { itemIds, summary: snapshot.summary }, nowIsoString);
    return { ...current, dailyRuns: { ...current.dailyRuns, [localDate]: run } };
  });
  return file.dailyRuns[localDate];
}

async function mutateDailyRun(
  localDate: string,
  mutate: (run: HermesDailyRun, now: string) => HermesDailyRun,
): Promise<HermesDailyRun> {
  const nowIsoString = nowIso();
  const file = await updateHermesFile(filePath(), (current) => {
    const existing = current.dailyRuns[localDate];
    if (!existing) throw new UnknownDailyRunError();
    const run = mutate(existing, nowIsoString);
    return { ...current, dailyRuns: { ...current.dailyRuns, [localDate]: run } };
  });
  return file.dailyRuns[localDate];
}

export async function selectItem(localDate: string, itemId: string): Promise<HermesDailyRun> {
  return mutateDailyRun(localDate, (run, now) => selectDailyRunItem(run, itemId, now));
}

export async function skipItem(localDate: string, itemId: string): Promise<HermesDailyRun> {
  return mutateDailyRun(localDate, (run, now) => skipDailyRunItem(run, itemId, now));
}

/** Snooze is skip's twin: same mechanics, different founder intent, no second clock. */
export const snoozeItem = skipItem;

export async function completeItem(localDate: string, itemId: string): Promise<HermesDailyRun> {
  return mutateDailyRun(localDate, (run, now) => advancePastDailyRunItem(run, itemId, now));
}

export { UnknownDailyRunItemError };

/* -------------------------------------------------------------------------- */
/* follow-up                                                                 */
/* -------------------------------------------------------------------------- */

export type PlanFollowUpInput = {
  missionId: string;
  leadId: string;
  reason: FollowUpReason;
  presetDays?: FollowUpPreset;
  note?: string;
};

export async function planFollowUp(input: PlanFollowUpInput): Promise<FollowUpRecord> {
  if (!isValidRecordId(input.missionId)) throw new InvalidRecordIdError();
  const leadId = await assertKnownLead(input.leadId);
  const now = nowIso();
  const followUpId = `followup:${input.missionId}`;

  const file = await updateHermesFile(filePath(), (current) => {
    if (!current.missions[input.missionId]) throw new UnknownMissionError();
    const existing = current.followUps[followUpId];
    const record = existing
      ? replanFollowUpRecord(existing, input.reason, now, input.presetDays)
      : buildFollowUpRecord({ ...input, leadId }, now);
    return { ...current, followUps: { ...current.followUps, [followUpId]: record } };
  });
  return file.followUps[followUpId];
}

/** Transitions the mission's follow-up to a founder-decided status (approve / dismiss / complete). */
export async function transitionFollowUp(
  missionId: string,
  to: "approved" | "dismissed" | "completed",
): Promise<FollowUpRecord> {
  if (!isValidRecordId(missionId)) throw new InvalidRecordIdError();
  const followUpId = `followup:${missionId}`;
  const now = nowIso();

  const file = await updateHermesFile(filePath(), (current) => {
    const existing = current.followUps[followUpId];
    if (!existing) throw new UnknownFollowUpError();
    const next = applyFollowUpStatusTransition(existing, to, now);
    return { ...current, followUps: { ...current.followUps, [followUpId]: next } };
  });
  return file.followUps[followUpId];
}

export async function listFollowUps(): Promise<FollowUpRecord[]> {
  const file = await readHermesFileOrEmpty(filePath());
  return Object.values(file.followUps).sort((a, b) => a.dueAt - b.dueAt);
}

/**
 * Marks a mission's active follow-up resolved, inside an already-open
 * `updateHermesFile` mutation. Pure — takes and returns a file, does no I/O
 * itself. Used so replying, scheduling a demo, or recording an outcome for a
 * mission closes the follow-up loop that was open for it, in the very same
 * write as the event that closed it.
 */
function supersedeActiveFollowUp(
  current: HermesRuntimeFile,
  missionId: string,
  now: string,
): HermesRuntimeFile {
  const followUpId = `followup:${missionId}`;
  const existing = current.followUps[followUpId];
  if (!existing || !isActiveFollowUpStatus(existing.status)) return current;
  const next = applyFollowUpStatusTransition(existing, "completed", now);
  return { ...current, followUps: { ...current.followUps, [followUpId]: next } };
}

/* -------------------------------------------------------------------------- */
/* sales outcome                                                             */
/* -------------------------------------------------------------------------- */

export async function recordOutcome(input: RecordOutcomeInput): Promise<SalesOutcomeRecord> {
  if (!isValidRecordId(input.missionId)) throw new InvalidRecordIdError();
  if (!isValidOutcomeUpdate(input)) throw new InvalidOutcomeUpdateError();
  const leadId = await assertKnownLead(input.leadId);
  const now = nowIso();
  const outcomeId = `outcome:${input.missionId}`;

  const file = await updateHermesFile(filePath(), (current) => {
    if (!current.missions[input.missionId]) throw new UnknownMissionError();
    const existing = current.salesOutcomes[outcomeId];
    const record = existing
      ? applyOutcomeStatusTransition(existing, { ...input, leadId }, now)
      : buildOutcomeRecord({ ...input, leadId }, now);
    const withOutcome: HermesRuntimeFile = {
      ...current,
      salesOutcomes: { ...current.salesOutcomes, [outcomeId]: record },
    };
    // Recording an outcome resolves whatever follow-up was open for this
    // mission — the sale is decided, there is nothing left to remind about.
    return supersedeActiveFollowUp(withOutcome, input.missionId, now);
  });
  return file.salesOutcomes[outcomeId];
}

export async function listOutcomes(): Promise<SalesOutcomeRecord[]> {
  const file = await readHermesFileOrEmpty(filePath());
  return Object.values(file.salesOutcomes).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/* -------------------------------------------------------------------------- */
/* approve current draft                                                     */
/* -------------------------------------------------------------------------- */

export type ApproveCurrentDraftInput = {
  missionId: string;
  leadId: string;
  currentMessage: string;
};

/**
 * Approves the copy on screen and, if the mission is still waiting at the
 * approval stage, advances it to `execution-ready`. `courierDraftStatus`
 * stays `draft` and `deliveryGatewayStatus` stays `missing` — deliberately,
 * so `isExternalSendAuthorized` can never read `true` out of this sprint's
 * code, whatever a caller passes. There is no send path here to authorize.
 */
export async function approveCurrentDraft(
  input: ApproveCurrentDraftInput,
): Promise<{ mission: HermesMissionRecord }> {
  if (!isValidRecordId(input.missionId)) throw new InvalidRecordIdError();
  const leadId = await assertKnownLead(input.leadId);
  const now = nowIso();

  await publishApprovalSnapshot({
    missionId: input.missionId,
    leadId,
    founderApprovalStatus: "approved",
    courierDraftStatus: "draft",
    deliveryGatewayStatus: "missing",
    approvedMessage: input.currentMessage,
    source: "mission_runtime",
  });

  const file = await updateHermesFile(filePath(), (current) => {
    const mission = current.missions[input.missionId];
    if (!mission) throw new UnknownMissionError();
    let next = mission;
    // `not-required` or `rejected` throw here, correctly: approving a mission
    // that never asked for approval — or already refused it — is a caller
    // bug, not a state this transaction should paper over.
    if (next.decisionState !== "approved") {
      next = applyMissionDecision(next, "approved", now);
    }
    if (next.stage === "approval") {
      next = applyMissionStageTransition(next, "execution-ready", "Founder onayladı", now);
    }
    if (next === mission) return current;
    return { ...current, missions: { ...current.missions, [input.missionId]: next } };
  });
  return { mission: file.missions[input.missionId] };
}

/* -------------------------------------------------------------------------- */
/* mark contacted — the one atomic "I sent it" transaction                   */
/* -------------------------------------------------------------------------- */

export type MarkContactedInput = {
  missionId: string;
  leadId: string;
  /** The exact copy the founder is confirming they sent. Bound to the stored approval hash. */
  currentMessage: string;
  /** Matches `LeadStatusUpdate.channel` exactly, so the mirror below never invents a fifth value. */
  channel: "whatsapp" | "phone" | "instagram" | "email";
  followUpPresetDays?: FollowUpPreset;
};

export type MarkContactedResult = {
  mission: HermesMissionRecord;
  followUp: FollowUpRecord;
};

/**
 * "WhatsApp'ta Aç" opens a link. This is the only action that means the
 * founder actually sent the message — and it is the one place a lead becomes
 * `contacted`, gets a follow-up, and gets a timeline entry, all in the same
 * pair of writes (Hermes runtime, then operational state). See section 13/14
 * of the sprint brief: exactly one clock computes `dueAt`
 * ({@link computeFollowUpDueAt} via `planFollowUp`'s callee), and the
 * timeline entry below reads that same instant rather than computing a
 * second one.
 */
export async function markContacted(input: MarkContactedInput): Promise<MarkContactedResult> {
  if (!isValidRecordId(input.missionId)) throw new InvalidRecordIdError();
  const leadId = await assertKnownLead(input.leadId);

  const resolution = await resolveMissionApprovalState({
    missionId: input.missionId,
    leadId,
    currentMessage: input.currentMessage,
  });
  if (!resolution.founderApproved) {
    throw new StaleApprovalError(resolution.blockingReasons);
  }

  const now = nowIso();
  const nowMs = Date.parse(now);
  const followUpId = `followup:${input.missionId}`;
  const deliveryId = `manual:${input.missionId}:${nowMs}`;

  const file = await updateHermesFile(filePath(), (current) => {
    const mission = current.missions[input.missionId];
    if (!mission) throw new UnknownMissionError();

    const delivery = normalizeDeliveryRecord(
      deliveryId,
      {
        status: "sent",
        rawStatus: "manual_confirmed",
        occurredAt: nowMs,
        missionId: input.missionId,
        leadId,
        createdAt: now,
        updatedAt: now,
        revision: 0,
      },
      now,
    );
    if (!delivery) throw new InvalidRecordIdError();

    const existingFollowUp = current.followUps[followUpId];
    const followUp =
      existingFollowUp && isActiveFollowUpStatus(existingFollowUp.status)
        ? existingFollowUp
        : buildFollowUpRecord(
            {
              missionId: input.missionId,
              leadId,
              reason: "manual",
              presetDays: input.followUpPresetDays ?? 1,
            },
            now,
          );

    return {
      ...current,
      deliveries: { ...current.deliveries, [deliveryId]: delivery },
      followUps: { ...current.followUps, [followUpId]: followUp },
    };
  });

  const followUp = file.followUps[followUpId];

  await patchLeadState(leadId, {
    workflow: {
      status: "contacted",
      channel: input.channel,
      contactedAt: nowMs,
      lastContactedAt: nowMs,
      nextFollowUpAt: followUp.dueAt,
    },
  });
  await appendLeadActivity(leadId, [
    {
      id: `contacted-${input.missionId}-${nowMs}`,
      type: "contacted",
      title: "Gönderdim olarak işaretlendi",
      detail: input.channel,
      createdAt: now,
      followUpAt: new Date(followUp.dueAt).toISOString(),
    },
  ]);

  return { mission: file.missions[input.missionId], followUp };
}

/* -------------------------------------------------------------------------- */
/* reply / demo — thin wrappers that also close the follow-up loop           */
/* -------------------------------------------------------------------------- */

export type RecordDailyLoopReplyInput = {
  replyId: string;
  missionId: string;
  leadId: string;
  intent?: string;
  urgency?: string;
  messageType?: string;
  textPreview?: string | null;
  occurredAt?: number;
};

export async function recordReplyForDailyLoop(
  input: RecordDailyLoopReplyInput,
): Promise<HermesRuntimeFile["replies"][string]> {
  if (!isValidRecordId(input.replyId)) throw new InvalidRecordIdError();
  if (!isValidRecordId(input.missionId)) throw new InvalidRecordIdError();
  const leadId = await assertKnownLead(input.leadId);
  const now = nowIso();

  const file = await updateHermesFile(filePath(), (current) => {
    if (!current.missions[input.missionId]) throw new UnknownMissionError();
    const previous = current.replies[input.replyId];
    const record = normalizeReplyRecord(
      input.replyId,
      {
        ...input,
        leadId,
        fromMasked: null,
        conversationIdSafe: null,
        contactProfileNameSafe: null,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
        revision: (previous?.revision ?? 0) + 1,
      },
      now,
    );
    if (!record) throw new InvalidRecordIdError();
    const withReply: HermesRuntimeFile = {
      ...current,
      replies: { ...current.replies, [input.replyId]: record },
    };
    return supersedeActiveFollowUp(withReply, input.missionId, now);
  });
  return file.replies[input.replyId];
}

export type PlanDemoInput = {
  demoId: string;
  missionId: string;
  leadId: string;
  status?: string;
  priority?: string;
  scheduledAt?: number | null;
  reason?: string;
};

export async function planDemoForDailyLoop(
  input: PlanDemoInput,
): Promise<HermesRuntimeFile["demos"][string]> {
  if (!isValidRecordId(input.demoId)) throw new InvalidRecordIdError();
  if (!isValidRecordId(input.missionId)) throw new InvalidRecordIdError();
  const leadId = await assertKnownLead(input.leadId);
  const now = nowIso();

  const file = await updateHermesFile(filePath(), (current) => {
    if (!current.missions[input.missionId]) throw new UnknownMissionError();
    const previous = current.demos[input.demoId];
    const record = normalizeDemoRecord(
      input.demoId,
      {
        ...previous,
        ...input,
        leadId,
        status: input.status ?? "scheduling_needed",
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
        revision: (previous?.revision ?? 0) + 1,
      },
      now,
    );
    if (!record) throw new InvalidRecordIdError();
    const withDemo: HermesRuntimeFile = {
      ...current,
      demos: { ...current.demos, [input.demoId]: record },
    };
    return supersedeActiveFollowUp(withDemo, input.missionId, now);
  });
  return file.demos[input.demoId];
}
