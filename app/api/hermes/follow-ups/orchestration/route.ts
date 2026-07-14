import { NextResponse } from "next/server";
import { runFollowUpOrchestration } from "@/app/lib/hermes-follow-up-orchestration-service";
import {
  getActiveFollowUpOrchestrationDecisions,
  getRecentFollowUpOrchestrationDecisions,
  type StoredFollowUpOrchestrationView,
} from "@/app/lib/hermes-follow-up-orchestration-registry";
import {
  FOLLOW_UP_ORCH_STATE_LABELS_TR,
  FOLLOW_UP_TRIGGER_LABELS_TR,
  summarizeFollowUpOrchestration,
} from "@/app/lib/hermes-autonomous-follow-up-orchestrator";

/**
 * Hermes Follow-up Orchestration — sanitize edilmiş takip planı okuması
 * (Sprint C5). GET-only, yan etkisi yalnız orchestration snapshot'ını
 * tazelemektir (mesaj göndermez, onay üretmez).
 *
 * Read/evaluate-on-fetch: her okuma mevcut aday + güncel sinyalleri yeniden
 * değerlendirir ve orchestration registry'sini tazeler. Client HİÇBİR şey
 * gönderemez: policy override yok, dueAt override yok, gönderim/onay yok —
 * route body/query okumaz. Bu route hiçbir gönderim/onay çalışma katmanını
 * import etmez.
 *
 * Payload'da asla: secret, API key, ham telefon, ham mesaj metni, provider
 * yanıtı. `followUpCandidateId` bir iç kimliktir; founder katmanı onu
 * göstermez ama status API'si için gereklidir.
 */

function toWire(view: StoredFollowUpOrchestrationView) {
  const d = view.decision;
  return {
    followUpCandidateId: d.followUpCandidateId,
    leadId: d.leadId,
    missionId: d.missionId,
    businessName: view.businessName,
    state: d.state,
    stateLabelTr: FOLLOW_UP_ORCH_STATE_LABELS_TR[d.state],
    trigger: d.trigger,
    triggerLabelTr: FOLLOW_UP_TRIGGER_LABELS_TR[d.trigger],
    priority: d.priority,
    dueAt: d.dueAt,
    overdueByMinutes: d.overdueByMinutes,
    channelStrategy: d.channelStrategy,
    draftNeeded: d.draftNeeded,
    approvalRequired: d.approvalRequired,
    founderActionRequired: d.founderActionRequired,
    founderActionLabelTr: d.founderActionLabelTr,
    whatHappenedTr: d.whatHappenedTr,
    whyItMattersTr: d.whyItMattersTr,
    hermesRecommendationTr: d.hermesRecommendationTr,
    suggestedTimingTr: d.suggestedTimingTr,
    cancellationReasonTr: d.cancellationReasonTr,
    blockedReasonsTr: d.blockedReasonsTr,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

export async function GET() {
  // Salt-okuma projeksiyonu da güncel kalsın diye değerlendirme + persist.
  runFollowUpOrchestration({ persist: true });

  const recent = getRecentFollowUpOrchestrationDecisions(50);
  const active = getActiveFollowUpOrchestrationDecisions(50);
  const summary = summarizeFollowUpOrchestration(recent.map((s) => s.decision));

  return NextResponse.json({
    recentFollowUps: recent.map(toWire),
    activeFollowUps: active.map(toWire),
    summary,
  });
}
