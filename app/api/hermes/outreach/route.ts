import { NextResponse } from "next/server";
import { getRecentOutreachDecisions } from "@/app/lib/hermes-outreach-registry";
import {
  OUTREACH_CHANNEL_LABELS_TR,
  OUTREACH_LANGUAGE_LABELS_TR,
  OUTREACH_LENGTH_LABELS_TR,
  OUTREACH_NEXT_ACTION_LABELS_TR,
  OUTREACH_STATUS_LABELS_TR,
  OUTREACH_TEMPLATE_LABELS_TR,
  OUTREACH_TONE_LABELS_TR,
  summarizeOutreach,
} from "@/app/lib/hermes-autonomous-outreach-runtime";

/**
 * Hermes Autonomous Outreach — sanitize edilmiş hazırlık okuması
 * (Sprint C3). GET-only, yan etkisiz.
 *
 * Client bu route üzerinden HİÇBİR şey gönderemez: mesaj gönderimi yok,
 * founder onayı yok, kanal/threshold override yok — route body/query okumaz.
 * Kesin kurallar yapısal olarak sağlanır: bu route hiçbir gönderim/onay
 * runtime'ını import etmez.
 *
 * Payload'da asla: secret, API key, ham telefon, provider yanıtı, ham mesaj
 * metni. `recommendedTemplate` bir template anahtarıdır; etiketler Türkçe
 * founder cümleleridir — ham enum founder katmanına hiç ulaşmaz.
 */
export async function GET() {
  const stored = getRecentOutreachDecisions(50);
  const summary = summarizeOutreach(stored.map((s) => s.decision));

  return NextResponse.json({
    results: stored.map((s) => ({
      leadId: s.decision.leadId,
      businessName: s.businessName,
      status: s.decision.status,
      statusLabelTr: OUTREACH_STATUS_LABELS_TR[s.decision.status],
      channel: s.decision.recommendedChannel,
      channelLabelTr: OUTREACH_CHANNEL_LABELS_TR[s.decision.recommendedChannel],
      templateLabelTr: OUTREACH_TEMPLATE_LABELS_TR[s.decision.recommendedTemplate],
      languageLabelTr: OUTREACH_LANGUAGE_LABELS_TR[s.decision.recommendedLanguage],
      toneLabelTr: OUTREACH_TONE_LABELS_TR[s.decision.recommendedTone],
      lengthLabelTr: OUTREACH_LENGTH_LABELS_TR[s.decision.recommendedLength],
      personalizationSignalsTr: s.decision.personalizationSignals.map((p) => p.labelTr),
      founderSummaryTr: s.decision.founderSummary,
      hermesRecommendationTr: s.decision.hermesRecommendation,
      nextActionLabelTr: OUTREACH_NEXT_ACTION_LABELS_TR[s.decision.nextAction],
      approvalNeeded: s.decision.approvalNeeded,
      draftNeeded: s.decision.draftNeeded,
      createdAt: s.decision.createdAt,
    })),
    summary,
  });
}
