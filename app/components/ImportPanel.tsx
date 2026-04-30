"use client";

import { useRef, useState } from "react";
import { type LeadType } from "@/app/lib/leads";
import { TURKEY_CITIES } from "@/app/lib/generate";

export type ImportSource = "maps";

export type ImportRequest = {
  city: string;
  type: LeadType;
  source: ImportSource;
};

export type ImportResult = {
  added: number;
  hot: number;
  skipped: number;
};

const NICHES: { value: LeadType; label: string }[] = [
  { value: "Hotel", label: "Hotel" },
  { value: "Boutique Hotel", label: "Boutique Hotel" },
  { value: "Bungalow", label: "Bungalow" },
  { value: "Villa", label: "Villa" },
  { value: "Pension", label: "Pension" },
];

const SOURCES: { value: ImportSource; label: string; hint: string }[] = [
  {
    value: "maps",
    label: "Google Maps (Places)",
    hint: "Live businesses from Google Places (public listings)",
  },
];

const DATALIST_ID = "tugobo-city-list";

function formatImportSummary(r: ImportResult): { text: string; tone: "ok" | "warn" } {
  const { added, hot, skipped } = r;
  const leadWord = added === 1 ? "lead" : "leads";
  const hotWord = hot === 1 ? "hot lead" : "hot leads";
  const dupWord = skipped === 1 ? "duplicate skipped" : "duplicates skipped";

  if (added === 0 && skipped === 0) {
    return {
      text: "No businesses found for this search. Try another city or niche.",
      tone: "warn",
    };
  }

  if (added === 0 && skipped > 0) {
    return {
      text: `No new leads — ${skipped} ${dupWord}. Try another city or niche.`,
      tone: "warn",
    };
  }

  return {
    text: `${added} new ${leadWord} added | ${hot} ${hotWord} | ${skipped} ${skipped === 1 ? "duplicate" : "duplicates"} skipped`,
    tone: "ok",
  };
}

export default function ImportPanel({
  onImport,
}: {
  onImport: (req: ImportRequest) => Promise<ImportResult>;
}) {
  const [city, setCity] = useState("");
  const [type, setType] = useState<LeadType>("Boutique Hotel");
  const [source, setSource] = useState<ImportSource>("maps");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const cityRef = useRef<HTMLInputElement>(null);
  const statusId = "import-status";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = city.trim();
    if (!trimmed) {
      setError("Enter a city first.");
      cityRef.current?.focus();
      return;
    }
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const r = await onImport({ city: trimmed, type, source });
      setResult(r);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  };

  const summary =
    result && !loading ? formatImportSummary(result) : null;

  return (
    <section className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] p-4 backdrop-blur ring-1 ring-inset ring-indigo-500/10">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-5 w-5 items-center justify-center rounded bg-indigo-500/20">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5 text-indigo-300"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12l7-7 7 7" />
          </svg>
        </div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-indigo-200">
          Import Leads
        </h2>
        <span className="ml-auto inline-flex items-center rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-medium text-indigo-300 ring-1 ring-inset ring-indigo-400/30">
          Phase 2A
        </span>
      </div>

      <form
        onSubmit={handleSubmit}
        aria-busy={loading}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
          <div className="flex min-w-[160px] flex-1 flex-col gap-1">
            <label
              htmlFor="import-city"
              className="text-[10px] uppercase tracking-wider text-zinc-400"
            >
              City
            </label>
            <input
              ref={cityRef}
              id="import-city"
              list={DATALIST_ID}
              value={city}
              disabled={loading}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${statusId}-err` : undefined}
              onChange={(e) => {
                setCity(e.target.value);
                setResult(null);
                setError("");
              }}
              placeholder="e.g. Bodrum"
              autoComplete="off"
              className={`rounded-md border bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-50 ${
                error
                  ? "border-rose-400/50 focus:border-rose-400/50"
                  : "border-white/10 focus:border-indigo-400/40"
              }`}
            />
            <datalist id={DATALIST_ID}>
              {TURKEY_CITIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div className="flex min-w-[160px] flex-col gap-1">
            <label
              htmlFor="import-type"
              className="text-[10px] uppercase tracking-wider text-zinc-400"
            >
              Niche / Type
            </label>
            <select
              id="import-type"
              value={type}
              disabled={loading}
              onChange={(e) => {
                setType(e.target.value as LeadType);
                setResult(null);
              }}
              className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {NICHES.map((n) => (
                <option key={n.value} value={n.value} className="bg-zinc-900">
                  {n.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex min-w-[180px] flex-col gap-1">
            <label
              htmlFor="import-source"
              className="text-[10px] uppercase tracking-wider text-zinc-400"
            >
              Source
            </label>
            <select
              id="import-source"
              value={source}
              disabled={loading}
              onChange={(e) => {
                setSource(e.target.value as ImportSource);
                setResult(null);
                setError("");
              }}
              className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value} className="bg-zinc-900">
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 sm:min-w-0">
            <div className="hidden h-[18px] sm:block" aria-hidden="true" />
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 disabled:cursor-wait disabled:opacity-60 sm:whitespace-nowrap"
            >
              {loading ? (
                <>
                  <span
                    className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
                    aria-hidden="true"
                  />
                  Importing…
                </>
              ) : (
                <>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3.5 w-3.5 shrink-0"
                    aria-hidden="true"
                  >
                    <path d="M12 5v14M5 12l7-7 7 7" />
                  </svg>
                  Import 10 Leads
                </>
              )}
            </button>
          </div>
        </div>

        {/* Feedback: full width so summary never fights the button */}
        <div className="min-h-[1.25rem]" aria-live="polite">
          {error && (
            <p id={`${statusId}-err`} className="text-xs text-rose-400">
              {error}
            </p>
          )}
          {summary && (
            <p
              id={statusId}
              className={
                summary.tone === "warn"
                  ? "text-xs text-amber-300"
                  : "text-xs text-emerald-300"
              }
            >
              {summary.text}
            </p>
          )}
        </div>
      </form>

      <p className="mt-1 text-[10px] text-zinc-500">
        {SOURCES.find((s) => s.value === source)?.hint}
        {" · "}Server needs GOOGLE_MAPS_API_KEY (Places API enabled).
      </p>
    </section>
  );
}
