/**
 * The Hermes mission state machine.
 *
 * v3.8.0 — Hermes Durable Mission Runtime, Milestone 1.
 *
 * The Hermes line has the stage *vocabulary* and the stage *ladder*
 * (`MISSION_STAGE_PROGRESS`, a monotonically increasing 10→100 scale) but no
 * explicit transition guard: on that line a mission is recomputed from shadow
 * tasks on every render, so an illegal stage change was not representable and
 * therefore never needed rejecting. A durable mission *is* mutated in place, so
 * the ladder has to become a rule rather than a coincidence.
 *
 * The rule is read straight out of the ported ladder — nothing new is invented:
 * a mission advances forward along `MISSION_STAGE_ORDER` and never moves back.
 * `completed` is terminal.
 *
 * Pure: no React, no I/O, no `server-only`. Runs in the repository and under
 * `node --test`.
 */

import {
  MISSION_STAGE_LABELS,
  MISSION_STAGE_ORDER,
  MISSION_STAGE_PROGRESS,
  type HermesMissionRecord,
  type HermesTimelineEntry,
  type MissionDecisionState,
  type MissionStage,
} from "./schema.ts";

export class InvalidMissionTransitionError extends Error {
  readonly from: MissionStage;
  readonly to: MissionStage;
  constructor(from: MissionStage, to: MissionStage) {
    super(`illegal mission transition: ${from} → ${to}`);
    this.name = "InvalidMissionTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function missionStageIndex(stage: MissionStage): number {
  return MISSION_STAGE_ORDER.indexOf(stage);
}

/**
 * Whether `to` is a legal next stage for `from`.
 *
 * Forward-only and strictly increasing. A same-stage "transition" is rejected
 * too: re-declaring the current stage is a no-op the caller should not be
 * sending, and silently accepting it would burn a revision and write a
 * meaningless timeline line.
 */
export function canTransitionMissionStage(from: MissionStage, to: MissionStage): boolean {
  if (from === "completed") return false;
  return missionStageIndex(to) > missionStageIndex(from);
}

/**
 * Which stage a mission would naturally advance to next.
 *
 * Used by callers that want "move it along" without naming a target. Returns
 * `null` at the end of the ladder.
 */
export function nextMissionStage(from: MissionStage): MissionStage | null {
  const index = missionStageIndex(from);
  if (index < 0 || index >= MISSION_STAGE_ORDER.length - 1) return null;
  return MISSION_STAGE_ORDER[index + 1];
}

/**
 * Decision-state transitions.
 *
 * `not-required` → `pending` is how a mission that reaches the approval stage
 * starts asking. `pending` → `approved` / `rejected` is the founder's call.
 * A decided mission cannot silently return to `pending`: re-opening a decision
 * has to be a new mission-level event, not a quiet overwrite of the record that
 * authorized an outbound action.
 */
const ALLOWED_DECISION_TRANSITIONS: Record<MissionDecisionState, readonly MissionDecisionState[]> = {
  "not-required": ["pending"],
  pending: ["approved", "rejected"],
  approved: [],
  rejected: [],
};

export function canTransitionDecisionState(
  from: MissionDecisionState,
  to: MissionDecisionState,
): boolean {
  return ALLOWED_DECISION_TRANSITIONS[from].includes(to);
}

export class InvalidDecisionTransitionError extends Error {
  readonly from: MissionDecisionState;
  readonly to: MissionDecisionState;
  constructor(from: MissionDecisionState, to: MissionDecisionState) {
    super(`illegal decision transition: ${from} → ${to}`);
    this.name = "InvalidDecisionTransitionError";
    this.from = from;
    this.to = to;
  }
}

/* -------------------------------------------------------------------------- */
/* construction + transition                                                  */
/* -------------------------------------------------------------------------- */

export type CreateMissionInput = {
  missionId: string;
  leadId: string;
  hotelName?: string;
  status?: string;
  stage?: MissionStage;
  approvalRequired?: boolean;
  primaryTaskId?: string;
  tasks?: { id: string; taskType: string }[];
};

function timelineEntry(at: number, actorLabel: string, text: string): HermesTimelineEntry {
  return { at, actorLabel, text };
}

export function buildMissionRecord(
  input: CreateMissionInput,
  nowIsoString: string,
): HermesMissionRecord {
  const stage: MissionStage = input.stage ?? "discover";
  const at = Date.parse(nowIsoString);

  return {
    missionId: input.missionId,
    leadId: input.leadId,
    hotelName: input.hotelName ?? "",
    stage,
    stageLabel: MISSION_STAGE_LABELS[stage],
    progress: MISSION_STAGE_PROGRESS[stage],
    status: input.status ?? MISSION_STAGE_LABELS[stage],
    // A mission that starts at the approval stage is already asking; anything
    // earlier is not. Derived rather than defaulted so the two fields cannot
    // disagree the moment the record is born.
    decisionState: stage === "approval" ? "pending" : "not-required",
    approvalRequired: input.approvalRequired ?? true,
    primaryTaskId: input.primaryTaskId ?? "",
    tasks: input.tasks ?? [],
    timeline: [timelineEntry(at, "Hermes", `Görev oluşturuldu — ${MISSION_STAGE_LABELS[stage]}`)],
    lastTransition: null,
    failure: null,
    createdAt: nowIsoString,
    updatedAt: nowIsoString,
    revision: 0,
  };
}

/**
 * Advances a mission one or more rungs up the ladder.
 *
 * Throws rather than returning a result union: an illegal transition is a
 * caller bug, not a state the founder can be in, and the route turns it into a
 * 409 with a Turkish message. Reaching the approval stage flips
 * `decisionState` to `pending` in the same write, so a mission can never sit at
 * `approval` while claiming no decision is required.
 */
export function applyMissionStageTransition(
  record: HermesMissionRecord,
  to: MissionStage,
  reasonTr: string,
  nowIsoString: string,
): HermesMissionRecord {
  if (!canTransitionMissionStage(record.stage, to)) {
    throw new InvalidMissionTransitionError(record.stage, to);
  }

  const at = Date.parse(nowIsoString);
  const decisionState: MissionDecisionState =
    to === "approval" && record.decisionState === "not-required"
      ? "pending"
      : record.decisionState;

  return {
    ...record,
    stage: to,
    stageLabel: MISSION_STAGE_LABELS[to],
    progress: MISSION_STAGE_PROGRESS[to],
    status: MISSION_STAGE_LABELS[to],
    decisionState,
    lastTransition: { from: record.stage, to, at, reasonTr },
    // A mission that moved forward is no longer failing. Cleared explicitly so
    // a stale failure cannot keep a recovered mission looking broken.
    failure: null,
    timeline: [
      ...record.timeline,
      timelineEntry(
        at,
        "Hermes",
        `${MISSION_STAGE_LABELS[record.stage]} → ${MISSION_STAGE_LABELS[to]}`,
      ),
    ],
    updatedAt: nowIsoString,
    revision: record.revision + 1,
  };
}

export function applyMissionDecision(
  record: HermesMissionRecord,
  to: MissionDecisionState,
  nowIsoString: string,
): HermesMissionRecord {
  if (!canTransitionDecisionState(record.decisionState, to)) {
    throw new InvalidDecisionTransitionError(record.decisionState, to);
  }

  const at = Date.parse(nowIsoString);
  const label =
    to === "approved" ? "Founder onayladı" : to === "rejected" ? "Founder reddetti" : "Onay bekleniyor";

  return {
    ...record,
    decisionState: to,
    timeline: [...record.timeline, timelineEntry(at, "Founder", label)],
    updatedAt: nowIsoString,
    revision: record.revision + 1,
  };
}

export function applyMissionFailure(
  record: HermesMissionRecord,
  code: string,
  messageTr: string,
  nowIsoString: string,
): HermesMissionRecord {
  const at = Date.parse(nowIsoString);
  return {
    ...record,
    failure: { code, messageTr, at },
    timeline: [...record.timeline, timelineEntry(at, "Hermes", `Hata: ${messageTr}`)],
    updatedAt: nowIsoString,
    revision: record.revision + 1,
  };
}
