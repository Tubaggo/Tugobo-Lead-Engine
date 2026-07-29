import "server-only";

import { isKnownLead, UnknownLeadError } from "../operational-state/repository.ts";
import { getState } from "../operational-state/repository.ts";
import { isValidLeadId } from "../operational-state/lead-id.ts";
import { resolveHermesRuntimeFilePath } from "./env.ts";
import { hashApprovedMessage } from "./message-hash.ts";
import {
  applyMissionDecision,
  applyMissionFailure,
  applyMissionStageTransition,
  buildMissionRecord,
  type CreateMissionInput,
} from "./mission.ts";
import { readHermesFileOrEmpty, updateHermesFile } from "./store.ts";
import {
  isValidRecordId,
  nowIso,
  normalizeDemoRecord,
  normalizeDeliveryRecord,
  normalizeReplyRecord,
  type CourierDraftStatus,
  type DeliveryGatewayStatus,
  type DemoScheduleStatus,
  type FounderApprovalStatus,
  type HermesApprovalRecord,
  type HermesDeliveryRecord,
  type HermesDemoRecord,
  type HermesMissionRecord,
  type HermesReplyRecord,
  type HermesRuntimeFile,
  type MissionDecisionState,
  type MissionStage,
  type MissionStateSnapshotSource,
} from "./schema.ts";

/**
 * The Hermes runtime API used by route handlers.
 *
 * Same boundary discipline as `operational-state/repository.ts`: routes never
 * touch `fs` and never resolve a path. The storage location is decided in
 * exactly one place (`env.ts`), which itself defers to the operational store's
 * `resolveDataDir`.
 *
 * This module reads and writes state. It sends nothing, calls no provider, and
 * imports nothing that can.
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

export { UnknownLeadError };

function filePath(): string {
  return resolveHermesRuntimeFilePath();
}

export async function getHermesState(): Promise<HermesRuntimeFile> {
  return readHermesFileOrEmpty(filePath());
}

/* -------------------------------------------------------------------------- */
/* lead membership                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A mission may only name a lead the workspace actually knows.
 *
 * Two gates, both borrowed rather than rebuilt: `isValidLeadId` is the current
 * line's integrity validator (the one that stops a stringified `undefined` from
 * becoming a record key), and `isKnownLead` is the operational store's own
 * membership rule — roster, existing record, today's queue, or the seed
 * catalogue. A fresh workspace with nothing in it accepts any well-formed id,
 * exactly as `assertWritableLead` does, so the very first mission after the
 * very first import can still land.
 *
 * Deliberately a read of the *operational* store: mission state lives in its
 * own file, but the question "is this a real lead" has one answer and one
 * owner, and duplicating that judgement here is how the two files would start
 * disagreeing.
 */
async function assertKnownLead(leadId: unknown): Promise<string> {
  if (!isValidLeadId(leadId)) throw new UnknownLeadError();
  const operational = await getState();
  if (!isKnownLead(operational, leadId)) throw new UnknownLeadError();
  return leadId;
}

/* -------------------------------------------------------------------------- */
/* missions                                                                   */
/* -------------------------------------------------------------------------- */

export async function listMissions(): Promise<HermesMissionRecord[]> {
  const file = await getHermesState();
  return Object.values(file.missions).sort((a, b) =>
    a.createdAt === b.createdAt
      ? a.missionId.localeCompare(b.missionId)
      : a.createdAt.localeCompare(b.createdAt),
  );
}

export async function getMission(missionId: string): Promise<HermesMissionRecord | null> {
  const file = await getHermesState();
  return file.missions[missionId] ?? null;
}

/**
 * Creates a mission, or returns the existing one unchanged.
 *
 * Idempotent on `missionId`: a retried request is a no-op rather than a reset,
 * which matters because the caller that creates a mission is usually the one
 * that just crashed and is trying again.
 */
export async function createMission(
  input: CreateMissionInput,
): Promise<HermesMissionRecord> {
  if (!isValidRecordId(input.missionId)) throw new InvalidRecordIdError();
  const leadId = await assertKnownLead(input.leadId);

  const now = nowIso();
  const file = await updateHermesFile(filePath(), (current) => {
    if (current.missions[input.missionId]) return current;
    const record = buildMissionRecord({ ...input, leadId }, now);
    return {
      ...current,
      missions: { ...current.missions, [input.missionId]: record },
    };
  });
  return file.missions[input.missionId];
}

export async function transitionMission(
  missionId: string,
  to: MissionStage,
  reasonTr: string,
): Promise<HermesMissionRecord> {
  if (!isValidRecordId(missionId)) throw new InvalidRecordIdError();
  const now = nowIso();

  const file = await updateHermesFile(filePath(), (current) => {
    const record = current.missions[missionId];
    if (!record) throw new UnknownMissionError();
    const next = applyMissionStageTransition(record, to, reasonTr, now);
    return { ...current, missions: { ...current.missions, [missionId]: next } };
  });
  return file.missions[missionId];
}

export async function decideMission(
  missionId: string,
  to: MissionDecisionState,
): Promise<HermesMissionRecord> {
  if (!isValidRecordId(missionId)) throw new InvalidRecordIdError();
  const now = nowIso();

  const file = await updateHermesFile(filePath(), (current) => {
    const record = current.missions[missionId];
    if (!record) throw new UnknownMissionError();
    const next = applyMissionDecision(record, to, now);
    return { ...current, missions: { ...current.missions, [missionId]: next } };
  });
  return file.missions[missionId];
}

export async function failMission(
  missionId: string,
  code: string,
  messageTr: string,
): Promise<HermesMissionRecord> {
  if (!isValidRecordId(missionId)) throw new InvalidRecordIdError();
  const now = nowIso();

  const file = await updateHermesFile(filePath(), (current) => {
    const record = current.missions[missionId];
    if (!record) throw new UnknownMissionError();
    const next = applyMissionFailure(record, code, messageTr, now);
    return { ...current, missions: { ...current.missions, [missionId]: next } };
  });
  return file.missions[missionId];
}

/* -------------------------------------------------------------------------- */
/* approvals (durable mission state bridge)                                   */
/* -------------------------------------------------------------------------- */

/**
 * 10 minutes — the Hermes bridge's own TTL, ported unchanged.
 *
 * Long enough for a founder's working session, short enough that a snapshot
 * nobody refreshed never lingers as silent authority. Durability does not make
 * a stale approval safer, so the clock stays.
 */
export const APPROVAL_TTL_MS = 10 * 60 * 1000;

export type PublishApprovalInput = {
  missionId: string;
  leadId: string;
  founderApprovalStatus: FounderApprovalStatus;
  courierDraftStatus: CourierDraftStatus;
  deliveryGatewayStatus: DeliveryGatewayStatus;
  /** The exact copy being approved. Hashed on the way in; never stored raw. */
  approvedMessage?: string | null;
  source?: MissionStateSnapshotSource;
  now?: number;
};

/**
 * Records an approval snapshot. The latest publish for a mission always wins.
 *
 * The mission must already exist: an approval that names no mission is not a
 * weaker approval, it is a record with nothing to authorize.
 */
export async function publishApprovalSnapshot(
  input: PublishApprovalInput,
): Promise<HermesApprovalRecord> {
  if (!isValidRecordId(input.missionId)) throw new InvalidRecordIdError();
  const leadId = await assertKnownLead(input.leadId);
  const at = input.now ?? Date.now();

  const file = await updateHermesFile(filePath(), (current) => {
    if (!current.missions[input.missionId]) throw new UnknownMissionError();
    const previous = current.approvals[input.missionId];
    const record: HermesApprovalRecord = {
      missionId: input.missionId,
      leadId,
      founderApprovalStatus: input.founderApprovalStatus,
      courierDraftStatus: input.courierDraftStatus,
      deliveryGatewayStatus: input.deliveryGatewayStatus,
      messageHash:
        typeof input.approvedMessage === "string" && input.approvedMessage.trim().length > 0
          ? hashApprovedMessage(input.approvedMessage)
          : null,
      source: input.source ?? "workspace_snapshot",
      updatedAt: at,
      expiresAt: at + APPROVAL_TTL_MS,
      revision: (previous?.revision ?? 0) + 1,
    };
    return { ...current, approvals: { ...current.approvals, [input.missionId]: record } };
  });
  return file.approvals[input.missionId];
}

/**
 * The stored snapshot, or `null` when missing or expired.
 *
 * An expired record is *not* deleted here — a read must not write. It is
 * filtered, which is indistinguishable to every caller, and swept separately.
 */
export async function getApprovalSnapshot(
  missionId: string,
  now: number = Date.now(),
): Promise<HermesApprovalRecord | null> {
  const file = await getHermesState();
  const record = file.approvals[missionId];
  if (!record) return null;
  if (record.expiresAt <= now) return null;
  return record;
}

/** Removes expired snapshots. Returns how many went. Safe to call at any time. */
export async function sweepExpiredApprovals(now: number = Date.now()): Promise<number> {
  let cleared = 0;
  await updateHermesFile(filePath(), (current) => {
    const approvals: Record<string, HermesApprovalRecord> = {};
    for (const [missionId, record] of Object.entries(current.approvals)) {
      if (record.expiresAt <= now) {
        cleared += 1;
        continue;
      }
      approvals[missionId] = record;
    }
    if (cleared === 0) return current;
    return { ...current, approvals };
  });
  return cleared;
}

/* -------------------------------------------------------------------------- */
/* replies                                                                    */
/* -------------------------------------------------------------------------- */

export type RecordReplyInput = {
  replyId: string;
  providerMessageId?: string;
  fromMasked?: string | null;
  messageType?: string;
  textPreview?: string | null;
  occurredAt?: number;
  conversationIdSafe?: string | null;
  contactProfileNameSafe?: string | null;
  missionId?: string | null;
  leadId?: string | null;
  intent?: string;
  urgency?: string;
};

/**
 * Records one inbound reply.
 *
 * Milestone 1 stores what a listener *would* hand it; nothing here listens.
 * There is no webhook, no polling and no provider call anywhere in this
 * module's import graph — the record is created by an authenticated founder
 * action or a test, and that is the only way in until the webhook milestone.
 *
 * The payload is passed through `normalizeReplyRecord`, so the sender stays
 * masked and the preview stays capped whatever the caller sends.
 */
export async function recordReply(input: RecordReplyInput): Promise<HermesReplyRecord> {
  if (!isValidRecordId(input.replyId)) throw new InvalidRecordIdError();
  if (input.leadId !== null && input.leadId !== undefined) {
    await assertKnownLead(input.leadId);
  }

  const now = nowIso();
  const file = await updateHermesFile(filePath(), (current) => {
    if (input.missionId && !current.missions[input.missionId]) {
      throw new UnknownMissionError();
    }
    const previous = current.replies[input.replyId];
    const record = normalizeReplyRecord(
      input.replyId,
      {
        ...input,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
        revision: (previous?.revision ?? 0) + 1,
      },
      now,
    );
    if (!record) throw new InvalidRecordIdError();
    return { ...current, replies: { ...current.replies, [input.replyId]: record } };
  });
  return file.replies[input.replyId];
}

export async function listReplies(): Promise<HermesReplyRecord[]> {
  const file = await getHermesState();
  return Object.values(file.replies).sort((a, b) => b.occurredAt - a.occurredAt);
}

/* -------------------------------------------------------------------------- */
/* demos                                                                      */
/* -------------------------------------------------------------------------- */

export type RecordDemoInput = {
  demoId: string;
  missionId?: string | null;
  leadId?: string | null;
  sourceProviderMessageId?: string | null;
  sourceIntent?: string;
  status?: string;
  priority?: string;
  leadName?: string | null;
  suggestedAction?: string;
  reason?: string;
  scheduledAt?: number | null;
};

export async function recordDemo(input: RecordDemoInput): Promise<HermesDemoRecord> {
  if (!isValidRecordId(input.demoId)) throw new InvalidRecordIdError();
  if (input.leadId !== null && input.leadId !== undefined) {
    await assertKnownLead(input.leadId);
  }

  const now = nowIso();
  const file = await updateHermesFile(filePath(), (current) => {
    if (input.missionId && !current.missions[input.missionId]) {
      throw new UnknownMissionError();
    }
    const previous = current.demos[input.demoId];
    const record = normalizeDemoRecord(
      input.demoId,
      {
        ...previous,
        ...input,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
        revision: (previous?.revision ?? 0) + 1,
      },
      now,
    );
    if (!record) throw new InvalidRecordIdError();
    return { ...current, demos: { ...current.demos, [input.demoId]: record } };
  });
  return file.demos[input.demoId];
}

/**
 * Moves a demo to a founder-decided status.
 *
 * The Hermes line's rule is preserved exactly: `scheduled` / `completed` /
 * `cancelled` / `no_show` are only ever reached through an explicit call like
 * this one — never derived, never automatic. The timestamps are stamped here so
 * a client cannot backdate a demo it did not attend.
 */
export async function updateDemoStatus(
  demoId: string,
  status: DemoScheduleStatus,
  at: number = Date.now(),
): Promise<HermesDemoRecord> {
  if (!isValidRecordId(demoId)) throw new InvalidRecordIdError();
  const now = nowIso();

  const file = await updateHermesFile(filePath(), (current) => {
    const previous = current.demos[demoId];
    if (!previous) throw new InvalidRecordIdError();
    const record: HermesDemoRecord = {
      ...previous,
      status,
      scheduledAt: status === "scheduled" ? at : previous.scheduledAt,
      completedAt: status === "completed" ? at : previous.completedAt,
      cancelledAt:
        status === "cancelled" || status === "no_show" ? at : previous.cancelledAt,
      updatedAt: now,
      revision: previous.revision + 1,
    };
    return { ...current, demos: { ...current.demos, [demoId]: record } };
  });
  return file.demos[demoId];
}

export async function listDemos(): Promise<HermesDemoRecord[]> {
  const file = await getHermesState();
  return Object.values(file.demos).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/* -------------------------------------------------------------------------- */
/* deliveries                                                                 */
/* -------------------------------------------------------------------------- */

export type RecordDeliveryInput = {
  providerMessageId: string;
  status?: string;
  rawStatus?: string;
  occurredAt?: number;
  missionId?: string | null;
  leadId?: string | null;
};

/**
 * Records one delivery receipt.
 *
 * Milestone 1 stores receipts; it does not receive them. No webhook exists on
 * this branch and none is added here — this is the durable shape a later
 * webhook milestone will write into, proven to survive a restart before
 * anything external is allowed to depend on it.
 */
export async function recordDelivery(
  input: RecordDeliveryInput,
): Promise<HermesDeliveryRecord> {
  if (!isValidRecordId(input.providerMessageId)) throw new InvalidRecordIdError();
  if (input.leadId !== null && input.leadId !== undefined) {
    await assertKnownLead(input.leadId);
  }

  const now = nowIso();
  const file = await updateHermesFile(filePath(), (current) => {
    if (input.missionId && !current.missions[input.missionId]) {
      throw new UnknownMissionError();
    }
    const previous = current.deliveries[input.providerMessageId];
    const record = normalizeDeliveryRecord(
      input.providerMessageId,
      {
        ...previous,
        ...input,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
        revision: (previous?.revision ?? 0) + 1,
      },
      now,
    );
    if (!record) throw new InvalidRecordIdError();
    return {
      ...current,
      deliveries: { ...current.deliveries, [input.providerMessageId]: record },
    };
  });
  return file.deliveries[input.providerMessageId];
}

export async function listDeliveries(): Promise<HermesDeliveryRecord[]> {
  const file = await getHermesState();
  return Object.values(file.deliveries).sort((a, b) => b.occurredAt - a.occurredAt);
}
