/**
 * WhatsApp Reply Listener Runtime (v6.2).
 *
 * Pure parser — no `fetch`, no `process.env` read, no import of
 * `next/server`. Turns a raw WhatsApp Cloud API webhook payload
 * (`entry[].changes[].value.messages[]`) into a safe, sanitized inbound
 * reply list. Never throws on malformed input — every level of the walk is
 * defensively checked, and anything that doesn't match the expected shape
 * is simply skipped rather than causing a failure.
 *
 * This module is only about listening: it does not classify intent, does
 * not decide what the reply means, and never triggers a send/follow-up.
 * Full message bodies are never kept — only a 160-char preview — and
 * sender identifiers are always masked, mirroring the convention already
 * established by `whatsapp-delivery-receipt-runtime.ts` (`maskWhatsAppId`).
 */

export type WhatsAppInboundMessageType = "text" | "button" | "interactive" | "unknown";

export type WhatsAppReplyAuditType = "whatsapp_reply_received" | "whatsapp_reply_unknown_type";

export const REPLY_MESSAGE_TYPE_LABELS_TR: Record<WhatsAppInboundMessageType, string> = {
  text: "Metin",
  button: "Buton",
  interactive: "Etkileşimli",
  unknown: "Bilinmiyor",
};

export type WhatsAppInboundReply = {
  provider: "whatsapp";
  providerMessageId: string;
  fromMasked: string | null;
  fromWaIdMasked: string | null;
  messageType: WhatsAppInboundMessageType;
  textPreview: string | null;
  rawType: string;
  occurredAt: number;
  /**
   * The wamid of the message this reply quotes (`message.context.id`), if
   * the customer used WhatsApp's swipe-to-reply. This is Meta's own opaque
   * message id — not PII — and happens to be exactly the `providerMessageId`
   * Hermes registers in `hermes-provider-message-registry.ts` right after a
   * send, which is what makes reliable mission mapping possible in
   * `whatsapp-reply-registry.ts` without guessing.
   */
  conversationIdSafe: string | null;
  contactProfileNameSafe: string | null;
  auditType: WhatsAppReplyAuditType;
};

const TEXT_PREVIEW_MAX_LENGTH = 160;
const CONTACT_NAME_MAX_LENGTH = 80;

/* ── Masking ────────────────────────────────────────────────────── */

/** Never returns more than the last 2 characters — same convention as `maskWhatsAppId`. */
export function maskWhatsAppSender(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const visible = trimmed.slice(-2);
  return `••• ••• ${visible}`;
}

/* ── Message type normalization ────────────────────────────────── */

const VALID_MESSAGE_TYPES: readonly string[] = ["text", "button", "interactive"];

export function normalizeWhatsAppInboundMessageType(type: unknown): WhatsAppInboundMessageType {
  if (typeof type === "string" && VALID_MESSAGE_TYPES.includes(type)) {
    return type as WhatsAppInboundMessageType;
  }
  return "unknown";
}

/* ── Timestamp ──────────────────────────────────────────────────── */

/** WhatsApp sends `timestamp` as a Unix seconds string. Falls back to `Date.now()` for anything unparseable. */
function toOccurredAt(rawTimestamp: unknown): number {
  const seconds =
    typeof rawTimestamp === "string" && rawTimestamp.trim()
      ? Number(rawTimestamp)
      : typeof rawTimestamp === "number"
        ? rawTimestamp
        : NaN;
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  return Date.now();
}

/* ── Text preview extraction ───────────────────────────────────── */

function truncatePreview(text: string): string {
  return text.slice(0, TEXT_PREVIEW_MAX_LENGTH);
}

function extractTextPreview(messageType: WhatsAppInboundMessageType, message: Record<string, unknown>): string | null {
  if (messageType === "text") {
    const text = message.text;
    if (text && typeof text === "object" && typeof (text as Record<string, unknown>).body === "string") {
      return truncatePreview((text as Record<string, unknown>).body as string);
    }
    return null;
  }

  if (messageType === "button") {
    const button = message.button;
    if (button && typeof button === "object" && typeof (button as Record<string, unknown>).text === "string") {
      return truncatePreview((button as Record<string, unknown>).text as string);
    }
    return null;
  }

  if (messageType === "interactive") {
    const interactive = message.interactive;
    if (interactive && typeof interactive === "object") {
      const i = interactive as Record<string, unknown>;
      const buttonReply = i.button_reply && typeof i.button_reply === "object" ? (i.button_reply as Record<string, unknown>) : undefined;
      if (buttonReply && typeof buttonReply.title === "string") return truncatePreview(buttonReply.title);
      const listReply = i.list_reply && typeof i.list_reply === "object" ? (i.list_reply as Record<string, unknown>) : undefined;
      if (listReply && typeof listReply.title === "string") return truncatePreview(listReply.title);
    }
    return null;
  }

  return null;
}

/* ── Contact lookup ─────────────────────────────────────────────── */

function findContactForWaId(contacts: unknown, waId: string | null): { name: string | null; waId: string | null } {
  if (!Array.isArray(contacts) || !waId) return { name: null, waId: null };
  for (const contact of contacts) {
    if (typeof contact !== "object" || contact === null) continue;
    const c = contact as Record<string, unknown>;
    if (typeof c.wa_id !== "string" || c.wa_id !== waId) continue;
    const profile = c.profile && typeof c.profile === "object" ? (c.profile as Record<string, unknown>) : undefined;
    const name = profile && typeof profile.name === "string" ? profile.name.trim().slice(0, CONTACT_NAME_MAX_LENGTH) : null;
    return { name: name || null, waId: c.wa_id };
  }
  return { name: null, waId: null };
}

/* ── Single message entry ───────────────────────────────────────── */

function parseOneMessage(messageEntry: unknown, contacts: unknown): WhatsAppInboundReply | null {
  if (typeof messageEntry !== "object" || messageEntry === null) return null;
  const m = messageEntry as Record<string, unknown>;

  const providerMessageId = typeof m.id === "string" ? m.id : null;
  if (!providerMessageId) return null;

  const rawType = typeof m.type === "string" ? m.type : "";
  const messageType = normalizeWhatsAppInboundMessageType(m.type);

  const from = typeof m.from === "string" ? m.from : null;
  const contact = findContactForWaId(contacts, from);

  const context = m.context && typeof m.context === "object" ? (m.context as Record<string, unknown>) : undefined;
  const conversationIdSafe = context && typeof context.id === "string" ? context.id : null;

  return {
    provider: "whatsapp",
    providerMessageId,
    fromMasked: maskWhatsAppSender(from),
    fromWaIdMasked: maskWhatsAppSender(contact.waId),
    messageType,
    textPreview: extractTextPreview(messageType, m),
    rawType,
    occurredAt: toOccurredAt(m.timestamp),
    conversationIdSafe,
    contactProfileNameSafe: contact.name,
    auditType: messageType === "unknown" ? "whatsapp_reply_unknown_type" : "whatsapp_reply_received",
  };
}

/* ── Payload walk ───────────────────────────────────────────────── */

/**
 * Pure. Walks `entry[].changes[].value.messages[]` defensively — any
 * missing/wrong-typed level simply yields no replies from that branch,
 * never a thrown error. The raw payload itself is never stored or echoed
 * back; only this sanitized reply list is ever produced from it. Coexists
 * with `parseWhatsAppDeliveryReceipts`, which walks the sibling
 * `statuses[]` array in the same `value` object.
 */
export function parseWhatsAppInboundReplies(payload: unknown): WhatsAppInboundReply[] {
  const replies: WhatsAppInboundReply[] = [];
  if (typeof payload !== "object" || payload === null) return replies;

  const entries = (payload as Record<string, unknown>).entry;
  if (!Array.isArray(entries)) return replies;

  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) continue;
    const changes = (entry as Record<string, unknown>).changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      if (typeof change !== "object" || change === null) continue;
      const value = (change as Record<string, unknown>).value;
      if (typeof value !== "object" || value === null) continue;
      const messages = (value as Record<string, unknown>).messages;
      if (!Array.isArray(messages)) continue;
      const contacts = (value as Record<string, unknown>).contacts;

      for (const messageEntry of messages) {
        const reply = parseOneMessage(messageEntry, contacts);
        if (reply) replies.push(reply);
      }
    }
  }

  return replies;
}

/* ── Audit ──────────────────────────────────────────────────────── */

export type WhatsAppReplyAuditEvent = {
  timestamp: number;
  actor: string;
  action: WhatsAppReplyAuditType;
  details: string;
};

/** providerMessageId ("wamid...") is Meta's own opaque message id, not PII — safe to include in full. */
export function buildWhatsAppReplyAuditEvent(reply: WhatsAppInboundReply): WhatsAppReplyAuditEvent {
  return {
    timestamp: reply.occurredAt,
    actor: "WhatsApp",
    action: reply.auditType,
    details: `${REPLY_MESSAGE_TYPE_LABELS_TR[reply.messageType]} yanıt alındı — ${reply.providerMessageId}`,
  };
}
