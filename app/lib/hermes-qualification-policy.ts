import {
  DEFAULT_ACQUISITION_POLICY,
  POLICY_HARD_LIMITS,
  type AcquisitionPolicy,
} from "./hermes-autonomous-acquisition-policy.ts";

/**
 * Hermes Qualification Policy (Sprint C2 — Autonomous Qualification).
 *
 * Küçük ve saf policy katmanı. Yeni env değişkeni OKUMAZ — qualification
 * eşikleri tamamen server kontrolündedir ve mevcut acquisition policy'sinden
 * türetilir (`deriveQualificationPolicy`). Acquisition'da zaten var olan
 * alanlar (minVerifiedOpportunityScore, requireContactPath, mission cap)
 * kopyalanmaz; buradaki policy onları consume eder. Yalnız qualification'a
 * özgü alanlar (freshness, duplicate block, manuel inceleme izni) burada
 * tanımlıdır ve güvenli default taşır.
 *
 * Client hiçbir alanı override edemez: bu modülün tek üreticisi server
 * tarafındaki orchestrator/route'tur ve hiçbir route client'tan threshold
 * kabul etmez.
 */

export type HermesQualificationPolicy = {
  enabled: boolean;
  minVerifiedOpportunityScore: number;
  /** Opsiyonel ikincil bar — altındaki lead'ler not_qualified'a yaklaşır. */
  minLeadScore: number | null;
  requireContactPath: boolean;
  requireWebsite: boolean;
  requireFreshEnrichment: boolean;
  /** `lastEnrichedAt` bundan eskiyse enrichment bayat sayılır. */
  maxEnrichmentAgeHours: number;
  /** false ise review_required durumu watch'a düşer (founder inceleme kuyruğu kapalı). */
  allowManualReview: boolean;
  /** Bir run'da en fazla kaç sales_ready adayı mission yoluna verilebilir. */
  maxSalesReadyPerRun: number;
  blockDuplicateMission: boolean;
  updatedAt: number | null;
};

/** Qualification'a özgü tavanlar — acquisition hard limit'leriyle uyumlu. */
export const QUALIFICATION_HARD_LIMITS = {
  maxSalesReadyPerRun: POLICY_HARD_LIMITS.maxMissionCandidatesPerRun,
  maxEnrichmentAgeHoursMin: 1,
  maxEnrichmentAgeHoursMax: 24 * 30,
} as const;

/**
 * Güvenli default: acquisition kapalıyken qualification da kapalıdır,
 * iletişim yolu ve freshness zorunludur, duplicate mission bloklanır.
 */
export const DEFAULT_QUALIFICATION_POLICY: HermesQualificationPolicy = {
  enabled: false,
  minVerifiedOpportunityScore: DEFAULT_ACQUISITION_POLICY.minVerifiedOpportunityScore,
  minLeadScore: null,
  requireContactPath: true,
  requireWebsite: true,
  requireFreshEnrichment: true,
  maxEnrichmentAgeHours: 24 * 7,
  allowManualReview: true,
  maxSalesReadyPerRun: DEFAULT_ACQUISITION_POLICY.maxMissionCandidatesPerRun,
  blockDuplicateMission: true,
  updatedAt: null,
};

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * Acquisition policy'sinden qualification policy'si türetir. Tek doğruluk
 * kaynağı: skor eşiği, contact path zorunluluğu ve sales_ready cap'i
 * acquisition'ın kendi (zaten clamp'lenmiş) alanlarından gelir — iki policy
 * asla birbirinden sapamaz. Overrides yalnız server içi test/route kullanımı
 * içindir; her sayı yine tavana clamp'lenir.
 */
export function deriveQualificationPolicy(
  acquisition: AcquisitionPolicy,
  overrides: Partial<
    Pick<
      HermesQualificationPolicy,
      | "requireWebsite"
      | "requireFreshEnrichment"
      | "maxEnrichmentAgeHours"
      | "allowManualReview"
      | "blockDuplicateMission"
      | "minLeadScore"
    >
  > = {},
): HermesQualificationPolicy {
  const d = DEFAULT_QUALIFICATION_POLICY;
  return {
    enabled: acquisition.enabled && acquisition.mode !== "disabled",
    minVerifiedOpportunityScore: clampInt(
      acquisition.minVerifiedOpportunityScore,
      0,
      100,
      d.minVerifiedOpportunityScore,
    ),
    minLeadScore:
      typeof overrides.minLeadScore === "number" && Number.isFinite(overrides.minLeadScore)
        ? clampInt(overrides.minLeadScore, 0, 100, 0)
        : null,
    requireContactPath: acquisition.requireContactPath,
    requireWebsite: overrides.requireWebsite ?? d.requireWebsite,
    requireFreshEnrichment: overrides.requireFreshEnrichment ?? d.requireFreshEnrichment,
    maxEnrichmentAgeHours: clampInt(
      overrides.maxEnrichmentAgeHours ?? d.maxEnrichmentAgeHours,
      QUALIFICATION_HARD_LIMITS.maxEnrichmentAgeHoursMin,
      QUALIFICATION_HARD_LIMITS.maxEnrichmentAgeHoursMax,
      d.maxEnrichmentAgeHours,
    ),
    allowManualReview: overrides.allowManualReview ?? d.allowManualReview,
    maxSalesReadyPerRun: clampInt(
      acquisition.maxMissionCandidatesPerRun,
      0,
      QUALIFICATION_HARD_LIMITS.maxSalesReadyPerRun,
      d.maxSalesReadyPerRun,
    ),
    blockDuplicateMission: overrides.blockDuplicateMission ?? d.blockDuplicateMission,
    updatedAt: acquisition.updatedAt,
  };
}
