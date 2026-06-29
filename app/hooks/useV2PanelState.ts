"use client";

import { useState, useEffect, useCallback } from "react";

const V2_PANEL_STORAGE_KEY = "tugobo-lead-engine:v2-panel-v1";

// ── Exported types ─────────────────────────────────────────────────────────

export type V2CFResult = {
  bestContactType: string;
  bestContactValue: string;
  confidence: string;
  foundPhones: string[];
  foundWhatsapp: string[];
  foundInstagram: string[];
  source: string;
  reason: string;
};

export type V2ReenrichSummary = {
  websiteFound: boolean;
  whatsappFound: boolean;
  instagramFound: boolean;
  reservationFound: boolean;
  websiteConfidenceScore: number | null;
  opportunityScore: number | null;
  opportunityTier: string | null;
  timestamp: number;
};

export type V2PanelEntry = {
  generatedMessage: string | null;
  generatedMessageAt: number | null;
  cfResult: V2CFResult | null;
  cfResultAt: number | null;
  reenrichSummary: V2ReenrichSummary | null;
};

// ── Internal storage helpers ───────────────────────────────────────────────

const DEFAULT_PANEL_ENTRY: V2PanelEntry = {
  generatedMessage: null,
  generatedMessageAt: null,
  cfResult: null,
  cfResultAt: null,
  reenrichSummary: null,
};

type V2PanelMap = Record<string, V2PanelEntry>;

export function loadV2PanelEntry(leadId: string): V2PanelEntry {
  if (typeof window === "undefined") return { ...DEFAULT_PANEL_ENTRY };
  try {
    const raw = window.localStorage.getItem(V2_PANEL_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PANEL_ENTRY };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_PANEL_ENTRY };
    const entry = parsed[leadId];
    if (!entry || typeof entry !== "object") return { ...DEFAULT_PANEL_ENTRY };
    const e = entry as Record<string, unknown>;
    return {
      generatedMessage: typeof e.generatedMessage === "string" ? e.generatedMessage : null,
      generatedMessageAt: typeof e.generatedMessageAt === "number" ? e.generatedMessageAt : null,
      cfResult: e.cfResult && typeof e.cfResult === "object" ? (e.cfResult as V2CFResult) : null,
      cfResultAt: typeof e.cfResultAt === "number" ? e.cfResultAt : null,
      reenrichSummary: e.reenrichSummary && typeof e.reenrichSummary === "object" ? (e.reenrichSummary as V2ReenrichSummary) : null,
    };
  } catch {
    return { ...DEFAULT_PANEL_ENTRY };
  }
}

function savePanelMap(map: V2PanelMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(V2_PANEL_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

function loadPanelMap(): V2PanelMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(V2_PANEL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as V2PanelMap) : {};
  } catch {
    return {};
  }
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useV2PanelState(leadId: string) {
  const [panelMap, setPanelMap] = useState<V2PanelMap>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setPanelMap(loadPanelMap());
    setMounted(true);
  }, []);

  const patch = useCallback((id: string, updates: Partial<V2PanelEntry>) => {
    setPanelMap((prev) => {
      const current = prev[id] ?? DEFAULT_PANEL_ENTRY;
      const next: V2PanelMap = {
        ...prev,
        [id]: { ...DEFAULT_PANEL_ENTRY, ...current, ...updates },
      };
      savePanelMap(next);
      return next;
    });
  }, []);

  const saveGeneratedMessage = useCallback(
    (msg: string) => {
      patch(leadId, { generatedMessage: msg, generatedMessageAt: Date.now() });
    },
    [leadId, patch],
  );

  const saveCfResult = useCallback(
    (result: V2CFResult) => {
      patch(leadId, { cfResult: result, cfResultAt: Date.now() });
    },
    [leadId, patch],
  );

  const saveReenrichSummary = useCallback(
    (summary: V2ReenrichSummary) => {
      patch(leadId, { reenrichSummary: summary });
    },
    [leadId, patch],
  );

  const entry: V2PanelEntry = mounted
    ? (panelMap[leadId] ?? DEFAULT_PANEL_ENTRY)
    : DEFAULT_PANEL_ENTRY;

  return {
    mounted,
    entry,
    saveGeneratedMessage,
    saveCfResult,
    saveReenrichSummary,
  };
}
