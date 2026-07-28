/**
 * Orchestrates one outreach generation: provider → validate → score → retry →
 * fallback.
 *
 * The provider is injected rather than imported so this module stays pure and
 * fully testable without network, keys, or `server-only`. The route supplies
 * the real one.
 *
 * Invariant, restated for v3.7.9: this function always returns *an answer*, and
 * that answer is no longer always a message. A first-contact generation with no
 * account-specific evidence returns `needs_research` and stops — no provider
 * call, no fallback draft, nothing stored. That is the one place in this engine
 * where producing nothing is the correct outcome: a message we could write for
 * this lead would be one we could write for any lead, and sending it costs more
 * than sending nothing.
 *
 * Every other path still ends in a message, which is what the fallback bank is
 * for — and since v3.7.9 that bank is built from the same evidence the provider
 * was given, so the safe path is account-specific too.
 */

import { accountAngleFor, isVariationAngle, type VariationAngle } from "./angles.ts";
import type { EvidenceSelection } from "./evidence.ts";
import { evidenceIds } from "./evidence.ts";
import type { OutreachStance } from "./lifecycle.ts";
import type {
  OutreachGenerationResponse,
  OutreachGenerationResult,
  OutreachPersonalization,
  Tone,
} from "./contract.ts";
import { makeGenerationId, NEEDS_RESEARCH_REASON } from "./contract.ts";
import {
  buildAccountFallbackMessage,
  buildFallbackMessage,
  REPLY_FALLBACK_ANGLES,
} from "./fallback.ts";
import { buildOutreachUserPrompt, type OutreachCorrection } from "./prompt.ts";
import {
  meetsProviderQualityBar,
  qualityFailures,
  scoreOutreachQuality,
  type OutreachQualityScore,
} from "./relevance.ts";
import { signalKeys, type SignalSet } from "./signals.ts";
import { isDuplicate } from "./text.ts";
import {
  extractCta,
  validateOutreachMessage,
  type ValidationFailure,
} from "./validator.ts";

/**
 * Narrows a result to the message-bearing case.
 *
 * For callers that have already established there is evidence — a reply-stage
 * generation, or a first-contact one made after the route's gate. Throws
 * rather than returning null because at that point `needs_research` is not a
 * state to handle, it is a broken invariant, and the message it produces names
 * which one.
 */
export function expectGeneratedOutreach(
  result: OutreachGenerationResult,
): OutreachGenerationResponse {
  if (result.status !== "generated") {
    throw new Error(`outreach generation returned ${result.status}: ${result.reason}`);
  }
  return result;
}

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
  /** Configured sender name, or null/absent for the nameless founder voice. */
  senderName?: string | null;
  /**
   * The account-specific evidence this message is written from.
   *
   * Required in practice for `first_contact` — its absence is what triggers
   * `needs_research`. Ignored at reply stages, which are grounded in a
   * relationship rather than in a public signal.
   */
  evidence?: EvidenceSelection | null;
};

type ProviderAttempt = {
  message: string;
  usedSignalKeys: string[];
  angle: VariationAngle;
  score: OutreachQualityScore | null;
};

/**
 * One provider round: what came back, and — when nothing usable did — why.
 *
 * The reason matters because it decides what the retry should change. A
 * message rejected for its *subject* deserves a different question; a message
 * rejected for its *shape* deserves the same question written correctly, and
 * rotating the angle there would throw away a good candidate over a fixable
 * defect.
 */
type ProviderRound = {
  attempt: ProviderAttempt | null;
  failures: ValidationFailure[];
};

/**
 * Attempts the provider, returning a validated message or null.
 *
 * Two gates, not one. The validator answers "is this sendable"; for a
 * first-contact message the relevance score then answers "is this worth
 * sending" — a message can be flawless and still be a vaguer version of what
 * the deterministic bank would have produced from the same evidence, and
 * before this gate existed that message won simply because it came from the
 * model.
 */
async function tryProvider(
  params: GenerateParams,
  angle: VariationAngle,
  corrections: readonly OutreachCorrection[] = [],
): Promise<ProviderRound> {
  if (!params.provider) return { attempt: null, failures: [] };

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
    senderName: params.senderName,
    evidence: params.evidence,
    corrections,
  });

  let output: ProviderOutput | null;
  try {
    output = await params.provider({ system: params.systemPrompt, user });
  } catch {
    // A provider failure is never fatal — the fallback bank covers it.
    return { attempt: null, failures: [] };
  }
  if (!output || typeof output.message !== "string") {
    return { attempt: null, failures: [] };
  }

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
    senderName: params.senderName,
    evidence: params.evidence,
    // Commissioning a tone is what earns the right to enforce its shape.
    tone: params.tone,
  });
  if (!verdict.ok) return { attempt: null, failures: verdict.failures };

  let score: OutreachQualityScore | null = null;
  if (params.evidence) {
    score = scoreOutreachQuality({
      message,
      tone: params.tone,
      businessName: params.businessName,
      signals: params.signals,
      evidence: params.evidence,
      stance: params.stance,
      senderName: params.senderName,
    });
    if (!meetsProviderQualityBar(score)) {
      return { attempt: null, failures: qualityFailures(score) };
    }
  }

  // Trust our own angle over the model's self-report, but accept a valid
  // declared angle since the model knows what it actually wrote about.
  const reported = output.variationAngle;
  const resolved = isVariationAngle(reported) ? reported : angle;

  const claimed = Array.isArray(output.usedSignalKeys)
    ? output.usedSignalKeys.filter(
        (key): key is string => typeof key === "string" && signalKeys(params.signals).includes(key),
      )
    : [];

  return {
    attempt: { message, usedSignalKeys: claimed, angle: resolved, score },
    failures: [],
  };
}

/**
 * The next angle a retry should try.
 *
 * At first contact the pool is whatever the evidence supports — a second
 * question about the *same* observation, never a different observation, because
 * the evidence is what makes the message worth sending. At reply stages it is
 * the capability bank `buildFallbackMessage` reaches for, so a provider retry
 * and a fallback walk never disagree about what "a different respectful
 * subject" means.
 */
function nextAngle(
  current: VariationAngle,
  offset: number,
  params: GenerateParams,
): VariationAngle {
  const stance = params.stance ?? "first_contact";
  if (stance === "first_contact" && params.evidence) {
    const rotated = accountAngleFor(params.evidence, offset);
    if (rotated !== current) return rotated;
    return accountAngleFor(params.evidence, offset + 1);
  }
  const pool = REPLY_FALLBACK_ANGLES;
  const size = pool.length;
  for (let step = 0; step < size; step += 1) {
    const candidate = pool[(((offset + step) % size) + size) % size];
    if (candidate !== current) return candidate;
  }
  return current;
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
 * Which bank this generation draws from, resolved once.
 *
 * A discriminated union rather than a stance plus a maybe-null evidence field,
 * so "first contact with no evidence" is unrepresentable past the gate instead
 * of being a case every downstream function has to re-check and cast around.
 */
type GenerationMode =
  | { kind: "account"; evidence: EvidenceSelection }
  | { kind: "reply"; stance: "follow_up" | "demo_confirm" };

function resolveMode(params: GenerateParams): GenerationMode | null {
  const stance = params.stance ?? "first_contact";
  if (stance !== "first_contact") return { kind: "reply", stance };
  return params.evidence ? { kind: "account", evidence: params.evidence } : null;
}

function buildOneFallback(
  params: GenerateParams,
  mode: GenerationMode,
  rotation: number,
): { message: string; variationAngle: VariationAngle } {
  if (mode.kind === "account") {
    return buildAccountFallbackMessage({
      tone: params.tone,
      businessName: params.businessName,
      evidence: mode.evidence,
      rotation,
    });
  }
  return buildFallbackMessage({
    tone: params.tone,
    businessName: params.businessName,
    city: params.city,
    rotation,
    stance: mode.stance,
  });
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
  mode: GenerationMode,
): { message: string; variationAngle: VariationAngle; duplicateAvoided: boolean } {
  let duplicateAvoided = false;
  let last = buildOneFallback(params, mode, params.rotation);

  const bankSize = REPLY_FALLBACK_ANGLES.length;
  for (let attempt = 0; attempt < bankSize; attempt += 1) {
    const candidate = buildOneFallback(params, mode, params.rotation + attempt);
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

function personalizationOf(
  params: GenerateParams,
  angle: VariationAngle,
  score: OutreachQualityScore | null,
  message: string,
): OutreachPersonalization | undefined {
  if (!params.evidence) return undefined;
  const graded =
    score ??
    scoreOutreachQuality({
      message,
      tone: params.tone,
      businessName: params.businessName,
      signals: params.signals,
      evidence: params.evidence,
      stance: params.stance,
      senderName: params.senderName,
    });
  return {
    ...evidenceIds(params.evidence),
    angleId: angle,
    qualityScore: graded.total,
  };
}

/**
 * Generates one message for one tone.
 *
 * Provider path gets two attempts: the assigned angle, then a rotated one. The
 * second attempt covers three cases — the first result was invalid, it scored
 * below the relevance bar, or it was valid but too close to what the founder
 * already saw.
 */
export async function generateOutreachMessage(
  params: GenerateParams,
): Promise<OutreachGenerationResult> {
  const generationId = makeGenerationId(params.leadId, params.generationNonce);

  /*
   * The no-evidence gate. Placed before everything, including the first
   * provider call, because "produce nothing" has to mean nothing: no request,
   * no token spend, no draft the founder has to notice is generic and delete.
   */
  const mode = resolveMode(params);
  if (!mode) {
    return {
      ok: true,
      status: "needs_research",
      reason: NEEDS_RESEARCH_REASON,
      tone: params.tone,
      generationId,
    };
  }

  let duplicateAvoided = false;

  const firstRound = await tryProvider(params, params.angle);
  const first = firstRound.attempt;
  if (
    first &&
    !isDuplicate(first.message, params.previousMessages) &&
    !repeatsCta(first.message, params.previousMessages)
  ) {
    return {
      ok: true,
      status: "generated",
      message: first.message,
      tone: params.tone,
      source: "provider",
      variationAngle: first.angle,
      usedSignalKeys: first.usedSignalKeys,
      generationId,
      duplicateAvoided: false,
      personalization: personalizationOf(params, first.angle, first.score, first.message),
    };
  }
  if (first) duplicateAvoided = true;

  /*
   * Retry once. *What* the retry changes depends on why the first attempt
   * failed.
   *
   * A wrong shape, clumsy Turkish and a mislabeled evidence category are all
   * fixable defects in an otherwise good candidate — the observation was
   * right, the question followed from it, the model just wrote the
   * consultative tone in the soft tone's clothes, stacked three verbal nouns
   * where one would do, or called an OTA listing "direct" traffic. Rotating
   * the angle there would discard a good subject to fix a bad sentence, so the
   * retry keeps the angle, the evidence and the tone, and names what to
   * repair.
   *
   * Everything else — a diagnosis, an invented name, a weak subject — is a
   * problem with what the message is *about*, and deserves a different
   * question off the same evidence.
   */
  const corrections: OutreachCorrection[] = [];
  if (firstRound.failures.includes("tone_shape_mismatch")) corrections.push("tone");
  if (firstRound.failures.includes("unnatural_turkish_construction")) {
    corrections.push("fluency");
  }
  if (firstRound.failures.includes("evidence_semantic_mismatch")) {
    corrections.push("semantics");
  }
  const fixable = corrections.length > 0;
  const rotated = fixable
    ? params.angle
    : nextAngle(params.angle, params.rotation + 1, params);
  if (fixable || rotated !== params.angle) {
    const second = (await tryProvider(params, rotated, corrections)).attempt;
    if (
      second &&
      !isDuplicate(second.message, params.previousMessages) &&
      !repeatsCta(second.message, params.previousMessages)
    ) {
      return {
        ok: true,
        status: "generated",
        message: second.message,
        tone: params.tone,
        source: "provider",
        variationAngle: second.angle,
        usedSignalKeys: second.usedSignalKeys,
        generationId,
        duplicateAvoided,
        personalization: personalizationOf(
          params,
          second.angle,
          second.score,
          second.message,
        ),
      };
    }
    if (second) duplicateAvoided = true;
  }

  const fb = fallbackMessage(params, mode);
  const response: OutreachGenerationResponse = {
    ok: true,
    status: "generated",
    message: fb.message,
    tone: params.tone,
    source: "fallback",
    variationAngle: fb.variationAngle,
    usedSignalKeys: signalKeys(params.signals).slice(0, 4),
    generationId,
    duplicateAvoided: duplicateAvoided || fb.duplicateAvoided,
    personalization: personalizationOf(params, fb.variationAngle, null, fb.message),
  };
  return response;
}
