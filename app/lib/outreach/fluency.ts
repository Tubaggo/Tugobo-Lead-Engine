/**
 * v3.7.9 — Native Turkish Fluency Guard.
 *
 * The layer nothing before it measured: whether the sentence reads like a
 * Turkish person wrote it.
 *
 * A live run produced this, and it passed every rule and scored 100:
 *
 *   "WhatsApp üzerinden gelen talepler ilk yanıttan sonra açık kaldığında
 *    nerede durduğunu takip etme yönteminizi merak ettim."
 *
 * It is grounded, respectful, correctly shaped for its tone, honest about the
 * product — and no hotel manager in Turkey would write it. Plural "talepler"
 * is bound to singular "durduğunu"; "takip etme yönteminizi" stacks a verbal
 * noun onto a method noun; the whole clause reads like English word order
 * pushed through a dictionary. The recipient does not know which rule was
 * broken. They just know a machine wrote it, which is the one impression this
 * entire engine exists to avoid.
 *
 * Scoring cannot express this either — `naturalness` was measuring length and
 * jargon, both of which that sentence passed. So fluency is a rule.
 *
 * Deliberately conservative: every pattern here fires on a construction that is
 * *grammatically or idiomatically wrong*, never on one that is merely plain.
 * A false positive costs a good message; a false negative costs one awkward
 * message that the retry usually fixes anyway.
 *
 * Pure: no React, no I/O, no `server-only`.
 */

import type { Tone } from "./contract.ts";

export type FluencyIssue =
  | "plural_singular_mismatch"
  | "nested_verbal_nouns"
  | "heavy_nominalization"
  | "stacked_possessive_chain"
  | "repeated_takip"
  | "unnatural_indirect_question";

export type FluencyResult = { ok: true } | { ok: false; issues: FluencyIssue[] };

/* -------------------------------------------------------------------------- */
/* building blocks                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The `-DIk` verbal noun: "durduğunu", "ilerlediğini", "yürüttüğünüzü".
 *
 * Turkish consonant harmony gives both -dIk and -tIk, so the stem consonant is
 * a class. One of these per clause is normal and idiomatic — it is how an
 * indirect question is formed at all. Two stacked is where it stops sounding
 * like speech.
 */
const VERBAL_NOUN_DIK = /\p{L}+[dt][ıiuü][ğg][ıiuü](?:n[ıiuü]z?)?[ıiuü]?/giu;

/**
 * A `-mA` verbal noun handed straight to a "method" noun.
 *
 * "takip etme yönteminizi", "organize etme şeklinizi", "izleme biçiminizi" —
 * the shape a translation engine reaches for when the source said "the way you
 * track". Turkish says "nasıl takip ettiğinizi". There is no natural sentence
 * in this product's vocabulary that needs the nominalised form.
 */
const NOMINALIZED_METHOD =
  /\p{L}+m[ae]\s+(yöntem|şekil|şekl|biçim|tarz|usul|yolu|sürec)\p{L}*/iu;

/** "ilerleme durumunu", "gelişme durumunu" — a noun pile with no verb in it. */
const STATE_NOUN_PILE = /(ilerleme|gelişme|değişim|çalışma)\s+durum\p{L}*/iu;

/**
 * A participle noun carrying plural + possessive + genitive: "kalanlarının".
 *
 * A live consultative message produced "taleplerin … açık **kalanlarının** nasıl
 * takip edildiğini merak ettim". It is grammatical, and it is three suffixes
 * deep on a word that is *already* a derived participle and *already* the
 * clause's second genitive — the reader has to unpack it. Turkish has a
 * shorter way to say exactly the same thing ("açık kalan talepleri nasıl takip
 * ettiğinizi"), and a first message that makes someone re-read a clause has
 * spent its one chance.
 *
 * Gated on the participle stems rather than on the suffix chain, because the
 * chain alone is not the problem: "talep **türlerinin** aynı ekipte mi
 * ilerlediğini" is the identical morphology on a plain noun and reads
 * perfectly naturally. Stacking it onto a participle is what tips it over.
 */
const STACKED_POSSESSIVE =
  /\b(kalan|gelen|bekleyen|açılan|giden|yapılan|olan|ilerleyen)l[ae]r[ıi]n[ıi]n\b/iu;

/** Bare nominative plurals that cannot govern a singular participle. */
const NOMINATIVE_PLURAL =
  /\b(talepler|mesajlar|istekler|rezervasyonlar|sorular|yanıtlar|cevaplar|misafirler)\b/iu;

/** The plural participle a plural subject would actually take. */
const PLURAL_PARTICIPLE = /\p{L}+[dt][ıiuü]klar[ıi]n[ıi]?/iu;

/** Interrogative material an indirect question needs to be a question. */
const INTERROGATIVE_ELEMENT =
  /(hangi|nasıl|nerede|ne zaman|ne şekilde|kim|(?:^|[\s(])m[iıuü](?:sin(?:iz)?|sın(?:ız)?|sun(?:uz)?|sün(?:üz)?)?(?=$|[\s,.;:!?)]))/iu;

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?…]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function countMatches(text: string, pattern: RegExp): number {
  return (text.match(new RegExp(pattern.source, pattern.flags)) ?? []).length;
}

/* -------------------------------------------------------------------------- */
/* the rules                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A bare plural subject bound to a singular `-DIk` participle.
 *
 * "Talepler … nerede durduğunu" is simply ungrammatical: it needs either the
 * genitive subject ("taleplerin … durduğunu") or the plural participle
 * ("talepler … durdukları"). The bare-nominative test is what keeps this
 * narrow — "taleplerin" and "talepleri" are both fine before a singular
 * participle and neither matches {@link NOMINATIVE_PLURAL}.
 */
function hasPluralSingularMismatch(sentence: string): boolean {
  if (!NOMINATIVE_PLURAL.test(sentence)) return false;
  if (PLURAL_PARTICIPLE.test(sentence)) return false;
  return countMatches(sentence, VERBAL_NOUN_DIK) > 0;
}

/** Two stacked verbal nouns in one clause: a chain no one says out loud. */
function hasNestedVerbalNouns(sentence: string): boolean {
  return countMatches(sentence, VERBAL_NOUN_DIK) >= 2;
}

function hasHeavyNominalization(text: string): boolean {
  return NOMINALIZED_METHOD.test(text) || STATE_NOUN_PILE.test(text);
}

/**
 * "takip" twice in one sentence.
 *
 * Matched on the stem so "takip" and "takibini" count as the same word, which
 * is the point — saying it twice is what makes the sentence circle itself.
 */
function hasRepeatedTakip(sentence: string): boolean {
  return countMatches(sentence, /taki[pb]/giu) > 1;
}

/**
 * The consultative closing, checked as a structural family rather than as a
 * list of blessed strings.
 *
 * The natural families all look the same underneath: one interrogative element,
 * one verbal noun, then "merak ettim". Enumerating exact sentences would reject
 * perfectly idiomatic variants ("… tek bir yerde mi yoksa ayrı ayrı mı takip
 * ettiğinizi merak ettim") for not being on the list, so the family is what is
 * enforced. The heavy-nominalization and nested-chain rules above are what
 * actually exclude the translated-sounding members.
 */
function hasUnnaturalIndirectQuestion(text: string): boolean {
  const sentences = splitSentences(text);
  const closing = sentences[sentences.length - 1] ?? "";
  if (!/merak ettim\s*$/iu.test(closing)) return false;
  if (!INTERROGATIVE_ELEMENT.test(closing)) return true;
  return countMatches(closing, VERBAL_NOUN_DIK) !== 1;
}

/**
 * Checks one message for constructions a Turkish speaker would not produce.
 *
 * `tone` only widens the check: the consultative tone is the one that closes on
 * an indirect question, so it is the only one whose closing family is examined.
 * Everything else applies to every tone.
 */
export function validateTurkishFluency(message: string, tone?: Tone): FluencyResult {
  const text = message.trim();
  if (text.length === 0) return { ok: true };

  const issues: FluencyIssue[] = [];
  const sentences = splitSentences(text);

  if (sentences.some(hasPluralSingularMismatch)) issues.push("plural_singular_mismatch");
  if (sentences.some(hasNestedVerbalNouns)) issues.push("nested_verbal_nouns");
  if (hasHeavyNominalization(text)) issues.push("heavy_nominalization");
  if (STACKED_POSSESSIVE.test(text)) issues.push("stacked_possessive_chain");
  if (sentences.some(hasRepeatedTakip)) issues.push("repeated_takip");
  if (tone === "consultative" && hasUnnaturalIndirectQuestion(text)) {
    issues.push("unnatural_indirect_question");
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
