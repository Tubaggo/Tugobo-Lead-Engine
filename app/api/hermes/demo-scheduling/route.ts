import { NextResponse } from "next/server";
import { getRecentDemoScheduleItems } from "@/app/lib/demo-scheduling-registry";
import { summarizeDemoScheduleItems } from "@/app/lib/demo-scheduling-runtime";

/**
 * Demo Scheduling — recent feed (v6.4).
 *
 * GET-only, read-only. Returns demo scheduling opportunities (pending
 * first) plus a status breakdown. Safe by construction:
 * `getRecentDemoScheduleItems` only ever returns items already sanitized
 * upstream — no raw phone, no full reply body, no raw webhook payload.
 */

export async function GET() {
  const items = getRecentDemoScheduleItems();
  const summary = summarizeDemoScheduleItems(items);
  return NextResponse.json({ items, summary });
}
