/**
 * Server-side quality gate for a generated outreach message.
 *
 * Nothing reaches the founder's screen without passing this. The rules encode
 * the failure modes that make a message unsendable: it claims something we did
 * not verify, it reads like a pitch deck, it carries a price, or it is a
 * template with the placeholder still in it.
 */

import type { OutreachStance } from "./lifecycle.ts";
import { hasSignal, type SignalSet } from "./signals.ts";
import { isDuplicate, normalizeMessage } from "./text.ts";

/**
 * Length band.
 *
 * These were 240–420 preferred with a 520 ceiling, and that single fact was why
 * every message read like a brochure: a model told to fill 400 characters has
 * to keep explaining after it has said the one useful thing. A real WhatsApp
 * message from a founder is two or three sentences.
 */
export const MIN_LENGTH = 110;
export const MAX_LENGTH = 380;
/** The band the prompt aims for; outside it is allowed, just not preferred. */
export const PREFERRED_MIN = 160;
export const PREFERRED_MAX = 300;

/** A message longer than this many sentences is an explanation, not a note. */
export const MAX_SENTENCES = 4;
/** Naming three channels turns the message into a feature list. */
export const MAX_CHANNEL_MENTIONS = 2;

export type ValidationFailure =
  | "empty"
  | "too_short"
  | "too_long"
  | "too_many_sentences"
  | "too_many_channels"
  | "markdown"
  | "url"
  | "price"
  | "placeholder"
  | "banned_phrase"
  | "jargon"
  | "unverified_claim"
  | "fake_previous_contact"
  | "no_cta"
  | "repeated_cta"
  | "not_specific"
  | "duplicate";

export type ValidationResult =
  | { ok: true }
  | { ok: false; failures: ValidationFailure[] };

/** Startup-pitch and hard-sell vocabulary that breaks the consultative tone. */
const BANNED_PHRASES = [
  "ai destekli",
  "yapay zeka destekli",
  "platformumuz",
  "ürünümüz",
  "yenilikçi",
  "son fırsat",
  "kampanya",
  "hemen şimdi",
  "kaçırmayın",
  "garanti ediyoruz",
  "devrim",
  "çözüm ortağınız",
];

/**
 * Consultant-deck vocabulary.
 *
 * Separated from {@link BANNED_PHRASES} because these are not hard-sell — they
 * are worse. They read as competent and say nothing, which is exactly how a
 * message stops sounding like it came from a person. A hotelier reading
 * "operasyonel kaldıraç" knows a template wrote it.
 */
const JARGON_PHRASES = [
  "operasyonel kaldıraç",
  "operasyonel yük",
  "operasyonel verimlilik",
  "değerlendirme hacmi",
  "optimize et",
  "optimizasyon",
  "dönüşüm optimizasyonu",
  "süreçlerinizi inceledim",
  "dijital rezervasyon süreçlerini",
  "yük ikiye katlan",
  "verimliliğinizi maksimize",
  "dijital dönüşüm",
  "uçtan uca",
  "sektör lideri",
  "çözümümüz",
  "ticari fırsat",
];

const MARKDOWN = /(\*\*|__|^#{1,6}\s|^\s*[-*]\s+|\[[^\]]*\]\([^)]*\))/m;
const URL = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|com\.tr|tr)\b)/i;
const PRICE = /(₺|\bTL\b|\bEUR\b|\bUSD\b|\$|€|\b\d{3,}\s*(tl|lira)\b|\baylık\s*\d)/i;
const PLACEHOLDER = /(\{\{|\}\}|\[\s*(isim|otel|şehir|name|hotel|city)\s*\]|xxx|lorem)/i;

/**
 * A low-pressure ask. Deliberately broad — the point is that the message ends
 * by offering something, not that it uses one blessed sentence.
 */
const CTA_PATTERNS = [
  /paylaşabilirim/i,
  /gönderebilirim/i,
  /özetleyebilirim/i,
  /gösterebilirim/i,
  /anlatabilirim/i,
  /ilginizi çeker mi/i,
  /uygun olur mu/i,
  /anlamlı ol(ur|up)/i,
  /faydalı olur mu/i,
  /müsait misiniz/i,
  /yazabilirim/i,
  /bırakabilirim/i,
];

/**
 * Channel names, for the one-signal rule.
 *
 * Listing every channel a hotel might use turns a note into a capability
 * matrix. Two is the most a warm message can carry and still be about one
 * thing.
 */
const CHANNEL_PATTERNS = [
  /whatsapp/i,
  /instagram/i,
  /(web sitesi|websitesi|siteniz|internet siteniz)/i,
  /booking\.com/i,
  /telefon/i,
  /e-?posta|mail/i,
];

/**
 * Claims of a conversation that has not happened.
 *
 * Only reachable when the stance says we have actually written before. The
 * fallback bank cannot produce these, but a model handed a `needs_follow_up`
 * lead will reach for them unprompted — this is the backstop.
 */
const PREVIOUS_CONTACT_PATTERNS = [
  /önceki (görüşme|mesaj|konuşma|yazışma)/i,
  /son (görüşmemiz|konuşmamız|mesajım)/i,
  /geçen (hafta|ay|gün) (yazdığım|gönderdiğim|ilettiğim)/i,
  /daha önce (paylaştığım|yazmıştım|gönderdiğim|ilettiğim)/i,
  /görüşmemize istinaden/i,
  /tekrar yaz(ıyorum|dım)/i,
  /yazmıştım/i,
];

/** Counts sentences, tolerating the ellipses and multiple stops a model emits. */
function countSentences(text: string): number {
  return text
    .split(/[.!?…]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0).length;
}

/**
 * The closing ask, normalized.
 *
 * Used to catch a regenerate that changed the observation but kept the same
 * final sentence — which reads as the same message to the founder even when
 * the similarity score says otherwise.
 */
export function extractCta(text: string): string {
  const sentences = text
    .split(/[.!?…]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const last = sentences[sentences.length - 1] ?? "";
  return normalizeMessage(last);
}

/**
 * Claims that require a specific verified signal.
 *
 * The pattern is the *assertive* form only. "Yanıt süresi uzayabiliyor"
 * (hedged) is always fine; "yanıtlarınız gecikiyor" (asserted) needs evidence.
 */
const CLAIM_GATES: Array<{
  pattern: RegExp;
  requires: string[];
  failure: "unverified_claim";
}> = [
  {
    /*
     * Asserting they use WhatsApp when we never resolved a WhatsApp path.
     * Turkish agglutinates, so "WhatsApp'ınız" can carry further suffixes
     * ("...ınızdan", "...ınıza"). No trailing \b — the suffix chain continues.
     */
    pattern: /whatsapp['’]?(?:[ıi]n[ıi]z|tan|ten|dan|den|da|de)/i,
    requires: ["whatsapp_reachable", "website_whatsapp_link"],
    failure: "unverified_claim",
  },
  {
    // Asserting OTA dependence without a listing to point at.
    pattern: /(booking\.com|otalar|ota'lar|acentelere bağımlı|otalara bağımlı)/i,
    requires: ["ota_listed", "ota_dependency"],
    failure: "unverified_claim",
  },
  {
    pattern: /instagram['’]?(?:[ıi]n[ıi]z|tan|ten|dan|den|da|de)/i,
    requires: ["instagram_present", "social_demand"],
    failure: "unverified_claim",
  },
  {
    pattern: /(siteniz|web siteniz|internet siteniz)/i,
    requires: ["own_website"],
    failure: "unverified_claim",
  },
];

/** Definite-loss assertions we can never make — we cannot see their bookings. */
const DEFINITE_LOSS =
  /(taleplerinizi? kaç[ıi]r[ıi]yorsunuz|rezervasyon kaybediyorsunuz|müşteri kaybediyorsunuz|gelir kaybediyorsunuz|kesinlikle kaybediyor)/i;

export type ValidateParams = {
  message: string;
  signals: SignalSet;
  businessName: string;
  previousMessages?: readonly string[];
  /** Absent means first contact — the safe assumption. */
  stance?: OutreachStance;
};

export function validateOutreachMessage(params: ValidateParams): ValidationResult {
  const { message, signals, businessName } = params;
  const failures: ValidationFailure[] = [];
  const text = message.trim();

  if (text.length === 0) return { ok: false, failures: ["empty"] };
  if (text.length < MIN_LENGTH) failures.push("too_short");
  if (text.length > MAX_LENGTH) failures.push("too_long");
  if (countSentences(text) > MAX_SENTENCES) failures.push("too_many_sentences");

  const channelMentions = CHANNEL_PATTERNS.filter((pattern) => pattern.test(text)).length;
  if (channelMentions > MAX_CHANNEL_MENTIONS) failures.push("too_many_channels");

  if (MARKDOWN.test(text)) failures.push("markdown");
  if (URL.test(text)) failures.push("url");
  if (PRICE.test(text)) failures.push("price");
  if (PLACEHOLDER.test(text)) failures.push("placeholder");

  const lower = text.toLocaleLowerCase("tr-TR");
  if (BANNED_PHRASES.some((phrase) => lower.includes(phrase))) {
    failures.push("banned_phrase");
  }
  if (JARGON_PHRASES.some((phrase) => lower.includes(phrase))) {
    failures.push("jargon");
  }

  // A message may only claim a shared history when one exists.
  if (
    (params.stance ?? "first_contact") !== "follow_up" &&
    PREVIOUS_CONTACT_PATTERNS.some((pattern) => pattern.test(text))
  ) {
    failures.push("fake_previous_contact");
  }

  if (DEFINITE_LOSS.test(text)) failures.push("unverified_claim");

  for (const gate of CLAIM_GATES) {
    if (gate.pattern.test(text) && !gate.requires.some((key) => hasSignal(signals, key))) {
      failures.push(gate.failure);
      break;
    }
  }

  if (!CTA_PATTERNS.some((pattern) => pattern.test(text))) failures.push("no_cta");

  // Property-specific opening: the message must name the business or its city,
  // otherwise it is a circular that could go to anyone.
  const city = signals.verified.find((s) => s.key === "city")?.value;
  const mentionsName =
    businessName.length > 0 &&
    lower.includes(businessName.toLocaleLowerCase("tr-TR").slice(0, 12));
  const mentionsCity =
    typeof city === "string" && lower.includes(city.toLocaleLowerCase("tr-TR"));
  const mentionsProperty = /(işletmeniz|otelini|otelinizi|tesisiniz|tesisinizi)/i.test(text);
  if (!mentionsName && !mentionsCity && !mentionsProperty) failures.push("not_specific");

  if (params.previousMessages && params.previousMessages.length > 0) {
    if (isDuplicate(text, params.previousMessages)) failures.push("duplicate");

    // A new observation with the old closing ask still reads as a repeat.
    const cta = extractCta(text);
    if (
      cta.length > 0 &&
      params.previousMessages.some((prior) => extractCta(prior) === cta)
    ) {
      failures.push("repeated_cta");
    }
  }

  return failures.length === 0 ? { ok: true } : { ok: false, failures };
}
