import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { resolveBackupDir, resolveStateFilePath } from "./env.ts";

/**
 * Pre-mutation snapshots of the operational state file.
 *
 * `scripts/backup-operational-state.mjs` does the same job on a cron; this is
 * the in-process version the reset path calls before it destroys anything. It
 * is deliberately a byte copy of the file as it exists on disk, not a
 * re-serialization of parsed state — a backup that has been through the
 * normalizer is a backup of what we think the file said.
 *
 * Nothing here logs or returns file contents. The caller receives a filename,
 * never a path or a lead.
 */

const BACKUP_PREFIX = "operational-state-";
/** Distinguishes an automatic pre-reset snapshot from the cron ones. */
const RESET_SUFFIX = "-pre-reset";

export class BackupFailedError extends Error {
  constructor() {
    super("operational state backup failed");
    this.name = "BackupFailedError";
  }
}

/** `20260722-143005` — sortable, filename-safe, no colons. */
function stamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/**
 * Copies the current state file into the backup directory.
 *
 * Returns the backup's *filename* so the UI can tell the founder a snapshot
 * exists without leaking the data directory. Returns `null` when there is no
 * state file yet — a fresh install has nothing to lose, and refusing to reset
 * an empty store would be an obstruction, not a safeguard.
 *
 * Throws {@link BackupFailedError} on any other failure so the caller can fail
 * closed. A reset that proceeds without a snapshot is unrecoverable.
 */
export async function backupBeforeMutation(): Promise<string | null> {
  const sourcePath = resolveStateFilePath();

  let raw: string;
  try {
    raw = await fs.readFile(sourcePath, "utf8");
  } catch (err) {
    if ((err as { code?: string }).code === "ENOENT") return null;
    throw new BackupFailedError();
  }

  // A backup of an unparseable file is not a backup, but it is still the only
  // copy of whatever is there — so it is written, and the caller is told.
  try {
    const backupDir = resolveBackupDir();
    await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });

    const name = `${BACKUP_PREFIX}${stamp()}${RESET_SUFFIX}.json`;
    const target = path.join(backupDir, name);
    await fs.writeFile(target, raw, { encoding: "utf8", mode: 0o600 });

    // Verify the bytes landed; a short write here would be silent data loss.
    const written = await fs.readFile(target, "utf8");
    if (written.length !== raw.length) throw new Error("short write");

    return name;
  } catch {
    throw new BackupFailedError();
  }
}
