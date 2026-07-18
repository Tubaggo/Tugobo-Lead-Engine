import { TUGOBO_TARGET_MARKET_CLUSTERS } from "../../../lib/hermes-tugobo-target-market-clusters.ts";

/**
 * TUGOBO Target Market Eligibility (Target Market Cluster Coverage Fix).
 *
 * KAPI 1 of the two-gate targeting model: is this business even in an
 * approved TUGOBO tourism market at all? Checked BEFORE
 * `computeTugoboNeedAssessment` (KAPI 2, digital-demand signals) — a
 * business outside every cluster never reaches the need gate, no matter how
 * strong its digital signals are.
 *
 * Reads `TUGOBO_TARGET_MARKET_CLUSTERS` directly
 * (`hermes-tugobo-target-market-clusters.ts`) — the exact same source
 * `TUGOBO_NEED_ACQUISITION_REGIONS` derives its acquisition search points
 * from. Never a second, hand-maintained locality list — that conflation
 * (search catalog vs. eligibility coverage) is exactly what wrongly excluded
 * a real Uçhisar (Kapadokya) business in the prior sprint.
 *
 * Coverage modes (per cluster, see the cluster file for the full rationale):
 *  - `"province-wide"` — the bare province name (city text OR a verified
 *    `province` field) is also eligible, even for a locality this catalog
 *    has never explicitly named (e.g. "Dalaman" inside Muğla province).
 *  - `"locality-only"` — only named search markets/aliases are eligible;
 *    the province's own city-center is never auto-eligible.
 *
 * Matching priority (highest confidence first):
 *  1. a persisted acquisition source region id (forward-compatible; no
 *     current lead schema persists this field, confirmed in discovery);
 *  2. the lead's own verified `city` field against every cluster's alias
 *     set (search markets + eligibility aliases +, for province-wide
 *     clusters, the bare province name) — the most reliable signal
 *     available today;
 *  3. a verified `province` field (forward-compatible; not on today's Lead
 *     schema) matched against a province-wide cluster's `province`;
 *  4. a catalog alias found as a whole token inside a normalized address
 *     string;
 *  5. the business name — NEVER produces active eligibility. A name-based
 *     hint alone yields `eligible: false, confidence: "inferred"` — evidence
 *     worth surfacing, never a decision. This is a deliberate behavior
 *     change from the prior sprint (see the sprint's own root-cause note:
 *     business-name-only matching must never decide active queue
 *     membership) and, as a side effect, automatically gives a verified
 *     out-of-scope city (e.g. İstanbul) precedence over a misleading brand
 *     name (e.g. "Bodrum Hotel İstanbul") without any extra special case.
 *
 * Every match is a whole-token comparison, never a raw substring check —
 * "Riverside" must never match the catalog town "Side".
 *
 * Unknown location → `eligible: false, confidence: "unknown"` — never
 * deleted, never marked lost; simply not shown in the active Founder queue
 * (see `hermes-working-queue-adapter.ts`).
 *
 * Deliberately dependency-free (no "@/" imports, no React, no browser API)
 * so it runs under plain `node --test` — the same convention every v8
 * adapter in this codebase follows.
 */

export type TargetMarketConfidence = "verified" | "inferred" | "unknown";

export type TargetMarketEligibility = {
  eligible: boolean;
  confidence: TargetMarketConfidence;
  /** The specific search-market id matched, or the cluster's own id when only a generic province-wide match applies (no specific named locality). */
  matchedMarketId: string | null;
  /** The specific locality name matched, or the matched province name for a generic province-wide match. */
  matchedMarketName: string | null;
  /** The cluster's founder-facing label (e.g. "Kapadokya") — paired with `matchedMarketName` for the two-gate founder sentence. */
  matchedClusterName: string | null;
  reason: string;
};

/**
 * Structural subset any real `ScoredLead`/`HermesMission` satisfies.
 * `address`, `province`, and `sourceRegionId` are supported for forward
 * compatibility — no current lead schema persists any of the three
 * (confirmed in discovery); real matches today happen almost entirely
 * through `city`.
 */
export type TargetMarketLeadLike = {
  name: string;
  city?: string | null;
  address?: string | null;
  /** A verified administrative province, if this lead ever carries one (not on today's Lead schema). */
  province?: string | null;
  /** A persisted acquisition source region id, if this lead ever carries one. */
  sourceRegionId?: string | null;
};

const TURKISH_FOLD: Record<string, string> = {
  ç: "c",
  Ç: "C",
  ğ: "g",
  Ğ: "G",
  ı: "i",
  İ: "I",
  ö: "o",
  Ö: "O",
  ş: "s",
  Ş: "S",
  ü: "u",
  Ü: "U",
};

/** Folds Turkish-specific letters to their ASCII equivalent BEFORE lowercasing — avoids relying on locale-sensitive `toLowerCase()` behavior for İ/ı. */
function foldTurkish(input: string): string {
  const folded = input.replace(/[çÇğĞıİöÖşŞüÜ]/g, (ch) => TURKISH_FOLD[ch] ?? ch);
  return folded.toLowerCase();
}

/** Splits a normalized string into clean alphanumeric tokens — never a raw substring match. */
function tokensOf(input: string): string[] {
  return foldTurkish(input)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

type AliasEntry = {
  marketId: string;
  marketName: string;
  clusterName: string;
};

let aliasMapCache: Map<string, AliasEntry> | null = null;
let provinceWideClustersCache: Array<{ province: string; normalizedProvince: string; clusterId: string; clusterName: string }> | null = null;
let sourceRegionIdCache: Map<string, AliasEntry> | null = null;

/**
 * Builds the flat alias -> match lookup once. Search-market-specific
 * entries are inserted first so they always win over the generic
 * province-wide fallback entry when both normalize to the same key (e.g.
 * "Nevşehir" resolves to the specific `nevsehir-hotel` search point, not a
 * generic cluster-level attribution).
 */
function aliasMap(): Map<string, AliasEntry> {
  if (aliasMapCache) return aliasMapCache;
  const map = new Map<string, AliasEntry>();
  for (const c of TUGOBO_TARGET_MARKET_CLUSTERS) {
    for (const m of c.searchMarkets) {
      const key = foldTurkish(m.city);
      if (!map.has(key)) map.set(key, { marketId: m.id, marketName: m.city, clusterName: c.name });
    }
    for (const alias of c.eligibilityAliases) {
      const key = foldTurkish(alias);
      if (!map.has(key)) map.set(key, { marketId: c.id, marketName: alias, clusterName: c.name });
    }
    if (c.coverageMode === "province-wide") {
      const key = foldTurkish(c.province);
      if (!map.has(key)) map.set(key, { marketId: c.id, marketName: c.province, clusterName: c.name });
    }
  }
  aliasMapCache = map;
  return map;
}

function provinceWideClusters() {
  if (provinceWideClustersCache) return provinceWideClustersCache;
  provinceWideClustersCache = TUGOBO_TARGET_MARKET_CLUSTERS.filter((c) => c.coverageMode === "province-wide").map(
    (c) => ({ province: c.province, normalizedProvince: foldTurkish(c.province), clusterId: c.id, clusterName: c.name }),
  );
  return provinceWideClustersCache;
}

function sourceRegionIdMap(): Map<string, AliasEntry> {
  if (sourceRegionIdCache) return sourceRegionIdCache;
  const map = new Map<string, AliasEntry>();
  for (const c of TUGOBO_TARGET_MARKET_CLUSTERS) {
    for (const m of c.searchMarkets) {
      map.set(m.id, { marketId: m.id, marketName: m.city, clusterName: c.name });
    }
  }
  sourceRegionIdCache = map;
  return map;
}

/** First alias entry whose key appears as an exact token in `text`. */
function findByToken(text: string): AliasEntry | null {
  const tokens = new Set(tokensOf(text));
  const map = aliasMap();
  for (const [key, entry] of map) {
    if (tokens.has(key)) return entry;
  }
  return null;
}

const REASON = {
  regionId: "Acquisition sourcing bölge kaydı ile doğrulandı.",
  city: (name: string) => `Doğrulanmış şehir alanı "${name}" onaylı TUGOBO hedef pazarı ile eşleşti.`,
  provinceWide: (province: string, cluster: string) =>
    `Doğrulanmış il alanı "${province}", ${cluster} hedef pazar kümesinin geneline dahil.`,
  address: (name: string) => `Adres içinde "${name}" onaylı TUGOBO hedef pazarı olarak tespit edildi.`,
  nameInferred: (name: string) =>
    `İşletme adında "${name}" geçiyor, fakat doğrulanmış bir konum sinyali yok — aktif kuyruğa girmez.`,
  unknown: "Konum doğrulanamadı — onaylı TUGOBO hedef pazarı dışı kabul edildi.",
} as const;

/**
 * Determines whether a business is inside an approved TUGOBO target market
 * cluster. Pure — reads only the fields on `lead`, never a segment/star
 * score, never an external call.
 */
export function computeTugoboTargetMarketEligibility(lead: TargetMarketLeadLike): TargetMarketEligibility {
  // Priority 1 — persisted acquisition source region id.
  if (lead.sourceRegionId) {
    const match = sourceRegionIdMap().get(lead.sourceRegionId);
    if (match) {
      return {
        eligible: true,
        confidence: "verified",
        matchedMarketId: match.marketId,
        matchedMarketName: match.marketName,
        matchedClusterName: match.clusterName,
        reason: REASON.regionId,
      };
    }
  }

  // Priority 2 — verified city field against every cluster's alias set.
  if (lead.city?.trim()) {
    const match = findByToken(lead.city);
    if (match) {
      return {
        eligible: true,
        confidence: "verified",
        matchedMarketId: match.marketId,
        matchedMarketName: match.marketName,
        matchedClusterName: match.clusterName,
        reason: REASON.city(match.marketName),
      };
    }
  }

  // Priority 3 — a verified province field against a province-wide cluster.
  if (lead.province?.trim()) {
    const normalizedProvince = foldTurkish(lead.province);
    const match = provinceWideClusters().find((c) => c.normalizedProvince === normalizedProvince);
    if (match) {
      return {
        eligible: true,
        confidence: "verified",
        matchedMarketId: match.clusterId,
        matchedMarketName: match.province,
        matchedClusterName: match.clusterName,
        reason: REASON.provinceWide(match.province, match.clusterName),
      };
    }
  }

  // Priority 4 — a catalog alias found as a whole token in a normalized address.
  if (lead.address?.trim()) {
    const match = findByToken(lead.address);
    if (match) {
      return {
        eligible: true,
        confidence: "verified",
        matchedMarketId: match.marketId,
        matchedMarketName: match.marketName,
        matchedClusterName: match.clusterName,
        reason: REASON.address(match.marketName),
      };
    }
  }

  // Priority 5 — business name. Never active eligibility, per this sprint's
  // explicit behavior change — a name-based hint is evidence, not a decision.
  if (lead.name?.trim()) {
    const match = findByToken(lead.name);
    if (match) {
      return {
        eligible: false,
        confidence: "inferred",
        matchedMarketId: null,
        matchedMarketName: null,
        matchedClusterName: null,
        reason: REASON.nameInferred(match.marketName),
      };
    }
  }

  return {
    eligible: false,
    confidence: "unknown",
    matchedMarketId: null,
    matchedMarketName: null,
    matchedClusterName: null,
    reason: REASON.unknown,
  };
}

/**
 * The "Pazar uygunluğu:" line of the two-gate founder explanation — paired
 * with `tugobo-need-assessment.ts`'s `buildTugoboNeedFounderLine` (the
 * "TUGOBO ihtiyacı:" half) by the Working Queue adapter. Never used alone as
 * "seçildi çünkü <city>" — market membership is a gate, not a reason.
 *
 * A specific matched locality reads as "Uçhisar, Kapadokya hedef pazar
 * kümesi içinde." A generic province-wide match with no specific named
 * locality (matchedMarketName === matchedClusterName's province) reads as
 * the single, non-redundant "Muğla hedef pazar kümesi içinde."
 */
export function buildTargetMarketFounderLine(eligibility: TargetMarketEligibility): string {
  if (!eligibility.eligible || !eligibility.matchedMarketName || !eligibility.matchedClusterName) {
    return "Pazar uygunluğu: onaylı TUGOBO hedef pazarı dışında.";
  }
  if (eligibility.matchedMarketName === eligibility.matchedClusterName) {
    return `Pazar uygunluğu: ${eligibility.matchedMarketName} hedef pazar kümesi içinde.`;
  }
  return `Pazar uygunluğu: ${eligibility.matchedMarketName}, ${eligibility.matchedClusterName} hedef pazar kümesi içinde.`;
}
