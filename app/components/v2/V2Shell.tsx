"use client";

import { useState } from "react";
import type { V2Screen } from "@/app/components/v2/types";
import V2Sidebar from "@/app/components/v2/layout/V2Sidebar";
import V2Header from "@/app/components/v2/layout/V2Header";
import V2KpiStrip from "@/app/components/v2/layout/V2KpiStrip";
import V2ContextPanel from "@/app/components/v2/layout/V2ContextPanel";
import RevenueQueueScreen from "@/app/components/v2/screens/RevenueQueueScreen";
import LeadListScreen from "@/app/components/v2/screens/LeadListScreen";
import LeadListContextPanel from "@/app/components/v2/screens/LeadListContextPanel";
import IcpAnalysisScreen from "@/app/components/v2/screens/IcpAnalysisScreen";
import IcpAnalysisContextPanel from "@/app/components/v2/screens/IcpAnalysisContextPanel";
import CommunicationIntelligenceScreen from "@/app/components/v2/screens/CommunicationIntelligenceScreen";
import CommunicationIntelligenceContextPanel from "@/app/components/v2/screens/CommunicationIntelligenceContextPanel";
import FollowUpsScreen from "@/app/components/v2/screens/FollowUpsScreen";
import FollowUpsContextPanel from "@/app/components/v2/screens/FollowUpsContextPanel";
import PlaceholderScreen, {
  PlaceholderContextPanel,
} from "@/app/components/v2/screens/PlaceholderScreen";
import type { QueueRow, MockKpi, MockContext } from "@/app/components/v2/mock/mock-queue";
import type { LeadCard } from "@/app/components/v2/adapters/lead-list-adapter";
import type { IcpCard } from "@/app/components/v2/adapters/icp-analysis-adapter";
import type { CommCard } from "@/app/components/v2/adapters/communication-intelligence-adapter";
import type { FollowUpCard } from "@/app/components/v2/adapters/follow-ups-adapter";

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
  cards: LeadCard[];
  icpCards: IcpCard[];
  commCards: CommCard[];
  followUpCards: FollowUpCard[];
};

export default function V2Shell({ rows, kpi, ctx, cards, icpCards, commCards, followUpCards }: Props) {
  const [activeScreen, setActiveScreen] = useState<V2Screen>("revenue-queue");
  const [selectedLeadCard, setSelectedLeadCard] = useState<LeadCard | null>(null);
  const [selectedIcpCard, setSelectedIcpCard] = useState<IcpCard | null>(null);
  const [selectedCommCard, setSelectedCommCard] = useState<CommCard | null>(null);
  const [selectedFollowUpCard, setSelectedFollowUpCard] = useState<FollowUpCard | null>(null);

  function handleNavigate(screen: V2Screen) {
    setActiveScreen(screen);
    setSelectedLeadCard(null);
    setSelectedIcpCard(null);
    setSelectedCommCard(null);
    setSelectedFollowUpCard(null);
  }

  const meta = SCREEN_META[activeScreen];
  const isQueue = activeScreen === "revenue-queue";
  const isLeadList = activeScreen === "lead-list";
  const isIcpAnalysis = activeScreen === "icp-analysis";
  const isCommIntelligence = activeScreen === "communication-intelligence";
  const isFollowUps = activeScreen === "follow-ups";

  return (
    <div className="flex h-screen overflow-hidden">
      <V2Sidebar activeScreen={activeScreen} onNavigate={handleNavigate} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <V2Header title={meta.title} subtitle={meta.subtitle} />
        {isQueue && <V2KpiStrip kpi={kpi} />}
        <div className="flex flex-1 gap-4 overflow-hidden p-4">
          {isQueue ? (
            <>
              <RevenueQueueScreen rows={rows} kpi={kpi} />
              <V2ContextPanel kpi={kpi} ctx={ctx} />
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
