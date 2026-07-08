import { NextResponse } from "next/server";
import { getRecentFollowUpCandidates } from "@/app/lib/follow-up-registry";
import { summarizeFollowUpCandidates } from "@/app/lib/follow-up-runtime";

/**
 * Follow-up Candidates — recent feed (v6.5).
 *
 * GET-only, read-only. Returns follow-up candidates (active/high-priority
 * first) plus a status breakdown. Safe by construction:
 * `getRecentFollowUpCandidates` only ever returns items already sanitized
 * upstream — no raw phone, no full reply body, no raw webhook payload.
 */

export async function GET() {
  const items = getRecentFollowUpCandidates();
  const summary = summarizeFollowUpCandidates(items);
  return NextResponse.json({ items, summary });
}
