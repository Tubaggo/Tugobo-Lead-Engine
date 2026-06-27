import type { ScoredLead } from "@/app/lib/leads";
import {
  deriveOpportunityStage,
  OPPORTUNITY_STAGE_LABELS,
  OPPORTUNITY_STAGE_RANK,
  type OpportunityStage,
} from "./opportunity-stage";
import {
  computePipelineHealth,
  PIPELINE_HEALTH_META,
  type PipelineHealth,
} from "./pipeline-health";
import {
  computeSalesPriority,
  SALES_PRIORITY_LABELS,
  SALES_PRIORITY_RANK,
  SALES_PRIORITY_COLOR,
  type SalesPriority,
} from "./priority-engine";
import { computeNextBestAction, type NextBestAction } from "./next-best-action";
import { computeBlockers, type Blocker } from "./blocker-engine";
import { computeFounderInsight } from "./founder-insight";

export type {
  OpportunityStage,
  PipelineHealth,
  SalesPriority,
  NextBestAction,
  Blocker,
};

export {
  OPPORTUNITY_STAGE_LABELS,
  OPPORTUNITY_STAGE_RANK,
  PIPELINE_HEALTH_META,
  SALES_PRIORITY_LABELS,
  SALES_PRIORITY_RANK,
  SALES_PRIORITY_COLOR,
};

/** New timeline event types introduced by the Verified Opportunity Pipeline. */
export type VOTimelineEventType =
  | "stage_qualified"
  | "stage_verified"
  | "stage_contact_ready"
  | "stage_contacted"
  | "stage_replied"
  | "stage_demo_booked"
  | "stage_proposal_sent"
  | "stage_negotiation_started"
  | "stage_won"
  | "stage_lost";

export const VO_TIMELINE_EVENT_LABELS: Record<VOTimelineEventType, string> = {
  stage_qualified: "Uygun Bulundu",
  stage_verified: "Doğrulandı",
  stage_contact_ready: "İletişime Hazır",
  stage_contacted: "İletişime Geçildi",
  stage_replied: "Yanıt Alındı",
  stage_demo_booked: "Demo Planlandı",
  stage_proposal_sent: "Teklif Gönderildi",
  stage_negotiation_started: "Müzakere Başladı",
  stage_won: "Müşteri Oldu",
  stage_lost: "Kaybedildi",
};

export type VOTimelineEvent = {
  type: VOTimelineEventType;
  label: string;
  timestamp: string | null;
};

export type VerifiedOpportunity = {
  stage: OpportunityStage;
  stageLabel: string;
  confidenceScore: number;
  priority: SalesPriority;
  priorityLabel: string;
  health: PipelineHealth;
  healthLabel: string;
  healthColorClass: string;
  nextBestAction: NextBestAction;
  blockers: Blocker[];
  founderInsight: string;
  /** Reconstructed milestone timeline from available timestamps. */
  timelineEvents: VOTimelineEvent[];
};

const clamp100 = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Confidence Score (0–100) — distinct from leadScore, hotScore, and VOS.
 * Represents how likely this specific opportunity is to convert into a
 * customer based on channel verification, ICP fit, business maturity,
 * and enrichment quality.
 */
function computeConfidenceScore(lead: ScoredLead): number {
  const v = lead.signalVerification;
  let score = 0;

  // WhatsApp channel readiness (max 20)
  if (v?.whatsappVerification === "verified") score += 20;
  else if (v?.whatsappVerification === "likely") score += 12;
  else if (lead.phone) score += 5;

  // Website quality (max 15)
  if (v?.websiteVerification === "verified") score += 15;
  else if (v?.websiteVerification === "reachable") score += 8;
  else if (lead.hasOwnWebsite) score += 4;

  // Instagram presence (max 8)
  if (v?.instagramVerification === "verified") score += 8;
  else if (v?.instagramVerification === "likely") score += 5;
  else if (lead.hasInstagram) score += 2;

  // Direct booking readiness (max 15)
  if (v?.reservationSignal === "verified") score += 15;
  else if (v?.reservationSignal === "detected") score += 8;

  // ICP alignment (max 20)
  score += clamp100(lead.icpFitScore ?? 0) * 0.2;

  // Business size / maturity (max 10)
  const tier = lead.businessTier;
  if (tier === "enterprise" || tier === "premium") score += 10;
  else if (tier === "medium") score += 7;
  else if (tier === "small") score += 4;
  else score += 2;

  // Enrichment recency (max 7)
  if (lead.lastEnrichedAt) {
    const daysSince =
      (Date.now() - new Date(lead.lastEnrichedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince <= 7) score += 7;
    else if (daysSince <= 30) score += 4;
    else score += 1;
  }

  // Review activity recency (max 5)
  const daysLastReview = lead.daysSinceLastReview ?? 999;
  if (daysLastReview <= 3) score += 5;
  else if (daysLastReview <= 7) score += 3;
  else if (daysLastReview <= 14) score += 1;

  return clamp100(score);
}

/** Build a reconstructed milestone timeline from available lead timestamps. */
function buildTimelineEvents(
  lead: ScoredLead,
  stage: OpportunityStage,
): VOTimelineEvent[] {
  const events: VOTimelineEvent[] = [];
  const v = lead.signalVerification;

  // Qualification milestone
  if (OPPORTUNITY_STAGE_RANK[stage] >= OPPORTUNITY_STAGE_RANK.QUALIFIED) {
    const ts = lead.lastEnrichedAt ?? null;
    events.push({ type: "stage_qualified", label: VO_TIMELINE_EVENT_LABELS.stage_qualified, timestamp: ts });
  }

  // Verification milestone
  if (OPPORTUNITY_STAGE_RANK[stage] >= OPPORTUNITY_STAGE_RANK.VERIFIED) {
    const ts = v?.verifiedAt ?? lead.lastVerificationAt ?? null;
    events.push({ type: "stage_verified", label: VO_TIMELINE_EVENT_LABELS.stage_verified, timestamp: ts });
  }

  // Contact-ready milestone
  if (OPPORTUNITY_STAGE_RANK[stage] >= OPPORTUNITY_STAGE_RANK.CONTACT_READY) {
    events.push({
      type: "stage_contact_ready",
      label: VO_TIMELINE_EVENT_LABELS.stage_contact_ready,
      timestamp: v?.verifiedAt ?? null,
    });
  }

  // Contact milestone
  if (
    OPPORTUNITY_STAGE_RANK[stage] >= OPPORTUNITY_STAGE_RANK.CONTACTED &&
    typeof lead.lastContactedAt === "number" &&
    lead.lastContactedAt > 0
  ) {
    events.push({
      type: "stage_contacted",
      label: VO_TIMELINE_EVENT_LABELS.stage_contacted,
      timestamp: new Date(lead.lastContactedAt).toISOString(),
    });
  }

  // Advanced stage milestones derived from pipelineStage field
  const ps = (lead.pipelineStage ?? "").toLowerCase();
  if (stage === "REPLIED" || ps.includes("replied") || ps.includes("yanıt")) {
    events.push({ type: "stage_replied", label: VO_TIMELINE_EVENT_LABELS.stage_replied, timestamp: null });
  }
  if (stage === "DEMO_BOOKED" || ps.includes("demo")) {
    events.push({ type: "stage_demo_booked", label: VO_TIMELINE_EVENT_LABELS.stage_demo_booked, timestamp: null });
  }
  if (stage === "NEGOTIATION" || ps.includes("negotiation") || ps.includes("müzakere")) {
    events.push({ type: "stage_negotiation_started", label: VO_TIMELINE_EVENT_LABELS.stage_negotiation_started, timestamp: null });
  }
  if (stage === "CUSTOMER") {
    events.push({ type: "stage_won", label: VO_TIMELINE_EVENT_LABELS.stage_won, timestamp: null });
  }
  if (stage === "LOST") {
    events.push({ type: "stage_lost", label: VO_TIMELINE_EVENT_LABELS.stage_lost, timestamp: null });
  }

  return events;
}

/** Compute the full Verified Opportunity model for a lead (pure, no I/O). */
export function computeVerifiedOpportunity(lead: ScoredLead): VerifiedOpportunity {
  const stage = deriveOpportunityStage(lead);
  const confidenceScore = computeConfidenceScore(lead);
  const blockers = computeBlockers(lead);

  const daysSinceLastContact =
    typeof lead.lastContactedAt === "number" && lead.lastContactedAt > 0
      ? Math.round((Date.now() - lead.lastContactedAt) / (1000 * 60 * 60 * 24))
      : null;

  const health = computePipelineHealth({
    stage,
    daysSinceLastContact,
    contactAttempts: lead.contactAttempts ?? 0,
    verifiedOpportunityScore: lead.verifiedOpportunityScore ?? lead.leadScore ?? 0,
    blockerCount: blockers.length,
    doNotContact: lead.doNotContact ?? false,
  });

  const priority = computeSalesPriority({
    verifiedOpportunityScore: lead.verifiedOpportunityScore ?? lead.leadScore ?? 0,
    confidenceScore,
    icpFitScore: lead.icpFitScore ?? 0,
    stage,
    health,
    daysSinceLastContact,
    blockerCount: blockers.length,
  });

  const nextBestAction = computeNextBestAction({ lead, stage, health, priority });

  const founderInsight = computeFounderInsight({
    lead,
    stage,
    priority,
    health,
    nextBestAction,
    blockers,
    confidenceScore,
  });

  const timelineEvents = buildTimelineEvents(lead, stage);

  return {
    stage,
    stageLabel: OPPORTUNITY_STAGE_LABELS[stage],
    confidenceScore,
    priority,
    priorityLabel: SALES_PRIORITY_LABELS[priority],
    health,
    healthLabel: PIPELINE_HEALTH_META[health].tr,
    healthColorClass: PIPELINE_HEALTH_META[health].colorClass,
    nextBestAction,
    blockers,
    founderInsight,
    timelineEvents,
  };
}
