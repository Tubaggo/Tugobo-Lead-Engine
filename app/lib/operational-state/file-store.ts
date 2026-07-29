import "server-only";

import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import {
  emptyStateFile,
  nowIso,
  parseStateFile,
  type OperationalStateFile,
} from "./schema.ts";

/**
 * Atomic, single-process JSON store for operational state.
 *
 * Paths are passed in rather than read from the environment so the store can
 * be exercised against a temporary directory in tests. `repository.ts` is the
 * only production caller and supplies the resolved path.
 *
 * Guarantees:
 *  - a reader never observes a partially written file (temp file + rename)
 *  - concurrent writers are serialized, so a read-modify-write cannot be lost
 *  - a corrupt file is quarantined, never silently reset
 *  - no lead content, note text, or path is ever logged
 *
 * v3.8.0: the durability primitives below (`withWriteLock`, `writeAtomicJson`,
 * `readRawJsonFile`, `quarantineFile`) are exported so a second durable domain
 * — the Hermes runtime store — reuses this exact machinery instead of growing
 * a parallel copy of it. The operational-state functions further down are
 * themselves written in terms of those primitives, so there is one atomic-write
 * implementation in the codebase, not two. The lock map is keyed by absolute
 * path, so two different files never serialize against each other.
 */

/* -------------------------------------------------------------------------- */
/* write serialization                                                        */
/* -------------------------------------------------------------------------- */

/**
 * One promise chain per file path. Every mutation appends to its file's chain,
 * so read-modify-write sequences run strictly one at a time within this
 * process. Without this, two concurrent PATCHes would both read the same
 * revision and the second would overwrite the first.
 *
 * This is a single-process guard. It is sufficient here because the VPS runs
 * one PM2 instance for one founder; a clustered deployment would need an
 * on-disk lock instead. That constraint is documented in
 * `docs/HOSTINGER_DATA_STORAGE.md`.
 */
const writeChains = new Map<string, Promise<unknown>>();

export function withWriteLock<T>(filePath: string, task: () => Promise<T>): Promise<T> {
  const previous = writeChains.get(filePath) ?? Promise.resolve();
  // Swallow the predecessor's rejection so one failed write cannot poison the
  // queue for every write behind it.
  const run = previous.then(task, task);
  writeChains.set(
    filePath,
    run.catch(() => undefined),
  );
  return run;
}

/* -------------------------------------------------------------------------- */
/* directory + permissions                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Creates the data directory if absent. Owner-only (0700) so pipeline data is
 * not world-readable on a shared host; the mode is advisory on Windows and is
 * simply ignored there.
 */
export async function ensureDataDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
}

/** True when the directory exists (creating it if needed) and is writable. */
export async function isStorageWritable(dir: string): Promise<boolean> {
  try {
    await ensureDataDir(dir);
    await fs.access(dir, fsConstants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* read                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * A durable JSON file was unreadable and has been moved aside.
 *
 * The base carries only the quarantine path — never the original path, never
 * any content — so a message that reaches a log or a response body cannot leak
 * where the founder's data lives or what was in it.
 */
export class CorruptDataFileError extends Error {
  readonly quarantinePath: string;
  constructor(quarantinePath: string, message: string) {
    super(message);
    this.name = "CorruptDataFileError";
    this.quarantinePath = quarantinePath;
  }
}

export class CorruptStateFileError extends CorruptDataFileError {
  constructor(quarantinePath: string) {
    super(quarantinePath, "operational state file was unreadable and has been quarantined");
    this.name = "CorruptStateFileError";
  }
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}

/**
 * Moves an unreadable file aside so the next write starts clean without
 * destroying whatever was there. Returns the quarantine path.
 */
export async function quarantineFile(filePath: string): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = `${filePath}.corrupt-${stamp}`;
  await fs.rename(filePath, target);
  return target;
}

/**
 * What was actually on disk, before any schema is applied.
 *
 * `missing` covers both an absent file and an empty one — both mean "nothing
 * has been written yet", which is a valid fresh-install state and never an
 * error. `unparseable` is reserved for bytes that exist but are not JSON; only
 * that case warrants quarantine.
 */
export type RawJsonRead =
  | { kind: "missing" }
  | { kind: "json"; value: unknown }
  | { kind: "unparseable" };

export async function readRawJsonFile(filePath: string): Promise<RawJsonRead> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err) {
    if (isNotFound(err)) return { kind: "missing" };
    throw err;
  }

  if (raw.trim().length === 0) return { kind: "missing" };

  try {
    return { kind: "json", value: JSON.parse(raw) };
  } catch {
    return { kind: "unparseable" };
  }
}

/**
 * Reads and validates the state file.
 *
 * A missing file is not an error — it is an empty workspace, which is the
 * correct state for a fresh install. Unparseable or wrong-shaped content is
 * quarantined and surfaced as {@link CorruptStateFileError} so the caller can
 * fail loudly instead of handing back an empty pipeline.
 */
export async function readStateFile(filePath: string): Promise<OperationalStateFile> {
  const raw = await readRawJsonFile(filePath);
  if (raw.kind === "missing") return emptyStateFile();
  if (raw.kind === "unparseable") {
    throw new CorruptStateFileError(await quarantineFile(filePath));
  }

  const file = parseStateFile(raw.value);
  if (!file) throw new CorruptStateFileError(await quarantineFile(filePath));
  return file;
}

/**
 * Read variant that degrades to an empty workspace when the file is corrupt.
 * Used on read-only paths (GET, health) where returning nothing is better than
 * a 500; the quarantine has already happened by then.
 */
export async function readStateFileOrEmpty(
  filePath: string,
): Promise<OperationalStateFile> {
  try {
    return await readStateFile(filePath);
  } catch (err) {
    if (err instanceof CorruptStateFileError) return emptyStateFile();
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/* write                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Writes `file` atomically: serialize to a sibling temp file, flush it to the
 * platter, then `rename` over the target. `rename` within a directory is
 * atomic on POSIX and on NTFS, so a reader sees either the whole old file or
 * the whole new one — never a truncated JSON document.
 */
export async function writeAtomicJson(filePath: string, value: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDataDir(dir);

  const tempPath = path.join(
    dir,
    `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}`,
  );
  const payload = `${JSON.stringify(value, null, 2)}\n`;

  const handle = await fs.open(tempPath, "w", 0o600);
  try {
    await handle.writeFile(payload, "utf8");
    // Durability: without this the rename can land before the data does, and a
    // power loss would leave an empty file where the pipeline used to be.
    await handle.sync();
  } finally {
    await handle.close();
  }

  try {
    await fs.rename(tempPath, filePath);
  } catch (err) {
    await fs.rm(tempPath, { force: true });
    throw err;
  }
}

/**
 * Read-modify-write under the per-file lock.
 *
 * `mutate` receives the current file and returns the next one. It runs inside
 * the lock, so it always sees the result of the previous completed write.
 */
export async function updateStateFile(
  filePath: string,
  mutate: (current: OperationalStateFile) => OperationalStateFile | Promise<OperationalStateFile>,
): Promise<OperationalStateFile> {
  return withWriteLock(filePath, async () => {
    const current = await readStateFile(filePath);
    const next = await mutate(current);
    const stamped: OperationalStateFile = { ...next, updatedAt: nowIso() };
    await writeAtomicJson(filePath, stamped);
    return stamped;
  });
}

/** Creates the file with empty contents if it does not exist yet. */
export async function ensureStateFile(filePath: string): Promise<OperationalStateFile> {
  return updateStateFile(filePath, (current) => current);
}
