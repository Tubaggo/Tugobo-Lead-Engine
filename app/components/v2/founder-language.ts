/**
 * Founder Language (v8.4 — Developer Isolation & Release Cleanup).
 *
 * The single vocabulary module for everything the founder sees while
 * Developer Mode is OFF. Two responsibilities:
 *
 *   1. Founder-facing label maps that replace technical runtime vocabulary
 *      (Mission → İş, Pipeline states → plain Turkish, etc.) in founder
 *      views. Developer Mode keeps using the original technical labels —
 *      nothing in any runtime module changes.
 *   2. The release-audit contract: `FOUNDER_FORBIDDEN_TERMS` +
 *      `findForbiddenFounderTerm` let unit tests assert that no founder-
 *      facing copy ever contains a technical term again.
 *
 * Deliberately dependency-free (no "@/" imports, no React, no browser API)
 * so it runs under plain `node --test` — the same convention every v8
 * adapter follows.
 */

/**
 * Technical vocabulary that must never appear in founder-facing copy while
 * Developer Mode is OFF. Matched case-insensitively as substrings.
 * ("WhatsApp", "Demo", "Hermes" are founder vocabulary — deliberately absent.)
 */
export const FOUNDER_FORBIDDEN_TERMS = [
  "runtime",
  "registry",
  "bridge",
  "webhook",
  "provider",
  "courier",
  "gateway",
  "mission",
  "pipeline",
  "developer",
  "debug",
  "shadow",
  "dry run",
  "dry mode",
  "adapter",
  "endpoint",
  "payload",
  "outcome",
  "delivery receipt",
  "reply listener",
  "lead import",
  "automation",
] as const;

/** Returns the first forbidden technical term found in `text`, or null when the copy is founder-safe. */
export function findForbiddenFounderTerm(text: string): string | null {
  const lower = text.toLowerCase();
  for (const term of FOUNDER_FORBIDDEN_TERMS) {
    if (lower.includes(term)) return term;
  }
  return null;
}

/** Structural copy of `HermesPipelineState` (hermes-pipeline-engine.ts) — kept local so this module stays alias-free and node-testable. */
export type FounderPipelineStateKey =
  | "queued"
  | "running"
  | "waiting"
  | "blocked"
  | "completed"
  | "failed"
  | "paused";

/**
 * Founder equivalents of `PIPELINE_STATE_LABELS`. Same keys, founder words:
 * the founder never reads the word "Pipeline" — they read what Hermes is
 * doing with the job.
 */
export const FOUNDER_PIPELINE_STATE_LABELS: Record<FounderPipelineStateKey, string> = {
  queued: "Sırada",
  running: "Hermes çalışıyor",
  waiting: "Yanıt bekleniyor",
  blocked: "Durduruldu",
  completed: "Tamamlandı",
  failed: "Hata oluştu",
  paused: "Duraklatıldı",
};

/**
 * Founder-facing section titles + copy for the Hermes decision panel
 * (`AutomationCenterContextPanel.tsx`'s mission view while Developer Mode
 * is OFF). Centralized here so the release-audit test covers every string.
 */
export const FOUNDER_DECISION_PANEL_LABELS = {
  header: "Hermes Karar Merkezi",
  jobSummary: "İş Özeti",
  jobProgress: "İş İlerlemesi",
  evidence: "Kanıt",
  founderDecision: "Founder Kararı",
  approveButton: "Onayla — Hermes'i Başlat",
  rejectButton: "Reddet",
  approvedNote: "Onaylandı — Hermes işi yürütüyor.",
  rejectedNote: "Reddedildi — Hermes bu işi bırakır.",
  noApprovalNeededNote: "Onay gerekmiyor — güvenli iç görev; tek tıkla başlatılabilir.",
  approveHint: "Onay, Hermes'i hemen başlatır — sonrasını Hermes tek başına yürütür.",
  execution: "Hermes Yürütme",
  executionStatus: "Durum",
  executionNotStarted: "Henüz başlatılmadı",
  executionLastResult: "Son Sonuç",
  executionNoResult: "Henüz sonuç yok",
  startButton: "Hermes Çalıştır",
  gatedNote: "Önce Founder onayı gerekli — onaylandığında Hermes hemen başlar.",
  waitingNote: "Yanıt veya takip zamanı bekleniyor — henüz başlatılamaz.",
  unsupportedNote: "Bu görev henüz otomatik yürütülemiyor.",
  messageApproval: "Mesaj Onayı",
  deliveryStatus: "Teslim Durumu",
  deliveryEmpty: "Mesaj onaylandığında teslim durumu burada görünür.",
  deliveryReadyLabel: "Teslime Hazır",
  deliveryChannel: "Kanal",
  deliveryRecipient: "Alıcı",
  recentActivity: "Son Aktivite",
  noActivity: "Henüz aktivite yok",
  safeNote: "Güvenli iç aksiyon · Dış iletişim yok",
} as const;

/**
 * Founder-facing copy for the right panel's summary view (nothing selected).
 */
export const FOUNDER_SUMMARY_PANEL_LABELS = {
  header: "Hermes",
  intro:
    "Hermes çalışıyor — sen karar veriyorsun. Karar Merkezi'nden bir iş seçtiğinde detayı burada açılır.",
  summaryTitle: "Hermes Özeti",
  evaluatedLeads: "Değerlendirilen İşletme",
  activeJobs: "Aktif İş",
  awaitingApproval: "Onay Bekliyor",
  founderDecisions: "Founder Kararı",
  watching: "İzlemede",
} as const;

/**
 * Founder-facing labels for Hermes Home itself (`FounderRevenueWorkspace.tsx`).
 * Only the strings v8.4 renamed live here — pre-existing founder copy that was
 * already clean stays where it was.
 */
export const FOUNDER_HOME_LABELS = {
  leadIntakeSection: "Hermes Fırsat Keşfi",
  activeJobsTile: "Aktif İş",
  outcomePendingTile: "Sonuç Bekliyor",
} as const;

/**
 * Presentation-only transform for timeline texts shown to the founder:
 * replaces the one technical word runtime timeline builders still emit
 * ("Mission") with founder vocabulary. Never used in Developer Mode.
 */
export function founderizeTimelineText(text: string): string {
  return text.replace(/Mission/g, "İş").replace(/mission/g, "iş");
}

/**
 * v8.5 (Release Candidate Polish) — safe, operational error copy for the six
 * founder-facing data fetches on Hermes Home. Never the raw fetch error,
 * HTTP status, route path, or provider payload — just "this data source
 * didn't answer, try again." Also the loading line + retry button label so
 * every consumer uses the identical wording instead of drifting copies.
 */
export const FOUNDER_ERROR_LABELS = {
  whatsappStatus: "Hermes güncel mesaj durumunu alamadı.",
  deliveryReceipts: "Hermes güncel mesaj durumunu alamadı.",
  replies: "Cevap verileri şu anda güncellenemiyor.",
  replyIntelligence: "Cevap verileri şu anda güncellenemiyor.",
  demoScheduling: "Demo bilgileri yüklenemedi.",
  followUps: "Takip bilgileri yüklenemedi.",
  salesOutcomes: "Satış sonuçları yüklenemedi.",
  retryButton: "Tekrar Dene",
  loading: "Hermes verileri hazırlanıyor…",
} as const;

/**
 * v8.5 — the six founder-facing empty states the RC spec fixes verbatim.
 * Centralized so the release-audit test can assert every screen renders the
 * exact approved Turkish copy instead of a drifted paraphrase.
 */
export const FOUNDER_HOME_EMPTY_STATE_LABELS = {
  hermesToday: "Henüz bugüne ait satış aktivitesi yok. Hermes çalışmaya başladığında özet burada görünecek.",
  leadIntake: "Hermes henüz yeni fırsat taraması başlatmadı.",
  decisionCenter: "Şu anda senden karar bekleyen bir satış görevi yok. Hermes çalışmaya devam ediyor.",
  opportunityFocus: "Bir fırsat seçtiğinde Hermes bu otel için önerilen sonraki adımı gösterecek.",
  revenuePulse: "Henüz satış sonucu kaydedilmedi.",
  activity: "Hermes aktivitesi başladığında önemli gelişmeler burada görünecek.",
} as const;
