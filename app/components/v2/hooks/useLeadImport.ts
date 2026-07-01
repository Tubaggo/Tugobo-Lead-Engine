"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { LeadType, ScoredLead } from "@/app/lib/leads";
import {
  dedupeLeads,
  appendLeadActivity,
  scoreLead,
  scoreHot,
  enrichScoredLeadIntelligence,
  getContactQuality,
} from "@/app/lib/leads";
import { leadDedupeKey } from "@/app/lib/generate";
import {
  makePlacesImportSessionKey,
  PLACES_RATE_LIMIT_USER_MESSAGE,
} from "@/app/lib/places-import-session";
import {
  ICP_SEARCH_CONFIGS,
  filterLeadsForTargetAudience,
} from "@/app/lib/places-import";
import {
  type ImportRequest,
  type ImportResult,
  isIcpTargetAudience,
} from "@/app/components/ImportPanel";

// Storage keys — same as Dashboard so both share the same data pool
const IMPORTED_LEADS_V2_KEY = "tugobo-lead-engine:imported-leads-v2";
const LAST_IMPORT_KEY = "tugobo-lead-engine:last-import-v1";
const IMPORT_CACHE_KEY = "tugobo-lead-engine:import-cache-v1";
const IMPORT_META_KEY = "tugobo-lead-engine:import-meta-v1";
const IMPORT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const LEGACY_CREATED_AT_TS = Date.UTC(2024, 0, 1, 0, 0, 0, 0);

/* ── internal types ─────────────────────────────────────────── */

type ImportCacheEntry = {
  importSessionId: string;
  importedAt: number;
  leads: ScoredLead[];
};

type LastImportPayload = {
  batch: ScoredLead[];
  newIds: string[];
  updatedIds: string[];
};

export type ImportHistoryEntry = {
  id: string;
  city: string;
  type: string;
  added: number;
  updated: number;
  skipped: number;
  hot: number;
  source: "cached" | "google";
  importedAt: number;
};

export type UseLeadImportReturn = {
  importedLeads: ScoredLead[];
  lastBatch: ScoredLead[];
  lastNewIds: Set<string>;
  lastResult: ImportResult | null;
  lastRequest: Omit<ImportRequest, "forceGoogleRefresh"> | null;
  importHistory: ImportHistoryEntry[];
  loading: boolean;
  error: string;
  showCacheChoice: boolean;
  handleImport: (req: ImportRequest) => Promise<ImportResult>;
  hasCachedImportResults: (req: Omit<ImportRequest, "forceGoogleRefresh">) => boolean;
};

/* ── pure dedupe helpers (mirror of Dashboard.tsx) ─────────── */

function normalizePhoneDedupe(phone: string): string | null {
  let d = phone.replace(/\D/g, "");
  if (!d) return null;
  while (d.startsWith("00") && d.length > 2) d = d.slice(2);
  if (d.startsWith("90") && d.length > 2) d = d.slice(2);
  return d.length >= 10 ? d : null;
}

function normalizeWebDedupe(web?: string): string | null {
  if (!web?.trim()) return null;
  const h = web
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
  return h || null;
}

function dedupeKeysForLead(lead: ScoredLead): string[] {
  const keys: string[] = [leadDedupeKey(lead.name, lead.city)];
  const pk = normalizePhoneDedupe(lead.phone);
  if (pk) keys.push(`phone:${pk}`);
  const wk = normalizeWebDedupe(lead.website);
  if (wk) keys.push(`web:${wk}`);
  return keys;
}

function buildDedupeKeySet(base: ScoredLead[]): Set<string> {
  const s = new Set<string>();
  for (const l of base) {
    for (const k of dedupeKeysForLead(l)) s.add(k);
  }
  return s;
}

function isDuplicateAgainstSet(lead: ScoredLead, keys: Set<string>): boolean {
  for (const k of dedupeKeysForLead(lead)) {
    if (keys.has(k)) return true;
  }
  return false;
}

type ImportMatch =
  | { kind: "imported"; index: number; lead: ScoredLead }
  | { kind: "seed"; lead: ScoredLead };

function findImportMatch(
  incoming: ScoredLead,
  prevImported: ScoredLead[],
): ImportMatch | null {
  const incPhone = normalizePhoneDedupe(incoming.phone);
  if (incPhone) {
    for (let i = 0; i < prevImported.length; i++) {
      const p = normalizePhoneDedupe(prevImported[i].phone);
      if (p && p === incPhone) return { kind: "imported", index: i, lead: prevImported[i] };
    }
  }
  const incWeb = normalizeWebDedupe(incoming.website);
  if (incWeb) {
    for (let i = 0; i < prevImported.length; i++) {
      const w = normalizeWebDedupe(prevImported[i].website);
      if (w && w === incWeb) return { kind: "imported", index: i, lead: prevImported[i] };
    }
  }
  const nk = leadDedupeKey(incoming.name, incoming.city);
  for (let i = 0; i < prevImported.length; i++) {
    const l = prevImported[i];
    if (leadDedupeKey(l.name, l.city) === nk) return { kind: "imported", index: i, lead: l };
  }
  return null;
}

function upsertScoredFields(
  existing: ScoredLead,
  incoming: ScoredLead,
  importTs: number,
  importSessionId: string,
): ScoredLead {
  const merged = {
    ...existing,
    ...incoming,
    id: existing.id,
    firstImportedAt:
      typeof existing.firstImportedAt === "number" && Number.isFinite(existing.firstImportedAt)
        ? existing.firstImportedAt
        : typeof existing.createdAt === "number" && Number.isFinite(existing.createdAt)
          ? existing.createdAt
          : importTs,
    lastImportedAt: importTs,
    importSessionId,
    createdAt:
      typeof existing.createdAt === "number" && Number.isFinite(existing.createdAt)
        ? existing.createdAt
        : importTs,
  };
  const ls = scoreLead(merged);
  const hs = scoreHot(merged);
  return enrichScoredLeadIntelligence({
    ...merged,
    leadScore: ls.score,
    leadReasons: ls.reasons,
    hotScore: hs.score,
    hotReasons: hs.reasons,
    contactQuality: getContactQuality(merged.phone),
  });
}

function dedupeScoredLeads(leads: ScoredLead[]): ScoredLead[] {
  const deduped = dedupeLeads(leads) as ScoredLead[];
  const idSeen = new Set<string>();
  const out: ScoredLead[] = [];
  for (const lead of deduped) {
    const idKey = lead.id?.trim();
    if (idKey && idSeen.has(idKey)) continue;
    if (idKey) idSeen.add(idKey);
    out.push(lead);
  }
  return out;
}

function mergeImportBatch(
  prevImported: ScoredLead[],
  batch: ScoredLead[],
  importTs: number,
  importSessionId: string,
): {
  nextImported: ScoredLead[];
  lastSessionBatch: ScoredLead[];
  newIds: string[];
  updatedIds: string[];
  freshNewLeads: ScoredLead[];
} {
  const dedupedBatch = dedupeScoredLeads(batch);
  let imported = [...prevImported];
  const newIds: string[] = [];
  const updatedIds: string[] = [];
  const lastSessionBatch: ScoredLead[] = [];
  const freshNewLeads: ScoredLead[] = [];
  const sessionSeenLeadIds = new Set<string>();

  const pushSessionLead = (lead: ScoredLead) => {
    if (!lead.id || sessionSeenLeadIds.has(lead.id)) return;
    sessionSeenLeadIds.add(lead.id);
    lastSessionBatch.push(lead);
  };

  const pushNew = (inc: ScoredLead) => {
    const first = inc.firstImportedAt ?? importTs;
    const timeline = appendLeadActivity(
      inc.activityTimeline,
      "lead_imported",
      "Lead içe aktarıldı",
    );
    const novel: ScoredLead = {
      ...inc,
      firstImportedAt: first,
      lastImportedAt: importTs,
      importSessionId,
      createdAt:
        typeof inc.createdAt === "number" && Number.isFinite(inc.createdAt)
          ? inc.createdAt
          : importTs,
      activityTimeline: timeline,
    };
    imported = [novel, ...imported];
    newIds.push(novel.id);
    pushSessionLead(novel);
    freshNewLeads.push(novel);
  };

  for (const inc of dedupedBatch) {
    const m = findImportMatch(inc, imported);
    if (m?.kind === "imported") {
      const merged = upsertScoredFields(m.lead, inc, importTs, importSessionId);
      const copy = [...imported];
      copy[m.index] = merged;
      imported = copy;
      updatedIds.push(merged.id);
      pushSessionLead(merged);
    } else {
      const keySet = buildDedupeKeySet(imported);
      if (isDuplicateAgainstSet(inc, keySet)) continue;
      pushNew(inc);
    }
  }

  return { nextImported: imported, lastSessionBatch, newIds, updatedIds, freshNewLeads };
}

/* ── localStorage helpers ───────────────────────────────────── */

function ensureLeadsCreatedAt(leads: ScoredLead[], fallbackTs: number): ScoredLead[] {
  return leads.map((l) => {
    if (typeof l.createdAt === "number" && Number.isFinite(l.createdAt)) return l;
    return { ...l, createdAt: fallbackTs };
  });
}

function loadImportedLeadsV2(): ScoredLead[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(IMPORTED_LEADS_V2_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? ensureLeadsCreatedAt(parsed as ScoredLead[], LEGACY_CREATED_AT_TS)
        : [];
    }
  } catch {
    // ignore
  }
  return [];
}

function saveImportedLeadsV2(leads: ScoredLead[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(IMPORTED_LEADS_V2_KEY, JSON.stringify(leads));
  } catch {
    // ignore
  }
}

function loadImportCache(): Record<string, ImportCacheEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(IMPORT_CACHE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw);
    return typeof p === "object" && p !== null && !Array.isArray(p)
      ? (p as Record<string, ImportCacheEntry>)
      : {};
  } catch {
    return {};
  }
}

function saveImportCache(cache: Record<string, ImportCacheEntry>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(IMPORT_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

function loadLastImportPayload(): LastImportPayload {
  if (typeof window === "undefined") return { batch: [], newIds: [], updatedIds: [] };
  try {
    const raw = window.localStorage.getItem(LAST_IMPORT_KEY);
    if (!raw) return { batch: [], newIds: [], updatedIds: [] };
    const p = JSON.parse(raw) as {
      batch?: ScoredLead[];
      newIds?: string[];
      updatedIds?: string[];
    };
    return {
      batch: Array.isArray(p.batch)
        ? ensureLeadsCreatedAt(p.batch, LEGACY_CREATED_AT_TS)
        : [],
      newIds: Array.isArray(p.newIds) ? p.newIds : [],
      updatedIds: Array.isArray(p.updatedIds) ? p.updatedIds : [],
    };
  } catch {
    return { batch: [], newIds: [], updatedIds: [] };
  }
}

function saveLastImportPayload(payload: LastImportPayload) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_IMPORT_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function saveImportMeta(meta: { hasRun: boolean }) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(IMPORT_META_KEY, JSON.stringify(meta));
  } catch {
    // ignore
  }
}

/* ── hook ───────────────────────────────────────────────────── */

export function useLeadImport(): UseLeadImportReturn {
  const [importedLeads, setImportedLeads] = useState<ScoredLead[]>([]);
  const importedLeadsRef = useRef<ScoredLead[]>([]);
  const [lastBatch, setLastBatch] = useState<ScoredLead[]>([]);
  const [lastNewIds, setLastNewIds] = useState<Set<string>>(new Set());
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);
  const [lastRequest, setLastRequest] = useState<Omit<ImportRequest, "forceGoogleRefresh"> | null>(null);
  const [importHistory, setImportHistory] = useState<ImportHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCacheChoice, setShowCacheChoice] = useState(false);

  useEffect(() => {
    const loaded = loadImportedLeadsV2();
    setImportedLeads(loaded);
    importedLeadsRef.current = loaded;
    const payload = loadLastImportPayload();
    if (payload.batch.length > 0) {
      setLastBatch(payload.batch);
    }
  }, []);

  const hasCachedImportResults = useCallback(
    (req: Omit<ImportRequest, "forceGoogleRefresh">) => {
      if (isIcpTargetAudience(req.type as string)) return false;
      const cacheKey = makePlacesImportSessionKey(
        req.city,
        req.type as LeadType,
        req.source,
      );
      const cache = loadImportCache();
      const hit = cache[cacheKey];
      if (!hit || !Array.isArray(hit.leads) || hit.leads.length === 0) return false;
      if (typeof hit.importedAt !== "number") return false;
      return Date.now() - hit.importedAt <= IMPORT_CACHE_TTL_MS;
    },
    [],
  );

  const handleImport = useCallback(async (req: ImportRequest): Promise<ImportResult> => {
    setLoading(true);
    setError("");
    setShowCacheChoice(false);

    let batch: ScoredLead[] = [];
    let source: "cached" | "google" = "google";
    let importNoticeKey: "import_places_recent_cache_note" | undefined;
    let importRateLimitHintKey: "import_places_rate_limit_user" | undefined;

    try {
      if (isIcpTargetAudience(req.type as string)) {
        const allResults: ScoredLead[] = [];
        for (const config of ICP_SEARCH_CONFIGS) {
          try {
            const res = await fetch("/api/import-leads", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                city: req.city,
                type: config.type,
                source: req.source,
                forceGoogleRefresh: Boolean(req.forceGoogleRefresh),
                icpSearchTerm: config.searchTerm,
              }),
            });
            if (!res.ok) continue;
            const data = (await res.json()) as { leads?: ScoredLead[] };
            allResults.push(...(data.leads ?? []));
          } catch {
            continue;
          }
        }
        const seenIds = new Set<string>();
        for (const lead of allResults) {
          if (!seenIds.has(lead.id)) {
            seenIds.add(lead.id);
            batch.push(lead);
          }
        }
        batch = filterLeadsForTargetAudience(req.type as string, batch);
        source = "google";
      } else {
        const cacheKey = makePlacesImportSessionKey(
          req.city,
          req.type as LeadType,
          req.source,
        );
        const cache = loadImportCache();

        if (!req.forceGoogleRefresh) {
          const hit = cache[cacheKey];
          if (
            hit &&
            Array.isArray(hit.leads) &&
            hit.leads.length > 0 &&
            typeof hit.importedAt === "number" &&
            Date.now() - hit.importedAt <= IMPORT_CACHE_TTL_MS
          ) {
            batch = hit.leads;
            source = "cached";
          }
        }

        if (batch.length === 0 || req.forceGoogleRefresh) {
          const res = await fetch("/api/import-leads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              city: req.city,
              type: req.type,
              source: req.source,
              forceGoogleRefresh: Boolean(req.forceGoogleRefresh),
            }),
          });
          const data = (await res.json()) as {
            leads?: ScoredLead[];
            error?: string;
            fromPlacesMemoryCache?: boolean;
            refreshCooldownActive?: boolean;
          };

          if (!res.ok && res.status === 429) {
            const staleHit = cache[cacheKey];
            if (staleHit && Array.isArray(staleHit.leads) && staleHit.leads.length > 0) {
              batch = staleHit.leads;
              source = "cached";
              importNoticeKey = "import_places_recent_cache_note";
              importRateLimitHintKey = "import_places_rate_limit_user";
            } else {
              throw new Error(
                typeof data.error === "string" && data.error.trim()
                  ? data.error
                  : PLACES_RATE_LIMIT_USER_MESSAGE,
              );
            }
          } else if (!res.ok) {
            throw new Error(data.error ?? `Import başarısız (${res.status})`);
          } else {
            batch = data.leads ?? [];
            if (data.fromPlacesMemoryCache && batch.length > 0) {
              importNoticeKey = "import_places_recent_cache_note";
              source = "cached";
            } else {
              source = "google";
            }
            if (batch.length > 0) {
              const now = Date.now();
              saveImportCache({
                ...cache,
                [cacheKey]: {
                  importSessionId:
                    typeof crypto !== "undefined" && "randomUUID" in crypto
                      ? crypto.randomUUID()
                      : `cache-${now}`,
                  importedAt: now,
                  leads: batch,
                },
              });
            }
          }
        }
      }

      const importTs = Date.now();
      batch = ensureLeadsCreatedAt(batch, importTs);
      saveImportMeta({ hasRun: true });

      const importSessionId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `imp-${importTs}`;

      const prev = importedLeadsRef.current;
      const { nextImported, lastSessionBatch, newIds, updatedIds, freshNewLeads } =
        mergeImportBatch(prev, batch, importTs, importSessionId);

      setImportedLeads(nextImported);
      importedLeadsRef.current = nextImported;
      saveImportedLeadsV2(nextImported);
      setLastBatch(lastSessionBatch);
      setLastNewIds(new Set(newIds));
      saveLastImportPayload({ batch: lastSessionBatch, newIds, updatedIds });
      setLastRequest({ city: req.city, type: req.type, source: req.source });

      const hot = freshNewLeads.filter((l) => l.hotScore >= 70).length;
      const skipped = batch.length - lastSessionBatch.length;
      const result: ImportResult = {
        added: freshNewLeads.length,
        updated: updatedIds.length,
        hot,
        skipped,
        source,
        importNoticeKey,
        importRateLimitHintKey,
      };
      setLastResult(result);

      const entry: ImportHistoryEntry = {
        id: importSessionId,
        city: req.city,
        type: String(req.type),
        added: freshNewLeads.length,
        updated: updatedIds.length,
        skipped,
        hot,
        source,
        importedAt: importTs,
      };
      setImportHistory((prev) => [entry, ...prev].slice(0, 10));

      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import başarısız oldu.";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    importedLeads,
    lastBatch,
    lastNewIds,
    lastResult,
    lastRequest,
    importHistory,
    loading,
    error,
    showCacheChoice,
    handleImport,
    hasCachedImportResults,
  };
}
