"use client";

import { useState, useRef } from "react";
import { TURKEY_CITIES } from "@/app/lib/generate";
import {
  TARGET_AUDIENCES,
  type ImportTargetType,
  type ImportSource,
  isIcpTargetAudience,
} from "@/app/components/ImportPanel";
import type { UseLeadImportReturn } from "@/app/components/v2/hooks/useLeadImport";
import type { ScoredLead } from "@/app/lib/leads";

/* ── icons ──────────────────────────────────────────────────── */

const svgBase = {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
} as const;

function ImportIcon({ cls }: { cls?: string }) {
  return (
    <svg {...svgBase} className={cls ?? "h-3.5 w-3.5 shrink-0"}>
      <path d="M8 2v9M5 8l3 3 3-3M2 13h12" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg {...svgBase} className="h-3.5 w-3.5 shrink-0">
      <path d="M13.5 5A6 6 0 1 0 14 8" />
      <path d="M13.5 1.5v3.5H10" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <span
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white shrink-0"
      aria-hidden="true"
    />
  );
}

function CheckIcon() {
  return (
    <svg {...svgBase} className="h-3 w-3 text-emerald-400">
      <path d="M3 8l3.5 3.5L13 4" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg {...svgBase} className="h-3 w-3 text-zinc-600">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

/* ── helpers ────────────────────────────────────────────────── */

const DATALIST_ID = "v2-import-city-list";

function scoreColor(n: number): string {
  if (n >= 70) return "text-emerald-400";
  if (n >= 50) return "text-amber-400";
  return "text-rose-400";
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sourceLabel(source: "cached" | "google"): string {
  return source === "cached" ? "Önbellekten" : "Google&apos;dan";
}

/* ── result row ─────────────────────────────────────────────── */

function LeadRow({ lead, isNew }: { lead: ScoredLead; isNew: boolean }) {
  const hasPhone = Boolean(lead.phone?.trim());
  const hasWebsite = Boolean(lead.website?.trim());

  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_40px_40px_50px_60px] items-center gap-3 px-4 py-2.5 text-[12px] border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
      <span className="truncate font-medium text-zinc-200">{lead.name}</span>
      <span className="truncate text-zinc-500">{lead.city}</span>
      <span className="truncate text-zinc-500">{lead.type}</span>
      <span className="flex justify-center">
        {hasPhone ? <CheckIcon /> : <XIcon />}
      </span>
      <span className="flex justify-center">
        {hasWebsite ? <CheckIcon /> : <XIcon />}
      </span>
      <span className={`tabular-nums font-semibold text-right ${scoreColor(lead.leadScore ?? 0)}`}>
        {lead.leadScore ?? 0}
      </span>
      <span
        className={[
          "text-right text-[10px] font-medium",
          isNew ? "text-emerald-400" : "text-amber-400",
        ].join(" ")}
      >
        {isNew ? "Yeni" : "Güncellendi"}
      </span>
    </div>
  );
}

/* ── empty state ─────────────────────────────────────────────── */

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 ring-1 ring-inset ring-indigo-500/20">
        <ImportIcon cls="h-6 w-6 text-indigo-400" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-zinc-300">Henüz lead içe aktarılmadı</p>
        <p className="text-xs text-zinc-600 max-w-xs">
          Şehir ve hedef kitle seçin, ardından &ldquo;Lead İçe Aktar&rdquo; butonuna tıklayın.
          Google Maps&apos;tan otel ve konaklama işletmeleri otomatik çekilir.
        </p>
      </div>
      <div className="flex flex-col gap-1.5 text-[11px] text-zinc-600">
        <div className="flex items-center gap-2">
          <span className="h-1 w-1 rounded-full bg-zinc-700" />
          <span>Telefon, website ve isim bazında tekrar koruması aktif</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-1 w-1 rounded-full bg-zinc-700" />
          <span>Veriler yerel depoya kaydedilir</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-1 w-1 rounded-full bg-zinc-700" />
          <span>ICP modunda 6 farklı sorgu çalıştırılır</span>
        </div>
      </div>
    </div>
  );
}

/* ── main component ─────────────────────────────────────────── */

type Props = {
  importState: UseLeadImportReturn;
};

export default function LeadImportScreen({ importState }: Props) {
  const {
    lastBatch,
    lastNewIds,
    lastResult,
    importHistory,
    loading,
    error,
    handleImport,
    hasCachedImportResults,
  } = importState;

  const [city, setCity] = useState("");
  const [type, setType] = useState<ImportTargetType>("TUGOBO ICP");
  const [source] = useState<ImportSource>("maps");
  const [localError, setLocalError] = useState("");
  const [showCacheChoice, setShowCacheChoice] = useState(false);
  const cityRef = useRef<HTMLInputElement>(null);

  const runImport = async (forceGoogleRefresh: boolean) => {
    const trimmed = city.trim();
    if (!trimmed) {
      setLocalError("Önce şehir girin.");
      cityRef.current?.focus();
      return;
    }
    setLocalError("");
    setShowCacheChoice(false);
    try {
      await handleImport({ city: trimmed, type, source, forceGoogleRefresh });
    } catch {
      // error already set in hook
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = city.trim();
    if (!trimmed) {
      setLocalError("Önce şehir girin.");
      cityRef.current?.focus();
      return;
    }
    if (
      !isIcpTargetAudience(type as string) &&
      hasCachedImportResults({ city: trimmed, type, source })
    ) {
      setLocalError("");
      setShowCacheChoice(true);
      return;
    }
    await runImport(false);
  };

  const displayError = localError || error;
  const lastEntry = importHistory[0];

  const selectCls =
    "rounded-md border border-white/[0.08] bg-zinc-900/60 px-3 py-2 text-[12.5px] text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-[var(--background-elev)]">

      {/* Command panel */}
      <div className="shrink-0 border-b border-white/[0.06] px-4 py-3.5">
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">

          {/* City */}
          <div className="flex min-w-[140px] flex-1 flex-col gap-1">
            <label
              htmlFor="v2-import-city"
              className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500"
            >
              Şehir
            </label>
            <input
              ref={cityRef}
              id="v2-import-city"
              list={DATALIST_ID}
              value={city}
              disabled={loading}
              onChange={(e) => {
                setCity(e.target.value);
                setLocalError("");
                setShowCacheChoice(false);
              }}
              placeholder="Bodrum, Antalya..."
              autoComplete="off"
              className={[
                "rounded-md border bg-zinc-900/60 px-3 py-2 text-[12.5px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 disabled:opacity-50 disabled:cursor-not-allowed",
                displayError ? "border-rose-500/40" : "border-white/[0.08]",
              ].join(" ")}
            />
            <datalist id={DATALIST_ID}>
              {TURKEY_CITIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          {/* Target audience */}
          <div className="flex min-w-[200px] flex-col gap-1">
            <label
              htmlFor="v2-import-type"
              className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500"
            >
              Hedef Kitle
            </label>
            <select
              id="v2-import-type"
              value={type}
              disabled={loading}
              onChange={(e) => {
                setType(e.target.value as ImportTargetType);
                setShowCacheChoice(false);
              }}
              className={selectCls}
            >
              {TARGET_AUDIENCES.map((n) => (
                <option key={n.value} value={n.value} className="bg-zinc-900">
                  {n.label}
                </option>
              ))}
            </select>
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-[12.5px] font-semibold text-white shadow-lg shadow-indigo-900/40 transition hover:bg-indigo-500 disabled:cursor-wait disabled:opacity-60"
            >
              {loading ? (
                <>
                  <SpinnerIcon />
                  İçe Aktarılıyor...
                </>
              ) : (
                <>
                  <ImportIcon />
                  Lead İçe Aktar
                </>
              )}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void runImport(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-zinc-900/60 px-3 py-2 text-[12px] font-medium text-zinc-400 transition hover:border-white/[0.14] hover:text-zinc-200 disabled:cursor-wait disabled:opacity-50"
            >
              <RefreshIcon />
              Google&apos;dan Yenile
            </button>
            {showCacheChoice && (
              <button
                type="button"
                disabled={loading}
                onClick={() => void runImport(false)}
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] font-medium text-emerald-300 transition hover:bg-emerald-500/15 disabled:cursor-wait disabled:opacity-50"
              >
                Önbellekten Kullan
              </button>
            )}
          </div>
        </form>

        {/* Status row */}
        <div className="mt-2 min-h-[18px]" aria-live="polite">
          {displayError && (
            <p className="text-[11px] text-rose-400">{displayError}</p>
          )}
          {!displayError && showCacheChoice && (
            <p className="text-[11px] text-indigo-400">
              Bu şehir için önbellekte sonuç var. Önbellekten kullanmak ister misiniz?
            </p>
          )}
          {!displayError && !showCacheChoice && lastResult && !loading && (
            <p className="text-[11px] text-zinc-500">
              <span className="font-medium text-emerald-400">{lastResult.added}</span> yeni ·{" "}
              <span className="font-medium text-amber-400">{lastResult.updated}</span> güncellendi ·{" "}
              <span className="text-zinc-600">{lastResult.skipped}</span> atlandı ·{" "}
              {lastResult.source === "cached" ? "Önbellekten" : "Google'dan"}
              {lastResult.hot > 0 && (
                <>
                  {" · "}
                  <span className="font-medium text-orange-400">{lastResult.hot} 🔥</span>
                </>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Table header */}
      {lastBatch.length > 0 && (
        <div className="shrink-0 grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_40px_40px_50px_60px] items-center gap-3 border-b border-white/[0.06] px-4 py-2">
          {["İşletme Adı", "Şehir", "Tür", "Tel", "Web", "Skor", ""].map((h, i) => (
            <span
              key={i}
              className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-600"
            >
              {h}
            </span>
          ))}
        </div>
      )}

      {/* Table body / empty state */}
      <div className="flex-1 overflow-y-auto">
        {lastBatch.length === 0 ? (
          <EmptyState />
        ) : (
          <div>
            {lastBatch.map((lead) => (
              <LeadRow
                key={lead.id}
                lead={lead}
                isNew={lastNewIds.has(lead.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {lastBatch.length > 0 && (
        <div className="shrink-0 border-t border-white/[0.06] px-4 py-2.5 flex items-center justify-between">
          <span className="text-[11px] text-zinc-600">
            Son import: {lastEntry ? fmtTime(lastEntry.importedAt) : "—"} · {lastBatch.length} sonuç
          </span>
          <span className="text-[11px] text-zinc-700">
            Google Maps · Konaklama
          </span>
        </div>
      )}
    </div>
  );
}
