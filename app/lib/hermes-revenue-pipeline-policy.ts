/**
 * Hermes Revenue Pipeline Policy (Sprint C6 — Revenue Pipeline Intelligence).
 *
 * Küçük, saf policy katmanı — conversation/follow-up policy'leriyle aynı
 * kalıp. Risk eşikleri ve gelir kuralları tamamen server kontrolündedir;
 * client hiçbirini gönderemez/override edemez.
 *
 * Bu policy YALNIZ okuma/değerlendirme kuralları taşır — hiçbir gelir değeri
 * ÜRETMEZ, hiçbir fiyat/paket TAHMİN ETMEZ. Kasıtlı olarak bağımsız
 * (no "@/", no React) — `node --test` altında koşar.
 */

export type HermesRevenuePipelinePolicy = {
  enabled: boolean;
  /** Bu süreden uzun süre anlamlı aktivite olmayan açık fırsat "bayat" sayılır. */
  staleOpportunityHours: number;
  /** Okundu/iletildi ama cevap yoksa bu süre sonra risk. */
  replyWaitingRiskHours: number;
  /** Demo talep edildi ama planlanmadıysa bu süre sonra risk. */
  demoSchedulingRiskHours: number;
  /** Takip gecikmesi bu süreyi aşarsa risk. */
  followUpOverdueRiskHours: number;
  /** Demo/takip tamamlandı ama sonuç girilmediyse bu süre sonra risk. */
  outcomePendingRiskHours: number;
  /** Forecast için gerçek bir MRR tahmini şart (uydurma yok). */
  requireRevenueEstimateForForecast: boolean;
  /** Beklemedeki fırsatları potansiyel gelire dahil etme. */
  includePausedInPotential: boolean;
  /** İnceleme bekleyen fırsatları potansiyel gelire dahil etme. */
  includeReviewRequiredInPotential: boolean;
  maxPipelineItems: number;
  updatedAt: number | null;
};

export const DEFAULT_REVENUE_PIPELINE_POLICY: HermesRevenuePipelinePolicy = {
  enabled: true,
  staleOpportunityHours: 168,
  replyWaitingRiskHours: 72,
  demoSchedulingRiskHours: 24,
  followUpOverdueRiskHours: 24,
  outcomePendingRiskHours: 48,
  requireRevenueEstimateForForecast: true,
  includePausedInPotential: false,
  includeReviewRequiredInPotential: false,
  maxPipelineItems: 500,
  updatedAt: null,
};

const HARD_LIMITS = {
  maxRiskHours: 8760, // 1 yıl
  maxPipelineItems: 2000,
} as const;

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

export type RevenuePipelinePolicyOverrides = Partial<Omit<HermesRevenuePipelinePolicy, "updatedAt">>;

export function buildRevenuePipelinePolicy(
  overrides: RevenuePipelinePolicyOverrides = {},
  now: number | null = null,
): HermesRevenuePipelinePolicy {
  const d = DEFAULT_REVENUE_PIPELINE_POLICY;
  return {
    enabled: overrides.enabled ?? d.enabled,
    staleOpportunityHours: clampNumber(overrides.staleOpportunityHours ?? d.staleOpportunityHours, 1, HARD_LIMITS.maxRiskHours, d.staleOpportunityHours),
    replyWaitingRiskHours: clampNumber(overrides.replyWaitingRiskHours ?? d.replyWaitingRiskHours, 1, HARD_LIMITS.maxRiskHours, d.replyWaitingRiskHours),
    demoSchedulingRiskHours: clampNumber(overrides.demoSchedulingRiskHours ?? d.demoSchedulingRiskHours, 1, HARD_LIMITS.maxRiskHours, d.demoSchedulingRiskHours),
    followUpOverdueRiskHours: clampNumber(overrides.followUpOverdueRiskHours ?? d.followUpOverdueRiskHours, 1, HARD_LIMITS.maxRiskHours, d.followUpOverdueRiskHours),
    outcomePendingRiskHours: clampNumber(overrides.outcomePendingRiskHours ?? d.outcomePendingRiskHours, 1, HARD_LIMITS.maxRiskHours, d.outcomePendingRiskHours),
    requireRevenueEstimateForForecast: overrides.requireRevenueEstimateForForecast ?? d.requireRevenueEstimateForForecast,
    includePausedInPotential: overrides.includePausedInPotential ?? d.includePausedInPotential,
    includeReviewRequiredInPotential: overrides.includeReviewRequiredInPotential ?? d.includeReviewRequiredInPotential,
    maxPipelineItems: Math.round(clampNumber(overrides.maxPipelineItems ?? d.maxPipelineItems, 1, HARD_LIMITS.maxPipelineItems, d.maxPipelineItems)),
    updatedAt: now,
  };
}

export function defaultRevenuePipelinePolicy(): HermesRevenuePipelinePolicy {
  return { ...DEFAULT_REVENUE_PIPELINE_POLICY };
}
