import {
  DEFAULT_ACQUISITION_POLICY,
  POLICY_HARD_LIMITS,
  type AcquisitionPolicy,
} from "./hermes-autonomous-acquisition-policy.ts";

/**
 * Hermes Outreach Policy (Sprint C3 — Autonomous Outreach).
 *
 * Küçük ve saf policy katmanı — qualification policy'siyle birebir aynı
 * kalıp. Yeni env değişkeni OKUMAZ: outreach eşikleri tamamen server
 * kontrolündedir ve mevcut acquisition policy'sinden türetilir
 * (`deriveOutreachPolicy`). Acquisition'da zaten var olan alanlar
 * kopyalanmaz; buradaki policy onları consume eder.
 *
 * Güvenlik duruşu: `enabled` yalnız acquisition açıkken true olur. Kapalıysa
 * runtime hiçbir outreach hazırlamaz. Bu policy hiçbir gönderim iznine sahip
 * değildir — gönderim yapısal olarak bu katmanın dışındadır (mevcut Founder
 * Approval → Courier → Delivery Gateway → controlled-send zinciri).
 *
 * Client hiçbir alanı override edemez: bu modülün tek üreticisi server
 * tarafındaki orchestrator/route'tur ve hiçbir route client'tan threshold,
 * kanal izni veya gönderim izni kabul etmez.
 */

export type OutreachLanguage = "tr" | "en";

export type HermesOutreachPolicy = {
  enabled: boolean;
  /** Bir run'da en fazla kaç sales_ready lead için outreach hazırlanır. */
  maxPreparedPerRun: number;
  /** Yalnız doğrulanmış/olası WhatsApp veya telefon varsa hazırla — website tek başına yetmez. */
  requireTrustedChannel: boolean;
  /** Instagram önerilmesine izin ver (WhatsApp/telefon yoksa ikincil kanal). */
  allowInstagramChannel: boolean;
  /** Website'i son çare "önerilen kanal" olarak göstermeye izin ver (yine gönderim yok). */
  allowWebsiteChannel: boolean;
  /** Founder onayı her zaman zorunlu — asla kapatılamaz (yapısal koruma). */
  requireFounderApproval: true;
  defaultLanguage: OutreachLanguage;
  updatedAt: number | null;
};

/** Outreach'a özgü tavan — acquisition mission cap'iyle uyumlu. */
export const OUTREACH_HARD_LIMITS = {
  maxPreparedPerRun: POLICY_HARD_LIMITS.maxMissionCandidatesPerRun,
} as const;

/**
 * Güvenli default: acquisition kapalıyken outreach da kapalıdır; güvenilir
 * kanal zorunludur; Instagram ikincil kanal olarak açık; website yalnız son
 * çare gösterim; founder onayı zorunlu.
 */
export const DEFAULT_OUTREACH_POLICY: HermesOutreachPolicy = {
  enabled: false,
  maxPreparedPerRun: DEFAULT_ACQUISITION_POLICY.maxMissionCandidatesPerRun,
  requireTrustedChannel: true,
  allowInstagramChannel: true,
  allowWebsiteChannel: true,
  requireFounderApproval: true,
  defaultLanguage: "tr",
  updatedAt: null,
};

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * Acquisition policy'sinden outreach policy'si türetir. Tek doğruluk kaynağı:
 * enabled durumu ve hazırlık cap'i acquisition'ın kendi (zaten clamp'lenmiş)
 * alanlarından gelir — iki policy asla birbirinden sapamaz. Overrides yalnız
 * server içi test/route kullanımı içindir; `requireFounderApproval` asla
 * override edilemez (tip düzeyinde `true` sabittir).
 */
export function deriveOutreachPolicy(
  acquisition: AcquisitionPolicy,
  overrides: Partial<
    Pick<
      HermesOutreachPolicy,
      | "requireTrustedChannel"
      | "allowInstagramChannel"
      | "allowWebsiteChannel"
      | "defaultLanguage"
    >
  > = {},
): HermesOutreachPolicy {
  const d = DEFAULT_OUTREACH_POLICY;
  return {
    enabled: acquisition.enabled && acquisition.mode !== "disabled",
    maxPreparedPerRun: clampInt(
      acquisition.maxMissionCandidatesPerRun,
      0,
      OUTREACH_HARD_LIMITS.maxPreparedPerRun,
      d.maxPreparedPerRun,
    ),
    requireTrustedChannel: overrides.requireTrustedChannel ?? d.requireTrustedChannel,
    allowInstagramChannel: overrides.allowInstagramChannel ?? d.allowInstagramChannel,
    allowWebsiteChannel: overrides.allowWebsiteChannel ?? d.allowWebsiteChannel,
    requireFounderApproval: true,
    defaultLanguage: overrides.defaultLanguage ?? d.defaultLanguage,
    updatedAt: acquisition.updatedAt,
  };
}
