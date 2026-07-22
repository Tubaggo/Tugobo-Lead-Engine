"use client";

import type { ScoredLead } from "@/app/lib/leads";
import { whatsappLink } from "@/app/lib/leads";

import type { Tone } from "./contract";
import type { OutreachStance } from "./lifecycle";

/**
 * The browser's single entry point to `/api/generate-message`.
 *
 * Lifted out of `Dashboard.tsx` so the AI message modal and the lead-detail
 * message workspace call the same code with the same body. Two callers building
 * their own request was how the tones drifted apart in the first place.
 *
 * Prepares copy. Sends nothing.
 */

export type StyleKey = "soft" | "direct" | "premium";

/** Legacy style key ↔ engine tone. `premium` is the consultative tone. */
export const STYLE_TO_TONE: Record<StyleKey, Tone> = {
  soft: "soft",
  direct: "direct",
  premium: "consultative",
};

export const TONE_TO_STYLE: Record<Tone, StyleKey> = {
  soft: "soft",
  direct: "direct",
  consultative: "premium",
};

export type OutreachStylePack = {
  styles: Record<StyleKey, string>;
  fallback: string;
  rationaleNote?: string;
  llmRefined: boolean;
  provider: string | null;
  angleLabelByStyle: Record<StyleKey, string>;
  sourceByStyle: Record<StyleKey, "provider" | "fallback">;
  /** Signal keys behind the requested tone's message. */
  usedSignalKeys: string[];
  generationId?: string;
  duplicateAvoided: boolean;
};

type ToneDetail = {
  message?: string;
  source?: "provider" | "fallback";
  variationAngle?: string;
  variationAngleLabel?: string;
};

export type GenerateStylePackOptions = {
  /**
   * Relationship position the copy must be written from.
   *
   * Derived from real contact history, never from queue membership or a
   * follow-up date — see `outreach/lifecycle.ts`.
   */
  stance?: OutreachStance;
  /** Rotation counter; every regenerate must pass a higher value than the last. */
  regenerateNonce?: number;
  /** Prior drafts the engine must not repeat, oldest first. */
  previousMessages?: string[];
  /** Which tone the top-level fields of the response should describe. */
  tone?: Tone;
};

export async function generateOutreachStylePack(
  lead: ScoredLead,
  options: GenerateStylePackOptions = {},
): Promise<OutreachStylePack> {
  const {
    stance = "first_contact",
    regenerateNonce = 0,
    previousMessages = [],
    tone = "soft",
  } = options;

  const hasWhatsAppPath = Boolean(whatsappLink(lead.phone));
  const res = await fetch("/api/generate-message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      leadId: lead.id,
      name: lead.name,
      type: lead.type,
      location: `${lead.city}, ${lead.region}`,
      leadScore: lead.leadScore,
      hotScore: lead.hotScore,
      tone,
      stance,
      // Retained for the legacy queue consumers; the engine reads `stance`.
      followUp: stance === "follow_up",
      regenerateNonce,
      regenerate: regenerateNonce > 0,
      previousMessages,
      generationNonce: `${regenerateNonce}-${Date.now().toString(36)}`,
      intelligenceScore: lead.intelligenceScore ?? 0,
      smartLeadScoreV2: lead.smartLeadScoreV2,
      reviewIntelligenceScore: lead.reviewIntelligenceScore ?? 0,
      reviewsCount: lead.reviewsCount,
      daysSinceLastReview: lead.daysSinceLastReview,
      bookingFlowStrength: lead.bookingFlowStrength,
      otaDependencyLikelihood: lead.otaDependencyLikelihood,
      socialDemandStrength: lead.socialDemandStrength,
      communicationRisk: lead.communicationRisk,
      contactReadinessScore: lead.contactReadinessScore,
      contactQuality: lead.contactQuality,
      hasWhatsAppPath,
      hasInstagram: lead.hasInstagram,
      hasOwnWebsite: lead.hasOwnWebsite,
      channels: lead.channels,
      businessSignals: lead.businessSignals ?? [],
      painPointSummary: lead.painPointSummary ?? [],
      outreachAngle: lead.outreachAngle ?? "",
      outreachIntelligence: lead.outreachIntelligence,
      whyThisLead: lead.whyThisLead ?? [],
      websiteIntelligence: lead.websiteIntelligence ?? null,
      acquisitionIntelligence: lead.acquisitionIntelligence ?? null,
      conversionLeak: lead.conversionLeak ?? null,
      commercialReadiness: lead.commercialReadiness ?? null,
      opportunityProfile: lead.opportunityProfile ?? null,
    }),
  });

  const data = (await res.json()) as {
    styles?: { direct?: string; soft?: string; premium?: string; curiosity?: string };
    message?: string;
    error?: string;
    variations?: string[];
    rationaleNote?: string;
    llm_refined?: boolean;
    usedSignalKeys?: string[];
    generationId?: string;
    duplicateAvoided?: boolean;
    tones?: { soft?: ToneDetail; direct?: ToneDetail; consultative?: ToneDetail };
    meta?: { provider?: string | null };
  };

  if (!res.ok) {
    throw new Error(data.error || `Sunucu hatası (${res.status})`);
  }

  const styles = data.styles;
  const direct = styles?.direct?.trim() ?? "";
  const soft = styles?.soft?.trim() ?? "";
  const premium = (styles?.premium?.trim() ?? styles?.curiosity?.trim() ?? "").trim();
  const fallback =
    (data.message?.trim() ||
      (Array.isArray(data.variations) ? data.variations[0]?.trim() : "") ||
      "") ?? "";
  if (!direct || !soft || !premium) {
    throw new Error("AI message styles missing");
  }

  const tones = data.tones;
  return {
    styles: { direct, soft, premium },
    fallback,
    rationaleNote: typeof data.rationaleNote === "string" ? data.rationaleNote : undefined,
    llmRefined: Boolean(data.llm_refined),
    provider: data.meta?.provider ?? null,
    angleLabelByStyle: {
      soft: tones?.soft?.variationAngleLabel ?? "",
      direct: tones?.direct?.variationAngleLabel ?? "",
      premium: tones?.consultative?.variationAngleLabel ?? "",
    },
    sourceByStyle: {
      soft: tones?.soft?.source ?? "fallback",
      direct: tones?.direct?.source ?? "fallback",
      premium: tones?.consultative?.source ?? "fallback",
    },
    usedSignalKeys: Array.isArray(data.usedSignalKeys)
      ? data.usedSignalKeys.filter((key): key is string => typeof key === "string")
      : [],
    generationId: typeof data.generationId === "string" ? data.generationId : undefined,
    duplicateAvoided: Boolean(data.duplicateAvoided),
  };
}
