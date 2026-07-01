import type { ScoredLead } from "@/app/lib/leads";
import { computeVerifiedOpportunity } from "@/lib/verified-opportunity/verified-opportunity";
import {
  adaptScoredLeadsToRecoveryCards,
  type RecoveryCard,
} from "@/app/components/v2/adapters/revenue-recovery-adapter";
import {
  adaptScoredLeadsToAutomationCards,
  type AutomationCard,
} from "@/app/components/v2/adapters/automation-center-adapter";
import { computeExecutionPriority } from "./priority";
import { computeExecutionState } from "./state";
import { computeRecommendedAction } from "./actions";
import { computeOperationalMomentum } from "./momentum";
import { computeExecutionConfidence } from "./confidence";
import type { ExecutionContext, ExecutionReason } from "./types";

/**
 * Builds one ExecutionContext per lead in the pool. Runs the batch adapters
 * once (not per-lead) and looks each lead up by id, rather than re-running
 * a full-pool adapter inside a per-lead loop.
 */
export function buildExecutionContexts(leads: ScoredLead[]): ExecutionContext[] {
  const now = Date.now();

  const recoveryById = new Map<string, RecoveryCard>(
    adaptScoredLeadsToRecoveryCards(leads).map((c) => [c.id, c]),
  );
  const automationById = new Map<string, AutomationCard>(
    adaptScoredLeadsToAutomationCards(leads).map((c) => [c.id, c]),
  );

  return leads.map((lead) =>
    buildExecutionContext(lead, recoveryById.get(lead.id) ?? null, automationById.get(lead.id) ?? null, now),
  );
}

/**
 * Builds the ExecutionContext for a single lead. `recovery`/`automation` are
 * optional because their source adapters can legitimately omit a lead
 * (e.g. `priorityBucket === "archive"` is filtered out of the risk/recovery
 * pipeline; a lead with zero automation queue membership has nothing to
 * automate). Missing entries fall back to neutral, non-alarming values
 * rather than inventing a score the runtime has no basis for.
 */
export function buildExecutionContext(
  lead: ScoredLead,
  recovery: RecoveryCard | null,
  automation: AutomationCard | null,
  now: number = Date.now(),
): ExecutionContext {
  const vo = computeVerifiedOpportunity(lead);

  const riskLevel = recovery?.riskLevel ?? "low";
  const recoveryLevel = recovery?.recoveryLevel ?? "lost";
  const nextFollowUpAtMs = recovery?.nextFollowUpAtMs ?? lead.nextFollowUpAt ?? null;
  const isFollowUpOverdue =
    recovery?.isFollowUpOverdue ?? (nextFollowUpAtMs !== null && nextFollowUpAtMs < now);
  const contactAttempts = recovery?.contactAttempts ?? lead.contactAttempts ?? 0;
  const lastContactedAtMs = recovery?.lastContactedAtMs ?? lead.lastContactedAt ?? null;

  const priorityResult = computeExecutionPriority({
    salesPriority: vo.priority,
    riskLevel,
    recoveryLevel,
  });

  const stateResult = computeExecutionState({
    doNotContact: Boolean(lead.doNotContact),
    stage: vo.stage,
    blockers: vo.blockers,
    automationStatus: automation?.status ?? null,
    isFollowUpOverdue,
    nextFollowUpAtMs,
    contactAttempts,
    now,
  });

  const actionResult = computeRecommendedAction({
    state: stateResult.state,
    blockers: vo.blockers,
    isFollowUpOverdue,
    riskLevel,
    recoveryLevel,
    automation: automation ? { status: automation.status, primaryQueue: automation.primaryQueue } : null,
    nextBestAction: vo.nextBestAction,
  });

  const momentumResult = computeOperationalMomentum({
    health: vo.health,
    stage: vo.stage,
    isFollowUpOverdue,
    riskLevel,
    recoveryLevel,
    contactAttempts,
    lastContactedAtMs,
    now,
  });

  const confidenceResult = computeExecutionConfidence({
    confidenceScoreRaw: vo.confidenceScore,
    blockers: vo.blockers,
    riskLevel,
    health: vo.health,
  });

  const blockerReasons: ExecutionReason[] = vo.blockers.map((b) => ({
    source: "blocker",
    message: b.label,
    severity: b.severity,
  }));

  const reasons: ExecutionReason[] = [
    ...priorityResult.reasons,
    ...stateResult.reasons,
    ...actionResult.reasons,
    ...momentumResult.reasons,
    ...confidenceResult.reasons,
    ...blockerReasons,
  ];

  return {
    leadId: lead.id,
    hotelName: lead.name,
    city: lead.city,
    hotelType: lead.type,
    generatedAt: now,
    facts: {
      commercial: {
        opportunityScore:
          recovery?.opportunityScore ??
          Math.round(lead.verifiedOpportunityScore ?? lead.opportunityScore ?? lead.leadScore ?? 0),
        icpScore: recovery?.icpScore ?? Math.round(lead.icpFitScore ?? 0),
        baseMrr: recovery?.baseMrr ?? 0,
        weightedMrr: recovery?.weightedMrr ?? 0,
        forecastContribution: recovery?.forecastContribution ?? 0,
        stageProbability: recovery?.stageProbability ?? 0,
      },
      risk: {
        riskScore: recovery?.riskScore ?? 0,
        riskLevel,
        riskRevenue: recovery?.riskRevenue ?? 0,
      },
      recovery: {
        recoveryScore: recovery?.recoveryScore ?? 0,
        recoveryLevel,
        recoveryRevenue: recovery?.recoveryRevenue ?? 0,
      },
      pipeline: {
        stage: vo.stage,
        stageLabel: vo.stageLabel,
        health: vo.health,
        healthLabel: vo.healthLabel,
      },
      contact: {
        contactAttempts,
        lastContactedAtMs,
        nextFollowUpAtMs,
        isFollowUpOverdue,
        doNotContact: Boolean(lead.doNotContact),
      },
      automation: automation
        ? { status: automation.status, primaryQueue: automation.primaryQueue, reason: automation.reason }
        : null,
      blockers: vo.blockers,
      nextBestActionRaw: vo.nextBestAction,
      confidenceScoreRaw: vo.confidenceScore,
    },
    judgements: {
      priority: priorityResult.priority,
      executionState: stateResult.state,
      recommendedAction: {
        action: actionResult.action,
        label: actionResult.label,
        reason: actionResult.reason,
      },
      operationalMomentum: momentumResult.momentum,
      executionConfidence: confidenceResult.confidence,
      reasons,
    },
  };
}
