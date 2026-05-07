import { NextResponse } from "next/server";
import {
  generateLeadInsight,
  getPainPointSummary,
  type LeadAiInsight,
  type LeadForAiInsight,
} from "@/app/lib/intelligence/ai-insight";
import { toLeadForAiInsight, type ScoredLead } from "@/app/lib/leads";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseLlmPayload(
  text: string,
  fallback: LeadAiInsight,
): LeadAiInsight | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  const aiInsight =
    typeof parsed.aiInsight === "string" ? parsed.aiInsight.trim() : "";
  const outreachAngle =
    typeof parsed.outreachAngle === "string" ? parsed.outreachAngle.trim() : "";
  const painPointSummary = Array.isArray(parsed.painPointSummary)
    ? parsed.painPointSummary.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const ol = parsed.opportunityLevel;
  const opportunityLevel =
    ol === "low" || ol === "medium" || ol === "high" ? ol : null;

  if (!aiInsight || !outreachAngle || !opportunityLevel) return null;

  return {
    aiInsight,
    outreachAngle,
    painPointSummary: painPointSummary.slice(0, 5),
    opportunityLevel,
    source: "llm",
  };
}

async function tryLlmInsight(
  input: LeadForAiInsight,
  apiKey: string,
  rulesFallback: LeadAiInsight,
): Promise<LeadAiInsight> {
  const model =
    process.env.OPENAI_MODEL?.trim().replace(/^["']|["']$/g, "") ||
    "gpt-4o-mini";
  const context = JSON.stringify({
    businessSignals: input.businessSignals ?? [],
    reviewPainPoints: input.reviewPainPoints ?? [],
    websiteIntelligence: input.websiteIntelligence ?? null,
    channels: input.channels,
    hotScore: input.hotScore,
    leadScore: input.leadScore,
    intelligenceScore: input.intelligenceScore ?? null,
    reviewIntelligenceScore: input.reviewIntelligenceScore ?? null,
    smartLeadScoreV2: input.smartLeadScoreV2 ?? null,
    contactQuality: input.contactQuality,
    hasWhatsAppPath: input.hasWhatsAppPath,
    hasInstagram: input.hasInstagram,
    hasOwnWebsite: input.hasOwnWebsite,
    rulePainSummary: getPainPointSummary(input),
    ruleOpportunity: rulesFallback.opportunityLevel,
  });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a senior hospitality GTM analyst. Reply with JSON only: {\"aiInsight\":\"one concise English paragraph\",\"outreachAngle\":\"one short English sentence\",\"painPointSummary\":[\"string\",...],\"opportunityLevel\":\"low\"|\"medium\"|\"high\"}. Do not invent facts not supported by the input. If evidence is thin, use cautious wording and prefer low or medium opportunity.",
        },
        { role: "user", content: context },
      ],
    }),
  });

  if (!res.ok) return rulesFallback;

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  let raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return rulesFallback;
  if (raw.startsWith("```")) {
    raw = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }

  const parsed = parseLlmPayload(raw, rulesFallback);
  return parsed ?? rulesFallback;
}

export async function GET() {
  return NextResponse.json({
    configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
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

  const input = toLeadForAiInsight(body.lead as unknown as ScoredLead);

  const rules = generateLeadInsight(input, "rules");
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return NextResponse.json(rules);
  }

  try {
    const refined = await tryLlmInsight(input, key, rules);
    return NextResponse.json(refined);
  } catch {
    return NextResponse.json(rules);
  }
}
