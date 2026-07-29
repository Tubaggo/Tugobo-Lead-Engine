import "server-only";

import path from "node:path";

import { resolveDataDir } from "../operational-state/env.ts";

/**
 * Where the durable Hermes runtime file lives.
 *
 * Deliberately the *same* directory as `operational-state.json`, resolved by
 * the *same* `LEAD_ENGINE_DATA_DIR` helper — one configured data directory, one
 * backup target, one thing to point outside the repository on a VPS. The
 * Hermes line's own `HERMES_RUNTIME_STATE_DIR` is intentionally not read: a
 * second data directory would be a second thing to configure, a second thing to
 * back up, and a second thing to get wrong.
 *
 * A separate *file* rather than a section inside `operational-state.json`, for
 * three reasons:
 *
 *  1. `parseStateFile` rejects any file whose `schemaVersion !== 1`, so sharing
 *     one document would couple the two schemas' version lifecycles forever.
 *  2. `resetLeadOperationalStates` and `backupBeforeMutation` operate on the
 *     whole operational document. Clearing a lead's test data must not delete
 *     its missions, and recording a delivery receipt must not trigger a
 *     pipeline backup.
 *  3. Blast radius: a corrupt Hermes file quarantines Hermes alone and leaves
 *     the founder's pipeline readable.
 */

export const HERMES_RUNTIME_FILE_NAME = "hermes-runtime.json";

export function resolveHermesRuntimeFilePath(): string {
  return path.join(resolveDataDir(), HERMES_RUNTIME_FILE_NAME);
}
