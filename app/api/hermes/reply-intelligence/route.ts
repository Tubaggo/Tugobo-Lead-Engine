import { NextResponse } from "next/server";
import { getRecentReplyIntelligence } from "@/app/lib/reply-intelligence-registry";
import { summarizeReplyIntelligence } from "@/app/lib/reply-intelligence-runtime";

/**
 * Reply Intelligence — recent feed (v6.3).
 *
 * GET-only, read-only. Returns recent sanitized reply classifications
 * (newest first) for the Founder Revenue Workspace, plus an intent/urgency
 * breakdown. Safe by construction: `getRecentReplyIntelligence` only ever
 * returns items already sanitized upstream — no raw phone, no full message
 * body, no raw webhook payload.
 */

export async function GET() {
  const items = getRecentReplyIntelligence();
  const summary = summarizeReplyIntelligence(items);
  return NextResponse.json({ latest: items[0] ?? null, items, summary });
}
