import type { OpportunityStage } from "@/lib/verified-opportunity/opportunity-stage";
import type { Blocker } from "@/lib/verified-opportunity/blocker-engine";
import type { AutomationStatus } from "@/app/components/v2/adapters/automation-center-adapter";
import type { ExecutionState, ExecutionReason } from "./types";

/**
 * Execution State answers "can the founder act on this right now" — a
 * question fully independent of Priority. Rules are evaluated in order,
 * first match wins, so every state is explainable as "because X was true"
 * rather than the output of a blended score.
 */
export function computeExecutionState(input: {
  doNotContact: boolean;
  stage: OpportunityStage;
  blockers: Blocker[];
  automationStatus: AutomationStatus | null;
  isFollowUpOverdue: boolean;
  nextFollowUpAtMs: number | null;
  contactAttempts: number;
  now: number;
}): { state: ExecutionState; reasons: ExecutionReason[] } {
  if (input.doNotContact) {
    return {
      state: "completed",
      reasons: [
        {
          source: "follow-up",
          message: "İletişim engeli (DNC) aktif",
          severity: "critical",
          judgement: "executionState",
        },
      ],
    };
  }

  if (input.stage === "CUSTOMER") {
    return {
      state: "completed",
      reasons: [{ source: "opportunity", message: "Fırsat kazanıldı (müşteri)", judgement: "executionState" }],
    };
  }

  if (input.stage === "LOST") {
    return {
      state: "completed",
      reasons: [{ source: "opportunity", message: "Fırsat kaybedildi", judgement: "executionState" }],
    };
  }

  const criticalBlocker = input.blockers.find((b) => b.severity === "critical");
  if (criticalBlocker || input.automationStatus === "blocked") {
    return {
      state: "blocked",
      reasons: [
        {
          source: "blocker",
          message: criticalBlocker
            ? `Yapısal engel: ${criticalBlocker.label}`
            : "Otomasyon katmanı bu lead'i engellendi olarak işaretledi",
          severity: "critical",
          judgement: "executionState",
        },
      ],
    };
  }

  if (input.isFollowUpOverdue) {
    return {
      state: "ready",
      reasons: [
        {
          source: "follow-up",
          message: "Planlanan takip tarihi geçti",
          severity: "major",
          judgement: "executionState",
        },
      ],
    };
  }

  if (input.automationStatus === "ready" || input.automationStatus === "overdue") {
    return {
      state: "ready",
      reasons: [
        {
          source: "automation",
          message: "Otomasyon kuyruğunda aksiyon alınabilir durumda",
          judgement: "executionState",
        },
      ],
    };
  }

  if (input.nextFollowUpAtMs !== null && input.nextFollowUpAtMs > input.now) {
    return {
      state: "scheduled",
      reasons: [{ source: "follow-up", message: "Gelecek tarihli takip planlandı", judgement: "executionState" }],
    };
  }

  if (
    input.contactAttempts > 0 &&
    input.stage === "CONTACTED" &&
    input.nextFollowUpAtMs === null
  ) {
    return {
      state: "waiting",
      reasons: [
        { source: "follow-up", message: "İletişime geçildi — yanıt bekleniyor", judgement: "executionState" },
      ],
    };
  }

  // Any stage past raw discovery still represents an open, actionable opportunity
  // even when no blocker/automation/follow-up signal fired above.
  if (input.stage !== "DISCOVERED") {
    return {
      state: "ready",
      reasons: [
        { source: "opportunity", message: `Aşama (${input.stage}) aktif ilerleme için uygun`, judgement: "executionState" },
      ],
    };
  }

  return {
    state: "dormant",
    reasons: [{ source: "opportunity", message: "Şu an için aktif bir aksiyon sinyali yok", judgement: "executionState" }],
  };
}
