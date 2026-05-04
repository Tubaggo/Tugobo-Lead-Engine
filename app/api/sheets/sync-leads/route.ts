import { NextResponse } from "next/server";
import { getSheetsConfig, syncLeadsRows } from "@/app/lib/sheets";

export async function POST(req: Request) {
  if (!getSheetsConfig()) {
    return NextResponse.json({ configured: false, added: 0, updated: 0, skipped: 0 });
  }

  let body: { leads?: Record<string, unknown>[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const leads = Array.isArray(body.leads) ? body.leads : [];
  if (leads.length === 0) {
    return NextResponse.json({ configured: true, added: 0, updated: 0, skipped: 0 });
  }

  try {
    const result = await syncLeadsRows(leads);
    if (!result) {
      return NextResponse.json({ configured: false, added: 0, updated: 0, skipped: 0 });
    }
    return NextResponse.json({ configured: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Sheets sync failed";
    return NextResponse.json({ configured: true, error: message }, { status: 500 });
  }
}
