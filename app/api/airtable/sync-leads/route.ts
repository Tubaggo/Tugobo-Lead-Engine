import { NextResponse } from "next/server";
import {
  createLeadRecord,
  findLeadRecord,
  getAirtableConnection,
  type AirtableLeadPayload,
  updateLeadRecord,
} from "@/app/lib/airtable";

type SyncLeadBody = {
  leads?: Record<string, unknown>[];
};

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeLead(raw: Record<string, unknown>): AirtableLeadPayload {
  return {
    business_name: toStringValue(raw.business_name),
    whatsapp: toStringValue(raw.whatsapp),
    website: toStringValue(raw.website),
    lead_score: toNumber(raw.lead_score),
    hot_score: toNumber(raw.hot_score),
    status: toStringValue(raw.status) || "new",
    notes: toStringValue(raw.notes),
  };
}

export async function POST(req: Request) {
  if (!getAirtableConnection()) {
    return NextResponse.json({ configured: false, added: 0, updated: 0, skipped: 0 });
  }

  let body: SyncLeadBody;
  try {
    body = (await req.json()) as SyncLeadBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const incoming = Array.isArray(body.leads) ? body.leads : [];
  if (incoming.length === 0) {
    return NextResponse.json({ configured: true, added: 0, updated: 0, skipped: 0 });
  }

  let added = 0;
  let updated = 0;
  let skipped = 0;

  try {
    for (const lead of incoming) {
      const payload = normalizeLead(lead);
      if (!payload.business_name && !payload.whatsapp) {
        skipped += 1;
        continue;
      }
      const existing = await findLeadRecord({
        business_name: payload.business_name,
        whatsapp: payload.whatsapp,
      });
      if (existing) {
        await updateLeadRecord(existing.id, payload);
        updated += 1;
      } else {
        await createLeadRecord(payload);
        added += 1;
      }
    }

    return NextResponse.json({ configured: true, added, updated, skipped });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Airtable sync failed";
    return NextResponse.json({ configured: true, error: message }, { status: 500 });
  }
}
