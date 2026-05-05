type AirtableRecordFields = Record<string, unknown>;

type AirtableRecord = {
  id: string;
  createdTime?: string;
  fields: AirtableRecordFields;
};

type AirtableListResponse = {
  records?: AirtableRecord[];
  offset?: string;
};

export type AirtableLeadPayload = {
  business_name: string;
  whatsapp: string;
  website: string;
  lead_score: number;
  hot_score: number;
  status: string;
  notes: string;
};

function getEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function getAirtableConfig() {
  const apiKey = getEnv("AIRTABLE_API_KEY");
  const baseId = getEnv("AIRTABLE_BASE_ID");
  const tableName = getEnv("AIRTABLE_TABLE_NAME") || "Leads";
  if (!apiKey || !baseId || !tableName) return null;
  return { apiKey, baseId, tableName };
}

export function getAirtableConnection() {
  const cfg = getAirtableConfig();
  if (!cfg) return null;
  const baseUrl = `https://api.airtable.com/v0/${cfg.baseId}/${encodeURIComponent(cfg.tableName)}`;
  return { ...cfg, baseUrl };
}

function escapeFormulaValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function makeMatchExpr(field: string, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return `{${field}}="${escapeFormulaValue(trimmed)}"`;
}

async function airtableFetch(
  url: string,
  init: RequestInit,
  apiKey: string,
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export async function findLeadRecord(
  query: Pick<AirtableLeadPayload, "business_name" | "whatsapp">,
): Promise<AirtableRecord | null> {
  const conn = getAirtableConnection();
  if (!conn) return null;

  const terms = [
    makeMatchExpr("business_name", query.business_name),
    makeMatchExpr("whatsapp", query.whatsapp),
  ].filter((x): x is string => Boolean(x));

  if (terms.length === 0) return null;

  const filterByFormula = terms.length === 1 ? terms[0] : `OR(${terms.join(",")})`;
  const params = new URLSearchParams({
    filterByFormula,
    maxRecords: "1",
  });
  const res = await airtableFetch(`${conn.baseUrl}?${params.toString()}`, { method: "GET" }, conn.apiKey);
  if (!res.ok) {
    throw new Error(`Airtable find failed (${res.status})`);
  }
  const data = (await res.json()) as AirtableListResponse;
  return Array.isArray(data.records) && data.records.length > 0 ? data.records[0] : null;
}

export async function createLeadRecord(fields: AirtableLeadPayload): Promise<AirtableRecord> {
  const conn = getAirtableConnection();
  if (!conn) {
    throw new Error("Airtable not connected");
  }
  const res = await airtableFetch(
    conn.baseUrl,
    { method: "POST", body: JSON.stringify({ fields }) },
    conn.apiKey,
  );
  if (!res.ok) {
    throw new Error(`Airtable create failed (${res.status})`);
  }
  return (await res.json()) as AirtableRecord;
}

export async function updateLeadRecord(
  recordId: string,
  fields: AirtableLeadPayload,
): Promise<AirtableRecord> {
  const conn = getAirtableConnection();
  if (!conn) {
    throw new Error("Airtable not connected");
  }
  const res = await airtableFetch(
    `${conn.baseUrl}/${recordId}`,
    { method: "PATCH", body: JSON.stringify({ fields }) },
    conn.apiKey,
  );
  if (!res.ok) {
    throw new Error(`Airtable update failed (${res.status})`);
  }
  return (await res.json()) as AirtableRecord;
}

export async function updateLeadRecordFields(
  recordId: string,
  fields: Record<string, unknown>,
): Promise<AirtableRecord> {
  const conn = getAirtableConnection();
  if (!conn) {
    throw new Error("Airtable not connected");
  }
  const res = await airtableFetch(
    `${conn.baseUrl}/${recordId}`,
    { method: "PATCH", body: JSON.stringify({ fields }) },
    conn.apiKey,
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Airtable update failed (${res.status}): ${body}`);
  }
  return (await res.json()) as AirtableRecord;
}

export async function listAllLeadRecords(): Promise<AirtableRecord[]> {
  const conn = getAirtableConnection();
  if (!conn) return [];

  const all: AirtableRecord[] = [];
  let offset = "";
  while (true) {
    const params = new URLSearchParams();
    if (offset) params.set("offset", offset);
    const url = `${conn.baseUrl}${params.toString() ? `?${params.toString()}` : ""}`;
    const res = await airtableFetch(url, { method: "GET" }, conn.apiKey);
    if (!res.ok) {
      throw new Error(`Airtable list failed (${res.status})`);
    }
    const data = (await res.json()) as AirtableListResponse;
    if (Array.isArray(data.records)) all.push(...data.records);
    if (!data.offset) break;
    offset = data.offset;
  }
  return all;
}
