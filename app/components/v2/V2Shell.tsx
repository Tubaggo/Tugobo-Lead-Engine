"use client";

import { useState, useMemo, useCallback } from "react";
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
    title: "Komuta Merkezi",
    subtitle: "Tüm satış operasyonlarınızı tek ekrandan yönetin.",
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

type Props = {
  scoredLeads: ScoredLead[];
};

export default function V2Shell({ scoredLeads }: Props) {
  const [activeScreen, setActiveScreen] = useState<V2Screen>("revenue-queue");
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
    return { rows, kpi, ctx, cards, icpCards, commCards, pipelineCards, forecastCards, riskCards, recoveryCards, analyticsCards, automationCards, automationSummary };
  }, [allLeads]);

  const { rows, kpi, ctx, cards, icpCards, commCards, pipelineCards, forecastCards, riskCards, recoveryCards, analyticsCards, automationCards, automationSummary } = derived;

  // followUpCards is computed separately so it can react to local mutations immediately.
  // On each onFollowUpMutation() call, followUpMutVersion increments → this memo reruns →
  // it reads the freshest localStorage state and merges mutation fields into allLeads before adapting.
  const followUpCards = useMemo(() => {
    let stateMap: Record<string, Record<string, unknown>> = {};
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("tugobo-lead-engine:state-v1");
        if (raw) stateMap = JSON.parse(raw) as typeof stateMap;
      } catch {
        // ignore
      }
    }
    const merged = allLeads.map((lead) => {
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
      return Object.keys(patch).length > 0
        ? ({ ...lead, ...patch } as typeof lead)
        : lead;
    });
    return adaptScoredLeadsToFollowUpCards(merged);
  }, [allLeads, followUpMutVersion]);

  // Always read the up-to-date version of the selected card from the freshly-computed
  // followUpCards pool. This ensures the context panel sees post-mutation fields
  // (contactAttempts, nextFollowUpLabel, doNotContact, etc.) without requiring the user
  // to re-click. Falls back to null when the card has been removed (e.g. DNC filter).
  const effectiveSelectedFollowUpCard = useMemo(
    () =>
      selectedFollowUpCard
        ? (followUpCards.find((c) => c.id === selectedFollowUpCard.id) ?? null)
        : null,
    [selectedFollowUpCard, followUpCards],
  );

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
