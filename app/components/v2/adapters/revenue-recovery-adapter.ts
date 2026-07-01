import type { ScoredLead } from "@/app/lib/leads";
import type { PackageTier, Priority } from "@/app/components/v2/mock/mock-queue";
import {
  STAGE_META,
  type PipelineStage,
} from "@/app/components/v2/adapters/revenue-pipeline-adapter";
import {
  adaptScoredLeadsToRiskCards,
  type RiskLevel,
  type RiskLevelLabel,
  RISK_LEVEL_META,
} from "@/app/components/v2/adapters/revenue-risk-adapter";

// ── types ─────────────────────────────────────────────────────

export type RecoveryLevel = "high" | "medium" | "low" | "lost";
export type RecoveryLevelLabel = "Yüksek" | "Orta" | "Düşük" | "Kayıp";

export type RecoveryCategory =
  | "quick-win"
  | "needs-follow-up"
  | "needs-demo"
  | "needs-contact"
  | "needs-qualification";

export type RecoverySortKey =
  | "recovery-score"
  | "recoverable-revenue"
  | "risk-score"
  | "opportunity-score";

export type RecoveryCard = {
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
  riskRevenue: number;

  recoveryScore: number;
  recoveryProbability: number;
  recoveryLevel: RecoveryLevel;
  recoveryLevelLabel: RecoveryLevelLabel;
  recoveryCategory: RecoveryCategory;
  recoveryCategoryLabel: string;
  recoveryRevenue: number;
  recoveryReason: string;
  recoverySignals: string[];
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

export type RecoveryDistributionItem = {
  level: RecoveryLevel;
  label: RecoveryLevelLabel;
  count: number;
  recoveryRevenue: number;
};

export type RecoverySummary = {
  totalRecoveryRevenue: number;
  totalRiskRevenue: number;
  recoveryOpportunityCount: number;
  avgRecoveryScore: number;
  recoveryEfficiencyPct: number;
  totalActive: number;
  recoveryDistribution: RecoveryDistributionItem[];
  topRecoveryCards: RecoveryCard[];
  quickWins: RecoveryCard[];
  operationalRecommendations: string[];
};

// ── constants ─────────────────────────────────────────────────

export const RECOVERY_LEVELS: RecoveryLevel[] = ["high", "medium", "low", "lost"];

export const RECOVERY_LEVEL_META: Record<RecoveryLevel, { label: RecoveryLevelLabel }> = {
  high: { label: "Yüksek" },
  medium: { label: "Orta" },
  low: { label: "Düşük" },
  lost: { label: "Kayıp" },
};

export const RECOVERY_CATEGORY_LABEL: Record<RecoveryCategory, string> = {
  "quick-win": "Hızlı Kazanım",
  "needs-follow-up": "Takip Gerekli",
  "needs-demo": "Demo Gerekli",
  "needs-contact": "Temas Gerekli",
  "needs-qualification": "Nitelendirme Gerekli",
};

const RECOVERY_ACTION_TEXT: Record<RecoveryCategory, string> = {
  "quick-win":
    "Bugün karar vericiye ulaşın — kapanış için son bir push yapın.",
  "needs-follow-up":
    "Takip mesajı gönderin — önceki temasa değer önerisi ekleyin.",
  "needs-demo":
    "Demo veya teklif sunumu planlayın — fırsat ilerlenmeye hazır.",
  "needs-contact":
    "İlk temas kurun — WhatsApp mesajı veya telefon araması.",
  "needs-qualification":
    "ICP uyumunu doğrulayın; değerliyse yeniden önceliklendirin.",
};

// ── stage base recovery scores ────────────────────────────────
//
// How much a lead's pipeline position alone contributes to
// recovery probability — later stages = more momentum = easier to recover.

const STAGE_RECOVERY_BASE: Record<PipelineStage, number> = {
  closing: 40,
  demo: 30,
  "follow-up": 20,
  contacted: 12,
  prioritized: 5,
  new: 0,
};

// ── recovery score computation ────────────────────────────────
//
// Recovery Score (0–100) measures how likely we can recover
// the at-risk revenue from this lead.
//
// Recovery Revenue = riskRevenue × (recoveryScore / 100)
//
// Signal contributions:
//   Pipeline stage base:  closing +40 | demo +30 | follow-up +20
//                         contacted +12 | prioritized +5 | new +0
//   ICP ≥70: +20 | ≥55: +12 | ≥40: +6
//   Contact ≥3: +15 | ≥1: +10
//   Last contact < 7d: +10 | < 14d: +5
//   Future follow-up scheduled: +8
//   Opportunity score ≥70: +10 | ≥55: +6
//   Follow-up overdue penalty: −5
//
// Primary category: first matching condition from priority list.

function computeRecoverySignals(
  stage: PipelineStage,
  opportunityScore: number,
  icpScore: number,
  contactAttempts: number,
  lastContactedAtMs: number | null,
  nextFollowUpAtMs: number | null,
  isFollowUpOverdue: boolean,
  now: number,
): {
  score: number;
  signals: string[];
  category: RecoveryCategory;
  reason: string;
} {
  let score = STAGE_RECOVERY_BASE[stage];
  const signals: string[] = [];

  if (stage === "closing") {
    signals.push("Kapanışa yakın — en yüksek kurtarma potansiyeli");
  } else if (stage === "demo") {
    signals.push("Demo / teklif aşamasında — kapanışa yakın");
  } else if (stage === "follow-up") {
    signals.push("Aktif takip sürecinde");
  } else if (stage === "contacted") {
    signals.push("Temas kurulmuş — yanıt bekleniyor");
  }

  if (icpScore >= 70) {
    score += 20;
    signals.push(`Güçlü ICP uyumu (%${icpScore})`);
  } else if (icpScore >= 55) {
    score += 12;
    signals.push(`İyi ICP uyumu (%${icpScore})`);
  } else if (icpScore >= 40) {
    score += 6;
  }

  if (contactAttempts >= 3) {
    score += 15;
    signals.push(`${contactAttempts}x temas — güçlü ilişki`);
  } else if (contactAttempts > 0) {
    score += 10;
    signals.push(`${contactAttempts}x temas yapıldı`);
  }

  if (lastContactedAtMs) {
    const daysSince = (now - lastContactedAtMs) / (1_000 * 60 * 60 * 24);
    if (daysSince < 7) {
      score += 10;
      signals.push("Son temas bu hafta içinde");
    } else if (daysSince < 14) {
      score += 5;
      signals.push("Son temas 2 hafta içinde");
    }
  }

  if (nextFollowUpAtMs && nextFollowUpAtMs > now) {
    score += 8;
    signals.push("Takip planlandı");
  }

  if (opportunityScore >= 70) {
    score += 10;
    signals.push(`Yüksek fırsat skoru (%${opportunityScore})`);
  } else if (opportunityScore >= 55) {
    score += 6;
  }

  if (isFollowUpOverdue) {
    score = Math.max(0, score - 5);
  }

  const finalScore = Math.min(100, score);

  let category: RecoveryCategory;
  if (finalScore >= 65 && (stage === "closing" || stage === "demo")) {
    category = "quick-win";
  } else if (contactAttempts === 0) {
    category = "needs-contact";
  } else if (isFollowUpOverdue) {
    category = "needs-follow-up";
  } else if (stage === "contacted" || stage === "follow-up") {
    category = "needs-demo";
  } else if (icpScore < 40 || opportunityScore < 40) {
    category = "needs-qualification";
  } else {
    category = "needs-follow-up";
  }

  const reason = signals[0] ?? STAGE_META[stage].label;

  return { score: finalScore, signals, category, reason };
}

function deriveRecoveryLevel(score: number): RecoveryLevel {
  if (score >= 65) return "high";
  if (score >= 35) return "medium";
  if (score >= 10) return "low";
  return "lost";
}

// ── main adapter ──────────────────────────────────────────────

export function adaptScoredLeadsToRecoveryCards(
  scored: ScoredLead[],
): RecoveryCard[] {
  const now = Date.now();
  const riskCards = adaptScoredLeadsToRiskCards(scored);

  return riskCards
    .map((rc) => {
      const {
        score: recoveryScore,
        signals: recoverySignals,
        category: recoveryCategory,
        reason: recoveryReason,
      } = computeRecoverySignals(
        rc.stage,
        rc.opportunityScore,
        rc.icpScore,
        rc.contactAttempts,
        rc.lastContactedAtMs,
        rc.nextFollowUpAtMs,
        rc.isFollowUpOverdue,
        now,
      );

      const recoveryProbability = recoveryScore / 100;
      const recoveryRevenue = Math.round(rc.riskRevenue * recoveryProbability);
      const recoveryLevel = deriveRecoveryLevel(recoveryScore);

      return {
        id: rc.id,
        hotelName: rc.hotelName,
        hotelType: rc.hotelType,
        city: rc.city,
        packageTier: rc.packageTier,
        priority: rc.priority,
        outreachPriority: rc.outreachPriority,

        stage: rc.stage,
        stageRank: rc.stageRank,

        opportunityScore: rc.opportunityScore,
        icpScore: rc.icpScore,

        baseMrr: rc.baseMrr,
        weightedMrr: rc.weightedMrr,
        forecastContribution: rc.forecastContribution,
        stageProbability: rc.stageProbability,

        riskScore: rc.riskScore,
        riskLevel: rc.riskLevel,
        riskLevelLabel: RISK_LEVEL_META[rc.riskLevel].label,
        riskRevenue: rc.riskRevenue,

        recoveryScore,
        recoveryProbability,
        recoveryLevel,
        recoveryLevelLabel: RECOVERY_LEVEL_META[recoveryLevel].label,
        recoveryCategory,
        recoveryCategoryLabel: RECOVERY_CATEGORY_LABEL[recoveryCategory],
        recoveryRevenue,
        recoveryReason,
        recoverySignals,
        recoveryAction: RECOVERY_ACTION_TEXT[recoveryCategory],

        contactAttempts: rc.contactAttempts,
        lastContactedAtMs: rc.lastContactedAtMs,
        lastContactLabel: rc.lastContactLabel,
        nextFollowUpAtMs: rc.nextFollowUpAtMs,
        isFollowUpOverdue: rc.isFollowUpOverdue,

        actionLabel: rc.actionLabel,
        outreachAngle: rc.outreachAngle,
        whyThisLead: rc.whyThisLead,
        aiInsight: rc.aiInsight,
        opportunityReasons: rc.opportunityReasons,
      };
    })
    .sort(
      (a, b) =>
        b.recoveryRevenue - a.recoveryRevenue ||
        b.recoveryScore - a.recoveryScore,
    );
}

// ── summary computation ───────────────────────────────────────

export function computeRecoverySummary(cards: RecoveryCard[]): RecoverySummary {
  const total = cards.length;

  if (total === 0) {
    return {
      totalRecoveryRevenue: 0,
      totalRiskRevenue: 0,
      recoveryOpportunityCount: 0,
      avgRecoveryScore: 0,
      recoveryEfficiencyPct: 0,
      totalActive: 0,
      recoveryDistribution: [],
      topRecoveryCards: [],
      quickWins: [],
      operationalRecommendations: [],
    };
  }

  const totalRecoveryRevenue = cards.reduce((s, c) => s + c.recoveryRevenue, 0);
  const totalRiskRevenue = cards.reduce((s, c) => s + c.riskRevenue, 0);
  const recoveryOpportunityCount = cards.filter(
    (c) => c.recoveryLevel === "high" || c.recoveryLevel === "medium",
  ).length;
  const avgRecoveryScore = Math.round(
    cards.reduce((s, c) => s + c.recoveryScore, 0) / total,
  );
  const recoveryEfficiencyPct =
    totalRiskRevenue > 0
      ? Math.round((totalRecoveryRevenue / totalRiskRevenue) * 100)
      : 0;

  const recoveryDistribution: RecoveryDistributionItem[] = (
    ["high", "medium", "low", "lost"] as RecoveryLevel[]
  ).map((level) => {
    const lc = cards.filter((c) => c.recoveryLevel === level);
    return {
      level,
      label: RECOVERY_LEVEL_META[level].label,
      count: lc.length,
      recoveryRevenue: lc.reduce((s, c) => s + c.recoveryRevenue, 0),
    };
  });

  const topRecoveryCards = [...cards]
    .filter((c) => c.recoveryLevel !== "lost")
    .sort((a, b) => b.recoveryRevenue - a.recoveryRevenue)
    .slice(0, 5);

  const quickWins = [...cards]
    .filter((c) => c.recoveryCategory === "quick-win")
    .sort((a, b) => b.recoveryRevenue - a.recoveryRevenue)
    .slice(0, 5);

  const categoryCount = new Map<RecoveryCategory, number>();
  for (const card of cards) {
    categoryCount.set(
      card.recoveryCategory,
      (categoryCount.get(card.recoveryCategory) ?? 0) + 1,
    );
  }
  const operationalRecommendations = [...categoryCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => RECOVERY_ACTION_TEXT[cat]);

  return {
    totalRecoveryRevenue,
    totalRiskRevenue,
    recoveryOpportunityCount,
    avgRecoveryScore,
    recoveryEfficiencyPct,
    totalActive: total,
    recoveryDistribution,
    topRecoveryCards,
    quickWins,
    operationalRecommendations,
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
