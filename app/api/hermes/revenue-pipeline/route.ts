import { NextResponse } from "next/server";
import { runRevenuePipeline } from "@/app/lib/hermes-revenue-pipeline-service";
import {
  REVENUE_HEALTH_LABELS_TR,
  REVENUE_STAGE_LABELS_TR,
  type RevenuePipelineItem,
} from "@/app/lib/hermes-revenue-pipeline-runtime";

/**
 * Hermes Revenue Pipeline Intelligence — sanitize edilmiş okuma (Sprint C6).
 * GET-only, yan etkisiz (read-time aggregation).
 *
 * Client HİÇBİR şey gönderemez: aşama/won-lost/MRR/policy/risk eşiği override
 * yok, sahte gelir enjeksiyonu yok. Yalnız `activeOnly` ve `limit` query'leri
 * okunur, ikisi de katı doğrulanır. Bu route hiçbir mutation/gönderim/onay
 * çalışma katmanını import etmez.
 *
 * Payload'da asla: ham telefon, ham mesaj, provider yanıtı, token, secret,
 * ham webhook verisi. `missionId` iç kimliktir; founder katmanı göstermez.
 */

function toWire(item: RevenuePipelineItem) {
  return {
    leadId: item.leadId,
    missionId: item.missionId,
    title: item.title,
    stage: item.stage,
    stageLabelTr: REVENUE_STAGE_LABELS_TR[item.stage],
    health: item.health,
    healthLabelTr: REVENUE_HEALTH_LABELS_TR[item.health],
    priority: item.priority,
    currentStateLabelTr: item.currentStateLabelTr,
    revenueSignalLabelTr: item.revenueSignalLabelTr,
    estimatedMrr: item.estimatedMrr,
    estimatedArr: item.estimatedArr,
    realizedMrr: item.realizedMrr,
    realizedArr: item.realizedArr,
    potentialMrr: item.potentialMrr,
    riskedMrr: item.riskedMrr,
    lostMrr: item.lostMrr,
    ageInStageHours: item.ageInStageHours,
    lastActivityAt: item.lastActivityAt,
    riskReasonsTr: item.riskReasonsTr,
    positiveSignalsTr: item.positiveSignalsTr,
    whatHappenedTr: item.whatHappenedTr,
    whyItMattersTr: item.whyItMattersTr,
    hermesRecommendationTr: item.hermesRecommendationTr,
    founderNextActionTr: item.founderNextActionTr,
    founderActionRequired: item.founderActionRequired,
    founderActionLabelTr: item.founderActionLabelTr,
    closed: item.closed,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const activeOnly = url.searchParams.get("activeOnly") === "true";

  let limit: number | undefined;
  const limitParam = url.searchParams.get("limit");
  if (limitParam !== null) {
    const parsed = Number.parseInt(limitParam, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return NextResponse.json({ error: "Geçersiz limit." }, { status: 400 });
    }
    limit = parsed;
  }

  const result = runRevenuePipeline({ activeOnly, limit });

  return NextResponse.json({
    items: result.items.map(toWire),
    summary: result.summary,
    updatedAt: result.updatedAt,
  });
}
