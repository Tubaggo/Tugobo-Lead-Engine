import type { RecoveryCard } from "./revenue-recovery-adapter";
import type { PipelineCard } from "./revenue-pipeline-adapter";
import { STAGE_META, type PipelineStage } from "./revenue-pipeline-adapter";

// ── types ─────────────────────────────────────────────────────

export type CommandFilter =
  | "all"
  | "critical"
  | "today"
  | "revenue"
  | "recovery"
  | "risk";

export type PipelineStageSnapshot = {
  stage: PipelineStage;
  label: string;
  count: number;
  totalWeightedMrr: number;
  rank: number;
};

export type FounderBrief = {
  revenueSummary: string;
  riskSummary: string;
  recoverySummary: string;
  prioritySummary: string;
};

export type CommandSummary = {
  // Top KPIs
  expectedRevenue: number;
  revenueAtRisk: number;
  recoverableRevenue: number;
  todaysOpportunities: number;

  // Aggregated sections — all derived from existing adapters, no new calculations
  priorityQueue: RecoveryCard[];
  recoveryAlerts: RecoveryCard[];
  criticalRisks: RecoveryCard[];
  commAlerts: RecoveryCard[];
  followUpToday: RecoveryCard[];
  pipelineSnapshot: PipelineStageSnapshot[];

  // Founder Brief for no-selection context panel
  founderBrief: FounderBrief;
  operatingSequence: string[];
};

// ── aggregation ───────────────────────────────────────────────
//
// This function owns zero business logic.
// Everything here is a slice/sort/count of existing adapter outputs.
// Risk/recovery/forecast calculations live in their respective adapters.

export function computeCommandCenter(
  recoveryCards: RecoveryCard[],
  pipelineCards: PipelineCard[],
): CommandSummary {
  const d = new Date();
  const todayStartMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const todayEndMs = todayStartMs + 86_400_000 - 1;

  // KPIs — all values already computed in recovery/risk/forecast adapters
  const expectedRevenue = recoveryCards.reduce((s, c) => s + c.forecastContribution, 0);
  const revenueAtRisk = recoveryCards.reduce((s, c) => s + c.riskRevenue, 0);
  const recoverableRevenue = recoveryCards.reduce((s, c) => s + c.recoveryRevenue, 0);
  const todaysOpportunities = recoveryCards.filter((c) => c.priority === "critical").length;

  // Priority Queue: top 5 by outreachPriority then opportunityScore
  const priorityQueue = [...recoveryCards]
    .sort(
      (a, b) =>
        b.outreachPriority - a.outreachPriority ||
        b.opportunityScore - a.opportunityScore,
    )
    .slice(0, 5);

  // Recovery Alerts: top 5 non-lost by recoveryRevenue
  const recoveryAlerts = [...recoveryCards]
    .filter((c) => c.recoveryLevel !== "lost")
    .sort((a, b) => b.recoveryRevenue - a.recoveryRevenue)
    .slice(0, 5);

  // Critical Risks: top 5 high/critical by riskRevenue
  const criticalRisks = [...recoveryCards]
    .filter((c) => c.riskLevel === "high" || c.riskLevel === "critical")
    .sort((a, b) => b.riskRevenue - a.riskRevenue || b.riskScore - a.riskScore)
    .slice(0, 5);

  // Communication Alerts: no contact attempts yet, by opportunityScore
  const commAlerts = [...recoveryCards]
    .filter((c) => c.contactAttempts === 0)
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, 5);

  // Follow-up Today: overdue or scheduled within today
  const followUpToday = [...recoveryCards]
    .filter((c) => {
      if (c.isFollowUpOverdue) return true;
      const fu = c.nextFollowUpAtMs;
      return fu !== null && fu >= todayStartMs && fu <= todayEndMs;
    })
    .sort((a, b) => {
      const aO = a.isFollowUpOverdue ? 0 : 1;
      const bO = b.isFollowUpOverdue ? 0 : 1;
      return aO - bO || b.opportunityScore - a.opportunityScore;
    })
    .slice(0, 5);

  // Pipeline Snapshot — from pipelineCards (covers all leads, not just at-risk)
  const ORDERED: PipelineStage[] = [
    "new",
    "prioritized",
    "contacted",
    "follow-up",
    "demo",
    "closing",
  ];
  const stageAgg = new Map<PipelineStage, { count: number; mrr: number }>();
  for (const c of pipelineCards) {
    const prev = stageAgg.get(c.stage) ?? { count: 0, mrr: 0 };
    stageAgg.set(c.stage, { count: prev.count + 1, mrr: prev.mrr + c.weightedMrr });
  }
  const pipelineSnapshot: PipelineStageSnapshot[] = ORDERED.map((stage) => ({
    stage,
    label: STAGE_META[stage].label,
    count: stageAgg.get(stage)?.count ?? 0,
    totalWeightedMrr: stageAgg.get(stage)?.mrr ?? 0,
    rank: STAGE_META[stage].rank,
  })).filter((s) => s.count > 0);

  // Founder Brief — deterministic narrative from aggregated data
  const overdueCount = followUpToday.filter((c) => c.isFollowUpOverdue).length;
  const topLead = priorityQueue[0] ?? null;
  const founderBrief: FounderBrief = {
    revenueSummary: `${recoveryCards.length} aktif fırsatta toplam ${fmt(expectedRevenue)} gelir tahmini.`,
    riskSummary:
      criticalRisks.length > 0
        ? `${criticalRisks.length} fırsat yüksek risk altında — ${fmt(revenueAtRisk)} gelir tehlikede.`
        : "Yüksek riskli fırsat yok — pipeline sağlıklı.",
    recoverySummary: `${recoveryAlerts.length} fırsatta ${fmt(recoverableRevenue)} kurtarılabilir gelir mevcut.`,
    prioritySummary: topLead
      ? `En yüksek öncelik: ${topLead.hotelName} — ${topLead.actionLabel}.`
      : "Bugün için kritik öncelikli fırsat yok.",
  };

  // Operating Sequence — up to 4 actionable steps
  const operatingSequence: string[] = [];
  if (overdueCount > 0) {
    operatingSequence.push(`${overdueCount} gecikmiş takibi tamamlayın — fırsatlar soğuyor.`);
  }
  if (commAlerts.length > 0) {
    operatingSequence.push(`${commAlerts.length} fırsata ilk teması başlatın.`);
  }
  if (criticalRisks[0]) {
    operatingSequence.push(
      `${criticalRisks[0].hotelName}: ${criticalRisks[0].recoveryAction}`,
    );
  }
  const topQuickWin = recoveryAlerts.find((c) => c.recoveryCategory === "quick-win");
  if (topQuickWin) {
    operatingSequence.push(
      `Hızlı kazanım — ${topQuickWin.hotelName}: ${topQuickWin.recoveryAction}`,
    );
  }
  if (operatingSequence.length === 0) {
    operatingSequence.push("Pipeline'daki en yüksek değerli fırsatları çalışın.");
  }

  return {
    expectedRevenue,
    revenueAtRisk,
    recoverableRevenue,
    todaysOpportunities,
    priorityQueue,
    recoveryAlerts,
    criticalRisks,
    commAlerts,
    followUpToday,
    pipelineSnapshot,
    founderBrief,
    operatingSequence,
  };
}

// ── format helpers ────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `₺${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₺${Math.round(n / 1_000)}K`;
  return `₺${n}`;
}

export function formatMrr(n: number): string {
  return fmt(n);
}

export function formatPct(pct: number): string {
  return `%${pct}`;
}
