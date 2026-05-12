import type { LeadType } from "@/app/lib/leads";

/** Google Places import source (matches client `ImportSource`). */
export type PlacesImportSource = "maps";

/** Same window for server memory reuse and refresh cooldown (5 minutes). */
export const PLACES_IMPORT_SESSION_WINDOW_MS = 5 * 60 * 1000;

/** User-facing copy when Google returns quota / rate limit (Turkish primary product locale). */
export const PLACES_RATE_LIMIT_USER_MESSAGE =
  "Google Places kısa süreli istek limitine takıldı. Birkaç dakika bekleyip tekrar deneyin.";

export function makePlacesImportSessionKey(
  city: string,
  type: LeadType,
  source: PlacesImportSource,
): string {
  return `${city.trim().toLowerCase()}|${type}|${source}`;
}
