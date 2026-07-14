/**
 * Hermes Follow-up Policy (Sprint C5 — Autonomous Follow-up Orchestration).
 *
 * Küçük, saf, deterministik policy katmanı — conversation/outreach
 * policy'leriyle aynı kalıp. Follow-up ZAMANLAMASI tamamen server
 * kontrolündedir: gecikme eşikleri, maksimum takip sayısı ve minimum aralık
 * buradan gelir; client hiçbirini gönderemez veya override edemez.
 *
 * Bu policy YALNIZ zamanlama/karar üretir — mesaj gönderme izni üretmez.
 * `requireFounderApproval` yapısal olarak `true` sabittir; asla kapatılamaz.
 * Gönderim bu katmanın tamamen dışındadır (mevcut Founder Approval → Courier
 * → Delivery Gateway → controlled-send zinciri).
 *
 * Kasıtlı olarak bağımsız (no "@/", no React) — `node --test` altında koşar.
 */

export type HermesFollowUpPolicy = {
  enabled: boolean;
  /** Takip taslağı her zaman founder onayı gerektirir — asla auto-approve (tip düzeyinde `true`). */
  requireFounderApproval: true;
  readNoReplyDelayHours: number;
  deliveredNoReplyDelayHours: number;
  hotReplyActionDelayMinutes: number;
  demoNotScheduledDelayHours: number;
  demoNoShowDelayHours: number;
  failedDeliveryRecoveryDelayMinutes: number;
  laterRequestedDefaultDelayHours: number;
  /** Bir lead için en fazla kaç takip hazırlanabilir. */
  maxFollowUpsPerLead: number;
  /** Aynı lead'e iki takip arasındaki minimum saat. */
  minHoursBetweenFollowUps: number;
  /** Aktif bir takip bu süreden sonra süresi dolmuş sayılır. */
  expireAfterHours: number;
  /** Yalnız eşleşmiş (mission/lead bilinen) takipler otomasyona girer. */
  requireMappedLead: boolean;
  blockNotInterested: boolean;
  blockWrongNumber: boolean;
  blockDoNotContact: boolean;
  updatedAt: number | null;
};

/**
 * Güvenli default: takip orchestration açık; founder onayı zorunlu;
 * deterministik gecikmeler; en fazla 3 takip; 24 saat minimum aralık; 14 gün
 * (336 saat) sonra süre dolar; yalnız eşleşmiş lead'ler; ilgilenmiyor/yanlış
 * numara/DNC engellenir.
 */
export const DEFAULT_FOLLOW_UP_POLICY: HermesFollowUpPolicy = {
  enabled: true,
  requireFounderApproval: true,
  readNoReplyDelayHours: 24,
  deliveredNoReplyDelayHours: 48,
  hotReplyActionDelayMinutes: 30,
  demoNotScheduledDelayHours: 4,
  demoNoShowDelayHours: 24,
  failedDeliveryRecoveryDelayMinutes: 15,
  laterRequestedDefaultDelayHours: 72,
  maxFollowUpsPerLead: 3,
  minHoursBetweenFollowUps: 24,
  expireAfterHours: 336,
  requireMappedLead: true,
  blockNotInterested: true,
  blockWrongNumber: true,
  blockDoNotContact: true,
  updatedAt: null,
};

/** Sağlık sınırları — client override etse bile bunların dışına çıkılamaz. */
const HARD_LIMITS = {
  maxDelayHours: 720, // 30 gün
  maxDelayMinutes: 1440, // 24 saat
  maxFollowUpsPerLead: 10,
  maxMinHoursBetween: 240,
  maxExpireAfterHours: 1440, // 60 gün
} as const;

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  return Math.round(clampNumber(value, min, max, fallback));
}

/** Client/route override'larının kabul edebileceği güvenli alt küme (test/server içi kullanım). */
export type FollowUpPolicyOverrides = Partial<
  Omit<HermesFollowUpPolicy, "requireFounderApproval" | "updatedAt">
>;

/**
 * Güvenli policy üretir: her sayısal alan sağlık sınırlarına clamp'lenir,
 * geçersiz/eksik değerler default'a düşer. `requireFounderApproval` asla
 * override edilemez (tip düzeyinde `true` sabittir).
 */
export function buildFollowUpPolicy(
  overrides: FollowUpPolicyOverrides = {},
  now: number | null = null,
): HermesFollowUpPolicy {
  const d = DEFAULT_FOLLOW_UP_POLICY;
  return {
    enabled: overrides.enabled ?? d.enabled,
    requireFounderApproval: true,
    readNoReplyDelayHours: clampNumber(overrides.readNoReplyDelayHours ?? d.readNoReplyDelayHours, 0, HARD_LIMITS.maxDelayHours, d.readNoReplyDelayHours),
    deliveredNoReplyDelayHours: clampNumber(overrides.deliveredNoReplyDelayHours ?? d.deliveredNoReplyDelayHours, 0, HARD_LIMITS.maxDelayHours, d.deliveredNoReplyDelayHours),
    hotReplyActionDelayMinutes: clampNumber(overrides.hotReplyActionDelayMinutes ?? d.hotReplyActionDelayMinutes, 0, HARD_LIMITS.maxDelayMinutes, d.hotReplyActionDelayMinutes),
    demoNotScheduledDelayHours: clampNumber(overrides.demoNotScheduledDelayHours ?? d.demoNotScheduledDelayHours, 0, HARD_LIMITS.maxDelayHours, d.demoNotScheduledDelayHours),
    demoNoShowDelayHours: clampNumber(overrides.demoNoShowDelayHours ?? d.demoNoShowDelayHours, 0, HARD_LIMITS.maxDelayHours, d.demoNoShowDelayHours),
    failedDeliveryRecoveryDelayMinutes: clampNumber(overrides.failedDeliveryRecoveryDelayMinutes ?? d.failedDeliveryRecoveryDelayMinutes, 0, HARD_LIMITS.maxDelayMinutes, d.failedDeliveryRecoveryDelayMinutes),
    laterRequestedDefaultDelayHours: clampNumber(overrides.laterRequestedDefaultDelayHours ?? d.laterRequestedDefaultDelayHours, 0, HARD_LIMITS.maxDelayHours, d.laterRequestedDefaultDelayHours),
    maxFollowUpsPerLead: clampInt(overrides.maxFollowUpsPerLead ?? d.maxFollowUpsPerLead, 1, HARD_LIMITS.maxFollowUpsPerLead, d.maxFollowUpsPerLead),
    minHoursBetweenFollowUps: clampNumber(overrides.minHoursBetweenFollowUps ?? d.minHoursBetweenFollowUps, 0, HARD_LIMITS.maxMinHoursBetween, d.minHoursBetweenFollowUps),
    expireAfterHours: clampNumber(overrides.expireAfterHours ?? d.expireAfterHours, 1, HARD_LIMITS.maxExpireAfterHours, d.expireAfterHours),
    requireMappedLead: overrides.requireMappedLead ?? d.requireMappedLead,
    blockNotInterested: overrides.blockNotInterested ?? d.blockNotInterested,
    blockWrongNumber: overrides.blockWrongNumber ?? d.blockWrongNumber,
    blockDoNotContact: overrides.blockDoNotContact ?? d.blockDoNotContact,
    updatedAt: now,
  };
}

/** Choke-point/route default'u — güvenli, enabled policy. */
export function defaultFollowUpPolicy(): HermesFollowUpPolicy {
  return { ...DEFAULT_FOLLOW_UP_POLICY };
}
