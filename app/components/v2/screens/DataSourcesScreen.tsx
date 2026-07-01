"use client";

import { useState, useEffect, useCallback } from "react";

/* ── types ──────────────────────────────────────────────────────── */

type ProviderStatus = {
  configured: boolean;
  label: string;
  endpoint?: string;
  table?: string;
  model?: string | null;
  priority?: number;
  spreadsheetId?: string | null;
  usedBy?: string[];
};

type RouteInfo = {
  path: string;
  method: string;
  provider: string;
  cacheTtlSec?: number;
  rateLimitDetection?: boolean;
  hasStatusGet?: boolean;
  notes?: string;
};

type SystemStatus = {
  timestamp: number;
  providers: {
    googleMaps: ProviderStatus;
    airtable: ProviderStatus;
    deepseek: ProviderStatus;
    openai: ProviderStatus;
    googleSheets: ProviderStatus;
  };
  ai: {
    activeProvider: "deepseek" | "openai" | null;
    llmEnabled: boolean;
    timeoutMs: number;
  };
  routes: Record<string, RouteInfo>;
};

type AirtableCheckResult = {
  configured: boolean;
  leadCount?: number;
  error?: string;
};

type StorageEntry = {
  key: string;
  bytes: number;
  preview: string;
};

/* ── icons ──────────────────────────────────────────────────────── */

const svgBase = {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
} as const;

function RefreshIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg {...svgBase} className={`h-3.5 w-3.5 shrink-0 ${spinning ? "animate-spin" : ""}`}>
      <path d="M13.5 5A6 6 0 1 0 14 8" />
      <path d="M13.5 1.5v3.5H10" />
    </svg>
  );
}

function CheckCircle() {
  return (
    <svg {...svgBase} className="h-3.5 w-3.5 shrink-0 text-emerald-400">
      <circle cx="8" cy="8" r="6" />
      <path d="M5.5 8.5l2 2 3-3" />
    </svg>
  );
}

function XCircle() {
  return (
    <svg {...svgBase} className="h-3.5 w-3.5 shrink-0 text-rose-400">
      <circle cx="8" cy="8" r="6" />
      <path d="M6 6l4 4M10 6l-4 4" />
    </svg>
  );
}

function DotIcon({ color }: { color: "emerald" | "rose" | "amber" | "zinc" }) {
  const cls =
    color === "emerald"
      ? "bg-emerald-400"
      : color === "rose"
        ? "bg-rose-400"
        : color === "amber"
          ? "bg-amber-400"
          : "bg-zinc-600";
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${cls}`} />;
}

/* ── helpers ────────────────────────────────────────────────────── */

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

function fmtMs(ts: number): string {
  return new Date(ts).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getLocalStorageEntries(): StorageEntry[] {
  try {
    const entries: StorageEntry[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const raw = localStorage.getItem(key) ?? "";
      const bytes = new Blob([raw]).size;
      const preview = raw.slice(0, 60).replace(/\s+/g, " ");
      entries.push({ key, bytes, preview });
    }
    return entries.sort((a, b) => b.bytes - a.bytes);
  } catch {
    return [];
  }
}

function totalLocalStorageBytes(entries: StorageEntry[]): number {
  return entries.reduce((s, e) => s + e.bytes, 0);
}

/* ── design tokens ──────────────────────────────────────────────── */

const CARD = "rounded-xl border border-white/[0.08] bg-[var(--background-elev)]";
const CARD_HEADER =
  "flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5";
const SECTION_TITLE =
  "text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-500";
const ROW = "flex items-center justify-between py-1.5 text-[11px]";
const LABEL = "text-zinc-500";
const VALUE = "font-medium text-zinc-200 tabular-nums";

/* ── sub-components ─────────────────────────────────────────────── */

function StatusBadge({
  ok,
  label,
}: {
  ok: boolean;
  label?: string;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide",
        ok
          ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20"
          : "bg-rose-500/10 text-rose-400 ring-1 ring-inset ring-rose-500/20",
      ].join(" ")}
    >
      <DotIcon color={ok ? "emerald" : "rose"} />
      {label ?? (ok ? "Bağlı" : "Bağlı Değil")}
    </span>
  );
}

function ProviderCard({
  label,
  endpoint,
  configured,
  detail,
  routes,
}: {
  label: string;
  endpoint?: string;
  configured: boolean;
  detail?: string;
  routes?: string[];
}) {
  return (
    <div className={`${CARD} flex flex-col gap-0`}>
      <div className={CARD_HEADER}>
        <div className="flex items-center gap-2">
          {configured ? <CheckCircle /> : <XCircle />}
          <span className="text-[12px] font-semibold text-zinc-200">{label}</span>
        </div>
        <StatusBadge ok={configured} />
      </div>
      <div className="px-4 py-2 space-y-1.5">
        {endpoint && (
          <div className={ROW}>
            <span className={LABEL}>Endpoint</span>
            <span className={`${VALUE} text-[10px] font-mono text-zinc-400`}>{endpoint}</span>
          </div>
        )}
        {detail && (
          <div className={ROW}>
            <span className={LABEL}>Detay</span>
            <span className={VALUE}>{detail}</span>
          </div>
        )}
        {routes && routes.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {routes.map((r) => (
              <span
                key={r}
                className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[9px] font-mono text-zinc-500"
              >
                {r}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="mb-2 mt-5 first:mt-0 text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-600">
      {title}
    </h2>
  );
}

/* ── main ───────────────────────────────────────────────────────── */

export type DataSourcesScreenState = {
  systemStatus: SystemStatus | null;
  airtableCheck: AirtableCheckResult | null;
  storageEntries: StorageEntry[];
  loading: boolean;
  lastRefreshed: number | null;
  error: string | null;
};

type Props = {
  onStateChange?: (state: DataSourcesScreenState) => void;
};

export default function DataSourcesScreen({ onStateChange }: Props) {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [airtableCheck, setAirtableCheck] = useState<AirtableCheckResult | null>(null);
  const [storageEntries, setStorageEntries] = useState<StorageEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sysRes, atRes] = await Promise.allSettled([
        fetch("/api/data-sources-status"),
        fetch("/api/airtable/leads"),
      ]);

      if (sysRes.status === "fulfilled" && sysRes.value.ok) {
        const data = (await sysRes.value.json()) as SystemStatus;
        setStatus(data);
      }

      if (atRes.status === "fulfilled" && atRes.value.ok) {
        const data = (await atRes.value.json()) as {
          configured: boolean;
          leads?: unknown[];
          error?: string;
        };
        setAirtableCheck({
          configured: data.configured,
          leadCount: Array.isArray(data.leads) ? data.leads.length : undefined,
          error: data.error,
        });
      }

      setStorageEntries(getLocalStorageEntries());
      setLastRefreshed(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!onStateChange) return;
    onStateChange({
      systemStatus: status,
      airtableCheck,
      storageEntries,
      loading,
      lastRefreshed,
      error,
    });
  }, [status, airtableCheck, storageEntries, loading, lastRefreshed, error, onStateChange]);

  const providers = status?.providers;
  const ai = status?.ai;
  const routes = status?.routes;
  const totalStorage = totalLocalStorageBytes(storageEntries);

  /* ── operational health flags ── */
  const importReady = Boolean(providers?.googleMaps.configured);
  const aiReady = Boolean(ai?.llmEnabled);
  const storageReady = true; // localStorage always available
  const airtableReady = Boolean(airtableCheck?.configured);
  const overallReady = importReady && aiReady;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* toolbar */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-medium text-zinc-400">
            {lastRefreshed
              ? `Son güncelleme: ${fmtMs(lastRefreshed)}`
              : "Yükleniyor…"}
          </span>
          {error && (
            <span className="text-[11px] text-rose-400">{error}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-[11px] font-medium text-zinc-300 transition-colors hover:bg-white/[0.08] disabled:opacity-50"
        >
          <RefreshIcon spinning={loading} />
          Yenile
        </button>
      </div>

      {/* scrollable content */}
      <div className="flex-1 overflow-y-auto p-4">

        {/* ── Section 1: Provider Overview ── */}
        <SectionHeader title="Sağlayıcı Durumu" />
        <div className="grid grid-cols-2 gap-3">
          <ProviderCard
            label="Google Maps / Places"
            endpoint="maps.googleapis.com"
            configured={providers?.googleMaps.configured ?? false}
            detail={providers?.googleMaps.configured ? "API anahtarı tanımlı" : "GOOGLE_MAPS_API_KEY eksik"}
            routes={["import-leads"]}
          />
          <ProviderCard
            label="Airtable CRM"
            endpoint="api.airtable.com"
            configured={providers?.airtable.configured ?? false}
            detail={
              providers?.airtable.configured
                ? `Tablo: ${providers.airtable.table ?? "Leads"}`
                : "API_KEY veya BASE_ID eksik"
            }
            routes={["airtable/leads", "sync-leads", "mark-sent", "follow-ups"]}
          />
          <ProviderCard
            label="DeepSeek AI"
            endpoint="api.deepseek.com"
            configured={providers?.deepseek.configured ?? false}
            detail={
              providers?.deepseek.configured
                ? `Model: ${providers.deepseek.model ?? "deepseek-chat"} · Öncelik: 1`
                : "DEEPSEEK_API_KEY eksik"
            }
            routes={["ai-insight", "generate-message", "re-enrich-lead"]}
          />
          <ProviderCard
            label="OpenAI"
            endpoint="api.openai.com"
            configured={providers?.openai.configured ?? false}
            detail={
              providers?.openai.configured
                ? `Model: ${providers.openai.model ?? "gpt-4o-mini"} · Öncelik: 2`
                : "OPENAI_API_KEY eksik"
            }
            routes={["ai-insight", "generate-message", "re-enrich-lead"]}
          />
          <ProviderCard
            label="Google Sheets"
            endpoint="sheets.googleapis.com"
            configured={providers?.googleSheets.configured ?? false}
            detail={
              providers?.googleSheets.configured
                ? `Spreadsheet: ${providers.googleSheets.spreadsheetId ?? "—"}`
                : "CLIENT_EMAIL / PRIVATE_KEY / SPREADSHEET_ID eksik"
            }
            routes={["sheets/leads", "sheets/sync-leads"]}
          />
        </div>

        {/* ── Section 2: Import Infrastructure ── */}
        <SectionHeader title="Import Altyapısı" />
        <div className={`${CARD}`}>
          <div className={CARD_HEADER}>
            <h3 className={SECTION_TITLE}>Google Places Import</h3>
            <StatusBadge ok={importReady} label={importReady ? "Hazır" : "Devre Dışı"} />
          </div>
          <div className="divide-y divide-white/[0.04] px-4">
            <div className={ROW}>
              <span className={LABEL}>Route</span>
              <span className="font-mono text-[10px] text-zinc-400">POST /api/import-leads</span>
            </div>
            <div className={ROW}>
              <span className={LABEL}>Provider</span>
              <span className={VALUE}>Google Places Text Search + Details</span>
            </div>
            <div className={ROW}>
              <span className={LABEL}>Detail Cache TTL</span>
              <span className={VALUE}>{routes?.importLeads.cacheTtlSec ?? 600}s (in-memory)</span>
            </div>
            <div className={ROW}>
              <span className={LABEL}>Session Cache</span>
              <span className={VALUE}>Aktif oturum başına sonuçlar önbelleğe alınır</span>
            </div>
            <div className={ROW}>
              <span className={LABEL}>Limit / Sayfa</span>
              <span className={VALUE}>10 mekan, 5 website adayı</span>
            </div>
            <div className={ROW}>
              <span className={LABEL}>Rate Limit Koruması</span>
              <span className={`${VALUE} ${routes?.importLeads.rateLimitDetection ? "text-emerald-400" : "text-zinc-500"}`}>
                {routes?.importLeads.rateLimitDetection ? "Aktif (429 + TR mesaj)" : "—"}
              </span>
            </div>
            <div className={ROW}>
              <span className={LABEL}>Duplicate Koruması</span>
              <span className="text-[11px] font-medium text-emerald-400">place_id dedup aktif</span>
            </div>
            <div className={ROW}>
              <span className={LABEL}>Delay Arası</span>
              <span className={VALUE}>500–1000ms (rastgele)</span>
            </div>
          </div>
        </div>

        {/* ── Section 3: AI Infrastructure ── */}
        <SectionHeader title="AI Altyapısı" />
        <div className={`${CARD}`}>
          <div className={CARD_HEADER}>
            <h3 className={SECTION_TITLE}>LLM Katmanı</h3>
            <StatusBadge ok={aiReady} label={aiReady ? "Hazır" : "Kural Tabanlı"} />
          </div>
          <div className="divide-y divide-white/[0.04] px-4">
            <div className={ROW}>
              <span className={LABEL}>Aktif Sağlayıcı</span>
              <span className={`${VALUE} ${aiReady ? "text-indigo-400" : "text-zinc-500"}`}>
                {ai?.activeProvider === "deepseek"
                  ? "DeepSeek (deepseek-chat)"
                  : ai?.activeProvider === "openai"
                    ? `OpenAI (${providers?.openai.model ?? "gpt-4o-mini"})`
                    : "Yok — kural tabanlı çalışıyor"}
              </span>
            </div>
            <div className={ROW}>
              <span className={LABEL}>LLM Timeout</span>
              <span className={VALUE}>{ai?.timeoutMs ?? 12000}ms</span>
            </div>
          </div>
          {/* AI endpoints */}
          <div className="px-4 pb-3 pt-2">
            <p className={`mb-2 ${SECTION_TITLE}`}>Endpoint'ler</p>
            <div className="space-y-1.5">
              {[
                {
                  label: "AI Insight",
                  path: "/api/ai-insight",
                  note: "Lead yorumlama + LLM katmanı",
                  ok: true,
                },
                {
                  label: "Generate Message",
                  path: "/api/generate-message",
                  note: "WhatsApp mesaj paketi",
                  ok: true,
                },
                {
                  label: "Re-Enrich Lead",
                  path: "/api/re-enrich-lead",
                  note: "Website tarama + LLM yenileme",
                  ok: true,
                },
                {
                  label: "Contact Finder",
                  path: "/api/contact-finder",
                  note: "Website HTML sinyali (key yok)",
                  ok: true,
                },
                {
                  label: "Generate Reply",
                  path: "/api/generate-reply",
                  note: "Deterministik kural (LLM yok)",
                  ok: true,
                },
              ].map((ep) => (
                <div
                  key={ep.path}
                  className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2"
                >
                  <div>
                    <p className="text-[11px] font-medium text-zinc-200">{ep.label}</p>
                    <p className="text-[9px] font-mono text-zinc-600">{ep.path}</p>
                  </div>
                  <span className="text-right text-[9px] text-zinc-500 max-w-[140px] text-right">{ep.note}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Section 4: Storage ── */}
        <SectionHeader title="Depolama" />
        <div className={CARD}>
          <div className={CARD_HEADER}>
            <h3 className={SECTION_TITLE}>localStorage</h3>
            <span className="text-[11px] font-medium text-zinc-400 tabular-nums">
              {fmtBytes(totalStorage)} · {storageEntries.length} anahtar
            </span>
          </div>
          {storageEntries.length === 0 ? (
            <div className="px-4 py-4 text-center text-[11px] text-zinc-600">
              localStorage boş
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04] px-4">
              {storageEntries.map((entry) => (
                <div key={entry.key} className="py-2">
                  <div className="flex items-center justify-between">
                    <span className="max-w-[260px] truncate font-mono text-[10px] text-zinc-400">
                      {entry.key}
                    </span>
                    <span className="text-[10px] text-zinc-600 tabular-nums">
                      {fmtBytes(entry.bytes)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[9px] text-zinc-700">{entry.preview}…</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Section 5: Operational Health ── */}
        <SectionHeader title="Operasyonel Hazırlık" />
        <div className={CARD}>
          <div className={CARD_HEADER}>
            <h3 className={SECTION_TITLE}>Sistem Durumu</h3>
            <StatusBadge
              ok={overallReady}
              label={overallReady ? "Operasyonel" : "Dikkat Gerekli"}
            />
          </div>
          <div className="divide-y divide-white/[0.04] px-4">
            {[
              {
                label: "Import Hazır",
                ok: importReady,
                note: importReady
                  ? "Google Maps bağlı, lead import aktif"
                  : "GOOGLE_MAPS_API_KEY eksik",
              },
              {
                label: "AI Hazır",
                ok: aiReady,
                note: aiReady
                  ? `${ai?.activeProvider ?? "—"} aktif, mesaj ve insight üretimi çalışıyor`
                  : "LLM anahtarı yok — kural tabanlı yedek aktif",
              },
              {
                label: "Airtable CRM",
                ok: airtableReady,
                note: airtableReady
                  ? `${airtableCheck?.leadCount !== undefined ? `${airtableCheck.leadCount} lead` : "Bağlı"}`
                  : "Yapılandırılmamış — opsiyonel",
              },
              {
                label: "Google Sheets",
                ok: Boolean(providers?.googleSheets.configured),
                note: providers?.googleSheets.configured
                  ? "Aktif"
                  : "Yapılandırılmamış — opsiyonel",
              },
              {
                label: "Storage",
                ok: storageReady,
                note: `localStorage aktif · ${fmtBytes(totalStorage)} kullanımda`,
              },
            ].map((item) => (
              <div key={item.label} className={`${ROW} gap-3`}>
                <div className="flex items-center gap-2">
                  {item.ok ? <CheckCircle /> : <XCircle />}
                  <span className="text-[11px] font-medium text-zinc-200">{item.label}</span>
                </div>
                <span className="text-right text-[10px] text-zinc-500">{item.note}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Section 6: Recent Activity ── */}
        <SectionHeader title="Son Aktivite" />
        <div className={CARD}>
          <div className={CARD_HEADER}>
            <h3 className={SECTION_TITLE}>Bu Oturum</h3>
          </div>
          <div className="divide-y divide-white/[0.04] px-4">
            {lastRefreshed && (
              <div className={ROW}>
                <span className="text-[11px] text-zinc-400">Durum yenilendi</span>
                <span className="text-[10px] text-zinc-600">{fmtMs(lastRefreshed)}</span>
              </div>
            )}
            {airtableCheck?.configured && airtableCheck.leadCount !== undefined && (
              <div className={ROW}>
                <span className="text-[11px] text-zinc-400">
                  Airtable okundu · {airtableCheck.leadCount} lead
                </span>
                <span className="text-[10px] text-zinc-600">
                  {lastRefreshed ? fmtMs(lastRefreshed) : "—"}
                </span>
              </div>
            )}
            {storageEntries.length > 0 && (
              <div className={ROW}>
                <span className="text-[11px] text-zinc-400">
                  localStorage tarandı · {storageEntries.length} anahtar
                </span>
                <span className="text-[10px] text-zinc-600">
                  {lastRefreshed ? fmtMs(lastRefreshed) : "—"}
                </span>
              </div>
            )}
            {!loading && !lastRefreshed && (
              <div className="py-3 text-center text-[11px] text-zinc-700">
                Veri bekleniyor…
              </div>
            )}
          </div>
        </div>

        <div className="h-4" />
      </div>
    </div>
  );
}
