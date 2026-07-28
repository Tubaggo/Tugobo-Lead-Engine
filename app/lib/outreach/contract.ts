/**
 * The request/response contract for outreach generation.
 *
 * Kept free of `fs`, `server-only` and provider imports so the route, the
 * engine and the tests all agree on one set of types.
 */

import type { VariationAngle } from "./angles.ts";
import type { OutreachSignal } from "./signals.ts";

export const TONES = ["soft", "direct", "consultative"] as const;
export type Tone = (typeof TONES)[number];

export function isTone(value: unknown): value is Tone {
  return typeof value === "string" && (TONES as readonly string[]).includes(value);
}

/** How many prior messages we keep and send back for avoidance. */
export const MAX_PREVIOUS_MESSAGES = 5;
/** Guards prompt size; a longer prior message adds nothing to avoidance. */
export const MAX_PREVIOUS_MESSAGE_LENGTH = 600;

export type OutreachGenerationInput = {
  leadId: string;
  businessName: string;
  city?: string;
  businessType?: string;
  tone: Tone;
  verifiedSignals: OutreachSignal[];
  likelySignals: OutreachSignal[];
  tugoboFit?: { score?: number; reasons: string[] };
  previousMessages?: string[];
  regenerate?: boolean;
  generationNonce?: string;
};

/**
 * Why a draft looks the way it does, carried alongside it.
 *
 * Stored on the draft so "why was this hotel written to like this?" is
 * answerable later without re-running the engine. The founder-facing UI shows
 * the angle label it already showed; the ids and the score are for debugging
 * and for the tests that assert the message used the evidence it was given.
 */
export type OutreachPersonalization = {
  primaryEvidenceId: string;
  supportingEvidenceId?: string;
  angleId: string;
  qualityScore: number;
};

export type OutreachGenerationResponse = {
  ok: true;
  status: "generated";
  message: string;
  tone: Tone;
  source: "provider" | "fallback";
  variationAngle: VariationAngle;
  usedSignalKeys: string[];
  generationId: string;
  duplicateAvoided: boolean;
  personalization?: OutreachPersonalization;
};

/** The single reason a first-contact generation is refused. */
export const NEEDS_RESEARCH_REASON = "no_relevant_verified_evidence" as const;

/**
 * What the founder sees instead of a message.
 *
 * States the gap and the way out, and says nothing about the hotel — the whole
 * point of this state is that we have not observed enough to say anything
 * about the hotel.
 */
export const NEEDS_RESEARCH_MESSAGE_TR =
  "Bu lead için işletmeye özel ilk temas mesajı üretecek yeterli doğrulanmış sinyal bulunamadı. " +
  "Kanal veya web sitesi doğrulaması tamamlandıktan sonra mesaj üretilebilir.";

/**
 * No account-specific evidence, so no message.
 *
 * Deliberately not an error: nothing failed. There is simply nothing truthful
 * and specific to say yet, and the honest response to that is silence plus an
 * instruction, not a generic message dressed up as a personalised one.
 */
export type OutreachNeedsResearch = {
  ok: true;
  status: "needs_research";
  reason: typeof NEEDS_RESEARCH_REASON;
  tone: Tone;
  generationId: string;
};

export type OutreachGenerationResult =
  | OutreachGenerationResponse
  | OutreachNeedsResearch;

export type OutreachGenerationError = { ok: false; error: "generation_failed" };

/**
 * Trims and caps the prior-message list.
 *
 * Newest-last ordering is preserved because the most recent message is the one
 * a regenerate most needs to move away from.
 */
export function normalizePreviousMessages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().slice(0, MAX_PREVIOUS_MESSAGE_LENGTH))
    .filter((entry) => entry.length > 0)
    .slice(-MAX_PREVIOUS_MESSAGES);
}

/** Stable-ish unique id for one generation, used for UI keying and logs. */
export function makeGenerationId(leadId: string, nonce: string): string {
  return `${leadId}:${nonce}`;
}
