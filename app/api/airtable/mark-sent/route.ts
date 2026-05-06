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
    website?: unknown;
    leadScore?: unknown;
    hotScore?: unknown;
    status?: unknown;
    notes?: unknown;
    contactAttempts?: unknown;
    lastContactedAt?: unknown;
    nextFollowUpAt?: unknown;
    doNotContact?: unknown;
    pipelineStage?: unknown;
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
    const doNotContact = Boolean(lead?.doNotContact);
    const pipelineStage = asString(lead?.pipelineStage) || "contacted";
    const rowStatus = asString(lead?.status) || "contacted";
    const patchFields: Record<string, unknown> = {
      business_name: business_name || asString(lead?.business_name),
      whatsapp: whatsapp || asString(lead?.whatsapp),
      website: asString(lead?.website),
      lead_score: asNumber(lead?.leadScore) ?? 0,
      hot_score: asNumber(lead?.hotScore) ?? 0,
      status: rowStatus,
      notes: asString(lead?.notes),
      contact_attempts: contactAttempts ?? 0,
      last_contacted_at: lastContactedAt ? new Date(lastContactedAt).toISOString() : null,
      next_follow_up_at: nextFollowUpAt ? new Date(nextFollowUpAt).toISOString() : null,
      do_not_contact: doNotContact,
      pipeline_stage: pipelineStage,
    };
    const fallbackFields: Record<string, unknown> = {
      status: rowStatus,
      notes: asString(lead?.notes),
    };

    try {
      try {
        await updateLeadRecordFields(existing.id, patchFields);
      } catch (err) {
        const message = err instanceof Error ? err.message.toLowerCase() : "";
        const unknownField =
          message.includes("unknown field") || message.includes("cannot find field");
        if (!unknownField) throw err;
        await updateLeadRecordFields(existing.id, fallbackFields);
      }
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
