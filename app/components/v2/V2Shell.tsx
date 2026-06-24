"use client";

import { useState } from "react";
import type { V2Screen } from "@/app/components/v2/types";
import V2Sidebar from "@/app/components/v2/layout/V2Sidebar";
import V2Header from "@/app/components/v2/layout/V2Header";
import V2KpiStrip from "@/app/components/v2/layout/V2KpiStrip";
import V2ContextPanel from "@/app/components/v2/layout/V2ContextPanel";
import RevenueQueueScreen from "@/app/components/v2/screens/RevenueQueueScreen";
import PlaceholderScreen, {
  PlaceholderContextPanel,
} from "@/app/components/v2/screens/PlaceholderScreen";
import type { QueueRow, MockKpi, MockContext } from "@/app/components/v2/mock/mock-queue";

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
};

export default function V2Shell({ rows, kpi, ctx }: Props) {
  const [activeScreen, setActiveScreen] = useState<V2Screen>("revenue-queue");

  const meta = SCREEN_META[activeScreen];
  const isQueue = activeScreen === "revenue-queue";

  return (
    <div className="flex h-screen overflow-hidden">
      <V2Sidebar activeScreen={activeScreen} onNavigate={setActiveScreen} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <V2Header title={meta.title} subtitle={meta.subtitle} />
        {isQueue && <V2KpiStrip kpi={kpi} />}
        <div className="flex flex-1 gap-4 overflow-hidden p-4">
          {isQueue ? (
            <>
              <RevenueQueueScreen rows={rows} kpi={kpi} />
              <V2ContextPanel kpi={kpi} ctx={ctx} />
            </>
          ) : (
            <>
              <PlaceholderScreen
                screen={activeScreen as Exclude<V2Screen, "revenue-queue">}
              />
              <PlaceholderContextPanel
                screen={activeScreen as Exclude<V2Screen, "revenue-queue">}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
