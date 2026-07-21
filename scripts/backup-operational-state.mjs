#!/usr/bin/env node
/**
 * Snapshots the operational state file into `<data dir>/backups/`.
 *
 * Deliberately quiet about contents: it prints the backup path and a count of
 * retained files, never lead data, note text, or any environment value. Run it
 * from cron on the VPS (see `docs/HOSTINGER_DATA_STORAGE.md`).
 *
 *   pnpm state:backup
 */

import fs from "node:fs/promises";
import path from "node:path";

/** Keep the most recent N snapshots; older ones are pruned. */
const RETENTION = 20;

const STATE_FILE_NAME = "operational-state.json";
const BACKUP_DIR_NAME = "backups";
const BACKUP_PREFIX = "operational-state-";

function resolveDataDir() {
  const configured = (process.env.LEAD_ENGINE_DATA_DIR ?? "").trim();
  return configured.length > 0
    ? path.resolve(configured)
    : path.resolve(process.cwd(), ".data");
}

/** `20260721-143005` — sortable, filename-safe, no colons. */
function stamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

async function prune(backupDir) {
  const entries = (await fs.readdir(backupDir))
    .filter((name) => name.startsWith(BACKUP_PREFIX) && name.endsWith(".json"))
    .sort();

  const excess = entries.length - RETENTION;
  if (excess <= 0) return { kept: entries.length, removed: 0 };

  for (const name of entries.slice(0, excess)) {
    await fs.rm(path.join(backupDir, name), { force: true });
  }
  return { kept: RETENTION, removed: excess };
}

async function main() {
  const dataDir = resolveDataDir();
  const sourcePath = path.join(dataDir, STATE_FILE_NAME);

  try {
    await fs.access(sourcePath);
  } catch {
    console.error(
      "No operational state file to back up yet.\n" +
        "Expected it in the configured LEAD_ENGINE_DATA_DIR. " +
        "This is normal on a fresh install — run the app and save something first.",
    );
    process.exitCode = 1;
    return;
  }

  // Validate before copying: a backup of a corrupt file is not a backup.
  const raw = await fs.readFile(sourcePath, "utf8");
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || parsed.schemaVersion !== 1) {
      throw new Error("unexpected shape");
    }
  } catch {
    console.error(
      "Refusing to back up: the state file is not valid operational state. " +
        "Run `pnpm state:verify` for details.",
    );
    process.exitCode = 1;
    return;
  }

  const backupDir = path.join(dataDir, BACKUP_DIR_NAME);
  await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });

  const target = path.join(backupDir, `${BACKUP_PREFIX}${stamp()}.json`);
  await fs.writeFile(target, raw, { encoding: "utf8", mode: 0o600 });

  const { kept, removed } = await prune(backupDir);

  console.log(`Backup written: ${target}`);
  console.log(`Retained ${kept} backup(s); pruned ${removed}.`);
}

main().catch((err) => {
  // Message only — never the stack, which would carry absolute paths.
  console.error(`Backup failed: ${err instanceof Error ? err.message : "unknown error"}`);
  process.exitCode = 1;
});
