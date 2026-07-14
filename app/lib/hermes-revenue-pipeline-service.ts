import { getRecentSalesOutcomeItems } from "./sales-outcome-registry.ts";
import { getRecentDemoScheduleItems } from "./demo-scheduling-registry.ts";
import { getRecentFollowUpCandidates } from "./follow-up-registry.ts";
import { getRecentFollowUpOrchestrationDecisions } from "./hermes-follow-up-orchestration-registry.ts";
import { getRecentConversationDecisions } from "./hermes-conversation-registry.ts";
import { getRecentOutreachDecisions } from "./hermes-outreach-registry.ts";
import { getRecentQualificationResults } from "./hermes-qualification-registry.ts";
import { getRecentProcessedReceipts } from "./whatsapp-delivery-receipt-processor.ts";
import { getRecentWhatsAppReplies } from "./whatsapp-reply-registry.ts";
import {
  evaluateRevenuePipelineItem,
  summarizeRevenuePipeline,
  sortRevenuePipeline,
  isActiveRevenueItem,
  type RevenueDeliveryReceiptLike,
  type RevenuePipelineItem,
  type RevenuePipelineSummary,
} from "./hermes-revenue-pipeline-runtime.ts";
import { defaultRevenuePipelinePolicy, type HermesRevenuePipelinePolicy } from "./hermes-revenue-pipeline-policy.ts";

/**
 * Hermes Revenue Pipeline Service (Sprint C6 — Scope 6).
 *
 * READ-TIME AGGREGATION (server-only). Mevcut registry'lerin ürettiği sanitize
 * edilmiş kayıtları okur, fırsat evrenini bunların BİRLEŞİMİNDEN kurar
 * (missionId/leadId), her fırsat için saf `evaluateRevenuePipelineItem`'ı
 * çağırır ve sıralı pipeline + özet döner.
 *
 * YENİ source-of-truth registry OLUŞTURMAZ. Downstream kayıtları MUTATE ETMEZ.
 * Hiçbir gelir değeri üretmez — yalnız mevcut Sales Outcome tahminini okur.
 * Mesaj göndermez, onay üretmez.
 */

/** Fırsatın anahtarı: leadId varsa lead, yoksa mission. */
function opportunityKey(missionId: string | null, leadId: string | null): string | null {
  return leadId ?? missionId ?? null;
}

type Opportunity = {
  key: string;
  missionId: string | null;
  leadId: string | null;
  name: string | null;
  qualificationStatus: string | null;
  outreachStatus: string | null;
  receipts: RevenueDeliveryReceiptLike[];
  conversationState: string | null;
  conversationUpdatedAt: number | null;
  demoStatus: string | null;
  demoUpdatedAt: number | null;
  demoCreatedAt: number | null;
  followUpStatus: string | null;
  followUpOrchState: string | null;
  followUpOrchDueAt: number | null;
  followUpOrchOverdueByMinutes: number | null;
  outcomeStatus: string | null;
  outcomeEstimatedMrr: number | null;
  outcomeUpdatedAt: number | null;
  lastReplyAt: number | null;
  storedAt: number;
};

export type RunRevenuePipelineResult = {
  items: RevenuePipelineItem[];
  summary: RevenuePipelineSummary;
  updatedAt: number;
};

/**
 * Mevcut registry'lerden fırsat evrenini toplayıp pipeline'ı üretir.
 * `activeOnly` verildiğinde yalnız açık fırsatlar döner.
 */
export function runRevenuePipeline(options: {
  now?: number;
  policy?: HermesRevenuePipelinePolicy;
  activeOnly?: boolean;
  limit?: number;
} = {}): RunRevenuePipelineResult {
  const now = options.now ?? Date.now();
  const policy = options.policy ?? defaultRevenuePipelinePolicy();

  if (!policy.enabled) {
    return {
      items: [],
      summary: summarizeRevenuePipeline([]),
      updatedAt: now,
    };
  }

  const opportunities = new Map<string, Opportunity>();

  const ensure = (missionId: string | null, leadId: string | null, name: string | null, at: number): Opportunity | null => {
    const key = opportunityKey(missionId, leadId);
    if (!key) return null;
    let opp = opportunities.get(key);
    if (!opp) {
      opp = {
        key,
        missionId: missionId ?? null,
        leadId: leadId ?? null,
        name: name?.trim() || null,
        qualificationStatus: null,
        outreachStatus: null,
        receipts: [],
        conversationState: null,
        conversationUpdatedAt: null,
        demoStatus: null,
        demoUpdatedAt: null,
        demoCreatedAt: null,
        followUpStatus: null,
        followUpOrchState: null,
        followUpOrchDueAt: null,
        followUpOrchOverdueByMinutes: null,
        outcomeStatus: null,
        outcomeEstimatedMrr: null,
        outcomeUpdatedAt: null,
        lastReplyAt: null,
        storedAt: at,
      };
      opportunities.set(key, opp);
    }
    if (!opp.missionId && missionId) opp.missionId = missionId;
    if (!opp.name && name?.trim()) opp.name = name.trim();
    if (at > opp.storedAt) opp.storedAt = at;
    return opp;
  };

  // Qualification (lead-keyed).
  for (const v of getRecentQualificationResults(500, now)) {
    const opp = ensure(null, v.result.leadId, v.businessName, v.storedAt);
    if (opp && opp.qualificationStatus == null) opp.qualificationStatus = v.result.status;
  }

  // Outreach (lead-keyed).
  for (const v of getRecentOutreachDecisions(500, now)) {
    const opp = ensure(v.decision.missionId, v.decision.leadId, v.businessName, v.storedAt);
    if (opp && opp.outreachStatus == null) opp.outreachStatus = v.decision.status;
  }

  // Delivery receipts.
  for (const r of getRecentProcessedReceipts(500)) {
    const opp = ensure(r.missionId, r.leadId, null, r.occurredAt);
    if (opp) opp.receipts.push({ status: r.status, occurredAt: r.occurredAt });
  }

  // Replies (mission-keyed timestamp).
  for (const r of getRecentWhatsAppReplies(500, now)) {
    const opp = ensure(r.missionId, r.leadId, r.contactProfileNameSafe, r.occurredAt);
    if (opp && (opp.lastReplyAt == null || r.occurredAt > opp.lastReplyAt)) opp.lastReplyAt = r.occurredAt;
  }

  // Conversations.
  for (const v of getRecentConversationDecisions(500, now)) {
    const d = v.decision;
    const at = d.createdAt ?? v.storedAt;
    const opp = ensure(d.missionId, d.leadId, v.businessName, at);
    if (opp && (opp.conversationUpdatedAt == null || at > opp.conversationUpdatedAt)) {
      opp.conversationState = d.state;
      opp.conversationUpdatedAt = at;
    }
  }

  // Demo scheduling.
  for (const d of getRecentDemoScheduleItems(500, now)) {
    const opp = ensure(d.missionId, d.leadId, d.leadName, d.updatedAt);
    if (opp && (opp.demoUpdatedAt == null || d.updatedAt > opp.demoUpdatedAt)) {
      opp.demoStatus = d.status;
      opp.demoUpdatedAt = d.updatedAt;
      opp.demoCreatedAt = d.createdAt;
    }
  }

  // Follow-up candidates.
  for (const f of getRecentFollowUpCandidates(500, now)) {
    const opp = ensure(f.missionId, f.leadId, null, f.updatedAt);
    if (opp && opp.followUpStatus == null) opp.followUpStatus = f.status;
  }

  // Follow-up orchestration.
  for (const v of getRecentFollowUpOrchestrationDecisions(500, now)) {
    const d = v.decision;
    const opp = ensure(d.missionId, d.leadId, v.businessName, d.updatedAt);
    if (opp && opp.followUpOrchState == null) {
      opp.followUpOrchState = d.state;
      opp.followUpOrchDueAt = d.dueAt;
      opp.followUpOrchOverdueByMinutes = d.overdueByMinutes;
    }
  }

  // Sales outcomes (source of truth for revenue).
  for (const o of getRecentSalesOutcomeItems(500, now)) {
    const opp = ensure(o.missionId, o.leadId, o.leadName, o.updatedAt);
    if (opp) {
      opp.outcomeStatus = o.status;
      opp.outcomeEstimatedMrr = o.estimatedMrr;
      opp.outcomeUpdatedAt = o.updatedAt;
    }
  }

  // Değerlendir.
  const items: RevenuePipelineItem[] = [];
  for (const opp of opportunities.values()) {
    const item = evaluateRevenuePipelineItem({
      lead: { id: opp.leadId, name: opp.name },
      mission: opp.missionId ? { missionId: opp.missionId } : null,
      qualification: opp.qualificationStatus ? { status: opp.qualificationStatus } : null,
      outreach: opp.outreachStatus ? { status: opp.outreachStatus } : null,
      deliveryReceipts: opp.receipts,
      conversation: opp.conversationState ? { state: opp.conversationState, updatedAt: opp.conversationUpdatedAt ?? undefined } : null,
      demoItem: opp.demoStatus ? { status: opp.demoStatus, updatedAt: opp.demoUpdatedAt ?? undefined, createdAt: opp.demoCreatedAt ?? undefined } : null,
      followUpItem: opp.followUpStatus ? { status: opp.followUpStatus } : null,
      followUpOrchestration: opp.followUpOrchState ? { state: opp.followUpOrchState, dueAt: opp.followUpOrchDueAt, overdueByMinutes: opp.followUpOrchOverdueByMinutes } : null,
      salesOutcome: opp.outcomeStatus ? { status: opp.outcomeStatus, estimatedMrr: opp.outcomeEstimatedMrr, updatedAt: opp.outcomeUpdatedAt ?? undefined } : null,
      lastReplyAt: opp.lastReplyAt,
      currentTime: now,
      policy,
    });
    items.push(item);
  }

  let sorted = sortRevenuePipeline(items);
  if (options.activeOnly) sorted = sorted.filter((i) => isActiveRevenueItem(i));
  const summary = summarizeRevenuePipeline(sorted);

  const limit = options.limit ?? policy.maxPipelineItems;
  const limited = sorted.slice(0, Math.max(0, Math.min(limit, policy.maxPipelineItems)));

  return { items: limited, summary, updatedAt: now };
}
