"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import type { V2Screen } from "@/app/components/v2/types";
import type { ScoredLead } from "@/app/lib/leads";
import V2Sidebar from "@/app/components/v2/layout/V2Sidebar";
import V2Header from "@/app/components/v2/layout/V2Header";
import V2KpiStrip from "@/app/components/v2/layout/V2KpiStrip";
import RevenueQueueScreen from "@/app/components/v2/screens/RevenueQueueScreen";
import RevenueQueueContextPanel from "@/app/components/v2/screens/RevenueQueueContextPanel";
import LeadListScreen from "@/app/components/v2/screens/LeadListScreen";
import LeadListContextPanel from "@/app/components/v2/screens/LeadListContextPanel";
import IcpAnalysisScreen from "@/app/components/v2/screens/IcpAnalysisScreen";
import IcpAnalysisContextPanel from "@/app/components/v2/screens/IcpAnalysisContextPanel";
import CommunicationIntelligenceScreen from "@/app/components/v2/screens/CommunicationIntelligenceScreen";
import CommunicationIntelligenceContextPanel from "@/app/components/v2/screens/CommunicationIntelligenceContextPanel";
import FollowUpsScreen from "@/app/components/v2/screens/FollowUpsScreen";
import FollowUpsContextPanel from "@/app/components/v2/screens/FollowUpsContextPanel";
import RevenuePipelineScreen from "@/app/components/v2/screens/RevenuePipelineScreen";
import RevenuePipelineContextPanel from "@/app/components/v2/screens/RevenuePipelineContextPanel";
import RevenueForecastScreen from "@/app/components/v2/screens/RevenueForecastScreen";
import RevenueForecastContextPanel from "@/app/components/v2/screens/RevenueForecastContextPanel";
import RevenueRiskScreen from "@/app/components/v2/screens/RevenueRiskScreen";
import RevenueRiskContextPanel from "@/app/components/v2/screens/RevenueRiskContextPanel";
import RevenueRecoveryScreen from "@/app/components/v2/screens/RevenueRecoveryScreen";
import RevenueRecoveryContextPanel from "@/app/components/v2/screens/RevenueRecoveryContextPanel";
import FounderCommandCenterScreen from "@/app/components/v2/screens/FounderCommandCenterScreen";
import FounderCommandCenterContextPanel from "@/app/components/v2/screens/FounderCommandCenterContextPanel";
import RevenueAnalyticsScreen from "@/app/components/v2/screens/RevenueAnalyticsScreen";
import RevenueAnalyticsContextPanel from "@/app/components/v2/screens/RevenueAnalyticsContextPanel";
import LeadImportScreen from "@/app/components/v2/screens/LeadImportScreen";
import LeadImportContextPanel from "@/app/components/v2/screens/LeadImportContextPanel";
import DataSourcesScreen, {
  type DataSourcesScreenState,
} from "@/app/components/v2/screens/DataSourcesScreen";
import DataSourcesContextPanel from "@/app/components/v2/screens/DataSourcesContextPanel";
import AutomationCenterScreen from "@/app/components/v2/screens/AutomationCenterScreen";
import AutomationCenterContextPanel from "@/app/components/v2/screens/AutomationCenterContextPanel";
import {
  adaptScoredLeadsToAutomationCards,
  computeAutomationSummary,
  type AutomationCard,
} from "@/app/components/v2/adapters/automation-center-adapter";
import { useLeadImport } from "@/app/components/v2/hooks/useLeadImport";
import { useV2LeadPool } from "@/app/components/v2/hooks/useV2LeadPool";
import {
  buildExecutionContexts,
  projectExecutionQueue,
  buildFounderCoachInsights,
} from "@/app/lib/execution-runtime";
import { buildHermesMonitor } from "@/app/lib/hermes-monitor";
import { buildHermesMissions, missionBucketOf } from "@/app/components/v2/adapters/hermes-mission-adapter";
import type { HermesMission } from "@/app/components/v2/adapters/hermes-mission-adapter";
import { canQueuePipeline, runHermesPipeline } from "@/app/components/v2/hermes-pipeline-engine";
import type { HermesPipeline } from "@/app/components/v2/hermes-pipeline-engine";
import {
  canCreateDraft,
  createOutreachDraft,
  applyDraftEdit,
  applyDraftApproval,
  applyDraftRejection,
} from "@/app/components/v2/hermes-courier";
import type { HermesOutboundDraft } from "@/app/components/v2/hermes-courier";
import { canDeliver, startDeliveryGateway } from "@/app/components/v2/hermes-delivery-gateway";
import type { HermesDeliveryRequest } from "@/app/components/v2/hermes-delivery-gateway";
import PlaceholderScreen, {
  PlaceholderContextPanel,
} from "@/app/components/v2/screens/PlaceholderScreen";
// Adapter functions — run client-side so imported leads are included
import { adaptV2Data } from "@/app/components/v2/adapters/revenue-queue-adapter";
import { adaptScoredLeadsToCards } from "@/app/components/v2/adapters/lead-list-adapter";
import { adaptScoredLeadsToIcpCards } from "@/app/components/v2/adapters/icp-analysis-adapter";
import { adaptScoredLeadsToCommCards } from "@/app/components/v2/adapters/communication-intelligence-adapter";
import { adaptScoredLeadsToFollowUpCards } from "@/app/components/v2/adapters/follow-ups-adapter";
import { adaptScoredLeadsToPipelineCards } from "@/app/components/v2/adapters/revenue-pipeline-adapter";
import { adaptScoredLeadsToForecastCards } from "@/app/components/v2/adapters/revenue-forecast-adapter";
import { adaptScoredLeadsToRiskCards } from "@/app/components/v2/adapters/revenue-risk-adapter";
import { adaptScoredLeadsToRecoveryCards } from "@/app/components/v2/adapters/revenue-recovery-adapter";
import { adaptScoredLeadsToAnalyticsCards } from "@/app/components/v2/adapters/revenue-analytics-adapter";
import type { LeadCard } from "@/app/components/v2/adapters/lead-list-adapter";
import type { IcpCard } from "@/app/components/v2/adapters/icp-analysis-adapter";
import type { CommCard } from "@/app/components/v2/adapters/communication-intelligence-adapter";
import type { FollowUpCard } from "@/app/components/v2/adapters/follow-ups-adapter";
import type { PipelineCard } from "@/app/components/v2/adapters/revenue-pipeline-adapter";
import type { ForecastCard } from "@/app/components/v2/adapters/revenue-forecast-adapter";
import type { RiskCard } from "@/app/components/v2/adapters/revenue-risk-adapter";
import type { RecoveryCard } from "@/app/components/v2/adapters/revenue-recovery-adapter";
import type { AnalyticsCard } from "@/app/components/v2/adapters/revenue-analytics-adapter";

export const SCREEN_META: Record<V2Screen, { title: string; subtitle: string }> = {
  "revenue-queue": {
    title: "Fırsat Kuyruğu",
    subtitle: "En yüksek gelir potansiyeline sahip fırsatlar sıralanır.",
  },
  "command-center": {
    title: "Günlük Operasyon Merkezi",
    subtitle: "Bugün odaklanman gereken işleri öncelik sırasına göre yönet.",
  },
  "lead-list": {
    title: "Lead Listesi",
    subtitle: "Tüm aktif leadlerin detaylı profil görünümü.",
  },
  "icp-analysis": {
    title: "ICP Analizi",
    subtitle: "İdeal müşteri profili skorlama ve segmentasyon.",
  },
  "communication-intelligence": {
    title: "İletişim Zekası",
    subtitle: "Kanal optimizasyonu ve iletişim analitiği.",
  },
  "follow-ups": {
    title: "Takip Edilecekler",
    subtitle: "Zamanı gelen takipler ve öncelikli aksiyon kuyruğu.",
  },
  "revenue-pipeline": {
    title: "Gelir Pipeline",
    subtitle: "Satış aşamaları ve dönüşüm takibi.",
  },
  "revenue-forecast": {
    title: "Gelir Tahmini",
    subtitle: "30–90 günlük gelir projeksiyonu ve senaryo analizi.",
  },
  "revenue-risk": {
    title: "Gelir Risk",
    subtitle: "Risk altındaki fırsatların tespiti ve erken uyarı.",
  },
  "revenue-recovery": {
    title: "Gelir Recovery",
    subtitle: "Kaybedilen fırsatların geri kazanım stratejileri.",
  },
  "revenue-analytics": {
    title: "Gelir Analizi",
    subtitle: "Derinlemesine gelir analitiği ve performans raporları.",
  },
  "lead-import": {
    title: "Lead Import",
    subtitle: "Google Maps'tan otel ve konaklama leadlerini içe aktarın.",
  },
  "data-sources": {
    title: "Veri Kaynakları",
    subtitle: "Entegrasyon sağlık durumu, sağlayıcı bağlantıları ve operasyonel hazırlık.",
  },
  "automation-center": {
    title: "Hermes Workspace",
    subtitle: "AI işgücü çalışıyor — Founder bugünün operasyonunu denetliyor.",
  },
};

const V2_ACTIVE_SCREEN_STORAGE_KEY = "tugobo-lead-engine:v2-active-screen";

function isV2Screen(value: string): value is V2Screen {
  return Object.prototype.hasOwnProperty.call(SCREEN_META, value);
}

/** Reads the persisted active screen, validated against the known V2 screen IDs. Client-only. */
function readStoredActiveScreen(): V2Screen | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(V2_ACTIVE_SCREEN_STORAGE_KEY);
    if (raw && isV2Screen(raw)) return raw;
  } catch {
    // storage unavailable (privacy mode, quota, etc.) — fall back to default
  }
  return null;
}

type Props = {
  scoredLeads: ScoredLead[];
};

export default function V2Shell({ scoredLeads }: Props) {
  // null means "not yet decided" — deliberately distinct from any real V2Screen
  // value (including "command-center") so nothing, sidebar highlight included,
  // can render a screen identity before the persisted value has actually been
  // read. null is a plain literal (no window access), so it's identical on the
  // server render and the client's first render — no hydration mismatch.
  const [activeScreen, setActiveScreen] = useState<V2Screen | null>(null);

  useEffect(() => {
    const stored = readStoredActiveScreen();
    setActiveScreen(stored ?? "command-center");
  }, []);

  useEffect(() => {
    if (activeScreen === null) return;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(V2_ACTIVE_SCREEN_STORAGE_KEY, activeScreen);
    } catch {
      // ignore quota/availability errors
    }
  }, [activeScreen]);

  const [selectedQueueRowId, setSelectedQueueRowId] = useState<string | null>(null);
  const [selectedLeadCard, setSelectedLeadCard] = useState<LeadCard | null>(null);
  const [selectedIcpCard, setSelectedIcpCard] = useState<IcpCard | null>(null);
  const [selectedCommCard, setSelectedCommCard] = useState<CommCard | null>(null);
  const [selectedFollowUpCard, setSelectedFollowUpCard] = useState<FollowUpCard | null>(null);
  const [selectedPipelineCard, setSelectedPipelineCard] = useState<PipelineCard | null>(null);
  const [selectedForecastCard, setSelectedForecastCard] = useState<ForecastCard | null>(null);
  const [selectedRiskCard, setSelectedRiskCard] = useState<RiskCard | null>(null);
  const [selectedRecoveryCard, setSelectedRecoveryCard] = useState<RecoveryCard | null>(null);
  const [selectedCommandCard, setSelectedCommandCard] = useState<RecoveryCard | null>(null);
  const [selectedAnalyticsCard, setSelectedAnalyticsCard] = useState<AnalyticsCard | null>(null);

  const [dataSourcesState, setDataSourcesState] =
    useState<DataSourcesScreenState | null>(null);
  const [selectedAutomationCard, setSelectedAutomationCard] =
    useState<AutomationCard | null>(null);

  // Hermes (A3/A3.5/A3.6): founder approval loop — pure UI state, deliberately
  // not persisted. Each decision records the founder's call and its moment
  // (the timestamp feeds the mission timeline); nothing is executed
  // either way (execution arrives in A4). A3.6 groups shadow tasks into
  // missions; the founder now selects/approves a mission, not a raw task.
  const [selectedHermesMission, setSelectedHermesMission] = useState<HermesMission | null>(null);
  const [hermesDecisions, setHermesDecisions] = useState<
    Record<string, { status: "approved" | "rejected"; at: number }>
  >({});
  const approveHermesTask = useCallback(
    (taskId: string) =>
      setHermesDecisions((p) => ({ ...p, [taskId]: { status: "approved", at: Date.now() } })),
    [],
  );
  const rejectHermesTask = useCallback(
    (taskId: string) =>
      setHermesDecisions((p) => ({ ...p, [taskId]: { status: "rejected", at: Date.now() } })),
    [],
  );

  // Hermes Pipeline (A5): session-only pipeline bookkeeping, keyed by
  // missionId — one founder click now drives all four stages autonomously.
  // Persistence beyond this session happens only through whatever a stage
  // itself already persists (e.g. scheduleFollowUpForLead's localStorage
  // write) — never a new ledger. The runner itself is defined below, once
  // `automationCards` (from `derived`) is in scope.
  const [hermesPipelines, setHermesPipelines] = useState<Record<string, HermesPipeline>>({});

  // Courier Draft Runtime (v4.1.0-A): session-only draft bookkeeping, keyed by
  // missionId — same convention as hermesPipelines. NOT a sending sprint: a
  // draft's "approved" status only means the founder signed off on the text,
  // it never triggers a fetch to any outbound channel.
  const [hermesDrafts, setHermesDrafts] = useState<Record<string, HermesOutboundDraft>>({});

  // Hermes Delivery Gateway (v4.2.0): session-only delivery bookkeeping, keyed
  // by missionId — same convention as hermesDrafts/hermesPipelines. Reaches
  // "ready" (Ready For Provider) and stops there — no fetch, no provider SDK,
  // no send, ever, in this module.
  const [hermesDeliveries, setHermesDeliveries] = useState<Record<string, HermesDeliveryRequest>>({});

  // Incremented by FollowUpsContextPanel after each mutation so followUpCards recomputes
  // from the latest localStorage state without requiring a full server re-fetch.
  const [followUpMutVersion, setFollowUpMutVersion] = useState(0);
  const onFollowUpMutation = useCallback(() => setFollowUpMutVersion((v) => v + 1), []);

  const leadImportState = useLeadImport();
  const allLeads = useV2LeadPool(scoredLeads, leadImportState.importedLeads);

  const scoredLeadsById = useMemo(
    () => new Map(allLeads.map((l) => [l.id, l])),
    [allLeads],
  );

  const derived = useMemo(() => {
    const { rows, kpi, ctx } = adaptV2Data(allLeads);
    const cards = adaptScoredLeadsToCards(allLeads);
    const icpCards = adaptScoredLeadsToIcpCards(allLeads);
    const commCards = adaptScoredLeadsToCommCards(allLeads);
    const pipelineCards = adaptScoredLeadsToPipelineCards(allLeads);
    const forecastCards = adaptScoredLeadsToForecastCards(allLeads);
    const riskCards = adaptScoredLeadsToRiskCards(allLeads);
    const recoveryCards = adaptScoredLeadsToRecoveryCards(allLeads);
    const analyticsCards = adaptScoredLeadsToAnalyticsCards(recoveryCards, commCards);
    const automationCards = adaptScoredLeadsToAutomationCards(allLeads);
    const automationSummary = computeAutomationSummary(automationCards);
    // Execution Runtime (M7.3): read-only projection over the same lead pool
    // used by every other Command Center card above — never a second source
    // of truth, never a mutation path.
    const executionContexts = buildExecutionContexts(allLeads);
    const executionQueue = projectExecutionQueue(executionContexts);
    // Founder Coach (M7.5): a further read-only projection over the same
    // contexts/queue — never rebuilds them, never a second runtime pass.
    const coachInsights = buildFounderCoachInsights(executionContexts, executionQueue);
    // Hermes Monitor (A3): shadow pass over the same contexts — proposes,
    // never executes. Approvals live in UI state only; execution is A4.
    const hermesMonitor = buildHermesMonitor(executionContexts);
    return { rows, kpi, ctx, cards, icpCards, commCards, pipelineCards, forecastCards, riskCards, recoveryCards, analyticsCards, automationCards, automationSummary, executionQueue, coachInsights, hermesMonitor };
  }, [allLeads]);

  const { rows, kpi, ctx, cards, icpCards, commCards, pipelineCards, forecastCards, riskCards, recoveryCards, analyticsCards, automationCards, automationSummary, executionQueue, coachInsights, hermesMonitor } = derived;

  // Hermes Missions (A3.6): groups the monitor's shadow tasks by lead. Recomputed
  // whenever founder decisions change (unlike hermesMonitor, which only depends
  // on the lead pool) so approving/rejecting immediately reflows mission buckets.
  const hermesMissions = useMemo(
    () => buildHermesMissions(hermesMonitor, hermesDecisions),
    [hermesMonitor, hermesDecisions],
  );

  // Hermes Pipeline (A5): the mission's leadId is the join key back to the
  // same AutomationCard (website/phone/instagram/scoredLead/doNotContact)
  // the existing manual Contact Finder / Re-Enrich buttons already use —
  // reusing those fields, not re-deriving them.
  const automationCardsByLeadId = useMemo(
    () => new Map(automationCards.map((c) => [c.id, c])),
    [automationCards],
  );

  // Courier Draft Runtime (v4.1.0-A): channel resolution reuses Communication
  // Intelligence's own verified/likely channel signals — same join key
  // (leadId) as automationCardsByLeadId, no new signal source.
  const commCardsByLeadId = useMemo(
    () => new Map(commCards.map((c) => [c.id, c])),
    [commCards],
  );

  // Fired once, right when a mission's pipeline reaches "completed" — the
  // spec's exact trigger point ("mission pipeline completes safe internal
  // steps successfully"). Uses functional setState so it never needs
  // hermesDrafts in its own deps and can't race with a manual create.
  const maybeCreateDraftForMission = useCallback(
    (mission: HermesMission, card: AutomationCard) => {
      setHermesDrafts((prev) => {
        if (prev[mission.missionId]) return prev;
        const guard = canCreateDraft(mission, card, false);
        if (!guard.ok) return prev;
        const comm = commCardsByLeadId.get(mission.leadId);
        const draft = createOutreachDraft(mission, card, comm, "pipeline-complete");
        return { ...prev, [mission.missionId]: draft };
      });
    },
    [commCardsByLeadId],
  );

  // The one place a mission's pipeline is actually started and progressively
  // recorded. `onProgress` fires after every stage transition inside
  // runHermesPipeline, so the UI updates live rather than only at the end.
  const startHermesPipeline = useCallback(
    async (mission: HermesMission) => {
      const card = automationCardsByLeadId.get(mission.leadId);
      const guard = canQueuePipeline(mission, card, hermesPipelines[mission.missionId]);
      if (!guard.ok || !card) return;

      await runHermesPipeline(mission, card, (pipeline) => {
        setHermesPipelines((prev) => ({ ...prev, [mission.missionId]: pipeline }));
        if (pipeline.state === "completed") {
          maybeCreateDraftForMission(mission, card);
        }
      });
    },
    [hermesPipelines, automationCardsByLeadId, maybeCreateDraftForMission],
  );

  // Founder-triggered manual draft creation (Decision Center) — the one path
  // that may bypass the low-confidence gate (`forced = true`). DNC / closed /
  // no-evidence remain absolute and are never bypassed.
  const createDraftManually = useCallback(
    (mission: HermesMission) => {
      const card = automationCardsByLeadId.get(mission.leadId);
      const guard = canCreateDraft(mission, card, true);
      if (!guard.ok || !card) return;
      const comm = commCardsByLeadId.get(mission.leadId);
      const draft = createOutreachDraft(mission, card, comm, "founder-manual");
      setHermesDrafts((prev) => ({ ...prev, [mission.missionId]: draft }));
    },
    [automationCardsByLeadId, commCardsByLeadId],
  );

  const editHermesDraft = useCallback((missionId: string, newBody: string) => {
    setHermesDrafts((prev) => {
      const d = prev[missionId];
      if (!d) return prev;
      return { ...prev, [missionId]: applyDraftEdit(d, newBody) };
    });
  }, []);

  // "Approval becomes delivery trigger" (v4.2.0) — the same convention A5
  // established for missions: approving a draft both records the founder's
  // decision and, in the same click, runs it through the Delivery Gateway.
  // Two sequential setState calls (not nested) — same shape as
  // startHermesPipeline's onProgress callback above.
  const approveHermesDraft = useCallback(
    (missionId: string) => {
      const draft = hermesDrafts[missionId];
      if (!draft) return;
      const approvedDraft = applyDraftApproval(draft);
      setHermesDrafts((prev) => ({ ...prev, [missionId]: approvedDraft }));

      const card = automationCardsByLeadId.get(approvedDraft.leadId);
      setHermesDeliveries((prev) => {
        const guard = canDeliver(approvedDraft, card, prev[missionId]);
        if (!guard.allowed) return prev;
        return { ...prev, [missionId]: startDeliveryGateway(approvedDraft, card!) };
      });
    },
    [hermesDrafts, automationCardsByLeadId],
  );

  const rejectHermesDraft = useCallback((missionId: string) => {
    setHermesDrafts((prev) => {
      const d = prev[missionId];
      if (!d) return prev;
      return { ...prev, [missionId]: applyDraftRejection(d) };
    });
  }, []);

  // "Approval becomes execution trigger" (A5): approving a gated mission
  // both records the founder's decision and starts its pipeline in the same
  // click — no separate "Hermes Çalıştır" step remains for those missions.
  // The mission passed to startHermesPipeline is a shallow clone with
  // decisionState overridden to "approved", since the snapshot from this
  // render still reads "pending" and hermesMissions won't recompute until
  // the next render.
  const approveAndStartPipeline = useCallback(
    (mission: HermesMission) => {
      approveHermesTask(mission.primaryTaskId);
      void startHermesPipeline({ ...mission, decisionState: "approved" });
    },
    [approveHermesTask, startHermesPipeline],
  );

  // followUpMergedLeads is computed separately so it can react to local mutations immediately.
  // On each onFollowUpMutation() call, followUpMutVersion increments → this memo reruns →
  // it reads the freshest localStorage state and merges mutation fields into allLeads.
  const followUpMergedLeads = useMemo(() => {
    let stateMap: Record<string, Record<string, unknown>> = {};
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("tugobo-lead-engine:state-v1");
        if (raw) stateMap = JSON.parse(raw) as typeof stateMap;
      } catch {
        // ignore
      }
    }
    return allLeads.map((lead) => {
      const mut = stateMap[lead.id];
      // Only apply when the user has actually taken an action in V2 (updatedAt is set)
      if (!mut || typeof mut.updatedAt !== "number") return lead;
      const patch: Record<string, unknown> = {};
      // Timestamps: merge only when explicitly set to a positive value
      if (typeof mut.lastContactedAt === "number" && mut.lastContactedAt > 0) {
        patch.lastContactedAt = mut.lastContactedAt;
      }
      if (typeof mut.nextFollowUpAt === "number" && mut.nextFollowUpAt > 0) {
        patch.nextFollowUpAt = mut.nextFollowUpAt;
      }
      // contactAttempts: only ever increase — never let a mutation decrease the count
      if (
        typeof mut.contactAttempts === "number" &&
        mut.contactAttempts > ((lead.contactAttempts as number | undefined) ?? 0)
      ) {
        patch.contactAttempts = mut.contactAttempts;
      }
      // doNotContact: merge directly (Lead type already has this field)
      if (typeof mut.doNotContact === "boolean") {
        patch.doNotContact = mut.doNotContact;
      }
      // pipelineStage: merge when set to a non-null string
      if (typeof mut.pipelineStage === "string") {
        patch.pipelineStage = mut.pipelineStage;
      }
      // status: merge the workflow status mirror (e.g. "needs_follow_up" from Yanıt Yok)
      if (typeof mut.status === "string") {
        patch.status = mut.status;
      }
      // updatedAt: mirror the last local mutation timestamp
      if (typeof mut.updatedAt === "number") {
        patch.updatedAt = mut.updatedAt;
      }
      return Object.keys(patch).length > 0
        ? ({ ...lead, ...patch } as typeof lead)
        : lead;
    });
  }, [allLeads, followUpMutVersion]);

  const followUpCards = useMemo(
    () => adaptScoredLeadsToFollowUpCards(followUpMergedLeads),
    [followUpMergedLeads],
  );

  // Always read the up-to-date version of the selected card from the freshly-computed
  // followUpCards pool. This ensures the context panel sees post-mutation fields
  // (contactAttempts, nextFollowUpLabel, doNotContact, etc.) without requiring the user
  // to re-click. If a mutation just pushed the card out of the filtered pool (DNC, or
  // auto-DNC on the 3rd contact attempt), fall back to adapting it directly from the
  // merged (unfiltered) lead pool so the detail panel — and its Undo button — don't
  // disappear out from under the user. The list itself keeps filtering DNC leads as before.
  const effectiveSelectedFollowUpCard = useMemo(() => {
    if (!selectedFollowUpCard) return null;
    const inList = followUpCards.find((c) => c.id === selectedFollowUpCard.id);
    if (inList) return inList;
    const stillExists = followUpMergedLeads.find((l) => l.id === selectedFollowUpCard.id);
    if (!stillExists) return null;
    return (
      adaptScoredLeadsToFollowUpCards([stillExists], { includeDoNotContact: true })[0] ?? null
    );
  }, [selectedFollowUpCard, followUpCards, followUpMergedLeads]);

  const selectedQueueLead = selectedQueueRowId
    ? (scoredLeadsById.get(selectedQueueRowId) ?? null)
    : null;

  // The context panel shows either a Hermes Mission Decision Center or a
  // lead detail — never both. Selecting one side clears the other.
  const handleSelectHermesMission = useCallback((mission: HermesMission) => {
    setSelectedHermesMission(mission);
    setSelectedAutomationCard(null);
  }, []);
  const handleSelectAutomationCard = useCallback((card: AutomationCard) => {
    setSelectedAutomationCard(card);
    setSelectedHermesMission(null);
  }, []);

  function handleNavigate(screen: V2Screen) {
    setActiveScreen(screen);
    setSelectedQueueRowId(null);
    setSelectedLeadCard(null);
    setSelectedIcpCard(null);
    setSelectedCommCard(null);
    setSelectedFollowUpCard(null);
    setSelectedPipelineCard(null);
    setSelectedForecastCard(null);
    setSelectedRiskCard(null);
    setSelectedRecoveryCard(null);
    setSelectedCommandCard(null);
    setSelectedAnalyticsCard(null);
    setSelectedAutomationCard(null);
    setSelectedHermesMission(null);
  }

  // Used by the Founder Command Center's "Kişiyi Doğrula" / "AI Yeniden
  // Analiz Et" actions to jump to the existing screen that owns that action
  // while keeping the same lead selected there. Calls handleNavigate for the
  // full reset it already does, then — in the same synchronous call, so
  // React batches both updates — re-selects the matching card on the target
  // screen. No new selection model, no persistence, no runtime change.
  function handleNavigateToLead(screen: V2Screen, leadId: string) {
    handleNavigate(screen);
    if (screen === "communication-intelligence") {
      const card = commCards.find((c) => c.id === leadId);
      if (card) setSelectedCommCard(card);
    } else if (screen === "automation-center") {
      const card = automationCards.find((c) => c.id === leadId);
      if (card) setSelectedAutomationCard(card);
    }
  }

  // Until the persisted screen has been read from localStorage (or defaulted on
  // the client), activeScreen is null and nothing screen-specific is rendered —
  // not the content pane, not the sidebar's active highlight. This is what
  // actually prevents "Günlük Operasyon" from ever being visible before the
  // real screen: no component below this point ever sees "command-center" as
  // a stand-in value while we're still waiting to find out the real answer.
  // The branch is identical on the server render and the client's first render
  // (activeScreen is null in both), so there is no hydration mismatch.
  if (activeScreen === null) {
    return (
      <div className="flex h-screen items-center justify-center overflow-hidden">
        <p className="text-xs text-zinc-600">Yükleniyor…</p>
      </div>
    );
  }

  const meta = SCREEN_META[activeScreen];
  const isQueue = activeScreen === "revenue-queue";
  const isLeadList = activeScreen === "lead-list";
  const isIcpAnalysis = activeScreen === "icp-analysis";
  const isCommIntelligence = activeScreen === "communication-intelligence";
  const isFollowUps = activeScreen === "follow-ups";
  const isPipeline = activeScreen === "revenue-pipeline";
  const isForecast = activeScreen === "revenue-forecast";
  const isRisk = activeScreen === "revenue-risk";
  const isRecovery = activeScreen === "revenue-recovery";
  const isCommand = activeScreen === "command-center";
  const isAnalytics = activeScreen === "revenue-analytics";
  const isLeadImport = activeScreen === "lead-import";
  const isDataSources = activeScreen === "data-sources";
  const isAutomationCenter = activeScreen === "automation-center";

  return (
    <div className="flex h-screen overflow-hidden">
      <V2Sidebar
        activeScreen={activeScreen}
        onNavigate={handleNavigate}
        counts={{
          "revenue-queue": rows.length,
          "follow-ups": followUpCards.length,
          "automation-center":
            hermesMissions.filter((m) => missionBucketOf(m) === "approval").length +
            Object.values(hermesDeliveries).filter((d) => d.status === "ready").length,
        }}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <V2Header title={meta.title} subtitle={meta.subtitle} />
        {isQueue && <V2KpiStrip kpi={kpi} onNavigate={handleNavigate} />}
        <div className="flex flex-1 gap-3 overflow-hidden p-3">
          {isQueue ? (
            <>
              <RevenueQueueScreen
                rows={rows}
                kpi={kpi}
                selectedRowId={selectedQueueRowId}
                onSelectRow={setSelectedQueueRowId}
              />
              <RevenueQueueContextPanel
                selectedLead={selectedQueueLead}
                kpi={kpi}
                ctx={ctx}
              />
            </>
          ) : isLeadList ? (
            <>
              <LeadListScreen
                cards={cards}
                selectedId={selectedLeadCard?.id ?? null}
                onSelect={setSelectedLeadCard}
              />
              <LeadListContextPanel
                selectedCard={selectedLeadCard}
                selectedScoredLead={selectedLeadCard ? (scoredLeadsById.get(selectedLeadCard.id) ?? null) : null}
                allCards={cards}
              />
            </>
          ) : isIcpAnalysis ? (
            <>
              <IcpAnalysisScreen
                cards={icpCards}
                selectedId={selectedIcpCard?.id ?? null}
                onSelect={setSelectedIcpCard}
              />
              <IcpAnalysisContextPanel
                selectedCard={selectedIcpCard}
                allCards={icpCards}
              />
            </>
          ) : isCommIntelligence ? (
            <>
              <CommunicationIntelligenceScreen
                cards={commCards}
                selectedId={selectedCommCard?.id ?? null}
                onSelect={setSelectedCommCard}
              />
              <CommunicationIntelligenceContextPanel
                selectedCard={selectedCommCard}
                allCards={commCards}
                selectedScoredLead={
                  selectedCommCard ? (scoredLeadsById.get(selectedCommCard.id) ?? null) : null
                }
              />
            </>
          ) : isFollowUps ? (
            <>
              <FollowUpsScreen
                cards={followUpCards}
                selectedId={effectiveSelectedFollowUpCard?.id ?? null}
                onSelect={setSelectedFollowUpCard}
              />
              <FollowUpsContextPanel
                selectedCard={effectiveSelectedFollowUpCard}
                allCards={followUpCards}
                onMutation={onFollowUpMutation}
              />
            </>
          ) : isPipeline ? (
            <>
              <RevenuePipelineScreen
                cards={pipelineCards}
                selectedId={selectedPipelineCard?.id ?? null}
                onSelect={setSelectedPipelineCard}
              />
              <RevenuePipelineContextPanel
                selectedCard={selectedPipelineCard}
                allCards={pipelineCards}
              />
            </>
          ) : isForecast ? (
            <>
              <RevenueForecastScreen
                cards={forecastCards}
                selectedId={selectedForecastCard?.id ?? null}
                onSelect={setSelectedForecastCard}
              />
              <RevenueForecastContextPanel
                selectedCard={selectedForecastCard}
                allCards={forecastCards}
              />
            </>
          ) : isRisk ? (
            <>
              <RevenueRiskScreen
                cards={riskCards}
                selectedId={selectedRiskCard?.id ?? null}
                onSelect={setSelectedRiskCard}
              />
              <RevenueRiskContextPanel
                selectedCard={selectedRiskCard}
                allCards={riskCards}
              />
            </>
          ) : isRecovery ? (
            <>
              <RevenueRecoveryScreen
                cards={recoveryCards}
                selectedId={selectedRecoveryCard?.id ?? null}
                onSelect={setSelectedRecoveryCard}
              />
              <RevenueRecoveryContextPanel
                selectedCard={selectedRecoveryCard}
                allCards={recoveryCards}
              />
            </>
          ) : isCommand ? (
            <>
              <FounderCommandCenterScreen
                executionQueue={executionQueue}
                coachInsights={coachInsights}
                recoveryCards={recoveryCards}
                pipelineCards={pipelineCards}
                selectedId={selectedCommandCard?.id ?? null}
                onSelect={setSelectedCommandCard}
                onNavigate={handleNavigate}
              />
              <FounderCommandCenterContextPanel
                selectedCard={selectedCommandCard}
                recoveryCards={recoveryCards}
                pipelineCards={pipelineCards}
                commCards={commCards}
                executionQueue={executionQueue}
                onNavigateToLead={handleNavigateToLead}
              />
            </>
          ) : isAnalytics ? (
            <>
              <RevenueAnalyticsScreen
                analyticsCards={analyticsCards}
                pipelineCards={pipelineCards}
                selectedId={selectedAnalyticsCard?.id ?? null}
                onSelect={setSelectedAnalyticsCard}
              />
              <RevenueAnalyticsContextPanel
                selectedCard={selectedAnalyticsCard}
                analyticsCards={analyticsCards}
                pipelineCards={pipelineCards}
              />
            </>
          ) : isLeadImport ? (
            <>
              <LeadImportScreen importState={leadImportState} />
              <LeadImportContextPanel importState={leadImportState} />
            </>
          ) : isDataSources ? (
            <>
              <DataSourcesScreen onStateChange={setDataSourcesState} />
              <DataSourcesContextPanel screenState={dataSourcesState} />
            </>
          ) : isAutomationCenter ? (
            <>
              <AutomationCenterScreen
                leads={allLeads}
                selectedId={selectedAutomationCard?.id ?? null}
                onSelect={handleSelectAutomationCard}
                monitor={hermesMonitor}
                missions={hermesMissions}
                selectedHermesMissionId={selectedHermesMission?.missionId ?? null}
                onSelectHermesMission={handleSelectHermesMission}
                hermesDecisions={hermesDecisions}
                onApproveMission={approveAndStartPipeline}
                onRejectTask={rejectHermesTask}
                hermesPipelines={hermesPipelines}
                onStartPipeline={startHermesPipeline}
                hermesDrafts={hermesDrafts}
                onApproveDraft={approveHermesDraft}
                onRejectDraft={rejectHermesDraft}
                hermesDeliveries={hermesDeliveries}
              />
              <AutomationCenterContextPanel
                selectedCard={selectedAutomationCard}
                summary={automationSummary}
                hermesSummary={hermesMonitor.summary}
                missionCount={hermesMissions.length}
                selectedHermesMission={selectedHermesMission}
                selectedHermesMomentum={
                  selectedHermesMission
                    ? (executionQueue.find((i) => i.leadId === selectedHermesMission.leadId)
                        ?.operationalMomentum ?? null)
                    : null
                }
                onApproveMission={approveAndStartPipeline}
                onRejectTask={rejectHermesTask}
                pipeline={
                  selectedHermesMission ? (hermesPipelines[selectedHermesMission.missionId] ?? null) : null
                }
                onStartPipeline={startHermesPipeline}
                draft={
                  selectedHermesMission ? (hermesDrafts[selectedHermesMission.missionId] ?? null) : null
                }
                manualDraftGuard={
                  selectedHermesMission
                    ? canCreateDraft(selectedHermesMission, automationCardsByLeadId.get(selectedHermesMission.leadId), true)
                    : { ok: false, reason: "" }
                }
                onCreateDraft={() => selectedHermesMission && createDraftManually(selectedHermesMission)}
                onEditDraft={editHermesDraft}
                onApproveDraft={approveHermesDraft}
                onRejectDraft={rejectHermesDraft}
                delivery={
                  selectedHermesMission ? (hermesDeliveries[selectedHermesMission.missionId] ?? null) : null
                }
                deliveryGuard={
                  selectedHermesMission
                    ? canDeliver(
                        hermesDrafts[selectedHermesMission.missionId],
                        automationCardsByLeadId.get(selectedHermesMission.leadId),
                        hermesDeliveries[selectedHermesMission.missionId],
                      )
                    : { allowed: false, reason: "" }
                }
              />
            </>
          ) : (
            <>
              <PlaceholderScreen
                screen={
                  activeScreen as Exclude<
                    V2Screen,
                    | "revenue-queue"
                    | "lead-list"
                    | "icp-analysis"
                    | "communication-intelligence"
                    | "follow-ups"
                    | "revenue-pipeline"
                    | "revenue-forecast"
                    | "revenue-risk"
                    | "revenue-recovery"
                    | "command-center"
                    | "revenue-analytics"
                    | "lead-import"
                    | "data-sources"
                    | "automation-center"
                  >
                }
              />
              <PlaceholderContextPanel
                screen={
                  activeScreen as Exclude<
                    V2Screen,
                    | "revenue-queue"
                    | "lead-list"
                    | "icp-analysis"
                    | "communication-intelligence"
                    | "follow-ups"
                    | "revenue-pipeline"
                    | "revenue-forecast"
                    | "revenue-risk"
                    | "revenue-recovery"
                    | "command-center"
                    | "revenue-analytics"
                    | "lead-import"
                    | "data-sources"
                    | "automation-center"
                  >
                }
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
