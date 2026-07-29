import "server-only";

import {
  CorruptDataFileError,
  quarantineFile,
  readRawJsonFile,
  withWriteLock,
  writeAtomicJson,
} from "../operational-state/file-store.ts";
import {
  emptyHermesRuntimeFile,
  nowIso,
  parseHermesRuntimeFile,
  type HermesRuntimeFile,
} from "./schema.ts";

/**
 * The durable store for the Hermes runtime file.
 *
 * Deliberately thin. Every durability property — the per-path write lock, the
 * temp-file + `fsync` + `rename` atomic write, the quarantine-never-reset read,
 * the 0700 directory — is *imported* from `operational-state/file-store.ts`,
 * not reimplemented. This module contributes exactly one thing the generic
 * layer cannot know: which parser to run and what an empty file looks like.
 *
 * That is the whole reason the primitives were exported in v3.8.0. There is one
 * atomic-write implementation in this codebase, and both durable domains use
 * it.
 */

export class CorruptHermesFileError extends CorruptDataFileError {
  constructor(quarantinePath: string) {
    super(quarantinePath, "hermes runtime file was unreadable and has been quarantined");
    this.name = "CorruptHermesFileError";
  }
}

/**
 * Reads and validates the Hermes file.
 *
 * A missing file is an empty runtime, which is the correct state for a fresh
 * install and never an error. Unparseable or wrong-shaped content is quarantined
 * and surfaced, so a founder is never handed an empty mission list that looks
 * like a real one.
 */
export async function readHermesFile(filePath: string): Promise<HermesRuntimeFile> {
  const raw = await readRawJsonFile(filePath);
  if (raw.kind === "missing") return emptyHermesRuntimeFile();
  if (raw.kind === "unparseable") {
    throw new CorruptHermesFileError(await quarantineFile(filePath));
  }

  const file = parseHermesRuntimeFile(raw.value);
  if (!file) throw new CorruptHermesFileError(await quarantineFile(filePath));
  return file;
}

/**
 * Read variant that degrades to an empty runtime when the file is corrupt.
 *
 * Used on read-only paths, where an empty Hermes workspace is a better answer
 * than a 500. The quarantine has already happened by the time this returns.
 */
export async function readHermesFileOrEmpty(filePath: string): Promise<HermesRuntimeFile> {
  try {
    return await readHermesFile(filePath);
  } catch (err) {
    if (err instanceof CorruptDataFileError) return emptyHermesRuntimeFile();
    throw err;
  }
}

/**
 * Read-modify-write under the shared per-file lock.
 *
 * `mutate` runs inside the lock, so it always observes the previous completed
 * write. The file-wide `revision` is bumped here rather than by each caller —
 * one place, so "did anything change" is answerable without diffing.
 */
export async function updateHermesFile(
  filePath: string,
  mutate: (current: HermesRuntimeFile) => HermesRuntimeFile | Promise<HermesRuntimeFile>,
): Promise<HermesRuntimeFile> {
  return withWriteLock(filePath, async () => {
    const current = await readHermesFile(filePath);
    const next = await mutate(current);
    // A mutation that returns the file unchanged is a true no-op: no revision
    // burned, no write, no new mtime. Replayed requests stay free.
    if (next === current) return current;
    const stamped: HermesRuntimeFile = {
      ...next,
      updatedAt: nowIso(),
      revision: current.revision + 1,
    };
    await writeAtomicJson(filePath, stamped);
    return stamped;
  });
}

/** Creates the file with empty contents if it does not exist yet. */
export async function ensureHermesFile(filePath: string): Promise<HermesRuntimeFile> {
  return updateHermesFile(filePath, (current) => ({ ...current }));
}
