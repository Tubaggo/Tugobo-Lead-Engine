/**
 * Variation angles — the *subject* a message is about.
 *
 * Regenerate produces a genuinely different message by changing the angle, not
 * by reshuffling adjectives. Each angle declares which signals must exist
 * before it may be used, so an angle can never introduce a claim the lead data
 * does not support.
 */

import { hasSignal, type SignalSet } from "./signals.ts";

export const VARIATION_ANGLES = [
  "channel-consolidation",
  "missed-follow-up",
  "response-speed",
  "direct-booking",
  "multi-channel-visibility",
  "reservation-request-tracking",
  "founder-operations",
] as const;

export type VariationAngle = (typeof VARIATION_ANGLES)[number];

/** Short Turkish label shown in the modal so the founder sees what changed. */
export const ANGLE_LABELS_TR: Record<VariationAngle, string> = {
  "channel-consolidation": "Kanal takibi",
  "missed-follow-up": "Takip kaçırma",
  "response-speed": "Yanıt hızı",
  "direct-booking": "Direkt rezervasyon",
  "multi-channel-visibility": "Çok kanallı görünürlük",
  "reservation-request-tracking": "Talep takibi",
  "founder-operations": "İşletme operasyonu",
};

/** What each angle is allowed to talk about, in Turkish, for the prompt. */
export const ANGLE_BRIEFS_TR: Record<VariationAngle, string> = {
  "channel-consolidation":
    "Taleplerin farklı kanallara dağılması ve tek yerden takip edilememesi.",
  "missed-follow-up":
    "İlk mesajdan sonra takibin unutulması veya geç kalması.",
  "response-speed":
    "Gelen mesajlara dönüş süresinin uzaması ve bunun ilgiyi soğutması.",
  "direct-booking":
    "Kendi kanallarından gelen talebin rezervasyona dönmesindeki belirsizlik.",
  "multi-channel-visibility":
    "Birden fazla kanalda görünür olmanın getirdiği takip yükü.",
  "reservation-request-tracking":
    "Rezervasyon taleplerinin kaydının ve durumunun izlenmesi.",
  "founder-operations":
    "İşletme sahibinin operasyonu tek başına yürütürken zaman kaybı.",
};

/**
 * Angles usable for this lead, in priority order.
 *
 * A gate of `null` means the angle needs no specific evidence — it speaks to a
 * general operating reality rather than asserting anything about this hotel.
 */
const ANGLE_GATES: Array<{ angle: VariationAngle; requires: string[] | null }> = [
  { angle: "direct-booking", requires: ["weak_direct_booking", "conversion_gap"] },
  { angle: "channel-consolidation", requires: ["multi_channel_load", "ota_dependency"] },
  { angle: "response-speed", requires: ["response_delay", "whatsapp_reachable"] },
  { angle: "multi-channel-visibility", requires: ["instagram_present", "social_demand"] },
  { angle: "reservation-request-tracking", requires: ["booking_cta", "booking_engine"] },
  { angle: "missed-follow-up", requires: null },
  { angle: "founder-operations", requires: null },
];

export function availableAngles(signals: SignalSet): VariationAngle[] {
  const out = ANGLE_GATES.filter(
    (gate) => gate.requires === null || gate.requires.some((key) => hasSignal(signals, key)),
  ).map((gate) => gate.angle);

  // `missed-follow-up` and `founder-operations` are ungated, so this is never
  // empty; the assertion is kept as a guard against future gate edits.
  return out.length > 0 ? out : ["founder-operations"];
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
): { soft: VariationAngle; direct: VariationAngle; consultative: VariationAngle } {
  const pool = availableAngles(signals);
  const at = (offset: number): VariationAngle => {
    const index = (((rotation + offset) % pool.length) + pool.length) % pool.length;
    return pool[index];
  };
  return { soft: at(0), direct: at(1), consultative: at(2) };
}

export function isVariationAngle(value: unknown): value is VariationAngle {
  return (
    typeof value === "string" && (VARIATION_ANGLES as readonly string[]).includes(value)
  );
}
