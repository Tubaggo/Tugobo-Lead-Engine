/**
 * What the outreach copy is allowed to assume about the relationship.
 *
 * The engine grounds *what* a message says in verified signals. This module
 * grounds *how* it opens: whether we have spoken to this lead before at all.
 *
 * It exists because "follow-up due" and "we have talked before" are different
 * facts and the pipeline conflates them. A lead can sit in `needs_follow_up`,
 * or in today's queue, without a single message ever having been sent — and a
 * message that opens with "önceki görüşmemize istinaden" to someone who has
 * never heard from us is the one mistake outreach copy cannot recover from.
 *
 * Pure: no React, no I/O, no `server-only`. Runs on both sides of the wire.
 */

export const OUTREACH_STANCES = ["first_contact", "follow_up", "demo_confirm"] as const;

/** The relationship position a generated message must be written from. */
export type OutreachStance = (typeof OUTREACH_STANCES)[number];

export function isOutreachStance(value: unknown): value is OutreachStance {
  return (
    typeof value === "string" && (OUTREACH_STANCES as readonly string[]).includes(value)
  );
}

/**
 * Real pipeline facts about one lead, in the vocabulary the copy cares about.
 *
 * `hasPreviousContact` is deliberately separate from `followUpDue` and
 * `isQueued`: only an actual outbound touch sets it.
 */
export type OutreachLifecycleContext = {
  salesStage?: string;
  isQueued?: boolean;
  followUpDue?: boolean;
  nextFollowUpAt?: string | null;
  lastContactAt?: string | null;
  lastContactType?: string | null;
  hasPreviousContact: boolean;
  lastActivitySummary?: string;
};

/**
 * Which stance to write from.
 *
 * Follow-up language is gated on `hasPreviousContact` and nothing else. A due
 * date, a queue slot or a `needs_follow_up` status can all be true of a lead
 * that has never been contacted, so none of them may unlock it.
 */
export function computeOutreachStance(ctx: OutreachLifecycleContext): OutreachStance {
  const stage = (ctx.salesStage ?? "").toLowerCase();
  if (stage === "meeting" || stage === "demo" || stage === "demo_scheduled") {
    return "demo_confirm";
  }
  if (ctx.followUpDue && ctx.hasPreviousContact) return "follow_up";
  if (ctx.hasPreviousContact && (stage === "contacted" || stage === "replied")) {
    return "follow_up";
  }
  return "first_contact";
}

/** What the Operation Guide tells the founder to do today. */
export const GUIDE_ACTIONS = [
  "do_not_contact",
  "verify_channel",
  "demo_confirm",
  "follow_up",
  "first_contact",
  "hold",
] as const;

export type GuideAction = (typeof GUIDE_ACTIONS)[number];

/**
 * Today's action, in precedence order.
 *
 * Channel verification outranks every outreach action: recommending WhatsApp
 * for a lead whose number was never verified sends the founder to a dead end,
 * and a message drafted for a channel we cannot reach is wasted work.
 */
export function computeGuideAction(
  ctx: OutreachLifecycleContext,
  options: { hasVerifiedChannel: boolean; doNotContact: boolean; closed?: boolean },
): GuideAction {
  if (options.doNotContact) return "do_not_contact";
  if (options.closed) return "hold";
  if (!options.hasVerifiedChannel) return "verify_channel";

  const stance = computeOutreachStance(ctx);
  if (stance === "demo_confirm") return "demo_confirm";
  if (stance === "follow_up") return "follow_up";

  // Nothing due and already touched: the next move is time, not a message.
  if (ctx.hasPreviousContact && !ctx.followUpDue) return "hold";
  return "first_contact";
}

/** Founder-facing action labels. Kept here so the card and tests agree. */
export const GUIDE_ACTION_LABELS: Record<GuideAction, { tr: string; en: string }> = {
  do_not_contact: { tr: "İletişim kurma", en: "Do not contact" },
  verify_channel: { tr: "Kanalı doğrula", en: "Verify channel" },
  demo_confirm: { tr: "Demo teyidi gönder", en: "Confirm demo" },
  follow_up: { tr: "Takip mesajı gönder", en: "Send follow-up" },
  first_contact: { tr: "İlk temas oluştur", en: "Make first contact" },
  hold: { tr: "Beklet", en: "Hold" },
};

/**
 * Stance briefs handed to the model.
 *
 * Each one states what the message may assume and, more importantly, what it
 * may not — the first-contact brief forbids referencing a conversation because
 * that is the failure this whole module exists to prevent.
 */
export const STANCE_BRIEFS_TR: Record<OutreachStance, string> = {
  first_contact:
    "Bu ilk temas. Daha önce hiç yazışmadınız. Önceki bir görüşmeye, mesaja veya konuşmaya ASLA atıf yapma. Kendini kısaca tanıt. Amacın satış yapmak değil, doğal bir cevap almak: tek doğrulanmış kamusal sinyale dayanan, teşhis koymayan TEK bir açık uçlu operasyon sorusu sor. Demo, örnek veya görüşme teklif etme; ürünü anlatma.",
  follow_up:
    "Daha önce bu işletmeye yazdınız ve yanıt gelmedi. Kısa bir hatırlatma yaz. Israrcı olma, suçlayıcı olma, ilk mesajın içeriğini tekrar anlatma. Yeni ve tek bir açı ekle.",
  demo_confirm:
    "Bu işletmeyle bir görüşme planlandı. Yeni satış argümanı sunma. Görüşmeyi teyit et ve neye hazırlanacağını tek cümleyle söyle.",
};
