"use client";

import { useState, useMemo } from "react";
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
import PlaceholderScreen, {
  PlaceholderContextPanel,
} from "@/app/components/v2/screens/PlaceholderScreen";
import type { QueueRow, MockKpi, MockContext } from "@/app/components/v2/mock/mock-queue";
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
};

type Props = {
  rows: QueueRow[];
  kpi: MockKpi;
  ctx: MockContext;
  scoredLeads: ScoredLead[];
  cards: LeadCard[];
  icpCards: IcpCard[];
  commCards: CommCard[];
  followUpCards: FollowUpCard[];
  pipelineCards: PipelineCard[];
  forecastCards: ForecastCard[];
  riskCards: RiskCard[];
  recoveryCards: RecoveryCard[];
  analyticsCards: AnalyticsCard[];
};

export default function V2Shell({ rows, kpi, ctx, scoredLeads, cards, icpCards, commCards, followUpCards, pipelineCards, forecastCards, riskCards, recoveryCards, analyticsCards }: Props) {
  const [activeScreen, setActiveScreen] = useState<V2Screen>("revenue-queue");
  const [selectedQueueRowId, setSelectedQueueRowId] = useState<string | null>(null);
  const [selectedLeadCard, setSelectedLeadCard] = useState<LeadCard | null>(null);

  const scoredLeadsById = useMemo(
    () => new Map(scoredLeads.map((l) => [l.id, l])),
    [scoredLeads],
  );
  const selectedQueueLead = selectedQueueRowId
    ? (scoredLeadsById.get(selectedQueueRowId) ?? null)
    : null;
  const [selectedIcpCard, setSelectedIcpCard] = useState<IcpCard | null>(null);
  const [selectedCommCard, setSelectedCommCard] = useState<CommCard | null>(null);
  const [selectedFollowUpCard, setSelectedFollowUpCard] = useState<FollowUpCard | null>(null);
  const [selectedPipelineCard, setSelectedPipelineCard] = useState<PipelineCard | null>(null);
  const [selectedForecastCard, setSelectedForecastCard] = useState<ForecastCard | null>(null);
  const [selectedRiskCard, setSelectedRiskCard] = useState<RiskCard | null>(null);
  const [selectedRecoveryCard, setSelectedRecoveryCard] = useState<RecoveryCard | null>(null);
  const [selectedCommandCard, setSelectedCommandCard] = useState<RecoveryCard | null>(null);
  const [selectedAnalyticsCard, setSelectedAnalyticsCard] = useState<AnalyticsCard | null>(null);

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
                selectedId={selectedFollowUpCard?.id ?? null}
                onSelect={setSelectedFollowUpCard}
              />
              <FollowUpsContextPanel
                selectedCard={selectedFollowUpCard}
                allCards={followUpCards}
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
