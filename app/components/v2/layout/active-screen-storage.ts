import type { V2Screen } from "../types.ts";
import { ALL_NAV_SCREENS } from "./v2-nav.ts";

/**
 * v8.0 — persisted active-screen parsing, extracted from V2Shell so the
 * legacy-id migration is a pure, unit-testable rule (same convention as
 * `developer-mode-storage.ts`). V2Shell remains the only place that touches
 * the browser storage API.
 */

export const V2_ACTIVE_SCREEN_STORAGE_KEY = "tugobo-lead-engine:v2-active-screen";

/** v8.0: Hermes is the single entry point — the app always opens here. */
export const DEFAULT_V2_SCREEN: V2Screen = "hermes";

/**
 * Screen ids that existed before v8.0 and were renamed. A founder whose
 * browser persisted the old id must land on the renamed screen, not on the
 * default-by-fallback.
 */
const LEGACY_SCREEN_IDS: Record<string, V2Screen> = {
  "automation-center": "hermes",
};

export function parseStoredActiveScreen(raw: string | null): V2Screen | null {
  if (raw === null) return null;
  const migrated = LEGACY_SCREEN_IDS[raw] ?? raw;
  return (ALL_NAV_SCREENS as string[]).includes(migrated) ? (migrated as V2Screen) : null;
}
