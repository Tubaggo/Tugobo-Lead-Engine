/**
 * WhatsApp Delivery Receipt Runtime (v6.0.1).
 *
 * Pure parser — no `fetch`, no `process.env` read, no import of
 * `next/server`. Turns a raw WhatsApp Cloud API webhook payload
 * (`entry[].changes[].value.statuses[]`) into a safe, sanitized receipt
 * list. Never throws on malformed input — every level of the walk is
 * defensively checked, and anything that doesn't match the expected shape
 * is simply skipped rather than causing a failure.
 *
 * This module is only about delivery receipts (sent/delivered/read/failed).
 * It does not parse inbound message content, does not detect replies, and
 * does not trigger any follow-up — those are explicitly out of scope this
 * sprint.
 */

export type WhatsAppDeliveryStatus = "sent" | "delivered" | "read" | "failed" | "unknown";

export type WhatsAppDeliveryAuditType =
  | "whatsapp_delivery_sent"
  | "whatsapp_delivery_delivered"
  | "whatsapp_delivery_read"
  | "whatsapp_delivery_failed"
  | "whatsapp_delivery_unknown";

export const DELIVERY_STATUS_LABELS_TR: Record<WhatsAppDeliveryStatus, string> = {
  sent: "Gönderildi",
  delivered: "Teslim Edildi",
  read: "Okundu",
  failed: "Başarısız",
  unknown: "Bilinmiyor",
};

const AUDIT_TYPE_BY_STATUS: Record<WhatsAppDeliveryStatus, WhatsAppDeliveryAuditType> = {
  sent: "whatsapp_delivery_sent",
  delivered: "whatsapp_delivery_delivered",
  read: "whatsapp_delivery_read",
  failed: "whatsapp_delivery_failed",
  unknown: "whatsapp_delivery_unknown",
};

export type WhatsAppDeliveryReceipt = {
  provider: "whatsapp";
  providerMessageId: string;
  status: WhatsAppDeliveryStatus;
  rawStatus: string;
  recipientMasked: string | null;
  occurredAt: number;
  conversationIdSafe: string | null;
  pricingCategorySafe: string | null;
  errorCodeSafe: number | string | null;
  errorTypeSafe: string | null;
  errorMessageSafe: string | null;
  auditType: WhatsAppDeliveryAuditType;
};

/* ── Masking ────────────────────────────────────────────────────── */

/** Never returns more than the last 2 characters — mirrors `maskWhatsAppRecipient`'s convention. */
export function maskWhatsAppId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const visible = trimmed.slice(-2);
  return `••• ••• ${visible}`;
}

/* ── Status normalization ───────────────────────────────────────── */

const VALID_STATUSES: readonly string[] = ["sent", "delivered", "read", "failed"];

export function normalizeWhatsAppDeliveryStatus(status: unknown): WhatsAppDeliveryStatus {
  if (typeof status === "string" && VALID_STATUSES.includes(status)) {
    return status as WhatsAppDeliveryStatus;
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

/* ── Single status entry ────────────────────────────────────────── */

function parseOneStatus(statusEntry: unknown): WhatsAppDeliveryReceipt | null {
  if (typeof statusEntry !== "object" || statusEntry === null) return null;
  const s = statusEntry as Record<string, unknown>;

  const providerMessageId = typeof s.id === "string" ? s.id : null;
  if (!providerMessageId) return null;

  const rawStatus = typeof s.status === "string" ? s.status : "";
  const status = normalizeWhatsAppDeliveryStatus(s.status);

  const conversation =
    s.conversation && typeof s.conversation === "object" ? (s.conversation as Record<string, unknown>) : undefined;
  const conversationIdSafe = conversation && typeof conversation.id === "string" ? conversation.id : null;

  const pricing = s.pricing && typeof s.pricing === "object" ? (s.pricing as Record<string, unknown>) : undefined;
  const pricingCategorySafe = pricing && typeof pricing.category === "string" ? pricing.category : null;

  let errorCodeSafe: number | string | null = null;
  let errorTypeSafe: string | null = null;
  let errorMessageSafe: string | null = null;
  if (Array.isArray(s.errors) && s.errors.length > 0 && typeof s.errors[0] === "object" && s.errors[0] !== null) {
    const err = s.errors[0] as Record<string, unknown>;
    if (typeof err.code === "number" || typeof err.code === "string") errorCodeSafe = err.code;
    if (typeof err.title === "string") errorTypeSafe = err.title;
    if (typeof err.message === "string") errorMessageSafe = err.message.slice(0, 200);
  }

  return {
    provider: "whatsapp",
    providerMessageId,
    status,
    rawStatus,
    recipientMasked: maskWhatsAppId(typeof s.recipient_id === "string" ? s.recipient_id : null),
    occurredAt: toOccurredAt(s.timestamp),
    conversationIdSafe,
    pricingCategorySafe,
    errorCodeSafe,
    errorTypeSafe,
    errorMessageSafe,
    auditType: AUDIT_TYPE_BY_STATUS[status],
  };
}

/* ── Payload walk ───────────────────────────────────────────────── */

/**
 * Pure. Walks `entry[].changes[].value.statuses[]` defensively — any
 * missing/wrong-typed level simply yields no receipts from that branch,
 * never a thrown error. The raw payload itself is never stored or echoed
 * back; only this sanitized receipt list is ever produced from it.
 */
export function parseWhatsAppDeliveryReceipts(payload: unknown): WhatsAppDeliveryReceipt[] {
  const receipts: WhatsAppDeliveryReceipt[] = [];
  if (typeof payload !== "object" || payload === null) return receipts;

  const entries = (payload as Record<string, unknown>).entry;
  if (!Array.isArray(entries)) return receipts;

  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) continue;
    const changes = (entry as Record<string, unknown>).changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      if (typeof change !== "object" || change === null) continue;
      const value = (change as Record<string, unknown>).value;
      if (typeof value !== "object" || value === null) continue;
      const statuses = (value as Record<string, unknown>).statuses;
      if (!Array.isArray(statuses)) continue;

      for (const statusEntry of statuses) {
        const receipt = parseOneStatus(statusEntry);
        if (receipt) receipts.push(receipt);
      }
    }
  }

  return receipts;
}

/* ── Audit ──────────────────────────────────────────────────────── */

export type WhatsAppDeliveryAuditEvent = {
  timestamp: number;
  actor: string;
  action: WhatsAppDeliveryAuditType;
  details: string;
};

/** providerMessageId ("wamid...") is Meta's own opaque message id, not PII — safe to include in full. */
export function buildDeliveryReceiptAuditEvent(receipt: WhatsAppDeliveryReceipt): WhatsAppDeliveryAuditEvent {
  return {
    timestamp: receipt.occurredAt,
    actor: "WhatsApp",
    action: receipt.auditType,
    details: `${DELIVERY_STATUS_LABELS_TR[receipt.status]} — ${receipt.providerMessageId}`,
  };
}
