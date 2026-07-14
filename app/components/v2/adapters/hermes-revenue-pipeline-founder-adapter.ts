/**
 * Hermes Revenue Pipeline Founder adapter (Sprint C6).
 *
 * Saf sunum katmanı projeksiyonu: `/api/hermes/revenue-pipeline` payload'ını
 * "Gelir Nabzı" bölümünün founder copy'sine çevirir. Hiçbir şey hesaplamaz —
 * pipeline çalışma katmanının zaten ürettiği Türkçe cümleleri/etiketleri
 * seçer ve gruplar.
 *
 * KESİN KURAL: bilinmeyen gelir asla sahte ₺0 gösterilmez — "Henüz
 * belirlenmedi" yazılır. Founder-language: teknik terim yok, ham enum yok,
 * ham telefon/iç kimlik yok. Bağımsız (no "@/", no React).
 *
 * NOT: Pipeline zekâsı muhasebe değildir. Tahmini gelir tahsil edilmiş gelir
 * değildir.
 */

export type RevenuePipelineApiItemLike = {
  leadId: string | null;
  missionId: string | null;
  title: string;
  stage: string;
  stageLabelTr: string;
  health: string;
  healthLabelTr?: string;
  priority?: string;
  revenueSignalLabelTr?: string;
  estimatedMrr?: number | null;
  potentialMrr?: number | null;
  realizedMrr?: number | null;
  riskedMrr?: number | null;
  riskReasonsTr?: string[];
  whyItMattersTr?: string;
  hermesRecommendationTr?: string;
  founderNextActionTr?: string;
  founderActionLabelTr?: string | null;
};

export type RevenuePipelineApiSummaryLike = {
  total: number;
  active: number;
  attentionRequired: number;
  atRisk: number;
  outcomePending: number;
  won: number;
  lost: number;
  potentialMrr: number | null;
  realizedMrr: number | null;
  riskedMrr: number | null;
};

const UNKNOWN_AMOUNT_LABEL = "Henüz belirlenmedi";

/** Bilinmeyen (null) tutar → "Henüz belirlenmedi"; gerçek 0 → ₺0 (sahte değil, gerçek değer). */
export function formatMrrLabel(mrr: number | null | undefined): string {
  if (mrr == null) return UNKNOWN_AMOUNT_LABEL;
  return `₺${mrr.toLocaleString("tr-TR")}`;
}

export type RevenuePipelineCard = {
  leadId: string | null;
  missionId: string | null;
  title: string;
  stageLabelTr: string;
  healthLabelTr: string;
  revenueSignalLabelTr: string;
  mrrLabel: string;
  whyItMattersTr: string;
  hermesRecommendationTr: string;
  founderNextActionTr: string;
  founderActionLabelTr: string | null;
  riskReasonsTr: string[];
};

export type HermesRevenuePipelineView = {
  mode: "loading" | "error" | "empty" | "ready";
  summary: {
    activeLabel: string;
    closestLabel: string;
    atRiskLabel: string;
    outcomePendingLabel: string;
    realizedMrrLabel: string;
    potentialMrrLabel: string;
    riskedMrrLabel: string;
  };
  /** Gelire en yakın açık fırsatlar. */
  closest: RevenuePipelineCard[];
  /** Riskteki fırsatlar (yalnız actionable/at_risk). */
  atRisk: RevenuePipelineCard[];
  hasWonOrLost: boolean;
};

export const HERMES_REVENUE_PIPELINE_LABELS = {
  sectionTitle: "Gelir Nabzı",
  sectionSubtitle: "Fırsatların satışa yakınlığı, riskleri ve gelir potansiyeli — tek bakışta.",
  kpiActive: "Aktif Fırsat",
  kpiClosest: "Sonuca Yakın",
  kpiAtRisk: "Riskte",
  kpiOutcomePending: "Sonuç Bekliyor",
  kpiRealizedMrr: "Kazanılan MRR",
  kpiPotentialMrr: "Potansiyel MRR",
  kpiRiskedMrr: "Risk Altındaki MRR",
  closestTitle: "Gelire En Yakın Fırsatlar",
  atRiskTitle: "Riskteki Fırsatlar",
  whyItMatters: "Neden önemli?",
  hermesRecommendation: "Hermes ne öneriyor?",
  founderNext: "Sonraki adım",
  mrr: "Tahmini aylık gelir",
  notAccountingNote: "Tahmini gelir, tahsil edilmiş gelir değildir.",
  loading: "Hermes gelir tablosunu hazırlıyor…",
  error: "Gelir tablosu şu anda yüklenemedi.",
  retry: "Tekrar Dene",
  emptyTitle: "Henüz gelir üreten bir fırsat yok.",
  emptySubtitle: "Fırsatlar ilerledikçe gelir tablosu burada oluşacak.",
} as const;

const CLOSEST_STAGES = new Set([
  "outcome_pending", "follow_up_due", "demo_scheduled", "demo_pending", "conversation_active",
]);
const MAX_CARDS = 5;

function toCard(item: RevenuePipelineApiItemLike, leadNameById?: Record<string, string>): RevenuePipelineCard {
  const fromMap = item.leadId ? leadNameById?.[item.leadId]?.trim() : undefined;
  const title = fromMap || (item.title?.trim() && item.title !== "İsimsiz işletme" ? item.title.trim() : "İsimsiz işletme");
  return {
    leadId: item.leadId,
    missionId: item.missionId,
    title,
    stageLabelTr: item.stageLabelTr,
    healthLabelTr: item.healthLabelTr?.trim() || "",
    revenueSignalLabelTr: item.revenueSignalLabelTr?.trim() || UNKNOWN_AMOUNT_LABEL,
    mrrLabel: formatMrrLabel(item.estimatedMrr ?? item.potentialMrr ?? null),
    whyItMattersTr: item.whyItMattersTr?.trim() || "Bu fırsat yakından takip edilmeli.",
    hermesRecommendationTr: item.hermesRecommendationTr?.trim() || "Fırsatı incele ve nasıl ilerleyeceğine karar ver.",
    founderNextActionTr: item.founderNextActionTr?.trim() || "Şimdilik founder aksiyonu gerekmiyor.",
    founderActionLabelTr: item.founderActionLabelTr?.trim() || null,
    riskReasonsTr: (item.riskReasonsTr ?? []).slice(0, 2),
  };
}

export type ComputeRevenuePipelineViewInput = {
  items: RevenuePipelineApiItemLike[] | null;
  summary: RevenuePipelineApiSummaryLike | null;
  fetchState: "loading" | "ready" | "error";
  leadNameById?: Record<string, string>;
};

export function computeRevenuePipelineView(input: ComputeRevenuePipelineViewInput): HermesRevenuePipelineView {
  const items = input.items ?? [];
  const s = input.summary;

  const closestItems = items.filter((i) => CLOSEST_STAGES.has(i.stage)).slice(0, MAX_CARDS);
  const atRiskItems = items.filter((i) => i.health === "at_risk").slice(0, MAX_CARDS);

  const summary = {
    activeLabel: String(s?.active ?? items.filter((i) => !["won", "lost", "paused", "blocked"].includes(i.stage)).length),
    closestLabel: String(closestItems.length),
    atRiskLabel: String(s?.atRisk ?? atRiskItems.length),
    outcomePendingLabel: String(s?.outcomePending ?? items.filter((i) => i.stage === "outcome_pending").length),
    realizedMrrLabel: formatMrrLabel(s?.realizedMrr ?? null),
    potentialMrrLabel: formatMrrLabel(s?.potentialMrr ?? null),
    riskedMrrLabel: formatMrrLabel(s?.riskedMrr ?? null),
  };

  const closest = closestItems.map((i) => toCard(i, input.leadNameById));
  const atRisk = atRiskItems.map((i) => toCard(i, input.leadNameById));
  const hasWonOrLost = (s?.won ?? 0) + (s?.lost ?? 0) > 0;

  if (closest.length > 0 || atRisk.length > 0 || hasWonOrLost || items.length > 0) {
    return { mode: "ready", summary, closest, atRisk, hasWonOrLost };
  }
  if (input.fetchState === "loading") return { mode: "loading", summary, closest: [], atRisk: [], hasWonOrLost: false };
  if (input.fetchState === "error") return { mode: "error", summary, closest: [], atRisk: [], hasWonOrLost: false };
  return { mode: "empty", summary, closest: [], atRisk: [], hasWonOrLost: false };
}

/** Fırsat Odağı'na verilecek seçili lead'in pipeline özeti (varsa). */
export function selectRevenuePipelineForLead(
  items: RevenuePipelineApiItemLike[] | null,
  leadId: string | null,
): RevenuePipelineApiItemLike | null {
  if (!leadId) return null;
  return (items ?? []).find((i) => i.leadId === leadId) ?? null;
}

/**
 * Sprint C6 (Scope 12) — Hermes Bugün için gerçek verili ticari cümleler.
 * Yalnız gerçek sayılardan üretilir; uydurma yok, "bu ay" yalnız realized
 * gelir gerçekten varsa söylenir.
 */
export function buildRevenueDailyLines(summary: RevenuePipelineApiSummaryLike | null): string[] {
  if (!summary) return [];
  const lines: string[] = [];
  if (summary.atRisk > 0) {
    lines.push(`${summary.atRisk} fırsat risk altında ve kararını bekliyor.`);
  }
  if (summary.outcomePending > 0) {
    lines.push(`${summary.outcomePending} fırsat satış sonucunu bekliyor.`);
  }
  if (summary.realizedMrr != null && summary.realizedMrr > 0) {
    lines.push(`Kazanılan aylık gelir ₺${summary.realizedMrr.toLocaleString("tr-TR")}.`);
  }
  return lines;
}
