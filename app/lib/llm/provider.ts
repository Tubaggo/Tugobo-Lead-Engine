import {
  getPainPointSummary,
  type LeadAiInsight,
  type LeadInterpretation,
  type LeadForAiInsight,
  type LeadWhatsAppMessagePack,
} from "@/app/lib/intelligence/ai-insight";
import type { Locale } from "@/app/lib/i18n";
import { deepseekChatText, getDeepSeekApiKey } from "./deepseek";
import {
  LEAD_INTERPRETATION_SYSTEM,
  LEAD_INSIGHT_SYSTEM,
  OUTREACH_PACK_SYSTEM,
  REFINE_SINGLE_COPY_SYSTEM,
  EXTRACTED_WEBSITE_SIGNALS_INTERPRETATION_SYSTEM,
} from "./prompts";
import { openAiCompatibleChatCompletion, type ChatMessage } from "./openai-compat";
import {
  buildRuleBasedWebsiteSignalsInterpretation,
  type ExtractedSignalsInterpretationInput,
  type WebsiteContactSignalsInterpretation,
} from "@/app/lib/intelligence/extracted-signals-interpretation";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

export type LlmProviderStatus = {
  llm_enabled: boolean;
  provider_name: "deepseek" | "openai" | null;
};

function defaultTimeoutMs(): number {
  const n = Number(process.env.LLM_TIMEOUT_MS ?? 12000);
  return Number.isFinite(n) && n >= 3000 && n <= 60000 ? n : 12000;
}

export function getLlmProviderStatus(): LlmProviderStatus {
  if (getDeepSeekApiKey()) {
    return { llm_enabled: true, provider_name: "deepseek" };
  }
  if (process.env.OPENAI_API_KEY?.trim()) {
    return { llm_enabled: true, provider_name: "openai" };
  }
  return { llm_enabled: false, provider_name: null };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseLeadInsightJson(raw: string): {
  aiInsight: string;
  outreachAngle: string;
  acquisitionNote: string;
} | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const aiInsight =
    typeof parsed.aiInsight === "string" ? parsed.aiInsight.trim() : "";
  const outreachAngle =
    typeof parsed.outreachAngle === "string" ? parsed.outreachAngle.trim() : "";
  const acquisitionNote =
    typeof parsed.acquisitionNote === "string"
      ? parsed.acquisitionNote.trim()
      : "";
  if (!aiInsight || !outreachAngle) return null;
  return { aiInsight, outreachAngle, acquisitionNote };
}

function parseOutreachPackJson(raw: string): LeadWhatsAppMessagePack | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const message = typeof parsed.message === "string" ? parsed.message.trim() : "";
  const soft = typeof parsed.soft === "string" ? parsed.soft.trim() : "";
  const direct = typeof parsed.direct === "string" ? parsed.direct.trim() : "";
  const premium = typeof parsed.premium === "string" ? parsed.premium.trim() : "";
  if (!message || !soft || !direct || !premium) return null;
  return {
    message,
    styles: { soft, direct, premium },
    weakSignals: false,
  };
}

function parseRefineTextJson(raw: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
  return text || null;
}

function parseLeadInterpretationJson(raw: string): LeadInterpretation | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  const acquisitionProfile =
    typeof parsed.acquisitionProfile === "string"
      ? parsed.acquisitionProfile.trim()
      : "";
  const recommendedApproach =
    typeof parsed.recommendedApproach === "string"
      ? parsed.recommendedApproach.trim()
      : "";
  const salesAngle = typeof parsed.salesAngle === "string" ? parsed.salesAngle.trim() : "";
  const channelRecommendation =
    typeof parsed.channelRecommendation === "string"
      ? parsed.channelRecommendation.trim()
      : "";
  const confidenceRaw =
    typeof parsed.confidenceLevel === "string" ? parsed.confidenceLevel.trim() : "";
  const confidenceLevel =
    confidenceRaw === "low" || confidenceRaw === "medium" || confidenceRaw === "high"
      ? confidenceRaw
      : null;
  const keySignals = Array.isArray(parsed.keySignals)
    ? parsed.keySignals
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 5)
    : [];
  const risks = Array.isArray(parsed.risks)
    ? parsed.risks
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 4)
    : [];
  const opportunities = Array.isArray(parsed.opportunities)
    ? parsed.opportunities
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 4)
    : [];

  if (
    !summary ||
    !acquisitionProfile ||
    !recommendedApproach ||
    !salesAngle ||
    !channelRecommendation ||
    !confidenceLevel
  ) {
    return null;
  }
  return {
    summary,
    acquisitionProfile,
    recommendedApproach,
    salesAngle,
    channelRecommendation,
    confidenceLevel,
    keySignals,
    risks,
    opportunities,
  };
}

function parseWebsiteSignalsInterpretationJson(
  raw: string,
): Omit<WebsiteContactSignalsInterpretation, "source"> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const pick = (k: string): string | null => {
    const v = parsed[k];
    if (typeof v !== "string") return null;
    const t = v.trim();
    if (!t || t.length > 2000) return null;
    return t;
  };
  const turkishSummary = pick("turkishSummary");
  const websiteCredibility = pick("websiteCredibility");
  const whatsappLikelihood = pick("whatsappLikelihood");
  const instagramLikelihood = pick("instagramLikelihood");
  const bookingFlowStrength = pick("bookingFlowStrength");
  const manualCheckRecommendation = pick("manualCheckRecommendation");
  if (
    !turkishSummary ||
    !websiteCredibility ||
    !whatsappLikelihood ||
    !instagramLikelihood ||
    !bookingFlowStrength ||
    !manualCheckRecommendation
  ) {
    return null;
  }
  return {
    turkishSummary,
    websiteCredibility,
    whatsappLikelihood,
    instagramLikelihood,
    bookingFlowStrength,
    manualCheckRecommendation,
  };
}

function mergeAiInsightWithAcquisition(
  aiInsight: string,
  acquisitionNote: string,
): string {
  if (!acquisitionNote) return aiInsight;
  return `${aiInsight}\n\n${acquisitionNote}`.replace(/\s+\n/g, "\n").trim();
}

function leadInsightUserContext(
  input: LeadForAiInsight,
  rulesBaseline: LeadAiInsight,
  extraContext?: Record<string, unknown> | null,
): string {
  return JSON.stringify({
    businessSignals: input.businessSignals ?? [],
    reviewPainPoints: input.reviewPainPoints ?? [],
    websiteIntelligence: input.websiteIntelligence ?? null,
    channels: input.channels,
    contactQuality: input.contactQuality,
    hasWhatsAppPath: input.hasWhatsAppPath,
    hasInstagram: input.hasInstagram,
    hasOwnWebsite: input.hasOwnWebsite,
    outreachIntelligence: input.outreachIntelligence ?? null,
    heuristicOutreachAngle: input.heuristicOutreachAngle ?? null,
    rulePainSummary: getPainPointSummary(input),
    ruleOutreachAngle: rulesBaseline.outreachAngle,
    ruleOpportunityLevel: rulesBaseline.opportunityLevel,
    extra: extraContext ?? undefined,
  });
}

function leadInterpretationUserContext(
  input: LeadForAiInsight,
  rulesBaseline: LeadAiInsight,
  language: Locale,
  extraContext?: Record<string, unknown> | null,
): string {
  const acq = isRecord(extraContext?.acquisition) ? extraContext.acquisition : null;
  const reviewVolume =
    typeof extraContext?.reviewsCount === "number" ? extraContext.reviewsCount : null;

  return JSON.stringify({
    language,
    signals: {
      otaPresence: input.channels.includes("Booking") || input.channels.includes("Airbnb"),
      websiteConfidence: acq?.websiteConfidence ?? null,
      instagramConfidence: acq?.instagramConfidence ?? null,
      whatsappConfidence: acq?.whatsappConfidence ?? null,
      reviewVolume,
      acquisitionMaturity: acq?.acquisitionMaturity ?? null,
      conversionMaturity: acq?.conversionMaturity ?? null,
      directBookingMaturity: acq?.directBookingMaturity ?? null,
      hotScore: input.hotScore,
      leadScore: input.leadScore,
    },
    channels: input.channels,
    contactQuality: input.contactQuality,
    hasWhatsAppPath: input.hasWhatsAppPath,
    hasInstagram: input.hasInstagram,
    hasOwnWebsite: input.hasOwnWebsite,
    businessSignals: input.businessSignals ?? [],
    painPointSummary: getPainPointSummary(input),
    ruleOutreachAngle: rulesBaseline.outreachAngle,
    ruleOpportunityLevel: rulesBaseline.opportunityLevel,
    extra: extraContext ?? undefined,
  });
}

async function chatForInsight(
  messages: ChatMessage[],
  jsonObject: boolean,
): Promise<string | null> {
  const timeoutMs = defaultTimeoutMs();
  const dsKey = getDeepSeekApiKey();
  if (dsKey) {
    return deepseekChatText({ messages, jsonObject, temperature: 0.35, timeoutMs });
  }
  const oaKey = process.env.OPENAI_API_KEY?.trim();
  if (!oaKey) return null;
  const model =
    process.env.OPENAI_MODEL?.trim().replace(/^["']|["']$/g, "") || "gpt-4o-mini";
  return openAiCompatibleChatCompletion({
    url: OPENAI_CHAT_URL,
    apiKey: oaKey,
    model,
    messages,
    temperature: 0.35,
    jsonObject,
    timeoutMs,
  });
}

/**
 * Optional LLM layer for lead narrative + outreach angle (Turkish).
 * Opportunity level and pain bullets always come from {@link rulesBaseline} (deterministic).
 */
export async function generateLLMLeadInsight(
  input: LeadForAiInsight,
  rulesBaseline: LeadAiInsight,
  extraContext?: Record<string, unknown> | null,
): Promise<LeadAiInsight | null> {
  const messages: ChatMessage[] = [
    { role: "system", content: LEAD_INSIGHT_SYSTEM },
    {
      role: "user",
      content: leadInsightUserContext(input, rulesBaseline, extraContext),
    },
  ];
  const raw = await chatForInsight(messages, true);
  if (!raw) return null;
  const parsed = parseLeadInsightJson(raw);
  if (!parsed) return null;

  return {
    aiInsight: mergeAiInsightWithAcquisition(
      parsed.aiInsight,
      parsed.acquisitionNote,
    ),
    outreachAngle: parsed.outreachAngle,
    painPointSummary: rulesBaseline.painPointSummary,
    opportunityLevel: rulesBaseline.opportunityLevel,
    source: "llm",
  };
}

/**
 * Optional LLM interpretation layer for compact business/acquisition/sales narrative.
 */
export async function generateLLMLeadInterpretation(params: {
  input: LeadForAiInsight;
  rulesBaseline: LeadAiInsight;
  language: Locale;
  extraContext?: Record<string, unknown> | null;
}): Promise<LeadInterpretation | null> {
  const messages: ChatMessage[] = [
    { role: "system", content: LEAD_INTERPRETATION_SYSTEM },
    {
      role: "user",
      content: leadInterpretationUserContext(
        params.input,
        params.rulesBaseline,
        params.language,
        params.extraContext,
      ),
    },
  ];
  const raw = await chatForInsight(messages, true);
  if (!raw) return null;
  return parseLeadInterpretationJson(raw);
}

async function chatForOutreach(messages: ChatMessage[]): Promise<string | null> {
  const timeoutMs = defaultTimeoutMs();
  const dsKey = getDeepSeekApiKey();
  if (dsKey) {
    return deepseekChatText({
      messages,
      jsonObject: true,
      temperature: 0.4,
      timeoutMs,
    });
  }
  const oaKey = process.env.OPENAI_API_KEY?.trim();
  if (!oaKey) return null;
  const model =
    process.env.OPENAI_MODEL?.trim().replace(/^["']|["']$/g, "") || "gpt-4o-mini";
  return openAiCompatibleChatCompletion({
    url: OPENAI_CHAT_URL,
    apiKey: oaKey,
    model,
    messages,
    temperature: 0.4,
    jsonObject: true,
    timeoutMs,
  });
}

/**
 * Refines deterministic WhatsApp pack into warmer Turkish copy. Returns null → use {@link pack}.
 */
export async function generateLLMOutreachMessage(
  pack: LeadWhatsAppMessagePack,
  context: Record<string, unknown>,
): Promise<LeadWhatsAppMessagePack | null> {
  const messages: ChatMessage[] = [
    { role: "system", content: OUTREACH_PACK_SYSTEM },
    {
      role: "user",
      content: JSON.stringify({
        context,
        draft: {
          message: pack.message,
          soft: pack.styles.soft,
          direct: pack.styles.direct,
          premium: pack.styles.premium,
        },
      }),
    },
  ];
  const raw = await chatForOutreach(messages);
  if (!raw) return null;
  const parsed = parseOutreachPackJson(raw);
  if (!parsed) return null;
  return { ...parsed, weakSignals: pack.weakSignals };
}

/**
 * LLM (DeepSeek öncelikli) ile çıkarılmış web/iletişim sinyallerini Türkçe yorumlar.
 * Başarısızlıkta {@link buildRuleBasedWebsiteSignalsInterpretation} döner.
 */
export async function interpretExtractedWebsiteContactSignals(
  input: ExtractedSignalsInterpretationInput,
): Promise<WebsiteContactSignalsInterpretation> {
  const rules = buildRuleBasedWebsiteSignalsInterpretation(input);
  const messages: ChatMessage[] = [
    { role: "system", content: EXTRACTED_WEBSITE_SIGNALS_INTERPRETATION_SYSTEM },
    {
      role: "user",
      content: JSON.stringify({ signals: input }),
    },
  ];
  const raw = await chatForInsight(messages, true);
  if (!raw) return rules;
  const parsed = parseWebsiteSignalsInterpretationJson(raw);
  if (!parsed) return rules;
  return { ...parsed, source: "llm" };
}

export type {
  ExtractedSignalsInterpretationInput,
  WebsiteContactSignalsInterpretation,
} from "@/app/lib/intelligence/extracted-signals-interpretation";

/**
 * Provider adapter for the grounded outreach engine (v3.7.6).
 *
 * Distinct from {@link generateLLMOutreachMessage}, which *polishes* a
 * rule-built draft and therefore inherits its subject. This one takes a fully
 * built system+user prompt and returns the raw JSON contract, so the engine
 * controls grounding, angle and tone rather than the template.
 *
 * Temperature is higher than the insight paths (0.4 → 0.85) because near-
 * determinism is exactly what made "regenerate" return the same copy.
 * Returns `null` on any failure; the engine falls back.
 */
export async function generateGroundedOutreach(params: {
  system: string;
  user: string;
}): Promise<{
  message: string;
  usedSignalKeys?: string[];
  ctaType?: string;
  variationAngle?: string;
} | null> {
  const timeoutMs = defaultTimeoutMs();
  const messages: ChatMessage[] = [
    { role: "system", content: params.system },
    { role: "user", content: params.user },
  ];

  let raw: string | null = null;
  const dsKey = getDeepSeekApiKey();
  if (dsKey) {
    raw = await deepseekChatText({
      messages,
      jsonObject: true,
      temperature: 0.85,
      timeoutMs,
    });
  } else {
    const oaKey = process.env.OPENAI_API_KEY?.trim();
    if (!oaKey) return null;
    const model =
      process.env.OPENAI_MODEL?.trim().replace(/^["']|["']$/g, "") || "gpt-4o-mini";
    raw = await openAiCompatibleChatCompletion({
      url: OPENAI_CHAT_URL,
      apiKey: oaKey,
      model,
      messages,
      temperature: 0.85,
      jsonObject: true,
      timeoutMs,
    });
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  const message = typeof parsed.message === "string" ? parsed.message.trim() : "";
  if (!message) return null;

  return {
    message,
    usedSignalKeys: Array.isArray(parsed.usedSignalKeys)
      ? parsed.usedSignalKeys.filter((k): k is string => typeof k === "string")
      : undefined,
    ctaType: typeof parsed.ctaType === "string" ? parsed.ctaType : undefined,
    variationAngle:
      typeof parsed.variationAngle === "string" ? parsed.variationAngle : undefined,
  };
}

/**
 * Single-string Turkish polish (e.g. one-off copy tweaks). Returns null → keep {@link text}.
 */
export async function refineTurkishSalesCopy(
  text: string,
  intent: string,
): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const messages: ChatMessage[] = [
    { role: "system", content: REFINE_SINGLE_COPY_SYSTEM },
    {
      role: "user",
      content: JSON.stringify({ intent, text: trimmed }),
    },
  ];
  const raw = await chatForInsight(messages, true);
  if (!raw) return null;
  return parseRefineTextJson(raw);
}
