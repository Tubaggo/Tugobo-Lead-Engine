import { NextResponse } from "next/server";
import {
  generateWhatsAppMessage,
  type LeadForAiInsight,
} from "@/app/lib/intelligence/ai-insight";
import {
  generateLLMOutreachMessage,
  getLlmProviderStatus,
} from "@/app/lib/llm/provider";
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
  leadId?: string;
  variationSeed?: string;
  regenerateNonce?: number;
  name: string;
  type: string;
  location: string;
  leadScore: number;
  hotScore: number;
  followUp?: boolean;
  intelligenceScore?: number;
  smartLeadScoreV2?: number;
  reviewIntelligenceScore?: number;
  reviewsCount?: number;
  daysSinceLastReview?: number;
  bookingFlowStrength?: number;
  otaDependencyLikelihood?: number;
  socialDemandStrength?: number;
  communicationRisk?: number;
  contactReadinessScore?: number;
  contactQuality?: "high" | "medium" | "low";
  hasWhatsAppPath?: boolean;
  hasInstagram?: boolean;
  hasOwnWebsite?: boolean;
  channels?: string[];
  businessSignals?: BusinessSignal[];
  painPointSummary?: string[];
  outreachAngle?: string;
  outreachIntelligence?: OutreachIntelligenceProfile;
  websiteIntelligence?: {
    hasBookingCtaText?: boolean;
    hasWhatsAppLink?: boolean;
    hasBookingEngine?: boolean;
  };
  acquisitionIntelligence?: unknown;
  conversionLeak?: unknown;
  commercialReadiness?: unknown;
  opportunityProfile?: unknown;
  whyThisLead?: string[];
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

function salesApproachLabelTr(approach: SalesApproach | null | undefined): string {
  switch (approach) {
    case "direct-booking":
      return "Doğrudan rezervasyon (OTA bağımlılığı azaltma)";
    case "conversion-gap":
      return "Dönüşüm açığı (talep → rezervasyon)";
    case "social-demand":
      return "Instagram talebini rezervasyona çevirme";
    case "whatsapp-speed":
      return "WhatsApp hız & kaçan talep";
    case "operational-efficiency":
      return "Operasyonel verim & düzen";
    case "guest-experience":
      return "Misafir deneyimi / yorum sinyalleri";
    default:
      return "Danışman yaklaşımı";
  }
}

function makeVariationSeed(params: {
  leadId: string;
  provided?: string;
  nonce: number;
  followUp: boolean;
}): string {
  const base = params.provided?.trim();
  if (base) return `${base}|${params.nonce}|${params.followUp ? "fu" : "new"}`;
  return `${params.leadId}|${Date.now()}|${params.nonce}|${params.followUp ? "fu" : "new"}`;
}

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
  const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";
  const regenerateNonce = Number(body.regenerateNonce ?? 0);
  const variationSeedRaw =
    typeof body.variationSeed === "string" ? body.variationSeed.trim() : "";
  const intelligenceScore = Number(body.intelligenceScore ?? 0);
  const smartLeadScoreV2 =
    body.smartLeadScoreV2 === undefined ? undefined : Number(body.smartLeadScoreV2);
  const reviewIntelligenceScore = Number(body.reviewIntelligenceScore ?? 0);
  const reviewsCount = Number(body.reviewsCount ?? 0);
  const daysSinceLastReview = Number(body.daysSinceLastReview ?? 0);
  const bookingFlowStrength = Number(body.bookingFlowStrength ?? NaN);
  const otaDependencyLikelihood = Number(body.otaDependencyLikelihood ?? NaN);
  const socialDemandStrength = Number(body.socialDemandStrength ?? NaN);
  const communicationRisk = Number(body.communicationRisk ?? NaN);
  const contactReadinessScore = Number(body.contactReadinessScore ?? NaN);
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
  const websiteIntelligence = isRecord(body.websiteIntelligence)
    ? {
        hasBookingCtaText:
          typeof body.websiteIntelligence.hasBookingCtaText === "boolean"
            ? body.websiteIntelligence.hasBookingCtaText
            : undefined,
        hasWhatsAppLink:
          typeof body.websiteIntelligence.hasWhatsAppLink === "boolean"
            ? body.websiteIntelligence.hasWhatsAppLink
            : undefined,
        hasBookingEngine:
          typeof body.websiteIntelligence.hasBookingEngine === "boolean"
            ? body.websiteIntelligence.hasBookingEngine
            : undefined,
      }
    : undefined;
  const whyThisLead = Array.isArray(body.whyThisLead)
    ? body.whyThisLead.filter((v): v is string => typeof v === "string")
    : [];

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
  if (!leadId) {
    return NextResponse.json({ error: "leadId zorunludur" }, { status: 400 });
  }

  const variationSeed = makeVariationSeed({
    leadId,
    provided: variationSeedRaw || undefined,
    nonce: Number.isFinite(regenerateNonce) ? regenerateNonce : 0,
    followUp,
  });

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
    websiteIntelligence,
    reviewPainPoints: painPointSummary.map((summary) => ({
      category: "other",
      severity: "medium",
      summary: `${location}: ${summary}`.slice(0, 180),
    })),
    outreachIntelligence,
  };

  const pack = generateWhatsAppMessage(leadInput, { followUp, variationSeed });
  const status = getLlmProviderStatus();
  const refined =
    status.llm_enabled
      ? await generateLLMOutreachMessage(pack, {
          name,
          type,
          location,
          leadId,
          followUp,
          outreachAngle,
          outreachIntelligence: outreachIntelligence ?? null,
          businessSignals,
          painPointSummary,
          channels,
          whyThisLead,
          websiteIntelligence: websiteIntelligence ?? null,
          acquisitionIntelligence: body.acquisitionIntelligence ?? null,
          conversionLeak: body.conversionLeak ?? null,
          commercialReadiness: body.commercialReadiness ?? null,
          opportunityProfile: body.opportunityProfile ?? null,
          leadNumbers: {
            leadScore,
            hotScore,
            intelligenceScore,
            smartLeadScoreV2,
            reviewIntelligenceScore,
            reviewsCount: Number.isFinite(reviewsCount) ? reviewsCount : null,
            daysSinceLastReview: Number.isFinite(daysSinceLastReview)
              ? daysSinceLastReview
              : null,
            bookingFlowStrength: Number.isFinite(bookingFlowStrength)
              ? bookingFlowStrength
              : null,
            otaDependencyLikelihood: Number.isFinite(otaDependencyLikelihood)
              ? otaDependencyLikelihood
              : null,
            socialDemandStrength: Number.isFinite(socialDemandStrength)
              ? socialDemandStrength
              : null,
            communicationRisk: Number.isFinite(communicationRisk) ? communicationRisk : null,
            contactReadinessScore: Number.isFinite(contactReadinessScore)
              ? contactReadinessScore
              : null,
          },
          variationSeed,
          provider_name: status.provider_name,
        })
      : null;
  const out = refined ?? pack;
  const variations = [out.styles.soft, out.styles.direct, out.styles.premium];
  const rationaleNote = `Mesaj açısı: ${salesApproachLabelTr(
    outreachIntelligence?.salesApproach ?? null,
  )}`;
  return NextResponse.json({
    message: out.message,
    variations,
    styles: out.styles,
    weakSignals: out.weakSignals,
    llm_refined: Boolean(refined),
    rationaleNote,
    meta: {
      name,
      type,
      location,
      outreachStyle: outreachIntelligence?.outreachStyle ?? null,
      salesApproach: outreachIntelligence?.salesApproach ?? null,
      provider: status.provider_name,
      variationSeed,
    },
  });
}
