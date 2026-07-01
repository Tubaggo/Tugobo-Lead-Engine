import type { Blocker, BlockerKey } from "@/lib/verified-opportunity/blocker-engine";
import type { NextBestAction, ActionKey } from "@/lib/verified-opportunity/next-best-action";
import type {
  AutomationQueueType,
  AutomationStatus,
} from "@/app/components/v2/adapters/automation-center-adapter";
import type { RiskLevel } from "@/app/components/v2/adapters/revenue-risk-adapter";
import type { RecoveryLevel } from "@/app/components/v2/adapters/revenue-recovery-adapter";
import type { ExecutionState, RecommendedActionKey, ExecutionReason } from "./types";

export const ACTION_LABELS: Record<RecommendedActionKey, string> = {
  verify_contact: "Kişiyi Doğrula",
  re_enrich: "Yeniden Zenginleştir",
  call: "Bugün Ara",
  whatsapp: "WhatsApp Gönder",
  follow_up: "Takip Et",
  book_demo: "Demo Ayarla",
  prepare_proposal: "Teklif Hazırla",
  close_opportunity: "Satışı Kapat",
  recover: "Kurtarma Aksiyonu Al",
  ai_review: "AI İncelemesi Çalıştır",
  wait: "Yanıt Bekle",
  no_action: "Aksiyon Gerekmiyor",
};

const BLOCKER_SEVERITY_RANK: Record<Blocker["severity"], number> = {
  critical: 3,
  major: 2,
  minor: 1,
};

const BLOCKER_ACTION: Record<BlockerKey, RecommendedActionKey> = {
  no_website: "re_enrich",
  no_whatsapp: "verify_contact",
  no_booking_engine: "re_enrich",
  weak_instagram: "re_enrich",
  low_review_count: "re_enrich",
  unknown_contact: "verify_contact",
  outdated_enrichment: "re_enrich",
  no_response: "follow_up",
  do_not_contact: "no_action",
};

const NBA_ACTION_MAP: Record<ActionKey, RecommendedActionKey> = {
  call_today: "call",
  send_whatsapp: "whatsapp",
  reenrich_website: "re_enrich",
  verify_contact: "verify_contact",
  book_demo: "book_demo",
  wait_for_reply: "wait",
  follow_up_tomorrow: "follow_up",
  prepare_proposal: "prepare_proposal",
  close_opportunity: "close_opportunity",
  lost_follow_up: "no_action",
};

const AUTOMATION_QUEUE_ACTION: Record<AutomationQueueType, RecommendedActionKey> = {
  "re-enrich": "re_enrich",
  "website-scan": "re_enrich",
  "contact-finder": "verify_contact",
  "whatsapp-verify": "verify_contact",
  "ai-review": "ai_review",
  "follow-up": "follow_up",
  "daily-outreach": "whatsapp",
};

/**
 * Exactly one action is ever selected. Precedence (per state):
 *   blocked  -> resolve the highest-severity open blocker
 *   waiting  -> wait (an absence of action is a real, visible value)
 *   scheduled -> the already-committed future follow-up
 *   ready    -> overdue follow-up > risk mitigation > automation readiness
 *               > the existing Next-Best-Action engine's own recommendation
 *   completed/dormant -> no_action
 */
export function computeRecommendedAction(input: {
  state: ExecutionState;
  blockers: Blocker[];
  isFollowUpOverdue: boolean;
  riskLevel: RiskLevel;
  recoveryLevel: RecoveryLevel;
  automation: { status: AutomationStatus; primaryQueue: AutomationQueueType } | null;
  nextBestAction: NextBestAction;
}): { action: RecommendedActionKey; label: string; reason: string; reasons: ExecutionReason[] } {
  if (input.state === "completed" || input.state === "dormant") {
    const message =
      input.state === "completed" ? "Fırsat bu döngü için sonuçlandı" : "Aktif bir sinyal yok";
    return {
      action: "no_action",
      label: ACTION_LABELS.no_action,
      reason: message,
      reasons: [{ source: "opportunity", message, judgement: "recommendedAction" }],
    };
  }

  if (input.state === "blocked") {
    const worst = [...input.blockers].sort(
      (a, b) => BLOCKER_SEVERITY_RANK[b.severity] - BLOCKER_SEVERITY_RANK[a.severity],
    )[0];
    const action = worst ? BLOCKER_ACTION[worst.key] : "re_enrich";
    const reason = worst
      ? `Engel çözülmeden ilerlenemez: ${worst.label}`
      : "Otomasyon katmanı engellendi olarak işaretledi";
    return {
      action,
      label: ACTION_LABELS[action],
      reason,
      reasons: [
        { source: "blocker", message: reason, severity: worst?.severity, judgement: "recommendedAction" },
      ],
    };
  }

  if (input.state === "waiting") {
    return {
      action: "wait",
      label: ACTION_LABELS.wait,
      reason: input.nextBestAction.reason,
      reasons: [{ source: "follow-up", message: input.nextBestAction.reason, judgement: "recommendedAction" }],
    };
  }

  if (input.state === "scheduled") {
    const reason = "Takip gelecek tarihe planlandı — o tarihe kadar bekleyin";
    return {
      action: "follow_up",
      label: ACTION_LABELS.follow_up,
      reason,
      reasons: [{ source: "follow-up", message: reason, judgement: "recommendedAction" }],
    };
  }

  // state === "ready" — deterministic precedence cascade
  if (input.isFollowUpOverdue) {
    const reason = "Gecikmiş takibi önce kapatın";
    return {
      action: "follow_up",
      label: ACTION_LABELS.follow_up,
      reason,
      reasons: [{ source: "follow-up", message: reason, severity: "major", judgement: "recommendedAction" }],
    };
  }

  if ((input.riskLevel === "critical" || input.riskLevel === "high") && input.recoveryLevel !== "lost") {
    const reason = `Risk seviyesi ${input.riskLevel} — risk altındaki geliri kurtarmak için harekete geçin`;
    return {
      action: "recover",
      label: ACTION_LABELS.recover,
      reason,
      reasons: [
        {
          source: "risk",
          message: reason,
          severity: input.riskLevel === "critical" ? "critical" : "major",
          judgement: "recommendedAction",
        },
      ],
    };
  }

  if (input.automation && input.automation.status === "ready") {
    const action = AUTOMATION_QUEUE_ACTION[input.automation.primaryQueue];
    const reason = `Otomasyon kuyruğundaki bir sonraki adımı tamamlayın (${input.automation.primaryQueue})`;
    return {
      action,
      label: ACTION_LABELS[action],
      reason,
      reasons: [{ source: "automation", message: reason, judgement: "recommendedAction" }],
    };
  }

  // Fallback — the existing Next-Best-Action engine already reasoned about this lead.
  const action = NBA_ACTION_MAP[input.nextBestAction.action];
  return {
    action,
    label: ACTION_LABELS[action],
    reason: input.nextBestAction.reason,
    reasons: [{ source: "opportunity", message: input.nextBestAction.reason, judgement: "recommendedAction" }],
  };
}
