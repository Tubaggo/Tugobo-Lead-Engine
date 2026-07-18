import fs from "node:fs";
import path from "node:path";

/**
 * Hermes Acquisition Region State Store (Türkiye Region Rotation v1.0).
 *
 * Durable file-backed persistence for the region rotation cursor —
 * `{ regionId: lastRunAt }` only. Server-only (acquisition runs in a
 * Node.js API route, never a client), so this is a small local JSON file
 * rather than `localStorage`. Nothing else is ever persisted here: no lead
 * data, no candidate payload, no API key, no full run object.
 *
 * Never throws. A missing directory, missing file, corrupted JSON, unknown
 * version, or a filesystem error all resolve to a safe empty read / a
 * `{ ok: false }` write result — the caller (the orchestrator) treats a
 * failed read exactly like "no prior rotation state" and a failed write as
 * a non-fatal, founder-safe warning. The in-memory registry
 * (`hermes-acquisition-run-registry.ts`) remains fully functional on its
 * own if this store is unavailable — this module is wired in only by the
 * production route, never imported by the pure orchestrator tests.
 */

const STATE_VERSION = 1;
const STATE_FILE_NAME = "acquisition-region-state.json";

export type AcquisitionRegionStateFile = {
  version: number;
  regionLastRunAt: Record<string, number>;
};

function resolveStateDir(): string {
  const override = process.env.HERMES_RUNTIME_STATE_DIR;
  if (override && override.trim()) return override.trim();
  return path.join(process.cwd(), ".hermes-runtime");
}

/** Exposed for tests/manual QA introspection — never used to bypass the safe read/write functions below. */
export function resolveAcquisitionRegionStateFilePath(): string {
  return path.join(resolveStateDir(), STATE_FILE_NAME);
}

function isValidTimestamp(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

/**
 * Pure parse of raw file content into a safe `{ regionId: lastRunAt }` map.
 * Never throws: invalid JSON, a non-object shape, an unknown version, or an
 * invalid individual entry all degrade gracefully rather than crashing or
 * poisoning rotation state with garbage.
 */
export function parseAcquisitionRegionStateFile(raw: string): Record<string, number> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  const obj = parsed as Record<string, unknown>;
  if (obj.version !== STATE_VERSION) return {};

  const map = obj.regionLastRunAt;
  if (typeof map !== "object" || map === null || Array.isArray(map)) return {};

  const result: Record<string, number> = {};
  for (const [regionId, at] of Object.entries(map as Record<string, unknown>)) {
    if (typeof regionId === "string" && regionId.trim().length > 0 && isValidTimestamp(at)) {
      result[regionId] = at;
    }
  }
  return result;
}

/** Reads persisted region rotation cursor state from disk. Missing/corrupted file → empty map, never a throw. */
export function readAcquisitionRegionStateFromDisk(): Record<string, number> {
  try {
    const raw = fs.readFileSync(resolveAcquisitionRegionStateFilePath(), "utf8");
    return parseAcquisitionRegionStateFile(raw);
  } catch {
    return {};
  }
}

export type AcquisitionRegionStateWriteResult = { ok: true } | { ok: false; error: string };

/**
 * Atomically persists the full region rotation cursor map: write to a
 * process-unique temp file, then rename over the real path. Synchronous —
 * Node executes synchronous code without interleaving, so concurrent calls
 * within the same process are naturally serialized (no lock file needed).
 * Never throws: a filesystem failure returns `{ ok: false }` so the caller
 * can surface a safe warning without losing the in-memory rotation state or
 * aborting the acquisition run in progress.
 */
export function writeAcquisitionRegionStateToDisk(
  state: Record<string, number>,
): AcquisitionRegionStateWriteResult {
  try {
    const dir = resolveStateDir();
    fs.mkdirSync(dir, { recursive: true });
    const filePath = resolveAcquisitionRegionStateFilePath();
    const tmpPath = path.join(
      dir,
      `.${STATE_FILE_NAME}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    const payload: AcquisitionRegionStateFile = { version: STATE_VERSION, regionLastRunAt: state };
    fs.writeFileSync(tmpPath, JSON.stringify(payload), "utf8");
    fs.renameSync(tmpPath, filePath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown_error" };
  }
}
