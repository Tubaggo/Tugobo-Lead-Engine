import type { AcquisitionPolicy } from "./hermes-autonomous-acquisition-policy.ts";

/**
 * Hermes Conversation Policy (Sprint C4 — Autonomous Conversation).
 *
 * Küçük, saf policy katmanı — outreach/qualification policy'leriyle birebir
 * aynı kalıp. Yeni env değişkeni OKUMAZ: konuşma orchestration eşikleri
 * tamamen server kontrolündedir ve mevcut acquisition policy'sinden türetilir
 * (`deriveConversationPolicy`).
 *
 * Bu policy'deki "auto" YALNIZ karar/aday oluşturma anlamındadır — mesaj
 * GÖNDERME anlamına ASLA gelmez. Gönderim bu katmanın tamamen dışındadır
 * (mevcut Founder Approval → Courier → Delivery Gateway → controlled-send
 * zinciri). `requireFounderApprovalForReplyDraft` yapısal olarak `true`
 * sabittir; asla kapatılamaz.
 *
 * Client hiçbir alanı override edemez: tek üreticisi server tarafındaki
 * choke-point/route'tur ve hiçbir route client'tan durum, intent veya
 * gönderim izni kabul etmez.
 */

export type HermesConversationPolicy = {
  enabled: boolean;
  /** Otomatik demo/follow-up adayı ve taslak hazırlığı yalnız eşleşmiş (mapped) cevaplar için. */
  requireMappedReplyForAutomation: boolean;
  /** Cevap taslağı her zaman founder onayı gerektirir — asla auto-approve (tip düzeyinde `true`). */
  requireFounderApprovalForReplyDraft: true;
  /** Demo adayı oluşturmaya izin ver (yalnız aday — gönderim değil). */
  allowAutoDemoCandidateCreation: boolean;
  /** Follow-up adayı oluşturmaya izin ver (yalnız aday — gönderim değil). */
  allowAutoFollowUpCandidateCreation: boolean;
  /** İlgilenmiyor cevabında konuşmayı operasyonel olarak kapat (asla otomatik `lost` yapmaz). */
  closeOnNotInterested: boolean;
  /** Yanlış numarada konuşmayı kapat + gelecekteki otomasyonu engelle. */
  closeOnWrongNumber: boolean;
  /** Bir lead için tutulacak en fazla konuşma kararı sayısı. */
  maxConversationDecisionsPerLead: number;
  /** Güvenli cevap önizlemesinin en fazla uzunluğu. */
  maxReplyPreviewLength: number;
  updatedAt: number | null;
};

/**
 * Güvenli default: konuşma orchestration açık; otomasyon yalnız eşleşmiş
 * cevaplar için; founder onayı taslak için zorunlu; demo/follow-up adayları
 * açık (yalnız aday oluşturma — gönderim değil); ilgilenmiyor/yanlış numara
 * kapatır; önizleme 160 karakter.
 */
export const DEFAULT_CONVERSATION_POLICY: HermesConversationPolicy = {
  enabled: true,
  requireMappedReplyForAutomation: true,
  requireFounderApprovalForReplyDraft: true,
  allowAutoDemoCandidateCreation: true,
  allowAutoFollowUpCandidateCreation: true,
  closeOnNotInterested: true,
  closeOnWrongNumber: true,
  maxConversationDecisionsPerLead: 12,
  maxReplyPreviewLength: 160,
  updatedAt: null,
};

const MAX_PREVIEW_HARD_LIMIT = 160;
const MAX_DECISIONS_PER_LEAD_HARD_LIMIT = 50;

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * Acquisition policy'sinden konuşma policy'si türetir. Tek doğruluk kaynağı:
 * `enabled` durumu acquisition'ın kendi (zaten clamp'lenmiş) alanlarından
 * gelir — iki policy asla birbirinden sapamaz. Overrides yalnız server içi
 * test/route kullanımı içindir; `requireFounderApprovalForReplyDraft` asla
 * override edilemez (tip düzeyinde `true` sabittir).
 */
export function deriveConversationPolicy(
  acquisition: AcquisitionPolicy,
  overrides: Partial<
    Pick<
      HermesConversationPolicy,
      | "requireMappedReplyForAutomation"
      | "allowAutoDemoCandidateCreation"
      | "allowAutoFollowUpCandidateCreation"
      | "closeOnNotInterested"
      | "closeOnWrongNumber"
      | "maxReplyPreviewLength"
      | "maxConversationDecisionsPerLead"
    >
  > = {},
): HermesConversationPolicy {
  const d = DEFAULT_CONVERSATION_POLICY;
  return {
    enabled: acquisition.enabled && acquisition.mode !== "disabled",
    requireMappedReplyForAutomation:
      overrides.requireMappedReplyForAutomation ?? d.requireMappedReplyForAutomation,
    requireFounderApprovalForReplyDraft: true,
    allowAutoDemoCandidateCreation:
      overrides.allowAutoDemoCandidateCreation ?? d.allowAutoDemoCandidateCreation,
    allowAutoFollowUpCandidateCreation:
      overrides.allowAutoFollowUpCandidateCreation ?? d.allowAutoFollowUpCandidateCreation,
    closeOnNotInterested: overrides.closeOnNotInterested ?? d.closeOnNotInterested,
    closeOnWrongNumber: overrides.closeOnWrongNumber ?? d.closeOnWrongNumber,
    maxConversationDecisionsPerLead: clampInt(
      overrides.maxConversationDecisionsPerLead ?? d.maxConversationDecisionsPerLead,
      1,
      MAX_DECISIONS_PER_LEAD_HARD_LIMIT,
      d.maxConversationDecisionsPerLead,
    ),
    maxReplyPreviewLength: clampInt(
      overrides.maxReplyPreviewLength ?? d.maxReplyPreviewLength,
      0,
      MAX_PREVIEW_HARD_LIMIT,
      d.maxReplyPreviewLength,
    ),
    updatedAt: acquisition.updatedAt,
  };
}

/**
 * Choke-point default. Konuşma orchestration inbound cevaplara bağlıdır —
 * autonomous acquisition açık/kapalı olmasından BAĞIMSIZDIR: bir işletme
 * cevap verdiğinde bu her zaman değerlendirilmelidir. Bu yüzden default
 * `enabled: true` döner (Scope 4). Acquisition'a bağlamak isteyen server
 * çağıranları `deriveConversationPolicy` kullanır.
 */
export function defaultConversationPolicy(): HermesConversationPolicy {
  return { ...DEFAULT_CONVERSATION_POLICY };
}
