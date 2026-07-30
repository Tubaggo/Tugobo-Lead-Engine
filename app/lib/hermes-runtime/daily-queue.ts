/**
 * The one canonical daily action queue.
 *
 * v3.8.1 — Hermes Daily Loop Wiring.
 *
 * This is a decoration layer over `action-stage.ts`'s `computeActionQueue`,
 * not a second ranking system. The rank, the stage, the tie-break — all of it
 * comes straight from the existing ladder, unmodified. What this module adds
 * is exactly the three things the ladder does not carry: which follow-ups
 * count as "due" right now (the ladder only sees an already-filtered active
 * list), the founder-facing "why today" reasons, and whether there is
 * ready-to-send copy. None of that changes ordering.
 *
 * Pure: no React, no I/O, no `server-only`.
 */

import {
  actionStageOf,
  ACTION_STAGE_LABELS,
  ACTION_STAGE_RANK,
  computeActionQueue,
  SUGGESTED_ACTION_LABELS,
  type ActionStage,
} from "./action-stage.ts";
import {
  computeMessageReadiness,
  type MessageReadiness,
} from "./message-readiness.ts";
import { deriveFounderActionReasons, type FounderActionReason } from "./reason.ts";
import { isActiveFollowUpStatus } from "./follow-up.ts";
import {
  computeLeadPreparation,
  type LeadPreparationAssessment,
  type LeadPreparationRosterInput,
} from "./lead-preparation.ts";
import type {
  FollowUpRecord,
  HermesDeliveryRecord,
  HermesDemoRecord,
  HermesMissionRecord,
  HermesReplyRecord,
  SalesOutcomeRecord,
} from "./schema.ts";
import type { LeadMessageWorkspaceState } from "../outreach/workspace.ts";

export type HermesDailyActionItem = {
  /** Equal to `missionId` — the join key `HermesDailyRun.itemIds` stores. */
  id: string;
  leadId: string;
  missionId: string;
  hotelName: string;
  actionState: ActionStage;
  stageLabel: string;
  rank: number;
  recommendedAction: string;
  reasonCodes: FounderActionReason[];
  messageReadiness: MessageReadiness;
  /**
   * The full "is this lead ready, and why not" answer (v3.8.2). `messageReadiness`
   * above is kept exactly as v3.8.1 shipped it — a backward-compatible, coarser
   * signal existing consumers already read — this is the detailed breakdown a
   * Guided Preparation surface renders from.
   */
  preparation: LeadPreparationAssessment;
  /** ISO instant, or `null` when no follow-up is bound to this item. */
  dueAt: string | null;
  updatedAt: string;
};

export type LeadQueueContext = {
  hasWhatsAppChannel: boolean;
  workspace?: LeadMessageWorkspaceState;
  icpFitScore?: number | null;
  verifiedOpportunityScore?: number | null;
  whatsappConfidence?: string | null;
  /** Everything else `lead-preparation.ts` needs — canonical roster fields only, never Contact-Finder localStorage. */
  preparation: LeadPreparationRosterInput;
};

export type ComputeDailyQueueInput = {
  missions: readonly HermesMissionRecord[];
  replies?: readonly HermesReplyRecord[];
  demos?: readonly HermesDemoRecord[];
  deliveries?: readonly HermesDeliveryRecord[];
  followUps?: readonly FollowUpRecord[];
  salesOutcomes?: readonly SalesOutcomeRecord[];
  /** Reads lead-scoped context (channel, draft, scoring signals). Never mutates, never calls out. */
  leadLookup?: (leadId: string) => LeadQueueContext | undefined;
  /** Epoch ms. Defaults to `Date.now()`; a test always supplies it explicitly. */
  now?: number;
  /** Start of the *client's* local calendar day, epoch ms — never derived from server time. */
  startOfLocalDayMs: number;
};

export function computeHermesDailyActionItems(
  input: ComputeDailyQueueInput,
): HermesDailyActionItem[] {
  const now = input.now ?? Date.now();
  const replies = input.replies ?? [];
  const demos = input.demos ?? [];
  const deliveries = input.deliveries ?? [];
  const followUps = input.followUps ?? [];
  const salesOutcomes = input.salesOutcomes ?? [];

  // Only a follow-up that is both active (still needs a founder decision) and
  // actually due right now is allowed to surface as `follow_up_required` in
  // the ladder — a follow-up scheduled for next week must not jump the queue
  // the moment it is planned. `action-stage.ts` itself is untouched: this is
  // the projection choosing what to feed it, not a new precedence rule.
  const dueFollowUps = followUps.filter(
    (f) => isActiveFollowUpStatus(f.status) && f.dueAt <= now,
  );

  const queue = computeActionQueue(input.missions, {
    replies,
    demos,
    deliveries,
    followUps: dueFollowUps.map((f) => ({ missionId: f.missionId, status: f.status })),
    salesOutcomes: salesOutcomes.map((o) => ({ missionId: o.missionId, status: o.status })),
  });

  const missionById = new Map(input.missions.map((m) => [m.missionId, m]));
  // At most one follow-up record per mission (`followUpId = followup:<missionId>`),
  // so this lookup is unambiguous regardless of due-ness — used for reason
  // evidence and the `dueAt` field even when the follow-up has not surfaced
  // in the ladder yet.
  const followUpByMission = new Map(followUps.map((f) => [f.missionId, f]));

  return queue.map((entry) => {
    const mission = missionById.get(entry.missionId);
    const followUp = followUpByMission.get(entry.missionId) ?? null;
    const context = input.leadLookup?.(entry.leadId);

    const messageReadiness = computeMessageReadiness({
      actionStage: entry.stage,
      hasWhatsAppChannel: context?.hasWhatsAppChannel ?? false,
      workspace: context?.workspace,
    });

    const reasonCodes = deriveFounderActionReasons({
      entry: { missionId: entry.missionId, leadId: entry.leadId, stage: entry.stage },
      followUp,
      messageReadiness,
      leadSignals: context
        ? {
            icpFitScore: context.icpFitScore,
            verifiedOpportunityScore: context.verifiedOpportunityScore,
            whatsappConfidence: context.whatsappConfidence,
          }
        : undefined,
      startOfLocalDayMs: input.startOfLocalDayMs,
    });

    const preparation = computeLeadPreparation({
      leadId: entry.leadId,
      lead: context?.preparation ?? {},
      workspace: context?.workspace,
    });

    return {
      id: entry.missionId,
      leadId: entry.leadId,
      missionId: entry.missionId,
      hotelName: entry.hotelName,
      actionState: entry.stage,
      stageLabel: ACTION_STAGE_LABELS[entry.stage],
      rank: ACTION_STAGE_RANK[entry.stage],
      recommendedAction: SUGGESTED_ACTION_LABELS[entry.stage],
      reasonCodes,
      messageReadiness,
      preparation,
      dueAt: followUp ? new Date(followUp.dueAt).toISOString() : null,
      updatedAt: mission?.updatedAt ?? new Date(now).toISOString(),
    };
  });
}

export type DailyQueueSummary = {
  scanned: number;
  actionable: number;
  waitingFounder: number;
  followUpDue: number;
  replyAttention: number;
  demoPending: number;
  completed: number;
};

/**
 * Deterministic counters for `HermesDailyRun.summary` and the workspace's
 * observability strip (section 20). Every count reads a real `actionState`
 * value — nothing is estimated.
 */
export function summarizeDailyQueue(items: readonly HermesDailyActionItem[]): DailyQueueSummary {
  const summary: DailyQueueSummary = {
    scanned: items.length,
    actionable: 0,
    waitingFounder: 0,
    followUpDue: 0,
    replyAttention: 0,
    demoPending: 0,
    completed: 0,
  };

  for (const item of items) {
    switch (item.actionState) {
      case "won":
      case "lost":
        summary.completed += 1;
        break;
      case "approval_required":
        summary.waitingFounder += 1;
        summary.actionable += 1;
        break;
      case "follow_up_required":
        summary.followUpDue += 1;
        summary.actionable += 1;
        break;
      case "reply_received":
      case "reply_needs_review":
      case "hot_reply":
        summary.replyAttention += 1;
        summary.actionable += 1;
        break;
      case "demo_pending":
        summary.demoPending += 1;
        summary.actionable += 1;
        break;
      case "outcome_required":
      case "failed":
        summary.actionable += 1;
        break;
      default:
        break;
    }
  }

  return summary;
}

export { actionStageOf };
