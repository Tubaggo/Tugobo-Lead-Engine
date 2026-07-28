/**
 * Deterministic message bank used when the provider is off, slow, or returns
 * something that fails validation.
 *
 * Two independent banks, one per relationship stage:
 *
 *  - the account bank ({@link buildAccountFallbackMessage}) — first contact.
 *    v3.7.9's High-Relevance calibration replaced the previous generic
 *    question bank outright. That bank was signal-agnostic by design: fifteen
 *    bodies that named no channel and asked "gelen talepleri nasıl takip
 *    ediyorsunuz?". Every one of them was true of every hotel in the country,
 *    which is exactly why they earned nothing. A fallback is no longer allowed
 *    to be generic — it is built from the same {@link EvidenceSelection} the
 *    provider was given, so the safe path and the AI path make the *same*
 *    account-specific observation and differ only in wording.
 *  - {@link REPLY_BANK} — the pre-existing capability bank (3 tones × 5
 *    angles), used once a lead has actually replied or a follow-up is due.
 *    Untouched: those stages have already earned the right to explain the
 *    product and invite a demo.
 *
 * There is no no-evidence fallback. A first-contact call without evidence does
 * not reach this module at all — see the `needs_research` gate in `engine.ts`.
 *
 * Every body in both banks is written to pass the validator on its own: no
 * price, no URL, no claim of any kind about how this hotel operates.
 */

import type { AccountAngle, ReplyAngle, VariationAngle } from "./angles.ts";
import { accountAnglesFor } from "./angles.ts";
import type { Tone } from "./contract.ts";
import type { EvidenceSelection, PersonalizationEvidenceType } from "./evidence.ts";

/**
 * The reply-stage angle bank is signal-agnostic by construction, so it may
 * not use `verified-channel-observation` — that angle exists specifically to
 * name a verified signal, and the deterministic bank never has one to name.
 */
type ReplyFallbackAngle = Exclude<ReplyAngle, "verified-channel-observation">;

export const REPLY_FALLBACK_ANGLES: ReplyFallbackAngle[] = [
  "single-screen-visibility",
  "follow-up-visibility-as-capability",
  "direct-booking-clarity",
  "short-demo-invitation",
  "founder-note",
];

/* -------------------------------------------------------------------------- */
/* Turkish morphology                                                         */
/* -------------------------------------------------------------------------- */

const ALL_VOWELS = /[aeıioöuü]/g;
const ONE_VOWEL = /[aeıioöuü]/;

function lastVowel(word: string): string {
  const found = word.toLocaleLowerCase("tr-TR").match(ALL_VOWELS);
  return found?.[found.length - 1] ?? "e";
}

/**
 * Turkish vowel harmony for the "de/da" clitic.
 *
 * The clitic agrees with the last vowel of the preceding word: back vowels
 * (a, ı, o, u) take "da", front vowels (e, i, ö, ü) take "de". Hardcoding
 * "de" produces "Kaş Konak de", which reads as broken Turkish to exactly the
 * hotelier we are trying not to sound like a bot to.
 */
export function deClitic(word: string): "de" | "da" {
  return "aıou".includes(lastVowel(word)) ? "da" : "de";
}

/**
 * The genitive suffix for a business name: "Türkay Otel" → "'in".
 *
 * Every account-specific opening puts the observation in the same breath as
 * the name ("Türkay Otel'in web sitesindeki WhatsApp bağlantısını gördüm"),
 * which is what stops the message from being a generic name-drop followed by a
 * generic question. That construction only reads as Turkish if the suffix
 * harmonises, and a vowel-final name additionally needs the buffer "n" —
 * "Çeşme Marina'nın", never "Çeşme Marina'ın".
 */
export function genitiveSuffix(word: string): string {
  const last = lastVowel(word);
  const harmony = "aı".includes(last)
    ? "ın"
    : "ei".includes(last)
      ? "in"
      : "ou".includes(last)
        ? "un"
        : "ün";
  const endsInVowel = ONE_VOWEL.test(word.slice(-1).toLocaleLowerCase("tr-TR"));
  return endsInVowel ? `'n${harmony}` : `'${harmony}`;
}

/** "Türkay Otel" → "Türkay Otel'in". */
export function possessive(businessName: string): string {
  return `${businessName}${genitiveSuffix(businessName)}`;
}

/* -------------------------------------------------------------------------- */
/* account bank — first contact                                               */
/* -------------------------------------------------------------------------- */

/**
 * What one evidence item looks like when it is the whole hook.
 *
 * Accusative, because it always follows the possessive name and precedes
 * "gördüm": "Türkay Otel'in web sitesindeki WhatsApp rezervasyon bağlantısını
 * gördüm." `{word}` is replaced from the evidence metadata, so a positioning
 * hook names the actual positioning rather than the category.
 *
 * Deliberately third-person ("web sitesindeki", not "web sitenizdeki"): the
 * second-person form asserts the website as a fact about the recipient and
 * trips the validator's own-website claim gate, while the observation we
 * actually made is about a page, not about them.
 */
const SOLO_OBSERVATION_TR: Record<PersonalizationEvidenceType, string> = {
  website_whatsapp_link: "web sitesindeki WhatsApp rezervasyon bağlantısını",
  booking_button: "web sitesindeki doğrudan rezervasyon butonunu",
  instagram_channel: "Instagram üzerindeki iletişim seçeneğini",
  contact_form: "web sitesindeki iletişim formunu",
  multilingual_site: "web sitesindeki farklı dil seçeneklerini",
  multi_channel_presence: "birden fazla dijital iletişim kanalını",
  property_positioning: "web sitesinde öne çıkan {word} tarafını",
  public_service_category: "web sitesinde öne çıkan {word} bölümünü",
  room_or_offer_variety: "web sitesindeki farklı oda ve konaklama seçeneklerini",
  ota_presence: "{word} üzerindeki görünürlüğünü",
};

/**
 * The same evidence, shortened for a two-item hook.
 *
 * Rendered as "hem A hem de B", which keeps both signals in one clause and —
 * unlike the solo phrasing — never repeats "web sitesi", so a WhatsApp +
 * Instagram pair still lands inside the two-channel ceiling.
 */
const PAIR_FRAGMENT_TR: Record<PersonalizationEvidenceType, string> = {
  website_whatsapp_link: "WhatsApp rezervasyon bağlantısını",
  booking_button: "doğrudan rezervasyon butonunu",
  instagram_channel: "Instagram iletişim seçeneğini",
  contact_form: "iletişim formunu",
  multilingual_site: "farklı dil seçeneklerini",
  multi_channel_presence: "birden fazla iletişim kanalını",
  property_positioning: "{word} tarafını",
  public_service_category: "{word} bölümünü",
  room_or_offer_variety: "farklı oda seçeneklerini",
  ota_presence: "{word} görünürlüğünü",
};

function evidenceWord(type: PersonalizationEvidenceType, meta: Record<string, string | number | boolean> | undefined): string {
  const word = meta?.word ?? meta?.channel;
  if (typeof word === "string" && word.length > 0) return word;
  // Only the metadata-driven types carry `{word}`; anything else never asks.
  return type === "ota_presence" ? "Booking.com" : "konaklama";
}

function renderObservation(selection: EvidenceSelection): string {
  const { primary, supporting } = selection;
  const fill = (template: string, type: PersonalizationEvidenceType, meta?: Record<string, string | number | boolean>) =>
    template.replace("{word}", evidenceWord(type, meta));

  if (!supporting) {
    return fill(SOLO_OBSERVATION_TR[primary.type], primary.type, primary.metadata);
  }
  return `hem ${fill(PAIR_FRAGMENT_TR[primary.type], primary.type, primary.metadata)} hem de ${fill(
    PAIR_FRAGMENT_TR[supporting.type],
    supporting.type,
    supporting.metadata,
  )}`;
}

/**
 * One question per angle per tone — and three genuinely different *shapes*.
 *
 * Soft leads with curiosity and asks an open "how"; direct asks a binary the
 * reader can answer with one of two words; consultative wonders out loud and
 * closes on "…merak ettim." rather than a question mark, which the validator's
 * {@link INDIRECT_QUESTION} pattern recognises as a real question. Three
 * wordings of one question would not be three tones — this is what makes the
 * options worth having.
 *
 * Every question either repeats a grounding term from its evidence or points
 * back at the observation ("buradan", "bu iki kanaldan"), so the ask always
 * follows from the hook rather than sitting next to it.
 */
const ACCOUNT_QUESTION_BANK: Record<AccountAngle, Record<Tone, string>> = {
  whatsapp_follow_up_visibility: {
    soft: "Kısaca merak ettim: buradan gelen taleplerin son durumunu ekip içinde nasıl takip ediyorsunuz?",
    direct: "Buradan gelen talepler tek yerde mi ilerliyor, ayrı ayrı mı takip ediliyor?",
    consultative:
      "Buradan gelen taleplerin takibini hangi yöntemle yürüttüğünüzü merak ettim.",
  },
  whatsapp_ownership: {
    soft: "Kısaca merak ettim: bu hattan gelen talepleri ekip içinde kim takip ediyor?",
    direct: "Bu hattan gelen talepleri tek bir kişi mi takip ediyor, ekip mi paylaşıyor?",
    consultative:
      "Bu hattan gelen taleplerin sahipliğini ekip içinde kimin üstlendiğini merak ettim.",
  },
  whatsapp_open_request: {
    soft: "Bir şey merak ettim: buradan gelen taleplerden ilk yanıttan sonra açık kalanları hangi yöntemle takip ediyorsunuz?",
    direct: "İlk yanıttan sonra açık kalan bu talepler aynı yerde mi duruyor, ayrı bir listede mi?",
    consultative:
      "Bu hattan gelen taleplerin ilk yanıttan sonra hangi adımda ilerlediğini merak ettim.",
  },
  channel_handoff: {
    soft: "Kısaca merak ettim: bu iki kanaldan gelen talepler ekip içinde nasıl birleşiyor?",
    direct: "Bu iki kanaldan gelen talepler aynı yerde mi ilerliyor, ayrı ayrı mı takip ediliyor?",
    consultative: "Bu iki kanaldan gelen taleplerin hangi noktada birleştiğini merak ettim.",
  },
  single_view_question: {
    soft: "Kısaca merak ettim: bu talepleri ekip içinde nasıl sıraya alıyorsunuz?",
    direct: "Bu talepler tek yerde mi ilerliyor, ayrı ayrı mı takip ediliyor?",
    consultative:
      "Bu talepleri tek bir yerde mi yoksa ayrı ayrı mı takip ettiğinizi merak ettim.",
  },
  channel_ownership: {
    soft: "Kısaca merak ettim: bu akışın takibini ekip içinde kim üstleniyor?",
    direct: "Bu akışın takibini tek bir kişi mi üstleniyor, ekip mi paylaşıyor?",
    consultative: "Bu akışın takibini ekip içinde kimin üstlendiğini merak ettim.",
  },
  cross_channel_continuity: {
    soft: "Kısaca merak ettim: bu kanallardan gelen talepleri sırasıyla nasıl ilerletiyorsunuz?",
    direct: "Bu kanallardan gelen talepler tek akışta mı ilerliyor, ayrı ayrı mı takip ediliyor?",
    consultative: "Bu kanallardan gelen taleplerin tek akışta mı ilerlediğini merak ettim.",
  },
  language_handoff: {
    soft: "Kısaca merak ettim: farklı dillerde gelen talepleri ekip içinde nasıl yönlendiriyorsunuz?",
    direct: "Farklı dillerde gelen talepler aynı ekipte mi ilerliyor, ayrı ayrı mı yönlendiriliyor?",
    consultative:
      "Farklı dillerde gelen taleplerin ekip içinde nasıl yönlendirildiğini merak ettim.",
  },
  multilingual_ownership: {
    soft: "Kısaca merak ettim: farklı dillerde gelen talepleri ekip içinde kim karşılıyor?",
    direct: "Farklı dillerde gelen talepleri tek bir kişi mi karşılıyor, ekip mi paylaşıyor?",
    consultative:
      "Farklı dillerde gelen talepleri ekip içinde kimin karşıladığını merak ettim.",
  },
  positioning_request_split: {
    soft: "Kısaca merak ettim: bu farklı talep türlerini ekip içinde nasıl ayırıyorsunuz?",
    direct: "Bu farklı talep türleri aynı ekipte mi ilerliyor, ayrı ekiplerde mi?",
    consultative: "Bu farklı talep türlerinin aynı ekipte mi ilerlediğini merak ettim.",
  },
  intent_routing: {
    soft: "Kısaca merak ettim: farklı ihtiyaçlarla gelen talepleri ekip içinde nasıl ayırıyorsunuz?",
    direct: "Farklı ihtiyaçlarla gelen bu talepler tek listede mi ilerliyor, ayrı ayrı mı?",
    consultative: "Farklı ihtiyaçlarla gelen bu taleplerin nasıl ayrıştığını merak ettim.",
  },
  offer_follow_up: {
    soft: "Kısaca merak ettim: bu seçenekler için gelen talepleri hangi yöntemle takip ediyorsunuz?",
    direct: "Bu seçenekler için gelen talepler tek yerde mi ilerliyor, ayrı ayrı mı?",
    consultative:
      "Bu seçenekler için gelen taleplerin takibini hangi yöntemle yürüttüğünüzü merak ettim.",
  },
  /*
   * v3.7.9 Evidence Semantic Coherence Guard: these bodies used to say
   * "doğrudan gelen bu talepler", which folds an OTA listing — third-party
   * traffic by definition — into a claim that the whole request stream is
   * direct. This angle is used both for OTA alone and for OTA paired with a
   * genuinely direct channel, so its wording can never assume directness;
   * "buradan gelen" (anaphoric, see EVIDENCE_ANAPHORA) names the observation
   * without asserting anything about how the requests arrived.
   */
  direct_request_follow_up: {
    soft: "Kısaca merak ettim: buradan gelen taleplerin takibi ekip içinde nasıl ilerliyor?",
    direct: "Buradan gelen bu talepler ayrı mı takip ediliyor, aynı yerde mi ilerliyor?",
    consultative: "Buradan gelen bu taleplerin takibinin nasıl ilerlediğini merak ettim.",
  },
  contact_form_follow_up: {
    soft: "Kısaca merak ettim: formdan gelen talepleri ekip içinde nasıl takip ediyorsunuz?",
    direct: "Formdan gelen talepler tek yerde mi ilerliyor, ayrı ayrı mı takip ediliyor?",
    consultative:
      "Formdan gelen taleplerin takibini hangi yöntemle yürüttüğünüzü merak ettim.",
  },
};

export type AccountFallbackParams = {
  tone: Tone;
  businessName: string;
  evidence: EvidenceSelection;
  /** Regenerate nonce; selects the angle within the evidence's angle set. */
  rotation: number;
  /** Angles already used this round, so a retry lands somewhere new. */
  exclude?: readonly VariationAngle[];
};

export type FallbackResult = {
  message: string;
  variationAngle: VariationAngle;
};

/**
 * One account-specific fallback message.
 *
 * Same evidence as the provider was given, same observation, same grounded
 * question — only the wording is deterministic. That is what keeps the safe
 * path from silently degrading into a circular the moment the provider is
 * unavailable.
 */
export function buildAccountFallbackMessage(
  params: AccountFallbackParams,
): FallbackResult {
  const { tone, businessName, evidence, rotation } = params;
  const excluded = new Set(params.exclude ?? []);
  const all = accountAnglesFor(evidence);
  const pool = all.filter((angle) => !excluded.has(angle));
  const angles = pool.length > 0 ? pool : all;
  const angle = angles[((rotation % angles.length) + angles.length) % angles.length];

  const message =
    `Merhaba, ${possessive(businessName)} ${renderObservation(evidence)} gördüm. ` +
    ACCOUNT_QUESTION_BANK[angle][tone];

  return { message, variationAngle: angle };
}

/* -------------------------------------------------------------------------- */
/* reply bank — follow-up and demo confirmation                               */
/* -------------------------------------------------------------------------- */

/**
 * `{opening}` is replaced with a property-specific first clause.
 *
 * Shape of every body: one sentence saying what TUGOBO does, one low-pressure
 * ask. Combined with the opening that is three short sentences — the
 * validator's ceiling — and lands in the 150–220 character band.
 *
 * The closing ask differs across angles on purpose, so walking the bank on
 * regenerate changes the ending as well as the subject.
 */
const REPLY_BANK: Record<ReplyFallbackAngle, Record<Tone, string>> = {
  "single-screen-visibility": {
    soft: "{opening} TUGOBO, gelen rezervasyon taleplerini tek bir ekranda topluyor. Uygun olursa çok kısa bir örnek paylaşabilirim.",
    direct:
      "{opening} TUGOBO, gelen rezervasyon taleplerini tek ekranda toplayıp hangisinin sırada olduğunu gösteriyor. İsterseniz nasıl göründüğünü kısaca paylaşabilirim.",
    consultative:
      "{opening} TUGOBO'yu, rezervasyon taleplerini tek ekranda görünür tutmak için geliştiriyoruz. Bu tür bir görünürlük sizin için anlamlı olur mu?",
  },
  "follow-up-visibility-as-capability": {
    soft: "{opening} TUGOBO, cevap bekleyen talebi siz kapatana kadar görünür tutuyor. Uygun olduğunuzda kısa bir örnek gönderebilirim.",
    direct:
      "{opening} TUGOBO, cevap bekleyen talepleri sırayla önünüzde tutuyor. Kısa bir ekran örneği gönderebilirim.",
    consultative:
      "{opening} TUGOBO'yu, cevap bekleyen talebin görünür kalması için geliştiriyoruz. Böyle bir düzen sizin için faydalı olur mu?",
  },
  "direct-booking-clarity": {
    soft: "{opening} TUGOBO, gelen bir talebin rezervasyona giden adımını tek yerde gösteriyor. İsterseniz tek ekranlık bir görüntü bırakabilirim.",
    direct:
      "{opening} TUGOBO, talepten rezervasyona giden adımı tek ekranda net tutuyor. Tek ekranlık bir örnek bırakabilirim.",
    consultative:
      "{opening} TUGOBO'yu, talepten rezervasyona giden adımı tek yerde netleştirmek için geliştiriyoruz. Bu tarafı tek yerde görmek ilginizi çeker mi?",
  },
  "short-demo-invitation": {
    soft: "{opening} TUGOBO'nun tek yaptığı, rezervasyon taleplerini tek yerde görünür kılmak. Dilerseniz 2 dakikalık bir örnek gösterebilirim.",
    direct:
      "{opening} TUGOBO tek bir şey yapıyor: rezervasyon taleplerini tek yerde görünür kılıyor. Nasıl çalıştığını 2 dakikada gösterebilirim.",
    consultative:
      "{opening} TUGOBO, rezervasyon taleplerini tek yerde görünür kılmak dışında bir şey yapmıyor. Uygunsa çok kısa bir örnek paylaşabilirim.",
  },
  "founder-note": {
    soft: "{opening} Otellerin rezervasyon taleplerini tek yerde topladığı TUGOBO üzerinde çalışıyorum. Sizin için anlamlı olur mu, merak ettim.",
    direct:
      "{opening} Rezervasyon taleplerini tek yerde toplayan TUGOBO üzerinde çalışıyorum. İki cümlede ne yaptığımızı anlatabilirim.",
    consultative:
      "{opening} Rezervasyon taleplerini tek yerde toplayan TUGOBO'yu geliştiriyorum. Değerlendirmeniz için kısa bir örnek gönderebilirim.",
  },
};

/**
 * Opening clauses, rotated so repeated fallbacks do not all start alike.
 *
 * Only the follow-up set survives. The first-contact set went with the generic
 * bank, and one of its four templates — "{city} tarafında birkaç işletmeyle
 * konuşuyorum; {name} {de} aklıma geldi" — is now an explicit
 * `fabricated_social_context` failure: we are not talking to several
 * businesses in that region, and the hotel did not come to mind. Invented
 * familiarity was the most expensive thing in the old bank, and it was in the
 * opening line.
 */
const FOLLOW_UP_OPENINGS: string[] = [
  "Merhaba, {name} için yazdığım notun üzerine kısa bir ekleme yapayım.",
  "Merhaba, {name} tarafına yazmıştım; tek bir şey daha paylaşmak istedim.",
  "Merhaba, {name} için bir konuyu daha eklemek istedim.",
];

/**
 * Demo confirmation is not a pitch, so it does not use either angle bank.
 *
 * A lead with a meeting on the calendar has already heard the argument; the
 * only useful message is a short confirmation.
 */
const DEMO_CONFIRM_BANK: Record<Tone, string> = {
  soft: "Merhaba, {name} için planladığımız görüşmeyi teyit etmek istedim. Belirlediğimiz saatte müsait misiniz? Ayrıca bir hazırlık gerekmiyor.",
  direct:
    "Merhaba, {name} için planladığımız görüşme hâlâ uygun mu? Görüşmede TUGOBO'nun tek ekranını 10 dakikada gösterebilirim.",
  consultative:
    "Merhaba, {name} için planladığımız görüşmeyi teyit edeyim. Önceden bir hazırlık gerekmiyor; merak ettiğiniz bir konu varsa görüşmeden önce yazabilirim.",
};

/**
 * Fallback request.
 *
 * A discriminated union rather than an optional field: first contact without
 * an evidence selection has no safe message to produce, and making that
 * unrepresentable is better than returning something generic and calling it a
 * fallback.
 */
export type FallbackParams =
  | {
      stance: "follow_up" | "demo_confirm";
      tone: Tone;
      businessName: string;
      city?: string;
      /** Regenerate nonce; shifts both the angle and the opening. */
      rotation: number;
      /** Angles already tried this round, so a retry lands somewhere new. */
      exclude?: readonly VariationAngle[];
      evidence?: undefined;
    }
  | {
      stance?: "first_contact";
      tone: Tone;
      businessName: string;
      city?: string;
      rotation: number;
      exclude?: readonly VariationAngle[];
      /** Required at first contact — there is nothing else to be specific about. */
      evidence: EvidenceSelection;
    };

/**
 * Produces one fallback message.
 *
 * `rotation` selects the angle, so the caller can walk the bank by
 * incrementing it until a non-duplicate comes out. Stance picks the bank:
 * `demo_confirm` gets the confirmation line, `follow_up` gets the capability
 * bank it always used, and `first_contact` (the default) gets the account
 * bank built from its evidence.
 */
export function buildFallbackMessage(params: FallbackParams): FallbackResult {
  const { tone, businessName, rotation } = params;

  /*
   * Branch on the evidence rather than on the stance: `stance` is optional in
   * the first-contact variant (its default), and an optional property cannot
   * narrow a union. `evidence` is required there and absent everywhere else,
   * so it is the discriminant that actually works.
   */
  if (params.evidence) {
    return buildAccountFallbackMessage({
      tone,
      businessName,
      evidence: params.evidence,
      rotation,
      exclude: params.exclude,
    });
  }

  if (params.stance === "demo_confirm") {
    return {
      message: DEMO_CONFIRM_BANK[tone].replace("{name}", businessName),
      variationAngle: "short-demo-invitation",
    };
  }

  {
    const template =
      FOLLOW_UP_OPENINGS[
        ((rotation % FOLLOW_UP_OPENINGS.length) + FOLLOW_UP_OPENINGS.length) %
          FOLLOW_UP_OPENINGS.length
      ];
    const opening = template.replace("{name}", businessName);
    const excluded = new Set(params.exclude ?? []);
    const pool = REPLY_FALLBACK_ANGLES.filter((angle) => !excluded.has(angle));
    const angles = pool.length > 0 ? pool : REPLY_FALLBACK_ANGLES;
    const angle = angles[((rotation % angles.length) + angles.length) % angles.length];
    return {
      message: REPLY_BANK[angle][tone].replace("{opening}", opening),
      variationAngle: angle,
    };
  }
}

/** Total distinct fallback bodies available in the reply bank. Asserted in tests. */
export const REPLY_FALLBACK_VARIANT_COUNT = REPLY_FALLBACK_ANGLES.length * 3;
