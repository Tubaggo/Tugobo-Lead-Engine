import { NextResponse } from "next/server";
import {
  getAirtableConnection,
  getLeadRecordById,
  listAllLeadRecords,
  updateLeadRecordFields,
  type AirtableRecord,
} from "@/app/lib/airtable";

type FollowUpItem = {
  recordId: string;
  business_name: string;
  whatsapp: string;
  lead_score: number;
  hot_score: number;
  contact_attempts: number;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  do_not_contact: boolean;
  pipeline_stage: string;
};

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function asBoolean(v: unknown): boolean {
  return Boolean(v);
}

function parseDueTs(v: unknown): number | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

function toFollowUpItem(record: AirtableRecord): FollowUpItem {
  const f = record.fields;
  return {
    recordId: record.id,
    business_name: asString(f.business_name),
    whatsapp: asString(f.whatsapp),
    lead_score: asNumber(f.lead_score),
    hot_score: asNumber(f.hot_score),
    contact_attempts: asNumber(f.contact_attempts),
    last_contacted_at: asString(f.last_contacted_at) || null,
    next_follow_up_at: asString(f.next_follow_up_at) || null,
    do_not_contact: asBoolean(f.do_not_contact),
    pipeline_stage: asString(f.pipeline_stage),
  };
}

function isDueToday(item: FollowUpItem): boolean {
  const dueTs = parseDueTs(item.next_follow_up_at);
  if (dueTs === null) return false;
  if (dueTs > Date.now()) return false;
  if (item.do_not_contact) return false;
  if (item.pipeline_stage === "won" || item.pipeline_stage === "lost") return false;
  return true;
}

export async function GET() {
  if (!getAirtableConnection()) {
    return NextResponse.json({ configured: false, leads: [] });
  }
  try {
    const records = await listAllLeadRecords();
    const due = records
      .map(toFollowUpItem)
      .filter(isDueToday)
      .sort((a, b) => {
        if (b.hot_score !== a.hot_score) return b.hot_score - a.hot_score;
        const ad = parseDueTs(a.next_follow_up_at) ?? 0;
        const bd = parseDueTs(b.next_follow_up_at) ?? 0;
        return ad - bd;
      });
    return NextResponse.json({ configured: true, leads: due });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load follow-ups";
    return NextResponse.json({ configured: true, error: message }, { status: 500 });
  }
}

type ActionBody = {
  recordId?: unknown;
  action?: unknown;
};

export async function POST(req: Request) {
  if (!getAirtableConnection()) {
    return NextResponse.json({ configured: false, updated: false });
  }
  let body: ActionBody;
  try {
    body = (await req.json()) as ActionBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const recordId = asString(body.recordId).trim();
  const action = asString(body.action).trim();
  if (!recordId || !action) {
    return NextResponse.json({ error: "recordId and action are required" }, { status: 400 });
  }

  const record = await getLeadRecordById(recordId);
  if (!record) {
    return NextResponse.json({ configured: true, updated: false, error: "Record not found" }, { status: 404 });
  }

  const fields = record.fields;
  const attempts = asNumber(fields.contact_attempts);
  const nextAttempts = attempts + 1;
  const now = Date.now();
  const nextFollowDays =
    nextAttempts <= 1 ? 1 : nextAttempts === 2 ? 2 : nextAttempts === 3 ? 3 : 0;
  const nextFollowUpAt =
    nextFollowDays > 0 ? new Date(now + nextFollowDays * 24 * 60 * 60 * 1000).toISOString() : null;
  const doNotContact = action === "do_not_contact" ? true : asBoolean(fields.do_not_contact);

  const patchFields: Record<string, unknown> = {
    contact_attempts: action === "do_not_contact" ? attempts : nextAttempts,
    last_contacted_at:
      action === "do_not_contact" ? fields.last_contacted_at ?? null : new Date(now).toISOString(),
    next_follow_up_at: doNotContact || nextAttempts >= 3 ? null : nextFollowUpAt,
    do_not_contact: doNotContact,
    pipeline_stage: doNotContact ? "lost" : "contacted",
  };

  try {
    try {
      await updateLeadRecordFields(recordId, patchFields);
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      const unknownField = message.includes("unknown field") || message.includes("cannot find field");
      if (!unknownField) throw error;
      await updateLeadRecordFields(recordId, { status: doNotContact ? "lost" : "contacted" });
    }
    return NextResponse.json({ configured: true, updated: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Follow-up update failed";
    return NextResponse.json({ configured: true, updated: false, error: message }, { status: 500 });
  }
}
