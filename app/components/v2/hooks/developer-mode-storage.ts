/**
 * Developer Mode storage helpers (v6.1).
 *
 * Pure, no `localStorage`/`window` read — the hook (`useDeveloperMode.ts`)
 * owns the actual browser storage call and passes the raw string through
 * these functions. Kept separate so the parsing/serialization rules are
 * testable under plain `node --test` without a DOM.
 */

export const DEVELOPER_MODE_STORAGE_KEY = "hermes-developer-mode-v1";

/** Anything other than the literal `"true"` is treated as OFF — the safe default for a founder-facing workspace. */
export function parseDeveloperModeFlag(raw: string | null | undefined): boolean {
  return raw === "true";
}

export function serializeDeveloperModeFlag(value: boolean): string {
  return value ? "true" : "false";
}
