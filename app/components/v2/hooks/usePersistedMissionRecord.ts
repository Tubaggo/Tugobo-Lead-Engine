"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { parsePersistedRecord, serializePersistedRecord } from "./hermes-persisted-record-storage";

/**
 * Drop-in replacement for `useState<Record<string, T>>({})` that mirrors the
 * Record to `localStorage` under `storageKey` — same convention
 * `useDeveloperMode.ts` already uses for its own flag (initial render is
 * `{}` on both server and first client paint, hydrated from storage in a
 * `useEffect` right after mount; no hydration-mismatch risk since `{}` is
 * always a valid, already-handled empty state for every caller).
 *
 * Same call signature as `useState` (including functional updates,
 * `setRecord((prev) => ...)`), so every existing call site in V2Shell.tsx
 * swaps in unchanged. Never throws on a missing/unavailable/quota-exceeded
 * `localStorage` — falls back to in-memory-only behavior, matching every
 * other storage hook in this codebase.
 */
export function usePersistedMissionRecord<T>(
  storageKey: string,
): [Record<string, T>, Dispatch<SetStateAction<Record<string, T>>>] {
  const [record, setRecordState] = useState<Record<string, T>>({});

  useEffect(() => {
    try {
      setRecordState(parsePersistedRecord<T>(window.localStorage.getItem(storageKey)));
    } catch {
      // storage unavailable (privacy mode, quota, etc.) — keep the empty default
    }
    // Intentionally mount-only: storageKey is a stable literal per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setRecord = useCallback<Dispatch<SetStateAction<Record<string, T>>>>(
    (update) => {
      setRecordState((prev) => {
        const next =
          typeof update === "function" ? (update as (p: Record<string, T>) => Record<string, T>)(prev) : update;
        try {
          window.localStorage.setItem(storageKey, serializePersistedRecord(next));
        } catch {
          // best-effort persistence — quota/availability errors never block the UI update
        }
        return next;
      });
    },
    [storageKey],
  );

  return [record, setRecord];
}
