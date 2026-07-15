/**
 * Persisted mission-record storage helpers (Founder Mission Feedback Loop).
 *
 * Pure, no `localStorage`/`window` read — the hook (`usePersistedMissionRecord.ts`)
 * owns the actual browser storage call and passes the raw string through
 * these functions, same split `developer-mode-storage.ts` already
 * established. Kept separate so parsing/serialization is testable under
 * plain `node --test` without a DOM.
 *
 * Root-cause note: V2Shell's `hermesDecisions` / `hermesDrafts` /
 * `hermesPipelines` / `hermesDeliveries` / `hermesProviderReceipts` /
 * `hermesLiveSendGates` / `hermesProviderApiDryResponses` /
 * `hermesLiveSendResults` were plain `useState<Record<string, X>>({})` —
 * pure in-memory React state, never written anywhere a page reload could
 * read back. A founder's "Onayla"/"Reddet" click looked instantaneous
 * (state flips synchronously, the mission leaves Karar Merkezi that same
 * render) but a full browser refresh wiped every one of those Records back
 * to `{}`, and `buildHermesMissions` recomputes `mission.stage` fresh from
 * `hermesDecisions` on every render — so the approved mission's stage went
 * right back to `"approval"` and the card reappeared. This module (plus the
 * hook that uses it) is the fix: the exact same Record, now mirrored to
 * `localStorage` on every write and re-hydrated on mount — no new mission
 * system, no new event bus, just making the one existing source of truth
 * durable, the same way `useV2PanelState`/`useDeveloperMode` already do for
 * their own state.
 */

export function parsePersistedRecord<T>(raw: string | null | undefined): Record<string, T> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as Record<string, T>;
  } catch {
    return {};
  }
}

export function serializePersistedRecord<T>(record: Record<string, T>): string {
  return JSON.stringify(record);
}
