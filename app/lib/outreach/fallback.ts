/**
 * Deterministic message bank used when the provider is off, slow, or returns
 * something that fails validation.
 *
 * The old fallback was effectively one template per theme, which is why
 * regenerate felt broken whenever the LLM was unavailable. This is 3 tones × 4
 * angles = 12 distinct bodies, each written to pass the validator on its own:
 * hedged language only, a low-pressure CTA, no price, no URL, no claim that
 * needs evidence the angle gate has not already checked.
 *
 * Every sentence here is safe for a lead we know almost nothing about. Anything
 * property-specific is injected from verified signals by the caller.
 */

import type { VariationAngle } from "./angles.ts";
import type { Tone } from "./contract.ts";
import type { OutreachStance } from "./lifecycle.ts";

type FallbackAngle = Extract<
  VariationAngle,
  | "channel-consolidation"
  | "missed-follow-up"
  | "response-speed"
  | "direct-booking"
  | "founder-operations"
>;

export const FALLBACK_ANGLES: FallbackAngle[] = [
  "channel-consolidation",
  "missed-follow-up",
  "response-speed",
  "direct-booking",
  "founder-operations",
];

/**
 * `{opening}` is replaced with a property-specific first clause.
 *
 * Rewritten in v3.7.6 for warmth. The previous bodies were three long hedged
 * clauses that read like a consultant's summary — technically safe and
 * completely lifeless. These are two short sentences: one thing that gets
 * harder, one thing TUGOBO does about it, one ask.
 *
 * Every body is still hedged ("olabiliyor", "zorlaşabiliyor") and still asserts
 * nothing about this hotel's numbers. What changed is the voice: first person,
 * present tense, the way a founder actually writes.
 *
 * The closing ask differs across angles on purpose, so walking the bank on
 * regenerate changes the ending as well as the subject.
 */
const BANK: Record<FallbackAngle, Record<Tone, string>> = {
  "channel-consolidation": {
    soft: "{opening} Rezervasyon talepleri farklı yerlerden gelince takibi dağılabiliyor. TUGOBO'yu tam da bunu tek yerde toplamak için geliştiriyoruz; uygun olursa size kısa bir örnek gönderebilirim.",
    direct:
      "{opening} Talepler ayrı yerlere düşünce hangisinin cevap beklediği kaybolabiliyor. TUGOBO hepsini tek ekranda topluyor; nasıl çalıştığını 2 dakikada gösterebilirim.",
    consultative:
      "{opening} Talep birden fazla yere düşünce hangisinin beklediğini hatırlamak zorlaşabiliyor. TUGOBO bu akışı tek yerde tutuyor; sizin için anlamlı olup olmadığını kısa bir örnek üzerinden paylaşabilirim.",
  },
  "missed-follow-up": {
    soft: "{opening} Yoğun günlerde ilk mesajdan sonraki takip kolayca atlanabiliyor. TUGOBO hangi talebin cevap beklediğini hatırlatıyor; uygun olduğunuzda kısaca paylaşabilirim.",
    direct:
      "{opening} İlk yanıt verilir ama ikinci takip çoğu zaman unutuluyor. TUGOBO bekleyen talepleri önünüze getiriyor; kısa bir ekran görüntüsüyle gösterebilirim.",
    consultative:
      "{opening} Kaybedilen talepler genelde ilgisizlikten değil, takibin zamanında yapılamamasından oluyor. TUGOBO bunu hatırlatan basit bir düzen kuruyor; bu yaklaşım sizin için anlamlı olur mu?",
  },
  "response-speed": {
    soft: "{opening} Gelen mesajlara dönüş biraz uzayınca ilgi doğal olarak soğuyabiliyor. TUGOBO bekleyen talebi görünür tutuyor; uygun olursa kısa bir örnek gönderebilirim.",
    direct:
      "{opening} Dönüş birkaç saati bulduğunda misafir genelde başka yere bakıyor. TUGOBO hangi talebin beklediğini anında gösteriyor; nasıl çalıştığını 2 dakikada anlatabilirim.",
    consultative:
      "{opening} Dönüş hızı çoğu zaman fiyattan daha belirleyici olabiliyor. TUGOBO'yu bu tarafı sadeleştirmek için geliştiriyoruz; kısa bir ekran görüntüsüyle gösterebilirim.",
  },
  "direct-booking": {
    soft: "{opening} Gelen ilginin rezervasyona dönmesi bazen birkaç adım fazla gerektirebiliyor. TUGOBO bu adımları kısaltıyor; uygun olduğunuzda kısaca paylaşabilirim.",
    direct:
      "{opening} İlgi ile rezervasyon arasındaki adım net olmayınca talep orada kalıyor. TUGOBO bu akışı kısaltıyor; nasıl çalıştığını 2 dakikada gösterebilirim.",
    consultative:
      "{opening} Direkt gelen talebi rezervasyona taşımak, ek trafikten daha hızlı sonuç verebiliyor. TUGOBO'yu bu akış için geliştiriyoruz; bu yaklaşım sizin için anlamlı olur mu?",
  },
  "founder-operations": {
    soft: "{opening} İşletmeyi yürütürken talep takibi de üstte kalınca gün kolayca doluyor. TUGOBO bu tarafı hafifletmek için üzerinde çalıştığımız bir araç; uygun olursa kısa bir örnek gönderebilirim.",
    direct:
      "{opening} Operasyonu yürütürken talepleri de takip etmek zaman alıyor. TUGOBO bekleyenleri tek ekranda topluyor; nasıl çalıştığını 2 dakikada gösterebilirim.",
    consultative:
      "{opening} Küçük ekiplerde en pahalı iş, hangi talebin nerede kaldığını hatırlamak oluyor. TUGOBO bunu tek yerde tutuyor; sizin için anlamlı olup olmadığını kısa bir örnek üzerinden paylaşabilirim.",
  },
};

/**
 * Turkish vowel harmony for the "de/da" clitic.
 *
 * The clitic agrees with the last vowel of the preceding word: back vowels
 * (a, ı, o, u) take "da", front vowels (e, i, ö, ü) take "de". Hardcoding
 * "de" produces "Kaş Konak de", which reads as broken Turkish to exactly the
 * hotelier we are trying not to sound like a bot to.
 */
export function deClitic(word: string): "de" | "da" {
  const vowels = word.toLocaleLowerCase("tr-TR").match(/[aeıioöuü]/g);
  const last = vowels?.[vowels.length - 1];
  return last && "aıou".includes(last) ? "da" : "de";
}

/**
 * Opening clauses, rotated so repeated fallbacks do not all start alike.
 *
 * Split by stance because the opening is the only place a message claims a
 * shared history. The follow-up set is reachable solely when the caller has
 * established that an outbound message actually went out; nothing in the
 * first-contact set references a prior exchange.
 */
const OPENINGS: Record<"first_contact" | "follow_up", string[]> = {
  first_contact: [
    "Merhaba, {name} için kısa bir fikir paylaşmak istedim.",
    "Merhaba, {name} sayfasına bakarken aklıma bir şey geldi.",
    "Merhaba, {city} tarafına bakarken {name} {de} dikkatimi çekti.",
    "Merhaba, {name} için kısaca yazmak istedim.",
  ],
  follow_up: [
    "Merhaba, {name} için yazdığım notun üzerine kısa bir ekleme yapayım.",
    "Merhaba, {name} tarafına yazmıştım; tek bir şey daha paylaşmak istedim.",
    "Merhaba, {name} için bir konuyu daha eklemek istedim.",
  ],
};

/**
 * Demo confirmation is not a pitch, so it does not use the angle bank.
 *
 * A lead with a meeting on the calendar has already heard the argument; the
 * only useful message is a short confirmation.
 */
const DEMO_CONFIRM_BANK: Record<Tone, string> = {
  soft: "Merhaba, {name} için planladığımız görüşmeyi teyit etmek istedim. Uygun olursa görüşmede rezervasyon akışınızı birlikte bakarız.",
  direct:
    "Merhaba, {name} için planladığımız görüşme hâlâ uygun mu? Görüşmede mevcut rezervasyon akışınızı 10 dakikada birlikte gözden geçiririz.",
  consultative:
    "Merhaba, {name} için planladığımız görüşmeyi teyit edeyim. Hazırlık olarak yalnızca hangi kanallardan talep aldığınızı düşünmeniz yeterli.",
};

function buildOpening(params: {
  businessName: string;
  city?: string;
  rotation: number;
  stance: OutreachStance;
}): string {
  const { businessName, city, rotation } = params;
  const set =
    params.stance === "follow_up" ? OPENINGS.follow_up : OPENINGS.first_contact;
  // The city template is only usable when we actually have a city.
  const usable = city ? set : set.filter((o) => !o.includes("{city}"));
  const template = usable[((rotation % usable.length) + usable.length) % usable.length];
  return template
    .replace("{name}", businessName)
    .replace("{city}", city ?? "")
    .replace("{de}", deClitic(businessName));
}

export type FallbackParams = {
  tone: Tone;
  businessName: string;
  city?: string;
  /** Regenerate nonce; shifts both the angle and the opening. */
  rotation: number;
  /** Angles already tried this round, so a retry lands somewhere new. */
  exclude?: readonly VariationAngle[];
  /** Relationship position. Absent means first contact. */
  stance?: OutreachStance;
};

export type FallbackResult = {
  message: string;
  variationAngle: VariationAngle;
};

/**
 * Produces one fallback message.
 *
 * `rotation` selects the angle, so the caller can walk the bank by
 * incrementing it until a non-duplicate comes out.
 */
export function buildFallbackMessage(params: FallbackParams): FallbackResult {
  const { tone, businessName, city, rotation } = params;
  const stance = params.stance ?? "first_contact";

  if (stance === "demo_confirm") {
    return {
      message: DEMO_CONFIRM_BANK[tone].replace("{name}", businessName),
      variationAngle: "channel-consolidation",
    };
  }

  const excluded = new Set(params.exclude ?? []);
  const pool = FALLBACK_ANGLES.filter((angle) => !excluded.has(angle));
  const angles = pool.length > 0 ? pool : FALLBACK_ANGLES;

  const angle = angles[((rotation % angles.length) + angles.length) % angles.length];
  const opening = buildOpening({ businessName, city, rotation, stance });
  const message = BANK[angle][tone].replace("{opening}", opening);

  return { message, variationAngle: angle };
}

/** Total distinct fallback bodies available. Asserted in tests. */
export const FALLBACK_VARIANT_COUNT = FALLBACK_ANGLES.length * 3;
