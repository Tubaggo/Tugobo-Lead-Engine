/**
 * v3.7.8 — Clickable Operation Flow & Direct Navigation.
 *
 * Single source of truth mapping a "Bugünün Operasyonu" KPI card / "Operasyon
 * Akışı" flow row to an EXISTING dashboard section and the EXISTING All-Leads
 * filter state that surfaces the same records.
 *
 * Pure — no React, no DOM, no I/O — so the navigation contract is unit-testable
 * and the same helper drives both the count semantics and the filter binding
 * (no parallel navigation system, no new filter system).
 *
 * Section ids and filter values below are re-used verbatim from the page; they
 * are NOT a new taxonomy:
 *   - section ids come from SectionNavigationRail.SECTION_NAV_DEFS
 *   - statusFilter values are a subset of leads.LeadStatus (+ "all")
 *   - timeFilter values are the existing AllLeadsTimeFilter union
 *   - tab values are the existing All-Leads tab union
 */

/** Existing navigable section anchors (subset of SECTION_NAV_DEFS ids). */
export type OperationSectionId =
  | "tum-leadler"
  | "satis-boru-hatti"
  | "bugunun-firsatlari"
  | "satis-plani"
  | "lead-havuzu"
  | "sicak-leadler"
  | "gelir-risk";

/** Subset of LeadStatus | "all" — no new statuses introduced. */
export type OperationStatusFilter =
  | "all"
  | "new"
  | "contacted"
  | "replied"
  | "meeting"
  | "won";

/** Existing AllLeadsTimeFilter union. */
export type OperationTimeFilter =
  | "last_import"
  | "today"
  | "all_time"
  | "follow_up"
  | "today_work";

/** Existing All-Leads tab union. */
export type OperationTab = "focused" | "new" | "hot" | "all";

/**
 * Exact operational filter mode. `"hot_now"` binds the destination list to the
 * shared HOT_NOW selector (leads.isHotNowLead) so it shows exactly the same lead
 * id set the "Sıcak Fırsatları İşle" card counted — not a hotScore approximation.
 */
export type OperationFilterMode = "hot_now";

/**
 * Resolved navigation intent. When `openAllLeads` is set the target lives inside
 * the collapsible "Tüm Lead'ler" table and the filter fields describe how to
 * filter it; otherwise the target is a standalone section and only `sectionId`
 * matters.
 */
export type OperationTarget = {
  sectionId: OperationSectionId;
  openAllLeads?: boolean;
  timeFilter?: OperationTimeFilter;
  statusFilter?: OperationStatusFilter;
  tab?: OperationTab;
  /** When set, the destination list uses an exact operational selector instead
   * of the status/time/tab filter chain (see {@link OperationFilterMode}). */
  operationFilter?: OperationFilterMode;
};

/**
 * Every clickable KPI / flow row key.
 *
 *  Brief KPIs (DailyOperatingBrief):
 *    critical      — "Kritik İş"        → today's actionable work
 *    activeLeads   — "Aktif Lead"       → all active (non-won/lost) leads
 *    dailyTarget   — "Günlük Hedef"     → today's sales plan
 *  Progress strip (DailyProgressStrip):
 *    queueRate     — "Kuyruk Tamamlama" → today's opportunity queue
 *    contacted     — "İletişim Kuruldu" → contacted leads
 *    followUpClosed— "Takip Kapatılan"  → replied (answered) leads
 *    demoPlanned   — "Demo Planlanan"   → meeting-stage leads
 *    won           — "Kazanılan"        → won leads
 *  Operation flow (FounderWorkflowSteps):
 *    closeFollowUps— "Takipleri Kapat"        → overdue / due follow-ups
 *    engageHot     — "Sıcak Fırsatları İşle"  → hot new leads
 *    advanceDemo   — "Demo Adaylarını İlerlet"→ pipeline demo/meeting stage
 *    generateNew   — "Yeni Fırsat Üret"       → lead pool / import
 */
export type OperationNavKey =
  | "critical"
  | "activeLeads"
  | "dailyTarget"
  | "queueRate"
  | "contacted"
  | "followUpClosed"
  | "demoPlanned"
  | "won"
  | "closeFollowUps"
  | "engageHot"
  | "advanceDemo"
  | "generateNew";

export const OPERATION_TARGETS: Readonly<Record<OperationNavKey, OperationTarget>> = {
  // ── Brief KPIs ────────────────────────────────────────────────────────────
  critical: {
    sectionId: "tum-leadler",
    openAllLeads: true,
    // "Bugünün İşi": new OR follow-up due — the actionable-today slice.
    timeFilter: "today_work",
    statusFilter: "all",
    tab: "all",
  },
  activeLeads: {
    sectionId: "tum-leadler",
    openAllLeads: true,
    timeFilter: "all_time",
    statusFilter: "all",
    tab: "all",
  },
  dailyTarget: {
    // Info card wired to the daily plan it summarizes.
    sectionId: "satis-plani",
  },

  // ── Progress strip (each count is status === X → statusFilter X = parity) ──
  queueRate: {
    sectionId: "bugunun-firsatlari",
  },
  contacted: {
    sectionId: "tum-leadler",
    openAllLeads: true,
    timeFilter: "all_time",
    statusFilter: "contacted",
    tab: "all",
  },
  followUpClosed: {
    sectionId: "tum-leadler",
    openAllLeads: true,
    timeFilter: "all_time",
    statusFilter: "replied",
    tab: "all",
  },
  demoPlanned: {
    sectionId: "tum-leadler",
    openAllLeads: true,
    timeFilter: "all_time",
    statusFilter: "meeting",
    tab: "all",
  },
  won: {
    sectionId: "tum-leadler",
    openAllLeads: true,
    timeFilter: "all_time",
    statusFilter: "won",
    tab: "all",
  },

  // ── Operation flow ────────────────────────────────────────────────────────
  closeFollowUps: {
    sectionId: "tum-leadler",
    openAllLeads: true,
    // isFollowUpDue == computeTodayActionStatus === "FOLLOW_UP_DUE" predicate.
    timeFilter: "follow_up",
    statusFilter: "all",
    tab: "all",
  },
  engageHot: {
    sectionId: "tum-leadler",
    openAllLeads: true,
    // Exact HOT_NOW parity — same selector & lead id set as the card count.
    operationFilter: "hot_now",
  },
  // Always the Sales Pipeline / Demo Candidates target — never Lead Havuzu, even
  // with 0 demo candidates (the pipeline section renders its own empty state).
  advanceDemo: {
    sectionId: "satis-boru-hatti",
  },
  generateNew: {
    sectionId: "lead-havuzu",
  },
};

const OPERATION_NAV_KEYS: readonly OperationNavKey[] = Object.keys(
  OPERATION_TARGETS,
) as OperationNavKey[];

export function isOperationNavKey(value: unknown): value is OperationNavKey {
  return typeof value === "string" && (OPERATION_NAV_KEYS as string[]).includes(value);
}

/**
 * Resolves a nav key to its target. Unknown keys fall back to the safe overview
 * of all active leads instead of throwing or navigating nowhere.
 */
export function resolveOperationTarget(key: OperationNavKey): OperationTarget {
  return OPERATION_TARGETS[key] ?? OPERATION_TARGETS.activeLeads;
}

/* -------------------------------------------------------------------------- */
/* v3.9.1 — Founder Command Center primary-command destination                */
/* -------------------------------------------------------------------------- */

/**
 * Priority levels produced by `computeFounderCommand` in Dashboard.tsx
 * (`FounderCommandResult.priority`). Mirrored here rather than imported, so
 * this module stays free of any Dashboard/React dependency.
 *
 * Order: FOLLOW_UP_DUE(1) > HOT_NOW(2) > DEMO_READY(3) > RECOVERY(4) >
 * PIPELINE_LOW(5).
 */
export type FounderCommandPriority = 1 | 2 | 3 | 4 | 5;

/**
 * Where the Founder Command Center's single primary command should send the
 * founder on click. Two kinds because the real destinations are two
 * genuinely different things in this app:
 *  - `section` — an anchor on the same page, opened with `goToSection`.
 *  - `href` — a separate route. Only `/dashboard/follow-ups` today, the same
 *    Takipler page already linked twice elsewhere in Dashboard.tsx.
 * Not a new navigation system — a typed description of the two that already
 * exist, so the component doesn't need to know which one applies.
 */
export type CommandDestination =
  | { kind: "section"; sectionId: OperationSectionId }
  | { kind: "href"; href: string };

/** The existing Takipler route (see the two `<a href>` uses in Dashboard.tsx). */
export const FOLLOW_UPS_HREF = "/dashboard/follow-ups";

/**
 * Resolves the Command Center's priority to a real, existing destination.
 * Keyed off the structured priority the engine already computes — not the
 * `command` copy string — so a wording change can never desync the link.
 */
export function resolveFounderCommandDestination(
  priority: FounderCommandPriority,
): CommandDestination {
  switch (priority) {
    case 1:
      // "Takip gecikmelerini kapat" — overdue follow-ups live in Takipler.
      return { kind: "href", href: FOLLOW_UPS_HREF };
    case 2:
      // "Sıcak fırsatlarla iletişime geç" — the Hot Leads workspace.
      return { kind: "section", sectionId: "sicak-leadler" };
    case 3:
      // "Demo adaylarını ilerlet" — the sales pipeline.
      return { kind: "section", sectionId: "satis-boru-hatti" };
    case 4:
      // "Risk altındaki geliri geri kazan" — Revenue & Risk.
      return { kind: "section", sectionId: "gelir-risk" };
    case 5:
      // "Yeni fırsat üretimine odaklan" — generate new leads.
      return { kind: "section", sectionId: "lead-havuzu" };
  }
}
