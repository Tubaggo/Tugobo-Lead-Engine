/**
 * Acquisition ingested-run guard storage helpers (Refresh Persistence
 * Recovery fix).
 *
 * Pure, no `localStorage`/`window` read — `V2Shell.tsx` owns the actual
 * browser storage call and passes the raw string through these functions.
 * Kept separate so the parsing/serialization/capping rules are testable
 * under plain `node --test` without a DOM — same convention as
 * `developer-mode-storage.ts`.
 *
 * This is the SAME guard both acquisition-candidate ingestion paths share
 * (the immediate ingest right after a founder-triggered run, and the
 * pre-existing `/status`-poll recovery effect) — a run id only ever gets
 * added here after its candidate batch was genuinely, successfully
 * persisted to `imported-leads-v2`, never on a failed or skipped ingest.
 */

export const ACQUISITION_INGESTED_RUNS_KEY = "tugobo-lead-engine:acquisition-ingested-runs-v1";

const MAX_TRACKED_RUNS = 50;

/** Anything that isn't a JSON array of strings is treated as "no runs ingested yet" — never throws. */
export function parseIngestedRunIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** Bounded to the most recent `MAX_TRACKED_RUNS` ids — mirrors the pre-existing `.slice(-50)` cap. */
export function serializeIngestedRunIds(ids: string[]): string {
  return JSON.stringify(ids.slice(-MAX_TRACKED_RUNS));
}

/** Pure add-with-dedupe-and-cap — the run id already present is a no-op, not a duplicate entry. */
export function addIngestedRunId(existing: string[], runId: string): string[] {
  if (existing.includes(runId)) return existing;
  return [...existing, runId].slice(-MAX_TRACKED_RUNS);
}
