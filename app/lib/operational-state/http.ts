import "server-only";

import { CorruptStateFileError } from "./file-store.ts";
import { RevisionConflictError } from "./repository.ts";

/**
 * Shared response helpers for the operational-state routes.
 *
 * Two rules hold across every handler here:
 *  - responses are `no-store`; this is live pipeline state and must never be
 *    served from a shared or browser cache
 *  - errors are generic. A caller learns *that* something failed, never the
 *    data directory, the filename, or the underlying errno.
 */

/** Largest accepted request body. Bounds memory on an unauthenticated-ish path. */
export const MAX_BODY_BYTES = 8 * 1024 * 1024;

const JSON_HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
} as const;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export function errorJson(error: string, status: number): Response {
  return json({ error }, status);
}

/**
 * Reads and parses a JSON body, enforcing the size cap.
 *
 * Returns a `Response` on failure so handlers can `if (x instanceof Response)
 * return x`. The cap is checked against `content-length` when present and
 * against the actual bytes read otherwise, so a lying header does not bypass it.
 */
export async function readJsonBody(
  request: Request,
): Promise<unknown | Response> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const size = Number(declared);
    if (Number.isFinite(size) && size > MAX_BODY_BYTES) {
      return errorJson("payload too large", 413);
    }
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return errorJson("invalid request", 400);
  }

  if (text.length > MAX_BODY_BYTES) return errorJson("payload too large", 413);
  if (text.trim().length === 0) return errorJson("invalid request", 400);

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return errorJson("invalid request", 400);
  }
}

/**
 * Maps a thrown error to a response without leaking detail.
 *
 * Only the two errors the client can act on are distinguished: a revision
 * conflict (retry with fresh state) and a quarantined file (storage needs
 * attention). Everything else is an opaque 500.
 */
export function errorResponse(err: unknown): Response {
  if (err instanceof RevisionConflictError) {
    return json(
      { error: "revision conflict", currentRevision: err.currentRevision },
      409,
    );
  }
  if (err instanceof CorruptStateFileError) {
    return errorJson("storage unavailable", 503);
  }
  return errorJson("internal error", 500);
}
