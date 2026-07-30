/**
 * v3.7.9 — High-Relevance Account-Specific Outreach: the evidence model.
 *
 * The grounding layers before this one asked "is this claim true?". They all
 * passed, and the messages were still weak, because a *true* message can be
 * true of every hotel in the country:
 *
 *   "Merhaba, Türkay Otel için kısa bir not bırakmak istedim.
 *    Gelen talepleri ekip içinde kim takip ediyor?"
 *
 * Nothing in that is false. Swap the name and it is equally true of any other
 * property — which is exactly why it earns no reply. This module is the answer
 * to a different question: *what did we actually see about this specific
 * business, and can the message be reused unchanged for another one?*
 *
 * An evidence item is a directly observable, public, account-specific fact.
 * Never a score, never an inference, never a city. `signals.ts` still exists
 * and is still the truth boundary for what may be *asserted*; this module is
 * the narrower set of signals that are specific enough to *open* with.
 *
 * Deliberately excluded: a resolvable WhatsApp number from the phone field.
 * Every hotel with a mobile line has one, so it identifies nothing about this
 * account — only the WhatsApp link a business chose to publish on its own site
 * counts. Same reasoning for city and business type: "Antalya'dasınız" is not
 * personalization.
 *
 * Pure: no React, no I/O, no `server-only`. Runs in the route, in the engine
 * and under `node --test`.
 */

import { createHash } from "node:crypto";

export const PERSONALIZATION_EVIDENCE_TYPES = [
  "website_whatsapp_link",
  "booking_button",
  "instagram_channel",
  "contact_form",
  "multilingual_site",
  "multi_channel_presence",
  "property_positioning",
  "room_or_offer_variety",
  "ota_presence",
  "public_service_category",
] as const;

export type PersonalizationEvidenceType =
  (typeof PERSONALIZATION_EVIDENCE_TYPES)[number];

export type PersonalizationEvidence = {
  id: string;
  type: PersonalizationEvidenceType;
  labelTr: string;
  /** What was observed, in the words a message may use. */
  evidenceText: string;
  sourceUrl?: string;
  confidence: "verified" | "strong";
  capturedAt?: string;
  metadata?: Record<string, string | number | boolean>;
};

/**
 * Order in which evidence is chosen as the primary hook.
 *
 * First-party website reservation/contact evidence outranks everything: it is
 * the thing the business itself built to receive requests, so a question about
 * it is a question about their actual operation. OTA presence is last because
 * it is the least owned and the easiest to misread as a judgement.
 */
export const EVIDENCE_PRIORITY: readonly PersonalizationEvidenceType[] = [
  "website_whatsapp_link",
  "contact_form",
  "instagram_channel",
  "booking_button",
  "multi_channel_presence",
  "multilingual_site",
  "property_positioning",
  "public_service_category",
  "room_or_offer_variety",
  "ota_presence",
];

/**
 * Pairs that belong to the same operational flow.
 *
 * The v3.7.9 pain-discovery sprint enforced *exactly one* signal per first
 * message, which was right about the failure it was fixing (two unrelated
 * facts crammed into one breath) and wrong as a general rule: a WhatsApp link
 * and a booking button are one inbound-request flow, and naming both is what
 * makes "bu iki kanaldan gelen talepler aynı yerde mi ilerliyor?" a real
 * question instead of a vague one.
 *
 * The bar for adding a pair here is not "both are verified" — it is "the two
 * together produce one operational question that neither produces alone".
 * WhatsApp + review count clears the first bar and fails the second, which is
 * why it is absent.
 *
 * Symmetric: {@link isCoherentEvidenceCluster} checks both orderings.
 */
const COHERENT_CLUSTERS: ReadonlyArray<
  readonly [PersonalizationEvidenceType, PersonalizationEvidenceType]
> = [
  // one inbound reservation-request flow
  ["website_whatsapp_link", "booking_button"],
  ["website_whatsapp_link", "instagram_channel"],
  ["website_whatsapp_link", "contact_form"],
  ["booking_button", "contact_form"],
  ["instagram_channel", "contact_form"],
  // an OTA listing next to the direct path the business owns
  ["ota_presence", "booking_button"],
  ["ota_presence", "website_whatsapp_link"],
  // one demand-mix question: what the property is for, and what it sells
  ["property_positioning", "public_service_category"],
  ["property_positioning", "room_or_offer_variety"],
];

export function isCoherentEvidenceCluster(
  a: PersonalizationEvidenceType,
  b: PersonalizationEvidenceType,
): boolean {
  if (a === b) return false;
  return COHERENT_CLUSTERS.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a),
  );
}

/* -------------------------------------------------------------------------- */
/* building the pack                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Website observations the crawler may have captured.
 *
 * Every field is optional and absence means "we did not look" — never "it is
 * not there". Nothing here may be inferred from a score.
 */
export type EvidenceWebsiteIntelligence = {
  hasWhatsAppLink?: boolean;
  hasBookingCtaText?: boolean;
  hasBookingEngine?: boolean;
  hasContactForm?: boolean;
  /** Language codes or names offered by the site. Two or more is evidence. */
  languages?: string[];
  roomTypeCount?: number | null;
  offerCount?: number | null;
  /** Publicly stated positioning terms, already normalized by the crawler. */
  positioning?: string[];
  /** Publicly stated service categories (toplantı, düğün, spa …). */
  serviceCategories?: string[];
  url?: string;
  capturedAt?: string;
};

export type EvidenceInput = {
  businessType?: string;
  businessSignals?: string[];
  channels?: string[];
  hasInstagram?: boolean;
  hasOwnWebsite?: boolean;
  websiteIntelligence?: EvidenceWebsiteIntelligence | null;
};

const OTA_CHANNELS = new Set(["Booking", "Airbnb", "Expedia", "Hotels.com"]);

/** How each OTA is written in a message, as opposed to keyed internally. */
const OTA_DISPLAY_NAMES: Record<string, string> = { Booking: "Booking.com" };

/** Inbound channels the business owns, counted for `multi_channel_presence`. */
const OWNED_CHANNEL_TYPES = new Set<PersonalizationEvidenceType>([
  "website_whatsapp_link",
  "contact_form",
  "instagram_channel",
  "booking_button",
]);

/**
 * Positioning vocabulary, matched against publicly stated terms only.
 *
 * The key is the normalized token stored in metadata and used to ground the
 * question; the value is how it is written in a Turkish sentence.
 */
const POSITIONING_TERMS: ReadonlyArray<readonly [string, string]> = [
  ["termal", "termal"],
  ["spa", "spa"],
  ["resort", "resort"],
  ["aile", "aile"],
  ["butik", "butik"],
  ["kayak", "kayak"],
  ["plaj", "plaj"],
  ["marina", "marina"],
  ["uzun konaklama", "uzun konaklama"],
  ["şehir oteli", "şehir oteli"],
];

const SERVICE_TERMS: ReadonlyArray<readonly [string, string]> = [
  ["toplantı", "toplantı"],
  ["kongre", "kongre"],
  ["konferans", "konferans"],
  ["düğün", "düğün"],
  ["balo", "balo"],
  ["restoran", "restoran"],
];

function matchTerms(
  haystack: string[],
  terms: ReadonlyArray<readonly [string, string]>,
): { token: string; word: string } | null {
  const lower = haystack.map((v) => v.toLocaleLowerCase("tr-TR"));
  for (const [token, word] of terms) {
    if (lower.some((v) => v.includes(token))) return { token, word };
  }
  return null;
}

function clean(values: readonly (string | undefined | null)[]): string[] {
  return values
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function num(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Builds the evidence pack, highest-priority first.
 *
 * An empty result is a meaningful answer, not a failure: it means this lead has
 * no publicly observable, account-specific hook, and the engine must say
 * `needs_research` rather than write something reusable.
 */
export function buildPersonalizationEvidence(
  input: EvidenceInput,
): PersonalizationEvidence[] {
  const wi = input.websiteIntelligence ?? null;
  const out: PersonalizationEvidence[] = [];
  const url = wi?.url?.trim() || undefined;
  const capturedAt = wi?.capturedAt?.trim() || undefined;

  const push = (
    type: PersonalizationEvidenceType,
    labelTr: string,
    evidenceText: string,
    confidence: "verified" | "strong",
    metadata?: Record<string, string | number | boolean>,
    withUrl = true,
  ) => {
    out.push({
      id: `ev_${type}`,
      type,
      labelTr,
      evidenceText,
      confidence,
      ...(withUrl && url ? { sourceUrl: url } : {}),
      ...(capturedAt ? { capturedAt } : {}),
      ...(metadata ? { metadata } : {}),
    });
  };

  if (wi?.hasWhatsAppLink === true) {
    push(
      "website_whatsapp_link",
      "Web sitesinde WhatsApp rezervasyon bağlantısı",
      "web sitesinde yayımlanmış WhatsApp rezervasyon bağlantısı",
      "verified",
    );
  }

  if (wi?.hasContactForm === true) {
    push(
      "contact_form",
      "Web sitesinde iletişim formu",
      "web sitesinde yayımlanmış iletişim formu",
      "verified",
    );
  }

  if (input.hasInstagram === true) {
    push(
      "instagram_channel",
      "Instagram iletişim kanalı",
      "Instagram üzerinden açık iletişim kanalı",
      "verified",
      undefined,
      false,
    );
  }

  if (wi?.hasBookingCtaText === true || wi?.hasBookingEngine === true) {
    push(
      "booking_button",
      "Web sitesinde doğrudan rezervasyon adımı",
      "web sitesinde yayımlanmış doğrudan rezervasyon butonu",
      "verified",
      { engine: wi?.hasBookingEngine === true },
    );
  }

  const languages = clean(wi?.languages ?? []);
  if (languages.length >= 2) {
    push(
      "multilingual_site",
      "Çok dilli web sitesi",
      `web sitesinde ${languages.length} dil seçeneği`,
      "verified",
      { languageCount: languages.length },
    );
  }

  const positioning = matchTerms(
    clean([...(wi?.positioning ?? []), input.businessType, ...(input.businessSignals ?? [])]),
    POSITIONING_TERMS,
  );
  if (positioning) {
    push(
      "property_positioning",
      "Kamuya açık konumlandırma",
      `web sitesinde öne çıkan ${positioning.word} konumlandırması`,
      "strong",
      { positioning: positioning.token, word: positioning.word },
    );
  }

  const service = matchTerms(
    clean([...(wi?.serviceCategories ?? []), input.businessType, ...(input.businessSignals ?? [])]),
    SERVICE_TERMS,
  );
  if (service) {
    push(
      "public_service_category",
      "Kamuya açık hizmet kategorisi",
      `web sitesinde öne çıkan ${service.word} bölümü`,
      "strong",
      { category: service.token, word: service.word },
    );
  }

  const roomTypes = num(wi?.roomTypeCount);
  const offers = num(wi?.offerCount);
  if ((roomTypes !== null && roomTypes >= 3) || (offers !== null && offers >= 2)) {
    push(
      "room_or_offer_variety",
      "Farklı oda ve teklif seçenekleri",
      "web sitesinde birden fazla oda ve konaklama seçeneği",
      "verified",
      {
        ...(roomTypes !== null ? { roomTypeCount: roomTypes } : {}),
        ...(offers !== null ? { offerCount: offers } : {}),
      },
    );
  }

  const otaListed = (input.channels ?? []).filter((c) => OTA_CHANNELS.has(c));
  if (otaListed.length > 0) {
    // The channel key is the internal one ("Booking"); a message has to name
    // the platform the way the hotel's own staff would ("Booking.com").
    const channel = OTA_DISPLAY_NAMES[otaListed[0]] ?? otaListed[0];
    push(
      "ota_presence",
      "OTA görünürlüğü",
      `${channel} üzerinde yayımlanmış listeleme`,
      "verified",
      { channel },
      false,
    );
  }

  /*
   * Only raised at three or more owned inbound channels. At two, the coherent
   * cluster below already says it better by naming both — "birden fazla kanal"
   * is vaguer than "WhatsApp ve rezervasyon butonu" and would be the weaker
   * hook of the two.
   */
  const ownedChannels = out.filter((e) => OWNED_CHANNEL_TYPES.has(e.type)).length;
  if (ownedChannels >= 3) {
    push(
      "multi_channel_presence",
      "Birden fazla dijital iletişim kanalı",
      `${ownedChannels} ayrı dijital iletişim kanalı`,
      "verified",
      { channelCount: ownedChannels },
    );
  }

  const rank = (type: PersonalizationEvidenceType): number => {
    const index = EVIDENCE_PRIORITY.indexOf(type);
    return index === -1 ? EVIDENCE_PRIORITY.length : index;
  };
  return out.sort((a, b) => rank(a.type) - rank(b.type));
}

/* -------------------------------------------------------------------------- */
/* fingerprint (v3.8.2)                                                       */
/* -------------------------------------------------------------------------- */

/**
 * A deterministic digest of what the evidence pack actually *says*.
 *
 * v3.8.2's answer to a real gap: re-enrichment already recomputes
 * `websiteIntelligence` and therefore the next evidence pack, but nothing
 * ever compared the new pack to the one an existing draft was written from —
 * so a draft could keep reading "ready" after the business it was built on
 * had visibly changed (a WhatsApp link removed, a second language added, a
 * booking engine installed). This is the one comparison point that closes
 * that gap, without persisting the pack itself anywhere.
 *
 * Deliberately excludes everything that can change without the underlying
 * fact changing: pack order (a re-fetch may return channels in a different
 * order), `sourceUrl`/`capturedAt` (freshness, not content), `id` (derived
 * from `type`, never independently meaningful), and `labelTr`/`evidenceText`
 * (presentation, fully determined by the fields that remain). `metadata` is
 * kept — a room count moving from 3 to 8, or a channel count moving from 3 to
 * 5, is a real change in what the business can honestly be asked about.
 *
 * Only ever returns an opaque digest. The evidence itself never has to be
 * persisted for two fingerprints to be compared.
 */
export function computeEvidenceFingerprint(
  pack: readonly PersonalizationEvidence[],
): string {
  const stable = pack
    .map((item) => ({
      type: item.type,
      confidence: item.confidence,
      metadata: item.metadata
        ? Object.entries(item.metadata)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => [key, String(value)] as const)
        : [],
    }))
    // Sorted by type: `buildPersonalizationEvidence` emits at most one item
    // per type, so this alone gives a total, content-independent order.
    .sort((a, b) => a.type.localeCompare(b.type));

  const serialized = JSON.stringify(stable);
  return createHash("sha256").update(serialized, "utf8").digest("hex").slice(0, 32);
}

/* -------------------------------------------------------------------------- */
/* selection                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The evidence one message is written from.
 *
 * Exactly one primary — a message with no primary evidence has no reason to
 * exist — and at most one supporting item, which must sit in the same
 * operational flow (see {@link isCoherentEvidenceCluster}).
 */
export type EvidenceSelection = {
  primary: PersonalizationEvidence;
  supporting?: PersonalizationEvidence;
};

export type SelectEvidenceOptions = {
  /** Regenerate counter; rotates which item becomes the primary hook. */
  rotation?: number;
  /**
   * Whether a coherent second item may be added.
   *
   * The direct tone asks a binary question ("bu iki kanaldan gelen talepler
   * aynı yerde mi ilerliyor?"), which needs two channels to be a real
   * question. Soft and consultative stay on one, so the three tones differ in
   * structure rather than in wording.
   */
  allowSupporting?: boolean;
};

/** Picks the evidence for one message, or `null` when the pack is empty. */
export function selectEvidence(
  pack: readonly PersonalizationEvidence[],
  options: SelectEvidenceOptions = {},
): EvidenceSelection | null {
  if (pack.length === 0) return null;
  const rotation = Math.max(0, Math.floor(options.rotation ?? 0));
  const primary = pack[rotation % pack.length];
  if (options.allowSupporting !== true) return { primary };

  const supporting = pack.find(
    (candidate) =>
      candidate.id !== primary.id &&
      isCoherentEvidenceCluster(primary.type, candidate.type),
  );
  return supporting ? { primary, supporting } : { primary };
}

/* -------------------------------------------------------------------------- */
/* recognising evidence inside a written message                              */
/* -------------------------------------------------------------------------- */

/**
 * How each evidence type shows up in Turkish copy.
 *
 * Used by the validator to answer two questions no prompt instruction can
 * answer on its own: did the message actually use the evidence it was given,
 * and did it reach for a second one it was not given.
 *
 * `multi_channel_presence` has no pattern of its own — it is realised as the
 * phrase "birden fazla ... kanal", which names no single channel and therefore
 * cannot be double-counted against the concrete types.
 */
export const EVIDENCE_TOPIC_PATTERNS: Readonly<
  Record<PersonalizationEvidenceType, RegExp>
> = {
  website_whatsapp_link: /whatsapp/iu,
  booking_button:
    /(rezervasyon\s*(butonu|butonunu|çağrısı|motoru|alanı|adımı|adımını)|online rezervasyon|doğrudan rezervasyon)/iu,
  instagram_channel: /instagram/iu,
  // `form`, `formu`, `formunu`, `formdan`, `formlar…` — but never "formül".
  contact_form: /\bform(?!ül)\p{L}{0,6}\b/iu,
  multilingual_site: /(dil seçene|farklı dil|\bdilde\b|\bdillerde\b|\bdillerin\b)/iu,
  multi_channel_presence: /birden fazla[^.!?]{0,24}?kanal/iu,
  property_positioning:
    /(\btermal|\bspa\b|\bresort|\baile|\bbutik|\bkayak|\bplaj|\bmarina|uzun konaklama|şehir oteli)/iu,
  room_or_offer_variety: /(\boda(?!k)|konaklama seçene|\bpaket|teklif seçene)/iu,
  ota_presence: /(booking\.com|airbnb|expedia|\botalar|ota'lar)/iu,
  public_service_category: /(\btoplantı|\bkongre|\bkonferans|\bdüğün|\bbalo\b|\brestoran)/iu,
};

/**
 * Words that tie a question back to one evidence type.
 *
 * A question is grounded when it repeats one of these *or* refers back to the
 * observation with {@link EVIDENCE_ANAPHORA} — "buradan gelen talepler" is as
 * grounded as "WhatsApp'tan gelen talepler" and reads far less robotic.
 */
export const EVIDENCE_GROUNDING_TERMS: Readonly<
  Record<PersonalizationEvidenceType, readonly string[]>
> = {
  website_whatsapp_link: ["whatsapp", "hat"],
  booking_button: ["rezervasyon", "doğrudan"],
  instagram_channel: ["instagram"],
  contact_form: ["form"],
  multilingual_site: ["dil"],
  multi_channel_presence: ["kanal"],
  property_positioning: [
    "termal",
    "spa",
    "resort",
    "aile",
    "butik",
    "kayak",
    "plaj",
    "marina",
    "konaklama",
    "talep tür",
  ],
  room_or_offer_variety: ["oda", "konaklama", "paket", "teklif", "seçenek", "ihtiyaç"],
  // "doğrudan" deliberately absent: an OTA listing is the one evidence type a
  // question may never ground itself in *as* direct — see the Evidence
  // Semantic Coherence Guard below. "booking" plus the anaphora set is enough
  // to recognise a grounded OTA question.
  ota_presence: ["booking", "listeleme", "görünürlük"],
  public_service_category: [
    "toplantı",
    "kongre",
    "konferans",
    "düğün",
    "balo",
    "restoran",
    "talep tür",
  ],
};

/**
 * A question pointing back at the observation it follows.
 *
 * "Buradan gelen talepler…" carries the evidence without repeating the noun,
 * which is how a person actually writes. Recognised as grounding so the
 * validator does not force every question to restate "WhatsApp".
 */
export const EVIDENCE_ANAPHORA =
  /(buradan|oradan|bu hat|bu taraf|bu akış|bu talep|bu kanal|bu iki|bu form|bu seçenek|bu farklı|bu sayfa)/iu;

/**
 * Removes the business name before scanning a message for evidence.
 *
 * "Sandıklı Termal" is a name, not a claim about a thermal facility, and
 * "Marina Suites" is not a marina positioning. Without this the hotel's own
 * name counted as a second, undeclared signal and rejected a message that had
 * said nothing beyond its one real observation — which is the opposite of what
 * these rules are for.
 */
export function stripBusinessName(text: string, businessName?: string): string {
  const name = businessName?.trim();
  if (!name || name.length < 2) return text;
  return text.split(name).join(" ");
}

/** Evidence topics named anywhere in `text`, ignoring the business name. */
export function evidenceTopicsIn(
  text: string,
  businessName?: string,
): PersonalizationEvidenceType[] {
  const body = stripBusinessName(text, businessName);
  return PERSONALIZATION_EVIDENCE_TYPES.filter((type) =>
    EVIDENCE_TOPIC_PATTERNS[type].test(body),
  );
}

/** Stable id pair for draft metadata and logs. */
export function evidenceIds(selection: EvidenceSelection): {
  primaryEvidenceId: string;
  supportingEvidenceId?: string;
} {
  return {
    primaryEvidenceId: selection.primary.id,
    ...(selection.supporting ? { supportingEvidenceId: selection.supporting.id } : {}),
  };
}

/* -------------------------------------------------------------------------- */
/* v3.7.9 — Evidence Semantic Coherence Guard                                  */
/* -------------------------------------------------------------------------- */

/**
 * The operational meaning of an evidence item — distinct from its identity.
 *
 * A live run showed why identity (`PersonalizationEvidenceType`) is not
 * enough: the message correctly named both items ("Booking.com görünürlüğünü
 * hem de WhatsApp rezervasyon bağlantısını gördüm") and then asked "Doğrudan
 * gelen bu talepler ayrı mı takip ediliyor?" — a question that calls the
 * *entire* combined request stream "direct", which is false the moment an OTA
 * listing is one of the two sources. The type was grounded; the category was
 * not. This enum is what lets a validator ask the second, narrower question:
 * not just "did it name the right evidence" but "did it describe that
 * evidence as the kind of thing it actually is".
 */
export type EvidenceSemanticCategory =
  | "direct_messaging"
  | "direct_booking"
  | "ota"
  | "social_messaging"
  | "website_inquiry"
  | "multilingual"
  | "property_positioning"
  | "offer_or_room_variety";

/**
 * Single source of truth for what each evidence type actually *is*.
 *
 * `multi_channel_presence` is an aggregate observation ("3+ owned channels")
 * rather than a claim about one channel's nature, so it is mapped to
 * `direct_messaging` only as a conservative default — none of its rendered
 * bodies (`single_view_question`, `channel_ownership`) use category-specific
 * vocabulary, so the mapping is never actually exercised. `public_service_category`
 * shares `property_positioning`'s category: both describe what the property
 * publicly is or offers, neither is a channel.
 */
export const EVIDENCE_SEMANTIC_CATEGORY: Record<
  PersonalizationEvidenceType,
  EvidenceSemanticCategory
> = {
  website_whatsapp_link: "direct_messaging",
  booking_button: "direct_booking",
  instagram_channel: "social_messaging",
  contact_form: "website_inquiry",
  multilingual_site: "multilingual",
  multi_channel_presence: "direct_messaging",
  property_positioning: "property_positioning",
  room_or_offer_variety: "offer_or_room_variety",
  ota_presence: "ota",
  public_service_category: "property_positioning",
};

/**
 * How each category is named to the model, stated with its operational truth
 * baked in — "OTA" alone invites the model to guess what that means, and the
 * live defect shows the guess it reaches for by default is "a direct channel".
 */
export const EVIDENCE_SEMANTIC_CATEGORY_LABEL_TR: Record<
  EvidenceSemanticCategory,
  string
> = {
  direct_messaging: "doğrudan mesajlaşma kanalı",
  direct_booking: "doğrudan rezervasyon akışı",
  ota: "üçüncü taraf listeleme (DOĞRUDAN kanal DEĞİL)",
  social_messaging: "sosyal medya mesajlaşma kanalı",
  website_inquiry: "web sitesi iletişim formu",
  multilingual: "çok dilli web sitesi özelliği",
  property_positioning: "kamuya açık konumlandırma",
  offer_or_room_variety: "oda/teklif çeşitliliği",
};

/** The distinct categories a selection actually declares. */
export function evidenceSemanticCategoriesOf(
  selection: EvidenceSelection,
): Set<EvidenceSemanticCategory> {
  const out = new Set<EvidenceSemanticCategory>();
  out.add(EVIDENCE_SEMANTIC_CATEGORY[selection.primary.type]);
  if (selection.supporting) {
    out.add(EVIDENCE_SEMANTIC_CATEGORY[selection.supporting.type]);
  }
  return out;
}

function hasAny(
  set: ReadonlySet<EvidenceSemanticCategory>,
  candidates: ReadonlySet<EvidenceSemanticCategory>,
): boolean {
  for (const category of candidates) {
    if (set.has(category)) return true;
  }
  return false;
}

export type EvidenceSemanticIssue =
  | "ota_labeled_direct"
  | "ungrounded_direct_claim"
  | "booking_flow_labeled_message"
  | "social_evidence_recast_as_direct_channel";

/** Categories a "doğrudan" claim may legitimately describe. */
const DIRECT_GROUNDED_CATEGORIES = new Set<EvidenceSemanticCategory>([
  "direct_booking",
  "direct_messaging",
]);

/** Categories that legitimately explain "mesaj" wording in the question. */
const MESSAGING_FAMILY = new Set<EvidenceSemanticCategory>([
  "direct_messaging",
  "social_messaging",
  "website_inquiry",
]);

/**
 * "Doğrudan gelen [talepler/mesajlar]" — the collectivizing claim.
 *
 * This is the exact shape of the live defect: a participle ("gelen") applied
 * to a plural noun, asserting that the *incoming request stream* is direct.
 * That is a different (and much stronger) claim than "doğrudan rezervasyon
 * butonu" or "doğrudan iletişim seçeneği", which name a specific channel's
 * own nature and remain true regardless of what else was observed — those
 * phrasings are deliberately left alone by this pattern.
 */
const DIRECT_COLLECTIVE_CLAIM = /doğrudan\s+gelen/iu;

/** "Bu iki kanal ... doğrudan" — calling both members of a cluster direct. */
const DIRECT_CHANNEL_COLLECTIVE_CLAIM =
  /(iki|her iki|bu)\s+kanal\p{L}*[^.!?]{0,30}?doğrudan/iu;

/** Any use of "doğrudan" at all, for the ungrounded case. */
const ANY_DIRECT_CLAIM = /doğrudan/iu;

const MESSAGE_WORDING = /\bmesaj\p{L}*/iu;
const WHATSAPP_WORD = /whatsapp/iu;

/**
 * Detects a message that names the right evidence but mischaracterises what
 * kind of thing it is.
 *
 * Deliberately narrow, regex-based and first-contact-only — the same
 * pragmatic register as {@link EVIDENCE_TOPIC_PATTERNS} and the fluency guard.
 * `ANY_DIRECT_CLAIM` is broad (any "doğrudan" at all), which is safe here only
 * because this checker runs over a ~2-sentence account-specific message where
 * "doğrudan" has no other plausible use than a channel/traffic claim.
 */
export function findEvidenceSemanticMismatches(
  text: string,
  selection: EvidenceSelection,
): EvidenceSemanticIssue[] {
  const categories = evidenceSemanticCategoriesOf(selection);
  const issues: EvidenceSemanticIssue[] = [];

  const collectiveDirectClaim =
    DIRECT_COLLECTIVE_CLAIM.test(text) || DIRECT_CHANNEL_COLLECTIVE_CLAIM.test(text);
  if (categories.has("ota") && collectiveDirectClaim) {
    // An OTA listing is third-party traffic by definition — it can never be
    // folded into a claim that the combined request stream is "direct",
    // regardless of what it is paired with.
    issues.push("ota_labeled_direct");
  } else if (
    ANY_DIRECT_CLAIM.test(text) &&
    !hasAny(categories, DIRECT_GROUNDED_CATEGORIES)
  ) {
    // "Doğrudan" used with nothing in the selection that is actually direct —
    // an OTA-only lead described as having a "direct" flow, for instance.
    issues.push("ungrounded_direct_claim");
  }

  if (MESSAGE_WORDING.test(text) && !hasAny(categories, MESSAGING_FAMILY)) {
    // A booking button starts a reservation, not a conversation; "gelen
    // mesajlar" borrows a category (messaging) nothing in the selection has.
    issues.push("booking_flow_labeled_message");
  }

  if (
    categories.has("social_messaging") &&
    !categories.has("direct_messaging") &&
    WHATSAPP_WORD.test(text)
  ) {
    // Instagram evidence, described as if it were the WhatsApp link we never
    // verified.
    issues.push("social_evidence_recast_as_direct_channel");
  }

  return issues;
}
