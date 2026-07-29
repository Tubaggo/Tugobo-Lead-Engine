/**
 * "Neden bugün?" — the founder-facing reason model for a daily queue item.
 *
 * v3.8.1 — Hermes Daily Loop Wiring.
 *
 * No such structured reason type exists anywhere in the Hermes line: `main`'s
 * closest equivalents are `SUGGESTED_ACTION_LABELS` (one fixed string per
 * `ActionStage`, in `action-stage.ts`) and `RevenuePipelineItem`'s free-text
 * `riskReasonsTr`/`whyItMattersTr` fields — neither is a typed, evidence-bound
 * code list, so this module is new rather than ported. Every reason is
 * derived from state the daily-queue projection already holds; nothing here
 * invents a signal or calls a provider.
 *
 * Pure: no React, no I/O, no `server-only`.
 */

import type { ActionQueueEntry } from "./action-stage.ts";
import type { FollowUpRecord } from "./schema.ts";
import type { MessageReadiness } from "./message-readiness.ts";

export type FounderActionReasonCode =
  | "DELIVERY_FAILED"
  | "HOT_REPLY"
  | "DEMO_PENDING"
  | "FOLLOW_UP_OVERDUE"
  | "FOLLOW_UP_DUE_TODAY"
  | "OUTCOME_REQUIRED"
  | "APPROVAL_REQUIRED"
  | "MESSAGE_READY"
  | "NEEDS_RESEARCH"
  | "VERIFIED_WHATSAPP"
  | "HIGH_ICP"
  | "HIGH_OPPORTUNITY";

export type FounderActionReason = {
  code: FounderActionReasonCode;
  /** Lower = more important. The primary (stage-driven) reason is always 0. */
  priority: number;
  explanationTr: string;
  /** Grounded pointers into the records this reason was read from — never invented text. */
  evidenceRefs: string[];
};

const EXPLANATION_TR: Record<FounderActionReasonCode, string> = {
  DELIVERY_FAILED: "Mesaj teslim edilemedi — tekrar denenmeli",
  HOT_REPLY: "Sıcak bir cevap geldi — hemen aksiyon gerekiyor",
  DEMO_PENDING: "Demo planlaması bekliyor",
  FOLLOW_UP_OVERDUE: "Planlanan takip tarihi geçti",
  FOLLOW_UP_DUE_TODAY: "Takip bugün planlandı",
  OUTCOME_REQUIRED: "Demo/takip sonrası satış sonucu girilmedi",
  APPROVAL_REQUIRED: "Taslak founder onayı bekliyor",
  MESSAGE_READY: "Mesaj hazır — gönderilebilir",
  NEEDS_RESEARCH: "Mesaj için önce araştırma/zenginleştirme gerekiyor",
  VERIFIED_WHATSAPP: "WhatsApp numarası doğrulanmış",
  HIGH_ICP: "TUGOBO hedef profiline yüksek uyum",
  HIGH_OPPORTUNITY: "Doğrulanmış fırsat skoru yüksek",
};

/** Same "high" cutoff `opportunity-scoring.ts` uses for its own `high` tier. */
const HIGH_OPPORTUNITY_THRESHOLD = 75;
/** `icpFitScore` has no tiering of its own; 70/100 is the "strong fit" reading used here only. */
const HIGH_ICP_THRESHOLD = 70;

export type LeadReasonSignals = {
  icpFitScore?: number | null;
  verifiedOpportunityScore?: number | null;
  whatsappConfidence?: string | null;
};

export type DeriveReasonsInput = {
  entry: Pick<ActionQueueEntry, "missionId" | "leadId" | "stage">;
  followUp?: FollowUpRecord | null;
  messageReadiness: MessageReadiness;
  leadSignals?: LeadReasonSignals;
  /** Epoch ms "now", for the overdue-vs-due-today split. Defaults to `Date.now()`. */
  now?: number;
  /** Start of the local calendar day, epoch ms. Required to tell "today" from "overdue". */
  startOfLocalDayMs: number;
};

function primaryReason(input: DeriveReasonsInput): FounderActionReason | null {
  const { entry, followUp, messageReadiness, startOfLocalDayMs } = input;

  switch (entry.stage) {
    case "failed":
      return {
        code: "DELIVERY_FAILED",
        priority: 0,
        explanationTr: EXPLANATION_TR.DELIVERY_FAILED,
        evidenceRefs: [`mission:${entry.missionId}#delivery`],
      };
    case "hot_reply":
      return {
        code: "HOT_REPLY",
        priority: 0,
        explanationTr: EXPLANATION_TR.HOT_REPLY,
        evidenceRefs: [`mission:${entry.missionId}#reply`],
      };
    case "demo_pending":
      return {
        code: "DEMO_PENDING",
        priority: 0,
        explanationTr: EXPLANATION_TR.DEMO_PENDING,
        evidenceRefs: [`mission:${entry.missionId}#demo`],
      };
    case "follow_up_required": {
      const overdue = followUp ? followUp.dueAt < startOfLocalDayMs : false;
      return {
        code: overdue ? "FOLLOW_UP_OVERDUE" : "FOLLOW_UP_DUE_TODAY",
        priority: 0,
        explanationTr: overdue
          ? EXPLANATION_TR.FOLLOW_UP_OVERDUE
          : EXPLANATION_TR.FOLLOW_UP_DUE_TODAY,
        evidenceRefs: followUp ? [`followUp:${followUp.followUpId}`] : [`mission:${entry.missionId}#followUp`],
      };
    }
    case "outcome_required":
      return {
        code: "OUTCOME_REQUIRED",
        priority: 0,
        explanationTr: EXPLANATION_TR.OUTCOME_REQUIRED,
        evidenceRefs: [`mission:${entry.missionId}#outcome`],
      };
    case "approval_required":
      return {
        code: "APPROVAL_REQUIRED",
        priority: 0,
        explanationTr: EXPLANATION_TR.APPROVAL_REQUIRED,
        evidenceRefs: [`mission:${entry.missionId}#approval`],
      };
    default:
      // reply_needs_review / reply_received / read / delivered / sent / ready /
      // won / lost / unknown all fall through to message readiness — the
      // stage itself already carries a label via `SUGGESTED_ACTION_LABELS`,
      // so the reason model's job here is narrower: is there copy to send?
      if (messageReadiness === "ready") {
        return {
          code: "MESSAGE_READY",
          priority: 0,
          explanationTr: EXPLANATION_TR.MESSAGE_READY,
          evidenceRefs: [`mission:${entry.missionId}#messageWorkspace`],
        };
      }
      if (messageReadiness === "needs_research") {
        return {
          code: "NEEDS_RESEARCH",
          priority: 0,
          explanationTr: EXPLANATION_TR.NEEDS_RESEARCH,
          evidenceRefs: [`mission:${entry.missionId}#messageWorkspace`],
        };
      }
      return null;
  }
}

/**
 * Every reason for one queue item, primary first, deterministic order.
 *
 * Supporting signals (verified WhatsApp, high ICP fit, high verified
 * opportunity) are appended only when the caller supplies them and only once
 * each — `leadSignals` is read straight through, not re-derived, so this
 * function cannot disagree with whatever scored the lead.
 */
export function deriveFounderActionReasons(input: DeriveReasonsInput): FounderActionReason[] {
  const reasons: FounderActionReason[] = [];
  const primary = primaryReason(input);
  if (primary) reasons.push(primary);

  const signals = input.leadSignals;
  if (signals?.whatsappConfidence === "confirmed") {
    reasons.push({
      code: "VERIFIED_WHATSAPP",
      priority: reasons.length,
      explanationTr: EXPLANATION_TR.VERIFIED_WHATSAPP,
      evidenceRefs: [`lead:${input.entry.leadId}#whatsappConfidence`],
    });
  }
  if (
    typeof signals?.icpFitScore === "number" &&
    signals.icpFitScore >= HIGH_ICP_THRESHOLD
  ) {
    reasons.push({
      code: "HIGH_ICP",
      priority: reasons.length,
      explanationTr: EXPLANATION_TR.HIGH_ICP,
      evidenceRefs: [`lead:${input.entry.leadId}#icpFitScore`],
    });
  }
  if (
    typeof signals?.verifiedOpportunityScore === "number" &&
    signals.verifiedOpportunityScore >= HIGH_OPPORTUNITY_THRESHOLD
  ) {
    reasons.push({
      code: "HIGH_OPPORTUNITY",
      priority: reasons.length,
      explanationTr: EXPLANATION_TR.HIGH_OPPORTUNITY,
      evidenceRefs: [`lead:${input.entry.leadId}#verifiedOpportunityScore`],
    });
  }

  return reasons;
}
