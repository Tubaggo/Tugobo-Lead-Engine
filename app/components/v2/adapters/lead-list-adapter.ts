import type { ScoredLead } from "@/app/lib/leads";
import type { PackageTier, Priority, ActionChannel } from "@/app/components/v2/mock/mock-queue";

const TIER_BASE_MRR: Record<string, number> = {
  micro: 5_000,
  small: 10_000,
  medium: 15_000,
  premium: 25_000,
  enterprise: 40_000,
};

export type WebsiteStatus = "active" | "candidate" | "none";
export type WhatsAppStatus = "high" | "medium" | "low" | "none";

export type LeadCard = {
  id: string;
  hotelName: string;
  hotelType: string;
  city: string;
  packageTier: PackageTier;
  priority: Priority;
  priorityScore: number;
  opportunityScore: number;
  icpScore: number;
  confidenceScore: number;
  websiteStatus: WebsiteStatus;
  whatsappStatus: WhatsAppStatus;
  hasInstagram: boolean;
  actionLabel: string;
  actionChannel: ActionChannel;
  actionSub: string;
  lastActivity: string;
  lastActivityChannel: string;
  outreachPriority: number;
  revenueEstimate: number;
  opportunityReasons: string[];
  whyThisLead: string[];
  outreachAngle: string;
  aiInsight: string;
  units: number;
  rating: number;
  businessTierLabel: string;
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
    case "today": return "critical";
    case "high": return "high";
    case "medium": return "medium";
    default: return "low";
  }
}

function toWebsiteStatus(lead: ScoredLead): WebsiteStatus {
  if (lead.website || lead.hasOwnWebsite) return "active";
  if (lead.websiteCandidateUrl) return "candidate";
  return "none";
}

function toWhatsAppStatus(lead: ScoredLead): WhatsAppStatus {
  const conf = lead.whatsappConfidence as string | undefined;
  if (conf === "high" || conf === "confirmed") return "high";
  if (conf === "medium" || conf === "likely") return "medium";
  if (conf === "low" || conf === "uncertain") return "low";
  if (lead.phone) return "low";
  return "none";
}

function toActionInfo(lead: ScoredLead): {
  actionLabel: string;
  actionChannel: ActionChannel;
  actionSub: string;
} {
  const action = lead.recommendedAction;
  const bucket = lead.priorityBucket;
  const sub = lead.whyThisLead?.[0] ?? lead.outreachAngle ?? "Fırsat mevcut";

  if (action === "send_whatsapp") {
    if (bucket === "today") {
      return { actionLabel: "Hemen Ara", actionChannel: "Arama", actionSub: "En yüksek öncelik" };
    }
    if (bucket === "high") {
      return { actionLabel: "Ara", actionChannel: "Arama", actionSub: sub };
    }
    return { actionLabel: "WhatsApp Gönder", actionChannel: "WhatsApp", actionSub: sub };
  }
  if (action === "follow_up") {
    return { actionLabel: "Takip Et", actionChannel: "WhatsApp", actionSub: "Takip zamanı geldi" };
  }
  if (action === "research_more") {
    return { actionLabel: "Araştır", actionChannel: "Email", actionSub: "Daha fazla sinyal gerek" };
  }
  if (action === "wait") {
    return { actionLabel: "Bekle", actionChannel: "WhatsApp", actionSub: "Doğru zaman değil" };
  }
  return { actionLabel: "—", actionChannel: "Email", actionSub: "Aksiyon önerilmiyor" };
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

const TIER_LABEL: Record<string, string> = {
  micro: "Mikro",
  small: "Küçük",
  medium: "Orta",
  premium: "Premium",
  enterprise: "Kurumsal",
};

export function adaptScoredLeadsToCards(scored: ScoredLead[]): LeadCard[] {
  return scored
    .filter((l) => l.priorityBucket !== "archive")
    .sort((a, b) => (b.outreachPriority ?? 0) - (a.outreachPriority ?? 0))
    .map((lead) => {
      const oppScore = Math.round(
        lead.verifiedOpportunityScore ?? lead.opportunityScore ?? lead.leadScore ?? 50,
      );
      const icpScore = Math.round(lead.icpFitScore ?? 0);
      const confidenceScore = Math.round(lead.leadScore ?? 50);
      const baseMrr = TIER_BASE_MRR[lead.businessTier ?? "small"] ?? 10_000;
      const revenueEstimate = Math.round(baseMrr * (oppScore / 100));
      const actionInfo = toActionInfo(lead);

      const lastContactedAt =
        typeof lead.lastContactedAt === "number" && lead.lastContactedAt > 0
          ? lead.lastContactedAt
          : null;

      return {
        id: lead.id,
        hotelName: lead.name,
        hotelType: lead.type ?? "Hotel",
        city: lead.city,
        packageTier: toPackageTier(lead.businessTier),
        priority: toPriority(lead.priorityBucket),
        priorityScore: Math.round(lead.outreachPriority ?? 50),
        opportunityScore: oppScore,
        icpScore,
        confidenceScore,
        websiteStatus: toWebsiteStatus(lead),
        whatsappStatus: toWhatsAppStatus(lead),
        hasInstagram: !!(lead.instagram || lead.hasInstagram),
        ...actionInfo,
        lastActivity: lastContactedAt ? formatMsAgo(Date.now() - lastContactedAt) : "—",
        lastActivityChannel: lead.lastActionType ?? "Yeni Lead",
        outreachPriority: lead.outreachPriority ?? 0,
        revenueEstimate,
        opportunityReasons: lead.opportunityReasons ?? [],
        whyThisLead: lead.whyThisLead ?? [],
        outreachAngle: lead.outreachAngle ?? "",
        aiInsight: lead.aiInsight ?? "",
        units: lead.units ?? 0,
        rating: lead.rating ?? 0,
        businessTierLabel: TIER_LABEL[lead.businessTier ?? ""] ?? "Bilinmiyor",
      };
    });
}
