/**
 * Variation angles — the *subject* a message is about.
 *
 * Regenerate produces a genuinely different message by changing the angle, not
 * by reshuffling adjectives. Each angle declares which signals must exist
 * before it may be used, so an angle can never introduce a claim the lead data
 * does not support.
 *
 * v3.7.9 respectful calibration: the previous bank was named after the hotel's
 * assumed *problems* — missed-follow-up, response-speed, founder-operations —
 * and an angle named after a problem produces a message that asserts the
 * problem. Every angle here names a capability, a verified public signal, or an
 * invitation. None of them may state that this hotel is doing anything wrong,
 * because we cannot see their operation and have no standing to judge it.
 *
 * v3.7.9 pain-discovery calibration splits the bank in two. The six angles
 * above (renamed here {@link REPLY_ANGLES}) are safe *once a conversation
 * exists* — but a manual UI pass showed that leading with them on the very
 * first message still reads as a pitch, because every one of them explains
 * what TUGOBO does. A first message that explains the product is not trying
 * to start a conversation, it is trying to close one that never opened.
 * {@link FIRST_CONTACT_ANGLES} are the replacement: five angles that ask a
 * single, genuinely open operational question and say nothing about the
 * product at all.
 */

import type { EvidenceSelection, PersonalizationEvidenceType } from "./evidence.ts";
import type { OutreachStance } from "./lifecycle.ts";
import { hasSignal, type SignalSet } from "./signals.ts";

/**
 * Account-specific angles — the operational question one evidence pack asks.
 *
 * The question angles below ({@link FIRST_CONTACT_ANGLES}) removed the pitch
 * from a first message and were still reusable: "gelen talepleri ekip içinde
 * kim takip ediyor?" is a fine question to ask *anyone*, which is why it earned
 * nothing. These angles cannot be asked of anyone — each one only exists
 * because a specific public signal was observed, and swapping the hotel name
 * makes the question stop following from the observation.
 */
export const ACCOUNT_ANGLES = [
  "whatsapp_follow_up_visibility",
  "whatsapp_ownership",
  "whatsapp_open_request",
  "channel_handoff",
  "single_view_question",
  "channel_ownership",
  "cross_channel_continuity",
  "language_handoff",
  "multilingual_ownership",
  "positioning_request_split",
  "intent_routing",
  "offer_follow_up",
  "direct_request_follow_up",
  "contact_form_follow_up",
] as const;

export type AccountAngle = (typeof ACCOUNT_ANGLES)[number];

/**
 * Question-first angles for a cold first message.
 *
 * Each one earns the right to a reply, not a sale — the recipient should
 * finish reading and want to answer, not want to unsubscribe.
 *
 * Superseded as the *live* first-contact bank by {@link ACCOUNT_ANGLES}: a
 * first message now only reaches the provider when an evidence pack exists,
 * and an evidence pack always selects an account angle. These remain the
 * defined behaviour for a first-contact call made without evidence, which is
 * the shape every pre-v3.7.9 caller and test still exercises.
 */
export const FIRST_CONTACT_ANGLES = [
  "channel-workflow-question",
  "follow-up-method-question",
  "multi-channel-visibility-question",
  "ownership-question",
  "open-request-question",
] as const;

/** Capability angles, usable once a reply exists (reply / follow-up / demo-confirm). */
export const REPLY_ANGLES = [
  "verified-channel-observation",
  "single-screen-visibility",
  "follow-up-visibility-as-capability",
  "direct-booking-clarity",
  "short-demo-invitation",
  "founder-note",
] as const;

export const VARIATION_ANGLES = [
  ...ACCOUNT_ANGLES,
  ...FIRST_CONTACT_ANGLES,
  ...REPLY_ANGLES,
] as const;

export type FirstContactAngle = (typeof FIRST_CONTACT_ANGLES)[number];
export type ReplyAngle = (typeof REPLY_ANGLES)[number];
export type VariationAngle = (typeof VARIATION_ANGLES)[number];

/** Short Turkish label shown in the modal so the founder sees what changed. */
export const ANGLE_LABELS_TR: Record<VariationAngle, string> = {
  whatsapp_follow_up_visibility: "WhatsApp talep takibi",
  whatsapp_ownership: "WhatsApp hattı sahipliği",
  whatsapp_open_request: "WhatsApp açık talep",
  channel_handoff: "İki kanal devri",
  single_view_question: "Tek yer sorusu",
  channel_ownership: "Kanal sahipliği",
  cross_channel_continuity: "Kanallar arası süreklilik",
  language_handoff: "Dil yönlendirmesi",
  multilingual_ownership: "Çok dilli talep sahipliği",
  positioning_request_split: "Talep türü ayrımı",
  intent_routing: "İhtiyaç yönlendirmesi",
  offer_follow_up: "Teklif takibi",
  direct_request_follow_up: "Doğrudan talep takibi",
  contact_form_follow_up: "Form talebi takibi",
  "channel-workflow-question": "Kanal iş akışı sorusu",
  "follow-up-method-question": "Takip yöntemi sorusu",
  "multi-channel-visibility-question": "Çoklu kanal görünürlüğü sorusu",
  "ownership-question": "Sahiplik sorusu",
  "open-request-question": "Açık talep sorusu",
  "verified-channel-observation": "Doğrulanmış kanal gözlemi",
  "single-screen-visibility": "Tek ekran görünürlüğü",
  "follow-up-visibility-as-capability": "Takip görünürlüğü",
  "direct-booking-clarity": "Direkt rezervasyon netliği",
  "short-demo-invitation": "Kısa örnek daveti",
  "founder-note": "Kurucu notu",
};

/**
 * What each angle is allowed to talk about, in Turkish, for the prompt.
 *
 * Each brief states the subject *and* the claim it may not make. Stating the
 * boundary next to the subject works better than a global rule, because the
 * angle is the last instruction the model reads before writing.
 */
/**
 * Appended to every account brief.
 *
 * The account angles are the only first-contact briefs the provider ever sees
 * now, so the no-pitch rule has to live on each one rather than only in the
 * question-angle bank it replaced.
 */
const ACCOUNT_BRIEF_SUFFIX = " Ürünü anlatma, demo veya örnek teklif etme.";

const ACCOUNT_ANGLE_BRIEFS_BASE_TR: Record<AccountAngle, string> = {
  whatsapp_follow_up_visibility:
    "EVIDENCE'taki WhatsApp bağlantısını sade bir cümleyle söyle, sonra o hattan gelen taleplerin ilk yanıttan sonra nasıl takip edildiğini soran TEK bir soru sor. Takibin aksadığını ima etme.",
  whatsapp_ownership:
    "EVIDENCE'taki WhatsApp bağlantısını söyle, sonra o hattan gelen talepleri ekip içinde kimin takip ettiğini soran TEK bir soru sor. Ekip büyüklüğü hakkında varsayım kurma.",
  whatsapp_open_request:
    "EVIDENCE'taki WhatsApp bağlantısını söyle, sonra ilk yanıttan sonra açık kalan taleplerin nerede durduğunu soran TEK bir soru sor. Talep biriktiğini iddia etme.",
  channel_handoff:
    "EVIDENCE'taki iki kanalı tek cümlede birlikte söyle, sonra bu iki kanaldan gelen taleplerin aynı yerde mi ilerlediğini soran TEK bir soru sor.",
  single_view_question:
    "EVIDENCE'taki gözlemi söyle, sonra bu taleplerin tek yerde mi yoksa ayrı ayrı mı takip edildiğini soran TEK bir soru sor. Dağınıklık olduğunu iddia etme.",
  channel_ownership:
    "EVIDENCE'taki gözlemi söyle, sonra bu akışın takibini ekip içinde kimin üstlendiğini soran TEK bir soru sor.",
  cross_channel_continuity:
    "EVIDENCE'taki iki kanalı birlikte söyle, sonra bu kanallardan gelen taleplerin tek akışta mı ilerlediğini soran TEK bir soru sor.",
  language_handoff:
    "EVIDENCE'taki çok dilli yapıyı söyle, sonra farklı dillerde gelen taleplerin ekip içinde nasıl yönlendirildiğini soran TEK bir soru sor.",
  multilingual_ownership:
    "EVIDENCE'taki çok dilli yapıyı söyle, sonra farklı dillerde gelen talepleri kimin karşıladığını soran TEK bir soru sor.",
  positioning_request_split:
    "EVIDENCE'taki konumlandırma veya hizmet kategorisini söyle, sonra farklı talep türlerinin aynı ekipte mi ilerlediğini soran TEK bir soru sor.",
  intent_routing:
    "EVIDENCE'taki oda/teklif çeşitliliğini söyle, sonra farklı ihtiyaçlarla gelen taleplerin nasıl ayrıldığını soran TEK bir soru sor.",
  offer_follow_up:
    "EVIDENCE'taki seçenek çeşitliliğini söyle, sonra bu seçenekler için gelen taleplerin hangi yöntemle takip edildiğini soran TEK bir soru sor.",
  direct_request_follow_up:
    "EVIDENCE'taki OTA görünürlüğünü ve varsa ikinci kanalı ayrı ayrı, gerçek kategorileriyle söyle. OTA görünürlüğünü ASLA 'doğrudan' bir kanal gibi anlatma — OTA üçüncü taraf bir listelemedir. Ardından bu kanal(lar)dan gelen taleplerin takibini soran TEK bir soru sor; soruda 'doğrudan gelen' gibi taleplerin tamamını kapsayan bir ifade KULLANMA, bunun yerine 'buradan gelen' veya 'bu kanaldan gelen' gibi nötr bir ifade kullan. OTA bağımlılığı, komisyon veya kayıp ima etme.",
  contact_form_follow_up:
    "EVIDENCE'taki iletişim formunu söyle, sonra formdan gelen taleplerin nasıl takip edildiğini soran TEK bir soru sor.",
};

export const ACCOUNT_ANGLE_BRIEFS_TR: Record<AccountAngle, string> =
  Object.fromEntries(
    ACCOUNT_ANGLES.map((angle) => [
      angle,
      `${ACCOUNT_ANGLE_BRIEFS_BASE_TR[angle]}${ACCOUNT_BRIEF_SUFFIX}`,
    ]),
  ) as Record<AccountAngle, string>;

export const ANGLE_BRIEFS_TR: Record<VariationAngle, string> = {
  ...ACCOUNT_ANGLE_BRIEFS_TR,
  "channel-workflow-question":
    "VERIFIED SIGNALS'taki tek bir kamusal kanal gözlemine dayanarak, o kanaldan gelen taleplerin ekip içinde nasıl takip edildiğini soran TEK açık uçlu bir soru sor. Cevabı biliyormuş gibi değil, gerçekten merak ediyormuş gibi sor. Ürünü anlatma, demo veya örnek teklif etme.",
  "follow-up-method-question":
    "İlk yanıttan sonra açık kalan taleplerin hangi yöntemle takip edildiğini soran TEK açık uçlu bir soru sor. Takibin atlandığını, unutulduğunu veya geciktiğini ASLA ima etme; yalnızca yöntemi merak et. Ürünü anlatma, demo veya örnek teklif etme.",
  "multi-channel-visibility-question":
    "Birden fazla kanaldan gelen taleplerin tek yerde mi yoksa ayrı ayrı mı takip edildiğini soran TEK bir soru sor. Hangi kanallar olduğunu söyleme; 'farklı kanallardan' gibi genel bir ifade kullan — bu da dahil, mesaj boyunca en fazla BİR doğrulanmış sinyale değinebilirsin. Bunun bir sorun olduğunu ima etme. Ürünü anlatma, demo veya örnek teklif etme.",
  "ownership-question":
    "Gelen talepleri ekip içinde kimin takip ettiğini soran TEK nötr bir soru sor. Ekip büyüklüğü, kapasitesi veya yeterliliği hakkında hiçbir varsayımda bulunma. Ürünü anlatma, demo veya örnek teklif etme.",
  "open-request-question":
    "Şu anda cevap bekleyen açık bir talep olup olmadığını soran TEK bir soru sor. Var olduğunu varsayma; gerçekten bilmediğin bir şeyi soruyormuş gibi yaz. Ürünü anlatma, demo veya örnek teklif etme.",
  "verified-channel-observation":
    "Yalnızca VERIFIED SIGNALS'ta yer alan tek bir kamusal kanal gözlemini sade bir cümleyle söyle (ör. sitedeki WhatsApp bağlantısı). O kanalda bir sorun, gecikme veya kayıp olduğunu ima etme.",
  "single-screen-visibility":
    "TUGOBO'nun gelen rezervasyon taleplerini tek ekranda topladığını bir yetenek olarak anlat. İşletmede dağınıklık olduğunu iddia etme.",
  "follow-up-visibility-as-capability":
    "Cevap bekleyen talebin görünür kalmasını bir yetenek olarak anlat. Takibin atlandığını, unutulduğunu veya geciktiğini ASLA söyleme.",
  "direct-booking-clarity":
    "Kendi kanallarından gelen talebin rezervasyona giden adımının tek yerde net görünmesini anlat. Dönüşüm kaybı, kaçan rezervasyon veya zayıf akış iddia etme.",
  "short-demo-invitation":
    "Tek cümlelik sade bir fayda söyle ve çok kısa bir örnek ya da 2 dakikalık bir gösterim öner. Sorun tanımı yapma.",
  "founder-note":
    "Kurucu olarak kısa ve mütevazı bir not bırak: ne üzerinde çalıştığını söyle ve karşı tarafın değerlendirmesine alan bırak. Genelleme yapma, öğüt verme, işletme hakkında çıkarım yapma.",
};

type AngleGate<A extends VariationAngle> = {
  angle: A;
  requires: string[] | null;
  /** Overrides `requires`: used when a gate needs AND-semantics across signals. */
  predicate?: (signals: SignalSet) => boolean;
};

function isGateSatisfied(
  gate: Pick<AngleGate<VariationAngle>, "requires" | "predicate">,
  signals: SignalSet,
): boolean {
  if (gate.predicate) return gate.predicate(signals);
  return gate.requires === null || gate.requires.some((key) => hasSignal(signals, key));
}

/**
 * FIRST_CONTACT gates.
 *
 * Three of five are ungated: a genuinely open question about how requests are
 * handled needs no evidence, because it asserts nothing about this lead.
 * `channel-workflow-question` needs *a* verified channel to ask about, and
 * `multi-channel-visibility-question` needs *two* — a website and a WhatsApp
 * path — because asking "is it one place or two" about a single channel is
 * not a real question.
 */
const FIRST_CONTACT_GATES: AngleGate<FirstContactAngle>[] = [
  {
    angle: "channel-workflow-question",
    requires: [
      "website_whatsapp_link",
      "whatsapp_reachable",
      "instagram_present",
      "booking_cta",
      "booking_engine",
    ],
  },
  {
    angle: "multi-channel-visibility-question",
    requires: null,
    predicate: (signals) =>
      hasSignal(signals, "own_website") &&
      (hasSignal(signals, "whatsapp_reachable") || hasSignal(signals, "website_whatsapp_link")),
  },
  { angle: "follow-up-method-question", requires: null },
  { angle: "ownership-question", requires: null },
  { angle: "open-request-question", requires: null },
];

/**
 * REPLY gates — unchanged from the respectful calibration. A gate of `null`
 * means the angle needs no specific evidence — it describes what TUGOBO does
 * or simply offers an example, rather than asserting anything about this
 * hotel.
 */
const REPLY_GATES: AngleGate<ReplyAngle>[] = [
  {
    angle: "verified-channel-observation",
    requires: [
      "website_whatsapp_link",
      "whatsapp_reachable",
      "instagram_present",
      "booking_cta",
      "booking_engine",
    ],
  },
  {
    angle: "direct-booking-clarity",
    requires: ["booking_cta", "booking_engine", "own_website"],
  },
  { angle: "single-screen-visibility", requires: null },
  { angle: "follow-up-visibility-as-capability", requires: null },
  { angle: "short-demo-invitation", requires: null },
  { angle: "founder-note", requires: null },
];

/**
 * Angles usable for this lead, in priority order.
 *
 * Stance picks the pool: `first_contact` (the default — this is the
 * overwhelmingly common case) draws from the question angles, anything else
 * draws from the capability angles. `open-request-question` /
 * `founder-note` are always ungated, so this never returns empty.
 */
export function availableAngles(
  signals: SignalSet,
  stance: OutreachStance = "first_contact",
): VariationAngle[] {
  if (stance === "first_contact") {
    const out = FIRST_CONTACT_GATES.filter((gate) => isGateSatisfied(gate, signals)).map(
      (gate) => gate.angle,
    );
    return out.length > 0 ? out : ["open-request-question"];
  }
  const out = REPLY_GATES.filter((gate) => isGateSatisfied(gate, signals)).map(
    (gate) => gate.angle,
  );
  return out.length > 0 ? out : ["founder-note"];
}

/**
 * Picks one angle per tone for a single generation round.
 *
 * The three tones get *different* angles wherever the lead supports at least
 * three, which is what stops the three tones from being paraphrases of one
 * idea. `rotation` (the regenerate nonce) shifts the whole assignment, so
 * regenerating moves every tone onto a new subject.
 */
export function assignAngles(
  signals: SignalSet,
  rotation: number,
  stance: OutreachStance = "first_contact",
): { soft: VariationAngle; direct: VariationAngle; consultative: VariationAngle } {
  const pool = availableAngles(signals, stance);
  const at = (offset: number): VariationAngle => {
    const index = (((rotation + offset) % pool.length) + pool.length) % pool.length;
    return pool[index];
  };
  return { soft: at(0), direct: at(1), consultative: at(2) };
}

/* -------------------------------------------------------------------------- */
/* account-specific angle selection                                           */
/* -------------------------------------------------------------------------- */

/**
 * Which questions one evidence type naturally raises, on its own.
 *
 * Read this as "given only this observation, what would a curious operator
 * actually wonder?" — not as "what can we sell off the back of it".
 */
const SOLO_ANGLE_MAP: Record<PersonalizationEvidenceType, readonly AccountAngle[]> = {
  website_whatsapp_link: [
    "whatsapp_follow_up_visibility",
    "whatsapp_ownership",
    "whatsapp_open_request",
  ],
  booking_button: ["direct_request_follow_up", "single_view_question", "channel_ownership"],
  instagram_channel: ["single_view_question", "channel_ownership"],
  contact_form: ["contact_form_follow_up", "channel_ownership"],
  multilingual_site: ["language_handoff", "multilingual_ownership"],
  multi_channel_presence: ["single_view_question", "channel_ownership"],
  property_positioning: ["positioning_request_split", "channel_ownership"],
  public_service_category: ["positioning_request_split", "channel_ownership"],
  room_or_offer_variety: ["intent_routing", "offer_follow_up"],
  ota_presence: ["direct_request_follow_up", "channel_ownership"],
};

/** Cluster key, order-independent so a pair maps to one entry. */
function clusterKey(
  a: PersonalizationEvidenceType,
  b: PersonalizationEvidenceType,
): string {
  return [a, b].sort().join("+");
}

/**
 * Questions that only exist because two coherent signals were seen together.
 *
 * "Bu iki kanaldan gelen talepler aynı yerde mi ilerliyor?" cannot be asked of
 * a hotel with one channel — that is the whole point of allowing a supporting
 * evidence item at all.
 */
const CLUSTER_ANGLE_MAP: Record<string, readonly AccountAngle[]> = {
  [clusterKey("website_whatsapp_link", "booking_button")]: [
    "channel_handoff",
    "single_view_question",
    "channel_ownership",
  ],
  [clusterKey("website_whatsapp_link", "instagram_channel")]: [
    "cross_channel_continuity",
    "channel_ownership",
  ],
  [clusterKey("website_whatsapp_link", "contact_form")]: [
    "channel_handoff",
    "contact_form_follow_up",
  ],
  [clusterKey("booking_button", "contact_form")]: [
    "channel_handoff",
    "contact_form_follow_up",
  ],
  [clusterKey("instagram_channel", "contact_form")]: [
    "cross_channel_continuity",
    "contact_form_follow_up",
  ],
  [clusterKey("ota_presence", "booking_button")]: ["direct_request_follow_up"],
  [clusterKey("ota_presence", "website_whatsapp_link")]: ["direct_request_follow_up"],
  [clusterKey("property_positioning", "public_service_category")]: [
    "positioning_request_split",
    "intent_routing",
  ],
  [clusterKey("property_positioning", "room_or_offer_variety")]: [
    "intent_routing",
    "offer_follow_up",
  ],
};

/** The angles this evidence selection may ask, in preference order. */
export function accountAnglesFor(selection: EvidenceSelection): readonly AccountAngle[] {
  if (selection.supporting) {
    const cluster =
      CLUSTER_ANGLE_MAP[clusterKey(selection.primary.type, selection.supporting.type)];
    if (cluster && cluster.length > 0) return cluster;
  }
  return SOLO_ANGLE_MAP[selection.primary.type];
}

/**
 * One angle for one message.
 *
 * `offset` carries the regenerate rotation plus the tone index, so the three
 * tones of a round ask different questions off the same evidence and a
 * regenerate moves all three.
 */
export function accountAngleFor(
  selection: EvidenceSelection,
  offset: number,
): AccountAngle {
  const pool = accountAnglesFor(selection);
  const size = pool.length;
  return pool[(((Math.floor(offset) % size) + size) % size)];
}

export function isAccountAngle(value: unknown): value is AccountAngle {
  return typeof value === "string" && (ACCOUNT_ANGLES as readonly string[]).includes(value);
}

export function isVariationAngle(value: unknown): value is VariationAngle {
  return (
    typeof value === "string" && (VARIATION_ANGLES as readonly string[]).includes(value)
  );
}

export function isFirstContactAngle(value: VariationAngle): value is FirstContactAngle {
  return (FIRST_CONTACT_ANGLES as readonly string[]).includes(value);
}
