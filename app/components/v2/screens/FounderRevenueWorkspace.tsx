"use client";

import { useEffect, useRef, useState } from "react";
import { OPPORTUNITY_REASON_LABELS, type ScoredLead } from "@/app/lib/leads";
import type { DraftRevisionBusinessContextLike } from "@/app/components/v2/hermes-draft-revision";
import type { HermesMission } from "@/app/components/v2/adapters/hermes-mission-adapter";
import {
  computeActionQueue,
  computeHermesHealth,
  computeHermesTimeline,
  computeRevenueSummary,
} from "@/app/components/v2/adapters/founder-revenue-workspace-adapter";
import {
  computeHermesLeadIntakeSummary,
  HERMES_LEAD_INTAKE_BUTTON_LABELS,
  type HermesLeadIntakeImportEntryLike,
} from "@/app/components/v2/adapters/hermes-lead-intake-adapter";
import {
  computeHermesDecisionQueue,
  type HermesDecisionItem,
  type HermesDecisionPriority,
} from "@/app/components/v2/adapters/hermes-decision-queue-adapter";
import {
  computeHermesOpportunityFocus,
  computeHermesOpportunityFocusForFreshLead,
  type HermesOpportunityTimelineTone,
  type OpportunityFocusExtraTimelineEntryLike,
} from "@/app/components/v2/adapters/hermes-opportunity-focus-adapter";
import { buildPipelineTimelineEntries } from "@/app/components/v2/hermes-pipeline-engine";
import type { HermesPipeline } from "@/app/components/v2/hermes-pipeline-engine";
import { buildDraftTimelineEntries } from "@/app/components/v2/hermes-courier";
import type { HermesOutboundDraft } from "@/app/components/v2/hermes-courier";
import type { HermesDeliveryRequest } from "@/app/components/v2/hermes-delivery-gateway";
import type { RunAcquisitionResult } from "@/app/lib/hermes-autonomous-acquisition-runtime";
import {
  computeFounderWorkingQueue,
  isDirectMutationDecisionType,
  type WorkingQueueItem,
} from "@/app/components/v2/adapters/hermes-working-queue-adapter";
import { computeCommercialJourney } from "@/app/components/v2/adapters/hermes-commercial-journey-adapter";
import { firstSeenAt, isSameCalendarDay } from "@/app/components/v2/adapters/hermes-acquisition-explainability-adapter";
import DealWorkspace from "@/app/components/v2/screens/DealWorkspace";
import {
  HERMES_DAILY_WORKSPACE_LABELS,
} from "@/app/components/v2/adapters/hermes-daily-workspace-adapter";
import { computeFounderNarrative } from "@/app/components/v2/adapters/hermes-founder-narrative-adapter";
import {
  HERMES_ACQUISITION_FOUNDER_LABELS,
  computeHermesAcquisitionFounderView,
  type AcquisitionStatusLike,
} from "@/app/components/v2/adapters/hermes-acquisition-founder-adapter";
import {
  HERMES_ACQUISITION_EXPLAINABILITY_LABELS,
  computeAcquisitionExplainability,
  type AcquisitionAttentionLevel,
  type FounderOpportunityExplanation,
} from "@/app/components/v2/adapters/hermes-acquisition-explainability-adapter";
import {
  HERMES_QUALIFICATION_FOUNDER_LABELS,
  computeQualificationFounderView,
  selectQualificationReviewItems,
  type QualificationApiResultLike,
  type QualificationApiSummaryLike,
  type QualificationFounderCard,
} from "@/app/components/v2/adapters/hermes-qualification-founder-adapter";
import {
  HERMES_OUTREACH_FOUNDER_LABELS,
  computeOutreachFounderView,
  selectOutreachForLead,
  type OutreachApiResultLike,
  type OutreachApiSummaryLike,
  type OutreachFounderCard,
} from "@/app/components/v2/adapters/hermes-outreach-founder-adapter";
import {
  HERMES_CONVERSATION_FOUNDER_LABELS,
  computeConversationFounderView,
  type ConversationApiResultLike,
  type ConversationApiSummaryLike,
  type ConversationFounderCard,
} from "@/app/components/v2/adapters/hermes-conversation-founder-adapter";
import {
  HERMES_FOLLOW_UP_PLAN_LABELS,
  computeFollowUpPlanView,
  type FollowUpPlanApiResultLike,
  type FollowUpPlanApiSummaryLike,
  type FollowUpPlanCard,
} from "@/app/components/v2/adapters/hermes-follow-up-plan-founder-adapter";
import {
  HERMES_REVENUE_PIPELINE_LABELS,
  computeRevenuePipelineView,
  type RevenuePipelineApiItemLike,
  type RevenuePipelineApiSummaryLike,
  type RevenuePipelineCard,
} from "@/app/components/v2/adapters/hermes-revenue-pipeline-founder-adapter";
import type { ProcessedWhatsAppDeliveryReceipt } from "@/app/lib/whatsapp-delivery-receipt-processor";
import type { WhatsAppReadinessStatus } from "@/app/lib/whatsapp-provider-runtime";
import type { StoredWhatsAppReply } from "@/app/lib/whatsapp-reply-registry";
import type { ReplyIntelligenceItem } from "@/app/lib/reply-intelligence-runtime";
import type { DemoScheduleItem } from "@/app/lib/demo-scheduling-runtime";
import type { FollowUpCandidate } from "@/app/lib/follow-up-runtime";
import type { SalesOutcomeItem } from "@/app/lib/sales-outcome-runtime";
import {
  FOUNDER_ERROR_LABELS,
  FOUNDER_HOME_EMPTY_STATE_LABELS,
  FOUNDER_HOME_LABELS,
} from "@/app/components/v2/founder-language";
import { btnCls, btnPrimaryCls, kpiLabelCls, kpiStripCls, kpiSubCls, kpiValueCls, sectionLabelCls } from "@/app/components/v2/design-system";

/**
 * Founder Revenue Workspace (v6.1, replies added in v6.2, reply
 * intelligence added in v6.3, demo scheduling added in v6.4, follow-up
 * candidates added in v6.5, sales outcome added in v6.6).
 *
 * The default view of the Hermes screen — a pure, read-only aggregation of
 * runtime state that already exists (missions, founder decisions, WhatsApp
 * delivery receipts, inbound WhatsApp replies, deterministic reply
 * classifications, demo scheduling opportunities, follow-up candidates,
 * sales outcomes). It never mutates anything itself — selecting a mission
 * reuses the screen's existing `onSelectHermesMission`, the same callback
 * the Developer Mode mission queue already uses. Demo/follow-up/outcome
 * status changes happen only through `DemoSchedulingCard`/
 * `FollowUpRuntimeCard`/`SalesOutcomeCard`'s buttons (Developer Mode),
 * never from this view. Seven self-contained fetches
 * (`/api/hermes/providers/whatsapp/status`,
 * `/api/hermes/providers/whatsapp/delivery-receipts`,
 * `/api/hermes/providers/whatsapp/replies`,
 * `/api/hermes/reply-intelligence`, `/api/hermes/demo-scheduling`,
 * `/api/hermes/follow-ups`, `/api/hermes/sales-outcomes`) reuse existing
 * GET routes — no new mutation logic here. Hermes never marks a mission
 * won/lost itself — it only ever surfaces "a decision is needed" (`open`).
 *
 * `demoPendingCount` (the "Demo Bekleyen" tile) was redefined in v6.4: it
 * used to be a heuristic over mission stage/task-type (v6.1); now it counts
 * real `demo_requested`/`scheduling_needed` items from the Demo Scheduling
 * Registry — the same tile, a more accurate source.
 *
 * Deliberately does not render Mission Runtime cards, the Provider
 * Registry, Policy Runtime, Courier Runtime, or Delivery Gateway objects —
 * those stay in Developer Mode. Everything here is operational language.
 *
 * v7.0 (Founder Experience Simplification): promoted to the app's default
 * screen (see `V2Shell.tsx`); the top KPI strip was trimmed to the 8 tiles
 * the founder actually needs (the underlying `RevenueSummary` still
 * computes every counter — nothing here was removed from the adapter,
 * only from what this screen renders), and the Hermes Health strip was
 * relabeled to a 5-item vocabulary that drops the "Mission Bridge" term.
 *
 * v8.0 (Hermes Operating System): renamed Hermes Home and restructured into
 * the five canonical sections — Hermes Bugün, Karar Kuyruğu, Fırsat Odağı,
 * Gelir Nabzı, Hermes Aktivitesi. Pure information architecture: the same
 * adapter calls, the same tiles regrouped (operational counters under
 * Hermes Bugün, won/lost/MRR under Gelir Nabzı, health folded into Hermes
 * Bugün), zero new computation.
 *
 * v8.1 (Hermes Autonomous Lead Intake): adds a sixth section, Hermes Lead
 * Intake, between Hermes Bugün and Karar Kuyruğu — an operational summary of
 * what Hermes's intake side has done (`hermes-lead-intake-adapter.ts`, a
 * pure read over the scored lead pool + missions + `useLeadImport`'s own
 * history/loading/error state). It replaces manual Lead Import as the
 * founder's daily lead-intake view; Lead Import itself is untouched and
 * still lives one click away under Developer. This section never triggers
 * an import, never sends a message — its only two actions are scrolling to
 * the existing Karar Kuyruğu section below and jumping to the Developer
 * Lead Import screen.
 *
 * v8.2 (Decision Queue Operating Layer): Karar Kuyruğu became Karar Merkezi.
 * `hermes-decision-queue-adapter.ts` filters `computeActionQueue`'s own
 * output down to stages that carry one concrete, single-touch founder
 * decision (passive states — read/delivered/sent/ready/won/lost/unknown/
 * reply_received — never render a card) and translates each into "Ne oldu? /
 * Neden önemli? / Hermes ne öneriyor? / Founder ne karar vermeli?" Turkish
 * copy. Clicking a card still only selects the existing mission (Scope 4 —
 * no new state machine); the "Onayla"/"Reddet" buttons on an approve_message
 * card are the one exception, reusing the screen's existing
 * `onApproveMission`/`onRejectTask` handlers verbatim — everything else is
 * focus-only, per the sprint's explicit "no real mutation required" scope.
 *
 * v8.3 (Opportunity Focus Operating Layer): Fırsat Odağı stopped being a
 * mission-object viewer (raw stage label, "Mevcut Mission"/"Aşama" rows) and
 * now answers one question — "Bu otel için şimdi ne yapmalıyım?"
 * `hermes-opportunity-focus-adapter.ts` calls the exact same
 * `actionStageOf`/`computeMissionFocus` this screen already used, then
 * reframes their output as current-state/why-it-matters/recommendation/
 * next-action plus a compact status strip and a 5-event timeline. When the
 * selected mission has a matching Karar Merkezi decision item, its own
 * `hermesRecommendation`/`primaryActionLabel`/`secondaryActionLabel` are
 * reused verbatim (single source of truth); passive/won/lost missions fall
 * back to the adapter's own generic copy and render no action button at
 * all. The card's primary button either calls the same
 * `onApproveMission`/`onRejectTask` handlers Karar Merkezi uses
 * (approve_message) or scrolls the matching Karar Merkezi card into view
 * (every other active type) — no new mutation, no new state.
 *
 * v8.6 (Founder Workflow Optimization): pure reordering + reweighting, zero
 * new computation. Decision first — the section order became Karar Merkezi →
 * Fırsat Odağı → Hermes Bugün → Hermes Fırsat Keşfi → Gelir Nabzı → Hermes
 * Aktivitesi, with one compact status sentence (`computeTodayStatusSentence`)
 * above everything. Hermes Bugün dropped its six hero KPI tiles for three
 * compact rows (decisions waiting / opportunities discovered / revenue won)
 * plus one muted counters line; an empty Karar Merkezi renders as a positive
 * all-clear state, never a warning box. `refreshSignal` lets the header's
 * operational actions re-run the same seven read-only fetches "Tekrar Dene"
 * always re-ran — no new runtime, no new API.
 *
 * Founder Narrative Layer (v1.0): the one-line `computeTodayStatusSentence`
 * that used to sit above everything is now `computeFounderNarrative`'s
 * four-part briefing (status / work completed / findings / required
 * action) — same slot, same "read before anything else" role, still zero
 * new runtime state (every number is `summary`/`intake`/`decisionItems`/
 * `hermesPipelines`/`hermesDrafts`, all pre-existing).
 */

type Props = {
  missions: HermesMission[];
  selectedHermesMissionId: string | null;
  onSelectHermesMission: (mission: HermesMission | null) => void;
  /** Reused verbatim for the Karar Merkezi "Onayla" button — the only decision type with a real existing mutation available. */
  onApproveMission: (mission: HermesMission) => void;
  /** Reused verbatim for the Karar Merkezi "Reddet" button. */
  onRejectTask: (taskId: string) => void;
  /** The full scored lead pool (seed + imported) — same value already passed to `AutomationCenterScreen`. */
  leads: ScoredLead[];
  importHistory: HermesLeadIntakeImportEntryLike[];
  importInProgress: boolean;
  importError: string;
  /** Jumps to the Developer-only Lead Import screen — the sole fallback entry point this section exposes. */
  onNavigateToLeadImport: () => void;
  /** v8.4 — the same single V2Shell flag; gates the two technical health tiles (Webhook/Runtime). */
  developerMode: boolean;
  /** v8.6 — bumped by the header's "Hermes'i Çalıştır"/"Durumu Yenile" actions; re-runs the same seven read-only fetches "Tekrar Dene" already re-runs. */
  refreshSignal: number;
  /** Sprint C1 — sanitized autonomous acquisition status; the Hermes Fırsat Keşfi section reads real run data from it. */
  acquisition: AcquisitionStatusLike | null;
  /** Sprint C1.5 — the shell's acquisition status fetch state; decides the "Hermes Bugün Bunları Buldu" loading/error rendering when no cards exist. */
  acquisitionFetchState: "loading" | "ready" | "error";
  /** Sprint C1.5 — re-runs the shell's acquisition status fetch (the section's "Tekrar Dene"). */
  onRetryAcquisition: () => void;
  /** Founder Mission Feedback Loop fix — same Record V2Shell already passes to AutomationCenterScreen; only the selected mission's pipeline feeds the Mission Timeline. */
  hermesPipelines?: Record<string, HermesPipeline>;
  /** Founder Mission Feedback Loop fix — same Record V2Shell already passes to AutomationCenterScreen; only the selected mission's draft feeds the Mission Timeline. */
  hermesDrafts?: Record<string, HermesOutboundDraft>;
  /** Working Queue + Deal Workspace fix — same Record V2Shell already passes to AutomationCenterScreen; feeds the Deal Workspace's message/delivery status. */
  hermesDeliveries?: Record<string, HermesDeliveryRequest>;
  /** Working Queue + Deal Workspace fix — same handlers already wired for the (now Developer-Mode-only) right panel; reused verbatim in the Deal Workspace. */
  onApproveDraft?: (missionId: string) => void;
  onRejectDraft?: (missionId: string) => void;
  onEditDraft?: (missionId: string, body: string) => void;
  /** Working Queue + Deal Workspace fix — the last real `/api/hermes/acquisition/run` result, shown as a truthful one-line run outcome above the Working Queue. */
  acquisitionRunResult?: RunAcquisitionResult | null;
  acquisitionTriggerLoading?: boolean;
  /** Refresh Persistence Recovery fix — set only when the immediate post-run ingest of newly found leads failed to persist; null otherwise. */
  acquisitionIngestWarning?: string | null;
  /** Founder Preparation-to-Draft Runtime Bridge fix — founder-safe reason shown when the last "Onayla — Hermes'i Başlat" click's preflight guard rejected it; keyed by missionId, session-only. */
  hermesApprovalBlockers?: Record<string, string>;
};

const KARAR_KUYRUGU_ANCHOR_ID = "hermes-home-karar-kuyrugu";
const QUALIFICATION_ANCHOR_ID = "hermes-home-satisa-hazir";
const OUTREACH_ANCHOR_ID = "hermes-home-hazir-mesajlar";
const CONVERSATION_ANCHOR_ID = "hermes-home-konusmalar";
const FOLLOW_UP_PLAN_ANCHOR_ID = "hermes-home-takip-plani";

/** Sprint C2 — /api/hermes/qualification payload'ının bu ekranın okuduğu biçimi. */
type QualificationApiPayload = {
  results?: QualificationApiResultLike[];
  summary?: QualificationApiSummaryLike;
};

/** Sprint C3 — /api/hermes/outreach payload'ının bu ekranın okuduğu biçimi. */
type OutreachApiPayload = {
  results?: OutreachApiResultLike[];
  summary?: OutreachApiSummaryLike;
};

/** Sprint C4 — /api/hermes/conversations payload'ının bu ekranın okuduğu biçimi. */
type ConversationApiPayload = {
  recentConversations?: ConversationApiResultLike[];
  summary?: ConversationApiSummaryLike;
};

/** Sprint C5 — /api/hermes/follow-ups/orchestration payload'ının bu ekranın okuduğu biçimi. */
type FollowUpPlanApiPayload = {
  recentFollowUps?: FollowUpPlanApiResultLike[];
  summary?: FollowUpPlanApiSummaryLike;
};

/** Sprint C6 — /api/hermes/revenue-pipeline payload'ının bu ekranın okuduğu biçimi. */
type RevenuePipelineApiPayload = {
  items?: RevenuePipelineApiItemLike[];
  summary?: RevenuePipelineApiSummaryLike;
};

/** v8.2 — Decision Queue cards are styled by priority, not by the underlying (now-hidden) runtime stage. */
const DECISION_PRIORITY_BADGE_CLS: Record<HermesDecisionPriority, string> = {
  critical: "bg-rose-500/[0.10] text-rose-400 ring-rose-500/20",
  high: "bg-amber-500/[0.10] text-amber-400 ring-amber-500/20",
  medium: "bg-cyan-500/[0.10] text-cyan-400 ring-cyan-500/20",
  low: "bg-white/[0.04] text-zinc-500 ring-white/[0.06]",
};

/**
 * Founder Mission Feedback Loop fix — `buildPipelineTimelineEntries`/
 * `buildDraftTimelineEntries` already color-code their own entries via
 * `actorCls` (a Tailwind text-color class); this reads that same signal
 * instead of re-guessing tone from the Turkish text a second time.
 */
function toneFromActorCls(actorCls: string): HermesOpportunityTimelineTone {
  if (actorCls.includes("rose")) return "danger";
  if (actorCls.includes("emerald") || actorCls.includes("indigo")) return "success";
  if (actorCls.includes("amber")) return "warning";
  return "info";
}

function formatTime(at: number): string {
  return at > 0 ? new Date(at).toLocaleString("tr-TR") : "—";
}

/**
 * Founder Conversational Message Revision (v1.0) — maps a real `ScoredLead`
 * to the small, structural set of already-verified fields the revision
 * prompt is allowed to cite. Never invents a field: everything either comes
 * straight from the lead or is left `null`/`false`, which
 * `buildAvailableSignalLabels` (hermes-draft-revision.ts) then correctly
 * omits from the AI-visible signal list.
 */
function buildDraftRevisionBusinessContext(lead: ScoredLead, channel: string): DraftRevisionBusinessContextLike {
  const sv = lead.signalVerification;
  const otaScore = lead.otaDependencyLikelihood;
  const otaDependency: "high" | "medium" | "low" | null =
    typeof otaScore === "number" ? (otaScore >= 72 ? "high" : otaScore >= 50 ? "medium" : "low") : null;
  return {
    hotelName: lead.name,
    city: lead.city,
    hotelType: lead.type ?? null,
    website: lead.website ?? lead.websiteCandidateUrl ?? null,
    websiteVerified: sv?.websiteVerification === "verified",
    whatsappNumber: lead.phone ?? null,
    whatsappVerified: sv?.whatsappVerification === "verified" || sv?.whatsappVerification === "likely",
    instagramHandle: lead.instagram ?? null,
    instagramVerified: sv?.instagramVerification === "verified",
    reservationCtaVerified: sv?.reservationSignal === "verified",
    otaDependency,
    icpScore: typeof lead.icpFitScore === "number" ? lead.icpFitScore : null,
    opportunityScore: typeof lead.verifiedOpportunityScore === "number" ? lead.verifiedOpportunityScore : null,
    opportunityTier: lead.opportunityTier ?? null,
    opportunityReasons: (lead.opportunityReasons ?? []).map((k) => OPPORTUNITY_REASON_LABELS[k]?.tr ?? k).slice(0, 6),
    channel,
  };
}

function scrollToKararKuyrugu() {
  document.getElementById(KARAR_KUYRUGU_ANCHOR_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Sprint C2 — review_qualification kartının "İncele" aksiyonu: mutation yok, yalnız odak. */
function scrollToQualificationSection() {
  document.getElementById(QUALIFICATION_ANCHOR_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function FounderRevenueWorkspace({
  missions,
  selectedHermesMissionId,
  onSelectHermesMission,
  onApproveMission,
  onRejectTask,
  leads,
  importHistory,
  importInProgress,
  importError,
  onNavigateToLeadImport,
  developerMode,
  refreshSignal,
  acquisition,
  acquisitionFetchState,
  onRetryAcquisition,
  hermesPipelines,
  hermesDrafts,
  hermesDeliveries,
  onApproveDraft,
  onRejectDraft,
  onEditDraft,
  acquisitionRunResult,
  acquisitionTriggerLoading,
  acquisitionIngestWarning,
  hermesApprovalBlockers,
}: Props) {
  const [recentReceipts, setRecentReceipts] = useState<ProcessedWhatsAppDeliveryReceipt[]>([]);
  const [receiptsReachable, setReceiptsReachable] = useState<boolean | null>(null);
  const [whatsappReadinessStatus, setWhatsappReadinessStatus] = useState<WhatsAppReadinessStatus | null>(null);
  const [whatsappStatusReachable, setWhatsappStatusReachable] = useState<boolean | null>(null);
  const [recentReplies, setRecentReplies] = useState<StoredWhatsAppReply[]>([]);
  const [repliesReachable, setRepliesReachable] = useState<boolean | null>(null);
  const [recentIntelligence, setRecentIntelligence] = useState<ReplyIntelligenceItem[]>([]);
  const [intelligenceReachable, setIntelligenceReachable] = useState<boolean | null>(null);
  const [recentDemoItems, setRecentDemoItems] = useState<DemoScheduleItem[]>([]);
  const [demoReachable, setDemoReachable] = useState<boolean | null>(null);
  const [recentFollowUps, setRecentFollowUps] = useState<FollowUpCandidate[]>([]);
  const [followUpsReachable, setFollowUpsReachable] = useState<boolean | null>(null);
  const [recentSalesOutcomes, setRecentSalesOutcomes] = useState<SalesOutcomeItem[]>([]);
  const [outcomesReachable, setOutcomesReachable] = useState<boolean | null>(null);
  // Sprint C2 — qualification okuması: aynı read-only fetch kalıbı, mutation yok.
  const [qualificationPayload, setQualificationPayload] = useState<QualificationApiPayload | null>(null);
  const [qualificationReachable, setQualificationReachable] = useState<boolean | null>(null);
  // Sprint C3 — outreach hazırlık okuması: aynı read-only fetch kalıbı, mutation yok.
  const [outreachPayload, setOutreachPayload] = useState<OutreachApiPayload | null>(null);
  const [outreachReachable, setOutreachReachable] = useState<boolean | null>(null);
  // Sprint C4 — konuşma okuması: aynı read-only fetch kalıbı, mutation yok.
  const [conversationPayload, setConversationPayload] = useState<ConversationApiPayload | null>(null);
  const [conversationReachable, setConversationReachable] = useState<boolean | null>(null);
  // Sprint C5 — takip planı okuması: aynı read-only fetch kalıbı, mutation yok.
  const [followUpPlanPayload, setFollowUpPlanPayload] = useState<FollowUpPlanApiPayload | null>(null);
  const [followUpPlanReachable, setFollowUpPlanReachable] = useState<boolean | null>(null);
  // Sprint C6 — gelir pipeline okuması: read-time aggregation, mutation yok.
  const [revenuePipelinePayload, setRevenuePipelinePayload] = useState<RevenuePipelineApiPayload | null>(null);
  const [revenuePipelineReachable, setRevenuePipelineReachable] = useState<boolean | null>(null);

  // v8.5 (Release Candidate Polish, Scope 4/5) — a single "Tekrar Dene" re-runs
  // every one of the seven read-only fetches below; `initialLoadDone` gates
  // the compact "Hermes verileri hazırlanıyor…" line so the founder never
  // sees a flash of zeroed-out KPI tiles on first paint.
  const [retryTick, setRetryTick] = useState(0);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const pendingFetchesRef = useRef(0);
  const FETCH_COUNT = 8;

  useEffect(() => {
    pendingFetchesRef.current = FETCH_COUNT;
    setInitialLoadDone(false);
  }, [retryTick]);

  function markFetchSettled() {
    pendingFetchesRef.current -= 1;
    if (pendingFetchesRef.current <= 0) setInitialLoadDone(true);
  }

  const retryDataFetches = () => setRetryTick((t) => t + 1);

  // Founder Mission Feedback Loop fix — guards a Karar Merkezi
  // approve_message card's two buttons against a duplicate click while the
  // founder's decision is still being recorded. `hermesDecisions` itself
  // updates synchronously, so an id lands here and clears again within the
  // same render pass for a normal single click; it only matters for two
  // clicks close enough to land before the first re-render removes the card.
  const [pendingDecisionIds, setPendingDecisionIds] = useState<Set<string>>(new Set());

  // Working Queue + Deal Workspace fix — same double-click guard, scoped to
  // the Deal Workspace's own message-approval decision (a separate runtime
  // record from the mission decision above, so it needs its own guard).
  const [pendingDraftMissionIds, setPendingDraftMissionIds] = useState<Set<string>>(new Set());

  // Fresh Opportunity Workspace Bridge fix — a fresh, real acquisition
  // opportunity may not have formed a mission yet (see
  // `hermes-monitor/decision-engine.ts`'s dormant-lead SKIP rule), so it has
  // no `missionId` for `selectedHermesMissionId` to carry. This is the
  // "selected lead before mission creation" state the Working Queue needs to
  // still open the Deal Workspace honestly. Mutually exclusive with a mission
  // selection — selecting either clears the other (see
  // `selectMissionAndClearFresh` below and the fresh-item branch of
  // `runPrimary`).
  const [selectedFreshLeadId, setSelectedFreshLeadId] = useState<string | null>(null);

  // v8.6 — the header's "Hermes'i Çalıştır"/"Durumu Yenile" actions bump
  // `refreshSignal` in V2Shell; each bump re-runs the exact same seven
  // read-only fetches below. The ref guards the mount render — the fetch
  // effects already run once on mount without any help.
  const lastRefreshSignalRef = useRef(refreshSignal);
  useEffect(() => {
    if (refreshSignal !== lastRefreshSignalRef.current) {
      lastRefreshSignalRef.current = refreshSignal;
      setRetryTick((t) => t + 1);
    }
  }, [refreshSignal]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/hermes/providers/whatsapp/delivery-receipts");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { receipts?: ProcessedWhatsAppDeliveryReceipt[] };
        if (!cancelled) {
          setRecentReceipts(data.receipts ?? []);
          setReceiptsReachable(true);
        }
      } catch {
        if (!cancelled) setReceiptsReachable(false);
      } finally {
        if (!cancelled) markFetchSettled();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [retryTick]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/hermes/providers/whatsapp/replies");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { replies?: StoredWhatsAppReply[] };
        if (!cancelled) {
          setRecentReplies(data.replies ?? []);
          setRepliesReachable(true);
        }
      } catch {
        // leave empty — "Cevap Geldi" summary reports 0 rather than guessing
        if (!cancelled) setRepliesReachable(false);
      } finally {
        if (!cancelled) markFetchSettled();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [retryTick]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/hermes/reply-intelligence");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { items?: ReplyIntelligenceItem[] };
        if (!cancelled) {
          setRecentIntelligence(data.items ?? []);
          setIntelligenceReachable(true);
        }
      } catch {
        // leave empty — "Sıcak Cevap" summary reports 0 rather than guessing
        if (!cancelled) setIntelligenceReachable(false);
      } finally {
        if (!cancelled) markFetchSettled();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [retryTick]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/hermes/demo-scheduling");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { items?: DemoScheduleItem[] };
        if (!cancelled) {
          setRecentDemoItems(data.items ?? []);
          setDemoReachable(true);
        }
      } catch {
        // leave empty — "Demo Bekleyen" summary reports 0 rather than guessing
        if (!cancelled) setDemoReachable(false);
      } finally {
        if (!cancelled) markFetchSettled();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [retryTick]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/hermes/follow-ups");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { items?: FollowUpCandidate[] };
        if (!cancelled) {
          setRecentFollowUps(data.items ?? []);
          setFollowUpsReachable(true);
        }
      } catch {
        // leave empty — "Takip Gerekli" summary reports 0 rather than guessing
        if (!cancelled) setFollowUpsReachable(false);
      } finally {
        if (!cancelled) markFetchSettled();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [retryTick]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/hermes/sales-outcomes");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { items?: SalesOutcomeItem[] };
        if (!cancelled) {
          setRecentSalesOutcomes(data.items ?? []);
          setOutcomesReachable(true);
        }
      } catch {
        // leave empty — "Kazanıldı"/"Kaybedildi"/"Outcome Bekliyor" summaries report 0 rather than guessing
        if (!cancelled) setOutcomesReachable(false);
      } finally {
        if (!cancelled) markFetchSettled();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [retryTick]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/hermes/qualification");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as QualificationApiPayload;
        if (!cancelled) {
          setQualificationPayload(data);
          setQualificationReachable(true);
        }
      } catch {
        // boş bırak — bölüm kendi güvenli hata durumunu gösterir
        if (!cancelled) setQualificationReachable(false);
      } finally {
        if (!cancelled) markFetchSettled();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [retryTick]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/hermes/outreach");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as OutreachApiPayload;
        if (!cancelled) {
          setOutreachPayload(data);
          setOutreachReachable(true);
        }
      } catch {
        // boş bırak — bölüm kendi güvenli hata durumunu gösterir
        if (!cancelled) setOutreachReachable(false);
      } finally {
        if (!cancelled) markFetchSettled();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [retryTick]);

  // Sprint C4 — konuşma okuması: aynı read-only fetch kalıbı, mutation yok.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/hermes/conversations");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ConversationApiPayload;
        if (!cancelled) {
          setConversationPayload(data);
          setConversationReachable(true);
        }
      } catch {
        // boş bırak — bölüm kendi güvenli hata durumunu gösterir
        if (!cancelled) setConversationReachable(false);
      } finally {
        if (!cancelled) markFetchSettled();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [retryTick]);

  // Sprint C5 — takip planı okuması: read/evaluate-on-fetch; mutation yok.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/hermes/follow-ups/orchestration");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as FollowUpPlanApiPayload;
        if (!cancelled) {
          setFollowUpPlanPayload(data);
          setFollowUpPlanReachable(true);
        }
      } catch {
        // boş bırak — bölüm kendi güvenli hata durumunu gösterir
        if (!cancelled) setFollowUpPlanReachable(false);
      } finally {
        if (!cancelled) markFetchSettled();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [retryTick]);

  // Sprint C6 — gelir pipeline okuması: read-time aggregation; mutation yok.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/hermes/revenue-pipeline");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as RevenuePipelineApiPayload;
        if (!cancelled) {
          setRevenuePipelinePayload(data);
          setRevenuePipelineReachable(true);
        }
      } catch {
        // boş bırak — bölüm kendi güvenli hata durumunu gösterir
        if (!cancelled) setRevenuePipelineReachable(false);
      } finally {
        if (!cancelled) markFetchSettled();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [retryTick]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/hermes/providers/whatsapp/status");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { readinessStatus?: WhatsAppReadinessStatus };
        if (!cancelled) {
          if (data.readinessStatus) setWhatsappReadinessStatus(data.readinessStatus);
          setWhatsappStatusReachable(true);
        }
      } catch {
        // leave null — health card reports "Bilinmiyor" rather than guessing
        if (!cancelled) setWhatsappStatusReachable(false);
      } finally {
        if (!cancelled) markFetchSettled();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [retryTick]);

  // v8.5 (Scope 5) — safe, deduplicated, founder-operational error copy only;
  // never a raw fetch error, HTTP status, or route path.
  const rawDataErrorMessages: (string | null)[] = [
    whatsappStatusReachable === false ? FOUNDER_ERROR_LABELS.whatsappStatus : null,
    receiptsReachable === false ? FOUNDER_ERROR_LABELS.deliveryReceipts : null,
    repliesReachable === false ? FOUNDER_ERROR_LABELS.replies : null,
    intelligenceReachable === false ? FOUNDER_ERROR_LABELS.replyIntelligence : null,
    demoReachable === false ? FOUNDER_ERROR_LABELS.demoScheduling : null,
    followUpsReachable === false ? FOUNDER_ERROR_LABELS.followUps : null,
    outcomesReachable === false ? FOUNDER_ERROR_LABELS.salesOutcomes : null,
  ];
  const dataErrorMessages = Array.from(new Set(rawDataErrorMessages.filter((m): m is string => m !== null)));

  const summary = computeRevenueSummary(
    missions,
    recentReceipts,
    recentReplies,
    recentIntelligence,
    recentDemoItems,
    recentFollowUps,
    recentSalesOutcomes,
  );
  const queue = computeActionQueue(
    missions,
    recentReceipts,
    recentReplies,
    recentIntelligence,
    recentDemoItems,
    recentFollowUps,
    recentSalesOutcomes,
  );
  // Sprint C2 — Karar Merkezi'ne YALNIZ gerçek founder incelemesi gerektiren
  // qualification sonuçları girer (review_required); sales_ready doğrudan
  // karar öğesi olmaz — outreach taslağı hazır olduğunda zaten mevcut mesaj
  // onayı akışına düşer.
  const qualificationResults = qualificationPayload?.results ?? null;
  const decisionItems = computeHermesDecisionQueue({
    actionQueue: queue,
    missions,
    recentReceipts,
    recentIntelligence,
    recentDemoItems,
    recentFollowUps,
    recentSalesOutcomes,
    qualificationReviews: selectQualificationReviewItems(qualificationResults),
  });

  // Founder Mission Feedback Loop fix — once a pending decision's id no
  // longer appears in decisionItems, the founder's approve/reject already
  // took effect (mission.stage moved on) and the guard can release it. Bails
  // out (same Set reference) when nothing changed, so this never causes an
  // extra render on its own.
  useEffect(() => {
    setPendingDecisionIds((prev) => {
      if (prev.size === 0) return prev;
      const stillPending = new Set(Array.from(prev).filter((id) => decisionItems.some((d) => d.id === id)));
      return stillPending.size === prev.size ? prev : stillPending;
    });
  }, [decisionItems]);

  // Same release pattern as above, scoped to the Deal Workspace's own
  // draft-approval guard: once a missionId's draft is no longer awaiting a
  // decision (approved/rejected, or the draft record itself is gone), the
  // guard can release it.
  useEffect(() => {
    setPendingDraftMissionIds((prev) => {
      if (prev.size === 0) return prev;
      const stillPending = new Set(
        Array.from(prev).filter((missionId) => {
          const status = hermesDrafts?.[missionId]?.status;
          return status === "draft_ready" || status === "edited";
        }),
      );
      return stillPending.size === prev.size ? prev : stillPending;
    });
  }, [hermesDrafts]);

  const timeline = computeHermesTimeline(missions, recentReceipts);
  const health = computeHermesHealth({
    hermesRuntimeAvailable: true,
    whatsappReadinessStatus,
    deliveryFeedReachable: receiptsReachable,
  });
  const intake = computeHermesLeadIntakeSummary({
    leads,
    missions,
    importHistory,
    importInProgress,
    importError,
  });
  // Sprint C1 — real autonomous acquisition run data for the Hermes Fırsat
  // Keşfi section. Pure projection; null status renders the safe empty state.
  const acquisitionView = computeHermesAcquisitionFounderView(acquisition);
  // Sprint C1.5 — today's discovery explanations ("Hermes Bugün Bunları
  // Buldu"): a pure read over the same scored lead pool every other section
  // already receives; cards always win over a failed status fetch.
  const explainability = computeAcquisitionExplainability({
    leads,
    fetchState: acquisitionFetchState,
  });
  // Sprint C2 — "Hermes Satışa Hazır Fırsatlar": qualification sonuçlarının
  // saf founder projeksiyonu. Teknik terim, ham enum veya skor formülü yok.
  const qualificationView = computeQualificationFounderView({
    results: qualificationResults,
    summary: qualificationPayload?.summary ?? null,
    fetchState:
      qualificationReachable === null ? "loading" : qualificationReachable ? "ready" : "error",
  });
  // Sprint C3 — "Hermes Hazırladığı Mesajlar": outreach hazırlık kararlarının
  // saf founder projeksiyonu. Gönderim butonu YOK — yalnız incele/gör.
  const outreachResults = outreachPayload?.results ?? null;
  const outreachView = computeOutreachFounderView({
    results: outreachResults,
    summary: outreachPayload?.summary ?? null,
    fetchState: outreachReachable === null ? "loading" : outreachReachable ? "ready" : "error",
  });
  // Sprint C4 — "Hermes Konuşmaları": gelen cevapların tek durumda birleşmiş
  // ticari anlamı. Founder yalnız inceler / planlar / karar verir — GÖNDERİM
  // BUTONU YOK. İşletme adı, ekranın zaten elindeki lead havuzundan zenginleşir.
  const conversationResults = conversationPayload?.recentConversations ?? null;
  const leadNameById: Record<string, string> = {};
  for (const lead of leads) {
    if (lead.id && lead.name) leadNameById[lead.id] = lead.name;
  }
  const conversationView = computeConversationFounderView({
    results: conversationResults,
    summary: conversationPayload?.summary ?? null,
    fetchState:
      conversationReachable === null ? "loading" : conversationReachable ? "ready" : "error",
    leadNameById,
  });
  // Sprint C5 — "Hermes Takip Planı": orchestration kararlarının saf founder
  // projeksiyonu. Gönderim butonu YOK — yalnız incele/planla/vazgeç.
  const followUpPlanResults = followUpPlanPayload?.recentFollowUps ?? null;
  const followUpPlanView = computeFollowUpPlanView({
    results: followUpPlanResults,
    summary: followUpPlanPayload?.summary ?? null,
    fetchState:
      followUpPlanReachable === null ? "loading" : followUpPlanReachable ? "ready" : "error",
    leadNameById,
  });
  // Sprint C6 — "Gelir Nabzı" (Revenue Pipeline Intelligence): açık fırsatların
  // satışa yakınlığı + riskleri + ayrık gelir kategorileri. Uydurma gelir yok;
  // bilinmeyen tutar "Henüz belirlenmedi" olarak gösterilir.
  const revenuePipelineItems = revenuePipelinePayload?.items ?? null;
  const revenuePipelineView = computeRevenuePipelineView({
    items: revenuePipelineItems,
    summary: revenuePipelinePayload?.summary ?? null,
    fetchState:
      revenuePipelineReachable === null ? "loading" : revenuePipelineReachable ? "ready" : "error",
    leadNameById,
  });

  const selectedMission = missions.find((m) => m.missionId === selectedHermesMissionId) ?? null;

  // Founder Mission Feedback Loop fix — the selected mission's real pipeline
  // steps (Scout/Enricher/Appraiser/Shepherd) and courier draft events,
  // converted to the adapter's plain timeline-entry shape. Both builders
  // only ever emit an entry for a stage/status that actually happened
  // (queued/never-started steps produce nothing) — no fake progress.
  const selectedPipeline = selectedMission ? hermesPipelines?.[selectedMission.missionId] : undefined;
  const selectedDraft = selectedMission ? hermesDrafts?.[selectedMission.missionId] : undefined;
  const extraTimelineEntries: OpportunityFocusExtraTimelineEntryLike[] = [
    ...buildPipelineTimelineEntries(selectedPipeline),
    ...buildDraftTimelineEntries(selectedDraft),
  ].map((entry) => ({ at: entry.at, text: `${entry.actorLabel} — ${entry.text}`, tone: toneFromActorCls(entry.actorCls) }));

  const opportunityFocus = computeHermesOpportunityFocus({
    selectedMission,
    decisionItems,
    recentReceipts,
    recentReplies,
    recentIntelligence,
    recentDemoItems,
    recentFollowUps,
    recentSalesOutcomes,
    // Sprint C2 — seçili otelin qualification özeti: "neden satışa hazır /
    // neden henüz değil" sorusunu Fırsat Odağı içinde cevaplar.
    qualificationForLead: selectedMission
      ? (qualificationResults?.find((r) => r.leadId === selectedMission.leadId) ?? null)
      : null,
    // Sprint C3 — seçili otelin outreach hazırlık özeti: önerilen kanal/şablon/
    // dil + personalization + founder aksiyonu Fırsat Odağı içinde görünür.
    outreachForLead: selectedMission
      ? selectOutreachForLead(outreachResults, selectedMission.leadId)
      : null,
    extraTimelineEntries,
    pipelineRunning: selectedPipeline?.state === "running",
  });

  // Working Queue + Deal Workspace fix — "Bugünkü Çalışma Listesi" composes
  // the exact same decisionItems Karar Merkezi already produced with
  // today's fresh, qualified opportunities (same freshness definition
  // "Hermes Bugün Bunları Buldu" already uses). No second queue, no
  // re-ranking of real decisions.
  const runningMissionIds = new Set(
    Object.entries(hermesPipelines ?? {})
      .filter(([, p]) => p.state === "running")
      .map(([missionId]) => missionId),
  );
  const workingQueueItems: WorkingQueueItem[] = computeFounderWorkingQueue({
    decisionItems,
    leads,
    missions,
    runningMissionIds,
  });

  const selectedDelivery = selectedMission ? hermesDeliveries?.[selectedMission.missionId] : undefined;
  const selectedLead = selectedMission ? leads.find((l) => l.id === selectedMission.leadId) : undefined;
  const selectedMissionIsNew = (() => {
    if (!selectedLead) return false;
    const seenAt = firstSeenAt(selectedLead);
    return seenAt !== null && isSameCalendarDay(seenAt, Date.now());
  })();
  const journey = selectedMission
    ? computeCommercialJourney({
        missionId: selectedMission.missionId,
        mission: selectedMission,
        draft: selectedDraft,
        recentReceipts,
        recentReplies,
        recentDemoItems,
        recentSalesOutcomes,
      })
    : null;

  // Commercial Journey Driven Opportunity Workspace v1.0 — the real reply/
  // demo/outcome matched to the selected mission, using the exact same
  // missionId-match convention `computeCommercialJourney` already applies
  // internally (reachedRelevantReply/reachedDemoScheduled/terminalOutcome).
  // No new fetch, no new registry — these arrays are already in scope.
  const selectedReply = selectedMission
    ? (recentReplies.find((r) => r.missionId === selectedMission.missionId) ?? null)
    : null;
  const selectedDemo = selectedMission
    ? (recentDemoItems.find((d) => d.missionId === selectedMission.missionId) ?? null)
    : null;
  const selectedOutcome = selectedMission
    ? (recentSalesOutcomes.find((o) => o.missionId === selectedMission.missionId) ?? null)
    : null;

  // Fresh Opportunity Workspace Bridge fix — a fresh, real acquisition
  // opportunity with no mission yet. A stale/mismatched id (the lead is no
  // longer in the pool) resolves to `null` here, which the render below
  // shows as a truthful "no longer available" state — never a silent no-op.
  const selectedFreshLead = selectedFreshLeadId
    ? (leads.find((l) => l.id === selectedFreshLeadId) ?? null)
    : null;
  const freshOpportunityFocus = selectedFreshLead
    ? computeHermesOpportunityFocusForFreshLead(selectedFreshLead)
    : null;
  const freshJourney = selectedFreshLead
    ? computeCommercialJourney({
        // No real mission exists yet, so this id can never match a real
        // receipt/reply/demo/outcome — the journey correctly stays at
        // "discovered" rather than borrowing another mission's activity.
        missionId: `fresh:${selectedFreshLead.id}`,
        mission: null,
        draft: null,
        recentReceipts,
        recentReplies,
        recentDemoItems,
        recentSalesOutcomes,
      })
    : null;

  // v8.2 — Karar Merkezi interactions. Selecting a card (or its primary
  // action, for every decisionType except approve_message) reuses the
  // screen's existing mission-selection state — no new state machine, no
  // navigation away from Hermes (Scope 4). Only approve_message's two
  // buttons call a real mutation, and only the exact existing handlers this
  // screen already receives as props.
  const missionForDecisionItem = (item: HermesDecisionItem) =>
    item.missionId ? (missions.find((m) => m.missionId === item.missionId) ?? null) : null;

  // Fresh Opportunity Workspace Bridge fix — a mission selection and a fresh
  // (mission-less) lead selection are mutually exclusive. Every existing
  // `onSelectHermesMission` call site below now routes through this wrapper
  // so picking a mission always clears a stale fresh-lead selection too.
  const selectMissionAndClearFresh = (mission: HermesMission | null) => {
    setSelectedFreshLeadId(null);
    onSelectHermesMission(mission);
  };

  const focusDecisionItem = (item: HermesDecisionItem) => {
    const mission = missionForDecisionItem(item);
    if (mission) selectMissionAndClearFresh(mission);
  };

  // Founder Mission Feedback Loop fix: clicking a card's primary/secondary
  // button calls `e.stopPropagation()` (see the JSX below), so it never
  // reached the card's own `onClick={() => focusDecisionItem(item)}` — a
  // founder who approved/rejected straight from the button (not the card
  // body) never got that mission selected, so Fırsat Odağı and its Mission
  // Timeline kept showing whatever was selected before, and the founder had
  // to hunt for what just happened. Both branches below now select the
  // mission themselves before mutating, so the acted-on mission is always
  // the one the founder sees next.
  const runPrimaryDecisionAction = (item: HermesDecisionItem) => {
    const mission = missionForDecisionItem(item);
    if (mission && item.decisionType === "approve_message") {
      if (pendingDecisionIds.has(item.id)) return; // duplicate click while already processing
      setPendingDecisionIds((prev) => new Set(prev).add(item.id));
      selectMissionAndClearFresh(mission);
      onApproveMission(mission);
      return;
    }
    // Sprint C2 — qualification incelemesinin "İncele" aksiyonu: mutation
    // yok, yalnız Satışa Hazır Fırsatlar bölümüne odaklanır.
    if (item.decisionType === "review_qualification") {
      scrollToQualificationSection();
      return;
    }
    focusDecisionItem(item);
  };

  const runSecondaryDecisionAction = (item: HermesDecisionItem) => {
    const mission = missionForDecisionItem(item);
    if (mission && item.decisionType === "approve_message") {
      if (pendingDecisionIds.has(item.id)) return; // duplicate click while already processing
      setPendingDecisionIds((prev) => new Set(prev).add(item.id));
      selectMissionAndClearFresh(mission);
      onRejectTask(mission.primaryTaskId);
    }
  };

  // v8.3 — Opportunity Focus's own primary/secondary buttons are only ever
  // shown when a matching Karar Merkezi decision item exists (the adapter
  // leaves both labels null otherwise). Their behavior reuses the exact same
  // handlers Karar Merkezi's own cards use: approve_message really approves
  // (`runPrimaryDecisionAction`/`runSecondaryDecisionAction`, unchanged);
  // every other active type has no safe direct mutation, so its primary
  // button scrolls the matching card into view instead ("focus only", Scope
  // 3) — the mission is already selected, so nothing else needs to change.
  const focusMatchingDecisionItem = selectedHermesMissionId
    ? (decisionItems.find((d) => d.missionId === selectedHermesMissionId) ?? null)
    : null;

  // Working Queue + Deal Workspace fix — the Deal Workspace's single
  // "Bugünkü Tek Karar" section reuses these exact handlers: mission-level
  // approval reuses `runPrimaryDecisionAction`/`runSecondaryDecisionAction`
  // verbatim (same guard, same mutation); draft-level (message) approval
  // reuses the `onApproveDraft`/`onRejectDraft` props Karar Merkezi's own
  // "Mesaj Onayı" flow already receives, with its own duplicate-click guard.
  const dealWorkspaceApproveMission = () => {
    if (focusMatchingDecisionItem) runPrimaryDecisionAction(focusMatchingDecisionItem);
  };
  const dealWorkspaceRejectMission = () => {
    if (focusMatchingDecisionItem) runSecondaryDecisionAction(focusMatchingDecisionItem);
  };
  const dealWorkspaceApproveDraft = () => {
    if (!selectedMission || !onApproveDraft) return;
    if (pendingDraftMissionIds.has(selectedMission.missionId)) return;
    setPendingDraftMissionIds((prev) => new Set(prev).add(selectedMission.missionId));
    onApproveDraft(selectedMission.missionId);
  };
  const dealWorkspaceRejectDraft = () => {
    if (!selectedMission || !onRejectDraft) return;
    if (pendingDraftMissionIds.has(selectedMission.missionId)) return;
    setPendingDraftMissionIds((prev) => new Set(prev).add(selectedMission.missionId));
    onRejectDraft(selectedMission.missionId);
  };
  const dealWorkspaceEditDraft = (body: string) => {
    if (selectedMission) onEditDraft?.(selectedMission.missionId, body);
  };
  const dealWorkspaceBack = () => selectMissionAndClearFresh(null);
  const freshDealWorkspaceBack = () => setSelectedFreshLeadId(null);

  // v8.5 (Scope 3) — "no activity yet" only when literally nothing has
  // happened: every Hermes Bugün counter at zero. Once any counter is
  // non-zero the KPI strip itself carries the information.
  const hasNoTodayActivity =
    summary.totalActiveMissions === 0 &&
    summary.founderApprovalPending === 0 &&
    summary.hotReplyCount === 0 &&
    summary.demoPendingCount === 0 &&
    summary.followUpRequiredCount === 0 &&
    summary.outcomeRequiredCount === 0;

  const hasNoRevenueOutcomes = summary.wonCount === 0 && summary.lostCount === 0 && summary.estimatedMrrTotal === 0;

  // Founder Narrative Layer (v1.0) — replaces the old one-sentence
  // "Hermes N karar hazırladı." line with the full four-part operational
  // briefing (status / work completed / findings / required action), same
  // slot, same "before anything else" position. Every number fed in is one
  // this screen already computed (`summary`, `intake`) or already holds as
  // props (`hermesPipelines`, `hermesDrafts`) — no new runtime state.
  const founderNarrative = computeFounderNarrative({
    isRunning: Object.values(hermesPipelines ?? {}).some((p) => p.state === "running"),
    pendingDecisionCount: decisionItems.length,
    draftsPreparedCount: Object.keys(hermesDrafts ?? {}).length,
    revenueSummary: summary,
    intakeSummary: intake,
  });

  // Opportunity Workspace Isolation fix — the central content area is either
  // "reviewing one opportunity" or "the Founder Home overview," never both at
  // once. Any selection (a real mission OR a fresh, mission-less lead) takes
  // over the entire area; Founder Narrative, Bugünkü Çalışma Listesi, Gelir
  // Nabzı, Hermes Takip Planı, Hermes Bugün Bunları Buldu, Hermes Aktivitesi,
  // and every Developer-Mode pipeline-detail section stop rendering — not
  // just visually hidden, structurally absent — until the founder presses
  // the workspace's own "← Çalışma Listesine Dön" and returns to null/null.
  // The Header and left navigation live in V2Shell/AutomationCenterScreen,
  // entirely outside this component's tree, so they're already unaffected.
  const opportunitySelected = Boolean(selectedMission) || Boolean(selectedFreshLeadId);

  // Founder Message Review & Revision Flow v1.0 — the draft carries no
  // destination field at all (HermesOutboundDraft has no phone/recipient
  // field); the real phone and its verification come from the lead itself,
  // the same `signalVerification` the acquisition explainability section
  // already reads. `whatsappReadinessStatus` is the exact state this screen
  // already fetches (`/api/hermes/providers/whatsapp/status`) for the health
  // card — reused verbatim, not re-fetched.
  // Founder Conversational Message Revision (v1.0) — real, already-verified
  // business fields the revision prompt is allowed to cite. `channel` comes
  // from the real draft when one exists (mission path) or stays "unknown"
  // for a fresh, draft-less lead — never guessed.
  const missionBusinessContext = selectedLead
    ? buildDraftRevisionBusinessContext(selectedLead, selectedDraft?.channel ?? "unknown")
    : null;
  const freshBusinessContext = selectedFreshLead
    ? buildDraftRevisionBusinessContext(selectedFreshLead, "unknown")
    : null;

  const missionRecipientPhone = selectedLead?.phone ?? null;
  const missionRecipientPhoneVerified =
    selectedLead?.signalVerification?.whatsappVerification === "verified" ||
    selectedLead?.signalVerification?.whatsappVerification === "likely";
  const freshRecipientPhone = selectedFreshLead?.phone ?? null;
  const freshRecipientPhoneVerified =
    selectedFreshLead?.signalVerification?.whatsappVerification === "verified" ||
    selectedFreshLead?.signalVerification?.whatsappVerification === "likely";
  const whatsappProviderReady = whatsappReadinessStatus === "controlled_live_ready";

  if (opportunitySelected) {
    return (
      <div className="flex flex-col">
        {selectedMission && journey ? (
          <DealWorkspace
            mission={selectedMission}
            opportunityFocus={opportunityFocus}
            journey={journey}
            isNew={selectedMissionIsNew}
            pipeline={selectedPipeline ?? null}
            draft={selectedDraft ?? null}
            delivery={selectedDelivery ?? null}
            reply={selectedReply ? { textPreview: selectedReply.textPreview ?? "", occurredAt: selectedReply.occurredAt } : null}
            demo={selectedDemo ? { statusLabel: opportunityFocus.demoStatusLabel } : null}
            outcome={selectedOutcome ? { status: selectedOutcome.status } : null}
            isPendingDecision={
              (focusMatchingDecisionItem ? pendingDecisionIds.has(focusMatchingDecisionItem.id) : false) ||
              pendingDraftMissionIds.has(selectedMission.missionId)
            }
            recipientPhone={missionRecipientPhone}
            recipientPhoneVerified={missionRecipientPhoneVerified}
            whatsappProviderReady={whatsappProviderReady}
            businessContext={missionBusinessContext}
            approvalBlockerReason={hermesApprovalBlockers?.[selectedMission.missionId] ?? null}
            onApproveMission={dealWorkspaceApproveMission}
            onRejectMission={dealWorkspaceRejectMission}
            onApproveDraft={dealWorkspaceApproveDraft}
            onRejectDraft={dealWorkspaceRejectDraft}
            onEditDraft={dealWorkspaceEditDraft}
            onBack={dealWorkspaceBack}
          />
        ) : selectedFreshLead && freshOpportunityFocus && freshJourney ? (
          // Fresh Opportunity Workspace Bridge fix — a fresh, real acquisition
          // opportunity with no mission yet. Every mission/draft/delivery-specific
          // section renders its own "not started" state via its existing null
          // check — no fabricated mission, no fabricated approval state.
          <DealWorkspace
            mission={null}
            opportunityFocus={freshOpportunityFocus}
            journey={freshJourney}
            isNew={true}
            pipeline={null}
            draft={null}
            delivery={null}
            reply={null}
            demo={null}
            outcome={null}
            isPendingDecision={false}
            recipientPhone={freshRecipientPhone}
            recipientPhoneVerified={freshRecipientPhoneVerified}
            whatsappProviderReady={whatsappProviderReady}
            businessContext={freshBusinessContext}
            approvalBlockerReason={null}
            onApproveMission={() => {}}
            onRejectMission={() => {}}
            onApproveDraft={() => {}}
            onRejectDraft={() => {}}
            onEditDraft={() => {}}
            onBack={freshDealWorkspaceBack}
          />
        ) : (
          // Truthful founder-facing state when the selected lead is no
          // longer in the pool — never a silent no-op.
          <div className="px-5 py-3">
            <p className={sectionLabelCls}>Fırsat Alanı</p>
            <p className="mt-1 text-[11px] text-zinc-600">Bu fırsat artık mevcut değil.</p>
            <button
              type="button"
              onClick={freshDealWorkspaceBack}
              className="mt-2 text-[11px] font-medium text-indigo-300 hover:text-indigo-200"
            >
              ← Çalışma Listesine Dön
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    /* Sprint C7 (Founder OS v1.0) — canonical daily flow via CSS order so the
       physical JSX stays intact: Karar Merkezi → Fırsat Odağı → Gelir Nabzı →
       Takip Planı → Hermes Bugün Buldukları → Hermes Aktivitesi. Pipeline-detail
       sections (Hermes Bugün / Fırsat Keşfi / Satışa Hazır / Hazırladığı Mesajlar
       / Konuşmalar) are gated behind Developer Mode: Developer OFF = the clean
       six-section founder experience, Developer ON = the full operational view. */
    <div className="flex flex-col">
      {/* v8.5 (Scope 4/5) — compact loading line + safe error banner, shared across every section below. No spinner overload, no layout-shifting full-page loader. */}
      {!initialLoadDone && (
        <p className="border-b border-white/[0.06] px-5 py-2 text-[10px] text-zinc-600">{FOUNDER_ERROR_LABELS.loading}</p>
      )}
      {initialLoadDone && dataErrorMessages.length > 0 && (
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] bg-rose-500/[0.06] px-5 py-2">
          <p className="text-[10px] text-rose-300">{dataErrorMessages.join(" ")}</p>
          <button type="button" onClick={retryDataFetches} className="shrink-0 text-[10px] font-semibold text-rose-200 hover:text-rose-100">
            {FOUNDER_ERROR_LABELS.retryButton}
          </button>
        </div>
      )}

      {/* Founder Narrative Layer (v1.0) — one operational briefing before anything else: status, work completed, findings, required action. Same slot the v8.6 one-liner used to occupy. */}
      <div className="border-b border-white/[0.06] px-5 py-3">
        <p className="text-[12.5px] font-medium text-zinc-200">{founderNarrative.status}</p>
        {(founderNarrative.workCompleted.length > 0 || founderNarrative.findings.length > 0) && (
          <div className="mt-1 space-y-0.5">
            {founderNarrative.workCompleted.map((sentence, i) => (
              <p key={`work-${i}`} className="text-[11px] text-zinc-400">
                {sentence}
              </p>
            ))}
            {founderNarrative.findings.map((sentence, i) => (
              <p key={`finding-${i}`} className="text-[11px] text-zinc-400">
                {sentence}
              </p>
            ))}
          </div>
        )}
        <p className="mt-1.5 text-[11px] font-medium text-indigo-300">{founderNarrative.requiredAction}</p>
      </div>

      {/* Working Queue + Deal Workspace fix — truthful "Hermes'i Çalıştır" run outcome.
          `acquisitionRunResult.summaryTr` is the server's own sanitized Turkish summary
          (`summarizeAcquisitionRun`) — never composed here, never a fake count. */}
      {acquisitionTriggerLoading && (
        <div className="border-b border-white/[0.06] bg-indigo-500/[0.06] px-5 py-2">
          <p className="text-[11px] font-medium text-indigo-300">Hermes taranıyor…</p>
        </div>
      )}
      {!acquisitionTriggerLoading && acquisitionRunResult && (
        <div
          className={`border-b border-white/[0.06] px-5 py-2 ${
            acquisitionRunResult.status === "blocked" || acquisitionRunResult.status === "failed"
              ? "bg-amber-500/[0.06]"
              : "bg-emerald-500/[0.05]"
          }`}
        >
          <p
            className={`text-[11px] font-medium ${
              acquisitionRunResult.status === "blocked" || acquisitionRunResult.status === "failed"
                ? "text-amber-300"
                : "text-emerald-300"
            }`}
          >
            {acquisitionRunResult.summaryTr}
          </p>
        </div>
      )}
      {/* Refresh Persistence Recovery fix — reuses this exact existing
          run-outcome surface (same block, same amber-warning convention
          `acquisitionRunResult`'s blocked/failed state already uses above)
          instead of a new notification system. Shown only when the
          immediate post-run save genuinely failed; the status-poll recovery
          path stays available regardless. */}
      {acquisitionIngestWarning && (
        <div className="border-b border-white/[0.06] bg-amber-500/[0.06] px-5 py-2">
          <p className="text-[11px] font-medium text-amber-300">{acquisitionIngestWarning}</p>
        </div>
      )}

      {/* Section 1 — Bugünkü Çalışma Listesi (Founder Working Queue v1.0, formerly "Karar Merkezi"):
          every real founder decision (unchanged, same priority order) plus today's fresh, qualified
          opportunities appended after them. Never a raw list of every historical lead. */}
      <div id={KARAR_KUYRUGU_ANCHOR_ID} className="order-1 border-b border-white/[0.06] px-5 py-3">
        <p className={sectionLabelCls}>Bugünkü Çalışma Listesi</p>
        <p className="mb-2.5 mt-0.5 text-[11px] text-zinc-500">Hermes işi yürütür; sen yalnızca karar verirsin.</p>
        {workingQueueItems.length === 0 ? (
          /* no pending decision AND no fresh opportunity today is a success state, never an empty warning box */
          <div className="flex items-center gap-3 rounded-lg bg-emerald-500/[0.06] px-4 py-3.5 ring-1 ring-inset ring-emerald-500/15">
            <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden>
              <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M6.5 10.5l2.3 2.3L13.5 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-emerald-300">
                {HERMES_DAILY_WORKSPACE_LABELS.decisionAllClearTitle}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-500">{FOUNDER_HOME_EMPTY_STATE_LABELS.decisionCenter}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {workingQueueItems.map((item) => {
              const isPending = item.sourceDecisionItem ? pendingDecisionIds.has(item.sourceDecisionItem.id) : false;
              // Working Queue + Deal Workspace interaction fix — a queue
              // item whose real decision requires mutation (approve/reject
              // a prepared message) must still only ever *open* the Deal
              // Workspace from the queue; the actual Onayla/Reddet mutation
              // is reserved for Deal Workspace's own "Bugünkü Tek Karar"
              // section (dealWorkspaceApproveMission/RejectMission below,
              // which call these exact same runPrimary/SecondaryDecisionAction
              // handlers once the founder has actually reviewed the opportunity).
              const isDirectMutation = isDirectMutationDecisionType(item.sourceDecisionItem?.decisionType);
              const runPrimary = () => {
                if (item.kind === "fresh_opportunity") {
                  // Fresh Opportunity Workspace Bridge fix — most freshly
                  // acquired leads have no mission yet (no ShadowTask was
                  // generated for a "DISCOVERED"-stage lead; see
                  // hermes-monitor/decision-engine.ts's dormant SKIP rule).
                  // Prefer a real mission if one genuinely exists and
                  // resolves; otherwise open the Deal Workspace directly from
                  // the lead — never a silent no-op.
                  if (item.missionId) {
                    const m = missions.find((mm) => mm.missionId === item.missionId);
                    if (m) {
                      selectMissionAndClearFresh(m);
                      return;
                    }
                  }
                  if (item.leadId) {
                    selectMissionAndClearFresh(null);
                    setSelectedFreshLeadId(item.leadId);
                  }
                  return;
                }
                if (!item.sourceDecisionItem) return;
                if (isDirectMutation) {
                  focusDecisionItem(item.sourceDecisionItem);
                  return;
                }
                runPrimaryDecisionAction(item.sourceDecisionItem);
              };
              const runSecondary = () => {
                if (isDirectMutation) return; // no direct reject from the queue — only from Deal Workspace
                if (item.sourceDecisionItem) runSecondaryDecisionAction(item.sourceDecisionItem);
              };
              return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={runPrimary}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") runPrimary();
                }}
                className={`w-full cursor-pointer rounded-lg border px-3 py-2.5 text-left transition-colors duration-150 ${
                  item.missionId === selectedHermesMissionId
                    ? "border-indigo-500/40 bg-indigo-500/[0.08]"
                    : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-[11px] font-semibold text-zinc-200">{item.title}</span>
                  {item.isNew && (
                    <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-500/[0.12] px-2 py-[2px] text-[9px] font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-500/20">
                      Yeni
                    </span>
                  )}
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2 py-[2px] text-[9px] font-semibold ring-1 ring-inset ${
                      item.sourceDecisionItem ? DECISION_PRIORITY_BADGE_CLS[item.sourceDecisionItem.priority] : DECISION_PRIORITY_BADGE_CLS.low
                    }`}
                  >
                    {item.commercialStageLabel}
                  </span>
                  {item.isHermesWorking && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-indigo-500/[0.10] px-2 py-[2px] text-[9px] font-semibold text-indigo-300">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" />
                      Hermes çalışıyor
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[10px] text-zinc-400">{item.whyInQueue}</p>
                <p className="mt-1 text-[10px] font-medium text-indigo-300">
                  {isPending ? "Founder onayı işleniyor…" : item.nextDecisionLabel}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      runPrimary();
                    }}
                    className={`${btnPrimaryCls} ${isPending ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    {isPending
                      ? "İşleniyor…"
                      : isDirectMutation
                        ? FOUNDER_HOME_LABELS.openOpportunityAction
                        : item.primaryActionLabel}
                  </button>
                  {item.secondaryActionLabel && !isDirectMutation && (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        runSecondary();
                      }}
                      className={`${btnCls} ${isPending ? "cursor-not-allowed opacity-60" : ""}`}
                    >
                      {item.secondaryActionLabel}
                    </button>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 2 (Deal Workspace) intentionally has no sibling here — Opportunity
          Workspace Isolation fix: whenever a mission or fresh lead is selected, the
          early return above takes over the entire central area instead. This branch
          only ever runs with nothing selected, so there is nothing to show in its place. */}

      {/* Section 3 — Hermes Bugün (v8.6, Scope 7): numbers are secondary — compact rows instead of hero KPI tiles.
          Sprint C7: pipeline-detail — Developer Mode only; the founder reads the canonical six sections. */}
      <div className={`order-6 border-b border-white/[0.06] px-5 py-3 ${developerMode ? "" : "hidden"}`}>
        <p className={`${sectionLabelCls} mb-2`}>Hermes Bugün</p>
        {initialLoadDone && hasNoTodayActivity && (
          <p className="mb-2 text-[11px] text-zinc-600">{FOUNDER_HOME_EMPTY_STATE_LABELS.hermesToday}</p>
        )}
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
          <TodayFocusRow
            label={HERMES_DAILY_WORKSPACE_LABELS.todayPendingDecisions}
            value={String(decisionItems.length)}
            accent={decisionItems.length > 0 ? "text-amber-400" : "text-zinc-300"}
          />
          <TodayFocusRow
            label={HERMES_DAILY_WORKSPACE_LABELS.todayDiscoveredOpportunities}
            value={String(intake.newOpportunityCount)}
            accent="text-emerald-400"
          />
          <TodayFocusRow
            label={HERMES_DAILY_WORKSPACE_LABELS.todayRevenueWon}
            value={`₺${summary.estimatedMrrTotal.toLocaleString("tr-TR")}`}
            accent="text-emerald-300"
          />
        </div>
        {/* Secondary counters — one muted line, never a metric card */}
        <p className="mt-2 text-[10px] text-zinc-600">
          Aktif iş {summary.totalActiveMissions} · Onay bekleyen {summary.founderApprovalPending} · Sıcak cevap{" "}
          {summary.hotReplyCount} · Demo bekleyen {summary.demoPendingCount} · Takip gerekli{" "}
          {summary.followUpRequiredCount} · Sonuç bekleyen {summary.outcomeRequiredCount}
        </p>
        {/* v8.4 — Webhook/Runtime are infrastructure tiles: Developer Mode only. The founder reads Hermes / WhatsApp / Teslimat. */}
        <div className={`mt-2 grid grid-cols-2 gap-2 ${developerMode ? "sm:grid-cols-5" : "sm:grid-cols-3"}`}>
          <HealthTile label="Hermes" value={health.hermesLabel} />
          <HealthTile label="WhatsApp" value={health.whatsappLabel} />
          {developerMode && <HealthTile label="Webhook" value={health.webhookLabel} />}
          <HealthTile label="Teslimat" value={health.deliveryLabel} />
          {developerMode && <HealthTile label="Runtime" value={health.runtimeLabel} />}
        </div>
      </div>

      {/* Section 4 — Hermes Fırsat Keşfi: what Hermes's intake side has done, operational summary only (v8.1).
          Sprint C1: leads with REAL autonomous acquisition run data (statusLine + today's counters), the
          intake adapter's pool-level summary stays as supporting copy below it.
          Sprint C7: pipeline-detail — Developer Mode only. */}
      <div className={`order-6 border-b border-white/[0.06] px-5 py-3 ${developerMode ? "" : "hidden"}`}>
        <p className={`${sectionLabelCls} mb-2`}>{FOUNDER_HOME_LABELS.leadIntakeSection}</p>
        <p className="mb-1 text-[11px] font-medium leading-relaxed text-zinc-200">
          {acquisitionView.statusLineTr}
        </p>
        {acquisitionView.detailLinesTr.length > 0 && (
          <ul className="mb-1.5 space-y-0.5">
            {acquisitionView.detailLinesTr.map((line, i) => (
              <li key={i} className="text-[10.5px] text-zinc-400">
                {line}
              </li>
            ))}
          </ul>
        )}
        <p className="mb-2.5 text-[11px] leading-relaxed text-zinc-500">{intake.founderSummary}</p>
        <div className={kpiStripCls}>
          <SummaryTile
            label={HERMES_ACQUISITION_FOUNDER_LABELS.sectionCounters.evaluated}
            value={acquisitionView.counters.evaluatedToday}
          />
          <SummaryTile label="Yeni Fırsat" value={intake.newOpportunityCount} accent="text-emerald-400" />
          <SummaryTile label={FOUNDER_HOME_LABELS.activeJobsTile} value={intake.activeMissionCount} />
          <SummaryTile label="Onay Bekleyen" value={intake.approvalRequiredCount} accent="text-amber-400" />
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-white/[0.02] px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
              {HERMES_ACQUISITION_FOUNDER_LABELS.lastScan}
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-300">
              {formatTime(Math.max(acquisitionView.lastScanAt ?? 0, intake.lastImportAt ?? 0))}
            </p>
          </div>
          <p className="min-w-0 flex-1 truncate text-right text-[10px] font-medium text-indigo-300">
            {intake.suggestedAction}
          </p>
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <button type="button" onClick={scrollToKararKuyrugu} className={btnPrimaryCls}>
            {HERMES_LEAD_INTAKE_BUTTON_LABELS.reviewOpportunities}
          </button>
          <button type="button" onClick={onNavigateToLeadImport} className={btnCls}>
            {HERMES_LEAD_INTAKE_BUTTON_LABELS.openDeveloperLeadImport}
          </button>
        </div>
      </div>

      {/* Section 4b — Hermes Bugün Bunları Buldu (Sprint C1.5): today's
          acquisition explanations. Why each business was picked (reasons read
          from existing verification/ICP/homepage signals), why others were set
          aside, and what Hermes plans next — all founder language, no
          technical vocabulary, no red unless the data really failed to load. */}
      <div className="order-5 border-b border-white/[0.06] px-5 py-3">
        <p className={`${sectionLabelCls} mb-0.5`}>{HERMES_ACQUISITION_EXPLAINABILITY_LABELS.sectionTitle}</p>
        <p className="mb-2.5 text-[11px] text-zinc-500">
          {HERMES_ACQUISITION_EXPLAINABILITY_LABELS.sectionSubtitle}
        </p>

        {explainability.mode === "loading" && (
          <p className="text-[11px] text-zinc-600">{HERMES_ACQUISITION_EXPLAINABILITY_LABELS.loading}</p>
        )}

        {explainability.mode === "error" && (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-rose-500/[0.06] px-4 py-3 ring-1 ring-inset ring-rose-500/15">
            <p className="text-[11px] text-rose-300">{HERMES_ACQUISITION_EXPLAINABILITY_LABELS.error}</p>
            <button
              type="button"
              onClick={onRetryAcquisition}
              className="shrink-0 text-[11px] font-semibold text-rose-200 hover:text-rose-100"
            >
              {HERMES_ACQUISITION_EXPLAINABILITY_LABELS.retry}
            </button>
          </div>
        )}

        {explainability.mode === "empty" && (
          <div className="rounded-lg bg-white/[0.02] px-4 py-3.5">
            <p className="text-[12px] font-medium text-zinc-300">
              {HERMES_ACQUISITION_EXPLAINABILITY_LABELS.emptyTitle}
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {HERMES_ACQUISITION_EXPLAINABILITY_LABELS.emptySubtitle}
            </p>
          </div>
        )}

        {explainability.mode === "ready" && (
          <div className="space-y-1.5">
            {explainability.found.map((card) => (
              <OpportunityExplanationCard key={card.title} card={card} />
            ))}
            {explainability.revisit.map((card) => (
              <OpportunityExplanationCard key={card.title} card={card} />
            ))}
          </div>
        )}
      </div>

      {/* Section 4c — Hermes Satışa Hazır Fırsatlar (Sprint C2): tek ve
          açıklanabilir ticari hazırlık kararı. Founder yalnız dört durumu
          okur (Satışa Hazır / İnceleme Gerekiyor / Daha Fazla Veri / İzleniyor);
          hiçbir kart mesaj göndermez — outreach hâlâ founder onayının arkasında. */}
      <div id={QUALIFICATION_ANCHOR_ID} className={`order-6 border-b border-white/[0.06] px-5 py-3 ${developerMode ? "" : "hidden"}`}>
        <p className={`${sectionLabelCls} mb-0.5`}>{HERMES_QUALIFICATION_FOUNDER_LABELS.sectionTitle}</p>
        <p className="mb-2.5 text-[11px] text-zinc-500">
          {HERMES_QUALIFICATION_FOUNDER_LABELS.sectionSubtitle}
        </p>

        {qualificationView.mode === "loading" && (
          <p className="text-[11px] text-zinc-600">{HERMES_QUALIFICATION_FOUNDER_LABELS.loading}</p>
        )}

        {qualificationView.mode === "error" && (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-rose-500/[0.06] px-4 py-3 ring-1 ring-inset ring-rose-500/15">
            <p className="text-[11px] text-rose-300">{HERMES_QUALIFICATION_FOUNDER_LABELS.error}</p>
            <button
              type="button"
              onClick={retryDataFetches}
              className="shrink-0 text-[11px] font-semibold text-rose-200 hover:text-rose-100"
            >
              {HERMES_QUALIFICATION_FOUNDER_LABELS.retry}
            </button>
          </div>
        )}

        {qualificationView.mode === "empty" && (
          <div className="rounded-lg bg-white/[0.02] px-4 py-3.5">
            <p className="text-[12px] font-medium text-zinc-300">
              {HERMES_QUALIFICATION_FOUNDER_LABELS.emptyTitle}
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {HERMES_QUALIFICATION_FOUNDER_LABELS.emptySubtitle}
            </p>
          </div>
        )}

        {qualificationView.mode === "ready" && (
          <>
            <div className="mb-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <QualificationCounter
                label={HERMES_QUALIFICATION_FOUNDER_LABELS.counterSalesReady}
                value={qualificationView.counters.salesReady}
                accent="text-emerald-400"
              />
              <QualificationCounter
                label={HERMES_QUALIFICATION_FOUNDER_LABELS.counterReviewRequired}
                value={qualificationView.counters.reviewRequired}
                accent="text-amber-400"
              />
              <QualificationCounter
                label={HERMES_QUALIFICATION_FOUNDER_LABELS.counterDataNeeded}
                value={qualificationView.counters.dataNeeded}
                accent="text-sky-400"
              />
              <QualificationCounter
                label={HERMES_QUALIFICATION_FOUNDER_LABELS.counterWatch}
                value={qualificationView.counters.watch}
                accent="text-zinc-400"
              />
            </div>
            {qualificationView.cards.length > 0 && (
              <div className="space-y-1.5">
                {qualificationView.cards.map((card) => (
                  <QualificationReadyCard key={card.leadId ?? card.title} card={card} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Section 4d — Hermes Hazırladığı Mesajlar (Sprint C3): satışa hazır
          fırsatlar için hazırlanan mesaj taslakları. Founder yalnız inceler /
          taslağı görür — GÖNDERİM BUTONU YOK. Gönderim mevcut Founder Approval
          zincirinin arkasındadır; Hermes hiçbir mesaj göndermez. */}
      <div id={OUTREACH_ANCHOR_ID} className={`order-6 border-b border-white/[0.06] px-5 py-3 ${developerMode ? "" : "hidden"}`}>
        <p className={`${sectionLabelCls} mb-0.5`}>{HERMES_OUTREACH_FOUNDER_LABELS.sectionTitle}</p>
        <p className="mb-2.5 text-[11px] text-zinc-500">
          {HERMES_OUTREACH_FOUNDER_LABELS.sectionSubtitle}
        </p>

        {outreachView.mode === "loading" && (
          <p className="text-[11px] text-zinc-600">{HERMES_OUTREACH_FOUNDER_LABELS.loading}</p>
        )}

        {outreachView.mode === "error" && (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-rose-500/[0.06] px-4 py-3 ring-1 ring-inset ring-rose-500/15">
            <p className="text-[11px] text-rose-300">{HERMES_OUTREACH_FOUNDER_LABELS.error}</p>
            <button
              type="button"
              onClick={retryDataFetches}
              className="shrink-0 text-[11px] font-semibold text-rose-200 hover:text-rose-100"
            >
              {HERMES_OUTREACH_FOUNDER_LABELS.retry}
            </button>
          </div>
        )}

        {outreachView.mode === "empty" && (
          <div className="rounded-lg bg-white/[0.02] px-4 py-3.5">
            <p className="text-[12px] font-medium text-zinc-300">
              {HERMES_OUTREACH_FOUNDER_LABELS.emptyTitle}
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {HERMES_OUTREACH_FOUNDER_LABELS.emptySubtitle}
            </p>
          </div>
        )}

        {outreachView.mode === "ready" && (
          <>
            <div className="mb-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <QualificationCounter
                label={HERMES_OUTREACH_FOUNDER_LABELS.counterAwaiting}
                value={outreachView.counters.awaitingFounder}
                accent="text-amber-400"
              />
              <QualificationCounter
                label={HERMES_OUTREACH_FOUNDER_LABELS.counterApprovalRequired}
                value={outreachView.counters.approvalRequired}
                accent="text-emerald-400"
              />
              <QualificationCounter
                label={HERMES_OUTREACH_FOUNDER_LABELS.counterDraftReady}
                value={outreachView.counters.draftReady}
                accent="text-sky-400"
              />
              <QualificationCounter
                label={HERMES_OUTREACH_FOUNDER_LABELS.counterWaiting}
                value={outreachView.counters.waiting}
                accent="text-zinc-400"
              />
            </div>
            {outreachView.cards.length > 0 && (
              <div className="space-y-1.5">
                {outreachView.cards.map((card) => (
                  <OutreachPreparedCard key={card.leadId ?? card.title} card={card} />
                ))}
              </div>
            )}
            <p className="mt-2 text-[10px] text-zinc-600">{HERMES_OUTREACH_FOUNDER_LABELS.noSendNote}</p>
          </>
        )}
      </div>

      {/* Section 4e — Hermes Konuşmaları (Sprint C4): gelen cevapların tek
          durumda birleşmiş ticari anlamı. Founder tek ekranda görür: otel ne
          dedi, ne anlama geliyor, Hermes ne öneriyor, hangi kararı vermeli.
          GÖNDERİM BUTONU YOK — Hermes hiçbir mesaj göndermez. */}
      <div id={CONVERSATION_ANCHOR_ID} className={`order-6 border-b border-white/[0.06] px-5 py-3 ${developerMode ? "" : "hidden"}`}>
        <p className={`${sectionLabelCls} mb-0.5`}>{HERMES_CONVERSATION_FOUNDER_LABELS.sectionTitle}</p>
        <p className="mb-2.5 text-[11px] text-zinc-500">
          {HERMES_CONVERSATION_FOUNDER_LABELS.sectionSubtitle}
        </p>

        {conversationView.mode === "loading" && (
          <p className="text-[11px] text-zinc-600">{HERMES_CONVERSATION_FOUNDER_LABELS.loading}</p>
        )}

        {conversationView.mode === "error" && (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-rose-500/[0.06] px-4 py-3 ring-1 ring-inset ring-rose-500/15">
            <p className="text-[11px] text-rose-300">{HERMES_CONVERSATION_FOUNDER_LABELS.error}</p>
            <button
              type="button"
              onClick={retryDataFetches}
              className="shrink-0 text-[11px] font-semibold text-rose-200 hover:text-rose-100"
            >
              {HERMES_CONVERSATION_FOUNDER_LABELS.retry}
            </button>
          </div>
        )}

        {conversationView.mode === "empty" && (
          <div className="rounded-lg bg-white/[0.02] px-4 py-3.5">
            <p className="text-[12px] font-medium text-zinc-300">
              {HERMES_CONVERSATION_FOUNDER_LABELS.emptyTitle}
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {HERMES_CONVERSATION_FOUNDER_LABELS.emptySubtitle}
            </p>
          </div>
        )}

        {conversationView.mode === "ready" && (
          <>
            <div className="mb-2 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
              <QualificationCounter
                label={HERMES_CONVERSATION_FOUNDER_LABELS.counterHot}
                value={conversationView.counters.hotOpportunity}
                accent="text-rose-400"
              />
              <QualificationCounter
                label={HERMES_CONVERSATION_FOUNDER_LABELS.counterPricing}
                value={conversationView.counters.pricingDiscussion}
                accent="text-amber-400"
              />
              <QualificationCounter
                label={HERMES_CONVERSATION_FOUNDER_LABELS.counterDemo}
                value={conversationView.counters.demoRequested}
                accent="text-emerald-400"
              />
              <QualificationCounter
                label={HERMES_CONVERSATION_FOUNDER_LABELS.counterCall}
                value={conversationView.counters.callRequested}
                accent="text-sky-400"
              />
              <QualificationCounter
                label={HERMES_CONVERSATION_FOUNDER_LABELS.counterReview}
                value={conversationView.counters.reviewRequired}
                accent="text-zinc-400"
              />
            </div>
            {conversationView.cards.length > 0 && (
              <div className="space-y-1.5">
                {conversationView.cards.map((card) => (
                  <ConversationCard key={card.leadId ?? card.title} card={card} />
                ))}
              </div>
            )}
            <p className="mt-2 text-[10px] text-zinc-600">{HERMES_CONVERSATION_FOUNDER_LABELS.noSendNote}</p>
          </>
        )}
      </div>

      {/* Section 4f — Hermes Takip Planı (Sprint C5): hangi takip bugün/yaklaşan/
          onay bekliyor/kanal kontrolü. Founder yalnız inceler/planlar/vazgeçer —
          GÖNDERİM BUTONU YOK. Gönderim mevcut Founder Approval zincirinin
          arkasındadır; Hermes hiçbir takip mesajı otomatik göndermez. */}
      <div id={FOLLOW_UP_PLAN_ANCHOR_ID} className="order-4 border-b border-white/[0.06] px-5 py-3">
        <p className={`${sectionLabelCls} mb-0.5`}>{HERMES_FOLLOW_UP_PLAN_LABELS.sectionTitle}</p>
        <p className="mb-2.5 text-[11px] text-zinc-500">
          {HERMES_FOLLOW_UP_PLAN_LABELS.sectionSubtitle}
        </p>

        {followUpPlanView.mode === "loading" && (
          <p className="text-[11px] text-zinc-600">{HERMES_FOLLOW_UP_PLAN_LABELS.loading}</p>
        )}

        {followUpPlanView.mode === "error" && (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-rose-500/[0.06] px-4 py-3 ring-1 ring-inset ring-rose-500/15">
            <p className="text-[11px] text-rose-300">{HERMES_FOLLOW_UP_PLAN_LABELS.error}</p>
            <button
              type="button"
              onClick={retryDataFetches}
              className="shrink-0 text-[11px] font-semibold text-rose-200 hover:text-rose-100"
            >
              {HERMES_FOLLOW_UP_PLAN_LABELS.retry}
            </button>
          </div>
        )}

        {followUpPlanView.mode === "empty" && (
          <div className="rounded-lg bg-white/[0.02] px-4 py-3.5">
            <p className="text-[12px] font-medium text-zinc-300">
              {HERMES_FOLLOW_UP_PLAN_LABELS.emptyTitle}
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {HERMES_FOLLOW_UP_PLAN_LABELS.emptySubtitle}
            </p>
          </div>
        )}

        {followUpPlanView.mode === "ready" && (
          <>
            <div className="mb-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <QualificationCounter
                label={HERMES_FOLLOW_UP_PLAN_LABELS.counterDueToday}
                value={followUpPlanView.counters.dueToday}
                accent="text-emerald-400"
              />
              <QualificationCounter
                label={HERMES_FOLLOW_UP_PLAN_LABELS.counterUpcoming}
                value={followUpPlanView.counters.upcoming}
                accent="text-sky-400"
              />
              <QualificationCounter
                label={HERMES_FOLLOW_UP_PLAN_LABELS.counterApproval}
                value={followUpPlanView.counters.approvalRequired}
                accent="text-amber-400"
              />
              <QualificationCounter
                label={HERMES_FOLLOW_UP_PLAN_LABELS.counterChannelReview}
                value={followUpPlanView.counters.channelReview}
                accent="text-rose-400"
              />
            </div>
            <FollowUpPlanGroup title={HERMES_FOLLOW_UP_PLAN_LABELS.groupToday} cards={followUpPlanView.today} />
            <FollowUpPlanGroup title={HERMES_FOLLOW_UP_PLAN_LABELS.groupApproval} cards={followUpPlanView.approval} />
            <FollowUpPlanGroup title={HERMES_FOLLOW_UP_PLAN_LABELS.groupChannelReview} cards={followUpPlanView.channelReview} />
            <FollowUpPlanGroup title={HERMES_FOLLOW_UP_PLAN_LABELS.groupUpcoming} cards={followUpPlanView.upcoming} />
            <p className="mt-2 text-[10px] text-zinc-600">{HERMES_FOLLOW_UP_PLAN_LABELS.noSendNote}</p>
          </>
        )}
      </div>

      {/* Section 5 — Gelir Nabzı (Sprint C6 — Revenue Pipeline Intelligence):
          fırsatların satışa yakınlığı, riskleri ve AYRIK gelir kategorileri.
          Bilinmeyen tutar "Henüz belirlenmedi" — asla sahte ₺0. Pipeline zekâsı
          muhasebe değildir; tahmini gelir tahsil edilmiş gelir değildir. */}
      <div className="order-3 border-b border-white/[0.06] px-5 py-3">
        <p className={`${sectionLabelCls} mb-0.5`}>{HERMES_REVENUE_PIPELINE_LABELS.sectionTitle}</p>
        <p className="mb-2.5 text-[11px] text-zinc-500">{HERMES_REVENUE_PIPELINE_LABELS.sectionSubtitle}</p>

        {revenuePipelineView.mode === "loading" && (
          <p className="text-[11px] text-zinc-600">{HERMES_REVENUE_PIPELINE_LABELS.loading}</p>
        )}

        {revenuePipelineView.mode === "error" && (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-rose-500/[0.06] px-4 py-3 ring-1 ring-inset ring-rose-500/15">
            <p className="text-[11px] text-rose-300">{HERMES_REVENUE_PIPELINE_LABELS.error}</p>
            <button type="button" onClick={retryDataFetches} className="shrink-0 text-[11px] font-semibold text-rose-200 hover:text-rose-100">
              {HERMES_REVENUE_PIPELINE_LABELS.retry}
            </button>
          </div>
        )}

        {revenuePipelineView.mode === "empty" && (
          <div className="rounded-lg bg-white/[0.02] px-4 py-3.5">
            <p className="text-[12px] font-medium text-zinc-300">{HERMES_REVENUE_PIPELINE_LABELS.emptyTitle}</p>
            <p className="mt-0.5 text-[11px] text-zinc-500">{HERMES_REVENUE_PIPELINE_LABELS.emptySubtitle}</p>
          </div>
        )}

        {revenuePipelineView.mode === "ready" && (
          <>
            <div className="mb-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <RevenueKpi label={HERMES_REVENUE_PIPELINE_LABELS.kpiActive} value={revenuePipelineView.summary.activeLabel} accent="text-zinc-200" />
              <RevenueKpi label={HERMES_REVENUE_PIPELINE_LABELS.kpiClosest} value={revenuePipelineView.summary.closestLabel} accent="text-emerald-400" />
              <RevenueKpi label={HERMES_REVENUE_PIPELINE_LABELS.kpiAtRisk} value={revenuePipelineView.summary.atRiskLabel} accent="text-rose-400" />
              <RevenueKpi label={HERMES_REVENUE_PIPELINE_LABELS.kpiOutcomePending} value={revenuePipelineView.summary.outcomePendingLabel} accent="text-amber-400" />
              <RevenueKpi label={HERMES_REVENUE_PIPELINE_LABELS.kpiRealizedMrr} value={revenuePipelineView.summary.realizedMrrLabel} accent="text-emerald-400" />
              <RevenueKpi label={HERMES_REVENUE_PIPELINE_LABELS.kpiPotentialMrr} value={revenuePipelineView.summary.potentialMrrLabel} accent="text-sky-400" />
              <RevenueKpi label={HERMES_REVENUE_PIPELINE_LABELS.kpiRiskedMrr} value={revenuePipelineView.summary.riskedMrrLabel} accent="text-rose-400" />
            </div>

            {revenuePipelineView.closest.length > 0 && (
              <div className="mt-2">
                <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-600">{HERMES_REVENUE_PIPELINE_LABELS.closestTitle}</p>
                <div className="space-y-1.5">
                  {revenuePipelineView.closest.map((card) => (
                    <RevenuePipelineCardView key={card.leadId ?? card.title} card={card} />
                  ))}
                </div>
              </div>
            )}

            {revenuePipelineView.atRisk.length > 0 && (
              <div className="mt-2">
                <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-rose-400/80">{HERMES_REVENUE_PIPELINE_LABELS.atRiskTitle}</p>
                <div className="space-y-1.5">
                  {revenuePipelineView.atRisk.map((card) => (
                    <RevenuePipelineCardView key={`risk-${card.leadId ?? card.title}`} card={card} atRisk />
                  ))}
                </div>
              </div>
            )}

            <p className="mt-2 text-[10px] text-zinc-600">{HERMES_REVENUE_PIPELINE_LABELS.notAccountingNote}</p>
          </>
        )}

        {/* Kazanılan/kaybedilen özeti (Sales Outcome source-of-truth) — pipeline
            fetch başarısızsa da gerçek kapanış sayıları görünür kalır. */}
        {revenuePipelineView.mode !== "ready" && initialLoadDone && !hasNoRevenueOutcomes && (
          <div className={`${kpiStripCls} mt-2`}>
            <SummaryTile label="Kazanıldı" value={summary.wonCount} accent="text-emerald-400" />
            <SummaryTile label="Kaybedildi" value={summary.lostCount} accent="text-rose-400" />
            <SummaryTile label="Kazanılan MRR" value={summary.estimatedMrrTotal} accent="text-emerald-400" format={(v) => `₺${v.toLocaleString("tr-TR")}`} />
          </div>
        )}
      </div>

      {/* Section 6 — Hermes Aktivitesi: meaningful events, not technical logs */}
      <div className="order-7 px-5 py-3">
        <p className={`${sectionLabelCls} mb-2`}>Hermes Aktivitesi</p>
        {timeline.length === 0 ? (
          <p className="text-[11px] text-zinc-600">{FOUNDER_HOME_EMPTY_STATE_LABELS.activity}</p>
        ) : (
          <ul className="space-y-1.5">
            {timeline.map((event) => (
              <li key={event.id} className="flex items-center justify-between gap-3">
                <span className="text-[10px] text-zinc-400">{event.label}</span>
                <span className="shrink-0 text-[9px] text-zinc-600">{formatTime(event.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * v8.6 (Scope 7) — Hermes Bugün's compact stat row: the label leads, the
 * number stays secondary. Deliberately not a `SummaryTile` — no 28px hero
 * digits may dominate the daily workspace.
 */
function TodayFocusRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.02] px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">{label}</p>
      <p className={`text-[13px] font-semibold tabular-nums ${accent ?? "text-zinc-200"}`}>{value}</p>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  accent,
  format,
}: {
  label: string;
  value: number;
  accent?: string;
  format?: (value: number) => string;
}) {
  return (
    <div className="px-4 py-3.5">
      <p className={kpiLabelCls}>{label}</p>
      <p className={`${kpiValueCls} ${accent ?? "text-zinc-100"} mt-1`}>{format ? format(value) : value}</p>
      <p className={kpiSubCls}>&nbsp;</p>
    </div>
  );
}

function HealthTile({ label, value }: { label: string; value: string }) {
  const healthy =
    value === "Sağlıklı" || value === "Aktif" || value === "Hazır" || value === "Dinliyor" || value === "Çalışıyor";
  return (
    <div className="rounded-lg bg-white/[0.02] px-3 py-2.5">
      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-600">{label}</p>
      <div className="mt-1 flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${healthy ? "bg-emerald-400" : "bg-zinc-500"}`} />
        <span className="text-[11px] font-medium text-zinc-200">{value}</span>
      </div>
    </div>
  );
}

/** Sprint C2 — Satışa Hazır Fırsatlar sayaç kutusu: etiket önde, sayı ikincil. */
function QualificationCounter({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.02] px-3 py-2">
      <p className="min-w-0 truncate text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-600">{label}</p>
      <p className={`text-[12px] font-semibold tabular-nums ${accent}`}>{value}</p>
    </div>
  );
}

/**
 * Sprint C2 — satışa hazır / inceleme kartı: otel adı, hazırlık durumu,
 * Hermes'in gerekçesi, varsa dikkat noktası, önerilen sonraki adım ve taslak
 * uygunluk rozeti. Aksiyon butonu YOK — mesaj hazırlama/gönderme bu bölümden
 * asla tetiklenemez; karar akışı Karar Merkezi'nde kalır.
 */
function QualificationReadyCard({ card }: { card: QualificationFounderCard }) {
  const badgeCls = card.isSalesReady
    ? "bg-emerald-500/[0.10] text-emerald-300 ring-emerald-500/20"
    : "bg-amber-500/[0.10] text-amber-300 ring-amber-500/20";
  const draftBadgeCls =
    card.draftBadgeTr === HERMES_QUALIFICATION_FOUNDER_LABELS.draftEligible
      ? "bg-emerald-500/[0.08] text-emerald-300 ring-emerald-500/15"
      : "bg-amber-500/[0.08] text-amber-300 ring-amber-500/15";
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-[11px] font-semibold text-zinc-200">{card.title}</p>
          {card.scoreLabel && <span className="shrink-0 text-[9px] text-zinc-500">{card.scoreLabel}</span>}
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2 py-[2px] text-[9px] font-semibold ring-1 ring-inset ${badgeCls}`}
        >
          {card.statusLabelTr}
        </span>
      </div>
      {card.whyReadyTr.length > 0 && (
        <>
          <p className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
            {HERMES_QUALIFICATION_FOUNDER_LABELS.whyReady}
          </p>
          <ul className="mt-1 space-y-0.5">
            {card.whyReadyTr.map((reason) => (
              <li key={reason} className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                <span className="shrink-0 text-emerald-400" aria-hidden>
                  ✓
                </span>
                {reason}
              </li>
            ))}
          </ul>
        </>
      )}
      {card.attentionTr && (
        <p className="mt-1.5 text-[10px] text-amber-300/90">
          <span className="font-semibold">{HERMES_QUALIFICATION_FOUNDER_LABELS.attention}:</span>{" "}
          {card.attentionTr}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-1.5">
        <p className="min-w-0 flex-1 text-[10px] font-medium text-indigo-300">
          <span className="font-semibold uppercase tracking-[0.1em] text-zinc-600">
            {HERMES_QUALIFICATION_FOUNDER_LABELS.nextStep}:
          </span>{" "}
          {card.nextStepTr}
        </p>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2 py-[2px] text-[9px] font-semibold ring-1 ring-inset ${draftBadgeCls}`}
        >
          {card.draftBadgeTr}
        </span>
      </div>
    </div>
  );
}

/**
 * Sprint C3 — hazırlanan mesaj kartı: otel adı, hazırlık durumu, önerilen
 * kanal/şablon/dil/ton, Hermes'in neden hazırladığı (personalization) ve
 * founder aksiyonu. GÖNDERİM BUTONU YOK — yalnız "Mesajı İncele" / "Taslağı
 * Gör". Bu butonlar mevcut mesaj onayı akışına yönlendirir; hiçbir mesaj
 * göndermez.
 */
function OutreachPreparedCard({ card }: { card: OutreachFounderCard }) {
  const badgeCls = card.approvalNeeded
    ? "bg-amber-500/[0.10] text-amber-300 ring-amber-500/20"
    : "bg-sky-500/[0.10] text-sky-300 ring-sky-500/20";
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[11px] font-semibold text-zinc-200">{card.title}</p>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2 py-[2px] text-[9px] font-semibold ring-1 ring-inset ${badgeCls}`}
        >
          {card.statusLabelTr}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        <OutreachChip label={HERMES_OUTREACH_FOUNDER_LABELS.channel} value={card.channelLabelTr} />
        <OutreachChip label={HERMES_OUTREACH_FOUNDER_LABELS.template} value={card.templateLabelTr} />
        <OutreachChip label={HERMES_OUTREACH_FOUNDER_LABELS.language} value={card.languageLabelTr} />
        <OutreachChip label={HERMES_OUTREACH_FOUNDER_LABELS.tone} value={card.toneLabelTr} />
      </div>
      {card.whyPreparedTr.length > 0 && (
        <>
          <p className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
            {HERMES_OUTREACH_FOUNDER_LABELS.whyPrepared}
          </p>
          <ul className="mt-1 space-y-0.5">
            {card.whyPreparedTr.map((reason) => (
              <li key={reason} className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                <span className="shrink-0 text-emerald-400" aria-hidden>
                  ✓
                </span>
                {reason}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-1.5">
        <p className="min-w-0 flex-1 text-[10px] font-medium text-indigo-300">
          <span className="font-semibold uppercase tracking-[0.1em] text-zinc-600">
            {HERMES_OUTREACH_FOUNDER_LABELS.nextStep}:
          </span>{" "}
          {card.nextStepTr}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={scrollToKararKuyrugu}
            className="rounded-md bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-zinc-200 hover:bg-white/[0.08]"
          >
            {HERMES_OUTREACH_FOUNDER_LABELS.reviewMessage}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Sprint C3 — hazırlanan mesajın tek özelliğini gösteren küçük etiket çipi. */
function OutreachChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.03] px-1.5 py-[2px] text-[9px] text-zinc-400">
      <span className="font-semibold uppercase tracking-[0.08em] text-zinc-600">{label}</span>
      <span className="text-zinc-300">{value}</span>
    </span>
  );
}

/**
 * Sprint C4 — konuşma kartı: otel adı + konuşma durumu, güvenli cevap özeti,
 * "Ne oldu? / Neden önemli? / Hermes ne öneriyor?" ve founder'ın vereceği
 * karar. GÖNDERİM BUTONU YOK — founder aksiyonu (varsa) yalnız mevcut karar
 * akışına yönlendirir; hiçbir mesaj göndermez.
 */
/** Sprint C6 — Gelir Nabzı KPI karesi: metin değeri (₺ veya "Henüz belirlenmedi") gösterir. */
function RevenueKpi({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-lg bg-white/[0.02] px-2.5 py-2">
      <p className="min-w-0 truncate text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-600">{label}</p>
      <p className={`truncate text-[12px] font-semibold tabular-nums ${accent}`}>{value}</p>
    </div>
  );
}

/**
 * Sprint C6 — gelir fırsat kartı: otel adı + aşama, gelir sinyali, neden
 * önemli, Hermes önerisi, founder sonraki adım. GÖNDERİM BUTONU YOK — founder
 * aksiyonu (varsa) yalnız mevcut karar akışına yönlendirir.
 */
function RevenuePipelineCardView({ card, atRisk }: { card: RevenuePipelineCard; atRisk?: boolean }) {
  const badgeCls = atRisk
    ? "bg-rose-500/[0.10] text-rose-300 ring-rose-500/20"
    : "bg-emerald-500/[0.10] text-emerald-300 ring-emerald-500/20";
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[11px] font-semibold text-zinc-200">{card.title}</p>
        <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-[2px] text-[9px] font-semibold ring-1 ring-inset ${badgeCls}`}>
          {card.stageLabelTr}
        </span>
      </div>
      <p className="mt-1 text-[10px] font-medium text-sky-300">{card.revenueSignalLabelTr}</p>
      {card.riskReasonsTr.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {card.riskReasonsTr.map((r) => (
            <li key={r} className="flex items-center gap-1.5 text-[10px] text-rose-300/90">
              <span className="shrink-0" aria-hidden>⚠</span>
              {r}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-[10px] text-zinc-400">
        <span className="font-semibold uppercase tracking-[0.1em] text-zinc-600">{HERMES_REVENUE_PIPELINE_LABELS.hermesRecommendation}</span>{" "}
        {card.hermesRecommendationTr}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-1.5">
        <p className="min-w-0 flex-1 text-[10px] font-medium text-indigo-300">
          <span className="font-semibold uppercase tracking-[0.1em] text-zinc-600">{HERMES_REVENUE_PIPELINE_LABELS.founderNext}:</span>{" "}
          {card.founderNextActionTr}
        </p>
        {card.founderActionLabelTr && (
          <button
            type="button"
            onClick={scrollToKararKuyrugu}
            className="shrink-0 rounded-md bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-zinc-200 hover:bg-white/[0.08]"
          >
            {card.founderActionLabelTr}
          </button>
        )}
      </div>
    </div>
  );
}

function FollowUpPlanGroup({ title, cards }: { title: string; cards: FollowUpPlanCard[] }) {
  if (cards.length === 0) return null;
  return (
    <div className="mt-2">
      <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-600">{title}</p>
      <div className="space-y-1.5">
        {cards.map((card) => (
          <FollowUpPlanCardView key={card.followUpCandidateId} card={card} />
        ))}
      </div>
    </div>
  );
}

/**
 * Sprint C5 — takip kartı: otel adı + takip durumu, takip nedeni, ne oldu /
 * Hermes önerisi / ne zaman ve founder kararı. GÖNDERİM BUTONU YOK — founder
 * aksiyonu (varsa) yalnız mevcut karar akışına yönlendirir.
 */
function FollowUpPlanCardView({ card }: { card: FollowUpPlanCard }) {
  const badgeCls = card.channelReview
    ? "bg-rose-500/[0.10] text-rose-300 ring-rose-500/20"
    : card.approvalRequired
      ? "bg-amber-500/[0.10] text-amber-300 ring-amber-500/20"
      : "bg-indigo-500/[0.10] text-indigo-300 ring-indigo-500/20";
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[11px] font-semibold text-zinc-200">{card.title}</p>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2 py-[2px] text-[9px] font-semibold ring-1 ring-inset ${badgeCls}`}
        >
          {card.stateLabelTr}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[9px]">
        <span className="rounded-md bg-white/[0.03] px-1.5 py-[2px] text-zinc-400">{card.reasonLabelTr}</span>
        <span className="text-zinc-500">
          {HERMES_FOLLOW_UP_PLAN_LABELS.timing}: {card.suggestedTimingTr}
        </span>
        {card.overdueByMinutes != null && card.overdueByMinutes > 0 && (
          <span className="rounded-md bg-rose-500/[0.10] px-1.5 py-[2px] font-semibold text-rose-300">
            {HERMES_FOLLOW_UP_PLAN_LABELS.overdue}
          </span>
        )}
      </div>
      <dl className="mt-1.5 space-y-1">
        <div>
          <dt className="text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
            {HERMES_FOLLOW_UP_PLAN_LABELS.whatHappened}
          </dt>
          <dd className="text-[10px] text-zinc-400">{card.whatHappenedTr}</dd>
        </div>
        <div>
          <dt className="text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
            {HERMES_FOLLOW_UP_PLAN_LABELS.hermesRecommendation}
          </dt>
          <dd className="text-[10px] text-zinc-400">{card.hermesRecommendationTr}</dd>
        </div>
      </dl>
      {card.founderActionLabelTr && (
        <div className="mt-2 flex items-center justify-end border-t border-white/[0.06] pt-1.5">
          <button
            type="button"
            onClick={scrollToKararKuyrugu}
            className="shrink-0 rounded-md bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-zinc-200 hover:bg-white/[0.08]"
          >
            {card.founderActionLabelTr}
          </button>
        </div>
      )}
    </div>
  );
}

function ConversationCard({ card }: { card: ConversationFounderCard }) {
  const badgeCls = card.approvalRequired
    ? "bg-amber-500/[0.10] text-amber-300 ring-amber-500/20"
    : "bg-indigo-500/[0.10] text-indigo-300 ring-indigo-500/20";
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[11px] font-semibold text-zinc-200">{card.title}</p>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2 py-[2px] text-[9px] font-semibold ring-1 ring-inset ${badgeCls}`}
        >
          {card.stateLabelTr}
        </span>
      </div>
      {card.replyPreviewSafe && (
        <p className="mt-1.5 rounded-md bg-white/[0.03] px-2 py-1 text-[10px] italic text-zinc-400">
          <span className="font-semibold uppercase not-italic tracking-[0.1em] text-zinc-600">
            {HERMES_CONVERSATION_FOUNDER_LABELS.lastReply}:
          </span>{" "}
          “{card.replyPreviewSafe}”
        </p>
      )}
      <dl className="mt-1.5 space-y-1">
        <div>
          <dt className="text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
            {HERMES_CONVERSATION_FOUNDER_LABELS.whatHappened}
          </dt>
          <dd className="text-[10px] text-zinc-400">{card.whatHappenedTr}</dd>
        </div>
        <div>
          <dt className="text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
            {HERMES_CONVERSATION_FOUNDER_LABELS.whyItMatters}
          </dt>
          <dd className="text-[10px] text-zinc-400">{card.whyItMattersTr}</dd>
        </div>
        <div>
          <dt className="text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
            {HERMES_CONVERSATION_FOUNDER_LABELS.hermesRecommendation}
          </dt>
          <dd className="text-[10px] text-zinc-400">{card.hermesRecommendationTr}</dd>
        </div>
      </dl>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-1.5">
        <p className="min-w-0 flex-1 text-[10px] font-medium text-indigo-300">
          <span className="font-semibold uppercase tracking-[0.1em] text-zinc-600">
            {HERMES_CONVERSATION_FOUNDER_LABELS.founderDecision}:
          </span>{" "}
          {card.nextStepTr}
        </p>
        {card.founderActionLabelTr && (
          <button
            type="button"
            onClick={scrollToKararKuyrugu}
            className="shrink-0 rounded-md bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-zinc-200 hover:bg-white/[0.08]"
          >
            {card.founderActionLabelTr}
          </button>
        )}
      </div>
    </div>
  );
}

/** Sprint C1.5 — green ready / amber watching / gray waiting. The section's whole palette; red belongs to the error state alone. */
const EXPLANATION_ATTENTION_CLS: Record<
  AcquisitionAttentionLevel,
  { badge: string; dot: string }
> = {
  ready: { badge: "bg-emerald-500/[0.10] text-emerald-300 ring-emerald-500/20", dot: "text-emerald-400" },
  watching: { badge: "bg-amber-500/[0.10] text-amber-300 ring-amber-500/20", dot: "text-amber-400" },
  waiting: { badge: "bg-white/[0.04] text-zinc-400 ring-white/[0.06]", dot: "text-zinc-500" },
};

/**
 * Sprint C1.5 — one compact explanation card: business name + status badge,
 * the reason list ("Hermes bunu seçti çünkü" / "Neden?"), and the next step.
 * Pure rendering of a `FounderOpportunityExplanation` — no action buttons,
 * no mutation; decisions still live in Karar Merkezi alone.
 */
function OpportunityExplanationCard({ card }: { card: FounderOpportunityExplanation }) {
  const cls = EXPLANATION_ATTENTION_CLS[card.attentionLevel];
  const isWaiting = card.attentionLevel === "waiting";
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[11px] font-semibold text-zinc-200">{card.title}</p>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2 py-[2px] text-[9px] font-semibold ring-1 ring-inset ${cls.badge}`}
        >
          {card.scoreLabel ?? card.status}
        </span>
      </div>
      {!isWaiting && <p className="mt-1 text-[10px] font-medium text-zinc-300">{card.status}</p>}
      <p className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
        {isWaiting
          ? HERMES_ACQUISITION_EXPLAINABILITY_LABELS.revisitWhy
          : HERMES_ACQUISITION_EXPLAINABILITY_LABELS.pickedIntro}
      </p>
      <ul className="mt-1 space-y-0.5">
        {card.reasons.map((reason) => (
          <li key={reason} className="flex items-center gap-1.5 text-[10px] text-zinc-400">
            <span className={`shrink-0 ${cls.dot}`} aria-hidden>
              {isWaiting ? "•" : "✓"}
            </span>
            {reason}
          </li>
        ))}
      </ul>
      <div className="mt-2 border-t border-white/[0.06] pt-1.5">
        {!isWaiting && (
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
            {HERMES_ACQUISITION_EXPLAINABILITY_LABELS.nextStep}
          </p>
        )}
        <p className={`mt-0.5 text-[10px] font-medium ${isWaiting ? "text-zinc-500" : "text-indigo-300"}`}>
          {card.nextAction}
        </p>
      </div>
    </div>
  );
}


