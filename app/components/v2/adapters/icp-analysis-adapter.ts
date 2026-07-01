import type { ScoredLead } from "@/app/lib/leads";
import type {
  EstimatedPropertySize,
  EstimatedDemandVolume,
  DirectBookingReadiness,
  OtaDependencyLevel,
} from "@/app/lib/intelligence/icp-alignment";
import type { PackageTier, Priority } from "@/app/components/v2/mock/mock-queue";

export type { EstimatedPropertySize, EstimatedDemandVolume, DirectBookingReadiness, OtaDependencyLevel };

export type IcpFitTier = "strong" | "good" | "weak" | "no-data";

export type IcpCard = {
  id: string;
  hotelName: string;
  hotelType: string;
  city: string;
  businessTier: string;
  packageTier: PackageTier;
  priority: Priority;

  icpScore: number;
  tugoboFitScore: number;
  multiChannelScore: number;
  operationalComplexityScore: number;
  icpFitTier: IcpFitTier;

  propertySize: EstimatedPropertySize;
  demandVolume: EstimatedDemandVolume;
  directBookingReadiness: DirectBookingReadiness;
  otaDependencyLevel: OtaDependencyLevel;
  operationalFit: boolean;
  operationalValueSummary: string;

  hasWebsite: boolean;
  hasWhatsApp: boolean;
  hasInstagram: boolean;

  opportunityScore: number;
  outreachPriority: number;

  whyThisLead: string[];
  aiInsight: string;
  outreachAngle: string;
  opportunityReasons: string[];
};

export type IcpSummary = {
  total: number;
  strongCount: number;
  goodCount: number;
  weakCount: number;
  noDataCount: number;
  avgIcpScore: number;
  highDemandCount: number;
  directBookingReadyCount: number;
  operationalFitCount: number;
};

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

function toIcpFitTier(score: number): IcpFitTier {
  if (score === 0) return "no-data";
  if (score >= 70) return "strong";
  if (score >= 50) return "good";
  return "weak";
}

export function adaptScoredLeadsToIcpCards(scored: ScoredLead[]): IcpCard[] {
  return scored
    .filter((l) => l.priorityBucket !== "archive")
    .sort((a, b) => (b.icpFitScore ?? 0) - (a.icpFitScore ?? 0))
    .map((lead) => {
      const icpScore = Math.round(lead.icpFitScore ?? 0);
      const alignment = lead.icpAlignment;
      const waConf = lead.whatsappConfidence as string | undefined;

      return {
        id: lead.id,
        hotelName: lead.name,
        hotelType: lead.type ?? "Hotel",
        city: lead.city,
        businessTier: lead.businessTier ?? "small",
        packageTier: toPackageTier(lead.businessTier),
        priority: toPriority(lead.priorityBucket),

        icpScore,
        tugoboFitScore: alignment?.tugoboFitScore ?? icpScore,
        multiChannelScore: alignment?.multiChannelScore ?? 0,
        operationalComplexityScore: alignment?.operationalComplexityScore ?? 0,
        icpFitTier: toIcpFitTier(icpScore),

        propertySize: alignment?.estimatedPropertySize ?? "unknown",
        demandVolume: alignment?.estimatedDemandVolume ?? "unknown",
        directBookingReadiness: alignment?.directBookingReadiness ?? "unknown",
        otaDependencyLevel: alignment?.otaDependencyLevel ?? "unknown",
        operationalFit: alignment?.operationalFit ?? false,
        operationalValueSummary: alignment?.operationalValueSummary ?? "",

        hasWebsite: !!(lead.website || lead.hasOwnWebsite || lead.websiteCandidateUrl),
        hasWhatsApp: !!(
          waConf === "high" ||
          waConf === "confirmed" ||
          waConf === "medium" ||
          waConf === "likely" ||
          waConf === "low" ||
          waConf === "uncertain"
        ),
        hasInstagram: !!(lead.instagram || lead.hasInstagram),

        opportunityScore: Math.round(
          lead.verifiedOpportunityScore ?? lead.opportunityScore ?? lead.leadScore ?? 50,
        ),
        outreachPriority: lead.outreachPriority ?? 0,

        whyThisLead: lead.whyThisLead ?? [],
        aiInsight: lead.aiInsight ?? "",
        outreachAngle: lead.outreachAngle ?? "",
        opportunityReasons: lead.opportunityReasons ?? [],
      };
    });
}

export function computeIcpSummary(cards: IcpCard[]): IcpSummary {
  const total = cards.length;
  const strongCount = cards.filter((c) => c.icpFitTier === "strong").length;
  const goodCount = cards.filter((c) => c.icpFitTier === "good").length;
  const weakCount = cards.filter((c) => c.icpFitTier === "weak").length;
  const noDataCount = cards.filter((c) => c.icpFitTier === "no-data").length;
  const scored = cards.filter((c) => c.icpScore > 0);
  const avgIcpScore =
    scored.length > 0
      ? Math.round(scored.reduce((s, c) => s + c.icpScore, 0) / scored.length)
      : 0;
  const highDemandCount = cards.filter((c) => c.demandVolume === "high").length;
  const directBookingReadyCount = cards.filter((c) => c.directBookingReadiness === "high").length;
  const operationalFitCount = cards.filter((c) => c.operationalFit).length;

  return {
    total,
    strongCount,
    goodCount,
    weakCount,
    noDataCount,
    avgIcpScore,
    highDemandCount,
    directBookingReadyCount,
    operationalFitCount,
  };
}
