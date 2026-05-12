import { NextResponse } from "next/server";
import { enrichLeadWithHomepageSignals } from "@/app/lib/enrich-lead-homepage";
import type { ScoredLead } from "@/app/lib/leads";

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!isRecord(body) || !isRecord(body.lead)) {
    return NextResponse.json({ error: "Missing lead" }, { status: 400 });
  }
  const raw = body.lead;
  if (typeof raw.id !== "string" || !raw.id.trim()) {
    return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
  }
  if (typeof raw.name !== "string" || typeof raw.city !== "string") {
    return NextResponse.json({ error: "Invalid lead payload" }, { status: 400 });
  }

  const lead = raw as ScoredLead;

  try {
    const enriched: ScoredLead = await enrichLeadWithHomepageSignals(lead);
    return NextResponse.json({ lead: enriched });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Enrichment failed" },
      { status: 500 },
    );
  }
}
