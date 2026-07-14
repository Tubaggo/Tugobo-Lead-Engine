import { NextResponse } from "next/server";
import {
  getOpenConversationDecisions,
  getRecentConversationDecisions,
} from "@/app/lib/hermes-conversation-registry";
import {
  CONVERSATION_NEXT_ACTION_LABELS_TR,
  CONVERSATION_PRIORITY_LABELS_TR,
  CONVERSATION_STATE_LABELS_TR,
  summarizeConversationDecisions,
  type ConversationDecision,
} from "@/app/lib/hermes-autonomous-conversation-runtime";
import type { StoredConversationView } from "@/app/lib/hermes-conversation-registry";

/**
 * Hermes Autonomous Conversation — sanitize edilmiş konuşma okuması
 * (Sprint C4). GET-only, yan etkisiz.
 *
 * Client bu route üzerinden HİÇBİR şey gönderemez: mesaj gönderimi yok,
 * founder onayı yok, intent/state/founderApproved/sendAllowed override yok,
 * ham mesaj enjeksiyonu yok — route body/query okumaz. Kesin kurallar
 * yapısal olarak sağlanır: bu route hiçbir gönderim/onay çalışma katmanını
 * import etmez.
 *
 * Payload'da asla: secret, API key, ham telefon, provider yanıtı, ham webhook
 * verisi, ham mesaj gövdesi. `providerMessageIdSafe` founder katmanına
 * ulaşmaz — bu route onu dışarı vermez. Etiketler Türkçe founder cümleleridir.
 */

function toWireResult(view: StoredConversationView) {
  const d: ConversationDecision = view.decision;
  return {
    leadId: d.leadId,
    missionId: d.missionId,
    businessName: view.businessName,
    state: d.state,
    stateLabelTr: CONVERSATION_STATE_LABELS_TR[d.state],
    priority: d.priority,
    priorityLabelTr: CONVERSATION_PRIORITY_LABELS_TR[d.priority],
    replyPreviewSafe: d.replyPreviewSafe,
    whatHappenedTr: d.whatHappenedTr,
    whyItMattersTr: d.whyItMattersTr,
    hermesRecommendationTr: d.hermesRecommendationTr,
    nextAction: d.nextAction,
    nextActionLabelTr: CONVERSATION_NEXT_ACTION_LABELS_TR[d.nextAction],
    founderActionRequired: d.founderActionRequired,
    founderActionLabelTr: d.founderActionLabelTr,
    replyDraftNeeded: d.replyDraftNeeded,
    approvalRequired: d.approvalRequired,
    demoSchedulingNeeded: d.demoSchedulingNeeded,
    callSchedulingNeeded: d.callSchedulingNeeded,
    followUpNeeded: d.followUpNeeded,
    conversationClosed: d.conversationClosed,
    createdAt: d.createdAt,
  };
}

export async function GET() {
  const recent = getRecentConversationDecisions(50);
  const open = getOpenConversationDecisions(50);
  const summary = summarizeConversationDecisions(recent.map((s) => s.decision));

  return NextResponse.json({
    recentConversations: recent.map(toWireResult),
    openConversations: open.map(toWireResult),
    summary,
  });
}
