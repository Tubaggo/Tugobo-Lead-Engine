import {
  ACQUISITION_LEAD_TYPES,
  DEFAULT_ACQUISITION_POLICY,
  POLICY_HARD_LIMITS,
  type AcquisitionLeadType,
  type AcquisitionMode,
  type AcquisitionPolicy,
  type AcquisitionRegion,
} from "./hermes-autonomous-acquisition-policy.ts";
import { TURKEY_ACQUISITION_REGIONS } from "./hermes-turkey-acquisition-regions.ts";
import { TUGOBO_NEED_ACQUISITION_REGIONS } from "./hermes-tugobo-need-acquisition-regions.ts";

/**
 * Hermes Acquisition Config (Sprint C1 — Scope 2).
 *
 * Turns raw environment values into a validated `AcquisitionPolicy` +
 * `AcquisitionRegion[]`. Pure over an injected env record so tests never
 * touch `process.env`; the routes pass `process.env` in.
 *
 * Safety rules implemented here:
 *  - every number is parsed defensively and clamped into
 *    `POLICY_HARD_LIMITS` — a broken value falls back to the safe default;
 *  - an invalid `HERMES_ACQUISITION_REGIONS_JSON` never half-loads: it
 *    produces a `configErrors` entry, which the eligibility check treats as
 *    a hard block;
 *  - unknown region fields are ignored (strict subset parse);
 *  - `HERMES_ACQUISITION_CRON_SECRET` is deliberately NOT part of this
 *    module's output — the run route reads it directly and it never enters
 *    any payload, log, or registry record.
 */

export type AcquisitionEnv = Record<string, string | undefined>;

export type AcquisitionRegionScope = "turkey" | "tugobo-need" | "custom";

export type AcquisitionConfig = {
  policy: AcquisitionPolicy;
  regions: AcquisitionRegion[];
  /** Developer-facing (Turkish) validation notes. Non-empty ⇒ acquisition is blocked. */
  configErrors: string[];
  /**
   * Strict Target Market Allowlist fix — exposed so the client-side Founder
   * Home queue can gate its strict market-eligibility filter on the exact
   * same scope the server is actually running, via the existing
   * `/api/hermes/acquisition/status` bridge. Never a second config system.
   */
  regionScope: AcquisitionRegionScope;
};

const ENV_KEYS = {
  enabled: "HERMES_AUTONOMOUS_ACQUISITION_ENABLED",
  mode: "HERMES_AUTONOMOUS_ACQUISITION_MODE",
  dryRun: "HERMES_ACQUISITION_DRY_RUN",
  dailyLeadLimit: "HERMES_ACQUISITION_DAILY_LEAD_LIMIT",
  dailyRequestLimit: "HERMES_ACQUISITION_DAILY_REQUEST_LIMIT",
  maxRegionsPerRun: "HERMES_ACQUISITION_MAX_REGIONS_PER_RUN",
  maxResultsPerRegion: "HERMES_ACQUISITION_MAX_RESULTS_PER_REGION",
  maxMissionsPerRun: "HERMES_ACQUISITION_MAX_MISSIONS_PER_RUN",
  minOpportunityScore: "HERMES_ACQUISITION_MIN_OPPORTUNITY_SCORE",
  regionsJson: "HERMES_ACQUISITION_REGIONS_JSON",
  regionScope: "HERMES_ACQUISITION_REGION_SCOPE",
} as const;

/**
 * `turkey` → the built-in 81-province catalog. `tugobo-need` → the built-in
 * TUGOBO-need-focused locality catalog (resort/tourism markets sourced
 * first, İstanbul included but last). Either way
 * `HERMES_ACQUISITION_REGIONS_JSON` is ignored. `custom` → the existing
 * JSON-region behavior, unchanged. Unset or any unrecognized value all
 * resolve to `"custom"` — the pre-existing backward-compatible behavior —
 * so a typo can never silently widen the scan.
 */
function resolveRegionScope(raw: string | undefined): AcquisitionRegionScope {
  const v = raw?.trim().toLowerCase();
  if (v === "turkey") return "turkey";
  if (v === "tugobo-need") return "tugobo-need";
  return "custom";
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return fallback;
}

function parseIntClamped(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function parseMode(raw: string | undefined): AcquisitionMode {
  const v = raw?.trim().toLowerCase();
  if (v === "manual_safe" || v === "scheduled_safe" || v === "disabled") return v;
  return "disabled";
}

function isLeadType(v: unknown): v is AcquisitionLeadType {
  return typeof v === "string" && (ACQUISITION_LEAD_TYPES as readonly string[]).includes(v);
}

/**
 * Strict subset parse of one region entry. Returns null (→ configError) for
 * a structurally invalid entry; unknown fields are ignored; numbers are
 * clamped into safe maxima.
 */
function parseRegion(raw: unknown, index: number, errors: string[]): AcquisitionRegion | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    errors.push(`Bölge ${index + 1}: geçersiz kayıt biçimi.`);
    return null;
  }
  const r = raw as Record<string, unknown>;

  const id = typeof r.id === "string" ? r.id.trim() : "";
  const city = typeof r.city === "string" ? r.city.trim() : "";
  if (!id || !city) {
    errors.push(`Bölge ${index + 1}: id ve city zorunlu.`);
    return null;
  }
  if (!isLeadType(r.leadType)) {
    errors.push(`Bölge ${index + 1} (${city}): leadType geçersiz.`);
    return null;
  }

  const priorityRaw = typeof r.priority === "number" && Number.isFinite(r.priority) ? r.priority : 99;
  const maxResultsRaw =
    typeof r.maxResultsPerRun === "number" && Number.isFinite(r.maxResultsPerRun)
      ? r.maxResultsPerRun
      : DEFAULT_ACQUISITION_POLICY.maxResultsPerRegion;
  const cooldownRaw =
    typeof r.cooldownHours === "number" && Number.isFinite(r.cooldownHours)
      ? r.cooldownHours
      : DEFAULT_ACQUISITION_POLICY.cooldownHours;

  return {
    id,
    city,
    country: typeof r.country === "string" && r.country.trim() ? r.country.trim() : "TR",
    enabled: r.enabled !== false,
    priority: Math.min(999, Math.max(0, Math.trunc(priorityRaw))),
    maxResultsPerRun: Math.min(
      POLICY_HARD_LIMITS.maxResultsPerRegion,
      Math.max(1, Math.trunc(maxResultsRaw)),
    ),
    leadType: r.leadType,
    icpSearchTerm:
      typeof r.icpSearchTerm === "string" && r.icpSearchTerm.trim() ? r.icpSearchTerm.trim() : undefined,
    lastRunAt: null,
    cooldownHours: Math.min(
      POLICY_HARD_LIMITS.cooldownHoursMax,
      Math.max(POLICY_HARD_LIMITS.cooldownHoursMin, Math.trunc(cooldownRaw)),
    ),
  };
}

function parseRegions(raw: string | undefined, errors: string[]): AcquisitionRegion[] {
  if (raw === undefined || raw.trim() === "") return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    errors.push("Bölge yapılandırması çözümlenemedi (geçersiz JSON).");
    return [];
  }
  if (!Array.isArray(parsed)) {
    errors.push("Bölge yapılandırması bir liste olmalı.");
    return [];
  }

  const regions: AcquisitionRegion[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < parsed.length; i += 1) {
    const region = parseRegion(parsed[i], i, errors);
    if (!region) continue;
    if (seenIds.has(region.id)) {
      errors.push(`Bölge "${region.id}" birden fazla kez tanımlanmış.`);
      continue;
    }
    seenIds.add(region.id);
    regions.push(region);
  }
  return regions;
}

export function loadAcquisitionConfigFromEnv(env: AcquisitionEnv): AcquisitionConfig {
  const errors: string[] = [];
  const d = DEFAULT_ACQUISITION_POLICY;

  const enabled = parseBool(env[ENV_KEYS.enabled], d.enabled);
  const mode = parseMode(env[ENV_KEYS.mode]);
  // Mismatched flags (enabled=true, mode=disabled or vice versa) resolve to
  // the safer interpretation and are surfaced as a config error.
  if (enabled && mode === "disabled") {
    errors.push("Etkinleştirme bayrağı açık ama mod kapalı — tarama devre dışı kaldı.");
  }

  const regionScope = resolveRegionScope(env[ENV_KEYS.regionScope]);
  const regions =
    regionScope === "turkey"
      ? TURKEY_ACQUISITION_REGIONS.map((r) => ({ ...r }))
      : regionScope === "tugobo-need"
        ? TUGOBO_NEED_ACQUISITION_REGIONS.map((r) => ({ ...r }))
        : parseRegions(env[ENV_KEYS.regionsJson], errors);
  if ((enabled && mode !== "disabled") && regions.length === 0 && errors.length === 0) {
    errors.push("Tarama etkin ama hiç bölge tanımlanmadı.");
  }

  const policy: AcquisitionPolicy = {
    enabled: enabled && mode !== "disabled",
    mode,
    dailyLeadLimit: parseIntClamped(
      env[ENV_KEYS.dailyLeadLimit],
      d.dailyLeadLimit,
      1,
      POLICY_HARD_LIMITS.dailyLeadLimit,
    ),
    dailyExternalRequestLimit: parseIntClamped(
      env[ENV_KEYS.dailyRequestLimit],
      d.dailyExternalRequestLimit,
      1,
      POLICY_HARD_LIMITS.dailyExternalRequestLimit,
    ),
    maxRegionsPerRun: parseIntClamped(
      env[ENV_KEYS.maxRegionsPerRun],
      d.maxRegionsPerRun,
      1,
      POLICY_HARD_LIMITS.maxRegionsPerRun,
    ),
    maxResultsPerRegion: parseIntClamped(
      env[ENV_KEYS.maxResultsPerRegion],
      d.maxResultsPerRegion,
      1,
      POLICY_HARD_LIMITS.maxResultsPerRegion,
    ),
    maxMissionCandidatesPerRun: parseIntClamped(
      env[ENV_KEYS.maxMissionsPerRun],
      d.maxMissionCandidatesPerRun,
      1,
      POLICY_HARD_LIMITS.maxMissionCandidatesPerRun,
    ),
    minVerifiedOpportunityScore: parseIntClamped(
      env[ENV_KEYS.minOpportunityScore],
      d.minVerifiedOpportunityScore,
      0,
      100,
    ),
    requireWebsiteOrPhone: d.requireWebsiteOrPhone,
    requireContactPath: d.requireContactPath,
    regionRotationEnabled: d.regionRotationEnabled,
    cooldownHours: d.cooldownHours,
    // Dry-run defaults ON and can only be disabled with the explicit literal
    // "false" — any other value keeps the safe default.
    dryRun: parseBool(env[ENV_KEYS.dryRun], d.dryRun),
    updatedAt: null,
  };

  return { policy, regions, configErrors: errors, regionScope };
}
