import { NextResponse } from "next/server";
import { verifyWhatsAppWebhookChallenge } from "@/app/lib/whatsapp-webhook-verification";
import { parseJsonBodySafely, processWhatsAppDeliveryWebhookPayload } from "@/app/lib/whatsapp-delivery-receipt-processor";

/**
 * WhatsApp Webhook — verification (GET) + delivery receipts (POST) (v6.0.1).
 *
 * GET is Meta's one-time subscription handshake: `hub.mode`,
 * `hub.verify_token`, `hub.challenge`. `WHATSAPP_WEBHOOK_VERIFY_TOKEN` is
 * read only here, compared via the pure `verifyWhatsAppWebhookChallenge`,
 * and never logged or returned in the response body — a mismatch always
 * gets the same generic 403, so no enumeration signal leaks either way.
 *
 * POST receives delivery-status webhooks
 * (`entry[].changes[].value.statuses[]`) — sent/delivered/read/failed only.
 * This route is NOT a reply listener: it does not parse inbound message
 * content, does not detect replies, and never triggers a send. It always
 * responds 200 (even for a malformed body) because Meta's platform expects
 * a fast 2xx acknowledgment and will retry/eventually disable a webhook
 * that doesn't provide one — the malformed case is reported via `ok: false`
 * in the body instead of an HTTP error status.
 */

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = verifyWhatsAppWebhookChallenge({
    mode: url.searchParams.get("hub.mode"),
    verifyToken: url.searchParams.get("hub.verify_token"),
    challenge: url.searchParams.get("hub.challenge"),
    configuredVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
  });

  if (result.ok) {
    return new NextResponse(result.challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }

  return NextResponse.json({ error: "Doğrulama başarısız." }, { status: 403 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  const parsedBody = parseJsonBodySafely(raw);
  if (parsedBody === undefined) {
    return NextResponse.json({ ok: false, error: "Geçersiz webhook gövdesi." }, { status: 200 });
  }

  const result = processWhatsAppDeliveryWebhookPayload(parsedBody);
  return NextResponse.json(result);
}
