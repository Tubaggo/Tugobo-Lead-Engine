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
    title: "Otomasyonlar",
    subtitle: "Re-enrich, contact finder, AI review, follow-up ve outreach kuyrukları.",
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
    return { rows, kpi, ctx, cards, icpCards, commCards, pipelineCards, forecastCards, riskCards, recoveryCards, analyticsCards, automationCards, automationSummary, executionQueue, coachInsights };
  }, [allLeads]);

  const { rows, kpi, ctx, cards, icpCards, commCards, pipelineCards, forecastCards, riskCards, recoveryCards, analyticsCards, automationCards, automationSummary, executionQueue, coachInsights } = derived;

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
                onSelect={setSelectedAutomationCard}
              />
              <AutomationCenterContextPanel
                selectedCard={selectedAutomationCard}
                summary={automationSummary}
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
