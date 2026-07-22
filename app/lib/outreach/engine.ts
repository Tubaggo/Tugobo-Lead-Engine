/**
 * Orchestrates one outreach generation: provider → validate → retry → fallback.
 *
 * The provider is injected rather than imported so this module stays pure and
 * fully testable without network, keys, or `server-only`. The route supplies
 * the real one.
 *
 * Invariant: this function always returns a message. A caller never has to
 * handle "nothing came back" — that is what the fallback bank is for.
 */

import { isVariationAngle, type VariationAngle } from "./angles.ts";
import type { OutreachStance } from "./lifecycle.ts";
import type { OutreachGenerationResponse, Tone } from "./contract.ts";
import { makeGenerationId } from "./contract.ts";
import { buildFallbackMessage, FALLBACK_ANGLES } from "./fallback.ts";
import { buildOutreachUserPrompt } from "./prompt.ts";
import { signalKeys, type SignalSet } from "./signals.ts";
import { isDuplicate } from "./text.ts";
import { extractCta, validateOutreachMessage } from "./validator.ts";

/** What a provider must return. `null` means "unavailable" — not an error. */
export type ProviderOutput = {
  message: string;
  usedSignalKeys?: string[];
  ctaType?: string;
  variationAngle?: string;
};

export type OutreachProvider = (params: {
  system: string;
  user: string;
}) => Promise<ProviderOutput | null>;

export type GenerateParams = {
  leadId: string;
  businessName: string;
  city?: string;
  businessType?: string;
  tone: Tone;
  angle: VariationAngle;
  signals: SignalSet;
  tugoboFit?: { score?: number; reasons: string[] };
  previousMessages: readonly string[];
  generationNonce: string;
  /** Shifts fallback angle/opening selection; normally the regenerate count. */
  rotation: number;
  provider: OutreachProvider | null;
  systemPrompt: string;
  /** Relationship position. Absent means first contact. */
  stance?: OutreachStance;
};

/** Attempts the provider, returning a validated message or null. */
async function tryProvider(
  params: GenerateParams,
  angle: VariationAngle,
): Promise<{ message: string; usedSignalKeys: string[]; angle: VariationAngle } | null> {
  if (!params.provider) return null;

  const user = buildOutreachUserPrompt({
    businessName: params.businessName,
    city: params.city,
    businessType: params.businessType,
    tone: params.tone,
    angle,
    signals: params.signals,
    tugoboFit: params.tugoboFit,
    previousMessages: params.previousMessages,
    generationNonce: `${params.generationNonce}:${angle}`,
    stance: params.stance,
  });

  let output: ProviderOutput | null;
  try {
    output = await params.provider({ system: params.systemPrompt, user });
  } catch {
    // A provider failure is never fatal — the fallback bank covers it.
    return null;
  }
  if (!output || typeof output.message !== "string") return null;

  const message = output.message.trim();
  /*
   * Quality only — duplication is deliberately *not* checked here. The caller
   * needs to tell "the model produced junk" apart from "the model produced a
   * fine message we have already shown", because only the second case should
   * set `duplicateAvoided` and trigger the angle-rotated retry.
   */
  const verdict = validateOutreachMessage({
    message,
    signals: params.signals,
    businessName: params.businessName,
    stance: params.stance,
  });
  if (!verdict.ok) return null;

  // Trust our own angle over the model's self-report, but accept a valid
  // declared angle since the model knows what it actually wrote about.
  const reported = output.variationAngle;
  const resolved = isVariationAngle(reported) ? reported : angle;

  const claimed = Array.isArray(output.usedSignalKeys)
    ? output.usedSignalKeys.filter(
        (key): key is string => typeof key === "string" && signalKeys(params.signals).includes(key),
      )
    : [];

  return { message, usedSignalKeys: claimed, angle: resolved };
}

/**
 * True when the candidate ends on an ask the founder has already sent.
 *
 * Similarity alone misses this: a genuinely new observation closed with the
 * same final sentence still lands as "you sent me that already", because the
 * ask is the part the reader is being asked to act on.
 */
function repeatsCta(candidate: string, previous: readonly string[]): boolean {
  const cta = extractCta(candidate);
  if (cta.length === 0) return false;
  return previous.some((prior) => extractCta(prior) === cta);
}

/**
 * Walks the fallback bank until it finds something that is not a duplicate.
 *
 * Bounded by the bank size, then returns the last candidate regardless —
 * showing a repeat beats showing nothing, and `duplicateAvoided: false` tells
 * the UI what happened.
 */
function fallbackMessage(
  params: GenerateParams,
): { message: string; variationAngle: VariationAngle; duplicateAvoided: boolean } {
  let duplicateAvoided = false;
  let last = buildFallbackMessage({
    tone: params.tone,
    businessName: params.businessName,
    city: params.city,
    rotation: params.rotation,
    stance: params.stance,
  });

  for (let attempt = 0; attempt < FALLBACK_ANGLES.length; attempt += 1) {
    const candidate = buildFallbackMessage({
      tone: params.tone,
      businessName: params.businessName,
      city: params.city,
      rotation: params.rotation + attempt,
      stance: params.stance,
    });
    last = candidate;
    if (
      !isDuplicate(candidate.message, params.previousMessages) &&
      !repeatsCta(candidate.message, params.previousMessages)
    ) {
      return { ...candidate, duplicateAvoided };
    }
    duplicateAvoided = true;
  }

  return { ...last, duplicateAvoided };
}

/**
 * Generates one message for one tone.
 *
 * Provider path gets two attempts: the assigned angle, then a rotated one. The
 * second attempt exists specifically for the regenerate case, where the first
 * result is valid but too close to what the founder already saw.
 */
export async function generateOutreachMessage(
  params: GenerateParams,
): Promise<OutreachGenerationResponse> {
  const generationId = makeGenerationId(params.leadId, params.generationNonce);
  let duplicateAvoided = false;

  const first = await tryProvider(params, params.angle);
  if (
    first &&
    !isDuplicate(first.message, params.previousMessages) &&
    !repeatsCta(first.message, params.previousMessages)
  ) {
    return {
      ok: true,
      message: first.message,
      tone: params.tone,
      source: "provider",
      variationAngle: first.angle,
      usedSignalKeys: first.usedSignalKeys,
      generationId,
      duplicateAvoided: false,
    };
  }
  if (first) duplicateAvoided = true;

  // Retry once on a different angle rather than re-rolling the same one.
  const rotated = FALLBACK_ANGLES[
    ((params.rotation + 1) % FALLBACK_ANGLES.length + FALLBACK_ANGLES.length) %
      FALLBACK_ANGLES.length
  ];
  if (rotated !== params.angle) {
    const second = await tryProvider(params, rotated);
    if (
      second &&
      !isDuplicate(second.message, params.previousMessages) &&
      !repeatsCta(second.message, params.previousMessages)
    ) {
      return {
        ok: true,
        message: second.message,
        tone: params.tone,
        source: "provider",
        variationAngle: second.angle,
        usedSignalKeys: second.usedSignalKeys,
        generationId,
        duplicateAvoided,
      };
    }
    if (second) duplicateAvoided = true;
  }

  const fb = fallbackMessage(params);
  return {
    ok: true,
    message: fb.message,
    tone: params.tone,
    source: "fallback",
    variationAngle: fb.variationAngle,
    usedSignalKeys: signalKeys(params.signals).slice(0, 4),
    generationId,
    duplicateAvoided: duplicateAvoided || fb.duplicateAvoided,
  };
}
