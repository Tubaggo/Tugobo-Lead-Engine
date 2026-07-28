/**
 * What counts as a lead id, in one place.
 *
 * A route param is a string that arrived from a URL, and a client bug turns
 * `undefined` into the four-letter word "undefined" long before the server
 * sees it. The pattern check alone accepted that: it is well-formed, so a
 * PATCH created `leads["undefined"]`, gave it revision 1, and the workspace
 * grew a record for a hotel that does not exist. That is how pipeline data
 * quietly stops being trustworthy.
 *
 * So a lead id has to clear three gates, in order:
 *   1. it is a non-empty string once decoded and trimmed
 *   2. it is not a language placeholder that got stringified on the way here
 *   3. it matches the shape real ids actually have
 *
 * Mutations add a fourth: the workspace has to already know the lead. That one
 * needs the stored file, so it is expressed as an injected predicate rather
 * than reached for here.
 *
 * Kept pure — no `fs`, no `server-only`, no React — so the routes, the
 * repository, the browser client and `node --test` all judge an id the same
 * way. Two validators would mean two answers.
 */

/** Bounds the key length so a hostile id cannot bloat the file or the logs. */
export const MAX_LEAD_ID_LENGTH = 200;

/**
 * The shape real ids have: `ant-001`, `nev-028`, `gmaps-ChIJTx4xcjmRwxQRc1mJVUUcPfM`.
 *
 * Deliberately not a UUID pattern — nothing in this system mints UUIDs, and a
 * borrowed regex would reject every id the founder actually has.
 */
const LEAD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_:.-]*$/;

/**
 * Values that mean "a variable was empty", not "a hotel".
 *
 * Every one of these is what some language prints when a missing value is
 * concatenated into a URL. None of them can collide with a real id, because a
 * real id is a source prefix plus a key. Compared case-insensitively: the
 * stringification that produces them is not consistent about case.
 */
export const PLACEHOLDER_LEAD_IDS: readonly string[] = [
  "undefined",
  "null",
  "nan",
  "none",
  "nil",
  "true",
  "false",
  "[object object]",
  "object object",
  "void",
  "void 0",
  "n/a",
  "na",
];

const PLACEHOLDERS = new Set(PLACEHOLDER_LEAD_IDS);

export type LeadIdRejection = "empty" | "placeholder" | "malformed" | "unknown";

export type LeadIdValidation =
  | { ok: true; leadId: string }
  | { ok: false; reason: LeadIdRejection };

/**
 * Turns a raw route param into the string to judge.
 *
 * Next.js has already decoded the segment once. Decoding again catches a
 * double-encoded placeholder (`%2575ndefined`), and cannot damage a real id:
 * `%` is not in the allowed alphabet, so anything that still needs decoding
 * would have failed the shape check anyway.
 *
 * Returns "" for anything that is not a usable string, which the caller reads
 * as `empty` rather than having to test for null separately.
 */
export function normalizeLeadIdParam(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let value = raw.trim();
  if (value.includes("%")) {
    try {
      value = decodeURIComponent(value).trim();
    } catch {
      // A malformed escape is not an id; leave it and let the shape check fail.
    }
  }
  return value;
}

/**
 * Validates the id itself, saying *why* it was refused.
 *
 * The reason is for the server's own branching — which status to answer with —
 * and never reaches the founder, who has no way to act on "malformed".
 */
export function validateLeadId(raw: unknown): LeadIdValidation {
  const leadId = normalizeLeadIdParam(raw);

  if (leadId.length === 0) return { ok: false, reason: "empty" };
  if (PLACEHOLDERS.has(leadId.toLowerCase())) {
    return { ok: false, reason: "placeholder" };
  }
  if (leadId.length > MAX_LEAD_ID_LENGTH) return { ok: false, reason: "malformed" };
  if (!LEAD_ID_PATTERN.test(leadId)) return { ok: false, reason: "malformed" };
  // Belt and braces: the pattern already excludes `/`, and the id is only ever
  // an object key, but a traversal-shaped value has no business being stored.
  if (leadId.includes("..")) return { ok: false, reason: "malformed" };

  return { ok: true, leadId };
}

/**
 * The gate a write has to pass.
 *
 * `isKnown` decides whether the workspace has ever heard of this lead. A
 * mutation for an id nothing knows about is not a new lead — leads arrive by
 * import, never by someone writing a note against an id — so it is refused
 * instead of conjuring a record.
 */
export function validateLeadIdForMutation(
  raw: unknown,
  isKnown: (leadId: string) => boolean,
): LeadIdValidation {
  const result = validateLeadId(raw);
  if (!result.ok) return result;
  if (!isKnown(result.leadId)) return { ok: false, reason: "unknown" };
  return result;
}

/** The boolean form, for the many call sites that only filter. */
export function isValidLeadId(value: unknown): value is string {
  const result = validateLeadId(value);
  // Filtering must not silently rewrite an id: a value that only becomes valid
  // after decoding is not the key that was stored.
  return result.ok && result.leadId === value;
}

/**
 * Whether a refusal should read as "you sent nonsense" or "no such lead".
 *
 * 404 is reserved for a well-formed id the workspace does not have, so a
 * client bug (400) is never mistaken for a lead that was deleted.
 */
export function leadIdRejectionStatus(reason: LeadIdRejection): 400 | 404 {
  return reason === "unknown" ? 404 : 400;
}
