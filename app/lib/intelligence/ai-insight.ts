import type { BusinessSignal } from "./signals";

export type OpportunityLevel = "low" | "medium" | "high";

export type AiInsightSource = "rules" | "llm";

/** Narrow input so this module does not import `leads.ts` (avoids circular deps). */
export type LeadForAiInsight = {
  businessSignals?: BusinessSignal[];
  reviewPainPoints?: Array<{
    category: string;
    severity: "low" | "medium" | "high";
    summary?: string;
  }>;
  websiteIntelligence?: {
    hasBookingCtaText?: boolean;
    hasWhatsAppLink?: boolean;
    hasBookingEngine?: boolean;
  };
  heuristicOutreachAngle?: string;
  hotScore: number;
  leadScore: number;
  intelligenceScore?: number;
  smartLeadScoreV2?: number;
  reviewIntelligenceScore?: number;
  contactQuality: "high" | "medium" | "low";
  hasWhatsAppPath: boolean;
  hasInstagram: boolean;
  hasOwnWebsite: boolean;
  channels: readonly string[];
};

export type LeadAiInsight = {
  aiInsight: string;
  outreachAngle: string;
  painPointSummary: string[];
  opportunityLevel: OpportunityLevel;
  source: AiInsightSource;
};

const SEVERITY_RANK: Record<"low" | "medium" | "high", number> = {
  low: 1,
  medium: 2,
  high: 3,
};

function uniqStrings(items: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const t = raw.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

function reviewPainToLabel(category: string, summary?: string): string | null {
  const s = summary?.trim();
  switch (category) {
    case "response_delay":
      return "Possible response delay";
    case "unreachable":
      return "Guest reachability concerns in reviews";
    case "reservation":
      return "Reservation or booking friction in reviews";
    case "communication":
      return "Communication gaps mentioned in reviews";
    case "cleanliness":
      return "Operations/cleanliness signals in reviews";
    case "value":
      return "Value-for-money concerns in reviews";
    case "other":
      return s || "Review-flagged guest concern";
    default:
      return s || null;
  }
}

function signalPainLabel(signal: BusinessSignal): string | null {
  switch (signal) {
    case "conversion_gap":
      return "Weak or unclear direct booking flow";
    case "missing_own_website":
      return "No owned website on listing";
    case "weak_digital_presence":
      return "Limited owned digital footprint";
    case "ota_dependency":
      return "Heavy platform dependence";
    case "single_channel_risk":
      return "Revenue concentrated on few channels";
    case "reputation_risk":
      return "Reputation attention may help";
    case "review_recency_stale":
      return "Reviews look less recent online";
    case "instagram_presence_gap":
      return "Social funnel gap for this scale";
    case "premium_without_owned_funnel":
      return "Premium positioning without a strong owned funnel";
    case "landline_or_unclear_phone":
      return "Phone not ideal for instant outreach";
    case "no_listed_phone":
      return "No listed phone";
    default:
      return null;
  }
}

/** Bullet-style pain summary for UI and LLM context. */
export function getPainPointSummary(
  lead: LeadForAiInsight,
  max = 5,
): string[] {
  const collected: string[] = [];

  const sortedReviews = [...(lead.reviewPainPoints ?? [])].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
  );
  for (const p of sortedReviews) {
    const label = reviewPainToLabel(p.category, p.summary);
    if (label) collected.push(label);
  }

  const priority: BusinessSignal[] = [
    "reputation_risk",
    "conversion_gap",
    "ota_dependency",
    "weak_digital_presence",
    "missing_own_website",
    "single_channel_risk",
    "premium_without_owned_funnel",
    "instagram_presence_gap",
    "review_recency_stale",
    "landline_or_unclear_phone",
    "no_listed_phone",
  ];
  const sigSet = new Set(lead.businessSignals ?? []);
  for (const s of priority) {
    if (!sigSet.has(s)) continue;
    const label = signalPainLabel(s);
    if (label) collected.push(label);
  }

  if (lead.websiteIntelligence?.hasBookingCtaText === false) {
    collected.push("Website may lack a clear booking call-to-action");
  }
  if (
    lead.hasOwnWebsite &&
    lead.websiteIntelligence?.hasBookingEngine === false &&
    sigSet.has("conversion_gap")
  ) {
    collected.push("Owned site present but booking path looks thin");
  }

  if (lead.hasWhatsAppPath && lead.contactQuality === "high") {
    collected.push("Direct outreach available (WhatsApp-ready)");
  } else if (lead.hasInstagram) {
    collected.push("Instagram available as a contact surface");
  }

  return uniqStrings(collected, max);
}

function blendScore(lead: LeadForAiInsight): number {
  if (
    typeof lead.smartLeadScoreV2 === "number" &&
    Number.isFinite(lead.smartLeadScoreV2)
  ) {
    return lead.smartLeadScoreV2;
  }
  const intel = lead.intelligenceScore ?? 0;
  return Math.round(
    lead.hotScore * 0.35 + lead.leadScore * 0.3 + intel * 0.35,
  );
}

export function getOpportunityLevel(lead: LeadForAiInsight): OpportunityLevel {
  const pains = getPainPointSummary(lead, 8);
  const blend = blendScore(lead);
  const reviewIntel = lead.reviewIntelligenceScore ?? 0;
  const reachable =
    (lead.hasWhatsAppPath && lead.contactQuality !== "low") ||
    lead.hasInstagram;

  const strongProblem =
    pains.length >= 2 ||
    (lead.reviewPainPoints?.length ?? 0) > 0 ||
    reviewIntel >= 55;

  if (reachable && strongProblem && blend >= 62) return "high";
  if (reachable && (strongProblem || blend >= 55)) return "medium";
  if (blend >= 48 || pains.length >= 1) return "medium";
  return "low";
}

export function getOutreachAngle(lead: LeadForAiInsight): string {
  const pains = getPainPointSummary(lead, 6);
  const hasCommDelay = pains.some((p) =>
    p.toLowerCase().includes("response delay"),
  );
  const hasBookingWeak = pains.some(
    (p) =>
      p.toLowerCase().includes("booking") ||
      p.toLowerCase().includes("booking flow"),
  );
  const hasOta = (lead.businessSignals ?? []).includes("ota_dependency");
  const hasWhatsapp =
    lead.hasWhatsAppPath && lead.contactQuality !== "low";

  if (hasCommDelay && hasWhatsapp) {
    return "Prevent lost reservations from late or missed WhatsApp replies.";
  }
  if (hasBookingWeak && hasWhatsapp) {
    return "Tighten the path from inquiry to confirmed booking on your fastest channel.";
  }
  if (hasOta && hasWhatsapp) {
    return "Capture more direct demand while guests are already messaging you.";
  }
  if ((lead.businessSignals ?? []).includes("conversion_gap") && hasWhatsapp) {
    return "Close the gap between attention and a clear reservation action.";
  }
  const heuristic = lead.heuristicOutreachAngle?.trim();
  if (heuristic) {
    const sentence = heuristic.split(/[.!?]/)[0]?.trim();
    if (sentence && sentence.length <= 120) return `${sentence}.`;
    return heuristic.length > 140 ? `${heuristic.slice(0, 137)}…` : heuristic;
  }
  if (hasWhatsapp) {
    return "Offer a lightweight way to handle reservation inquiries faster.";
  }
  return "Explore whether inquiry handling and direct booking match guest expectations.";
}

function hasMeaningfulSignals(lead: LeadForAiInsight): boolean {
  const pains = getPainPointSummary(lead, 1);
  if (pains.length > 0) return true;
  if ((lead.reviewPainPoints?.length ?? 0) > 0) return true;
  if ((lead.intelligenceScore ?? 0) >= 32) return true;
  if ((lead.reviewIntelligenceScore ?? 0) >= 28) return true;
  if (lead.hotScore >= 58 || lead.leadScore >= 58) return true;
  return false;
}

function buildAiInsightParagraph(lead: LeadForAiInsight): string {
  if (!hasMeaningfulSignals(lead)) return "";

  const parts: string[] = [];
  const opp = getOpportunityLevel(lead);
  const ch = [...lead.channels];
  const hasDirect = ch.includes("Direct") || lead.hasOwnWebsite;
  const hasOtaChannels = ch.some(
    (c) => c === "Booking" || c === "Airbnb" || c === "Tatilsepeti",
  );

  if (hasOtaChannels || (lead.businessSignals ?? []).includes("ota_dependency")) {
    parts.push(
      "This business appears to have direct booking upside alongside platform visibility.",
    );
  } else if (hasDirect) {
    parts.push(
      "This business shows direct-booking potential based on listing signals.",
    );
  } else {
    parts.push(
      "Public signals suggest room to strengthen owned reservation channels.",
    );
  }

  const pains = getPainPointSummary(lead, 3);
  const commPain = pains.find(
    (p) =>
      p.includes("response") ||
      p.includes("Communication") ||
      p.includes("reachability"),
  );
  if (commPain) {
    parts.push(`Review and listing signals hint at ${commPain.toLowerCase()}.`);
  } else if (pains.length > 0) {
    parts.push(`Notable themes include ${pains[0].toLowerCase()}.`);
  }

  if (lead.hasWhatsAppPath && lead.contactQuality !== "low") {
    parts.push("WhatsApp availability makes consultative outreach practical.");
  } else if (lead.hasInstagram) {
    parts.push("Instagram offers a workable surface for a light-touch conversation.");
  }

  if (opp === "high") {
    parts.push("Overall opportunity looks strong for a focused reservation-ops conversation.");
  } else if (opp === "medium") {
    parts.push("Worth a short discovery touch if the channel fit looks right.");
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Full AI-style insight bundle (deterministic; no network). */
export function generateLeadInsight(
  lead: LeadForAiInsight,
  source: AiInsightSource = "rules",
): LeadAiInsight {
  const painPointSummary = getPainPointSummary(lead, 5);
  const opportunityLevel = getOpportunityLevel(lead);
  const outreachAngle = getOutreachAngle(lead);
  const aiInsight = buildAiInsightParagraph(lead);

  return {
    aiInsight,
    outreachAngle,
    painPointSummary,
    opportunityLevel,
    source,
  };
}
