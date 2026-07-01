import type { RecoveryCard } from "./revenue-recovery-adapter";
import type { CommCard } from "./communication-intelligence-adapter";
import type { PipelineCard } from "./revenue-pipeline-adapter";
import type { PackageTier } from "@/app/components/v2/mock/mock-queue";
import { STAGE_META, type PipelineStage } from "./revenue-pipeline-adapter";

// ── types ─────────────────────────────────────────────────────

export type AnalyticsFilter =
  | "all"
  | "high-opportunity"
  | "strong-icp"
  | "high-risk"
  | "high-recovery"
  | "multi-channel";

export type AnalyticsSortKey =
  | "opportunity-value"
  | "icp-score"
  | "risk-revenue"
  | "recovery-revenue"
  | "comm-score";

// AnalyticsCard enriches RecoveryCard with comm data + analytics flags.
// No new business logic — flags are simple threshold reads.
export type AnalyticsCard = RecoveryCard & {
  commScore: number;
  channelCount: number;
  bestChannel: string;
  isHighOpportunity: boolean;
  isStrongIcp: boolean;
  isHighRisk: boolean;
  isHighRecovery: boolean;
  isMultiChannelReady: boolean;
};

export type CitySegment = {
  city: string;
  count: number;
  totalForecastRevenue: number;
  avgOpportunityScore: number;
};

export type TierSegment = {
  tier: PackageTier;
  count: number;
  totalForecastRevenue: number;
  avgOpportunityScore: number;
};

export type FunnelStage = {
  stage: PipelineStage;
  label: string;
  shortLabel: string;
  count: number;
  totalWeightedMrr: number;
  rank: number;
};

export type AnalyticsInsight = {
  text: string;
  accent: "indigo" | "emerald" | "rose" | "amber" | "sky" | "violet";
};

export type AnalyticsSummary = {
  // Top KPIs
  totalOpportunityValue: number;
  avgOpportunityScore: number;
  icpFitRate: number;
  recoveryEfficiency: number;

  // Performance Overview
  totalLeads: number;
  qualifiedLeads: number;
  highIcpLeads: number;
  highCommLeads: number;
  forecastRevenue: number;
  riskRevenue: number;
  recoverableRevenue: number;
  riskSharePct: number;
  overdueCount: number;

  // Segments
  citySegments: CitySegment[];
  tierSegments: TierSegment[];

  // Funnel
  funnelStages: FunnelStage[];
  bottleneckLabel: string;

  // Insights
  topInsights: AnalyticsInsight[];
  bestChannel: string;
  bestChannelCount: number;
  improvementFocus: string;
};

// ── short stage labels for the funnel flow ─────────────────────

const SHORT_STAGE_LABEL: Record<PipelineStage, string> = {
  new: "Yeni",
  prioritized: "Önce",
  contacted: "Temas",
  "follow-up": "Takip",
  demo: "Demo",
  closing: "Kapanış",
};

// ── main adapter ──────────────────────────────────────────────
//
// Joins RecoveryCard[] with CommCard[] (by id) to produce AnalyticsCard[].
// All calculations derive from existing adapter outputs — no new logic.

export function adaptScoredLeadsToAnalyticsCards(
  recoveryCards: RecoveryCard[],
  commCards: CommCard[],
): AnalyticsCard[] {
  const commMap = new Map(commCards.map((c) => [c.id, c]));

  return recoveryCards.map((rc) => {
    const comm = commMap.get(rc.id);
    const commScore = comm?.commScore ?? 0;
    const channelCount = comm?.channelCount ?? 0;
    const bestChannel = comm?.bestChannel ?? "—";

    return {
      ...rc,
      commScore,
      channelCount,
      bestChannel,
      isHighOpportunity: rc.opportunityScore >= 65,
      isStrongIcp: rc.icpScore >= 65,
      isHighRisk: rc.riskLevel === "high" || rc.riskLevel === "critical",
      isHighRecovery: rc.recoveryLevel === "high" || rc.recoveryLevel === "medium",
      isMultiChannelReady: channelCount >= 2,
    } as AnalyticsCard;
  });
}

// ── summary computation ───────────────────────────────────────

export function computeAnalyticsSummary(
  cards: AnalyticsCard[],
  pipelineCards: PipelineCard[],
): AnalyticsSummary {
  const total = cards.length;

  if (total === 0) {
    return {
      totalOpportunityValue: 0,
      avgOpportunityScore: 0,
      icpFitRate: 0,
      recoveryEfficiency: 0,
      totalLeads: 0,
      qualifiedLeads: 0,
      highIcpLeads: 0,
      highCommLeads: 0,
      forecastRevenue: 0,
      riskRevenue: 0,
      recoverableRevenue: 0,
      riskSharePct: 0,
      overdueCount: 0,
      citySegments: [],
      tierSegments: [],
      funnelStages: [],
      bottleneckLabel: "—",
      topInsights: [],
      bestChannel: "—",
      bestChannelCount: 0,
      improvementFocus: "Aktif lead bulunamadı.",
    };
  }

  // KPIs
  const forecastRevenue = cards.reduce((s, c) => s + c.forecastContribution, 0);
  const riskRevenue = cards.reduce((s, c) => s + c.riskRevenue, 0);
  const recoverableRevenue = cards.reduce((s, c) => s + c.recoveryRevenue, 0);
  const avgOpportunityScore = Math.round(
    cards.reduce((s, c) => s + c.opportunityScore, 0) / total,
  );
  const icpFitRate = Math.round(
    (cards.filter((c) => c.icpScore >= 60).length / total) * 100,
  );
  const recoveryEfficiency =
    riskRevenue > 0 ? Math.round((recoverableRevenue / riskRevenue) * 100) : 0;

  // Performance Overview
  const qualifiedLeads = cards.filter((c) => c.opportunityScore >= 60).length;
  const highIcpLeads = cards.filter((c) => c.icpScore >= 65).length;
  const highCommLeads = cards.filter((c) => c.isMultiChannelReady).length;
  const riskSharePct =
    forecastRevenue > 0 ? Math.round((riskRevenue / forecastRevenue) * 100) : 0;
  const overdueCount = cards.filter((c) => c.isFollowUpOverdue).length;

  // City Segments — top 5 by forecastRevenue
  const cityAgg = new Map<string, { count: number; forecast: number; scoreSum: number }>();
  for (const c of cards) {
    if (!c.city) continue;
    const prev = cityAgg.get(c.city) ?? { count: 0, forecast: 0, scoreSum: 0 };
    cityAgg.set(c.city, {
      count: prev.count + 1,
      forecast: prev.forecast + c.forecastContribution,
      scoreSum: prev.scoreSum + c.opportunityScore,
    });
  }
  const citySegments: CitySegment[] = [...cityAgg.entries()]
    .map(([city, d]) => ({
      city,
      count: d.count,
      totalForecastRevenue: d.forecast,
      avgOpportunityScore: Math.round(d.scoreSum / d.count),
    }))
    .sort((a, b) => b.totalForecastRevenue - a.totalForecastRevenue)
    .slice(0, 5);

  // Tier Segments
  const tierAgg = new Map<PackageTier, { count: number; forecast: number; scoreSum: number }>();
  for (const c of cards) {
    const prev = tierAgg.get(c.packageTier) ?? { count: 0, forecast: 0, scoreSum: 0 };
    tierAgg.set(c.packageTier, {
      count: prev.count + 1,
      forecast: prev.forecast + c.forecastContribution,
      scoreSum: prev.scoreSum + c.opportunityScore,
    });
  }
  const tierSegments: TierSegment[] = [...tierAgg.entries()]
    .map(([tier, d]) => ({
      tier,
      count: d.count,
      totalForecastRevenue: d.forecast,
      avgOpportunityScore: Math.round(d.scoreSum / d.count),
    }))
    .sort((a, b) => b.totalForecastRevenue - a.totalForecastRevenue);

  // Funnel Stages from pipelineCards
  const ORDERED: PipelineStage[] = [
    "new", "prioritized", "contacted", "follow-up", "demo", "closing",
  ];
  const stageAgg = new Map<PipelineStage, { count: number; mrr: number }>();
  for (const c of pipelineCards) {
    const prev = stageAgg.get(c.stage) ?? { count: 0, mrr: 0 };
    stageAgg.set(c.stage, { count: prev.count + 1, mrr: prev.mrr + c.weightedMrr });
  }
  const funnelStages: FunnelStage[] = ORDERED
    .map((stage) => ({
      stage,
      label: STAGE_META[stage].label,
      shortLabel: SHORT_STAGE_LABEL[stage],
      count: stageAgg.get(stage)?.count ?? 0,
      totalWeightedMrr: stageAgg.get(stage)?.mrr ?? 0,
      rank: STAGE_META[stage].rank,
    }))
    .filter((s) => s.count > 0);

  // Bottleneck: early stage (rank ≤ 2) with highest count
  const earlyBottleneck = funnelStages
    .filter((s) => s.rank <= 2 && s.count >= 2)
    .sort((a, b) => b.count - a.count)[0] ?? null;
  const bottleneckLabel = earlyBottleneck
    ? `${earlyBottleneck.label} (${earlyBottleneck.count} fırsat)`
    : "Darboğaz yok";

  // Best Channel
  const channelAgg = new Map<string, number>();
  for (const c of cards) {
    if (c.bestChannel && c.bestChannel !== "—" && c.channelCount > 0) {
      channelAgg.set(c.bestChannel, (channelAgg.get(c.bestChannel) ?? 0) + 1);
    }
  }
  const topChannel = [...channelAgg.entries()].sort((a, b) => b[1] - a[1])[0];
  const bestChannel = topChannel?.[0] ?? "—";
  const bestChannelCount = topChannel?.[1] ?? 0;

  // Top Insights (deterministic from aggregated data)
  const topInsights: AnalyticsInsight[] = [];

  if (citySegments[0]) {
    topInsights.push({
      text: `En güçlü şehir: ${citySegments[0].city} — ${citySegments[0].count} fırsat, ${fmt(citySegments[0].totalForecastRevenue)} tahmini gelir`,
      accent: "indigo",
    });
  }
  if (earlyBottleneck) {
    topInsights.push({
      text: `Pipeline darboğazı: "${earlyBottleneck.label}" aşamasında ${earlyBottleneck.count} fırsat beklemede`,
      accent: "amber",
    });
  }
  if (bestChannel !== "—") {
    topInsights.push({
      text: `En erişilebilir iletişim kanalı: ${bestChannel} — ${bestChannelCount} fırsatta hazır`,
      accent: "sky",
    });
  }
  const highRecoveryRevenue = cards
    .filter((c) => c.isHighRecovery)
    .reduce((s, c) => s + c.recoveryRevenue, 0);
  if (highRecoveryRevenue > 0) {
    topInsights.push({
      text: `Yüksek kurtarma potansiyeli: ${cards.filter((c) => c.isHighRecovery).length} fırsatta ${fmt(highRecoveryRevenue)} kurtarılabilir`,
      accent: "emerald",
    });
  }
  if (overdueCount >= 2) {
    const overdueRisk = cards
      .filter((c) => c.isFollowUpOverdue)
      .reduce((s, c) => s + c.riskRevenue, 0);
    topInsights.push({
      text: `Gecikmiş takip riski: ${overdueCount} fırsat ${fmt(overdueRisk)} geliri tehdit ediyor`,
      accent: "rose",
    });
  }

  // Improvement Focus (deterministic single recommendation)
  let improvementFocus: string;
  if (riskSharePct > 50) {
    improvementFocus = "Risk altındaki geliri azaltın — tahminin yarısından fazlası risk altında.";
  } else if (icpFitRate < 40) {
    improvementFocus = "ICP uyumunu artırın — leadlerin büyük çoğunluğu ideal müşteri profiline uymuyor.";
  } else if (overdueCount >= 3) {
    improvementFocus = "Gecikmiş takipleri kapatın — satış hızının önündeki en büyük engel bu.";
  } else if (earlyBottleneck) {
    improvementFocus = `Pipeline darboğazını açın: ${earlyBottleneck.label} aşamasında ${earlyBottleneck.count} fırsat bekliyor.`;
  } else {
    improvementFocus = "Pipeline kalitesi iyi — yeni fırsat üretimine ve ICP kapsama genişletmeye odaklanın.";
  }

  return {
    totalOpportunityValue: forecastRevenue,
    avgOpportunityScore,
    icpFitRate,
    recoveryEfficiency,
    totalLeads: total,
    qualifiedLeads,
    highIcpLeads,
    highCommLeads,
    forecastRevenue,
    riskRevenue,
    recoverableRevenue,
    riskSharePct,
    overdueCount,
    citySegments,
    tierSegments,
    funnelStages,
    bottleneckLabel,
    topInsights,
    bestChannel,
    bestChannelCount,
    improvementFocus,
  };
}

// ── sort utility ──────────────────────────────────────────────

export function sortAnalyticsCards(
  cards: AnalyticsCard[],
  sortKey: AnalyticsSortKey,
): AnalyticsCard[] {
  return [...cards].sort((a, b) => {
    switch (sortKey) {
      case "opportunity-value":
        return b.forecastContribution - a.forecastContribution;
      case "icp-score":
        return b.icpScore - a.icpScore;
      case "risk-revenue":
        return b.riskRevenue - a.riskRevenue;
      case "recovery-revenue":
        return b.recoveryRevenue - a.recoveryRevenue;
      case "comm-score":
        return b.commScore - a.commScore;
    }
  });
}

// ── format helpers ────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `₺${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₺${Math.round(n / 1_000)}K`;
  return `₺${n}`;
}

export function formatMrr(n: number): string { return fmt(n); }
export function formatPct(pct: number): string { return `%${pct}`; }
