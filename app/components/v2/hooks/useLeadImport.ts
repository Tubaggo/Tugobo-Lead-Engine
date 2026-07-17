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
  buildDedupeKeySet,
  isDuplicateAgainstKeySet,
  normalizePhoneForDedupe,
  normalizeWebsiteForDedupe,
} from "@/app/lib/lead-dedupe";
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
  /** "hermes" = Sprint C1 autonomous acquisition handoff — merged through the exact same dedupe path. */
  source: "cached" | "google" | "hermes";
  importedAt: number;
};

export type IngestExternalLeadsResult = {
  added: number;
  updated: number;
  skipped: number;
  /**
   * Refresh Persistence Recovery fix — true when the merged pool (including
   * any new leads from this batch) was actually written to
   * `localStorage["imported-leads-v2"]`, or when there was genuinely nothing
   * new to write (empty batch / pure duplicates). False only means the
   * localStorage write itself failed (quota, private mode, unavailable) —
   * the in-memory React state is still updated either way, so the caller
   * must not treat `false` as "nothing happened," only as "not yet durable."
   */
  persisted: boolean;
  /** Founder-safe, non-technical message — set only when `persisted` is false. Never a raw exception. */
  error?: string;
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
  /** Sprint C1 — merges an autonomous acquisition candidate batch through the exact same dedupe/persistence path a manual import uses. */
  ingestExternalLeads: (batch: ScoredLead[], meta: { label: string }) => IngestExternalLeadsResult;
};

/* ── pure dedupe helpers — canonical versions live in app/lib/lead-dedupe.ts (Sprint C1) ── */

const normalizePhoneDedupe = normalizePhoneForDedupe;
const normalizeWebDedupe = normalizeWebsiteForDedupe;

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
      if (isDuplicateAgainstKeySet(inc, keySet)) continue;
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

/**
 * Refresh Persistence Recovery fix — now reports whether the write actually
 * landed. Existing callers that ignore the return value (e.g. `handleImport`)
 * are unaffected; only `ingestExternalLeads` reads it.
 */
function saveImportedLeadsV2(leads: ScoredLead[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(IMPORTED_LEADS_V2_KEY, JSON.stringify(leads));
    return true;
  } catch {
    return false;
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

  /**
   * Sprint C1 — Hermes'in otonom taramada bulduğu aday lead'leri havuza
   * alır. Deliberately reuses `mergeImportBatch` (the exact same duplicate
   * control a manual import goes through) + the same localStorage
   * persistence, and records a "hermes"-sourced history entry. It never
   * touches the manual-import UX state (`lastBatch`/`lastResult`/
   * `lastRequest`) — the Lead Import screen's "last results" view stays
   * whatever the operator last did manually. Fully idempotent: re-ingesting
   * the same batch adds nothing (dedupe) and records no history entry.
   */
  const ingestExternalLeads = useCallback(
    (batch: ScoredLead[], meta: { label: string }): IngestExternalLeadsResult => {
      if (batch.length === 0) return { added: 0, updated: 0, skipped: 0, persisted: true };

      const importTs = Date.now();
      const importSessionId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `hermes-${importTs}`;

      const prev = importedLeadsRef.current;
      const prepared = ensureLeadsCreatedAt(batch, importTs);
      const { nextImported, lastSessionBatch, updatedIds, freshNewLeads } = mergeImportBatch(
        prev,
        prepared,
        importTs,
        importSessionId,
      );

      const skipped = batch.length - lastSessionBatch.length;
      if (freshNewLeads.length === 0 && updatedIds.length === 0) {
        // Nothing new after dedupe — there was nothing to persist, so this is
        // trivially "persisted", not a failure.
        return { added: 0, updated: 0, skipped, persisted: true };
      }

      // Refresh Persistence Recovery fix — the in-memory pool always updates
      // so the founder sees the new leads this session regardless of storage
      // outcome; `persisted` tells the caller whether that update is durable
      // across a refresh. A failed write never clears/replaces existing data
      // (`nextImported` is always a superset of `prev`).
      setImportedLeads(nextImported);
      importedLeadsRef.current = nextImported;
      const persisted = saveImportedLeadsV2(nextImported);
      if (!persisted) {
        return {
          added: freshNewLeads.length,
          updated: updatedIds.length,
          skipped,
          persisted: false,
          error: "Yeni bulunan işletmeler bu tarayıcıda kalıcı olarak kaydedilemedi.",
        };
      }
      saveImportMeta({ hasRun: true });

      const cities = Array.from(new Set(freshNewLeads.map((l) => l.city))).slice(0, 3);
      const entry: ImportHistoryEntry = {
        id: importSessionId,
        city: cities.join(", ") || batch[0]?.city || "—",
        type: meta.label,
        added: freshNewLeads.length,
        updated: updatedIds.length,
        skipped,
        hot: freshNewLeads.filter((l) => l.hotScore >= 70).length,
        source: "hermes",
        importedAt: importTs,
      };
      setImportHistory((prevHistory) => [entry, ...prevHistory].slice(0, 10));

      return { added: freshNewLeads.length, updated: updatedIds.length, skipped, persisted: true };
    },
    [],
  );

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
    ingestExternalLeads,
  };
}
