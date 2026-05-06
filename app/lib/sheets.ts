import "server-only";

import { google, sheets_v4 } from "googleapis";
import {
  getContactQuality,
  scoreHot,
  scoreLead,
  type Lead,
  type LeadType,
  type ScoredLead,
} from "@/app/lib/leads";

export const SHEETS_COLUMNS = [
  "id",
  "business_name",
  "city",
  "category",
  "phone",
  "whatsapp",
  "instagram",
  "website",
  "rating",
  "review_count",
  "lead_score",
  "hot_score",
  "contact_quality",
  "best_contact_type",
  "best_contact_value",
  "status",
  "do_not_contact",
  "notes",
  "first_imported_at",
  "last_imported_at",
  "last_contacted_at",
  "contact_attempts",
  "next_follow_up_at",
  "import_session_id",
  "source",
  "created_at",
  "updated_at",
] as const;

export type SheetsLeadState = {
  status: string;
  note: string;
  doNotContact: boolean;
  contactAttempts: number;
  lastContactedAt: number | null;
  nextFollowUpAt: number | null;
};

function requiredEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

export function getSheetsConfig() {
  const clientEmail = requiredEnv("GOOGLE_SHEETS_CLIENT_EMAIL");
  const privateKeyRaw = requiredEnv("GOOGLE_SHEETS_PRIVATE_KEY");
  const spreadsheetId = requiredEnv("GOOGLE_SHEETS_SPREADSHEET_ID");
  if (!clientEmail || !privateKeyRaw || !spreadsheetId) return null;
  return {
    clientEmail,
    privateKey: privateKeyRaw.replace(/\\n/g, "\n"),
    spreadsheetId,
  };
}

async function createSheetsClient(): Promise<{
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
} | null> {
  const cfg = getSheetsConfig();
  if (!cfg) return null;
  const auth = new google.auth.JWT({
    email: cfg.clientEmail,
    key: cfg.privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  return { sheets, spreadsheetId: cfg.spreadsheetId };
}

function normPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits : null;
}

function normWeb(website: string): string | null {
  const host = website
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
  return host || null;
}

function nameCityKey(name: string, city: string): string {
  return `${name.trim().toLowerCase()}|${city.trim().toLowerCase()}`;
}

function asEpoch(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function rowToObject(
  row: string[],
): Record<(typeof SHEETS_COLUMNS)[number], string> {
  const out = {} as Record<(typeof SHEETS_COLUMNS)[number], string>;
  SHEETS_COLUMNS.forEach((col, i) => {
    out[col] = row[i] ?? "";
  });
  return out;
}

export function normalizeIncomingLead(raw: Record<string, unknown>): {
  lead: ScoredLead;
  state: SheetsLeadState;
} {
  const now = Date.now();
  const id = asString(raw.id) || `sheet-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const name = asString(raw.business_name) || asString(raw.name) || "Unknown";
  const city = asString(raw.city) || "";
  const category = asString(raw.category) || asString(raw.type) || "Hotel";
  const type: LeadType =
    category === "Hotel" ||
    category === "Boutique Hotel" ||
    category === "Bungalow" ||
    category === "Villa" ||
    category === "Pension"
      ? category
      : "Hotel";
  const phone = asString(raw.phone);
  const website = asString(raw.website) || undefined;
  const reviewsCount = Math.max(0, Number(raw.review_count ?? raw.reviewsCount ?? 0) || 0);
  const rating = Number(raw.rating ?? 0) || 0;
  const merged: Lead = {
    id,
    name,
    type,
    city,
    region: asString(raw.region),
    contactName: asString(raw.contactName) || "İşletme",
    phone,
    instagram: asString(raw.instagram) || undefined,
    website,
    units: Math.max(0, Number(raw.units ?? 0) || 0),
    pricePerNight: Math.max(0, Number(raw.pricePerNight ?? 0) || 0),
    occupancy30d: Math.max(0, Number(raw.occupancy30d ?? 0) || 0),
    rating,
    channels: Array.isArray(raw.channels) ? (raw.channels as ScoredLead["channels"]) : [],
    hasOwnWebsite: Boolean(website),
    hasInstagram: Boolean(asString(raw.instagram)),
    reviewsCount,
    daysSinceLastReview: Math.max(0, Number(raw.daysSinceLastReview ?? 0) || 0),
    daysOnPlatform: Math.max(0, Number(raw.daysOnPlatform ?? 0) || 0),
    signals: Array.isArray(raw.signals) ? raw.signals.map((x) => String(x)) : [],
    createdAt: asEpoch(raw.created_at ?? raw.createdAt) ?? now,
    firstImportedAt: asEpoch(raw.first_imported_at ?? raw.firstImportedAt) ?? now,
    lastImportedAt: asEpoch(raw.last_imported_at ?? raw.lastImportedAt) ?? now,
    importSessionId: asString(raw.import_session_id ?? raw.importSessionId) || null,
    doNotContact: asBool(raw.do_not_contact ?? raw.doNotContact),
    contactAttempts: Number(raw.contact_attempts ?? raw.contactAttempts ?? 0) || 0,
    lastContactedAt: asEpoch(raw.last_contacted_at ?? raw.lastContactedAt),
    nextFollowUpAt: asEpoch(raw.next_follow_up_at ?? raw.nextFollowUpAt),
  };
  const ls = scoreLead(merged);
  const hs = scoreHot(merged);
  return {
    lead: {
      ...merged,
      leadScore: Number(raw.lead_score ?? raw.leadScore ?? ls.score) || ls.score,
      leadReasons: Array.isArray(raw.leadReasons) ? raw.leadReasons.map((x) => String(x)) : ls.reasons,
      hotScore: Number(raw.hot_score ?? raw.hotScore ?? hs.score) || hs.score,
      hotReasons: Array.isArray(raw.hotReasons) ? raw.hotReasons.map((x) => String(x)) : hs.reasons,
      contactQuality: (asString(raw.contact_quality) as ScoredLead["contactQuality"]) || getContactQuality(phone),
    },
    state: {
      status: asString(raw.status) || "new",
      note: asString(raw.notes ?? raw.note),
      doNotContact: asBool(raw.do_not_contact ?? raw.doNotContact),
      contactAttempts: Number(raw.contact_attempts ?? raw.contactAttempts ?? 0) || 0,
      lastContactedAt: asEpoch(raw.last_contacted_at ?? raw.lastContactedAt),
      nextFollowUpAt: asEpoch(raw.next_follow_up_at ?? raw.nextFollowUpAt),
    },
  };
}

function leadToSheetRow(raw: Record<string, unknown>): string[] {
  const normalized = normalizeIncomingLead(raw);
  const lead = normalized.lead;
  const state = normalized.state;
  const now = Date.now();
  return [
    lead.id,
    lead.name,
    lead.city,
    lead.type,
    lead.phone,
    lead.phone,
    lead.instagram ?? "",
    lead.website ?? "",
    String(lead.rating ?? 0),
    String(lead.reviewsCount ?? 0),
    String(lead.leadScore ?? 0),
    String(lead.hotScore ?? 0),
    lead.contactQuality ?? "",
    asString(raw.best_contact_type),
    asString(raw.best_contact_value),
    state.status,
    String(state.doNotContact),
    state.note,
    String(lead.firstImportedAt ?? now),
    String(lead.lastImportedAt ?? now),
    state.lastContactedAt ? String(state.lastContactedAt) : "",
    String(state.contactAttempts ?? 0),
    state.nextFollowUpAt ? String(state.nextFollowUpAt) : "",
    lead.importSessionId ?? "",
    asString(raw.source) || "Google Maps",
    String(lead.createdAt ?? now),
    String(now),
  ];
}

export async function readAllSheetRows(): Promise<string[][] | null> {
  const client = await createSheetsClient();
  if (!client) return null;
  const resp = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: "Leads!A1:ZZ",
  });
  return (resp.data.values as string[][] | undefined) ?? [];
}

export async function syncLeadsRows(
  incomingRows: Record<string, unknown>[],
): Promise<{ added: number; updated: number; skipped: number } | null> {
  const client = await createSheetsClient();
  if (!client) return null;
  const existing = await readAllSheetRows();
  if (!existing) return null;
  const headers = existing[0] ?? [...SHEETS_COLUMNS];
  const body = existing.length > 1 ? existing.slice(1) : [];

  const idMap = new Map<string, number>();
  const phoneMap = new Map<string, number>();
  const webMap = new Map<string, number>();
  const nameCityMap = new Map<string, number>();

  body.forEach((row, idx) => {
    const obj = rowToObject(row);
    const rowIndex = idx;
    if (obj.id) idMap.set(obj.id, rowIndex);
    const phone = normPhone(obj.phone);
    if (phone) phoneMap.set(phone, rowIndex);
    const web = normWeb(obj.website);
    if (web) webMap.set(web, rowIndex);
    nameCityMap.set(nameCityKey(obj.business_name, obj.city), rowIndex);
  });

  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const incoming of incomingRows) {
    const row = leadToSheetRow(incoming);
    const obj = rowToObject(row);
    const idHit = obj.id ? idMap.get(obj.id) : undefined;
    const phoneHit = normPhone(obj.phone) ? phoneMap.get(normPhone(obj.phone) as string) : undefined;
    const webHit = normWeb(obj.website) ? webMap.get(normWeb(obj.website) as string) : undefined;
    const nameCityHit = nameCityMap.get(nameCityKey(obj.business_name, obj.city));
    const hit = idHit ?? phoneHit ?? webHit ?? nameCityHit;
    if (typeof hit === "number" && body[hit]) {
      body[hit] = row;
      updated += 1;
      continue;
    }
    if (!obj.id && !obj.business_name) {
      skipped += 1;
      continue;
    }
    body.push(row);
    const newIndex = body.length - 1;
    idMap.set(obj.id, newIndex);
    const phone = normPhone(obj.phone);
    if (phone) phoneMap.set(phone, newIndex);
    const web = normWeb(obj.website);
    if (web) webMap.set(web, newIndex);
    nameCityMap.set(nameCityKey(obj.business_name, obj.city), newIndex);
    added += 1;
  }

  await client.sheets.spreadsheets.values.update({
    spreadsheetId: client.spreadsheetId,
    range: "Leads!A1",
    valueInputOption: "RAW",
    requestBody: { values: [headers, ...body] },
  });

  return { added, updated, skipped };
}
