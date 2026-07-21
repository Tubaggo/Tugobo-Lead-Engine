import "server-only";

import path from "node:path";

/**
 * Server-only resolution of where operational state is written.
 *
 * `LEAD_ENGINE_DATA_DIR` is read here and nowhere else. It is not prefixed
 * NEXT_PUBLIC_ and `server-only` blocks client imports, so the deployment path
 * never reaches the browser bundle. Nothing in this module is ever included in
 * a response body or an error message shown to a caller.
 */

const DATA_DIR_KEY = "LEAD_ENGINE_DATA_DIR";

/** Development fallback, inside the repo but gitignored. */
const DEV_FALLBACK_DIR = ".data";

export const STATE_FILE_NAME = "operational-state.json";
export const BACKUP_DIR_NAME = "backups";

/**
 * Absolute path to the data directory.
 *
 * Production must set `LEAD_ENGINE_DATA_DIR` to a path outside the repository
 * (see `docs/HOSTINGER_DATA_STORAGE.md`) so a redeploy cannot delete pipeline
 * data. Development falls back to `.data/` so a fresh clone just works.
 */
export function resolveDataDir(): string {
  const configured = (process.env[DATA_DIR_KEY] ?? "").trim();
  if (configured.length > 0) return path.resolve(configured);
  return path.resolve(process.cwd(), DEV_FALLBACK_DIR);
}

export function resolveStateFilePath(): string {
  return path.join(resolveDataDir(), STATE_FILE_NAME);
}

export function resolveBackupDir(): string {
  return path.join(resolveDataDir(), BACKUP_DIR_NAME);
}

/** True when the deployment configured an explicit directory. */
export function isDataDirConfigured(): boolean {
  return (process.env[DATA_DIR_KEY] ?? "").trim().length > 0;
}
