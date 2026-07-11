"use client";

import { useEffect, useRef, useState } from "react";
import type { ScoredLead } from "@/app/lib/leads";
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
  type HermesOpportunityTimelineTone,
  type HermesOpportunityUrgency,
} from "@/app/components/v2/adapters/hermes-opportunity-focus-adapter";
import {
  HERMES_DAILY_WORKSPACE_LABELS,
  computeTodayStatusSentence,
} from "@/app/components/v2/adapters/hermes-daily-workspace-adapter";
import {
  HERMES_ACQUISITION_FOUNDER_LABELS,
  computeHermesAcquisitionFounderView,
  type AcquisitionStatusLike,
} from "@/app/components/v2/adapters/hermes-acquisition-founder-adapter";
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
 */

type Props = {
  missions: HermesMission[];
  selectedHermesMissionId: string | null;
  onSelectHermesMission: (mission: HermesMission) => void;
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
};

const KARAR_KUYRUGU_ANCHOR_ID = "hermes-home-karar-kuyrugu";

/** v8.2 — Decision Queue cards are styled by priority, not by the underlying (now-hidden) runtime stage. */
const DECISION_PRIORITY_BADGE_CLS: Record<HermesDecisionPriority, string> = {
  critical: "bg-rose-500/[0.10] text-rose-400 ring-rose-500/20",
  high: "bg-amber-500/[0.10] text-amber-400 ring-amber-500/20",
  medium: "bg-cyan-500/[0.10] text-cyan-400 ring-cyan-500/20",
  low: "bg-white/[0.04] text-zinc-500 ring-white/[0.06]",
};

/** v8.3 — Opportunity Focus's current-state badge is styled by urgency, not by the underlying (now-hidden) runtime stage. */
const OPPORTUNITY_URGENCY_BADGE_CLS: Record<HermesOpportunityUrgency, string> = {
  critical: "bg-rose-500/[0.10] text-rose-400 ring-rose-500/20",
  high: "bg-amber-500/[0.10] text-amber-400 ring-amber-500/20",
  medium: "bg-cyan-500/[0.10] text-cyan-400 ring-cyan-500/20",
  low: "bg-white/[0.04] text-zinc-500 ring-white/[0.06]",
  none: "bg-white/[0.04] text-zinc-600 ring-white/[0.06]",
};

const OPPORTUNITY_TIMELINE_DOT_CLS: Record<HermesOpportunityTimelineTone, string> = {
  success: "bg-emerald-400",
  warning: "bg-amber-400",
  danger: "bg-rose-400",
  info: "bg-sky-400",
  neutral: "bg-zinc-500",
};

function formatTime(at: number): string {
  return at > 0 ? new Date(at).toLocaleString("tr-TR") : "—";
}

function scrollToKararKuyrugu() {
  document.getElementById(KARAR_KUYRUGU_ANCHOR_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  // v8.5 (Release Candidate Polish, Scope 4/5) — a single "Tekrar Dene" re-runs
  // every one of the seven read-only fetches below; `initialLoadDone` gates
  // the compact "Hermes verileri hazırlanıyor…" line so the founder never
  // sees a flash of zeroed-out KPI tiles on first paint.
  const [retryTick, setRetryTick] = useState(0);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const pendingFetchesRef = useRef(0);
  const FETCH_COUNT = 7;

  useEffect(() => {
    pendingFetchesRef.current = FETCH_COUNT;
    setInitialLoadDone(false);
  }, [retryTick]);

  function markFetchSettled() {
    pendingFetchesRef.current -= 1;
    if (pendingFetchesRef.current <= 0) setInitialLoadDone(true);
  }

  const retryDataFetches = () => setRetryTick((t) => t + 1);

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
  const decisionItems = computeHermesDecisionQueue({
    actionQueue: queue,
    missions,
    recentReceipts,
    recentIntelligence,
    recentDemoItems,
    recentFollowUps,
    recentSalesOutcomes,
  });
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

  const selectedMission = missions.find((m) => m.missionId === selectedHermesMissionId) ?? null;
  const opportunityFocus = computeHermesOpportunityFocus({
    selectedMission,
    decisionItems,
    recentReceipts,
    recentReplies,
    recentIntelligence,
    recentDemoItems,
    recentFollowUps,
    recentSalesOutcomes,
  });

  // v8.2 — Karar Merkezi interactions. Selecting a card (or its primary
  // action, for every decisionType except approve_message) reuses the
  // screen's existing mission-selection state — no new state machine, no
  // navigation away from Hermes (Scope 4). Only approve_message's two
  // buttons call a real mutation, and only the exact existing handlers this
  // screen already receives as props.
  const missionForDecisionItem = (item: HermesDecisionItem) =>
    item.missionId ? (missions.find((m) => m.missionId === item.missionId) ?? null) : null;

  const focusDecisionItem = (item: HermesDecisionItem) => {
    const mission = missionForDecisionItem(item);
    if (mission) onSelectHermesMission(mission);
  };

  const runPrimaryDecisionAction = (item: HermesDecisionItem) => {
    const mission = missionForDecisionItem(item);
    if (mission && item.decisionType === "approve_message") {
      onApproveMission(mission);
      return;
    }
    focusDecisionItem(item);
  };

  const runSecondaryDecisionAction = (item: HermesDecisionItem) => {
    const mission = missionForDecisionItem(item);
    if (mission && item.decisionType === "approve_message") {
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

  const runOpportunityFocusPrimaryAction = (item: HermesDecisionItem) => {
    runPrimaryDecisionAction(item);
    if (item.decisionType !== "approve_message") scrollToKararKuyrugu();
  };

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

  // v8.6 (Scope 5) — the one compact sentence the founder reads before
  // anything else: "Hermes N karar hazırladı." / "Her şey kontrol altında…"
  const todayStatusSentence = computeTodayStatusSentence(decisionItems.length);

  return (
    <div>
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

      {/* v8.6 (Scope 5) — one compact sentence before anything else: what requires attention today */}
      <div className="border-b border-white/[0.06] px-5 py-3">
        <p className="text-[12.5px] font-medium text-zinc-200">{todayStatusSentence}</p>
      </div>

      {/* Section 1 — Karar Merkezi (v8.2, decision-first since v8.6): only single-touch founder decisions, never a status list */}
      <div id={KARAR_KUYRUGU_ANCHOR_ID} className="border-b border-white/[0.06] px-5 py-3">
        <p className={sectionLabelCls}>Karar Merkezi</p>
        <p className="mb-2.5 mt-0.5 text-[11px] text-zinc-500">Hermes işi yürütür; sen yalnızca karar verirsin.</p>
        {decisionItems.length === 0 ? (
          /* v8.6 (Scope 6) — no pending decision is a success state, never an empty warning box */
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
            {decisionItems.map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => focusDecisionItem(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") focusDecisionItem(item);
                }}
                className={`w-full cursor-pointer rounded-lg border px-3 py-2.5 text-left transition-colors duration-150 ${
                  item.missionId === selectedHermesMissionId
                    ? "border-indigo-500/40 bg-indigo-500/[0.08]"
                    : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-[11px] font-semibold text-zinc-200">{item.title}</span>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2 py-[2px] text-[9px] font-semibold ring-1 ring-inset ${DECISION_PRIORITY_BADGE_CLS[item.priority]}`}
                  >
                    {item.statusLabel}
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-zinc-400">{item.whatHappened}</p>
                <p className="mt-0.5 text-[10px] text-zinc-500">{item.whyItMatters}</p>
                <p className="mt-1 text-[10px] font-medium text-indigo-300">{item.hermesRecommendation}</p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      runPrimaryDecisionAction(item);
                    }}
                    className={btnPrimaryCls}
                  >
                    {item.primaryActionLabel}
                  </button>
                  {item.secondaryActionLabel && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        runSecondaryDecisionAction(item);
                      }}
                      className={btnCls}
                    >
                      {item.secondaryActionLabel}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2 — Fırsat Odağı (v8.3): "Bu otel için şimdi ne yapmalıyım?" — never a mission object viewer */}
      <div className="border-b border-white/[0.06] px-5 py-3">
        <p className={sectionLabelCls}>Fırsat Odağı</p>
        <p className="mb-2.5 mt-0.5 text-[11px] text-zinc-500">Seçili otel için Hermes&apos;in önerdiği sonraki adım.</p>
        {opportunityFocus.emptyState ? (
          <p className="text-[11px] text-zinc-600">{opportunityFocus.emptyState}</p>
        ) : (
          <div className="space-y-2 rounded-lg bg-white/[0.02] px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold text-zinc-200">{opportunityFocus.title}</p>
                <p className="text-[9px] text-zinc-600">{opportunityFocus.subtitle}</p>
              </div>
              <span
                className={`inline-flex shrink-0 items-center rounded-full px-2 py-[2px] text-[9px] font-semibold ring-1 ring-inset ${OPPORTUNITY_URGENCY_BADGE_CLS[opportunityFocus.urgency]}`}
              >
                {opportunityFocus.currentStateLabel}
              </span>
            </div>

            <p className="text-[10px] text-zinc-500">{opportunityFocus.whyThisMatters}</p>
            <p className="text-[10px] font-medium text-indigo-300">{opportunityFocus.hermesRecommendation}</p>
            <p className="text-[10px] font-semibold text-zinc-300">{opportunityFocus.founderNextAction}</p>

            <div className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.02] px-2.5 py-2">
              <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-600">Gelir Sinyali</span>
              <span className="text-[10px] font-medium text-emerald-300">
                {opportunityFocus.revenueSignalLabel}
                {opportunityFocus.estimatedMrrLabel ? ` · ${opportunityFocus.estimatedMrrLabel}` : ""}
              </span>
            </div>

            {/* Compact status strip */}
            <div className="grid grid-cols-5 gap-1.5 text-center">
              <StatusStripItem label="Mesaj" value={opportunityFocus.whatsappStatusLabel} />
              <StatusStripItem label="Cevap" value={opportunityFocus.replyIntentLabel} />
              <StatusStripItem label="Demo" value={opportunityFocus.demoStatusLabel} />
              <StatusStripItem label="Takip" value={opportunityFocus.followUpStatusLabel} />
              <StatusStripItem label="Sonuç" value={opportunityFocus.outcomeStatusLabel} />
            </div>

            {(opportunityFocus.primaryActionLabel || opportunityFocus.secondaryActionLabel) && (
              <div className="flex items-center gap-2 pt-0.5">
                {opportunityFocus.primaryActionLabel && focusMatchingDecisionItem && (
                  <button
                    type="button"
                    onClick={() => runOpportunityFocusPrimaryAction(focusMatchingDecisionItem)}
                    className={btnPrimaryCls}
                  >
                    {opportunityFocus.primaryActionLabel}
                  </button>
                )}
                {opportunityFocus.secondaryActionLabel && focusMatchingDecisionItem && (
                  <button
                    type="button"
                    onClick={() => runSecondaryDecisionAction(focusMatchingDecisionItem)}
                    className={btnCls}
                  >
                    {opportunityFocus.secondaryActionLabel}
                  </button>
                )}
              </div>
            )}

            {/* Compact timeline summary — max 5 latest meaningful events */}
            {opportunityFocus.timeline.length > 0 && (
              <div className="border-t border-white/[0.06] pt-2">
                <ul className="space-y-1">
                  {opportunityFocus.timeline.map((entry, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${OPPORTUNITY_TIMELINE_DOT_CLS[entry.tone]}`} />
                      <span className="flex-1 truncate text-[10px] text-zinc-400">{entry.label}</span>
                      <span className="shrink-0 text-[9px] text-zinc-600">{formatTime(entry.occurredAt ?? 0)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section 3 — Hermes Bugün (v8.6, Scope 7): numbers are secondary — compact rows instead of hero KPI tiles */}
      <div className="border-b border-white/[0.06] px-5 py-3">
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
          intake adapter's pool-level summary stays as supporting copy below it. */}
      <div className="border-b border-white/[0.06] px-5 py-3">
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

      {/* Section 5 — Gelir Nabzı: won / lost / estimated MRR */}
      <div className="border-b border-white/[0.06] px-5 py-3">
        <p className={`${sectionLabelCls} mb-2`}>Gelir Nabzı</p>
        {initialLoadDone && hasNoRevenueOutcomes ? (
          <p className="text-[11px] text-zinc-600">{FOUNDER_HOME_EMPTY_STATE_LABELS.revenuePulse}</p>
        ) : (
          <div className={kpiStripCls}>
            <SummaryTile label="Kazanıldı" value={summary.wonCount} accent="text-emerald-400" />
            <SummaryTile label="Kaybedildi" value={summary.lostCount} accent="text-rose-400" />
            <SummaryTile
              label="Tahmini MRR"
              value={summary.estimatedMrrTotal}
              accent="text-emerald-400"
              format={(v) => `₺${v.toLocaleString("tr-TR")}`}
            />
          </div>
        )}
      </div>

      {/* Section 6 — Hermes Aktivitesi: meaningful events, not technical logs */}
      <div className="px-5 py-3">
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

/** v8.3 — Opportunity Focus's compact status strip (Mesaj/Cevap/Demo/Takip/Sonuç). `null` renders a plain dash — never a technical placeholder. */
function StatusStripItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-lg bg-white/[0.02] px-1.5 py-2">
      <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-zinc-600">{label}</p>
      <p className="mt-0.5 truncate text-[9px] font-medium text-zinc-300">{value ?? "—"}</p>
    </div>
  );
}

