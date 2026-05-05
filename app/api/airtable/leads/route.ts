import { NextResponse } from "next/server";
import { listAllLeadRecords, getAirtableConnection } from "@/app/lib/airtable";
import type { ScoredLead } from "@/app/lib/leads";

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function ensureHttpWebsite(website: string): string {
  const w = website.trim();
  if (!w) return "";
  if (w.startsWith("http://") || w.startsWith("https://")) return w;
  return `https://${w}`;
}

function mapRecordToLead(
  record: { id: string; fields: Record<string, unknown> },
  index: number,
): ScoredLead {
  const businessName = toStringValue(record.fields.business_name).trim();
  const city = toStringValue(record.fields.city).trim() || "Unknown";
  const region = toStringValue(record.fields.region).trim() || city;
  const website = ensureHttpWebsite(toStringValue(record.fields.website));
  const leadScore = toNumber(record.fields.lead_score);
  const hotScore = toNumber(record.fields.hot_score);
  const createdAtRaw = toStringValue(record.fields.created_at);
  const createdAtMs = Date.parse(createdAtRaw);

  return {
    id: `airtable-${record.id}`,
    name: businessName || `Airtable Lead ${index + 1}`,
    type: "Hotel",
    city,
    region,
    contactName: "",
    phone: toStringValue(record.fields.whatsapp),
    instagram: undefined,
    website: website || undefined,
    units: 0,
    pricePerNight: 0,
    occupancy30d: 0,
    rating: 0,
    channels: [],
    hasOwnWebsite: Boolean(website),
    hasInstagram: false,
    reviewsCount: 0,
    daysSinceLastReview: 0,
    daysOnPlatform: 0,
    signals: [],
    createdAt: Number.isFinite(createdAtMs) ? createdAtMs : Date.now(),
    leadScore,
    hotScore,
    leadReasons: [],
    hotReasons: [],
    contactQuality: "low",
  };
}

export async function GET() {
  if (!getAirtableConnection()) {
    return NextResponse.json({ configured: false, leads: [] });
  }

  try {
    const records = await listAllLeadRecords();
    const leads = records.map((record, index) => mapRecordToLead(record, index));
    return NextResponse.json({ configured: true, leads });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Airtable leads";
    return NextResponse.json({ configured: true, error: message }, { status: 500 });
  }
}
