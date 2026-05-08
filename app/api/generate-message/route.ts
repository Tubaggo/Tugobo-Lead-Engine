import { NextResponse } from "next/server";
import {
  generateWhatsAppMessage,
  type LeadForAiInsight,
} from "@/app/lib/intelligence/ai-insight";
import type { BusinessSignal } from "@/app/lib/intelligence/signals";
import type {
  OutreachIntelligenceProfile,
  OutreachStyle,
  OutreachUrgency,
  SalesApproach,
  RecommendedChannel,
  LeadTemperature,
} from "@/app/lib/intelligence/outreach-intelligence";

type GenerateMessageBody = {
  name: string;
  type: string;
  location: string;
  leadScore: number;
  hotScore: number;
  followUp?: boolean;
  intelligenceScore?: number;
  smartLeadScoreV2?: number;
  reviewIntelligenceScore?: number;
  contactQuality?: "high" | "medium" | "low";
  hasWhatsAppPath?: boolean;
  hasInstagram?: boolean;
  hasOwnWebsite?: boolean;
  channels?: string[];
  businessSignals?: BusinessSignal[];
  painPointSummary?: string[];
  outreachAngle?: string;
  outreachIntelligence?: OutreachIntelligenceProfile;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const VALID_STYLES: ReadonlySet<OutreachStyle> = new Set<OutreachStyle>([
  "consultative",
  "direct",
  "educational",
  "relationship",
  "conversion-focused",
]);

const VALID_URGENCY: ReadonlySet<OutreachUrgency> = new Set<OutreachUrgency>([
  "low",
  "medium",
  "high",
]);

const VALID_APPROACH: ReadonlySet<SalesApproach> = new Set<SalesApproach>([
  "whatsapp-speed",
  "direct-booking",
  "conversion-gap",
  "operational-efficiency",
  "social-demand",
  "guest-experience",
]);

const VALID_CHANNEL: ReadonlySet<RecommendedChannel> = new Set<RecommendedChannel>([
  "whatsapp",
  "instagram",
  "phone",
  "website-form",
]);

const VALID_TEMPERATURE: ReadonlySet<LeadTemperature> = new Set<LeadTemperature>([
  "cold",
  "warm",
  "hot",
]);

function parseOutreachIntelligence(
  raw: unknown,
): OutreachIntelligenceProfile | undefined {
  if (!isRecord(raw)) return undefined;
  const style = raw.outreachStyle;
  const urgency = raw.urgencyLevel;
  const approach = raw.salesApproach;
  const channel = raw.recommendedChannel;
  const temperature = raw.leadTemperature;
  if (
    typeof style !== "string" ||
    typeof urgency !== "string" ||
    typeof approach !== "string" ||
    typeof channel !== "string" ||
    typeof temperature !== "string"
  ) {
    return undefined;
  }
  if (
    !VALID_STYLES.has(style as OutreachStyle) ||
    !VALID_URGENCY.has(urgency as OutreachUrgency) ||
    !VALID_APPROACH.has(approach as SalesApproach) ||
    !VALID_CHANNEL.has(channel as RecommendedChannel) ||
    !VALID_TEMPERATURE.has(temperature as LeadTemperature)
  ) {
    return undefined;
  }
  const rationale = Array.isArray(raw.rationale)
    ? raw.rationale.filter((x): x is string => typeof x === "string")
    : [];
  return {
    outreachStyle: style as OutreachStyle,
    urgencyLevel: urgency as OutreachUrgency,
    salesApproach: approach as SalesApproach,
    recommendedChannel: channel as RecommendedChannel,
    leadTemperature: temperature as LeadTemperature,
    rationale,
  };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Geçersiz JSON gövdesi" },
      { status: 400 },
    );
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const type = typeof body.type === "string" ? body.type.trim() : "";
  const location =
    typeof body.location === "string" ? body.location.trim() : "";
  const leadScore = Number(body.leadScore);
  const hotScore = Number(body.hotScore);
  const followUp = body.followUp === true;
  const intelligenceScore = Number(body.intelligenceScore ?? 0);
  const smartLeadScoreV2 =
    body.smartLeadScoreV2 === undefined ? undefined : Number(body.smartLeadScoreV2);
  const reviewIntelligenceScore = Number(body.reviewIntelligenceScore ?? 0);
  const contactQuality =
    body.contactQuality === "high" ||
    body.contactQuality === "medium" ||
    body.contactQuality === "low"
      ? body.contactQuality
      : "medium";
  const hasWhatsAppPath = body.hasWhatsAppPath === true;
  const hasInstagram = body.hasInstagram === true;
  const hasOwnWebsite = body.hasOwnWebsite === true;
  const channels = Array.isArray(body.channels)
    ? body.channels.filter((v): v is string => typeof v === "string")
    : [];
  const businessSignals = Array.isArray(body.businessSignals)
    ? body.businessSignals.filter((v): v is BusinessSignal => typeof v === "string")
    : [];
  const painPointSummary = Array.isArray(body.painPointSummary)
    ? body.painPointSummary.filter((v): v is string => typeof v === "string")
    : [];
  const outreachAngle =
    typeof body.outreachAngle === "string" ? body.outreachAngle.trim() : "";
  const outreachIntelligence = parseOutreachIntelligence(body.outreachIntelligence);

  if (!name || !type || !location) {
    return NextResponse.json(
      { error: "name, type ve location zorunludur" },
      { status: 400 },
    );
  }
  if (!Number.isFinite(leadScore) || !Number.isFinite(hotScore)) {
    return NextResponse.json(
      { error: "leadScore ve hotScore sayı olmalıdır" },
      { status: 400 },
    );
  }

  const leadInput: LeadForAiInsight = {
    hotScore,
    leadScore,
    intelligenceScore: Number.isFinite(intelligenceScore) ? intelligenceScore : 0,
    smartLeadScoreV2:
      typeof smartLeadScoreV2 === "number" && Number.isFinite(smartLeadScoreV2)
        ? smartLeadScoreV2
        : undefined,
    reviewIntelligenceScore: Number.isFinite(reviewIntelligenceScore)
      ? reviewIntelligenceScore
      : 0,
    contactQuality,
    hasWhatsAppPath,
    hasInstagram,
    hasOwnWebsite,
    channels,
    businessSignals,
    heuristicOutreachAngle: outreachAngle || undefined,
    reviewPainPoints: painPointSummary.map((summary) => ({
      category: "other",
      severity: "medium",
      summary: `${location}: ${summary}`.slice(0, 180),
    })),
    outreachIntelligence,
  };

  const pack = generateWhatsAppMessage(leadInput, { followUp });
  const variations = [pack.styles.soft, pack.styles.direct, pack.styles.premium];
  return NextResponse.json({
    message: pack.message,
    variations,
    styles: pack.styles,
    weakSignals: pack.weakSignals,
    meta: {
      name,
      type,
      location,
      outreachStyle: outreachIntelligence?.outreachStyle ?? null,
      salesApproach: outreachIntelligence?.salesApproach ?? null,
    },
  });
}
