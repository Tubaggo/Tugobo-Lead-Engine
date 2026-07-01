import type { ScoredLead } from "@/app/lib/leads";
import type { PackageTier, Priority } from "@/app/components/v2/mock/mock-queue";

export type FollowUpState = "overdue" | "today" | "tomorrow" | "this-week" | "scheduled" | "done";
export type LeadTemperature = "hot" | "warm" | "cold";
export type PriorityFilter = "all" | "critical" | "high" | "medium" | "low";
export type StateFilter = "all" | "overdue" | "today" | "upcoming" | "no-response" | "this-week" | "done";
export type FollowUpSortKey = "priority" | "opportunity" | "icp" | "last-contact";

export type FollowUpCard = {
  id: string;
  hotelName: string;
  hotelType: string;
  city: string;
  packageTier: PackageTier;
  priority: Priority;
  outreachPriority: number;

  followUpState: FollowUpState;
  urgencyLabel: string;

  /** Raw epoch ms — used for sort; null if never contacted */
  lastContactedAtMs: number | null;
  lastContactLabel: string;
  contactAttempts: number;

  opportunityScore: number;
  icpScore: number;

  actionLabel: string;
  outreachAngle: string;
  leadTemperature: LeadTemperature;
  urgencyLevel: "high" | "medium" | "low";

  /** Human-readable label for when the next follow-up is due, e.g. "Yarın", "3g gecikti" */
  nextFollowUpLabel: string;
  /** Raw epoch ms of the scheduled next follow-up; null if none is set */
  nextFollowUpAtMs: number | null;
  /** True when contactAttempts > 0 but lead hasn't been marked done (i.e. no response received) */
  isNoResponse: boolean;

  whyThisLead: string[];
  aiInsight: string;
};

export type FollowUpSummary = {
  total: number;
  pendingCount: number;
  todayCount: number;
  overdueCount: number;
  hotCount: number;
  doneCount: number;
  thisWeekCount: number;
  scheduledCount: number;
  noResponseCount: number;
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

const ACTION_LABEL: Record<string, string> = {
  send_whatsapp: "WhatsApp Gönder",
  follow_up: "Takip Et",
  research_more: "Araştır",
  wait: "Bekle",
  skip: "Atla",
};

export function stateRank(state: FollowUpState): number {
  switch (state) {
    case "overdue":
      return 5;
    case "today":
      return 4;
    case "tomorrow":
      return 3;
    case "this-week":
      return 2;
    case "scheduled":
      return 1;
    case "done":
      return 0;
  }
}

/** Calendar-day difference (local time), not raw ms/24h — avoids timezone off-by-one errors. */
function calendarDayDiff(fromMs: number, toMs: number): number {
  const startOfDay = (ms: number) => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  return Math.round((startOfDay(toMs) - startOfDay(fromMs)) / 86_400_000);
}

function deriveState(lead: ScoredLead): FollowUpState {
  const now = Date.now();
  const lastContactedMs =
    typeof lead.lastContactedAt === "number" && lead.lastContactedAt > 0
      ? lead.lastContactedAt
      : null;
  const nextFollowUpMs =
    typeof lead.nextFollowUpAt === "number" && lead.nextFollowUpAt > 0
      ? lead.nextFollowUpAt
      : null;

  // An explicit scheduled follow-up (Yarın Hatırlat / 3 Gün Sonra Hatırlat / the auto-schedule
  // from Temas Kuruldu) is the user's own action and must always win over the static
  // priorityBucket/recommendedAction business signals below — otherwise a lead originally
  // scored as "today" would keep showing "Bugün Ara" forever regardless of what the user did.
  if (nextFollowUpMs) {
    const dayDiff = calendarDayDiff(now, nextFollowUpMs);
    if (dayDiff < 0) return "overdue";
    if (dayDiff === 0) return "today";
    if (dayDiff === 1) return "tomorrow";
    // Any future day (2, 8, 30, ...) is "this-week" bucket — urgencyLabel renders the
    // exact day count ("X Gün Sonra") regardless of how far out. "scheduled" (→ "Takip
    // Gerekli") is reserved for leads with no explicit date at all.
    return "this-week";
  }

  // Recently contacted (within 8 hours) with no follow-up scheduled → done for now.
  if (lastContactedMs && now - lastContactedMs < 8 * 60 * 60 * 1_000) {
    return "done";
  }

  // No explicit date set yet — fall back to the business-priority signals from scoring.
  if (lead.priorityBucket === "today") return "today";
  if (lead.recommendedAction === "follow_up" && (lead.outreachPriority ?? 0) > 65) return "today";
  if (lead.priorityBucket === "high") return "this-week";
  if (lead.recommendedAction === "follow_up") return "this-week";

  return "scheduled";
}

function urgencyLabel(state: FollowUpState, dayDiff: number | null, neverContacted: boolean): string {
  switch (state) {
    case "done":
      return "Tamamlandı";
    case "today":
      return "Bugün Ara";
    case "tomorrow":
      return "Yarın Ara";
    case "this-week":
      return dayDiff !== null && dayDiff > 0 ? `${dayDiff} Gün Sonra` : "Bu Hafta";
    case "overdue":
      return "Gecikmiş";
    case "scheduled":
      return neverContacted ? "İlk temas bekleniyor" : "Takip Gerekli";
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

function deriveTemperature(lead: ScoredLead): LeadTemperature {
  const t = lead.outreachIntelligence?.leadTemperature;
  if (t === "hot") return "hot";
  if (t === "warm") return "warm";
  if (t === "cold") return "cold";
  switch (lead.priorityBucket) {
    case "today":
      return "hot";
    case "high":
      return "warm";
    default:
      return "cold";
  }
}

function deriveUrgencyLevel(lead: ScoredLead): "high" | "medium" | "low" {
  const u = lead.outreachIntelligence?.urgencyLevel;
  if (u === "high") return "high";
  if (u === "medium") return "medium";
  if (u === "low") return "low";
  if (lead.priorityBucket === "today" || lead.priorityBucket === "high") return "high";
  if (lead.priorityBucket === "medium") return "medium";
  return "low";
}

function formatNextFollowUp(ms: number | null): string {
  if (!ms) return "—";
  // Same calendar-day math as deriveState/urgencyLabel so this line never contradicts
  // the main state badge (e.g. never says "3 gün içinde" while the badge says "Yarın Ara").
  const d = calendarDayDiff(Date.now(), ms);
  if (d < 0) return d === -1 ? "1 gün gecikti" : `${-d}g gecikti`;
  if (d === 0) return "Bugün";
  if (d === 1) return "Yarın";
  if (d <= 7) return `${d} gün içinde`;
  if (d <= 14) return "1 hafta içinde";
  return `${Math.round(d / 7)} hafta içinde`;
}

// ── main adapter ──────────────────────────────────────────────

export function adaptScoredLeadsToFollowUpCards(
  scored: ScoredLead[],
  opts?: { includeDoNotContact?: boolean },
): FollowUpCard[] {
  return scored
    .filter((l) => l.priorityBucket !== "archive" && (opts?.includeDoNotContact || !l.doNotContact))
    .map((lead) => {
      const lastContactedMs =
        typeof lead.lastContactedAt === "number" && lead.lastContactedAt > 0
          ? lead.lastContactedAt
          : null;
      const nextFollowUpMs =
        typeof lead.nextFollowUpAt === "number" && lead.nextFollowUpAt > 0
          ? lead.nextFollowUpAt
          : null;

      const state = deriveState(lead);
      const dayDiff = nextFollowUpMs ? calendarDayDiff(Date.now(), nextFollowUpMs) : null;
      const neverContacted = !lastContactedMs;

      return {
        id: lead.id,
        hotelName: lead.name,
        hotelType: lead.type ?? "Hotel",
        city: lead.city,
        packageTier: toPackageTier(lead.businessTier),
        priority: toPriority(lead.priorityBucket),
        outreachPriority: lead.outreachPriority ?? 0,

        followUpState: state,
        urgencyLabel: urgencyLabel(state, dayDiff, neverContacted),

        lastContactedAtMs: lastContactedMs,
        lastContactLabel: formatLastContact(lastContactedMs),
        contactAttempts: lead.contactAttempts ?? 0,

        opportunityScore: Math.round(
          lead.verifiedOpportunityScore ?? lead.opportunityScore ?? lead.leadScore ?? 50,
        ),
        icpScore: Math.round(lead.icpFitScore ?? 0),

        actionLabel: ACTION_LABEL[lead.recommendedAction ?? ""] ?? "—",
        outreachAngle: lead.outreachAngle ?? "",
        leadTemperature: deriveTemperature(lead),
        urgencyLevel: deriveUrgencyLevel(lead),

        nextFollowUpLabel: formatNextFollowUp(nextFollowUpMs),
        nextFollowUpAtMs: nextFollowUpMs,
        // "Yanıt Yok" means marked no-response with no specific next-contact date set.
        // Once a date is scheduled (+1 Gün / +3 Gün / auto-schedule from Temas Kuruldu),
        // the date-based state above takes over — it is no longer "no response", it is
        // "follow-up scheduled", even though both share the same underlying status value.
        isNoResponse:
          !nextFollowUpMs &&
          ((lead.status === "needs_follow_up") ||
            ((lead.contactAttempts ?? 0) > 0 &&
              state !== "done" &&
              !(lastContactedMs && Date.now() - lastContactedMs < 8 * 60 * 60 * 1_000))),

        whyThisLead: lead.whyThisLead ?? [],
        aiInsight: lead.aiInsight ?? "",
      };
    })
    .sort((a, b) => stateRank(b.followUpState) - stateRank(a.followUpState) || b.outreachPriority - a.outreachPriority);
}

export function computeFollowUpSummary(cards: FollowUpCard[]): FollowUpSummary {
  const total = cards.length;
  const overdueCount = cards.filter((c) => c.followUpState === "overdue").length;
  const todayCount = cards.filter((c) => c.followUpState === "today" || c.followUpState === "overdue").length;
  const thisWeekCount = cards.filter((c) => c.followUpState === "this-week").length;
  const scheduledCount = cards.filter((c) => c.followUpState === "scheduled").length;
  const doneCount = cards.filter((c) => c.followUpState === "done").length;
  const pendingCount = total - doneCount;
  const hotCount = cards.filter((c) => c.leadTemperature === "hot").length;
  const noResponseCount = cards.filter((c) => c.isNoResponse).length;

  return {
    total,
    pendingCount,
    todayCount,
    overdueCount,
    hotCount,
    doneCount,
    thisWeekCount,
    scheduledCount,
    noResponseCount,
  };
}
