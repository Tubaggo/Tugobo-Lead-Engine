/**
 * v3.7.9 — Product Capability Truth Guard.
 *
 * Single source of truth for what TUGOBO actually does today. Everything
 * downstream — the system prompt's PRODUCT TRUTH CONTRACT, the validator's
 * capability-claim rules, and this module's own safe/unsupported phrase
 * banks — traces back to the flags below, so a real capability change is one
 * edit here rather than a hunt across prompt strings and regexes.
 *
 * Why this exists: the respectful-outreach calibration (v3.7.9, same sprint)
 * stopped the model from diagnosing the recipient. It did nothing to stop the
 * model from *overselling the product* to compensate — a live run produced
 * "gelen mesajlarınızı otomatik olarak takip edip yanıtlayabiliyorsunuz",
 * which is grounded in no signal, respectful in tone, and simply untrue.
 * TUGOBO does not auto-reply. A human opens WhatsApp and sends every message
 * (see `window.open(waLink)` in LeadMessageEditor.tsx) — there is no
 * autonomous-send path anywhere in this codebase to make that claim true.
 *
 * Pure: no React, no I/O, no `server-only`. Consumed by prompt.ts and
 * validator.ts, and asserted against directly in tests so the contract can
 * never drift silently between the three.
 */

/**
 * What TUGOBO is verified to do, as of this sprint. `true` entries are safe to
 * describe in outreach copy; `false` entries name the promises we do not make
 * and must actively reject if a model reaches for them anyway.
 */
export const OUTREACH_CAPABILITIES = {
  /** Talepleri tek operasyon ekranında toplar. */
  channelAggregation: true,
  /** Takip veya aksiyon bekleyen talebi görünür kılar. */
  followUpVisibility: true,
  /** Rezervasyon durumunun izlenmesini kolaylaştırır. */
  reservationStateVisibility: true,
  /** Ödeme durumunun izlenmesini kolaylaştırır. */
  paymentStateVisibility: true,
  /** AI destekli yanıt hazırlamaya yardımcı olur — göndermez. */
  aiAssistance: true,
  /** Her adım insan gözetimi ve onayıyla ilerler. */
  humanSupervision: true,

  /** İnsan onayı olmadan otomatik mesaj göndermez. */
  automaticSend: false,
  /** Tamamen otonom, insan müdahalesi olmadan yanıt vermez. */
  autonomousReply: false,
  /** Talebi rezervasyona dönüştürdüğünü garanti etmez. */
  guaranteedConversion: false,
  /** Satış veya gelir artışı garanti etmez. */
  guaranteedRevenueLift: false,
  /** Rezervasyon/misafir kaybını kesin olarak önlediğini garanti etmez. */
  guaranteedLossPrevention: false,
} as const;

export type OutreachCapabilityKey = keyof typeof OUTREACH_CAPABILITIES;

/**
 * Reference fragments for what a message MAY say, one per supported
 * capability. These are prompt guidance, not a literal quote-bank — the model
 * still writes its own sentence, but every one it writes must describe one of
 * these, and nothing beyond them.
 */
/*
 * Deliberately says "yanıt hazırlamayı kolaylaştırır", not "AI destekli
 * yanıt…" — the validator's pre-existing hard-sell filter already bans "ai
 * destekli" as startup-pitch jargon (see BANNED_PHRASES in validator.ts). The
 * `aiAssistance` capability is still true; it is just never worth spelling out
 * the acronym in a message that is trying not to read like a pitch deck.
 */
export const SAFE_CAPABILITY_CLAIMS_TR: readonly string[] = [
  "talepleri tek ekranda toplar",
  "takip bekleyen talepleri görünür kılar",
  "rezervasyon sürecinin durumunu izlemeyi kolaylaştırır",
  "ödeme durumunun izlenmesini kolaylaştırır",
  "ekibin hangi talebe dönmesi gerektiğini görmesine yardımcı olur",
  "dijital kanallardan gelen talepleri düzenli takip etmeyi kolaylaştırır",
  "yanıt hazırlamayı kolaylaştırır",
  "insan gözetimiyle ilerler",
];

/**
 * Reference fragments for what a message must NEVER say — outcomes we do not
 * control (a conversion, a sale, a revenue number, a prevented loss) and
 * actions we do not take without a human (sending, replying, deciding).
 */
export const UNSUPPORTED_CAPABILITY_CLAIMS_TR: readonly string[] = [
  "otomatik yanıtlar",
  "otomatik gönderir",
  "kendiliğinden takip eder",
  "kendiliğinden cevap verir",
  "insan müdahalesi olmadan",
  "rezervasyona dönüştürür",
  "satışa çevirir",
  "geliri artırır",
  "kaybı önler",
  "misafir kaçırmaz",
  "garanti eder",
];

/**
 * The PRODUCT TRUTH CONTRACT block, in Turkish then English.
 *
 * Built from {@link OUTREACH_CAPABILITIES} rather than hand-duplicated, so the
 * prompt cannot describe a capability the flags above call unsupported.
 * Rendered once into `OUTREACH_MESSAGE_SYSTEM`; tests assert the exact text is
 * present so the two can never drift apart.
 */
export function buildProductTruthContract(): string {
  return `ÜRÜN GERÇEĞİ SÖZLEŞMESİ (mutlak — ihlal edersen mesaj reddedilir):
- Yalnızca aşağıda açıkça desteklenen yeteneklerden bahset:
${SAFE_CAPABILITY_CLAIMS_TR.map((c) => `  - ${c}`).join("\n")}
- Şunları ASLA iddia etme: otomatik gönderim, otonom yanıt verme, garanti edilen dönüşüm, garanti edilen gelir artışı, garanti edilen kayıp önleme.
- TUGOBO görünürlük, düzen ve AI destekli yardım sağlar — garanti edilen iş sonucu değil.
- TUGOBO insan gözetimiyle çalışır; mesajları TUGOBO değil, kurucu gönderir.

PRODUCT TRUTH CONTRACT (same rules, stated again):
Only describe capabilities explicitly listed as supported.
Never claim automatic sending, autonomous replying, guaranteed conversion, guaranteed revenue growth or guaranteed loss prevention.
Describe visibility, organization and AI-assisted support — not guaranteed business outcomes.
TUGOBO operates with human supervision.`;
}
