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

function toIsoOrNull(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return new Date(value).toISOString();
  }
  return null;
}

function normalizeLead(raw: Record<string, unknown>): AirtableLeadPayload {
  const contactAttempts = toNumber(raw.contact_attempts ?? raw.contactAttempts);
  const whatsappInvalid = Boolean(raw.whatsapp_invalid ?? raw.whatsappInvalid);
  const doNotContact = Boolean(raw.do_not_contact ?? raw.doNotContact) || whatsappInvalid;
  return {
    business_name: toStringValue(raw.business_name),
    whatsapp: toStringValue(raw.whatsapp),
    website: toStringValue(raw.website),
    lead_score: toNumber(raw.lead_score),
    hot_score: toNumber(raw.hot_score),
    status: toStringValue(raw.status) || "new",
    notes: toStringValue(raw.notes),
    contact_attempts: contactAttempts,
    last_contacted_at: toIsoOrNull(raw.last_contacted_at ?? raw.lastContactedAt),
    next_follow_up_at: toIsoOrNull(raw.next_follow_up_at ?? raw.nextFollowUpAt),
    do_not_contact: doNotContact,
    pipeline_stage:
      toStringValue(raw.pipeline_stage) || (doNotContact ? "do_not_contact" : "contacted"),
    contact_readiness_score: toNumber(raw.contact_readiness_score ?? raw.contactReadinessScore),
    whatsapp_invalid: whatsappInvalid,
  };
}

function isUnknownFieldError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("unknown field") || message.includes("cannot find field");
}

async function createOrUpdateWithFallback(
  recordId: string | null,
  payload: AirtableLeadPayload,
): Promise<"added" | "updated"> {
  const minimalFields = {
    business_name: payload.business_name,
    whatsapp: payload.whatsapp,
    website: payload.website,
    lead_score: payload.lead_score,
    hot_score: payload.hot_score,
    status: payload.status,
    notes: payload.notes,
  };
  try {
    if (recordId) {
      await updateLeadRecord(recordId, payload);
      return "updated";
    }
    await createLeadRecord(payload);
    return "added";
  } catch (error) {
    if (!isUnknownFieldError(error)) throw error;
    if (recordId) {
      await updateLeadRecord(recordId, {
        ...minimalFields,
        contact_attempts: 0,
        last_contacted_at: null,
        next_follow_up_at: null,
        do_not_contact: false,
        pipeline_stage: "contacted",
        contact_readiness_score: payload.contact_readiness_score,
        whatsapp_invalid: payload.whatsapp_invalid,
      });
      return "updated";
    }
    await createLeadRecord({
      ...minimalFields,
      contact_attempts: 0,
      last_contacted_at: null,
      next_follow_up_at: null,
      do_not_contact: false,
      pipeline_stage: "contacted",
      contact_readiness_score: payload.contact_readiness_score,
      whatsapp_invalid: payload.whatsapp_invalid,
    });
    return "added";
  }
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
      const result = await createOrUpdateWithFallback(existing?.id ?? null, payload);
      if (result === "updated") {
        updated += 1;
      } else {
        added += 1;
      }
    }

    return NextResponse.json({ configured: true, added, updated, skipped });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Airtable sync failed";
    return NextResponse.json({ configured: true, error: message }, { status: 500 });
  }
}
