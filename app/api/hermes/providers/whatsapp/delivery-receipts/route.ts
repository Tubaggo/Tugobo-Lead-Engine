import { NextResponse } from "next/server";
import { getRecentProcessedReceipts } from "@/app/lib/whatsapp-delivery-receipt-processor";

/**
 * WhatsApp Delivery Receipts — recent feed (v6.0.1).
 *
 * GET-only, read-only. Returns the most recently processed delivery
 * receipts (newest first) for the small additive UI card — never used by
 * any gate/policy decision. Safe by construction: the receipts it reads
 * from `getRecentProcessedReceipts` are already sanitized by the processor
 * (masked recipient, no message body, no raw webhook payload).
 */

export async function GET() {
  const receipts = getRecentProcessedReceipts();
  return NextResponse.json({ latest: receipts[0] ?? null, recentCount: receipts.length, receipts });
}
