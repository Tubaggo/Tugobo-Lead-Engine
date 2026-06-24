import type { ScoredLead } from "@/app/lib/leads";
import type { PackageTier, Priority } from "@/app/components/v2/mock/mock-queue";

// ── types ─────────────────────────────────────────────────────

export type PipelineStage =
  | "new"
  | "prioritized"
  | "contacted"
  | "follow-up"
  | "demo"
  | "closing";

export type PipelineFilter =
  | "all"
  | "high-value"
  | "closing-soon"
  | "follow-up-needed"
  | "no-contact";

export type PipelineSortKey =
  | "pipeline-value"
  | "opportunity"
  | "stage"
  | "last-contact";

export type PipelineCard = {
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

  contactAttempts: number;
  lastContactedAtMs: number | null;
  lastContactLabel: string;

  actionLabel: string;
  outreachAngle: string;

  whyThisLead: string[];
  aiInsight: string;
  opportunityReasons: string[];
};

export type PipelineStageMeta = {
  stage: PipelineStage;
  label: string;
  description: string;
  rank: number;
};

export type PipelineSummary = {
  totalWeightedMrr: number;
  activeCount: number;
  closingSoonCount: number;
  avgOpportunityScore: number;
  strongestStage: PipelineStage;
  bottleneckStage: PipelineStage;
};

// ── constants ─────────────────────────────────────────────────

const TIER_BASE_MRR: Record<string, number> = {
  micro: 5_000,
  small: 10_000,
  medium: 15_000,
  premium: 25_000,
  enterprise: 40_000,
};

export const PIPELINE_STAGES: PipelineStage[] = [
  "new",
  "prioritized",
  "contacted",
  "follow-up",
  "demo",
  "closing",
];

export const STAGE_META: Record<PipelineStage, PipelineStageMeta> = {
  new: {
    stage: "new",
    label: "Yeni Fırsat",
    description: "Henüz temas kurulmadı",
    rank: 0,
  },
  prioritized: {
    stage: "prioritized",
    label: "Önceliklendirildi",
    description: "Temas bekleniyor, yüksek öncelik",
    rank: 1,
  },
  contacted: {
    stage: "contacted",
    label: "İletişim Kuruldu",
    description: "İlk temas yapıldı",
    rank: 2,
  },
  "follow-up": {
    stage: "follow-up",
    label: "Takipte",
    description: "Takip aksiyonu planlandı",
    rank: 3,
  },
  demo: {
    stage: "demo",
    label: "Demo / Teklif",
    description: "Yüksek potansiyel, değerlendirme aşaması",
    rank: 4,
  },
  closing: {
    stage: "closing",
    label: "Kapanışa Yakın",
    description: "Kritik fırsat, kapatmaya hazır",
    rank: 5,
  },
};

export const ACTION_LABEL_TR: Record<string, string> = {
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

// ── stage derivation ──────────────────────────────────────────
//
// Primary driver: effectiveScore (base score + optional activity boosts).
// Activity signals (contactAttempts, lastContactedAt, nextFollowUpAt)
// each contribute +5 but are never hard requirements — distribution
// stays healthy even when leads have no recorded outreach history.
//
// Thresholds are calibrated to the actual seed score range (38–67).
// As enriched leads with higher scores are added, the upper stages
// naturally fill further.
//
// closing      effectiveScore ≥ 63
// demo         effectiveScore ≥ 56
// follow-up    effectiveScore ≥ 52
// contacted    effectiveScore ≥ 47
// prioritized  effectiveScore ≥ 41
// new          everything else

export function derivePipelineStage(lead: ScoredLead): PipelineStage {
  const baseScore =
    lead.verifiedOpportunityScore ??
    lead.opportunityScore ??
    lead.leadScore ??
    50;

  let boost = 0;
  if ((lead.contactAttempts ?? 0) > 0) boost += 5;
  if (typeof lead.lastContactedAt === "number" && lead.lastContactedAt > 0) boost += 5;
  if (typeof lead.nextFollowUpAt === "number" && lead.nextFollowUpAt > 0) boost += 5;

  const effectiveScore = baseScore + boost;

  if (effectiveScore >= 63) return "closing";
  if (effectiveScore >= 56) return "demo";
  if (effectiveScore >= 52) return "follow-up";
  if (effectiveScore >= 47) return "contacted";
  if (effectiveScore >= 41) return "prioritized";
  return "new";
}

// ── adapter ───────────────────────────────────────────────────

export function adaptScoredLeadsToPipelineCards(
  scored: ScoredLead[],
): PipelineCard[] {
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
      const stage = derivePipelineStage(lead);

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

        contactAttempts: lead.contactAttempts ?? 0,
        lastContactedAtMs: lastContactedMs,
        lastContactLabel: formatLastContact(lastContactedMs),

        actionLabel: ACTION_LABEL_TR[lead.recommendedAction ?? ""] ?? "—",
        outreachAngle: lead.outreachAngle ?? "",

        whyThisLead: lead.whyThisLead ?? [],
        aiInsight: lead.aiInsight ?? "",
        opportunityReasons: lead.opportunityReasons ?? [],
      };
    })
    .sort(
      (a, b) => b.stageRank - a.stageRank || b.weightedMrr - a.weightedMrr,
    );
}

// ── summary ───────────────────────────────────────────────────

export function computePipelineSummary(cards: PipelineCard[]): PipelineSummary {
  const total = cards.length;
  const totalWeightedMrr = cards.reduce((s, c) => s + c.weightedMrr, 0);
  const closingSoonCount = cards.filter(
    (c) => c.stage === "closing" || c.stage === "demo",
  ).length;
  const avgOpportunityScore =
    total > 0
      ? Math.round(cards.reduce((s, c) => s + c.opportunityScore, 0) / total)
      : 0;

  const mrrByStage: Partial<Record<PipelineStage, number>> = {};
  const countByStage: Record<PipelineStage, number> = {
    new: 0,
    prioritized: 0,
    contacted: 0,
    "follow-up": 0,
    demo: 0,
    closing: 0,
  };
  for (const c of cards) {
    mrrByStage[c.stage] = (mrrByStage[c.stage] ?? 0) + c.weightedMrr;
    countByStage[c.stage]++;
  }

  const strongestStage = PIPELINE_STAGES.reduce((best, s) =>
    (mrrByStage[s] ?? 0) > (mrrByStage[best] ?? 0) ? s : best,
  );

  const bottleneckStage = (
    ["new", "prioritized", "contacted", "follow-up"] as PipelineStage[]
  ).reduce<PipelineStage>(
    (b, s) => (countByStage[s] > countByStage[b] ? s : b),
    "new",
  );

  return {
    totalWeightedMrr,
    activeCount: total,
    closingSoonCount,
    avgOpportunityScore,
    strongestStage,
    bottleneckStage,
  };
}

// ── format helpers ────────────────────────────────────────────

export function formatMrr(mrr: number): string {
  if (mrr >= 1_000_000) return `₺${(mrr / 1_000_000).toFixed(1)}M`;
  if (mrr >= 1_000) return `₺${Math.round(mrr / 1_000)}K`;
  return `₺${mrr}`;
}
