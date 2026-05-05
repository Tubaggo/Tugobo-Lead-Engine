import { NextResponse } from "next/server";
import {
  findLeadRecord,
  getAirtableConnection,
  updateLeadRecordFields,
} from "@/app/lib/airtable";

type MarkSentBody = {
  lead?: {
    business_name?: unknown;
    whatsapp?: unknown;
    notes?: unknown;
    contactAttempts?: unknown;
    lastContactedAt?: unknown;
    nextFollowUpAt?: unknown;
  };
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

export async function POST(req: Request) {
  if (!getAirtableConnection()) {
    return NextResponse.json({ configured: false, updated: false });
  }

  let body: MarkSentBody;
  try {
    body = (await req.json()) as MarkSentBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const lead = body.lead;
  const business_name = asString(lead?.business_name).trim();
  const whatsapp = asString(lead?.whatsapp).trim();
  if (!business_name && !whatsapp) {
    return NextResponse.json({ configured: true, updated: false, warning: "Missing lead keys" });
  }

  try {
    const existing = await findLeadRecord({ business_name, whatsapp });
    if (!existing) {
      return NextResponse.json({ configured: true, updated: false });
    }

    const contactAttempts = asNumber(lead?.contactAttempts);
    const lastContactedAt = asNumber(lead?.lastContactedAt);
    const nextFollowUpAt = asNumber(lead?.nextFollowUpAt);
    const patchFields: Record<string, unknown> = {
      status: "contacted",
      notes: asString(lead?.notes),
      contactAttempts: contactAttempts ?? 0,
      lastContactedAt: lastContactedAt ? new Date(lastContactedAt).toISOString() : null,
      nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt).toISOString() : null,
    };

    try {
      await updateLeadRecordFields(existing.id, patchFields);
      return NextResponse.json({ configured: true, updated: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Airtable mark-sent update failed";
      return NextResponse.json({
        configured: true,
        updated: false,
        warning: message,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Airtable lookup failed";
    return NextResponse.json({ configured: true, updated: false, warning: message });
  }
}
