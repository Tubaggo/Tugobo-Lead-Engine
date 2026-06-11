import { NextResponse } from "next/server";
import { enrichLeadWithHomepageSignals } from "@/app/lib/enrich-lead-homepage";
import {
  generateLLMLeadInsight,
  getLlmProviderStatus,
} from "@/app/lib/llm/provider";
import { generateLeadInsight } from "@/app/lib/intelligence/ai-insight";
import { toLeadForAiInsight, type ScoredLead } from "@/app/lib/leads";

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

    // Phase 4: Enrichment metadata
    enriched = {
      ...enriched,
      lastEnrichedAt: new Date().toISOString(),
      lastEnrichmentSource: "manual",
    };

    return NextResponse.json({ lead: enriched });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Enrichment failed" },
      { status: 500 },
    );
  }
}
