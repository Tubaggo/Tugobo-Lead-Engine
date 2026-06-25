"use client";

import { useState } from "react";
import type { PipelineCard } from "@/app/components/v2/adapters/revenue-pipeline-adapter";
import {
  computeAnalyticsSummary,
  sortAnalyticsCards,
  formatMrr,
  formatPct,
  type AnalyticsCard,
  type AnalyticsFilter,
  type AnalyticsSortKey,
  type FunnelStage,
  type AnalyticsInsight,
} from "@/app/components/v2/adapters/revenue-analytics-adapter";

type Props = {
  analyticsCards: AnalyticsCard[];
  pipelineCards: PipelineCard[];
  selectedId: string | null;
  onSelect: (card: AnalyticsCard) => void;
};

const FILTERS: { key: AnalyticsFilter; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "high-opportunity", label: "Yüksek Fırsat" },
  { key: "strong-icp", label: "Güçlü ICP" },
  { key: "high-risk", label: "Yüksek Risk" },
  { key: "high-recovery", label: "Kurtarma" },
  { key: "multi-channel", label: "Çok Kanallı" },
];

const SORTS: { key: AnalyticsSortKey; label: string }[] = [
  { key: "opportunity-value", label: "Fırsat Değeri" },
  { key: "icp-score", label: "ICP Skoru" },
  { key: "risk-revenue", label: "Risk" },
  { key: "recovery-revenue", label: "Kurtarma" },
  { key: "comm-score", label: "İletişim" },
];

const FILTER_BORDER: Record<AnalyticsFilter, string> = {
  all: "border-l-zinc-600",
  "high-opportunity": "border-l-indigo-600",
  "strong-icp": "border-l-violet-600",
  "high-risk": "border-l-rose-600",
  "high-recovery": "border-l-emerald-600",
  "multi-channel": "border-l-sky-600",
};

const ACCENT_COLOR: Record<AnalyticsInsight["accent"], string> = {
  indigo: "text-indigo-400",
  emerald: "text-emerald-400",
  rose: "text-rose-400",
  amber: "text-amber-400",
  sky: "text-sky-400",
  violet: "text-violet-400",
};

export default function RevenueAnalyticsScreen({
  analyticsCards,
  pipelineCards,
  selectedId,
  onSelect,
}: Props) {
  const [filter, setFilter] = useState<AnalyticsFilter>("all");
  const [sort, setSort] = useState<AnalyticsSortKey>("opportunity-value");
  const [search, setSearch] = useState("");

  const summary = computeAnalyticsSummary(analyticsCards, pipelineCards);

  const q = search.toLowerCase().trim();

  // Apply filter
  const filtered = analyticsCards.filter((c) => {
    const matchSearch = !q || c.hotelName.toLowerCase().includes(q) || c.city.toLowerCase().includes(q);
    if (!matchSearch) return false;
    switch (filter) {
      case "all": return true;
      case "high-opportunity": return c.isHighOpportunity;
      case "strong-icp": return c.isStrongIcp;
      case "high-risk": return c.isHighRisk;
      case "high-recovery": return c.isHighRecovery;
      case "multi-channel": return c.isMultiChannelReady;
    }
  });

  const sorted = sortAnalyticsCards(filtered, sort);
  const borderClass = FILTER_BORDER[filter];

  const maxForecast = Math.max(...summary.citySegments.map((c) => c.totalForecastRevenue), 1);
  const totalPipelineLeads = pipelineCards.length || 1;

  return (
    <div className="flex flex-1 flex-col overflow-hidden min-w-0">

      {/* KPI Strip */}
      <div className="flex-shrink-0 grid grid-cols-4 gap-3 px-4 py-3 border-b border-white/[0.06]">
        <KpiCell
          label="Toplam Fırsat Değeri"
          value={formatMrr(summary.totalOpportunityValue)}
          sub={`${summary.totalLeads} lead`}
          colorClass="text-indigo-400"
          bgClass="bg-indigo-950/30 border-indigo-900/40"
        />
        <KpiCell
          label="Ort. Fırsat Skoru"
          value={formatPct(summary.avgOpportunityScore)}
          sub={`${summary.qualifiedLeads} nitelikli`}
          colorClass="text-violet-400"
          bgClass="bg-violet-950/30 border-violet-900/40"
        />
        <KpiCell
          label="ICP Uyum Oranı"
          value={formatPct(summary.icpFitRate)}
          sub={`${summary.highIcpLeads} yüksek ICP`}
          colorClass={summary.icpFitRate >= 50 ? "text-emerald-400" : "text-amber-400"}
          bgClass="bg-zinc-800/60 border-zinc-700/40"
        />
        <KpiCell
          label="Kurtarma Verimliliği"
          value={formatPct(summary.recoveryEfficiency)}
          sub={formatMrr(summary.recoverableRevenue)}
          colorClass="text-emerald-400"
          bgClass="bg-emerald-950/30 border-emerald-900/40"
        />
      </div>

      {/* Filter + Sort + Search */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-1.5 px-4 py-2.5 border-b border-white/[0.06]">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              filter === f.key
                ? "bg-indigo-500/20 text-indigo-300 ring-1 ring-inset ring-indigo-500/30"
                : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300"
            }`}
          >
            {f.label}
          </button>
        ))}
        <div className="flex items-center gap-1.5 ml-auto">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as AnalyticsSortKey)}
            className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 text-[11px] text-zinc-400 outline-none hover:bg-white/[0.06] hover:text-zinc-200 focus:ring-1 focus:ring-indigo-500/40 transition-colors duration-150 cursor-pointer"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>↕ {s.label}</option>
            ))}
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Otel veya şehir ara…"
            className="h-9 w-48 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-[11px] text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-indigo-500/40 focus:bg-white/[0.06] transition-colors duration-150"
          />
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">

        {/* Performance Overview */}
        <div className="space-y-2">
          <SectionLabel label="Performans Özeti" />
          <div className="grid grid-cols-3 gap-2">
            <StatCell label="Aktif Lead" value={`${summary.totalLeads}`} sub={`${summary.qualifiedLeads} nitelikli`} />
            <StatCell label="Yüksek ICP" value={`${summary.highIcpLeads}`} sub={`%${summary.icpFitRate} uyum`} />
            <StatCell label="Çok Kanallı" value={`${summary.highCommLeads}`} sub="≥2 kanal hazır" />
            <StatCell label="Tahmini Gelir" value={formatMrr(summary.forecastRevenue)} sub="pipeline toplamı" valueClass="text-indigo-400" />
            <StatCell label="Riskli Gelir" value={formatMrr(summary.riskRevenue)} sub={`%${summary.riskSharePct} risk payı`} valueClass="text-rose-400" />
            <StatCell label="Kurtarılabilir" value={formatMrr(summary.recoverableRevenue)} sub={`%${summary.recoveryEfficiency} verimlilik`} valueClass="text-emerald-400" />
          </div>
        </div>

        {/* Funnel Health */}
        {summary.funnelStages.length > 0 && (
          <div className="space-y-2">
            <SectionLabel label="Funnel Sağlığı" />
            <FunnelFlow stages={summary.funnelStages} totalLeads={totalPipelineLeads} />
          </div>
        )}

        {/* Segment Analysis */}
        {summary.citySegments.length > 0 && (
          <div className="space-y-2">
            <SectionLabel label="Şehir Segmenti" />
            <div className="rounded-lg bg-zinc-800/40 border border-zinc-700/30 overflow-hidden">
              {summary.citySegments.map((seg, i) => (
                <div
                  key={seg.city}
                  className={`flex items-center gap-3 px-3 py-2 ${i < summary.citySegments.length - 1 ? "border-b border-zinc-700/30" : ""}`}
                >
                  <span className="text-xs text-zinc-300 w-24 truncate flex-shrink-0">{seg.city}</span>
                  <div className="flex-1 bg-zinc-700/40 rounded-full h-1.5">
                    <div
                      className="bg-indigo-500/60 h-1.5 rounded-full"
                      style={{ width: `${Math.round((seg.totalForecastRevenue / maxForecast) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-zinc-500 flex-shrink-0 w-10 text-right">{seg.count} lead</span>
                  <span className="text-xs font-medium text-indigo-400 flex-shrink-0 w-14 text-right">
                    {formatMrr(seg.totalForecastRevenue)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Revenue Quality */}
        <div className="space-y-2">
          <SectionLabel label="Gelir Kalitesi" />
          <div className="rounded-lg bg-zinc-800/40 border border-zinc-700/30 overflow-hidden">
            <RevenueBar label="Tahmini Gelir" value={summary.forecastRevenue} max={summary.forecastRevenue} colorClass="bg-indigo-500/70" textClass="text-indigo-400" />
            <RevenueBar label="Risk Altında" value={summary.riskRevenue} max={summary.forecastRevenue} colorClass="bg-rose-500/70" textClass="text-rose-400" />
            <RevenueBar label="Kurtarılabilir" value={summary.recoverableRevenue} max={summary.forecastRevenue} colorClass="bg-emerald-500/70" textClass="text-emerald-400" isLast />
          </div>
        </div>

        {/* Top Insights */}
        {summary.topInsights.length > 0 && (
          <div className="space-y-2">
            <SectionLabel label="Temel İçgörüler" />
            <div className="space-y-2">
              {summary.topInsights.map((insight, i) => (
                <div key={i} className="flex items-start gap-2.5 px-1">
                  <span className={`text-xs font-bold flex-shrink-0 mt-0.5 ${ACCENT_COLOR[insight.accent]}`}>
                    {i + 1}
                  </span>
                  <p className="text-xs text-zinc-400 leading-relaxed">{insight.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lead List */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <SectionLabel label="Lead Listesi" />
            <span className="text-[10px] font-semibold text-zinc-500">{sorted.length}</span>
          </div>
          {sorted.length === 0 ? (
            <p className="text-xs text-zinc-600 py-2 px-1">Filtreyle eşleşen lead bulunamadı.</p>
          ) : (
            <div className="space-y-1">
              {sorted.map((card) => {
                const isSelected = card.id === selectedId;
                return (
                  <button
                    key={card.id}
                    onClick={() => onSelect(card)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border-l-2 transition-colors text-left ${
                      isSelected
                        ? "bg-zinc-700/70 border-l-indigo-400"
                        : `bg-zinc-800/40 hover:bg-zinc-800/70 ${borderClass}`
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-100 truncate">{card.hotelName}</p>
                      <p className="text-xs text-zinc-500 truncate">{card.city}</p>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-2">
                      <span className="text-[10px] text-zinc-500 hidden sm:block">{card.stage}</span>
                      <span className="text-[10px] font-medium text-zinc-400">
                        %{card.opportunityScore}
                      </span>
                      <span className="text-[10px] text-zinc-500">
                        ICP %{card.icpScore}
                      </span>
                      <span className="text-xs font-medium text-indigo-400">
                        {formatMrr(card.forecastContribution)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ── sub-components ────────────────────────────────────────────

function KpiCell({
  label,
  value,
  sub,
  colorClass,
  bgClass,
}: {
  label: string;
  value: string;
  sub: string;
  colorClass: string;
  bgClass: string;
}) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${bgClass}`}>
      <p className="text-[10px] text-zinc-500 uppercase tracking-[0.12em]">{label}</p>
      <p className={`text-lg font-semibold mt-0.5 ${colorClass}`}>{value}</p>
      <p className="text-[10px] text-zinc-600 mt-0.5">{sub}</p>
    </div>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-zinc-500">{label}</p>
  );
}

function StatCell({
  label,
  value,
  sub,
  valueClass = "text-zinc-200",
}: {
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/30 px-3 py-2">
      <p className="text-[10px] text-zinc-500">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 ${valueClass}`}>{value}</p>
      <p className="text-[10px] text-zinc-600 mt-0.5">{sub}</p>
    </div>
  );
}

function FunnelFlow({ stages, totalLeads }: { stages: FunnelStage[]; totalLeads: number }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {stages.map((stage, i) => (
        <div key={stage.stage} className="flex items-center gap-1">
          <div className="flex flex-col items-center px-2.5 py-1.5 rounded-lg bg-zinc-800/60 border border-zinc-700/40 min-w-[56px]">
            <span className="text-[10px] text-zinc-500">{stage.shortLabel}</span>
            <span className="text-sm font-semibold text-zinc-200">{stage.count}</span>
          </div>
          {i < stages.length - 1 && (
            <span className="text-zinc-700 text-xs">→</span>
          )}
        </div>
      ))}
      <span className="text-[10px] text-zinc-600 ml-2">toplam {totalLeads}</span>
    </div>
  );
}

function RevenueBar({
  label,
  value,
  max,
  colorClass,
  textClass,
  isLast = false,
}: {
  label: string;
  value: number;
  max: number;
  colorClass: string;
  textClass: string;
  isLast?: boolean;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className={`flex items-center gap-3 px-3 py-2 ${isLast ? "" : "border-b border-zinc-700/30"}`}>
      <span className="text-xs text-zinc-400 w-28 flex-shrink-0">{label}</span>
      <div className="flex-1 bg-zinc-700/40 rounded-full h-1.5">
        <div className={`${colorClass} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-medium flex-shrink-0 w-14 text-right ${textClass}`}>
        {formatMrr(value)}
      </span>
      <span className="text-[10px] text-zinc-600 flex-shrink-0 w-8 text-right">{pct}%</span>
    </div>
  );
}
