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

export type OutreachGenerationResponse = {
  ok: true;
  message: string;
  tone: Tone;
  source: "provider" | "fallback";
  variationAngle: VariationAngle;
  usedSignalKeys: string[];
  generationId: string;
  duplicateAvoided: boolean;
};

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
