/**
 * Server-side quality gate for a generated outreach message.
 *
 * Nothing reaches the founder's screen without passing this. The rules encode
 * the failure modes that make a message unsendable: it claims something we did
 * not verify, it reads like a pitch deck, it carries a price, or it is a
 * template with the placeholder still in it.
 *
 * v3.7.9 respectful calibration adds the four rules that matter most for a cold
 * first contact, and they are about *standing* rather than accuracy: we cannot
 * see inside this hotel, so we may not describe its operation, we may not tell
 * it what it is losing, we may not lecture it, and we may not claim to have
 * examined anything that is not public.
 *
 * The same sprint adds a fifth category, the Product Capability Truth Guard:
 * even a message with no diagnosis and no unverified claim about the *hotel*
 * can still lie about the *product*. Told to sound like a founder describing a
 * benefit, a live run produced "gelen mesajlarınızı otomatik olarak takip edip
 * yanıtlayabiliyorsunuz" — TUGOBO does not auto-reply; every outbound message
 * is a human opening WhatsApp (see `window.open(waLink)` in
 * LeadMessageEditor.tsx). What is and is not real lives in `capabilities.ts`;
 * these rules are its enforcement.
 *
 * The same sprint, one manual pass later, adds a sixth category: Conversation-
 * First Pain Discovery. A message can pass every rule above — no diagnosis, no
 * fear, no unsupported claim about the hotel or the product — and still be a
 * pitch, because it spends its one shot explaining TUGOBO instead of asking
 * the recipient anything. A first message that never asks a question is not
 * trying to start a conversation. These rules apply ONLY when `stance` is
 * `first_contact` (the default): the length/sentence caps tighten, the
 * decades-old CTA-offer requirement inverts into a ban, and a message must
 * close on one real, answerable question. `follow_up` and `demo_confirm` are
 * untouched — those stages have already earned the right to explain the
 * product and ask for a demo.
 *
 * That same sprint stated "one verified public signal" as an instruction but
 * never enforced it: a live run produced "WhatsApp bağlantısını ve
 * rezervasyon çağrısını gördüm", two signals in one breath. `too_many_verified_signals`
 * is the enforcement — see {@link FIRST_CONTACT_SIGNAL_TOPICS}.
 *
 * The seventh and last layer, added by the High-Relevance Account-Specific
 * calibration, is about neither truth nor respect but *worth*. A message can
 * clear every rule above and still be worthless, because everything it says is
 * equally true of every hotel in the country — which is what a manual pass
 * found: "Merhaba, Türkay Otel için kısa bir not bırakmak istedim. Gelen
 * talepleri ekip içinde kim takip ediyor?" is respectful, grounded, honest and
 * reusable verbatim on any other property. These rules ask the question none of
 * the others do — would this message survive having the hotel's name swapped?
 * — and they supersede the exact-single-signal rule with an evidence-cluster
 * contract: one primary evidence, plus one supporting item when and only when
 * both sit in the same operational flow (see `evidence.ts`).
 *
 * The eighth layer, the Evidence Semantic Coherence Guard, answers a question
 * grounding cannot: even when the *right* evidence is named, is it named as
 * the *right kind of thing*? A live run correctly named both "Booking.com
 * görünürlüğünü" and "WhatsApp rezervasyon bağlantısını" and then asked
 * "Doğrudan gelen bu talepler ayrı mı takip ediliyor?" — folding a
 * third-party OTA listing into a claim that the whole request stream is
 * direct. Grounding was satisfied; the category was not. See
 * `findEvidenceSemanticMismatches` in `evidence.ts`.
 */

import { SAFE_CAPABILITY_CLAIMS_TR, UNSUPPORTED_CAPABILITY_CLAIMS_TR } from "./capabilities.ts";
import {
  EVIDENCE_ANAPHORA,
  EVIDENCE_GROUNDING_TERMS,
  EVIDENCE_TOPIC_PATTERNS,
  evidenceTopicsIn,
  findEvidenceSemanticMismatches,
  isCoherentEvidenceCluster,
  stripBusinessName,
  type EvidenceSelection,
  type PersonalizationEvidenceType,
} from "./evidence.ts";
import type { Tone } from "./contract.ts";
import { validateTurkishFluency } from "./fluency.ts";
import type { OutreachStance } from "./lifecycle.ts";
import { checkSenderIdentity } from "./sender-identity.ts";
import { hasSignal, type SignalSet } from "./signals.ts";
import { isDuplicate, normalizeMessage } from "./text.ts";

/**
 * Length band — reply / follow-up / demo-confirm stages.
 *
 * These were 240–420 preferred with a 520 ceiling, and that single fact was why
 * every message read like a brochure: a model told to fill 400 characters has
 * to keep explaining after it has said the one useful thing. v3.7.6 cut it to
 * 160–300/380; v3.7.9 cuts it again, because an explanation that long can only
 * be filled by explaining the recipient's own business back to them.
 *
 * A reply-stage message is: one public observation, one benefit, one invitation.
 */
export const MIN_LENGTH = 110;
export const MAX_LENGTH = 300;
/** The band the prompt aims for; outside it is allowed, just not preferred. */
export const PREFERRED_MIN = 140;
export const PREFERRED_MAX = 240;

/** A message longer than this many sentences is an explanation, not a note. */
export const MAX_SENTENCES = 3;

/**
 * Length band — first contact.
 *
 * Still tighter than the reply-stage band, but wider than the 260/2 the
 * pain-discovery sprint set. That budget was calibrated for a message with no
 * account-specific hook in it: a bare greeting plus a generic question fits in
 * two short sentences easily. An account-specific message spends a whole
 * sentence on the observation ("Türkay Otel'in web sitesindeki WhatsApp
 * rezervasyon bağlantısını gördüm"), and squeezing that plus a grounded
 * question into 260 characters was pushing the model back towards the generic
 * phrasing this calibration exists to remove.
 *
 * Three sentences is the ceiling and 320 the hard cap — enough for hook,
 * hypothesis and question, and not enough for a pitch.
 */
export const FIRST_CONTACT_MAX_LENGTH = 320;
export const FIRST_CONTACT_MIN_LENGTH = 100;
export const FIRST_CONTACT_PREFERRED_MIN = 120;
export const FIRST_CONTACT_PREFERRED_MAX = 280;
export const FIRST_CONTACT_MAX_SENTENCES = 3;

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
  | "invented_sender_identity"
  | "unverified_claim"
  | "unsupported_operational_claim"
  | "condescending_diagnosis"
  | "fear_based_claim"
  | "false_observation"
  | "unsupported_product_capability"
  | "guaranteed_business_outcome"
  | "autonomous_action_claim"
  | "first_contact_product_pitch"
  | "first_contact_demo_offer"
  | "missing_operational_question"
  | "too_many_questions"
  | "too_many_verified_signals"
  | "fabricated_social_context"
  | "ungrounded_account_reference"
  | "missing_primary_evidence"
  | "incoherent_evidence_cluster"
  | "question_not_grounded_in_evidence"
  | "unsupported_pain_assumption"
  | "generic_reusable_message"
  | "tone_shape_mismatch"
  | "fabricated_browsing_context"
  | "unnatural_turkish_construction"
  | "evidence_semantic_mismatch"
  /*
   * The two score-derived codes. Produced by `relevance.ts`, never by
   * `validateOutreachMessage` — "is this message specific enough to be worth
   * sending" is a weighted judgement, not a rule, and splitting it across two
   * owners would give the engine two disagreeing answers. They live in this
   * union so the engine, the logs and the tests speak one vocabulary.
   */
  | "low_account_relevance"
  | "low_reply_likelihood"
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
  /*
   * v3.7.9 additions. These are the internal vocabulary of this engine —
   * angle labels, scoring names, opportunity descriptions — and a live run
   * showed the model happily quoting them back at the hotel. They are fine on
   * a badge in the founder's UI and nonsense in a WhatsApp message.
   */
  "rezervasyon çağrısı",
  "kanal görünürlüğü sorusu",
  "operasyonel karmaşıklık",
  "yüksek roi potansiyeli",
  "doğrudan rezervasyon fırsatı",
];

const MARKDOWN = /(\*\*|__|^#{1,6}\s|^\s*[-*]\s+|\[[^\]]*\]\([^)]*\))/m;
const URL = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|com\.tr|tr)\b)/i;

/**
 * Platform names that happen to contain a TLD.
 *
 * "Booking.com" is what a hotelier calls the platform — it is a brand, not a
 * link, and the URL rule exists to stop us dropping a clickable address into a
 * cold message. Stripping these before the URL test is what lets the OTA
 * evidence type say the platform's actual name; without it, every message
 * grounded in an OTA listing was unsendable, which is why none had ever been
 * written. A real address survives the strip: "www." and "https://" are matched
 * independently.
 */
const PLATFORM_BRAND_NAMES = /\b(booking\.com|hotels\.com)\b/giu;
const PRICE = /(₺|\bTL\b|\bEUR\b|\bUSD\b|\$|€|\b\d{3,}\s*(tl|lira)\b|\baylık\s*\d)/i;
const PLACEHOLDER = /(\{\{|\}\}|\[\s*(isim|otel|şehir|name|hotel|city)\s*\]|xxx|lorem)/i;

/**
 * A low-pressure ask. Deliberately broad — the point is that the message ends
 * by offering something, not that it uses one blessed sentence.
 *
 * The permission-asking forms ("gönderebilir miyim", "göstereyim mi") were
 * added in v3.7.9 after a live run: told to write with humility, the model
 * stopped declaring what it would do and started asking whether it may. That
 * is the lowest-pressure close available and the list was rejecting it.
 *
 * Required at reply/follow-up/demo-confirm stage; forbidden at first contact
 * (see {@link FIRST_CONTACT_FORBIDDEN_CTA}, which reuses this list wholesale —
 * every one of these is exactly the "let me send/show you something" offer
 * that a first message may not make).
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
  // "…gönderebilir miyim?" — asking permission rather than announcing.
  // `[ae]` because Turkish vowel harmony gives both "paylaşabilir" and
  // "gönderebilir"; hardcoding one form silently rejects half the closings.
  /(paylaş|gönder|göster|bırak|yaz|anlat|özetle)[ae]bilir\s*miyim/i,
  // "…göndermemi ister misiniz?"
  /(paylaşmam|göndermem|göstermem|bırakmam)[ıi]\s*ister misiniz/i,
  // "…göstereyim mi?"
  /(paylaşayım|göndereyim|göstereyim|bırakayım|yazayım)\s*m[ıiu]/i,
];

/**
 * Every CTA_PATTERNS offer, plus the demo/meeting phrases that were never
 * part of that list because reply-stage messages were always allowed to use
 * them freely.
 */
const FIRST_CONTACT_FORBIDDEN_CTA: RegExp[] = [
  ...CTA_PATTERNS,
  /demo\s*(yapabiliriz|gösterebilirim|önerebilirim|teyidi)/iu,
  /görüşelim/iu,
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

/* -------------------------------------------------------------------------- */
/* v3.7.9 — respectful, curiosity-first rules                                 */
/* -------------------------------------------------------------------------- */

/**
 * Assertions about how this hotel actually runs.
 *
 * Every one of these was produced by a live model that had seen nothing but a
 * business name, a city and a website flag. None of them is knowable from
 * public data, and a hotelier who reads one knows immediately that we are
 * guessing — which costs more trust than the message could ever earn.
 *
 * Note these are *not* rescued by a verified signal, unlike {@link CLAIM_GATES}:
 * knowing a hotel has WhatsApp does not tell us anything about how fast they
 * answer it.
 */
const UNSUPPORTED_OPERATIONAL_CLAIM: RegExp[] = [
  // follow-up is being missed / forgotten / delayed
  /takip[^.!?]{0,24}?(atlan|unutul|gecik|kaçır|kayb|yapılamam)/iu,
  /(ikinci|sonraki|ilk mesajdan sonraki)\s+takip/iu,
  // their reply speed
  /(dönüş|yanıt|cevap|geri dönüş)\s*(süreniz|süreleriniz|hızınız)/iu,
  /(dönüş|yanıt|cevap)\s*süre[^.!?]{0,16}?\buz(a|u)/iu,
  /(geç|yavaş)\s+(dönüyorsunuz|yanıtlıyorsunuz|cevap veriyorsunuz|dönülüyor)/iu,
  /mesajlar[ıi]n[ıi]za?[^.!?]{0,20}?(geç|gecikmeli)\s*(dön|yanıt|cevap)/iu,
  // their team size
  /(ekibiniz|kadronuz|ekibinizin)[^.!?]{0,16}?(küçük|az|kısıtlı|yetersiz)/iu,
  /(küçük|az kişilik|sınırlı)\s+(ekibiniz|kadronuz|ekibinizle)/iu,
  // requests piling up / getting lost inside their operation
  /talep[^.!?]{0,28}?(kaybol|kayıp gid|birik|arada kal|orada kal|havada kal)/iu,
  /hangi\s+tale?b[^.!?]{0,12}?\s+nerede/iu,
  /kanallar\s+aras[ıi]nda\s+gidip\s+gel/iu,
  // channelling requests through Booking instead of talking to them
  /(booking'e|otalara)\s+yönlendiri?len\s+misafir/iu,
];

/**
 * Lecturing.
 *
 * These are the shapes that make a first contact read as a verdict rather than
 * a note: a universal truth about "small teams", a knowing "on busy days", or a
 * "you have this problem too". The recipient did not ask for a diagnosis and
 * has no reason to accept one from a stranger.
 */
const CONDESCENDING_DIAGNOSIS: RegExp[] = [
  /yoğun günlerde/i,
  /yoğun saatlerde/i,
  /küçük ekiplerde/i,
  /en pahalı iş/i,
  /sizde de/i,
  /(otelinizde|işletmenizde|tesisinizde)[^.!?]{0,20}?(bu sorun|bu problem|bu sıkıntı|sıkıntı)/iu,
  /operasyonunuz/i,
  /(birçok|çoğu|pek çok)\s+(tesiste|otelde|işletmede)/iu,
];

/**
 * Fear, loss and urgency.
 *
 * Selling a hotelier their own imagined losses is the fastest way to be read as
 * a vendor. It is also unfalsifiable from our side: we have no visibility into
 * a single reservation they did or did not take.
 */
const FEAR_BASED_CLAIM: RegExp[] = [
  /(misafir|müşteri|ilgi)[^.!?]{0,20}?soğu/iu,
  /başka\s+yer[^.!?]{0,20}?(bak|git|yönel|kayı|tercih)/iu,
  /(rezervasyon|misafir|müşteri|gelir|talep|fırsat)[^.!?]{0,20}?kayb/iu,
  /kaçır(ıyorsunuz|abilirsiniz|manız|ıyor olabilirsiniz)/iu,
  /(rakipler|rakibiniz)[^.!?]{0,24}?(önde|öne geç|geçiyor)/iu,
  /(geç kalmadan|geç olmadan|elinizden kaç)/iu,
];

/**
 * Claiming to have examined something.
 *
 * "İncelediğimde" and "fark ettim" imply an audit the recipient never
 * authorised. A verified public signal may be *seen* ("sitenizdeki WhatsApp
 * bağlantısını gördüm") — it may never be *investigated*.
 */
const FALSE_OBSERVATION: RegExp[] = [
  /incele(dim|di[ğg]im|rken|yince|dikten|memde)/iu,
  /fark ett[iı]m/iu,
  /gözlemledi(m|[ğg]im)/iu,
  /(analiz ettim|analiz ederken|araştırdım|araştırırken|tarad[ıi]m)/iu,
  /(mesaj|talep|rezervasyon|dönüş|yanıt|misafir)[\p{L}']*\s+(akışınızı|akışınıza|trafiğinizi|geçmişinizi|kayıtlarınızı)/iu,
];

/**
 * Verbs that assert first-hand sight, and the subjects we can never have seen.
 *
 * Split rather than merged into {@link FALSE_OBSERVATION} because "gördüm" is
 * legitimate — it is exactly how a verified public signal should be phrased.
 * What is illegitimate is "gördüm" attached to something that lives inside
 * their inbox. Matched per sentence so an innocent verb in one clause is not
 * paired with an unrelated noun three sentences away.
 */
const SIGHT_VERB = /(gördüm|görüyorum|göz[üu]me çarptı|dikkatimi çekti|bakt[ıi]m)/iu;
/*
 * Second-person forms only. "Gelen talepler" is what TUGOBO handles and appears
 * in every honest capability sentence; "taleplerinizi" is a claim about this
 * hotel's inbox, and that is the thing nobody outside it can have seen.
 */
const UNOBSERVABLE_SUBJECT =
  /(talepler[iı]n[iı]z|takipler[iı]n[iı]z|mesajlar[ıi]n[ıi]z|yazışmalar[ıi]n[ıi]z|rezervasyon akış[ıi]n[ıi]z|(dönüş|yanıt|cevap) süre)/iu;

/* -------------------------------------------------------------------------- */
/* v3.7.9 — Product Capability Truth Guard                                    */
/* -------------------------------------------------------------------------- */

/**
 * The exact phrases {@link UNSUPPORTED_CAPABILITY_CLAIMS_TR} names, checked as
 * plain substrings the way {@link JARGON_PHRASES} is. Cheap and exact — kept
 * separate from the stemmed regexes below because the two are answering
 * different questions: this is "did the model use the literal words the
 * contract forbids", the regexes are "did it say the same thing with a
 * different conjugation".
 */
const UNSUPPORTED_CAPABILITY_PHRASES = UNSUPPORTED_CAPABILITY_CLAIMS_TR.map((p) =>
  p.toLocaleLowerCase("tr-TR"),
);

/** Same treatment for the safe bank — used by the first-contact pitch check below. */
const SAFE_CAPABILITY_PHRASES = SAFE_CAPABILITY_CLAIMS_TR.map((p) =>
  p.toLocaleLowerCase("tr-TR"),
);

/**
 * TUGOBO taking a guest-facing or transactional action itself.
 *
 * Every real send in this codebase is `window.open(waLink)` — a human opening
 * WhatsApp. TUGOBO organizes and assists; it does not message, book or charge
 * a guest on its own. This is deliberately narrower than "otomatik" wording
 * (see {@link AUTONOMOUS_ACTION_CLAIM}): a claim can invoke no autonomy
 * language at all and still describe a capability that does not exist, the
 * way "TUGOBO mesaj gönderir" does.
 */
const UNSUPPORTED_PRODUCT_CAPABILITY: RegExp[] = [
  /tugobo[^.!?]{0,20}?(mesaj\s*(gönderir|atar|yollar)|yanıt\s*verir|cevap\s*verir)/iu,
  /rezervasyon\s+(oluşturur|yapar|alır)/iu,
  /ödeme\s+(alır|tahsil eder|çeker)/iu,
];

/**
 * Promised outcomes we do not control.
 *
 * Whether a request becomes a booking, a sale happens, revenue rises or a loss
 * is avoided depends on the hotel's own guest, price and timing — not on
 * software. Stems are matched with a short following gap so both the bare verb
 * ("dönüştürür") and its "-ebilir/-abilir" conjugation ("dönüştürebilirsiniz")
 * are caught by the same rule.
 */
const GUARANTEED_BUSINESS_OUTCOME: RegExp[] = [
  /rezervasyon[^.!?]{0,10}?dönüştür/iu,
  /talep[^.!?]{0,20}?dönüştür/iu,
  /satış[^.!?]{0,10}?çevir/iu,
  /(gelir|satış)[^.!?]{0,12}?(artır|yükselt|büyüt)/iu,
  /kayb[ıi][^.!?]{0,10}?önle/iu,
  /misafir[^.!?]{0,10}?kaçırmaz/iu,
  /garanti\s*(eder|ediyor|ederiz|edilir)/iu,
];

/**
 * TUGOBO — or "the system" — acting without a human.
 *
 * This is the rule the live run actually broke: "otomatik olarak takip edip
 * yanıtlayabiliyorsunuz" carries no autonomy *noun*, just the adverb, so the
 * pattern below matches on "otomatik olarak" alone rather than requiring it to
 * sit next to a specific verb.
 */
const AUTONOMOUS_ACTION_CLAIM: RegExp[] = [
  /otomatik[^.!?]{0,16}?(yanıt|cevap|gönder|takip|mesaj)/iu,
  /otomatik olarak/iu,
  /kendiliğinden/iu,
  /insan\s*(müdahalesi|onayı|gözetimi|denetimi)\s*olmadan/iu,
  /(tamamen\s+)?otonom/iu,
];

/* -------------------------------------------------------------------------- */
/* v3.7.9 — Conversation-First Pain Discovery (first contact only)            */
/* -------------------------------------------------------------------------- */

/**
 * A sentence that names TUGOBO and says what it does.
 *
 * Deliberately verb-gated rather than a bare `/tugobo/i`: the one product
 * mention a first message may make ("Bu akışı görünür kılan bir sistem
 * üzerinde çalışıyorum.") neither names TUGOBO nor uses a capability verb, so
 * it never trips this. What trips it is the reply-stage shape — "TUGOBO ...
 * topluyor/tutuyor/gösteriyor" — arriving one message too early.
 */
const PRODUCT_PITCH_SENTENCE =
  /tugobo[^.!?]{0,70}?(topluyor|tutuyor|gösteriyor|sağlıyor|kolaylaştırıyor|izliyor|derliyor|birleştiriyor|organize ediyor|toplar\b|tutar\b|gösterir\b|sağlar\b|kolaylaştırır\b|izler\b)/iu;

/**
 * True when a first-contact message explains the product instead of asking
 * about the recipient.
 *
 * Three ways in: (1) it uses one of the reply-stage capability phrases
 * verbatim, (2) it has more than one product-pitch sentence — a first message
 * gets one optional mention, never two — or (3) its one product sentence eats
 * more than half the message, which is what "TUGOBO'nun tek yaptığı..." does
 * to a 2-sentence budget.
 */
function firstContactProductPitch(text: string): boolean {
  const lower = text.toLocaleLowerCase("tr-TR");
  if (SAFE_CAPABILITY_PHRASES.some((phrase) => lower.includes(phrase))) return true;

  const sentences = splitSentences(text);
  const productSentences = sentences.filter((s) => PRODUCT_PITCH_SENTENCE.test(s));
  if (productSentences.length === 0) return false;
  if (productSentences.length > 1) return true;

  const productChars = productSentences.reduce((sum, s) => sum + s.length, 0);
  return productChars > text.length * 0.5;
}

/**
 * Distinct verified-signal *topics* a first-contact message might reference.
 *
 * "Web sitenizdeki WhatsApp bağlantısını gördüm" is one topic (WhatsApp),
 * even though the sentence also contains the word "site" — the site is just
 * where the link lives, not a second fact being asserted. `own_website` is
 * deliberately absent from this list for that reason: in every real sentence
 * this codebase produces, "site" is the container for another signal, not an
 * independent one, and counting it would reject the single-signal phrasing
 * the whole respectful calibration is built on.
 *
 * What genuinely is a second signal is naming two *different* concrete
 * things — a live run produced "WhatsApp bağlantısını ve rezervasyon
 * çağrısını gördüm", which is a WhatsApp link and a booking CTA in the same
 * breath. That is the shape this list exists to catch.
 */
const FIRST_CONTACT_SIGNAL_TOPICS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: "whatsapp", pattern: /whatsapp/iu },
  {
    name: "booking_cta_or_engine",
    pattern: /(rezervasyon\s*(butonu|çağrısı|motoru|alanı|akışı)|online rezervasyon|hemen rezervasyon)/iu,
  },
  { name: "instagram", pattern: /instagram/iu },
  { name: "ota_listing", pattern: /(booking\.com|otalar|ota'lar)/iu },
  { name: "reviews", pattern: /(yorum|değerlendirme)\s*(say[ıi]s[ıi]|puan[ıi]?)/iu },
  /*
   * The website itself, asserted as its own fact — "sitesini gördüm",
   * "siteniz var" — rather than as the locative container of another signal
   * ("web sitesindeki WhatsApp bağlantısı"). The suffix chain is the tell:
   * "sitesi**ni**" (accusative object) and "site**niz**" (bare possessive,
   * no continuation) are standalone claims; "sitesi**ndeki**" and
   * "siteniz**deki**" are modifiers and never match here, because the
   * pattern requires the word to end where it does — see the two ordering
   * tests below for exactly this pair.
   */
  { name: "own_website", pattern: /(sitesini\b|sitenizi\b|siteniz\b)/iu },
];

/**
 * How many distinct verified-signal topics {@link FIRST_CONTACT_SIGNAL_TOPICS}
 * finds, ignoring the business name — "Instagram Suites" names one channel, not
 * two.
 */
function countSignalTopics(text: string, businessName: string): number {
  const body = stripBusinessName(text, businessName);
  return FIRST_CONTACT_SIGNAL_TOPICS.filter((topic) => topic.pattern.test(body)).length;
}

/* -------------------------------------------------------------------------- */
/* v3.7.9 — High-Relevance Account-Specific Outreach                          */
/* -------------------------------------------------------------------------- */

/**
 * Familiarity we have not earned.
 *
 * These are the shapes that fake a relationship: a region we are supposedly
 * already working in, a hotel that supposedly "came to mind", other customers
 * who supposedly have the same setup. Every one of them was in the old
 * fallback bank or came out of a live run, and every one is a plain untruth —
 * we are not talking to several businesses in Antalya, and nothing came to
 * mind. A recipient who checks finds nothing behind it, which costs more than
 * the warmth it buys.
 */
const FABRICATED_SOCIAL_CONTEXT: RegExp[] = [
  /(birkaç|bazı|birçok|bir[ ]?kaç)\s+(işletme|otel|tesis)[^.!?]{0,28}?(konuşuyor|görüşüyor|çalışıyor|yazışıyor)/iu,
  /(tarafında|bölgede|bölgesinde|çevrede|yakında)[^.!?]{0,30}?(birkaç|bazı|birçok)\s+(işletme|otel|tesis)/iu,
  /(bölgedeki|çevredeki|yakındaki|buradaki)\s+(otel|işletme|tesis)/iu,
  /akl[ıi]ma\s+gel/iu,
  /sizi\s+düşün(dü|erek|üp)/iu,
  /benzer\s+(otel|işletme|tesis)/iu,
  /müşterilerimizde/iu,
  /sektörde\s+(genelde|genellikle)/iu,
  /daha önce[^.!?]{0,20}?karşılaş/iu,
  /(tanıdığım|bildiğim)\s+(otel|işletme|tesis)/iu,
];

/**
 * A problem asserted about a business we cannot see inside.
 *
 * Narrower and more literal than {@link UNSUPPORTED_OPERATIONAL_CLAIM}, which
 * catches the hedged and conjugated forms. These are the blunt sentences a
 * model reaches for when it is told to be "relevant" and mistakes relevance
 * for diagnosis: your team is struggling, your messages get lost, you are
 * missing reservations.
 */
const UNSUPPORTED_PAIN_ASSUMPTION: RegExp[] = [
  /(ekibiniz|ekibinizin|kadronuz)[^.!?]{0,24}?(zorlan|yetişemi|boğul|yorul)/iu,
  /(mesajlar|talepler|istekler)[ıi]n[ıi]z[^.!?]{0,24}?(kaybol|gözden kaç|cevapsız|yanıtsız)/iu,
  /rezervasyon\s*(lar[ıi]?)?\s*kaç[ıi]r/iu,
  /(geç|yavaş)\s+(yanıt|cevap|dönüş)/iu,
  /(yanıt|cevap|dönüş)[^.!?]{0,12}?(geciki?yor|gecikiyorsunuz)/iu,
];

/**
 * Something about the property this message is asserting beyond a channel.
 *
 * Used by the generic-reusability heuristic: a message with none of these and
 * no evidence topic has said nothing that could not be said to anyone.
 */
const PROPERTY_ATTRIBUTE =
  /(termal|spa|resort|butik|kayak|plaj|marina|uzun konaklama|şehir oteli|toplantı|kongre|konferans|düğün|dil seçene|farklı dil|\boda|konaklama seçene|\bpaket)/iu;

/**
 * True when swapping the hotel name would leave the message equally true.
 *
 * The test the whole sprint turns on: "Merhaba, Türkay Otel için kısa bir not
 * bırakmak istedim. Gelen talepleri ekip içinde kim takip ediyor?" is a
 * perfectly respectful, perfectly grounded, perfectly useless message, because
 * it works verbatim for every hotel in the country.
 *
 * All three conditions have to hold: the message names no evidence topic, it
 * asserts no property attribute, and its question points at nothing it just
 * said. Any one of them being false means something in the message is actually
 * about *this* account.
 */
function isGenericReusable(text: string, businessName: string): boolean {
  const body = stripBusinessName(text, businessName);
  if (evidenceTopicsIn(text, businessName).length > 0) return false;
  if (PROPERTY_ATTRIBUTE.test(body)) return false;
  return !questionSentences(text).some((sentence) => EVIDENCE_ANAPHORA.test(sentence));
}

/** The sentences doing the asking — a "?" one, or the trailing "…merak ettim." */
function questionSentences(text: string): string[] {
  const sentences = splitSentences(text);
  const asking = sentences.filter((sentence) => text.includes(`${sentence}?`));
  if (asking.length > 0) return asking;
  return INDIRECT_QUESTION.test(text) ? sentences.slice(-1) : [];
}

/** True when the ask follows from the evidence rather than sitting beside it. */
function isQuestionGrounded(
  text: string,
  types: readonly PersonalizationEvidenceType[],
): boolean {
  const asks = questionSentences(text);
  if (asks.length === 0) return false;
  const terms = types.flatMap((type) => EVIDENCE_GROUNDING_TERMS[type]);
  return asks.some((sentence) => {
    const lower = sentence.toLocaleLowerCase("tr-TR");
    return terms.some((term) => lower.includes(term)) || EVIDENCE_ANAPHORA.test(sentence);
  });
}

/* -------------------------------------------------------------------------- */
/* v3.7.9 — live-output guards                                                */
/* -------------------------------------------------------------------------- */

/**
 * Narrating how we came across the hotel.
 *
 * A live run produced "Instagram hesabını **gezdiğimde** iletişime açık
 * olduğunuzu gördüm". It broke no existing rule — {@link FALSE_OBSERVATION}
 * knows "incelediğimde" but not "gezdiğimde" — and it is the same invention:
 * nobody browsed anyone's account, a crawler recorded a public link. The
 * observation is real; the little story about making it is not, and it is the
 * part a recipient can tell was written to sound personal.
 *
 * The line this draws: *the evidence may be stated, the act of finding it may
 * not be narrated.* "Instagram profilinizde iletişim seçeneğini gördüm" is
 * fine forever; "profilinizi incelerken gördüm" never is.
 */
const FABRICATED_BROWSING_CONTEXT: RegExp[] = [
  /gez(di[ğg]im(de|iz)?|erken|inirken)/iu,
  /incele(di[ğg]imde|rken|yince)/iu,
  /bak(t[ıi][ğg][ıi]mda|arken)/iu,
  /göz at(arken|t[ıi][ğg][ıi]mda|[ıi]nca)/iu,
  /fark etti[ğg]imde/iu,
  /dikkatimi çekti/iu,
  /karşıma çıkt[ıi]/iu,
  /araştır([ıi]rken|d[ıi][ğg][ıi]mda)/iu,
  /(hesab[ıi]n[ıi]z[ıi]|profilinizi|sitenizi|sayfan[ıi]z[ıi])\s+(gez|incele|araştır|tara|dolaş)/iu,
];

/**
 * The structural contract each first-contact tone must hard-pass.
 *
 * `toneDistinctiveness` was a *scored* dimension worth 5 of 100, and a live run
 * showed why that is not enough: a consultative message wrote itself in the
 * soft shape ("Kısaca merak ettim: …?"), scored 2/5 there, and still totalled
 * 94 — comfortably over the 82 bar. Three tones that converge on one shape are
 * not three options, and no aggregate score can express that, because every
 * other dimension was genuinely fine.
 *
 * So shape is a rule now, not a score. The three contracts are mutually
 * exclusive by construction: soft frames its curiosity then asks outright,
 * direct asks a binary with no preamble, consultative never punctuates with a
 * question mark at all.
 */
const CURIOSITY_FRAME = /(merak ettim|sormak istedim|merak ediyorum)\s*[:,]/iu;

/**
 * The Turkish question particle — mi / mı / mu / mü and its person suffixes.
 *
 * Deliberately not `\b(mi|mı|mu|mü)\b`. JavaScript's `\b` is ASCII-only, so
 * every Turkish-specific letter (ı, ü, ö, ş, ğ, ç) reads as a *non*-word
 * character and manufactures a word boundary in the middle of a word:
 * `\bmü\b` matches inside "bölümünü". That made "is this a binary question?"
 * answer yes for prose containing no question at all — which is exactly the
 * check the direct tone's contract leans on.
 *
 * So the particle is matched as a token: preceded by whitespace or a bracket,
 * followed by one of its real suffixes (or nothing), then a real boundary.
 * "özetleyebilir misiniz" and "tek yerde mi ilerliyor" match; "bölümünü",
 * "misafir" and "müsait" do not.
 */
export const TURKISH_QUESTION_PARTICLE =
  /(?:^|[\s(])m[iıuü](?:sin(?:iz)?|sın(?:ız)?|sun(?:uz)?|sün(?:üz)?|yim|yım|yum|yüm|yiz|yız|yuz|yüz|dir|dır|dur|dür)?(?=$|[\s,.;:!?)])/iu;

/** A direct question that is short enough to answer without re-reading it. */
const DIRECT_QUESTION_MAX = 130;

/**
 * True when the message does not carry the structure its tone promised.
 *
 * Only meaningful for first contact, and only when the caller states which
 * tone it asked for — a message validated without a tone is not being asked
 * this question, which is what keeps every pre-existing caller working.
 */
function toneShapeMismatch(text: string, tone: Tone): boolean {
  const asksOutright = text.trimEnd().endsWith("?");
  const framed = CURIOSITY_FRAME.test(text);
  // The same "…merak ettim." closing `missing_operational_question` accepts as
  // a real question — reused so the two rules can never disagree about it.
  const closesIndirect = INDIRECT_QUESTION.test(text);

  if (tone === "consultative") {
    // No question mark anywhere: the whole point of this tone is that it
    // wonders out loud rather than putting the reader on the spot.
    if (text.includes("?")) return true;
    if (framed) return true;
    return !closesIndirect;
  }

  if (tone === "soft") {
    if (!asksOutright) return true;
    if (closesIndirect) return true;
    return !framed;
  }

  // direct
  if (!asksOutright) return true;
  if (closesIndirect) return true;
  // A curiosity frame is the soft tone's opening move, not this one's.
  if (framed) return true;
  const asks = questionSentences(text);
  const shortest = asks.length > 0 ? Math.min(...asks.map((s) => s.length)) : Infinity;
  return !TURKISH_QUESTION_PARTICLE.test(text) && shortest > DIRECT_QUESTION_MAX;
}

/**
 * A real, answerable question, counted rather than pattern-matched.
 *
 * A literal `?` is the normal case. "…merak ettim." is the one exception: it
 * is grammatically a statement but pragmatically a question, and the
 * consultative tone leans on it specifically to avoid ending every message
 * the same way. Both count as "asked a question"; only the `?` count feeds
 * `too_many_questions`, because a curiosity closer never stacks with itself.
 */
const INDIRECT_QUESTION = /(merak ettim|merak ediyorum|merak ettiğim bir şey var)\.?\s*$/iu;

function countQuestionMarks(text: string): number {
  return (text.match(/\?/gu) ?? []).length;
}

/** Counts sentences, tolerating the ellipses and multiple stops a model emits. */
function countSentences(text: string): number {
  return splitSentences(text).length;
}

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?…]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * The closing ask, normalized.
 *
 * Used to catch a regenerate that changed the observation but kept the same
 * final sentence — which reads as the same message to the founder even when
 * the similarity score says otherwise.
 */
export function extractCta(text: string): string {
  const sentences = splitSentences(text);
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
  /** Absent means first contact — the safe assumption, and the stricter one. */
  stance?: OutreachStance;
  /**
   * The tone this message was asked to be written in.
   *
   * When supplied at first contact the structural contract for that tone is
   * enforced as a rule (see {@link toneShapeMismatch}). Optional so that every
   * caller predating the live-output guard — and every test that validates a
   * message without commissioning one — keeps its meaning unchanged.
   */
  tone?: Tone;
  /**
   * The evidence this first-contact message was written from.
   *
   * When present the account-specificity rules apply: the primary evidence
   * must actually appear, the question must follow from it, and a second
   * signal is allowed only if it is the declared coherent supporting one.
   *
   * When absent the pre-v3.7.9 single-signal rule applies instead — a message
   * with no declared evidence may name at most one signal topic, because
   * nothing tells us a second one was ever observed.
   */
  evidence?: EvidenceSelection | null;
  /**
   * The only sender name a message may introduce itself with. Absent/null means
   * no name is configured, so ANY personal self-introduction is invented and
   * rejected (v3.7.9 sender identity guard).
   */
  senderName?: string | null;
};

export function validateOutreachMessage(params: ValidateParams): ValidationResult {
  const { message, signals, businessName } = params;
  const stance = params.stance ?? "first_contact";
  const isFirstContact = stance === "first_contact";
  const failures: ValidationFailure[] = [];
  const text = message.trim();

  if (text.length === 0) return { ok: false, failures: ["empty"] };

  const maxLength = isFirstContact ? FIRST_CONTACT_MAX_LENGTH : MAX_LENGTH;
  const minLength = isFirstContact ? FIRST_CONTACT_MIN_LENGTH : MIN_LENGTH;
  const maxSentences = isFirstContact ? FIRST_CONTACT_MAX_SENTENCES : MAX_SENTENCES;

  if (text.length < minLength) failures.push("too_short");
  if (text.length > maxLength) failures.push("too_long");
  if (countSentences(text) > maxSentences) failures.push("too_many_sentences");

  const channelMentions = CHANNEL_PATTERNS.filter((pattern) => pattern.test(text)).length;
  if (channelMentions > MAX_CHANNEL_MENTIONS) failures.push("too_many_channels");

  if (MARKDOWN.test(text)) failures.push("markdown");
  if (URL.test(text.replace(PLATFORM_BRAND_NAMES, " "))) failures.push("url");
  if (PRICE.test(text)) failures.push("price");
  if (PLACEHOLDER.test(text)) failures.push("placeholder");

  const lower = text.toLocaleLowerCase("tr-TR");
  if (BANNED_PHRASES.some((phrase) => lower.includes(phrase))) {
    failures.push("banned_phrase");
  }
  if (JARGON_PHRASES.some((phrase) => lower.includes(phrase))) {
    failures.push("jargon");
  }

  // The model may never invent a sender name. With no configured senderName any
  // first-person named self-introduction is rejected; with one, only that exact
  // name is allowed. Uses `message` (not `lower`) so name casing is preserved.
  if (!checkSenderIdentity(text, params.senderName).ok) {
    failures.push("invented_sender_identity");
  }

  // A message may only claim a shared history when one exists.
  if (
    stance !== "follow_up" &&
    PREVIOUS_CONTACT_PATTERNS.some((pattern) => pattern.test(text))
  ) {
    failures.push("fake_previous_contact");
  }

  /* ---- v3.7.9 respectful contract ---- */

  if (UNSUPPORTED_OPERATIONAL_CLAIM.some((pattern) => pattern.test(text))) {
    failures.push("unsupported_operational_claim");
  }
  if (CONDESCENDING_DIAGNOSIS.some((pattern) => pattern.test(text))) {
    failures.push("condescending_diagnosis");
  }
  if (FEAR_BASED_CLAIM.some((pattern) => pattern.test(text))) {
    failures.push("fear_based_claim");
  }
  if (FALSE_OBSERVATION.some((pattern) => pattern.test(text))) {
    failures.push("false_observation");
  }
  // "Gördüm" is fine for a public signal and never fine for their inbox.
  if (
    splitSentences(text).some(
      (sentence) => SIGHT_VERB.test(sentence) && UNOBSERVABLE_SUBJECT.test(sentence),
    )
  ) {
    failures.push("false_observation");
  }

  /* ---- v3.7.9 Product Capability Truth Guard ---- */

  if (
    UNSUPPORTED_CAPABILITY_PHRASES.some((phrase) => lower.includes(phrase)) ||
    UNSUPPORTED_PRODUCT_CAPABILITY.some((pattern) => pattern.test(text))
  ) {
    failures.push("unsupported_product_capability");
  }
  if (GUARANTEED_BUSINESS_OUTCOME.some((pattern) => pattern.test(text))) {
    failures.push("guaranteed_business_outcome");
  }
  if (AUTONOMOUS_ACTION_CLAIM.some((pattern) => pattern.test(text))) {
    failures.push("autonomous_action_claim");
  }

  if (DEFINITE_LOSS.test(text)) failures.push("unverified_claim");

  for (const gate of CLAIM_GATES) {
    if (gate.pattern.test(text) && !gate.requires.some((key) => hasSignal(signals, key))) {
      failures.push(gate.failure);
      break;
    }
  }

  /*
   * ---- v3.7.9 Conversation-First Pain Discovery ----
   *
   * First contact and every later stage want opposite closings: a first
   * message must end on a question and never on an offer; a reply/follow-up/
   * demo-confirm message must end on an offer (the old `no_cta` rule) and may
   * explain the product freely. Stance decides which contract applies —
   * running both would reject everything.
   */
  if (isFirstContact) {
    if (FIRST_CONTACT_FORBIDDEN_CTA.some((pattern) => pattern.test(text))) {
      failures.push("first_contact_demo_offer");
    }
    if (firstContactProductPitch(text)) {
      failures.push("first_contact_product_pitch");
    }

    /* ---- v3.7.9 account-specificity contract ---- */

    if (FABRICATED_SOCIAL_CONTEXT.some((pattern) => pattern.test(text))) {
      failures.push("fabricated_social_context");
    }
    if (FABRICATED_BROWSING_CONTEXT.some((pattern) => pattern.test(text))) {
      failures.push("fabricated_browsing_context");
    }
    // Shape is a rule, not a score — a high total cannot buy a wrong structure.
    if (params.tone && toneShapeMismatch(text, params.tone)) {
      failures.push("tone_shape_mismatch");
    }
    // Nor can a high total buy a sentence no Turkish speaker would write.
    if (!validateTurkishFluency(text, params.tone).ok) {
      failures.push("unnatural_turkish_construction");
    }
    if (UNSUPPORTED_PAIN_ASSUMPTION.some((pattern) => pattern.test(text))) {
      failures.push("unsupported_pain_assumption");
    }

    const evidence = params.evidence ?? null;
    const topicCount = countSignalTopics(text, businessName);
    if (evidence) {
      const declared: PersonalizationEvidenceType[] = [
        evidence.primary.type,
        ...(evidence.supporting ? [evidence.supporting.type] : []),
      ];

      if (!EVIDENCE_TOPIC_PATTERNS[evidence.primary.type].test(text)) {
        failures.push("missing_primary_evidence");
      }
      if (
        evidence.supporting &&
        !isCoherentEvidenceCluster(evidence.primary.type, evidence.supporting.type)
      ) {
        failures.push("incoherent_evidence_cluster");
      }
      // A topic we never handed the model is a claim about an account we never
      // looked at — the exact failure "ungrounded" names.
      if (evidenceTopicsIn(text, businessName).some((topic) => !declared.includes(topic))) {
        failures.push("ungrounded_account_reference");
      }
      // Two is the ceiling, and the second slot belongs to the declared
      // supporting item. Anything else is the old two-signals-in-one-breath.
      if (topicCount > 2 || (topicCount > 1 && !evidence.supporting)) {
        failures.push("too_many_verified_signals");
      }
      if (!isQuestionGrounded(text, declared)) {
        failures.push("question_not_grounded_in_evidence");
      }
      // Grounding says the right evidence was named; this says it was named
      // as the right *kind* of thing — an OTA listing is not "direct" traffic
      // just because it sits next to a channel that is.
      if (findEvidenceSemanticMismatches(text, evidence).length > 0) {
        failures.push("evidence_semantic_mismatch");
      }
    } else if (topicCount > 1) {
      failures.push("too_many_verified_signals");
    }

    if (isGenericReusable(text, businessName)) {
      failures.push("generic_reusable_message");
    }

    const questionMarks = countQuestionMarks(text);
    const hasIndirectQuestion = INDIRECT_QUESTION.test(text);
    if (questionMarks === 0 && !hasIndirectQuestion) {
      failures.push("missing_operational_question");
    }
    if (questionMarks > 1) {
      failures.push("too_many_questions");
    }
  } else if (!CTA_PATTERNS.some((pattern) => pattern.test(text))) {
    failures.push("no_cta");
  }

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
