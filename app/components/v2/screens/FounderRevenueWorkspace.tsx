"use client";

import { useEffect, useState } from "react";
import type { ScoredLead } from "@/app/lib/leads";
import type { HermesMission } from "@/app/components/v2/adapters/hermes-mission-adapter";
import {
  computeActionQueue,
  computeHermesHealth,
  computeHermesTimeline,
  computeMissionFocus,
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
import type { ProcessedWhatsAppDeliveryReceipt } from "@/app/lib/whatsapp-delivery-receipt-processor";
import type { WhatsAppReadinessStatus } from "@/app/lib/whatsapp-provider-runtime";
import type { StoredWhatsAppReply } from "@/app/lib/whatsapp-reply-registry";
import type { ReplyIntelligenceItem } from "@/app/lib/reply-intelligence-runtime";
import type { DemoScheduleItem } from "@/app/lib/demo-scheduling-runtime";
import type { FollowUpCandidate } from "@/app/lib/follow-up-runtime";
import type { SalesOutcomeItem } from "@/app/lib/sales-outcome-runtime";
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
};

const KARAR_KUYRUGU_ANCHOR_ID = "hermes-home-karar-kuyrugu";

/** v8.2 — Decision Queue cards are styled by priority, not by the underlying (now-hidden) runtime stage. */
const DECISION_PRIORITY_BADGE_CLS: Record<HermesDecisionPriority, string> = {
  critical: "bg-rose-500/[0.10] text-rose-400 ring-rose-500/20",
  high: "bg-amber-500/[0.10] text-amber-400 ring-amber-500/20",
  medium: "bg-cyan-500/[0.10] text-cyan-400 ring-cyan-500/20",
  low: "bg-white/[0.04] text-zinc-500 ring-white/[0.06]",
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
}: Props) {
  const [recentReceipts, setRecentReceipts] = useState<ProcessedWhatsAppDeliveryReceipt[]>([]);
  const [receiptsReachable, setReceiptsReachable] = useState<boolean | null>(null);
  const [whatsappReadinessStatus, setWhatsappReadinessStatus] = useState<WhatsAppReadinessStatus | null>(null);
  const [recentReplies, setRecentReplies] = useState<StoredWhatsAppReply[]>([]);
  const [recentIntelligence, setRecentIntelligence] = useState<ReplyIntelligenceItem[]>([]);
  const [recentDemoItems, setRecentDemoItems] = useState<DemoScheduleItem[]>([]);
  const [recentFollowUps, setRecentFollowUps] = useState<FollowUpCandidate[]>([]);
  const [recentSalesOutcomes, setRecentSalesOutcomes] = useState<SalesOutcomeItem[]>([]);

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
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/hermes/providers/whatsapp/replies");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { replies?: StoredWhatsAppReply[] };
        if (!cancelled) setRecentReplies(data.replies ?? []);
      } catch {
        // leave empty — "Cevap Geldi" summary reports 0 rather than guessing
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/hermes/reply-intelligence");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { items?: ReplyIntelligenceItem[] };
        if (!cancelled) setRecentIntelligence(data.items ?? []);
      } catch {
        // leave empty — "Sıcak Cevap" summary reports 0 rather than guessing
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/hermes/demo-scheduling");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { items?: DemoScheduleItem[] };
        if (!cancelled) setRecentDemoItems(data.items ?? []);
      } catch {
        // leave empty — "Demo Bekleyen" summary reports 0 rather than guessing
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/hermes/follow-ups");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { items?: FollowUpCandidate[] };
        if (!cancelled) setRecentFollowUps(data.items ?? []);
      } catch {
        // leave empty — "Takip Gerekli" summary reports 0 rather than guessing
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/hermes/sales-outcomes");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { items?: SalesOutcomeItem[] };
        if (!cancelled) setRecentSalesOutcomes(data.items ?? []);
      } catch {
        // leave empty — "Kazanıldı"/"Kaybedildi"/"Outcome Bekliyor" summaries report 0 rather than guessing
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/hermes/providers/whatsapp/status");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { readinessStatus?: WhatsAppReadinessStatus };
        if (!cancelled && data.readinessStatus) setWhatsappReadinessStatus(data.readinessStatus);
      } catch {
        // leave null — health card reports "Bilinmiyor" rather than guessing
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const selectedMission = missions.find((m) => m.missionId === selectedHermesMissionId) ?? null;
  const focus = selectedMission
    ? computeMissionFocus(
        selectedMission,
        recentReceipts,
        recentReplies,
        recentIntelligence,
        recentDemoItems,
        recentFollowUps,
        recentSalesOutcomes,
      )
    : null;

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

  return (
    <div>
      {/* Section 1 — Hermes Bugün: what Hermes did + whether it's healthy */}
      <div className="border-b border-white/[0.06] px-5 py-3">
        <p className={`${sectionLabelCls} mb-2`}>Hermes Bugün</p>
        <div className={kpiStripCls}>
          <SummaryTile label="Aktif Mission" value={summary.totalActiveMissions} />
          <SummaryTile label="Onay Bekleyen" value={summary.founderApprovalPending} accent="text-amber-400" />
          <SummaryTile label="Sıcak Cevap" value={summary.hotReplyCount} accent="text-orange-400" />
          <SummaryTile label="Demo Bekleyen" value={summary.demoPendingCount} accent="text-teal-400" />
          <SummaryTile label="Takip Gerekli" value={summary.followUpRequiredCount} accent="text-cyan-400" />
          <SummaryTile label="Outcome Bekliyor" value={summary.outcomeRequiredCount} accent="text-purple-400" />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <HealthTile label="Hermes" value={health.hermesLabel} />
          <HealthTile label="WhatsApp" value={health.whatsappLabel} />
          <HealthTile label="Webhook" value={health.webhookLabel} />
          <HealthTile label="Teslimat" value={health.deliveryLabel} />
          <HealthTile label="Runtime" value={health.runtimeLabel} />
        </div>
      </div>

      {/* Section 2 — Hermes Lead Intake: what Hermes's intake side has done, operational summary only (v8.1) */}
      <div className="border-b border-white/[0.06] px-5 py-3">
        <p className={`${sectionLabelCls} mb-2`}>Hermes Lead Intake</p>
        <p className="mb-2.5 text-[11px] leading-relaxed text-zinc-400">{intake.founderSummary}</p>
        <div className={kpiStripCls}>
          <SummaryTile label="Değerlendirilen İşletme" value={intake.evaluatedLeadCount} />
          <SummaryTile label="Yeni Fırsat" value={intake.newOpportunityCount} accent="text-emerald-400" />
          <SummaryTile label="Aktif Mission" value={intake.activeMissionCount} />
          <SummaryTile label="Onay Bekleyen" value={intake.approvalRequiredCount} accent="text-amber-400" />
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-white/[0.02] px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-600">Son Tarama</p>
            <p className="mt-0.5 text-[11px] text-zinc-300">{formatTime(intake.lastImportAt ?? 0)}</p>
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

      {/* Section 3 — Karar Merkezi (v8.2): only single-touch founder decisions, never a status list */}
      <div id={KARAR_KUYRUGU_ANCHOR_ID} className="border-b border-white/[0.06] px-5 py-3">
        <p className={sectionLabelCls}>Karar Merkezi</p>
        <p className="mb-2.5 mt-0.5 text-[11px] text-zinc-500">Hermes işi yürütür; sen yalnızca karar verirsin.</p>
        {decisionItems.length === 0 ? (
          <p className="text-[11px] text-zinc-600">
            Şu anda senden karar bekleyen bir satış görevi yok. Hermes çalışmaya devam ediyor.
          </p>
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

      {/* Section 4 — Fırsat Odağı: the selected item's full context */}
      <div className="border-b border-white/[0.06] px-5 py-3">
        <p className={`${sectionLabelCls} mb-2`}>Fırsat Odağı</p>
        {!focus ? (
          <p className="text-[11px] text-zinc-600">İncelemek için Karar Merkezi&apos;nden bir fırsat seçin.</p>
        ) : (
          <div className="space-y-1.5 rounded-lg bg-white/[0.02] px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-zinc-500">Otel</span>
              <span className="text-[11px] font-semibold text-zinc-200">{focus.hotelName}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-zinc-500">Mevcut Mission</span>
              <span className="text-[10px] text-zinc-300">{focus.currentMissionLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-zinc-500">Aşama</span>
              <span className="text-[10px] text-zinc-300">{focus.currentStageLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-zinc-500">WhatsApp Durumu</span>
              <span className="text-[10px] text-zinc-300">{focus.whatsappStatusLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-zinc-500">Teslimat Durumu</span>
              <span className="text-[10px] text-zinc-300">{focus.deliveryStateLabel}</span>
            </div>
            {focus.latestReceiptLabel && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-zinc-500">Son Makbuz</span>
                <span className="text-[10px] text-zinc-300">{focus.latestReceiptLabel}</span>
              </div>
            )}
            {focus.demoStatusLabel && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-zinc-500">Demo Durumu</span>
                <span className="text-[10px] text-teal-300">{focus.demoStatusLabel}</span>
              </div>
            )}
            {focus.demoScheduledAtLabel && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-zinc-500">Planlanan Zaman</span>
                <span className="text-[10px] text-zinc-300">{focus.demoScheduledAtLabel}</span>
              </div>
            )}
            {focus.demoSuggestedAction && (
              <p className="text-[10px] font-medium text-teal-300">{focus.demoSuggestedAction}</p>
            )}
            {focus.followUpStatusLabel && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-zinc-500">Takip Durumu</span>
                <span className="text-[10px] text-cyan-300">{focus.followUpStatusLabel}</span>
              </div>
            )}
            {focus.followUpReasonLabel && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-zinc-500">Takip Nedeni</span>
                <span className="text-[10px] text-zinc-300">{focus.followUpReasonLabel}</span>
              </div>
            )}
            {focus.followUpSuggestedTiming && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-zinc-500">Önerilen Zaman</span>
                <span className="text-[10px] text-zinc-300">{focus.followUpSuggestedTiming}</span>
              </div>
            )}
            {focus.followUpSuggestedAction && (
              <p className="text-[10px] font-medium text-cyan-300">{focus.followUpSuggestedAction}</p>
            )}
            {focus.outcomeStatusLabel && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-zinc-500">Satış Sonucu</span>
                <span className="text-[10px] text-purple-300">{focus.outcomeStatusLabel}</span>
              </div>
            )}
            {focus.outcomePackageLabel && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-zinc-500">Paket</span>
                <span className="text-[10px] text-zinc-300">{focus.outcomePackageLabel}</span>
              </div>
            )}
            {focus.outcomeEstimatedMrrLabel && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-zinc-500">Tahmini MRR</span>
                <span className="text-[10px] text-zinc-300">{focus.outcomeEstimatedMrrLabel}</span>
              </div>
            )}
            {focus.outcomeEstimatedArrLabel && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-zinc-500">Tahmini ARR</span>
                <span className="text-[10px] text-zinc-300">{focus.outcomeEstimatedArrLabel}</span>
              </div>
            )}
            {focus.outcomeLostReasonLabel && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-zinc-500">Kayıp Nedeni</span>
                <span className="text-[10px] text-zinc-300">{focus.outcomeLostReasonLabel}</span>
              </div>
            )}
            {focus.outcomeSuggestedAction && (
              <p className="text-[10px] font-medium text-purple-300">{focus.outcomeSuggestedAction}</p>
            )}
            <p className="border-t border-white/[0.06] pt-2 text-[10px] font-medium text-indigo-300">
              {focus.suggestedNextAction}
            </p>
          </div>
        )}
      </div>

      {/* Section 5 — Gelir Nabzı: won / lost / estimated MRR */}
      <div className="border-b border-white/[0.06] px-5 py-3">
        <p className={`${sectionLabelCls} mb-2`}>Gelir Nabzı</p>
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
      </div>

      {/* Section 6 — Hermes Aktivitesi: meaningful events, not technical logs */}
      <div className="px-5 py-3">
        <p className={`${sectionLabelCls} mb-2`}>Hermes Aktivitesi</p>
        {timeline.length === 0 ? (
          <p className="text-[11px] text-zinc-600">Henüz kayıtlı bir aktivite yok.</p>
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

