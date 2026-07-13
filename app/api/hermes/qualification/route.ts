import { NextResponse } from "next/server";
import { getRecentQualificationResults } from "@/app/lib/hermes-qualification-registry";
import {
  QUALIFICATION_CONFIDENCE_LABELS_TR,
  QUALIFICATION_NEXT_ACTION_LABELS_TR,
  QUALIFICATION_REASON_LABELS_TR,
  QUALIFICATION_STATUS_LABELS_TR,
  summarizeQualificationResults,
} from "@/app/lib/hermes-autonomous-qualification-runtime";

/**
 * Hermes Autonomous Qualification — sanitize edilmiş durum okuması
 * (Sprint C2 — Scope 8). GET-only, yan etkisiz.
 *
 * Client bu route üzerinden HİÇBİR şey gönderemez: threshold yok, founder
 * onayı yok, gönderim izni yok, policy override yok — route body/query
 * okumaz. Kesin kurallar yapısal olarak sağlanır.
 *
 * Payload'da asla: secret, API key, ham telefon, provider yanıtı, website
 * HTML'i. Reason'lar Türkçe founder cümleleri olarak döner — ham enum
 * founder katmanına hiç ulaşmaz.
 */
export async function GET() {
  const stored = getRecentQualificationResults(50);
  const summary = summarizeQualificationResults(stored.map((s) => s.result));

  return NextResponse.json({
    results: stored.map((s) => ({
      leadId: s.result.leadId,
      businessName: s.businessName,
      status: s.result.status,
      statusLabelTr: QUALIFICATION_STATUS_LABELS_TR[s.result.status],
      confidenceLabelTr: QUALIFICATION_CONFIDENCE_LABELS_TR[s.result.confidence],
      priority: s.result.priority,
      scoreSnapshot: s.result.scoreSnapshot,
      positiveReasonsTr: s.result.positiveReasons.map((c) => QUALIFICATION_REASON_LABELS_TR[c]),
      cautionReasonsTr: s.result.cautionReasons.map((c) => QUALIFICATION_REASON_LABELS_TR[c]),
      founderSummaryTr: s.result.founderSummaryTr,
      hermesRecommendationTr: s.result.hermesRecommendationTr,
      nextActionLabelTr: QUALIFICATION_NEXT_ACTION_LABELS_TR[s.result.nextAction],
      eligibleForMission: s.result.eligibleForMission,
      eligibleForOutreachDraft: s.result.eligibleForOutreachDraft,
      requiresFounderReview: s.result.requiresFounderReview,
      evaluatedAt: s.result.evaluatedAt,
    })),
    summary,
  });
}
