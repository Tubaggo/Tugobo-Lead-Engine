import type { ScoredLead } from "@/app/lib/leads";

/* ── Queue types ────────────────────────────────────────────────── */

export type AutomationQueueType =
  | "re-enrich"
  | "website-scan"
  | "contact-finder"
  | "whatsapp-verify"
  | "ai-review"
  | "follow-up"
  | "daily-outreach";

export type AutomationPriority = "critical" | "high" | "medium" | "low";
export type AutomationStatus = "ready" | "blocked" | "overdue" | "pending";

export type AutomationCard = {
  id: string;
  hotelName: string;
  city: string;
  hotelType: string;
  primaryQueue: AutomationQueueType;
  queueLabel: string;
  reason: string;
  priority: AutomationPriority;
  status: AutomationStatus;
  statusLabel: string;
  actionLabel: string;
  lastActivityMs: number | null;
  lastActivityLabel: string;
  opportunityScore: number;
  website: string | null;
  phone: string | null;
  instagram: string | null;
  queues: AutomationQueueType[];
  scoredLead: ScoredLead;
};

export type QueueSummary = {
  type: AutomationQueueType;
  label: string;
  total: number;
  ready: number;
  overdue: number;
};

export type AutomationSummary = {
  total: number;
  ready: number;
  overdue: number;
  blocked: number;
  queues: QueueSummary[];
};

/* ── Label maps ─────────────────────────────────────────────────── */

export const QUEUE_LABELS: Record<AutomationQueueType, string> = {
  "re-enrich": "Yeniden Zenginleştir",
  "website-scan": "Web Sitesi Tarama",
  "contact-finder": "İletişim Bul",
  "whatsapp-verify": "WhatsApp Doğrula",
  "ai-review": "AI İnceleme",
  "follow-up": "Takip",
  "daily-outreach": "Günlük Outreach",
};

export const ACTION_LABELS: Record<AutomationQueueType, string> = {
  "re-enrich": "Yeniden Zenginleştir",
  "website-scan": "Siteyi Tara",
  "contact-finder": "İletişim Bul",
  "whatsapp-verify": "WhatsApp Doğrula",
  "ai-review": "AI İnceleme",
  "follow-up": "Takip Et",
  "daily-outreach": "Mesaj Gönder",
};

const PRIORITY_RANK: Record<AutomationPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/* ── Pure helpers ───────────────────────────────────────────────── */

function formatLastActivity(ms: number | null): string {
  if (!ms) return "—";
  const diffH = (Date.now() - ms) / (60 * 60 * 1000);
  if (diffH < 1) return "Az önce";
  if (diffH < 24) return `${Math.round(diffH)}s önce`;
  const d = Math.round(diffH / 24);
  if (d === 1) return "Dün";
  if (d <= 7) return `${d} gün önce`;
  return `${Math.round(d / 7)} hafta önce`;
}

function getLastActivityMs(lead: ScoredLead): number | null {
  const candidates: (number | null | undefined)[] = [
    lead.lastEnrichedAt ? new Date(lead.lastEnrichedAt).getTime() : null,
    lead.lastAiReviewAt ? new Date(lead.lastAiReviewAt).getTime() : null,
    lead.lastVerificationAt ? new Date(lead.lastVerificationAt).getTime() : null,
    lead.lastContactedAt,
    lead.lastImportedAt,
  ];
  const valid = candidates.filter((v): v is number => typeof v === "number" && v > 0);
  return valid.length > 0 ? Math.max(...valid) : null;
}

function hasWebsiteSignal(lead: ScoredLead): boolean {
  return !!(
    lead.website?.trim() ||
    lead.websiteCandidateUrl?.trim() ||
    lead.hasOwnWebsite
  );
}

function isWhatsAppVerified(lead: ScoredLead): boolean {
  return lead.signalVerification?.whatsappVerification === "verified";
}

function getQueueMemberships(lead: ScoredLead, now: number): AutomationQueueType[] {
  if (lead.doNotContact) return [];

  const types = new Set<AutomationQueueType>();
  const sv = lead.signalVerification;
  const hasWeb = hasWebsiteSignal(lead);

  // Follow-up: nextFollowUpAt within 24h or overdue
  const nextFollowUp =
    typeof lead.nextFollowUpAt === "number" && lead.nextFollowUpAt > 0
      ? lead.nextFollowUpAt
      : null;
  if (nextFollowUp && nextFollowUp < now + 24 * 60 * 60 * 1000) {
    types.add("follow-up");
  }

  // Daily outreach: today-bucket leads
  if (lead.priorityBucket === "today" || lead.priorityBucket === "high") {
    types.add("daily-outreach");
  }

  // Re-enrich: never enriched
  if (!lead.lastEnrichedAt) {
    types.add("re-enrich");
  }

  // Website scan: has website but no websiteIntelligence
  if (hasWeb && !lead.websiteIntelligence) {
    types.add("website-scan");
  }

  // Contact finder: has website but WhatsApp not verified
  if (hasWeb && !isWhatsAppVerified(lead)) {
    types.add("contact-finder");
  }

  // WhatsApp verify: has phone but not verified
  if (lead.phone?.trim() && !isWhatsAppVerified(lead)) {
    types.add("whatsapp-verify");
  }

  // AI review: no LLM insight yet
  if (lead.aiInsightSource !== "llm") {
    types.add("ai-review");
  }

  return Array.from(types);
}

function getPrimaryQueue(lead: ScoredLead, now: number): AutomationQueueType {
  const nextFollowUp =
    typeof lead.nextFollowUpAt === "number" && lead.nextFollowUpAt > 0
      ? lead.nextFollowUpAt
      : null;

  if (nextFollowUp && nextFollowUp < now) return "follow-up";
  if (lead.priorityBucket === "today") return "daily-outreach";
  if (!lead.lastEnrichedAt) return "re-enrich";

  const hasWeb = hasWebsiteSignal(lead);
  if (hasWeb && !lead.websiteIntelligence) return "website-scan";
  if (hasWeb && !isWhatsAppVerified(lead)) return "contact-finder";
  if (lead.phone?.trim() && !isWhatsAppVerified(lead)) return "whatsapp-verify";
  if (lead.aiInsightSource !== "llm") return "ai-review";

  return "daily-outreach";
}

function getStatus(
  lead: ScoredLead,
  primaryQueue: AutomationQueueType,
  now: number,
): AutomationStatus {
  if (lead.doNotContact || lead.whatsappInvalid) return "blocked";

  const nextFollowUp =
    typeof lead.nextFollowUpAt === "number" && lead.nextFollowUpAt > 0
      ? lead.nextFollowUpAt
      : null;

  if (primaryQueue === "follow-up" && nextFollowUp && nextFollowUp < now) {
    return "overdue";
  }

  return "ready";
}

function getStatusLabel(status: AutomationStatus): string {
  switch (status) {
    case "ready":   return "Hazır";
    case "blocked": return "Engellendi";
    case "overdue": return "Gecikti";
    case "pending": return "Bekliyor";
  }
}

function getReason(lead: ScoredLead, queue: AutomationQueueType): string {
  const now = Date.now();
  switch (queue) {
    case "re-enrich":
      return "Zenginleştirme henüz çalıştırılmadı";
    case "website-scan":
      return "Web sitesi sinyalleri analiz edilmedi";
    case "contact-finder":
      return "WhatsApp bağlantısı doğrulanmadı";
    case "whatsapp-verify":
      return lead.phone ? "Telefon numarası doğrulanmadı" : "İletişim bilgisi eksik";
    case "ai-review":
      return lead.aiInsightSource === "rules"
        ? "Kural tabanlı analiz — LLM incelemesi bekleniyor"
        : "AI analizi mevcut değil";
    case "follow-up": {
      const nextFollowUp =
        typeof lead.nextFollowUpAt === "number" ? lead.nextFollowUpAt : null;
      if (nextFollowUp && nextFollowUp < now) {
        const overdueDays = Math.round((now - nextFollowUp) / (24 * 60 * 60 * 1000));
        return overdueDays >= 1 ? `${overdueDays} gün gecikti` : "Bugün takip zamanı";
      }
      return "Takip zamanı geldi";
    }
    case "daily-outreach":
      return lead.outreachAngle
        ? lead.outreachAngle.slice(0, 80)
        : "Günlük outreach kuyruğu";
  }
}

function getPriority(
  lead: ScoredLead,
  queue: AutomationQueueType,
  status: AutomationStatus,
): AutomationPriority {
  if (status === "overdue") return "critical";
  if (queue === "daily-outreach" || queue === "follow-up") return "high";
  const score = lead.verifiedOpportunityScore ?? lead.opportunityScore ?? lead.leadScore ?? 0;
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  return "low";
}

/* ── Main export ────────────────────────────────────────────────── */

export function adaptScoredLeadsToAutomationCards(
  leads: ScoredLead[],
): AutomationCard[] {
  const now = Date.now();

  return leads
    .map((lead): AutomationCard | null => {
      const queues = getQueueMemberships(lead, now);
      if (queues.length === 0) return null;

      const primaryQueue = getPrimaryQueue(lead, now);
      const status = getStatus(lead, primaryQueue, now);
      const priority = getPriority(lead, primaryQueue, status);
      const lastActivityMs = getLastActivityMs(lead);

      return {
        id: lead.id,
        hotelName: lead.name,
        city: lead.city,
        hotelType: lead.type ?? "Hotel",
        primaryQueue,
        queueLabel: QUEUE_LABELS[primaryQueue],
        reason: getReason(lead, primaryQueue),
        priority,
        status,
        statusLabel: getStatusLabel(status),
        actionLabel: ACTION_LABELS[primaryQueue],
        lastActivityMs,
        lastActivityLabel: formatLastActivity(lastActivityMs),
        opportunityScore: Math.round(
          lead.verifiedOpportunityScore ?? lead.opportunityScore ?? lead.leadScore ?? 50,
        ),
        website:
          lead.website?.trim() || lead.websiteCandidateUrl?.trim() || null,
        phone: lead.phone?.trim() || null,
        instagram: lead.instagram?.trim() || null,
        queues,
        scoredLead: lead,
      };
    })
    .filter((c): c is AutomationCard => c !== null)
    .sort((a, b) => {
      if (PRIORITY_RANK[b.priority] !== PRIORITY_RANK[a.priority]) {
        return PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
      }
      return b.opportunityScore - a.opportunityScore;
    });
}

export function computeAutomationSummary(cards: AutomationCard[]): AutomationSummary {
  const total = cards.length;
  const ready = cards.filter((c) => c.status === "ready").length;
  const overdue = cards.filter((c) => c.status === "overdue").length;
  const blocked = cards.filter((c) => c.status === "blocked").length;

  const queueTypes: AutomationQueueType[] = [
    "daily-outreach",
    "follow-up",
    "re-enrich",
    "website-scan",
    "contact-finder",
    "whatsapp-verify",
    "ai-review",
  ];

  const queues: QueueSummary[] = queueTypes.map((type) => {
    const matching = cards.filter((c) => c.queues.includes(type));
    return {
      type,
      label: QUEUE_LABELS[type],
      total: matching.length,
      ready: matching.filter((c) => c.status === "ready").length,
      overdue: matching.filter((c) => c.status === "overdue").length,
    };
  });

  return { total, ready, overdue, blocked, queues };
}
