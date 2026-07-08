import { NextResponse } from "next/server";
import { getRecentWhatsAppReplies } from "@/app/lib/whatsapp-reply-registry";

/**
 * WhatsApp Inbound Replies — recent feed (v6.2).
 *
 * GET-only, read-only. Returns the most recently received inbound WhatsApp
 * replies (newest first) for the Founder Revenue Workspace, plus a small
 * type/mapping breakdown. Safe by construction: the replies it reads from
 * `getRecentWhatsAppReplies` are already sanitized by the parser (masked
 * sender, textPreview capped at 160 chars, no raw webhook payload).
 */

export async function GET() {
  const replies = getRecentWhatsAppReplies();
  const summary = {
    total: replies.length,
    mapped: replies.filter((r) => r.mapped).length,
    unmapped: replies.filter((r) => !r.mapped).length,
    text: replies.filter((r) => r.messageType === "text").length,
    button: replies.filter((r) => r.messageType === "button").length,
    interactive: replies.filter((r) => r.messageType === "interactive").length,
    unknown: replies.filter((r) => r.messageType === "unknown").length,
  };
  return NextResponse.json({ latest: replies[0] ?? null, replies, summary });
}
