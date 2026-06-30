import { NextResponse } from "next/server";

function hasEnv(name: string): boolean {
  const v = process.env[name]?.trim();
  return Boolean(v && v.length > 0);
}

function maskValue(name: string): string {
  const v = process.env[name]?.trim() ?? "";
  if (!v) return "";
  if (v.length <= 8) return "••••";
  return `${v.slice(0, 4)}••••${v.slice(-4)}`;
}

export async function GET() {
  const googleMapsConfigured = hasEnv("GOOGLE_MAPS_API_KEY");
  const airtableConfigured =
    hasEnv("AIRTABLE_API_KEY") &&
    hasEnv("AIRTABLE_BASE_ID");
  const airtableTable = process.env.AIRTABLE_TABLE_NAME?.trim() || "Leads";
  const deepseekConfigured = hasEnv("DEEPSEEK_API_KEY");
  const deepseekModel =
    process.env.DEEPSEEK_MODEL?.trim().replace(/^["']|["']$/g, "") ||
    (deepseekConfigured ? "deepseek-chat" : null);
  const openaiConfigured = hasEnv("OPENAI_API_KEY");
  const openaiModel =
    process.env.OPENAI_MODEL?.trim().replace(/^["']|["']$/g, "") ||
    (openaiConfigured ? "gpt-4o-mini" : null);
  const sheetsConfigured =
    hasEnv("GOOGLE_SHEETS_CLIENT_EMAIL") &&
    hasEnv("GOOGLE_SHEETS_PRIVATE_KEY") &&
    hasEnv("GOOGLE_SHEETS_SPREADSHEET_ID");
  const sheetsSpreadsheetId = sheetsConfigured
    ? maskValue("GOOGLE_SHEETS_SPREADSHEET_ID")
    : null;

  const activeAiProvider: "deepseek" | "openai" | null = deepseekConfigured
    ? "deepseek"
    : openaiConfigured
      ? "openai"
      : null;

  const llmTimeoutMs = (() => {
    const n = Number(process.env.LLM_TIMEOUT_MS ?? 12000);
    return Number.isFinite(n) && n >= 3000 && n <= 60000 ? n : 12000;
  })();

  return NextResponse.json({
    timestamp: Date.now(),
    providers: {
      googleMaps: {
        configured: googleMapsConfigured,
        label: "Google Maps / Places API",
        endpoint: "maps.googleapis.com",
        usedBy: ["import-leads"],
      },
      airtable: {
        configured: airtableConfigured,
        label: "Airtable CRM",
        endpoint: "api.airtable.com",
        table: airtableTable,
        usedBy: ["airtable/leads", "airtable/sync-leads", "airtable/mark-sent", "airtable/follow-ups"],
      },
      deepseek: {
        configured: deepseekConfigured,
        label: "DeepSeek AI",
        endpoint: "api.deepseek.com",
        model: deepseekModel,
        priority: 1,
        usedBy: ["ai-insight", "generate-message", "re-enrich-lead"],
      },
      openai: {
        configured: openaiConfigured,
        label: "OpenAI",
        endpoint: "api.openai.com",
        model: openaiModel,
        priority: 2,
        usedBy: ["ai-insight", "generate-message", "re-enrich-lead"],
      },
      googleSheets: {
        configured: sheetsConfigured,
        label: "Google Sheets",
        endpoint: "sheets.googleapis.com",
        spreadsheetId: sheetsSpreadsheetId,
        usedBy: ["sheets/leads", "sheets/sync-leads"],
      },
    },
    ai: {
      activeProvider: activeAiProvider,
      llmEnabled: activeAiProvider !== null,
      timeoutMs: llmTimeoutMs,
    },
    routes: {
      importLeads: {
        path: "/api/import-leads",
        method: "POST",
        provider: "googleMaps",
        cacheTtlSec: 600,
        rateLimitDetection: true,
      },
      reEnrichLead: {
        path: "/api/re-enrich-lead",
        method: "POST",
        provider: "web + llm",
        notes: "Website scrape + optional LLM phase",
      },
      aiInsight: {
        path: "/api/ai-insight",
        method: "POST",
        provider: activeAiProvider ?? "rules-only",
        hasStatusGet: true,
      },
      contactFinder: {
        path: "/api/contact-finder",
        method: "POST",
        provider: "web",
        notes: "Direct website scrape, no external API key",
      },
      generateMessage: {
        path: "/api/generate-message",
        method: "POST",
        provider: activeAiProvider ?? "rules-only",
      },
      generateReply: {
        path: "/api/generate-reply",
        method: "POST",
        provider: "rules-only",
        notes: "Pure deterministic, no external API",
      },
      airtableLeads: { path: "/api/airtable/leads", method: "GET", provider: "airtable" },
      airtableSyncLeads: { path: "/api/airtable/sync-leads", method: "POST", provider: "airtable" },
      airtableMarkSent: { path: "/api/airtable/mark-sent", method: "POST", provider: "airtable" },
      airtableFollowUps: { path: "/api/airtable/follow-ups", method: "GET|POST", provider: "airtable" },
      sheetsLeads: { path: "/api/sheets/leads", method: "GET", provider: "googleSheets" },
      sheetsSyncLeads: { path: "/api/sheets/sync-leads", method: "POST", provider: "googleSheets" },
    },
  });
}
