import { NextResponse } from "next/server";
import { generateLeadInsight } from "@/app/lib/intelligence/ai-insight";
import {
  generateLLMLeadInsight,
  generateLLMLeadInterpretation,
  getLlmProviderStatus,
} from "@/app/lib/llm/provider";
import type { Locale } from "@/app/lib/i18n";
import {
  toLeadForAiInsight,
  OPPORTUNITY_REASON_LABELS,
  type ScoredLead,
} from "@/app/lib/leads";
import { withAdminSession } from "@/app/lib/auth/require-admin-session";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function insightLlmExtraFromLead(lead: ScoredLead): Record<string, unknown> | null {
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

async function handleGET() {
  const s = getLlmProviderStatus();
  return NextResponse.json({
    configured: s.llm_enabled,
    llm_enabled: s.llm_enabled,
    provider_name: s.provider_name,
  });
}

async function handlePOST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!isRecord(body.lead)) {
    return NextResponse.json({ error: "lead object required" }, { status: 400 });
  }

  const scored = body.lead as unknown as ScoredLead;
  const locale: Locale = body.locale === "en" ? "en" : "tr";
  const input = toLeadForAiInsight(scored);

  const rules = generateLeadInsight(input, "rules");
  const status = getLlmProviderStatus();
  if (!status.llm_enabled) {
    return NextResponse.json({
      ...rules,
      interpretation: null,
    });
  }

  try {
    const extra = insightLlmExtraFromLead(scored);
    const [refined, interpretation] = await Promise.all([
      generateLLMLeadInsight(input, rules, extra),
      generateLLMLeadInterpretation({
        input,
        rulesBaseline: rules,
        language: locale,
        extraContext: extra,
      }),
    ]);
    return NextResponse.json({
      ...(refined ?? rules),
      interpretation,
    });
  } catch {
    return NextResponse.json({
      ...rules,
      interpretation: null,
    });
  }
}

/** Protected: unauthenticated callers get a generic JSON 401. */
export const GET = withAdminSession(handleGET);

/** Protected: unauthenticated callers get a generic JSON 401. */
export const POST = withAdminSession(handlePOST);
