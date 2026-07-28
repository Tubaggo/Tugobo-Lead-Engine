/**
 * v3.7.9 — the message relevance scorer.
 *
 * `validator.ts` answers "may this be sent?". It is a set of hard rules and it
 * has to be, because every rule in it encodes something that would be a lie or
 * an insult. This module answers a different, softer question: *is this worth
 * sending?*
 *
 * The distinction earns its keep on the provider path. A live model reliably
 * produces messages that break no rule and are still a notch below the
 * deterministic bank — the hook is vaguer, the question drifts one step away
 * from the evidence, the three tones converge on one shape. None of that is a
 * failure the validator can name without also rejecting good copy. A weighted
 * score can: below {@link MIN_PROVIDER_QUALITY_TOTAL} the engine retries once,
 * and if the retry is no better it takes the account-specific fallback, which
 * is graded on the same scale and always clears it.
 *
 * Pure and deterministic: same message in, same score out. No model grades
 * anything here.
 */

import type { Tone } from "./contract.ts";
import {
  EVIDENCE_ANAPHORA,
  EVIDENCE_GROUNDING_TERMS,
  EVIDENCE_TOPIC_PATTERNS,
  stripBusinessName,
  type EvidenceSelection,
  type PersonalizationEvidenceType,
} from "./evidence.ts";
import { validateTurkishFluency } from "./fluency.ts";
import type { OutreachStance } from "./lifecycle.ts";
import type { SignalSet } from "./signals.ts";
import {
  FIRST_CONTACT_PREFERRED_MAX,
  FIRST_CONTACT_PREFERRED_MIN,
  TURKISH_QUESTION_PARTICLE,
  validateOutreachMessage,
  type ValidationFailure,
} from "./validator.ts";

export type OutreachQualityScore = {
  total: number;
  evidenceSpecificity: number;
  accountRelevance: number;
  questionGrounding: number;
  naturalness: number;
  replyEase: number;
  truthfulness: number;
  toneDistinctiveness: number;
};

/**
 * Maximum points per dimension.
 *
 * The top three carry 60 of the 100 between them, which is the whole thesis:
 * a message that is specific to this account, and asks something that follows
 * from what makes it specific, is already most of the way to being worth
 * sending. Naturalness and reply-ease are refinements; truthfulness is a
 * pass/fail the validator already owns and is scored here only so a single
 * number can stand in for "and it is also sendable".
 */
export const OUTREACH_QUALITY_WEIGHTS = {
  evidenceSpecificity: 20,
  accountRelevance: 20,
  questionGrounding: 20,
  naturalness: 15,
  replyEase: 10,
  truthfulness: 10,
  toneDistinctiveness: 5,
} as const;

/**
 * The bar a provider message has to clear.
 *
 * Set so that a message can lose one whole secondary dimension (reply-ease, or
 * naturalness plus tone) and still pass, but cannot lose any part of the
 * evidence/relevance/grounding core. That is the trade we want: slightly
 * awkward phrasing is survivable, a vague hook is not.
 */
export const MIN_PROVIDER_QUALITY_TOTAL = 82;

/** The jargon-free, sendable check the truthfulness dimension delegates to. */
export type ScoreParams = {
  message: string;
  tone: Tone;
  businessName: string;
  signals: SignalSet;
  evidence: EvidenceSelection;
  stance?: OutreachStance;
  senderName?: string | null;
};

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?…]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

const INDIRECT_CLOSE = /merak ettim\.?\s*$/iu;
const CURIOSITY_LEAD = /(merak ettim:|sormak istedim:|merak ettim,)/iu;
/*
 * Both of these used `\b(mi|mı|mu|mü)\b`, which is ASCII-only and therefore
 * finds a "binary question" inside words like "bölümünü" — see
 * {@link TURKISH_QUESTION_PARTICLE}. The bug quietly inflated `replyEase` and
 * `toneDistinctiveness` for messages that asked nothing of the sort.
 */
const BINARY_MARKER = TURKISH_QUESTION_PARTICLE;
const WH_WORD = /(nasıl|kim|hangi|nerede)/iu;
const INTERROGATIVE = (text: string): boolean =>
  WH_WORD.test(text) || TURKISH_QUESTION_PARTICLE.test(text);

/** The sentences doing the asking. Mirrors the validator's own reading. */
function questionSentences(text: string): string[] {
  const sentences = splitSentences(text);
  const asking = sentences.filter((sentence) => text.includes(`${sentence}?`));
  if (asking.length > 0) return asking;
  return INDIRECT_CLOSE.test(text) ? sentences.slice(-1) : [];
}

function declaredTypes(evidence: EvidenceSelection): PersonalizationEvidenceType[] {
  return [
    evidence.primary.type,
    ...(evidence.supporting ? [evidence.supporting.type] : []),
  ];
}

/**
 * How specifically the message uses the evidence it was handed.
 *
 * Full marks require the primary hook to be visible *and* the declared shape
 * to be honoured — a message given a supporting item and naming only the
 * primary asked a narrower question than the evidence supported, and one that
 * names a second thing it was not given is worse than one that names none.
 */
function scoreEvidenceSpecificity(body: string, evidence: EvidenceSelection): number {
  if (!EVIDENCE_TOPIC_PATTERNS[evidence.primary.type].test(body)) return 0;
  const supportingHonoured =
    !evidence.supporting || EVIDENCE_TOPIC_PATTERNS[evidence.supporting.type].test(body);
  return supportingHonoured ? 20 : 14;
}

/**
 * Whether the message is about *this* account.
 *
 * The name alone is worth a third of it and no more — a name-drop followed by
 * a generic question is the exact shape this sprint exists to remove.
 */
function scoreAccountRelevance(
  text: string,
  body: string,
  businessName: string,
  evidence: EvidenceSelection,
  fabricatedContext: boolean,
): number {
  const lower = text.toLocaleLowerCase("tr-TR");
  const named =
    businessName.length > 0 &&
    lower.includes(businessName.toLocaleLowerCase("tr-TR").slice(0, 12));
  // Scored against the body, so a hotel called "Marina Suites" earns the
  // specificity point for a real observation rather than for its own name.
  const specific = declaredTypes(evidence).some((type) =>
    EVIDENCE_TOPIC_PATTERNS[type].test(body),
  );
  return (named ? 8 : 0) + (specific ? 8 : 0) + (fabricatedContext ? 0 : 4);
}

function scoreQuestionGrounding(text: string, evidence: EvidenceSelection): number {
  const asks = questionSentences(text);
  if (asks.length === 0) return 0;
  const exactlyOne = (text.match(/\?/gu) ?? []).length <= 1 ? 8 : 0;
  const terms = declaredTypes(evidence).flatMap((type) => EVIDENCE_GROUNDING_TERMS[type]);
  const grounded = asks.some((sentence) => {
    const lower = sentence.toLocaleLowerCase("tr-TR");
    return terms.some((term) => lower.includes(term)) || EVIDENCE_ANAPHORA.test(sentence);
  });
  return exactlyOne + (grounded ? 12 : 0);
}

const JARGON_SNIFF =
  /(operasyonel|optimiz|dönüşüm oranı|uçtan uca|sektör lideri|çözümümüz|kaldıraç|verimlilik)/iu;

/**
 * Length, jargon and sentence count — plus the hard fluency verdict.
 *
 * Before the fluency guard this dimension called "talepler … nerede durduğunu
 * takip etme yönteminizi" a perfect 15, because it was the right length and
 * used no jargon. A dimension named `naturalness` that rates unnatural Turkish
 * full marks is worse than no dimension at all, so it now bottoms out on the
 * same verdict that rejects the message.
 */
function scoreNaturalness(text: string, tone: Tone): number {
  if (!validateTurkishFluency(text, tone).ok) return 0;
  const sentences = splitSentences(text).length;
  const inBand =
    text.length >= FIRST_CONTACT_PREFERRED_MIN && text.length <= FIRST_CONTACT_PREFERRED_MAX;
  return (
    (JARGON_SNIFF.test(text) ? 0 : 5) +
    (sentences <= 3 ? 4 : 0) +
    (inBand ? 6 : 3)
  );
}

/**
 * How little work answering costs.
 *
 * A hotelier reading this on a phone between two check-ins answers a short,
 * concrete question and ignores a long abstract one. Length of the *ask* is
 * the honest proxy — not length of the message, which the hook legitimately
 * consumes.
 */
function scoreReplyEase(text: string): number {
  const asks = questionSentences(text);
  if (asks.length === 0) return 0;
  const longest = Math.max(...asks.map((sentence) => sentence.length));
  const brevity = longest <= 120 ? 6 : longest <= 160 ? 3 : 0;
  return brevity + (asks.some((sentence) => INTERROGATIVE(sentence)) ? 4 : 0);
}

/**
 * Whether the tone actually differs in *shape* rather than in adjectives.
 *
 * Soft opens the ask with stated curiosity, direct asks a binary the reader
 * answers with one of two words, consultative wonders out loud and never
 * punctuates with "?". Three paraphrases of one question score 0 here even
 * when all three are individually fine.
 */
function scoreToneDistinctiveness(text: string, tone: Tone): number {
  const endsIndirect = INDIRECT_CLOSE.test(text);
  const hasMark = text.includes("?");
  if (tone === "consultative") return endsIndirect && !hasMark ? 5 : hasMark ? 2 : 0;
  if (tone === "direct") return hasMark && BINARY_MARKER.test(text) ? 5 : hasMark ? 2 : 0;
  return hasMark && CURIOSITY_LEAD.test(text) ? 5 : hasMark ? 2 : 0;
}

/**
 * Grades one candidate message.
 *
 * `truthfulness` delegates wholesale to the validator: there is exactly one
 * definition of "sendable" in this codebase and it is not worth having a
 * second, softer copy of it here.
 */
export function scoreOutreachQuality(params: ScoreParams): OutreachQualityScore {
  const text = params.message.trim();
  const verdict = validateOutreachMessage({
    message: text,
    signals: params.signals,
    businessName: params.businessName,
    stance: params.stance ?? "first_contact",
    senderName: params.senderName,
    evidence: params.evidence,
    // So `truthfulness` also reflects the tone-shape rule; the engine rejects a
    // mismatch outright before it ever reaches a score, and the two must agree.
    tone: params.tone,
  });
  const fabricated =
    !verdict.ok && verdict.failures.includes("fabricated_social_context");

  const body = stripBusinessName(text, params.businessName);
  const parts = {
    evidenceSpecificity: scoreEvidenceSpecificity(body, params.evidence),
    accountRelevance: scoreAccountRelevance(
      text,
      body,
      params.businessName,
      params.evidence,
      fabricated,
    ),
    questionGrounding: scoreQuestionGrounding(text, params.evidence),
    naturalness: scoreNaturalness(text, params.tone),
    replyEase: scoreReplyEase(text),
    truthfulness: verdict.ok ? 10 : 0,
    toneDistinctiveness: scoreToneDistinctiveness(text, params.tone),
  };

  const total = Object.values(parts).reduce((sum, value) => sum + value, 0);
  return { total, ...parts };
}

/**
 * The score-derived failures, in the validator's vocabulary.
 *
 * Emitted so a rejected provider message is logged and tested with a reason
 * rather than a bare number. Thresholds are half of each dimension's weight:
 * losing more than half of "is this about them" or "can they answer this"
 * is the difference between a weak message and a pointless one.
 */
export function qualityFailures(score: OutreachQualityScore): ValidationFailure[] {
  const out: ValidationFailure[] = [];
  if (score.accountRelevance < OUTREACH_QUALITY_WEIGHTS.accountRelevance / 2) {
    out.push("low_account_relevance");
  }
  if (score.replyEase < OUTREACH_QUALITY_WEIGHTS.replyEase / 2) {
    out.push("low_reply_likelihood");
  }
  return out;
}

/** True when a provider message is good enough to show the founder. */
export function meetsProviderQualityBar(score: OutreachQualityScore): boolean {
  return score.total >= MIN_PROVIDER_QUALITY_TOTAL;
}
