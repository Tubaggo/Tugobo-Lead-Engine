import type { ScoredLead } from "@/app/lib/leads";
import type { Priority } from "@/app/components/v2/mock/mock-queue";

export type ChannelStatus = "verified" | "likely" | "partial" | "none";
export type BestChannel = "WhatsApp" | "Instagram" | "Website" | "Telefon" | "Çoklu";
export type LeadTemperature = "hot" | "warm" | "cold";
export type OutreachUrgency = "high" | "medium" | "low";
export type ChannelFilter = "all" | "whatsapp" | "instagram" | "website" | "multi";
export type CommSortKey = "comm-score" | "opportunity" | "icp" | "priority";

export type CommCard = {
  id: string;
  hotelName: string;
  hotelType: string;
  city: string;
  priority: Priority;
  outreachPriority: number;

  // Channel statuses
  whatsappStatus: ChannelStatus;
  instagramStatus: ChannelStatus;
  websiteStatus: ChannelStatus;
  hasPhone: boolean;

  // Channel confidence scores (0–100)
  whatsappScore: number;
  instagramScore: number;
  websiteScore: number;

  // Communication composite
  commScore: number;
  isMultiChannel: boolean;
  channelCount: number;

  // Best channel recommendation
  bestChannel: BestChannel;
  bestChannelReason: string;

  // Outreach profile (from outreachIntelligence)
  outreachStyle: string;
  salesApproach: string;
  leadTemperature: LeadTemperature;
  urgencyLevel: OutreachUrgency;
  outreachRationale: string[];

  // Outreach content
  actionLabel: string;
  outreachAngle: string;
  whyThisLead: string[];
  aiInsight: string;

  // Scoring context
  opportunityScore: number;
  icpScore: number;
};

export type CommSummary = {
  total: number;
  whatsappReadyCount: number;
  instagramReadyCount: number;
  websiteReadyCount: number;
  multiChannelCount: number;
  hotCount: number;
  warmCount: number;
  coldCount: number;
  avgCommScore: number;
};

// ── Channel score resolution ───────────────────────────────────

function resolveWaScore(lead: ScoredLead): number {
  const svConf = lead.signalVerification?.whatsappConfidence;
  if (typeof svConf === "number" && svConf > 0) return Math.round(svConf);

  const conf = lead.whatsappConfidence as string | undefined;
  if (conf === "high" || conf === "confirmed") return 85;
  if (conf === "medium" || conf === "likely") return 55;
  if (conf === "low" || conf === "uncertain") return 25;
  return 0;
}

function resolveIgScore(lead: ScoredLead): number {
  const svConf = lead.signalVerification?.instagramConfidence;
  if (typeof svConf === "number" && svConf > 0) return Math.round(svConf);

  if (lead.instagram || lead.hasInstagram) {
    const instConf = lead.instagramConfidence;
    if (typeof instConf === "number" && instConf > 0) return Math.round(Math.min(90, instConf));
    const instConfStr = instConf as string | undefined;
    if (instConfStr === "high") return 85;
    if (instConfStr === "medium") return 60;
    if (instConfStr === "low") return 35;
    return 65;
  }
  return 0;
}

function resolveWebScore(lead: ScoredLead): number {
  const svConf = lead.signalVerification?.websiteConfidence;
  if (typeof svConf === "number" && svConf > 0) return Math.round(svConf);

  if (lead.website || lead.hasOwnWebsite) {
    const wc = lead.websiteConfidence as string | undefined;
    if (wc === "high") return 85;
    if (wc === "medium") return 60;
    if (wc === "low") return 35;
    return 70;
  }
  if (lead.websiteCandidateUrl) return 35;
  return 0;
}

function resolveWaStatus(lead: ScoredLead): ChannelStatus {
  const sv = lead.signalVerification;
  if (sv?.whatsappVerification === "verified") return "verified";
  if (sv?.whatsappVerification === "likely") return "likely";

  const conf = lead.whatsappConfidence as string | undefined;
  if (conf === "high" || conf === "confirmed") return "verified";
  if (conf === "medium" || conf === "likely") return "likely";
  if (conf === "low" || conf === "uncertain") return "partial";
  return "none";
}

function resolveIgStatus(lead: ScoredLead): ChannelStatus {
  const sv = lead.signalVerification;
  if (sv?.instagramVerification === "verified") return "verified";
  if (sv?.instagramVerification === "likely") return "likely";
  if (sv?.instagramVerification === "candidate") return "partial";
  if (lead.instagram || lead.hasInstagram) return "likely";
  return "none";
}

function resolveWebStatus(lead: ScoredLead): ChannelStatus {
  const sv = lead.signalVerification;
  if (sv?.websiteVerification === "verified" || sv?.websiteVerification === "reachable")
    return "verified";
  if (sv?.websiteVerification === "broken") return "partial";
  if (sv?.websiteVerification === "not_found") return "none";

  if (lead.website || lead.hasOwnWebsite) return "verified";
  if (lead.websiteCandidateUrl) return "partial";
  return "none";
}

function deriveBestChannel(
  lead: ScoredLead,
  waScore: number,
  igScore: number,
  webScore: number,
  channelCount: number,
): { channel: BestChannel; reason: string } {
  const oi = lead.outreachIntelligence;
  const reason = oi?.rationale?.[0] ?? "";

  if (oi?.recommendedChannel) {
    switch (oi.recommendedChannel) {
      case "whatsapp":
        return { channel: channelCount >= 2 && igScore >= 50 ? "Çoklu" : "WhatsApp", reason };
      case "instagram":
        return { channel: "Instagram", reason };
      case "phone":
        return { channel: "Telefon", reason };
      case "website-form":
        return { channel: "Website", reason };
    }
  }

  // Fallback: highest score wins
  const ranked = [
    { ch: "WhatsApp" as BestChannel, score: waScore },
    { ch: "Instagram" as BestChannel, score: igScore },
    { ch: "Website" as BestChannel, score: webScore },
    { ch: "Telefon" as BestChannel, score: lead.phone?.trim() ? 20 : 0 },
  ].sort((a, b) => b.score - a.score);

  if (channelCount >= 2 && ranked[0].score > 0 && ranked[1].score >= 40) {
    return { channel: "Çoklu", reason };
  }
  return { channel: ranked[0].score > 0 ? ranked[0].ch : "Telefon", reason };
}

function deriveTemperature(lead: ScoredLead): LeadTemperature {
  const oi = lead.outreachIntelligence;
  if (oi?.leadTemperature === "hot") return "hot";
  if (oi?.leadTemperature === "warm") return "warm";
  if (oi?.leadTemperature === "cold") return "cold";
  switch (lead.priorityBucket) {
    case "today":
      return "hot";
    case "high":
      return "warm";
    default:
      return "cold";
  }
}

function deriveUrgency(lead: ScoredLead): OutreachUrgency {
  const oi = lead.outreachIntelligence;
  if (oi?.urgencyLevel === "high") return "high";
  if (oi?.urgencyLevel === "medium") return "medium";
  if (oi?.urgencyLevel === "low") return "low";
  switch (lead.priorityBucket) {
    case "today":
    case "high":
      return "high";
    case "medium":
      return "medium";
    default:
      return "low";
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

const ACTION_LABEL: Record<string, string> = {
  send_whatsapp: "WhatsApp Gönder",
  follow_up: "Takip Et",
  research_more: "Daha Fazla Araştır",
  wait: "Bekle",
  skip: "Atla",
};

// ── Main adapter ───────────────────────────────────────────────

export function adaptScoredLeadsToCommCards(scored: ScoredLead[]): CommCard[] {
  return scored
    .filter((l) => l.priorityBucket !== "archive")
    .sort((a, b) => (b.outreachPriority ?? 0) - (a.outreachPriority ?? 0))
    .map((lead) => {
      const waScore = resolveWaScore(lead);
      const igScore = resolveIgScore(lead);
      const webScore = resolveWebScore(lead);
      const hasPhone = !!(lead.phone?.trim());

      const channelCount = [
        waScore > 20,
        igScore > 20,
        webScore > 20,
        hasPhone,
      ].filter(Boolean).length;

      const commScore = Math.round(
        Math.min(100, waScore * 0.45 + igScore * 0.30 + webScore * 0.15 + (hasPhone ? 5 : 0)),
      );

      const { channel: bestChannel, reason: bestChannelReason } = deriveBestChannel(
        lead,
        waScore,
        igScore,
        webScore,
        channelCount,
      );

      const oi = lead.outreachIntelligence;

      return {
        id: lead.id,
        hotelName: lead.name,
        hotelType: lead.type ?? "Hotel",
        city: lead.city,
        priority: toPriority(lead.priorityBucket),
        outreachPriority: lead.outreachPriority ?? 0,

        whatsappStatus: resolveWaStatus(lead),
        instagramStatus: resolveIgStatus(lead),
        websiteStatus: resolveWebStatus(lead),
        hasPhone,

        whatsappScore: waScore,
        instagramScore: igScore,
        websiteScore: webScore,

        commScore,
        isMultiChannel: channelCount >= 2,
        channelCount,

        bestChannel,
        bestChannelReason,

        outreachStyle: oi?.outreachStyle ?? "",
        salesApproach: oi?.salesApproach ?? "",
        leadTemperature: deriveTemperature(lead),
        urgencyLevel: deriveUrgency(lead),
        outreachRationale: oi?.rationale ?? [],

        actionLabel: ACTION_LABEL[lead.recommendedAction ?? ""] ?? "—",
        outreachAngle: lead.outreachAngle ?? "",
        whyThisLead: lead.whyThisLead ?? [],
        aiInsight: lead.aiInsight ?? "",

        opportunityScore: Math.round(
          lead.verifiedOpportunityScore ?? lead.opportunityScore ?? lead.leadScore ?? 50,
        ),
        icpScore: Math.round(lead.icpFitScore ?? 0),
      };
    });
}

export function computeCommSummary(cards: CommCard[]): CommSummary {
  const total = cards.length;
  const whatsappReadyCount = cards.filter((c) => c.whatsappScore > 40).length;
  const instagramReadyCount = cards.filter((c) => c.instagramScore > 40).length;
  const websiteReadyCount = cards.filter((c) => c.websiteScore > 40).length;
  const multiChannelCount = cards.filter((c) => c.isMultiChannel).length;
  const hotCount = cards.filter((c) => c.leadTemperature === "hot").length;
  const warmCount = cards.filter((c) => c.leadTemperature === "warm").length;
  const coldCount = cards.filter((c) => c.leadTemperature === "cold").length;
  const avgCommScore =
    total > 0 ? Math.round(cards.reduce((s, c) => s + c.commScore, 0) / total) : 0;

  return {
    total,
    whatsappReadyCount,
    instagramReadyCount,
    websiteReadyCount,
    multiChannelCount,
    hotCount,
    warmCount,
    coldCount,
    avgCommScore,
  };
}
