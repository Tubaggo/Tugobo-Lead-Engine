import type { ScoredLead } from "@/app/lib/leads";
import type { PackageTier, Priority } from "@/app/components/v2/mock/mock-queue";
import {
  derivePipelineStage,
  STAGE_META,
  type PipelineStage,
} from "@/app/components/v2/adapters/revenue-pipeline-adapter";
import { STAGE_PROBABILITY } from "@/app/components/v2/adapters/revenue-forecast-adapter";

// ── types ─────────────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type RiskLevelLabel = "Düşük" | "Orta" | "Yüksek" | "Kritik";

export type RiskCategory =
  | "no-contact"
  | "low-score"
  | "low-icp"
  | "follow-up-overdue"
  | "pipeline-delay"
  | "weak-signals";

export type RiskSortKey = "risk-score" | "forecast-value" | "opportunity-score";

export type RiskCard = {
  id: string;
  hotelName: string;
  hotelType: string;
  city: string;
  packageTier: PackageTier;
  priority: Priority;
  outreachPriority: number;

  stage: PipelineStage;
  stageRank: number;

  opportunityScore: number;
  icpScore: number;

  baseMrr: number;
  weightedMrr: number;
  forecastContribution: number;
  stageProbability: number;

  riskScore: number;
  riskLevel: RiskLevel;
  riskLevelLabel: RiskLevelLabel;
  riskCategory: RiskCategory;
  riskCategoryLabel: string;
  riskRevenue: number;

  riskSignals: string[];
  recoveryAction: string;

  contactAttempts: number;
  lastContactedAtMs: number | null;
  lastContactLabel: string;
  nextFollowUpAtMs: number | null;
  isFollowUpOverdue: boolean;

  actionLabel: string;
  outreachAngle: string;

  whyThisLead: string[];
  aiInsight: string;
  opportunityReasons: string[];
};

export type RiskDistributionItem = {
  level: RiskLevel;
  label: RiskLevelLabel;
  count: number;
  riskRevenue: number;
};

export type BottleneckItem = {
  category: RiskCategory;
  label: string;
  count: number;
  totalRiskRevenue: number;
};

export type RiskSummary = {
  totalRiskRevenue: number;
  highRiskCount: number;
  riskExposurePct: number;
  avgRiskScore: number;
  totalForecastMrr: number;
  totalActive: number;
  riskDistribution: RiskDistributionItem[];
  topRiskCards: RiskCard[];
  operationalBottlenecks: BottleneckItem[];
  immediateActions: string[];
};

// ── constants ─────────────────────────────────────────────────

const TIER_BASE_MRR: Record<string, number> = {
  micro: 5_000,
  small: 10_000,
  medium: 15_000,
  premium: 25_000,
  enterprise: 40_000,
};

const ACTION_LABEL_TR: Record<string, string> = {
  send_whatsapp: "WhatsApp Gönder",
  follow_up: "Takip Et",
  research_more: "Araştır",
  wait: "Bekle",
  skip: "Atla",
};

export const RISK_LEVELS: RiskLevel[] = ["critical", "high", "medium", "low"];

export const RISK_LEVEL_META: Record<RiskLevel, { label: RiskLevelLabel }> = {
  critical: { label: "Kritik" },
  high: { label: "Yüksek" },
  medium: { label: "Orta" },
  low: { label: "Düşük" },
};

export const RISK_CATEGORY_LABEL: Record<RiskCategory, string> = {
  "no-contact": "Temas Yok",
  "low-score": "Düşük Skor",
  "low-icp": "Düşük ICP",
  "follow-up-overdue": "Gecikmiş Takip",
  "pipeline-delay": "Pipeline Gecikmesi",
  "weak-signals": "Zayıf Sinyal",
};

const RECOVERY_ACTION: Record<RiskCategory, string> = {
  "no-contact": "Hemen ilk temas kurun — WhatsApp mesajı veya telefon araması.",
  "low-score":
    "Fırsat değerlendirmesini derinleştirin; niteliksizse arşivleyin.",
  "low-icp":
    "ICP uyumunu kontrol edin; hedef segment dışındaysa önceliği düşürün.",
  "follow-up-overdue":
    "Gecikmiş takibi bugün gönderin — fırsat soğuyor.",
  "pipeline-delay":
    "Pipeline'da ilerleme sağlayın — demo veya teklife taşıyın.",
  "weak-signals":
    "Daha fazla veri toplayın ve iletişim kalitesini artırın.",
};

// ── helpers ───────────────────────────────────────────────────

function toPackageTier(tier?: string): PackageTier {
  switch (tier) {
    case "enterprise":
    case "premium":
      return "Enterprise";
    case "medium":
      return "Growth";
    case "small":
      return "Professional";
    default:
      return "Starter";
  }
}

function toPriority(bucket?: string): Priority {
  switch (bucket) {
    case "today":
      return "critical";
    case "high":
      return "high";
    case "medium":
      return "medium";
    default:
      return "low";
  }
}

function formatLastContact(ms: number | null): string {
  if (!ms) return "—";
  const diffH = (Date.now() - ms) / (60 * 60 * 1_000);
  if (diffH < 1) return "Az önce";
  if (diffH < 24) return `${Math.round(diffH)} saat önce`;
  const diffD = Math.round(diffH / 24);
  if (diffD === 1) return "Dün";
  if (diffD <= 7) return `${diffD} gün önce`;
  if (diffD <= 14) return "1 hafta önce";
  if (diffD <= 21) return "2 hafta önce";
  return `${Math.round(diffD / 7)} hafta önce`;
}

function deriveRiskLevel(score: number): RiskLevel {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

// ── risk score computation ────────────────────────────────────
//
// Risk Score (0–100) derives from measurable pipeline signals only.
// Revenue Risk = Forecast Contribution × (riskScore / 100)
//
// Signal weights:
//   No contact attempts    → +30
//   Opportunity score <40  → +25 | <55 → +15 | <70 → +8
//   ICP score <40          → +15 | <55 → +8
//   Pipeline stage: new    → +20 | prioritized → +15 | contacted → +8
//                  follow-up → +5 | demo → +2 | closing → +0
//   Follow-up overdue      → +15
//   Old last contact >14d  → +10 | >7d → +5
//
// Primary risk category: first matching signal by priority.

function computeRiskSignals(
  stage: PipelineStage,
  opportunityScore: number,
  icpScore: number,
  contactAttempts: number,
  lastContactedMs: number | null,
  nextFollowUpMs: number | null,
  now: number,
): {
  score: number;
  signals: string[];
  category: RiskCategory;
  isFollowUpOverdue: boolean;
} {
  let score = 0;
  const signals: string[] = [];

  if (contactAttempts === 0) {
    score += 30;
    signals.push("Hiç temas kurulmadı");
  }

  if (opportunityScore < 40) {
    score += 25;
    signals.push(`Düşük fırsat skoru (%${opportunityScore})`);
  } else if (opportunityScore < 55) {
    score += 15;
    signals.push(`Orta fırsat skoru (%${opportunityScore})`);
  } else if (opportunityScore < 70) {
    score += 8;
  }

  if (icpScore > 0 && icpScore < 40) {
    score += 15;
    signals.push(`Düşük ICP uyumu (%${icpScore})`);
  } else if (icpScore > 0 && icpScore < 55) {
    score += 8;
    signals.push(`Orta ICP uyumu (%${icpScore})`);
  }

  switch (stage) {
    case "new":
      score += 20;
      signals.push("Yeni fırsat — pipeline hareketi yok");
      break;
    case "prioritized":
      score += 15;
      signals.push("Önceliklendirildi — temas bekleniyor");
      break;
    case "contacted":
      score += 8;
      break;
    case "follow-up":
      score += 5;
      break;
    case "demo":
      score += 2;
      break;
    case "closing":
      break;
  }

  const isFollowUpOverdue = Boolean(nextFollowUpMs && nextFollowUpMs < now);
  if (isFollowUpOverdue) {
    score += 15;
    signals.push("Takip gecikmiş");
  }

  if (contactAttempts > 0 && lastContactedMs) {
    const daysSince = (now - lastContactedMs) / (1_000 * 60 * 60 * 24);
    if (daysSince > 14) {
      score += 10;
      signals.push(`Son temas ${Math.round(daysSince)} gün önce`);
    } else if (daysSince > 7) {
      score += 5;
      signals.push(`Son temas ${Math.round(daysSince)} gün önce`);
    }
  }

  let category: RiskCategory;
  if (contactAttempts === 0) {
    category = "no-contact";
  } else if (isFollowUpOverdue) {
    category = "follow-up-overdue";
  } else if (opportunityScore < 45) {
    category = "low-score";
  } else if (icpScore > 0 && icpScore < 45) {
    category = "low-icp";
  } else if (stage === "new" || stage === "prioritized") {
    category = "pipeline-delay";
  } else {
    category = "weak-signals";
  }

  return { score: Math.min(100, score), signals, category, isFollowUpOverdue };
}

// ── main adapter ──────────────────────────────────────────────

export function adaptScoredLeadsToRiskCards(scored: ScoredLead[]): RiskCard[] {
  const now = Date.now();

  return scored
    .filter((l) => l.priorityBucket !== "archive")
    .map((lead) => {
      const score = Math.round(
        lead.verifiedOpportunityScore ??
          lead.opportunityScore ??
          lead.leadScore ??
          50,
      );
      const baseMrr = TIER_BASE_MRR[lead.businessTier ?? "small"] ?? 10_000;
      const weightedMrr = Math.round(baseMrr * (score / 100));

      const lastContactedMs =
        typeof lead.lastContactedAt === "number" && lead.lastContactedAt > 0
          ? lead.lastContactedAt
          : null;
      const nextFollowUpMs =
        typeof lead.nextFollowUpAt === "number" && lead.nextFollowUpAt > 0
          ? lead.nextFollowUpAt
          : null;
      const contactAttempts = lead.contactAttempts ?? 0;
      const icpScore = Math.round(lead.icpFitScore ?? 0);

      const stage = derivePipelineStage(lead);
      const stageProbability = STAGE_PROBABILITY[stage];
      const forecastContribution = Math.round(weightedMrr * stageProbability);

      const { score: riskScore, signals: riskSignals, category: riskCategory, isFollowUpOverdue } =
        computeRiskSignals(
          stage,
          score,
          icpScore,
          contactAttempts,
          lastContactedMs,
          nextFollowUpMs,
          now,
        );

      const riskLevel = deriveRiskLevel(riskScore);
      const riskRevenue = Math.round(forecastContribution * (riskScore / 100));

      return {
        id: lead.id,
        hotelName: lead.name,
        hotelType: lead.type ?? "Hotel",
        city: lead.city,
        packageTier: toPackageTier(lead.businessTier),
        priority: toPriority(lead.priorityBucket),
        outreachPriority: lead.outreachPriority ?? 0,

        stage,
        stageRank: STAGE_META[stage].rank,

        opportunityScore: score,
        icpScore,

        baseMrr,
        weightedMrr,
        forecastContribution,
        stageProbability,

        riskScore,
        riskLevel,
        riskLevelLabel: RISK_LEVEL_META[riskLevel].label,
        riskCategory,
        riskCategoryLabel: RISK_CATEGORY_LABEL[riskCategory],
        riskRevenue,

        riskSignals,
        recoveryAction: RECOVERY_ACTION[riskCategory],

        contactAttempts,
        lastContactedAtMs: lastContactedMs,
        lastContactLabel: formatLastContact(lastContactedMs),
        nextFollowUpAtMs: nextFollowUpMs,
        isFollowUpOverdue,

        actionLabel: ACTION_LABEL_TR[lead.recommendedAction ?? ""] ?? "—",
        outreachAngle: lead.outreachAngle ?? "",

        whyThisLead: lead.whyThisLead ?? [],
        aiInsight: lead.aiInsight ?? "",
        opportunityReasons: lead.opportunityReasons ?? [],
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore || b.riskRevenue - a.riskRevenue);
}

// ── summary computation ───────────────────────────────────────

export function computeRiskSummary(cards: RiskCard[]): RiskSummary {
  const total = cards.length;

  if (total === 0) {
    return {
      totalRiskRevenue: 0,
      highRiskCount: 0,
      riskExposurePct: 0,
      avgRiskScore: 0,
      totalForecastMrr: 0,
      totalActive: 0,
      riskDistribution: [],
      topRiskCards: [],
      operationalBottlenecks: [],
      immediateActions: [],
    };
  }

  const totalRiskRevenue = cards.reduce((s, c) => s + c.riskRevenue, 0);
  const totalForecastMrr = cards.reduce((s, c) => s + c.forecastContribution, 0);
  const highRiskCount = cards.filter(
    (c) => c.riskLevel === "high" || c.riskLevel === "critical",
  ).length;
  const riskExposurePct =
    totalForecastMrr > 0
      ? Math.round((totalRiskRevenue / totalForecastMrr) * 100)
      : 0;
  const avgRiskScore = Math.round(
    cards.reduce((s, c) => s + c.riskScore, 0) / total,
  );

  const riskDistribution: RiskDistributionItem[] = (
    ["critical", "high", "medium", "low"] as RiskLevel[]
  ).map((level) => {
    const levelCards = cards.filter((c) => c.riskLevel === level);
    return {
      level,
      label: RISK_LEVEL_META[level].label,
      count: levelCards.length,
      riskRevenue: levelCards.reduce((s, c) => s + c.riskRevenue, 0),
    };
  });

  const topRiskCards = [...cards]
    .filter((c) => c.riskLevel === "high" || c.riskLevel === "critical")
    .sort((a, b) => b.riskRevenue - a.riskRevenue || b.riskScore - a.riskScore)
    .slice(0, 5);

  const bottleneckMap = new Map<
    RiskCategory,
    { count: number; totalRiskRevenue: number }
  >();
  for (const card of cards) {
    const existing = bottleneckMap.get(card.riskCategory) ?? {
      count: 0,
      totalRiskRevenue: 0,
    };
    bottleneckMap.set(card.riskCategory, {
      count: existing.count + 1,
      totalRiskRevenue: existing.totalRiskRevenue + card.riskRevenue,
    });
  }
  const operationalBottlenecks: BottleneckItem[] = [...bottleneckMap.entries()]
    .map(([category, data]) => ({
      category,
      label: RISK_CATEGORY_LABEL[category],
      count: data.count,
      totalRiskRevenue: data.totalRiskRevenue,
    }))
    .sort((a, b) => b.totalRiskRevenue - a.totalRiskRevenue)
    .slice(0, 4);

  const immediateActions: string[] = operationalBottlenecks
    .slice(0, 3)
    .map((b) => RECOVERY_ACTION[b.category]);

  return {
    totalRiskRevenue,
    highRiskCount,
    riskExposurePct,
    avgRiskScore,
    totalForecastMrr,
    totalActive: total,
    riskDistribution,
    topRiskCards,
    operationalBottlenecks,
    immediateActions,
  };
}

// ── format helpers ────────────────────────────────────────────

export function formatMrr(mrr: number): string {
  if (mrr >= 1_000_000) return `₺${(mrr / 1_000_000).toFixed(1)}M`;
  if (mrr >= 1_000) return `₺${Math.round(mrr / 1_000)}K`;
  return `₺${mrr}`;
}

export function formatPct(pct: number): string {
  return `%${pct}`;
}
