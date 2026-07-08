import { NextResponse } from "next/server";
import { getRecentSalesOutcomeItems } from "@/app/lib/sales-outcome-registry";
import { summarizeSalesOutcomes } from "@/app/lib/sales-outcome-runtime";

/**
 * Sales Outcomes — recent feed (v6.6).
 *
 * GET-only, read-only. Returns sales outcome items (undecided first) plus
 * a status/revenue breakdown. Safe by construction:
 * `getRecentSalesOutcomeItems` only ever returns items already sanitized
 * upstream — no raw phone, no full reply body, no raw webhook payload.
 */

export async function GET() {
  const items = getRecentSalesOutcomeItems();
  const summary = summarizeSalesOutcomes(items);
  return NextResponse.json({ items, summary });
}
