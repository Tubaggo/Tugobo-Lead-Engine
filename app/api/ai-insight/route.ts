import { NextResponse } from "next/server";
import { generateLeadInsight } from "@/app/lib/intelligence/ai-insight";
import { generateLLMLeadInsight, getLlmProviderStatus } from "@/app/lib/llm/provider";
import { toLeadForAiInsight, type ScoredLead } from "@/app/lib/leads";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function insightLlmExtraFromLead(lead: ScoredLead): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  const acqProfile = lead.acquisitionIntelligence;
  const a = acqProfile?.acquisition;
  if (a) {
    out.acquisition = {
      isAcquisitionActive: a.isAcquisitionActive,
      acquisitionIntentLevel: a.acquisitionIntentLevel,
      acquisitionChannels: a.acquisitionChannels,
      acquisitionSignals: (a.acquisitionSignals ?? []).slice(0, 8),
      acquisitionWeaknesses: (a.acquisitionWeaknesses ?? []).slice(0, 6),
    };
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

export async function GET() {
  const s = getLlmProviderStatus();
  return NextResponse.json({
    configured: s.llm_enabled,
    llm_enabled: s.llm_enabled,
    provider_name: s.provider_name,
  });
}

export async function POST(req: Request) {
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
  const input = toLeadForAiInsight(scored);

  const rules = generateLeadInsight(input, "rules");
  const status = getLlmProviderStatus();
  if (!status.llm_enabled) {
    return NextResponse.json(rules);
  }

  try {
    const extra = insightLlmExtraFromLead(scored);
    const refined = await generateLLMLeadInsight(input, rules, extra);
    return NextResponse.json(refined ?? rules);
  } catch {
    return NextResponse.json(rules);
  }
}
