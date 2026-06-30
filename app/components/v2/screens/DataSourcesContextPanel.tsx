"use client";

import type { DataSourcesScreenState } from "./DataSourcesScreen";

/* ── design tokens ──────────────────────────────────────────────── */

const CARD = "rounded-xl border border-white/[0.08] bg-[var(--background-elev)]";
const CARD_HEADER =
  "flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5";
const SECTION_TITLE =
  "text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-500";
const ROW = "flex items-center justify-between py-1.5 text-[11px]";
const LABEL = "text-zinc-500";
const VALUE = "font-medium text-zinc-200 tabular-nums";

/* ── icons ──────────────────────────────────────────────────────── */

function CheckCircle() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-3.5 w-3.5 shrink-0 text-emerald-400"
    >
      <circle cx="8" cy="8" r="6" />
      <path d="M5.5 8.5l2 2 3-3" />
    </svg>
  );
}

function WarnCircle() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-3.5 w-3.5 shrink-0 text-amber-400"
    >
      <path d="M8 2l6 11H2L8 2z" />
      <path d="M8 7v3M8 11.5v.5" />
    </svg>
  );
}

function XCircle() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-3.5 w-3.5 shrink-0 text-rose-400"
    >
      <circle cx="8" cy="8" r="6" />
      <path d="M6 6l4 4M10 6l-4 4" />
    </svg>
  );
}

/* ── helpers ────────────────────────────────────────────────────── */

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

/* ── component ──────────────────────────────────────────────────── */

type Props = {
  screenState: DataSourcesScreenState | null;
};

export default function DataSourcesContextPanel({ screenState }: Props) {
  const providers = screenState?.systemStatus?.providers;
  const ai = screenState?.systemStatus?.ai;
  const atCheck = screenState?.airtableCheck;
  const storage = screenState?.storageEntries ?? [];
  const totalBytes = storage.reduce((s, e) => s + e.bytes, 0);

  const connectedCount = [
    providers?.googleMaps.configured,
    providers?.airtable.configured,
    providers?.deepseek.configured,
    providers?.openai.configured,
    providers?.googleSheets.configured,
  ].filter(Boolean).length;

  const warnings: string[] = [];
  if (!providers?.googleMaps.configured) warnings.push("Google Maps bağlı değil — import devre dışı");
  if (!ai?.llmEnabled) warnings.push("LLM anahtarı yok — AI kural tabanlı");
  if (atCheck?.error) warnings.push(`Airtable hatası: ${atCheck.error}`);

  return (
    <aside className="flex w-[280px] shrink-0 flex-col gap-3 overflow-y-auto">

      {/* ── Özet KPI ── */}
      <div className={CARD}>
        <div className={CARD_HEADER}>
          <h3 className={SECTION_TITLE}>Bağlantı Özeti</h3>
        </div>
        <div className="grid grid-cols-2 gap-px bg-white/[0.04] rounded-b-xl overflow-hidden">
          {[
            {
              label: "Bağlı Sağlayıcı",
              value: `${connectedCount}/5`,
              color:
                connectedCount >= 3
                  ? "text-emerald-400"
                  : connectedCount >= 1
                    ? "text-amber-400"
                    : "text-rose-400",
            },
            {
              label: "AI Durumu",
              value: ai?.activeProvider
                ? ai.activeProvider === "deepseek"
                  ? "DeepSeek"
                  : "OpenAI"
                : "Kural",
              color: ai?.llmEnabled ? "text-indigo-400" : "text-zinc-500",
            },
            {
              label: "Storage",
              value: fmtBytes(totalBytes),
              color: "text-zinc-200",
            },
            {
              label: "LS Anahtarları",
              value: String(storage.length),
              color: "text-zinc-200",
            },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-[var(--background-elev)] px-3 py-2.5">
              <p className={`text-[17px] font-bold tabular-nums leading-none ${kpi.color}`}>
                {kpi.value}
              </p>
              <p className="mt-1 text-[9px] text-zinc-600">{kpi.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Sağlayıcı Listesi ── */}
      <div className={CARD}>
        <div className={CARD_HEADER}>
          <h3 className={SECTION_TITLE}>Sağlayıcılar</h3>
        </div>
        <div className="divide-y divide-white/[0.04] px-3 py-1">
          {[
            {
              label: "Google Maps",
              ok: providers?.googleMaps.configured ?? false,
              note: "Import",
            },
            {
              label: "Airtable",
              ok: providers?.airtable.configured ?? false,
              note: atCheck?.leadCount !== undefined ? `${atCheck.leadCount} lead` : "CRM",
            },
            {
              label: "DeepSeek",
              ok: providers?.deepseek.configured ?? false,
              note: "AI – Öncelik 1",
            },
            {
              label: "OpenAI",
              ok: providers?.openai.configured ?? false,
              note: "AI – Öncelik 2",
            },
            {
              label: "Google Sheets",
              ok: providers?.googleSheets.configured ?? false,
              note: "CRM yedek",
            },
          ].map((item) => (
            <div key={item.label} className={`${ROW} gap-2`}>
              <div className="flex items-center gap-2">
                {item.ok ? <CheckCircle /> : <XCircle />}
                <span className="text-[11px] font-medium text-zinc-300">{item.label}</span>
              </div>
              <span className="text-[10px] text-zinc-600">{item.note}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Uyarılar ── */}
      {warnings.length > 0 && (
        <div className={CARD}>
          <div className={CARD_HEADER}>
            <h3 className={SECTION_TITLE}>Uyarılar</h3>
            <span className="text-[10px] font-bold text-amber-400">{warnings.length}</span>
          </div>
          <ul className="divide-y divide-white/[0.04] px-3 py-1">
            {warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-2 py-2">
                <WarnCircle />
                <span className="text-[10.5px] leading-snug text-zinc-400">{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── API Route Sayısı ── */}
      <div className={CARD}>
        <div className={CARD_HEADER}>
          <h3 className={SECTION_TITLE}>API Route'ları</h3>
        </div>
        <div className="divide-y divide-white/[0.04] px-4">
          {[
            { label: "Import", routes: ["import-leads"] },
            { label: "AI", routes: ["ai-insight", "generate-message", "re-enrich-lead"] },
            { label: "Contact", routes: ["contact-finder", "generate-reply"] },
            { label: "Airtable", routes: ["airtable/leads", "airtable/sync-leads", "airtable/mark-sent", "airtable/follow-ups"] },
            { label: "Sheets", routes: ["sheets/leads", "sheets/sync-leads"] },
          ].map((group) => (
            <div key={group.label} className="py-2">
              <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-600">
                {group.label}
              </p>
              <div className="flex flex-wrap gap-1">
                {group.routes.map((r) => (
                  <span
                    key={r}
                    className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[9px] text-zinc-500"
                  >
                    /api/{r}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── En büyük storage anahtarları ── */}
      {storage.length > 0 && (
        <div className={CARD}>
          <div className={CARD_HEADER}>
            <h3 className={SECTION_TITLE}>En Büyük Anahtarlar</h3>
          </div>
          <div className="divide-y divide-white/[0.04] px-3">
            {storage.slice(0, 5).map((entry) => (
              <div key={entry.key} className={ROW}>
                <span className="max-w-[180px] truncate font-mono text-[10px] text-zinc-500">
                  {entry.key}
                </span>
                <span className="text-[10px] text-zinc-600">{fmtBytes(entry.bytes)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </aside>
  );
}
