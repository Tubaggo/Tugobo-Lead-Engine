"use client";

import { useCallback, useEffect, useState } from "react";
import { DEVELOPER_MODE_STORAGE_KEY, parseDeveloperModeFlag, serializeDeveloperModeFlag } from "./developer-mode-storage";

/**
 * Developer Mode toggle (v6.1). Default OFF — Hermes Home (named Founder
 * Revenue Workspace before v8.0) is the default experience; the existing
 * Hermes runtime cards only appear
 * once the founder explicitly opts into Developer Mode, and even then start
 * collapsed (see `AutomationCenterScreen.tsx`'s `<details>` wrapper).
 *
 * Persisted to `localStorage` so the choice survives a reload — this is
 * the only place that reads/writes the browser storage API; the parsing
 * rule itself lives in `developer-mode-storage.ts` and is unit-tested there.
 */
export function useDeveloperMode(): [boolean, () => void] {
  const [developerMode, setDeveloperMode] = useState(false);

  useEffect(() => {
    setDeveloperMode(parseDeveloperModeFlag(window.localStorage.getItem(DEVELOPER_MODE_STORAGE_KEY)));
  }, []);

  const toggle = useCallback(() => {
    setDeveloperMode((prev) => {
      const next = !prev;
      window.localStorage.setItem(DEVELOPER_MODE_STORAGE_KEY, serializeDeveloperModeFlag(next));
      return next;
    });
  }, []);

  return [developerMode, toggle];
}
