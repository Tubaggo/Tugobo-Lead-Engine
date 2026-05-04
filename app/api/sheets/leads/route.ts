import { NextResponse } from "next/server";
import {
  getSheetsConfig,
  normalizeIncomingLead,
  readAllSheetRows,
  SHEETS_COLUMNS,
} from "@/app/lib/sheets";

export async function GET() {
  if (!getSheetsConfig()) {
    return NextResponse.json({ configured: false, leads: [], states: {} });
  }

  try {
    const rows = await readAllSheetRows();
    if (!rows || rows.length === 0) {
      return NextResponse.json({ configured: true, leads: [], states: {} });
    }
    const header = rows[0];
    const body = rows.slice(1);
    const leads = [];
    const states: Record<string, unknown> = {};
    for (const row of body) {
      const asObj: Record<string, unknown> = {};
      SHEETS_COLUMNS.forEach((col, idx) => {
        const key = header[idx] || col;
        asObj[key] = row[idx] ?? "";
      });
      const normalized = normalizeIncomingLead(asObj);
      leads.push(normalized.lead);
      states[normalized.lead.id] = {
        status: normalized.state.status,
        note: normalized.state.note,
        doNotContact: normalized.state.doNotContact,
        contactAttempts: normalized.state.contactAttempts,
        lastContactedAt: normalized.state.lastContactedAt,
        nextFollowUpAt: normalized.state.nextFollowUpAt,
      };
    }
    return NextResponse.json({ configured: true, leads, states });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Google Sheets leads";
    return NextResponse.json({ configured: true, error: message }, { status: 500 });
  }
}
