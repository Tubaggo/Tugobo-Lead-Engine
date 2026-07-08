import { processWhatsAppDeliveryWebhookPayload, type ProcessedWhatsAppDeliveryReceipt } from "./whatsapp-delivery-receipt-processor.ts";
import { parseWhatsAppInboundReplies } from "./whatsapp-reply-listener-runtime.ts";
import { recordWhatsAppReply, type StoredWhatsAppReply } from "./whatsapp-reply-registry.ts";

/**
 * WhatsApp Webhook Event Processor (v6.2).
 *
 * The single entry point the webhook POST route calls. Combines two
 * independent, pre-existing pipelines against the same raw payload:
 *  - delivery statuses (`entry[].changes[].value.statuses[]`), unchanged,
 *    delegated entirely to `whatsapp-delivery-receipt-processor.ts` (v6.0.1)
 *    — its own recent-receipts feed and mapping behavior are untouched.
 *  - inbound replies (`entry[].changes[].value.messages[]`), new this
 *    sprint, parsed by `whatsapp-reply-listener-runtime.ts` and recorded via
 *    `whatsapp-reply-registry.ts`.
 *
 * Both pipelines tolerate a payload that only contains one of the two
 * arrays — a status-only payload yields zero replies, a message-only
 * payload yields zero receipts, neither ever throws.
 */

export type ProcessWhatsAppWebhookEventResult = {
  ok: true;
  receivedReceiptCount: number;
  receivedReplyCount: number;
  mappedReplyCount: number;
  unmappedReplyCount: number;
  receipts: ProcessedWhatsAppDeliveryReceipt[];
  replies: StoredWhatsAppReply[];
};

export function processWhatsAppWebhookEvent(payload: unknown, now: number = Date.now()): ProcessWhatsAppWebhookEventResult {
  const receiptResult = processWhatsAppDeliveryWebhookPayload(payload, now);

  const parsedReplies = parseWhatsAppInboundReplies(payload);
  const replies: StoredWhatsAppReply[] = parsedReplies.map((reply) => recordWhatsAppReply(reply, now));
  const mappedReplyCount = replies.filter((r) => r.mapped).length;

  return {
    ok: true,
    receivedReceiptCount: receiptResult.receivedCount,
    receivedReplyCount: replies.length,
    mappedReplyCount,
    unmappedReplyCount: replies.length - mappedReplyCount,
    receipts: receiptResult.receipts,
    replies,
  };
}
