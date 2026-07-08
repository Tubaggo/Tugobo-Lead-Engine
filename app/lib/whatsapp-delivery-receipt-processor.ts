import {
  buildDeliveryReceiptAuditEvent,
  parseWhatsAppDeliveryReceipts,
  type WhatsAppDeliveryAuditEvent,
  type WhatsAppDeliveryReceipt,
} from "./whatsapp-delivery-receipt-runtime.ts";
import { getProviderMessageMapping, updateProviderMessageMappingDeliveryStatus } from "./hermes-provider-message-registry.ts";
import { getRecentWhatsAppReplies } from "./whatsapp-reply-registry.ts";
import { upsertFollowUpCandidate } from "./follow-up-registry.ts";
import type { FollowUpReason } from "./follow-up-runtime.ts";

/**
 * WhatsApp Delivery Receipt Processor (v6.0.1, seeds follow-up candidates in v6.5).
 *
 * The glue layer between the pure parser (`whatsapp-delivery-receipt-runtime.ts`)
 * and the mapping registry (`hermes-provider-message-registry.ts`) — same
 * role `hermes-mission-approval-resolver.ts` plays between the mission-state
 * bridge and the controlled-send evaluator. Pure with respect to its inputs
 * (no `fetch`, no `process.env`), but does read/patch the registry.
 *
 * An unmapped receipt (no prior `registerProviderMessageMapping` call for
 * that `providerMessageId` — e.g. the mapping expired, or the message was
 * never sent through this Hermes instance) is still processed and returned
 * with `mapped: false`; it never fails the webhook. This module never
 * throws — a malformed payload simply yields zero receipts (the parser
 * already guarantees that).
 *
 * `read`/`delivered`/`failed` receipts also seed a follow-up candidate
 * (`read_no_reply`/`delivered_no_reply`/`failed_delivery_recovery`) — see
 * `seedFollowUpForReceipt` below. `read`/`delivered` are skipped when a
 * reply already exists for the same mission (the lead responded, no
 * follow-up nag needed); `failed` always seeds one, since a failed send
 * always needs recovery attention regardless of reply history. Wrapped so
 * a follow-up failure can never break receipt processing itself.
 */

export type ProcessedWhatsAppDeliveryReceipt = WhatsAppDeliveryReceipt & {
  missionId: string | null;
  leadId: string | null;
  mapped: boolean;
};

export type ProcessWhatsAppWebhookResult = {
  ok: true;
  receivedCount: number;
  mappedCount: number;
  unmappedCount: number;
  receipts: ProcessedWhatsAppDeliveryReceipt[];
  audit: WhatsAppDeliveryAuditEvent[];
};

/** Returns `undefined` for anything that isn't valid, parseable JSON — never throws. */
export function parseJsonBodySafely(raw: string): unknown | undefined {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

const RECENT_RECEIPTS_LIMIT = 20;
let recentReceipts: ProcessedWhatsAppDeliveryReceipt[] = [];

function recordRecentReceipts(receipts: ProcessedWhatsAppDeliveryReceipt[]): void {
  if (receipts.length === 0) return;
  recentReceipts = [...receipts, ...recentReceipts].slice(0, RECENT_RECEIPTS_LIMIT);
}

/** Newest first. Used only by the small additive UI card — never by any gate/policy decision. */
export function getRecentProcessedReceipts(limit: number = RECENT_RECEIPTS_LIMIT): ProcessedWhatsAppDeliveryReceipt[] {
  return recentReceipts.slice(0, limit);
}

/** Test-only escape hatch — resets the module-level recent-receipts feed between test cases. */
export function __resetRecentReceiptsForTests(): void {
  recentReceipts = [];
}

/**
 * `read`/`delivered` are skipped when a reply already exists for the same
 * mission — the lead already responded, a "did you see this?" nag would be
 * noise. `missionId === null` (unmapped, or exact correlation unreliable)
 * still seeds a candidate rather than silently skipping it, per this
 * sprint's "conservative candidate with safe reason" rule. `now` is
 * threaded through explicitly rather than left to default to `Date.now()`
 * — reading the reply feed with a different clock value than the one the
 * reply was recorded under could make a just-recorded reply look already
 * expired and get pruned before this check ever sees it.
 */
function hasExistingReplyForMission(missionId: string | null, now: number): boolean {
  if (!missionId) return false;
  return getRecentWhatsAppReplies(50, now).some((r) => r.missionId === missionId);
}

const FOLLOW_UP_REASON_BY_STATUS: Partial<Record<WhatsAppDeliveryReceipt["status"], FollowUpReason>> = {
  read: "read_no_reply",
  delivered: "delivered_no_reply",
  failed: "failed_delivery_recovery",
};

function seedFollowUpForReceipt(receipt: ProcessedWhatsAppDeliveryReceipt, now: number): void {
  const reason = FOLLOW_UP_REASON_BY_STATUS[receipt.status];
  if (!reason) return;
  if (reason !== "failed_delivery_recovery" && hasExistingReplyForMission(receipt.missionId, now)) return;

  try {
    upsertFollowUpCandidate(
      {
        source: "delivery_receipt",
        reason,
        provider: "whatsapp",
        sourceId: receipt.providerMessageId,
        providerMessageId: receipt.providerMessageId,
        missionId: receipt.missionId,
        leadId: receipt.leadId,
      },
      now,
    );
  } catch {
    // Follow-up seeding must never break delivery receipt processing.
  }
}

/**
 * Parses the webhook payload, resolves each receipt's mission/lead via the
 * registry when possible, and records the processed batch into the small
 * recent-receipts feed the UI card reads from. Always returns `ok: true` —
 * a webhook receiver must never fail the caller (Meta) over an unmapped or
 * even malformed status entry; `parseWhatsAppDeliveryReceipts` already
 * degrades malformed input to an empty list rather than throwing.
 */
export function processWhatsAppDeliveryWebhookPayload(
  payload: unknown,
  now: number = Date.now(),
): ProcessWhatsAppWebhookResult {
  const parsedReceipts = parseWhatsAppDeliveryReceipts(payload);
  const receipts: ProcessedWhatsAppDeliveryReceipt[] = [];
  const audit: WhatsAppDeliveryAuditEvent[] = [];
  let mappedCount = 0;

  for (const receipt of parsedReceipts) {
    const mapping = getProviderMessageMapping(receipt.providerMessageId, now);
    const mapped = Boolean(mapping);
    if (mapped) {
      mappedCount += 1;
      updateProviderMessageMappingDeliveryStatus(receipt.providerMessageId, receipt.status, receipt.occurredAt);
    }

    const processed: ProcessedWhatsAppDeliveryReceipt = {
      ...receipt,
      missionId: mapping?.missionId ?? null,
      leadId: mapping?.leadId ?? null,
      mapped,
    };
    receipts.push(processed);
    seedFollowUpForReceipt(processed, now);

    const baseEvent = buildDeliveryReceiptAuditEvent(receipt);
    audit.push({
      ...baseEvent,
      details: mapped ? `${baseEvent.details} — mission: ${mapping!.missionId}` : `${baseEvent.details} — eşleşmemiş (unmapped)`,
    });
  }

  recordRecentReceipts(receipts);

  return {
    ok: true,
    receivedCount: receipts.length,
    mappedCount,
    unmappedCount: receipts.length - mappedCount,
    receipts,
    audit,
  };
}
