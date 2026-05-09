import {
  normalizePhoneForWhatsApp,
  type BusinessSignal,
  type ReviewPainPoint,
  type ScoredLead,
} from "@/app/lib/leads";

export type WhyThisLeadTone =
  | "review"
  | "contact"
  | "digital"
  | "opportunity"
  | "priority";

export type WhyThisLeadReason = {
  id: string;
  label: string;
  tone: WhyThisLeadTone;
  priority: number;
};

export type WhyThisLeadEnrichment = {
  bestContactType?: string;
  confidence?: string;
  foundWhatsapp?: readonly string[];
  foundInstagram?: readonly string[];
  foundEmails?: readonly string[];
};

const COMMUNICATION_PAIN_CATEGORIES = new Set<ReviewPainPoint["category"]>([
  "response_delay",
  "unreachable",
  "communication",
  "reservation",
]);

function hasSignal(lead: ScoredLead, signal: BusinessSignal): boolean {
  return lead.businessSignals?.includes(signal) ?? false;
}

function addReason(
  reasons: WhyThisLeadReason[],
  seen: Set<string>,
  reason: WhyThisLeadReason,
) {
  if (seen.has(reason.id)) return;
  seen.add(reason.id);
  reasons.push(reason);
}

function strongestReviewPainPoint(lead: ScoredLead): ReviewPainPoint | null {
  const points = lead.reviewPainPoints ?? [];
  const ranked = points
    .filter((p) => COMMUNICATION_PAIN_CATEGORIES.has(p.category))
    .sort((a, b) => {
      const severityRank = { high: 3, medium: 2, low: 1 };
      const severityDelta = severityRank[b.severity] - severityRank[a.severity];
      if (severityDelta !== 0) return severityDelta;
      return (b.frequency ?? 0) - (a.frequency ?? 0);
    });
  return ranked[0] ?? null;
}

function reviewReasonLabel(point: ReviewPainPoint): string {
  if (point.category === "response_delay") {
    return "Review signals indicate possible response delays";
  }
  if (point.category === "unreachable") {
    return "Review signals suggest guests may struggle to reach the property";
  }
  if (point.category === "reservation") {
    return "Review signals mention reservation friction";
  }
  if (point.category === "communication") {
    return "Review signals indicate communication gaps";
  }
  return point.summary.trim() || "Review signals show a relevant guest pain point";
}

function hasWhatsappPath(lead: ScoredLead, enrichment?: WhyThisLeadEnrichment): boolean {
  const finderType = enrichment?.bestContactType?.toLowerCase() ?? "";
  return (
    normalizePhoneForWhatsApp(lead.phone) !== null ||
    Boolean(enrichment?.foundWhatsapp?.length) ||
    finderType.includes("whatsapp")
  );
}

function hasInstagramSignal(lead: ScoredLead, enrichment?: WhyThisLeadEnrichment): boolean {
  return (
    Boolean(lead.instagram?.trim()) ||
    lead.hasInstagram ||
    Boolean(enrichment?.foundInstagram?.length)
  );
}

function scoreValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getWhyThisLeadReasons(
  lead: ScoredLead,
  options: {
    enrichment?: WhyThisLeadEnrichment;
    limit?: number;
  } = {},
): WhyThisLeadReason[] {
  const reasons: WhyThisLeadReason[] = [];
  const seen = new Set<string>();
  const enrichment = options.enrichment;

  const reviewPoint = strongestReviewPainPoint(lead);
  if (reviewPoint) {
    addReason(reasons, seen, {
      id: `review-${reviewPoint.category}`,
      label: reviewReasonLabel(reviewPoint),
      tone: "review",
      priority: 100,
    });
  }

  if (
    hasSignal(lead, "reputation_risk") ||
    (lead.reviewIntelligenceScore ?? 0) >= 60
  ) {
    addReason(reasons, seen, {
      id: "communication-risk",
      label: "Communication or reputation risk is worth reviewing",
      tone: "review",
      priority: 90,
    });
  }

  if (hasWhatsappPath(lead, enrichment) && lead.contactQuality !== "low") {
    addReason(reasons, seen, {
      id: "whatsapp-available",
      label: "WhatsApp is available for direct outreach",
      tone: "contact",
      priority: 80,
    });
  }

  if (hasInstagramSignal(lead, enrichment)) {
    addReason(reasons, seen, {
      id: "instagram-active",
      label: "Active Instagram presence supports sales context",
      tone: "digital",
      priority: 70,
    });
  }

  if (lead.website?.trim() && hasSignal(lead, "conversion_gap")) {
    addReason(reasons, seen, {
      id: "website-conversion-gap",
      label: "Website exists but conversion path may be weak",
      tone: "digital",
      priority: 64,
    });
  } else if (
    !lead.hasOwnWebsite ||
    hasSignal(lead, "missing_own_website") ||
    hasSignal(lead, "premium_without_owned_funnel")
  ) {
    addReason(reasons, seen, {
      id: "booking-flow-gap",
      label: "Missing booking flow may create conversion gaps",
      tone: "digital",
      priority: 62,
    });
  } else if (lead.websiteIntelligence?.hasBookingCtaText === false) {
    addReason(reasons, seen, {
      id: "weak-booking-cta",
      label: "Owned site may need a clearer booking path",
      tone: "digital",
      priority: 62,
    });
  }

  if (hasSignal(lead, "ota_dependency") || hasSignal(lead, "conversion_gap")) {
    addReason(reasons, seen, {
      id: "direct-booking-opportunity",
      label: "High direct booking opportunity",
      tone: "opportunity",
      priority: 58,
    });
  }

  if (hasSignal(lead, "growth_oriented")) {
    addReason(reasons, seen, {
      id: "growth-oriented",
      label: "Growth-Oriented",
      tone: "opportunity",
      priority: 56,
    });
  }

  if (hasSignal(lead, "commercially_active")) {
    addReason(reasons, seen, {
      id: "commercially-active",
      label: "Commercially Active",
      tone: "opportunity",
      priority: 55,
    });
  }

  if (hasSignal(lead, "operationally_mature")) {
    addReason(reasons, seen, {
      id: "operationally-mature",
      label: "Operationally Mature",
      tone: "opportunity",
      priority: 54,
    });
  }

  if (hasSignal(lead, "high_roi_potential")) {
    addReason(reasons, seen, {
      id: "high-roi-potential",
      label: "High ROI Potential",
      tone: "opportunity",
      priority: 57,
    });
  }

  if ((lead.hotScore >= 70 && (lead.intelligenceScore ?? 0) >= 55) || lead.leadScore >= 75) {
    addReason(reasons, seen, {
      id: "outreach-potential",
      label: "Strong outreach potential",
      tone: "opportunity",
      priority: 50,
    });
  }

  const priorityScore =
    scoreValue(lead.smartLeadScoreV2) ??
    scoreValue(lead.priorityScore) ??
    scoreValue(lead.contactReadinessScore);
  if (priorityScore !== null && priorityScore >= 75) {
    addReason(reasons, seen, {
      id: "high-priority-score",
      label: "High priority score",
      tone: "priority",
      priority: 40,
    });
  }

  if (reasons.length === 0) {
    for (const line of lead.whyThisLead ?? []) {
      const label = line.trim();
      if (!label) continue;
      addReason(reasons, seen, {
        id: `existing-${label.toLowerCase()}`,
        label,
        tone: "opportunity",
        priority: 10,
      });
    }
  }

  return reasons
    .sort((a, b) => b.priority - a.priority)
    .slice(0, options.limit ?? 5);
}
