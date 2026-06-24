import type { ScoredLead } from "@/app/lib/leads";
import {
  type QueueRow,
  type MockKpi,
  type MockContext,
  type PackageTier,
  type Priority,
  type ActionChannel,
  MOCK_QUEUE_ROWS,
  MOCK_KPI,
  MOCK_CONTEXT,
} from "../mock/mock-queue";

/* TUGOBO SaaS pricing proxy (₺/ay) by business tier */
const TIER_BASE_MRR: Record<string, number> = {
  micro: 5_000,
  small: 10_000,
  medium: 15_000,
  premium: 25_000,
  enterprise: 40_000,
};

function toPackageTier(businessTier?: string): PackageTier {
  switch (businessTier) {
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

function toActionInfo(lead: ScoredLead): {
  channel: ActionChannel;
  actionLabel: string;
  actionSub: string;
} {
  const action = lead.recommendedAction;
  const bucket = lead.priorityBucket;
  const sub =
    lead.whyThisLead?.[0] ??
    lead.outreachAngle ??
    "Fırsat mevcut";

  if (action === "send_whatsapp") {
    if (bucket === "today") {
      return { channel: "Arama", actionLabel: "Hemen Ara", actionSub: "En yüksek öncelik" };
    }
    if (bucket === "high") {
      return { channel: "Arama", actionLabel: "Ara", actionSub: sub };
    }
    return { channel: "WhatsApp", actionLabel: "WhatsApp", actionSub: sub };
  }
  if (action === "follow_up") {
    return { channel: "WhatsApp", actionLabel: "Takip Et", actionSub: "Takip zamanı geldi" };
  }
  if (action === "research_more") {
    return { channel: "Email", actionLabel: "Araştır", actionSub: "Daha fazla sinyal gerek" };
  }
  if (action === "wait") {
    return { channel: "WhatsApp", actionLabel: "Bekle", actionSub: "Doğru zaman değil" };
  }
  return { channel: "Email", actionLabel: "—", actionSub: "Aksiyon önerilmiyor" };
}

function formatMsAgo(ms: number): string {
  const h = ms / (60 * 60 * 1_000);
  if (h < 1) return "Az önce";
  if (h < 24) return `${Math.round(h)} saat önce`;
  const d = Math.round(h / 24);
  if (d === 1) return "1 gün önce";
  if (d <= 7) return `${d} gün önce`;
  if (d <= 14) return "1 hafta önce";
  if (d <= 21) return "2 hafta önce";
  return `${Math.round(d / 7)} hafta önce`;
}

function toLastActionInfo(lead: ScoredLead): {
  lastActionChannel: string;
  lastActionAgo: string;
} {
  if (typeof lead.lastContactedAt === "number" && lead.lastContactedAt > 0) {
    return {
      lastActionChannel: lead.lastActionType ?? "Görüşme",
      lastActionAgo: formatMsAgo(Date.now() - lead.lastContactedAt),
    };
  }
  if (lead.lastActionType) {
    return { lastActionChannel: lead.lastActionType, lastActionAgo: "—" };
  }
  return { lastActionChannel: "Yeni Lead", lastActionAgo: "—" };
}

export function adaptScoredLeadsToRows(scored: ScoredLead[]): QueueRow[] {
  const active = scored
    .filter((l) => l.priorityBucket !== "archive")
    .sort((a, b) => (b.outreachPriority ?? 0) - (a.outreachPriority ?? 0));

  return active.slice(0, 10).map((lead, i) => {
    const conversion = Math.round(
      lead.verifiedOpportunityScore ?? lead.opportunityScore ?? lead.leadScore ?? 50,
    );
    const baseMrr = TIER_BASE_MRR[lead.businessTier ?? "small"] ?? 10_000;
    const weightedMrr = Math.round(baseMrr * (conversion / 100));

    return {
      rank: i + 1,
      id: lead.id,
      hotelName: lead.name,
      city: lead.city,
      packageTier: toPackageTier(lead.businessTier),
      weightedMrr,
      conversion,
      priority: toPriority(lead.priorityBucket),
      priorityScore: Math.round(lead.outreachPriority ?? 50),
      ...toActionInfo(lead),
      ...toLastActionInfo(lead),
    };
  });
}

export function computeV2Kpi(scored: ScoredLead[], rows: QueueRow[]): MockKpi {
  const active = scored.filter((l) => l.priorityBucket !== "archive");

  const totalWeightedMrr = rows.reduce((sum, r) => sum + r.weightedMrr, 0);
  const totalWeightedArr = totalWeightedMrr * 12;

  const avgConversion =
    active.length > 0
      ? Math.round(
          active.reduce(
            (sum, l) =>
              sum +
              (l.verifiedOpportunityScore ?? l.opportunityScore ?? l.leadScore ?? 50),
            0,
          ) / active.length,
        )
      : 0;

  const callsToday = active.filter(
    (l) =>
      l.priorityBucket === "today" ||
      (l.priorityBucket === "high" && l.recommendedAction === "send_whatsapp"),
  ).length;

  const messagesToday = active.filter(
    (l) => l.recommendedAction === "send_whatsapp",
  ).length;

  const followUpsToday = active.filter(
    (l) => l.recommendedAction === "follow_up",
  ).length;

  const pendingApprovals = active.filter(
    (l) =>
      l.priorityBucket === "high" &&
      (l.verifiedOpportunityScore ?? l.opportunityScore ?? 0) >= 60,
  ).length;

  return {
    totalWeightedMrr,
    totalWeightedArr,
    opportunityCount: active.length,
    avgConversion,
    callsToday,
    messagesToday,
    followUpsToday,
    pendingApprovals,
  };
}

export function computeV2Context(scored: ScoredLead[], kpi: MockKpi): MockContext {
  const closable = scored.filter(
    (l) =>
      l.priorityBucket === "today" ||
      (l.priorityBucket === "high" &&
        (l.verifiedOpportunityScore ?? l.opportunityScore ?? 0) >= 70),
  ).length;

  return {
    rankingReasons: [
      "Ağırlıklı Aylık Gelir (MRR)",
      "Dönüşüm Olasılığı",
      "Revenue Priority Score",
      "Aksiyon Zamanı (Zaman aşımı)",
      "Lead Sıcaklık & Niyet Sinyalleri",
    ],
    queueSummary: {
      totalExpected: kpi.totalWeightedMrr,
      closableThisWeek: closable,
      atRiskRevenue: Math.round(kpi.totalWeightedMrr * 0.28),
      avgWaitDays: 7,
    },
  };
}

/** Full pipeline: ScoredLead[] → V2 UI data. Falls back to mock if no leads scored. */
export function adaptV2Data(scored: ScoredLead[]): {
  rows: QueueRow[];
  kpi: MockKpi;
  ctx: MockContext;
} {
  if (scored.length === 0) {
    return { rows: MOCK_QUEUE_ROWS, kpi: MOCK_KPI, ctx: MOCK_CONTEXT };
  }
  const rows = adaptScoredLeadsToRows(scored);
  if (rows.length === 0) {
    return { rows: MOCK_QUEUE_ROWS, kpi: MOCK_KPI, ctx: MOCK_CONTEXT };
  }
  const kpi = computeV2Kpi(scored, rows);
  const ctx = computeV2Context(scored, kpi);
  return { rows, kpi, ctx };
}
