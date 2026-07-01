import type { ScoredLead } from "@/app/lib/leads";
import type { PackageTier, Priority } from "@/app/components/v2/mock/mock-queue";
import {
  derivePipelineStage,
  STAGE_META,
  type PipelineStage,
} from "@/app/components/v2/adapters/revenue-pipeline-adapter";

// ── types ─────────────────────────────────────────────────────

export type ForecastConfidenceLevel = "high" | "medium" | "low";
export type ForecastConfidenceLabel = "Yüksek" | "Orta" | "Düşük";

export type ForecastSortKey =
  | "forecast-contribution"
  | "probability"
  | "mrr"
  | "stage";

export type ForecastCard = {
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

  stageProbability: number;
  forecastContribution: number;

  confidenceLevel: ForecastConfidenceLevel;
  confidenceLabel: ForecastConfidenceLabel;

  forecastWindow: string;
  forecastWeek: 1 | 2 | 3 | 4;

  contactAttempts: number;
  lastContactedAtMs: number | null;
  lastContactLabel: string;
  nextFollowUpAtMs: number | null;

  actionLabel: string;
  outreachAngle: string;

  whyThisLead: string[];
  aiInsight: string;
  opportunityReasons: string[];
};

export type ForecastScenario = {
  label: string;
  mrr: number;
  arr: number;
  description: string;
  assumptions: string[];
};

export type ForecastWeekDistribution = {
  week: 1 | 2 | 3 | 4;
  label: string;
  forecastMrr: number;
  count: number;
};

export type ForecastSummary = {
  forecastMrr: number;
  forecastArr: number;
  expectedClosings: number;
  forecastConfidence: number;
  forecastConfidenceLabel: ForecastConfidenceLabel;
  conservative: ForecastScenario;
  realistic: ForecastScenario;
  optimistic: ForecastScenario;
  weeklyDistribution: ForecastWeekDistribution[];
  totalActive: number;
  topExpectedClosings: ForecastCard[];
  atRiskCards: ForecastCard[];
};

// ── stage probability model ───────────────────────────────────
//
// Each pipeline stage maps to a close probability (0–1).
// Conservative uses one-step-lower probabilities — representing
// only confirmed, contacted pipeline.
// Optimistic uses one-step-higher probabilities — representing
// a scenario where each lead advances one stage.

export const STAGE_PROBABILITY: Record<PipelineStage, number> = {
  new: 0.15,
  prioritized: 0.30,
  contacted: 0.45,
  "follow-up": 0.60,
  demo: 0.80,
  closing: 0.95,
};

const STAGE_PROB_CONSERVATIVE: Record<PipelineStage, number> = {
  new: 0.10,
  prioritized: 0.15,
  contacted: 0.30,
  "follow-up": 0.45,
  demo: 0.60,
  closing: 0.80,
};

const STAGE_PROB_OPTIMISTIC: Record<PipelineStage, number> = {
  new: 0.30,
  prioritized: 0.45,
  contacted: 0.60,
  "follow-up": 0.80,
  demo: 0.95,
  closing: 0.95,
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

// Confidence derives from stage advancement + contact evidence:
// closing → always high; demo + any contact → high;
// follow-up + contact → medium; contacted → medium; else → low
function deriveConfidenceLevel(
  stage: PipelineStage,
  contactAttempts: number,
  opportunityScore: number,
): ForecastConfidenceLevel {
  if (stage === "closing") return "high";
  if (stage === "demo" && (contactAttempts > 0 || opportunityScore >= 65)) return "high";
  if (stage === "demo") return "medium";
  if (stage === "follow-up" && contactAttempts > 0) return "medium";
  if (stage === "contacted") return "medium";
  return "low";
}

function toConfidenceLabel(level: ForecastConfidenceLevel): ForecastConfidenceLabel {
  if (level === "high") return "Yüksek";
  if (level === "medium") return "Orta";
  return "Düşük";
}

// Forecast window and monthly week bucket:
// closing → Week 1 (Bu Hafta)
// demo    → Week 2 (2 Hafta)
// follow-up → Week 3 (3 Hafta)
// all others → Week 4 (Bu Ay / later)
function deriveForecastWindow(
  stage: PipelineStage,
): { window: string; week: 1 | 2 | 3 | 4 } {
  switch (stage) {
    case "closing":
      return { window: "Bu Hafta", week: 1 };
    case "demo":
      return { window: "2 Hafta", week: 2 };
    case "follow-up":
      return { window: "3 Hafta", week: 3 };
    case "contacted":
      return { window: "Bu Ay", week: 4 };
    case "prioritized":
      return { window: "2 Ay", week: 4 };
    default:
      return { window: "3 Ay+", week: 4 };
  }
}

// ── format helpers ────────────────────────────────────────────

export function formatMrr(mrr: number): string {
  if (mrr >= 1_000_000) return `₺${(mrr / 1_000_000).toFixed(1)}M`;
  if (mrr >= 1_000) return `₺${Math.round(mrr / 1_000)}K`;
  return `₺${mrr}`;
}

export function formatProbabilityPct(prob: number): string {
  return `%${Math.round(prob * 100)}`;
}

// ── main adapter ──────────────────────────────────────────────

export function adaptScoredLeadsToForecastCards(
  scored: ScoredLead[],
): ForecastCard[] {
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

      const stage = derivePipelineStage(lead);
      const stageProbability = STAGE_PROBABILITY[stage];
      const forecastContribution = Math.round(weightedMrr * stageProbability);
      const contactAttempts = lead.contactAttempts ?? 0;
      const confidenceLevel = deriveConfidenceLevel(stage, contactAttempts, score);
      const { window, week } = deriveForecastWindow(stage);

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
        icpScore: Math.round(lead.icpFitScore ?? 0),

        baseMrr,
        weightedMrr,

        stageProbability,
        forecastContribution,

        confidenceLevel,
        confidenceLabel: toConfidenceLabel(confidenceLevel),

        forecastWindow: window,
        forecastWeek: week,

        contactAttempts,
        lastContactedAtMs: lastContactedMs,
        lastContactLabel: formatLastContact(lastContactedMs),
        nextFollowUpAtMs: nextFollowUpMs,

        actionLabel: ACTION_LABEL_TR[lead.recommendedAction ?? ""] ?? "—",
        outreachAngle: lead.outreachAngle ?? "",

        whyThisLead: lead.whyThisLead ?? [],
        aiInsight: lead.aiInsight ?? "",
        opportunityReasons: lead.opportunityReasons ?? [],
      };
    })
    .sort((a, b) => b.forecastContribution - a.forecastContribution);
}

// ── summary computation ───────────────────────────────────────

export function computeForecastSummary(cards: ForecastCard[]): ForecastSummary {
  const total = cards.length;

  if (total === 0) {
    const empty = (label: string): ForecastScenario => ({
      label,
      mrr: 0,
      arr: 0,
      description: "Aktif lead bulunamadı.",
      assumptions: [],
    });
    return {
      forecastMrr: 0,
      forecastArr: 0,
      expectedClosings: 0,
      forecastConfidence: 0,
      forecastConfidenceLabel: "Düşük",
      conservative: empty("İhtiyatlı"),
      realistic: empty("Gerçekçi"),
      optimistic: empty("İyimser"),
      weeklyDistribution: [],
      totalActive: 0,
      topExpectedClosings: [],
      atRiskCards: [],
    };
  }

  // ── realistic forecast (base case) ──────────────────────────
  const forecastMrr = cards.reduce((s, c) => s + c.forecastContribution, 0);
  const forecastArr = forecastMrr * 12;

  // Expected closings: stage is closing, or demo with high confidence
  const expectedClosings = cards.filter(
    (c) =>
      c.stage === "closing" ||
      (c.stage === "demo" && c.confidenceLevel === "high"),
  ).length;

  // ── forecast confidence (0–100) ──────────────────────────────
  // stagePart: average stage probability normalized to 0–50 pts
  // contactPart: ratio of leads with any contact, 0–30 pts
  // scorePart: average opportunity score, 0–20 pts
  const avgStageProbability =
    cards.reduce((s, c) => s + c.stageProbability, 0) / total;
  const stagePart = (avgStageProbability / 0.95) * 50;

  const contactedRatio =
    cards.filter((c) => c.contactAttempts > 0).length / total;
  const contactPart = contactedRatio * 30;

  const avgOpportunityScore =
    cards.reduce((s, c) => s + c.opportunityScore, 0) / total;
  const scorePart = (avgOpportunityScore / 100) * 20;

  const forecastConfidence = Math.min(
    100,
    Math.round(stagePart + contactPart + scorePart),
  );
  const forecastConfidenceLabel: ForecastConfidenceLabel =
    forecastConfidence >= 65
      ? "Yüksek"
      : forecastConfidence >= 40
        ? "Orta"
        : "Düşük";

  // ── conservative scenario ────────────────────────────────────
  // Only leads with real contact history in advanced stages,
  // using one-step-lower stage probabilities.
  const conservativeEligible = cards.filter(
    (c) =>
      c.contactAttempts > 0 &&
      (c.stage === "contacted" ||
        c.stage === "follow-up" ||
        c.stage === "demo" ||
        c.stage === "closing"),
  );
  const conservativeMrr = Math.round(
    conservativeEligible.reduce(
      (s, c) => s + c.weightedMrr * STAGE_PROB_CONSERVATIVE[c.stage],
      0,
    ),
  );

  // ── optimistic scenario ──────────────────────────────────────
  // All active leads using one-step-higher stage probabilities,
  // reflecting a scenario where every lead advances one stage.
  const optimisticMrr = Math.round(
    cards.reduce(
      (s, c) => s + c.weightedMrr * STAGE_PROB_OPTIMISTIC[c.stage],
      0,
    ),
  );

  // ── weekly distribution ──────────────────────────────────────
  const weeklyDistribution: ForecastWeekDistribution[] = (
    [1, 2, 3, 4] as const
  ).map((week) => {
    const wc = cards.filter((c) => c.forecastWeek === week);
    return {
      week,
      label: `Hafta ${week}`,
      forecastMrr: Math.round(
        wc.reduce((s, c) => s + c.forecastContribution, 0),
      ),
      count: wc.length,
    };
  });

  // ── top expected closings ────────────────────────────────────
  const topExpectedClosings = [...cards]
    .filter(
      (c) =>
        c.confidenceLevel === "high" ||
        (c.confidenceLevel === "medium" && c.stageRank >= 3),
    )
    .sort((a, b) => b.forecastContribution - a.forecastContribution)
    .slice(0, 5);

  // ── revenue at risk ──────────────────────────────────────────
  // Leads with low confidence but meaningful base MRR — potential
  // value that will slip if not actioned.
  const atRiskCards = [...cards]
    .filter((c) => c.confidenceLevel === "low" && c.weightedMrr >= 5_000)
    .sort((a, b) => b.weightedMrr - a.weightedMrr)
    .slice(0, 5);

  return {
    forecastMrr,
    forecastArr,
    expectedClosings,
    forecastConfidence,
    forecastConfidenceLabel,
    conservative: {
      label: "İhtiyatlı",
      mrr: conservativeMrr,
      arr: conservativeMrr * 12,
      description: "Yalnızca temas kurulan, ilerlemiş fırsatlar dahil edildi.",
      assumptions: [
        `${conservativeEligible.length} lead dahil (temas geçmişi olanlar)`,
        "Düşük dönüşüm olasılıkları uygulandı",
        "Yüksek belirsizlik payı hesaba katıldı",
      ],
    },
    realistic: {
      label: "Gerçekçi",
      mrr: forecastMrr,
      arr: forecastArr,
      description: "Tüm aktif leadler pipeline aşamalarına göre hesaplandı.",
      assumptions: [
        `${total} aktif lead dahil`,
        "Her aşama için standart dönüşüm olasılığı uygulandı",
        "Mevcut pipeline kalitesine dayalı baz senaryo",
      ],
    },
    optimistic: {
      label: "İyimser",
      mrr: optimisticMrr,
      arr: optimisticMrr * 12,
      description: "Tüm fırsatlar bir üst aşama olasılığıyla değerlendirildi.",
      assumptions: [
        `${total} aktif lead dahil`,
        "Bir aşama ilerleme varsayımıyla hesaplandı",
        "En iyi senaryo, pipeline momentumuna dayalı",
      ],
    },
    weeklyDistribution,
    totalActive: total,
    topExpectedClosings,
    atRiskCards,
  };
}
