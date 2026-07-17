/**
 * Last-selected-mission storage helpers (Opportunity Workspace Resume fix).
 *
 * Pure, no `localStorage`/`window` read — `V2Shell.tsx` owns the actual
 * browser storage call and passes the raw string through these functions.
 * Kept separate so the parsing rule is testable under plain `node --test`
 * without a DOM — same convention as `developer-mode-storage.ts`.
 *
 * Deliberately a raw string contract (not JSON) — a mission id is already
 * just a string (`mission:${leadId}`), so there is nothing to serialize.
 * Only the id is ever persisted here — never the mission object, never the
 * workspace mode, never a draft.
 */

export const LAST_SELECTED_MISSION_STORAGE_KEY = "hermes-last-selected-mission-v1";

/** Anything that isn't a non-empty string is treated as "no prior selection" — never throws, never crashes on corrupted storage. */
export function parseLastSelectedMissionId(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
