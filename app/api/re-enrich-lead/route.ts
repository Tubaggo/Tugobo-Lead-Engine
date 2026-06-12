import { NextResponse } from "next/server";
import { enrichLeadWithHomepageSignals } from "@/app/lib/enrich-lead-homepage";
import {
  generateLLMLeadInsight,
  getLlmProviderStatus,
} from "@/app/lib/llm/provider";
import { generateLeadInsight } from "@/app/lib/intelligence/ai-insight";
import {
  toLeadForAiInsight,
  appendLeadActivity,
  opportunityTierRank,
  OPPORTUNITY_REASON_LABELS,
  type OpportunityTier,
  type ScoredLead,
} from "@/app/lib/leads";
import { summarizeVerificationResult } from "@/app/lib/signal-verification";

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function insightLlmExtra(lead: ScoredLead): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  out.reviewsCount = lead.reviewsCount;
  const acqProfile = lead.acquisitionIntelligence;
  const confidenceSignals = {
    websiteConfidence: lead.websiteConfidence,
    instagramConfidence: lead.instagramConfidence,
    whatsappConfidence: lead.whatsappConfidence,
    otaConfidence: lead.otaConfidence,
    adsLikelihood: lead.adsLikelihood,
    acquisitionMaturity: lead.acquisitionMaturity,
    conversionMaturity: lead.conversionMaturity,
    directBookingMaturity: lead.directBookingMaturity,
  };
  const a = acqProfile?.acquisition;
  if (a) {
    out.acquisition = {
      isAcquisitionActive: a.isAcquisitionActive,
      acquisitionIntentLevel: a.acquisitionIntentLevel,
      acquisitionChannels: a.acquisitionChannels,
      acquisitionSignals: (a.acquisitionSignals ?? []).slice(0, 8),
      acquisitionWeaknesses: (a.acquisitionWeaknesses ?? []).slice(0, 6),
      ...confidenceSignals,
    };
  } else {
    out.acquisition = confidenceSignals;
  }
  const c = lead.commercialReadiness;
  if (c) {
    out.commercialReadiness = {
      commercialReadinessLevel: c.commercialReadinessLevel,
      commercialSummary: (c.commercialSummary ?? []).slice(0, 4),
      commercialSignals: (c.commercialSignals ?? []).slice(0, 8),
      commercialWeaknesses: (c.commercialWeaknesses ?? []).slice(0, 6),
    };
  }
  const sv = lead.signalVerification;
  if (sv) {
    out.verification = {
      whatsappVerification: sv.whatsappVerification,
      whatsappConfidence: sv.whatsappConfidence,
      websiteVerification: sv.websiteVerification,
      websiteConfidence: sv.websiteConfidence,
      instagramVerification: sv.instagramVerification,
      instagramConfidence: sv.instagramConfidence,
      reservationSignal: sv.reservationSignal,
      reservationConfidence: sv.reservationConfidence,
      businessOwnershipType: sv.businessOwnershipType,
    };
  }
  if (typeof lead.verifiedOpportunityScore === "number") {
    out.opportunity = {
      score: lead.verifiedOpportunityScore,
      tier: lead.opportunityTier,
      reasons: (lead.opportunityReasons ?? []).map(
        (k) => OPPORTUNITY_REASON_LABELS[k]?.tr ?? k,
      ),
    };
  }
  return Object.keys(out).length > 0 ? out : null;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!isRecord(body) || !isRecord(body.lead)) {
    return NextResponse.json({ error: "Missing lead" }, { status: 400 });
  }
  const raw = body.lead;
  if (typeof raw.id !== "string" || !raw.id.trim()) {
    return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
  }
  if (typeof raw.name !== "string" || typeof raw.city !== "string") {
    return NextResponse.json({ error: "Invalid lead payload" }, { status: 400 });
  }

  const lead = raw as ScoredLead;

  try {
    // Phase 1 + 3: website/Instagram/WhatsApp signal refresh + operational value recalculation
    let enriched: ScoredLead = await enrichLeadWithHomepageSignals(lead);

    // Phase 2: LLM AI re-evaluation (graceful fallback to rules already applied above)
    const llmStatus = getLlmProviderStatus();
    if (llmStatus.llm_enabled) {
      try {
        const input = toLeadForAiInsight(enriched);
        const rules = generateLeadInsight(input, "rules");
        const extra = insightLlmExtra(enriched);
        const refined = await generateLLMLeadInsight(input, rules, extra);
        if (refined) {
          enriched = {
            ...enriched,
            aiInsight: refined.aiInsight ?? enriched.aiInsight,
            outreachAngle: refined.outreachAngle ?? enriched.outreachAngle,
            painPointSummary: refined.painPointSummary ?? enriched.painPointSummary,
            opportunityLevel: refined.opportunityLevel ?? enriched.opportunityLevel,
            aiInsightSource: refined.source ?? enriched.aiInsightSource,
          };
        }
      } catch {
        // LLM unavailable — retain rules-based insight already set
      }
    }

    // Phase 4: Enrichment metadata + memory counters + activity timeline
    const now = new Date().toISOString();
    let timeline = appendLeadActivity(
      lead.activityTimeline,
      "lead_enriched",
      "Lead yeniden zenginleştirildi",
    );

    // Phase 4b: Signal verification events — only newly verified states are logged.
    const prevV = lead.signalVerification;
    const newV = enriched.signalVerification;
    if (newV) {
      timeline = appendLeadActivity(
        timeline,
        "verification_completed",
        "Sinyal doğrulaması tamamlandı",
      );
      if (newV.whatsappVerification === "verified" && prevV?.whatsappVerification !== "verified") {
        timeline = appendLeadActivity(timeline, "whatsapp_verified", "WhatsApp doğrulandı");
      }
      if (newV.websiteVerification === "verified" && prevV?.websiteVerification !== "verified") {
        timeline = appendLeadActivity(timeline, "website_verified", "Web sitesi doğrulandı");
      }
      if (
        newV.instagramVerification === "verified" &&
        prevV?.instagramVerification !== "verified"
      ) {
        timeline = appendLeadActivity(timeline, "instagram_verified", "Instagram hesabı doğrulandı");
      } else if (
        newV.instagramVerification === "candidate" &&
        prevV?.instagramVerification !== "candidate"
      ) {
        timeline = appendLeadActivity(
          timeline,
          "instagram_candidate",
          "Instagram aday hesabı bulundu",
        );
      }
      if (newV.reservationSignal === "verified" && prevV?.reservationSignal !== "verified") {
        timeline = appendLeadActivity(timeline, "reservation_cta_found", "Rezervasyon CTA bulundu");
      }
      if (
        newV.businessOwnershipType === "chain" &&
        prevV?.businessOwnershipType !== "chain"
      ) {
        timeline = appendLeadActivity(timeline, "chain_detected", "Kurumsal zincir tespit edildi");
      }
    }

    // Phase 4c: opportunity evaluation events — score refresh + tier upgrades.
    const newOppScore = enriched.verifiedOpportunityScore;
    const newTier = enriched.opportunityTier;
    const prevTier = lead.opportunityTier;
    if (typeof newOppScore === "number") {
      timeline = appendLeadActivity(timeline, "opportunity_updated", "Fırsat puanı güncellendi");
      if (
        newTier &&
        (!prevTier || opportunityTierRank(newTier) > opportunityTierRank(prevTier))
      ) {
        const upgradeLabel: Record<OpportunityTier, string> = {
          elite: "Elite fırsat seviyesine yükseldi",
          high: "Yüksek fırsat seviyesine yükseldi",
          medium: "Orta fırsat seviyesine yükseldi",
          low: "Düşük fırsat seviyesi",
        };
        if (newTier !== "low") {
          timeline = appendLeadActivity(
            timeline,
            `opportunity_tier_${newTier}`,
            upgradeLabel[newTier],
          );
        }
      }
    }

    timeline = appendLeadActivity(timeline, "ai_reviewed", "AI yeniden yorumladı");
    enriched = {
      ...enriched,
      lastEnrichedAt: now,
      lastEnrichmentSource: "manual",
      lastAiReviewAt: now,
      enrichmentCount: (lead.enrichmentCount ?? 0) + 1,
      reviewCount: (lead.reviewCount ?? 0) + 1,
      lastActionType: "enriched",
      activityTimeline: timeline,
      lastVerificationAt: newV ? now : lead.lastVerificationAt,
      verificationCount: newV
        ? (lead.verificationCount ?? 0) + 1
        : lead.verificationCount,
      lastVerificationResult: newV
        ? summarizeVerificationResult(newV)
        : lead.lastVerificationResult,
      lastOpportunityEvaluationAt:
        typeof newOppScore === "number" ? now : lead.lastOpportunityEvaluationAt,
      opportunityEvaluationCount:
        typeof newOppScore === "number"
          ? (lead.opportunityEvaluationCount ?? 0) + 1
          : lead.opportunityEvaluationCount,
      lastOpportunityScore:
        typeof newOppScore === "number" ? newOppScore : lead.lastOpportunityScore,
    };

    return NextResponse.json({ lead: enriched });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Enrichment failed" },
      { status: 500 },
    );
  }
}
