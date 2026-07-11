/**
 * Hermes Autonomous Acquisition Policy (Sprint C1 — Autonomous Lead
 * Acquisition).
 *
 * Pure, dependency-free policy layer for Hermes's autonomous lead
 * discovery. Every function here is a deterministic decision over plain
 * inputs — no fetch, no env access, no registry access, no Date.now()
 * default that could hide a hardcoded date. The orchestrator
 * (`hermes-autonomous-acquisition-runtime.ts`) is the only caller that
 * wires these decisions to real side effects, and even then only through
 * the existing import/enrichment path.
 *
 * Safety posture: the DEFAULT policy is disabled + dry-run with low limits.
 * Nothing in this module can flip that — enabling acquisition requires
 * explicit server-side configuration (`hermes-acquisition-config.ts`), and
 * `POLICY_HARD_LIMITS` clamps every configured number so even a
 * misconfigured environment can never request an unbounded scan.
 */

export type AcquisitionMode = "disabled" | "manual_safe" | "scheduled_safe";

export type AcquisitionRunStatus =
  | "idle"
  | "eligible"
  | "running"
  | "completed"
  | "partial"
  | "blocked"
  | "failed";

export type AcquisitionTrigger = "scheduled" | "manual" | "developer";

/** The five lead niches the existing Places import already understands — never a free-text query. */
export const ACQUISITION_LEAD_TYPES = [
  "Hotel",
  "Boutique Hotel",
  "Bungalow",
  "Villa",
  "Pension",
] as const;
export type AcquisitionLeadType = (typeof ACQUISITION_LEAD_TYPES)[number];

export type AcquisitionRegion = {
  id: string;
  city: string;
  country: string;
  enabled: boolean;
  /** Lower number = scanned earlier. */
  priority: number;
  maxResultsPerRun: number;
  /** Reuses the existing Places niche presets (`buildPlacesSearchQuery`). */
  leadType: AcquisitionLeadType;
  /** Optional ICP search term — same field the existing import route accepts. */
  icpSearchTerm?: string;
  lastRunAt: number | null;
  cooldownHours: number;
};

export type AcquisitionPolicy = {
  enabled: boolean;
  mode: AcquisitionMode;
  dailyLeadLimit: number;
  dailyExternalRequestLimit: number;
  maxRegionsPerRun: number;
  maxResultsPerRegion: number;
  maxMissionCandidatesPerRun: number;
  minVerifiedOpportunityScore: number;
  requireWebsiteOrPhone: boolean;
  requireContactPath: boolean;
  regionRotationEnabled: boolean;
  /** Default region cooldown — a region's own `cooldownHours` overrides it. */
  cooldownHours: number;
  dryRun: boolean;
  updatedAt: number | null;
};

/**
 * Ceilings no configuration can exceed — the cost guardrail of last resort.
 * `loadAcquisitionConfigFromEnv` clamps into these, and the orchestrator
 * re-clamps at run time, so a bad env can never request an unbounded scan.
 */
export const POLICY_HARD_LIMITS = {
  dailyLeadLimit: 100,
  dailyExternalRequestLimit: 200,
  maxRegionsPerRun: 3,
  maxResultsPerRegion: 20,
  maxMissionCandidatesPerRun: 10,
  cooldownHoursMin: 1,
  cooldownHoursMax: 168,
} as const;

/** Safe defaults: acquisition off, dry-run on, low limits. Matches the sprint's mandated defaults. */
export const DEFAULT_ACQUISITION_POLICY: AcquisitionPolicy = {
  enabled: false,
  mode: "disabled",
  dailyLeadLimit: 20,
  dailyExternalRequestLimit: 10,
  maxRegionsPerRun: 1,
  maxResultsPerRegion: 10,
  maxMissionCandidatesPerRun: 5,
  minVerifiedOpportunityScore: 70,
  requireWebsiteOrPhone: true,
  requireContactPath: true,
  regionRotationEnabled: true,
  cooldownHours: 24,
  dryRun: true,
  updatedAt: null,
};

/* ── blocking reasons ───────────────────────────────────────── */

/**
 * Founder-safe Turkish blocking copy. Never an env name, never a provider
 * term, never a raw error — the founder adapter shows these verbatim.
 */
export const ACQUISITION_BLOCKING_REASONS = {
  disabled: "Fırsat taraması henüz etkin değil.",
  invalidConfig: "Tarama yapılandırması kontrol gerektiriyor.",
  wrongModeForTrigger: "Bu tetikleme türü mevcut çalışma modunda kapalı.",
  activeRun: "Hermes fırsat taraması zaten çalışıyor.",
  duplicateRun: "Bu tarama kısa süre önce zaten çalıştırıldı.",
  dailyLeadLimitReached: "Bugün için tarama limiti tamamlandı.",
  dailyRequestLimitReached: "Bugünün dış tarama kotası tamamlandı.",
  noEligibleRegion: "Şu anda taranmaya uygun bölge yok.",
  noRegionsConfigured: "Tarama bölgesi henüz tanımlanmadı.",
} as const;

export type AcquisitionBlockingReason =
  (typeof ACQUISITION_BLOCKING_REASONS)[keyof typeof ACQUISITION_BLOCKING_REASONS];

/* ── eligibility ────────────────────────────────────────────── */

export type AcquisitionDailyCounters = {
  importedToday: number;
  externalRequestsToday: number;
  runsToday: number;
};

export type EvaluateEligibilityInput = {
  policy: AcquisitionPolicy;
  configErrors: string[];
  trigger: AcquisitionTrigger;
  hasActiveRun: boolean;
  counters: AcquisitionDailyCounters;
  enabledRegionCount: number;
};

export type AcquisitionEligibility = {
  eligible: boolean;
  blockingReasons: string[];
};

export function evaluateAutonomousAcquisitionEligibility(
  input: EvaluateEligibilityInput,
): AcquisitionEligibility {
  const reasons: string[] = [];
  const { policy } = input;

  if (input.configErrors.length > 0) reasons.push(ACQUISITION_BLOCKING_REASONS.invalidConfig);
  if (!policy.enabled || policy.mode === "disabled") {
    reasons.push(ACQUISITION_BLOCKING_REASONS.disabled);
  } else if (input.trigger === "scheduled" && policy.mode !== "scheduled_safe") {
    // Manual/developer triggers are allowed in both safe modes; scheduled
    // triggers require the scheduled_safe mode explicitly.
    reasons.push(ACQUISITION_BLOCKING_REASONS.wrongModeForTrigger);
  }
  if (input.hasActiveRun) reasons.push(ACQUISITION_BLOCKING_REASONS.activeRun);
  if (input.counters.importedToday >= policy.dailyLeadLimit) {
    reasons.push(ACQUISITION_BLOCKING_REASONS.dailyLeadLimitReached);
  }
  if (input.counters.externalRequestsToday >= policy.dailyExternalRequestLimit) {
    reasons.push(ACQUISITION_BLOCKING_REASONS.dailyRequestLimitReached);
  }
  if (input.enabledRegionCount === 0) reasons.push(ACQUISITION_BLOCKING_REASONS.noRegionsConfigured);

  return { eligible: reasons.length === 0, blockingReasons: reasons };
}

/* ── region selection ───────────────────────────────────────── */

export type SelectRegionsInput = {
  policy: AcquisitionPolicy;
  regions: AcquisitionRegion[];
  now: number;
};

/**
 * Enabled regions, cooldown respected, then:
 *  - rotation ON → least-recently-run first (never-run counts as oldest),
 *    priority breaks ties;
 *  - rotation OFF → priority order, lastRunAt breaks ties.
 * Capped at `maxRegionsPerRun` (re-clamped against the hard limit).
 */
export function selectNextAcquisitionRegions(input: SelectRegionsInput): AcquisitionRegion[] {
  const { policy, regions, now } = input;

  const eligible = regions.filter((r) => {
    if (!r.enabled) return false;
    const cooldownHours = r.cooldownHours > 0 ? r.cooldownHours : policy.cooldownHours;
    if (r.lastRunAt !== null && now - r.lastRunAt < cooldownHours * 60 * 60 * 1000) return false;
    return true;
  });

  const sorted = [...eligible].sort((a, b) => {
    if (policy.regionRotationEnabled) {
      const aLast = a.lastRunAt ?? 0;
      const bLast = b.lastRunAt ?? 0;
      if (aLast !== bLast) return aLast - bLast;
      return a.priority - b.priority;
    }
    if (a.priority !== b.priority) return a.priority - b.priority;
    return (a.lastRunAt ?? 0) - (b.lastRunAt ?? 0);
  });

  const cap = Math.min(policy.maxRegionsPerRun, POLICY_HARD_LIMITS.maxRegionsPerRun);
  return sorted.slice(0, Math.max(0, cap));
}

/* ── budget enforcement ─────────────────────────────────────── */

export type EnforceBudgetInput = {
  policy: AcquisitionPolicy;
  counters: AcquisitionDailyCounters;
  selectedRegionCount: number;
};

export type AcquisitionBudget = {
  allowed: boolean;
  blockingReasons: string[];
  /** How many new leads may still enter the pool today. */
  remainingLeadBudget: number;
  /** How many external requests may still be made today. */
  remainingRequestBudget: number;
  /** Per-region result cap after all clamps. */
  maxResultsPerRegion: number;
  /** Mission-candidate cap for this run after all clamps. */
  maxMissionCandidates: number;
};

/**
 * Hard budget math for one run. An external Places scan of one region costs
 * at least 1 text-search request and up to `maxResultsPerRegion` detail
 * requests; if today's remaining request budget can't cover even the
 * minimum for the selected regions, the run is blocked — never silently
 * overrun.
 */
export function enforceAcquisitionBudget(input: EnforceBudgetInput): AcquisitionBudget {
  const { policy, counters } = input;
  const reasons: string[] = [];

  const dailyLeadLimit = Math.min(policy.dailyLeadLimit, POLICY_HARD_LIMITS.dailyLeadLimit);
  const dailyRequestLimit = Math.min(
    policy.dailyExternalRequestLimit,
    POLICY_HARD_LIMITS.dailyExternalRequestLimit,
  );

  const remainingLeadBudget = Math.max(0, dailyLeadLimit - counters.importedToday);
  const remainingRequestBudget = Math.max(0, dailyRequestLimit - counters.externalRequestsToday);

  if (remainingLeadBudget <= 0) reasons.push(ACQUISITION_BLOCKING_REASONS.dailyLeadLimitReached);
  // Minimum viable scan: one text-search request per selected region.
  if (remainingRequestBudget < Math.max(1, input.selectedRegionCount)) {
    reasons.push(ACQUISITION_BLOCKING_REASONS.dailyRequestLimitReached);
  }

  return {
    allowed: reasons.length === 0,
    blockingReasons: reasons,
    remainingLeadBudget,
    remainingRequestBudget,
    maxResultsPerRegion: Math.min(policy.maxResultsPerRegion, POLICY_HARD_LIMITS.maxResultsPerRegion),
    maxMissionCandidates: Math.min(
      policy.maxMissionCandidatesPerRun,
      POLICY_HARD_LIMITS.maxMissionCandidatesPerRun,
    ),
  };
}

/* ── mission candidate eligibility ──────────────────────────── */

export type MissionCandidateInput = {
  /** `verifiedOpportunityScore ?? opportunityScore ?? leadScore` — the same fallback chain the intake adapter uses. */
  opportunityScore: number;
  hasPhone: boolean;
  hasWebsite: boolean;
  policy: AcquisitionPolicy;
};

export type MissionCandidateEligibility = {
  eligible: boolean;
  /** Internal (developer-facing) reason codes — never founder copy. */
  reasons: string[];
};

export function evaluateMissionCandidateEligibility(
  input: MissionCandidateInput,
): MissionCandidateEligibility {
  const reasons: string[] = [];
  const { policy } = input;

  if (input.opportunityScore < policy.minVerifiedOpportunityScore) {
    reasons.push("score_below_threshold");
  }
  if (policy.requireWebsiteOrPhone && !input.hasPhone && !input.hasWebsite) {
    reasons.push("no_website_or_phone");
  }
  // Contact path: an actionable outreach channel. Phone covers WhatsApp/call;
  // a website covers the site-contact path. Structurally the same check as
  // requireWebsiteOrPhone today, kept separate so the config can diverge.
  if (policy.requireContactPath && !input.hasPhone && !input.hasWebsite) {
    reasons.push("no_contact_path");
  }

  return { eligible: reasons.length === 0, reasons };
}

/* ── run summary ────────────────────────────────────────────── */

export type SummarizeRunInput = {
  status: AcquisitionRunStatus;
  dryRun: boolean;
  regionCities: string[];
  evaluatedCount: number;
  importedCount: number;
  duplicateCount: number;
  qualifiedCount: number;
  missionCandidateCount: number;
  blockingReasons: string[];
};

/** One deterministic founder-safe Turkish sentence set describing a run. */
export function summarizeAcquisitionRun(input: SummarizeRunInput): string {
  if (input.status === "blocked") {
    return input.blockingReasons[0] ?? ACQUISITION_BLOCKING_REASONS.invalidConfig;
  }
  if (input.status === "failed") {
    return "Son fırsat taramasında bir sorun oluştu — Hermes taramayı güvenli şekilde durdurdu.";
  }

  const where = input.regionCities.length > 0 ? `${input.regionCities.join(", ")} bölgesinde ` : "";

  if (input.dryRun) {
    return (
      `Önizleme tamamlandı: ${where}${input.evaluatedCount} işletme değerlendirilecekti, ` +
      `${input.missionCandidateCount} satış işi adayı oluşturulacaktı. Hiçbir kayıt yapılmadı.`
    );
  }

  const parts: string[] = [
    `Hermes ${where}${input.evaluatedCount} işletmeyi değerlendirdi.`,
  ];
  if (input.importedCount > 0) parts.push(`${input.importedCount} yeni fırsat bulundu.`);
  if (input.duplicateCount > 0) parts.push(`${input.duplicateCount} işletme zaten listede olduğu için atlandı.`);
  if (input.missionCandidateCount > 0) {
    parts.push(`${input.missionCandidateCount} satış işi kararını bekliyor.`);
  }
  if (input.status === "partial") parts.push("Günlük limit nedeniyle tarama kısmen tamamlandı.");
  return parts.join(" ");
}

/* ── audit events ───────────────────────────────────────────── */

export type AcquisitionAuditEventType =
  | "hermes_acquisition_run_requested"
  | "hermes_acquisition_run_blocked"
  | "hermes_acquisition_run_started"
  | "hermes_acquisition_region_selected"
  | "hermes_acquisition_leads_discovered"
  | "hermes_acquisition_duplicates_skipped"
  | "hermes_acquisition_candidates_qualified"
  | "hermes_acquisition_missions_created"
  | "hermes_acquisition_run_completed"
  | "hermes_acquisition_run_partial"
  | "hermes_acquisition_run_failed"
  | "hermes_acquisition_dry_run_completed";

export type AcquisitionAuditEvent = {
  type: AcquisitionAuditEventType;
  at: number;
  /** Turkish, founder-safe detail — never a secret, env name, or raw provider payload. */
  detailTr: string;
};

export type BuildAuditEventInput = {
  type: AcquisitionAuditEventType;
  at: number;
  detailTr: string;
};

/**
 * The single constructor for acquisition audit events — strips anything that
 * even looks like a bearer token or key-ish value from the detail as a last
 * line of defense (callers never intentionally pass one).
 */
export function buildAcquisitionAuditEvent(input: BuildAuditEventInput): AcquisitionAuditEvent {
  const scrubbed = input.detailTr
    .replace(/Bearer\s+\S+/gi, "Bearer [gizli]")
    .replace(/(key|token|secret)=\S+/gi, "$1=[gizli]");
  return { type: input.type, at: input.at, detailTr: scrubbed };
}
