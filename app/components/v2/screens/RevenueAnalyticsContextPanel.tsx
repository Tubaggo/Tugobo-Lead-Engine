import type { PipelineCard } from "@/app/components/v2/adapters/revenue-pipeline-adapter";
import { STAGE_META } from "@/app/components/v2/adapters/revenue-pipeline-adapter";
import {
  computeAnalyticsSummary,
  formatMrr,
  formatPct,
  type AnalyticsCard,
  type AnalyticsInsight,
} from "@/app/components/v2/adapters/revenue-analytics-adapter";

type Props = {
  selectedCard: AnalyticsCard | null;
  analyticsCards: AnalyticsCard[];
  pipelineCards: PipelineCard[];
};

export default function RevenueAnalyticsContextPanel({
  selectedCard,
  analyticsCards,
  pipelineCards,
}: Props) {
  if (selectedCard) {
    return <LeadDetail card={selectedCard} />;
  }
  return <AnalyticsSummaryPanel analyticsCards={analyticsCards} pipelineCards={pipelineCards} />;
}

// ── Analytics Summary (no selection) ─────────────────────────

function AnalyticsSummaryPanel({
  analyticsCards,
  pipelineCards,
}: {
  analyticsCards: AnalyticsCard[];
  pipelineCards: PipelineCard[];
}) {
  const summary = computeAnalyticsSummary(analyticsCards, pipelineCards);

  return (
    <div className="w-[360px] flex-shrink-0 flex flex-col overflow-hidden border-l border-zinc-800">
      <div className="flex-shrink-0 px-4 py-3 border-b border-zinc-800">
        <p className="text-xs font-semibold text-zinc-300">Analytics Özeti</p>
        <p className="text-[10px] text-zinc-600 mt-0.5">Tüm pipeline performansı</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

        {/* KPI Grid */}
        <div className="space-y-1.5">
          <PanelLabel label="Temel Metrikler" />
          <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/30 divide-y divide-zinc-700/30">
            <Row label="Toplam Fırsat Değeri" value={formatMrr(summary.totalOpportunityValue)} valueClass="text-indigo-400" />
            <Row label="Ort. Fırsat Skoru" value={formatPct(summary.avgOpportunityScore)} valueClass="text-violet-400" />
            <Row label="ICP Uyum Oranı" value={formatPct(summary.icpFitRate)} valueClass={summary.icpFitRate >= 50 ? "text-emerald-400" : "text-amber-400"} />
            <Row label="Kurtarma Verimliliği" value={formatPct(summary.recoveryEfficiency)} valueClass="text-emerald-400" />
          </div>
        </div>

        {/* Strongest Segment */}
        {summary.citySegments[0] && (
          <div className="space-y-1.5">
            <PanelLabel label="En Güçlü Segment" />
            <div className="rounded-lg bg-indigo-950/30 border border-indigo-900/30 px-3 py-2.5 space-y-1">
              <p className="text-sm font-semibold text-indigo-300">{summary.citySegments[0].city}</p>
              <div className="flex items-center gap-4 mt-1">
                <div>
                  <p className="text-[10px] text-zinc-500">Lead</p>
                  <p className="text-xs font-medium text-zinc-300">{summary.citySegments[0].count}</p>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-500">Tahmini Gelir</p>
                  <p className="text-xs font-medium text-indigo-400">{formatMrr(summary.citySegments[0].totalForecastRevenue)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-500">Ort. Skor</p>
                  <p className="text-xs font-medium text-zinc-300">{formatPct(summary.citySegments[0].avgOpportunityScore)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tier Segments */}
        {summary.tierSegments.length > 0 && (
          <div className="space-y-1.5">
            <PanelLabel label="Paket Dağılımı" />
            <div className="rounded-lg bg-zinc-800/40 border border-zinc-700/30 overflow-hidden">
              {summary.tierSegments.map((seg, i) => (
                <div
                  key={seg.tier}
                  className={`flex items-center gap-3 px-3 py-2 ${i < summary.tierSegments.length - 1 ? "border-b border-zinc-700/30" : ""}`}
                >
                  <span className="text-xs text-zinc-400 flex-1">{seg.tier}</span>
                  <span className="text-[10px] text-zinc-500">{seg.count} lead</span>
                  <span className="text-xs font-medium text-indigo-400">{formatMrr(seg.totalForecastRevenue)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Biggest Bottleneck */}
        <div className="space-y-1.5">
          <PanelLabel label="Pipeline Darboğazı" />
          <div className="rounded-lg bg-amber-950/30 border border-amber-900/30 px-3 py-2.5">
            <p className="text-xs text-amber-300">{summary.bottleneckLabel}</p>
          </div>
        </div>

        {/* Best Channel */}
        {summary.bestChannel !== "—" && (
          <div className="space-y-1.5">
            <PanelLabel label="En İyi İletişim Kanalı" />
            <div className="rounded-lg bg-sky-950/30 border border-sky-900/30 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-sky-300">{summary.bestChannel}</p>
                <span className="text-xs text-zinc-400">{summary.bestChannelCount} fırsat</span>
              </div>
            </div>
          </div>
        )}

        {/* Top Insights */}
        {summary.topInsights.length > 0 && (
          <div className="space-y-1.5">
            <PanelLabel label="Temel İçgörüler" />
            <div className="space-y-2">
              {summary.topInsights.slice(0, 4).map((insight, i) => (
                <InsightLine key={i} index={i + 1} insight={insight} />
              ))}
            </div>
          </div>
        )}

        {/* Improvement Focus */}
        <div className="space-y-1.5">
          <PanelLabel label="İyileştirme Odağı" />
          <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/30 px-3 py-2.5">
            <p className="text-xs text-zinc-300 leading-relaxed">{summary.improvementFocus}</p>
          </div>
        </div>

        <div className="pt-2 border-t border-zinc-800">
          <p className="text-[10px] text-zinc-700 text-center">
            ↑ Bir lead seçin — detaylı analitik profil açılır
          </p>
        </div>

      </div>
    </div>
  );
}

// ── Lead Detail (selected) ────────────────────────────────────

function LeadDetail({ card }: { card: AnalyticsCard }) {
  const stageMeta = STAGE_META[card.stage];

  return (
    <div className="w-[360px] flex-shrink-0 flex flex-col overflow-hidden border-l border-zinc-800">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-zinc-800">
        <p className="text-xs font-semibold text-zinc-100 truncate">{card.hotelName}</p>
        <p className="text-[10px] text-zinc-500 mt-0.5">{card.hotelType} · {card.city}</p>
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <Badge label={stageMeta.label} colorClass="bg-indigo-900/50 text-indigo-400" />
          <Badge label={card.packageTier} colorClass="bg-zinc-800 text-zinc-400" />
          <Badge label={PRIORITY_LABEL[card.priority] ?? card.priority} colorClass={PRIORITY_BADGE[card.priority] ?? "bg-zinc-800 text-zinc-400"} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* Opportunity Profile */}
        <Section label="Fırsat Profili">
          <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/30 divide-y divide-zinc-700/30">
            <Row label="Fırsat Skoru" value={formatPct(card.opportunityScore)} valueClass={scoreColor(card.opportunityScore)} />
            <Row label="ICP Skoru" value={formatPct(card.icpScore)} valueClass={scoreColor(card.icpScore)} />
            <Row label="İletişim Skoru" value={formatPct(card.commScore)} valueClass={scoreColor(card.commScore)} />
            <Row label="En İyi Kanal" value={card.bestChannel} valueClass="text-sky-400" />
          </div>
        </Section>

        {/* Revenue Impact */}
        <Section label="Gelir Etkisi">
          <div className="rounded-lg bg-indigo-950/30 border border-indigo-900/30 divide-y divide-indigo-900/20">
            <Row label="Tahmini Gelir" value={formatMrr(card.forecastContribution)} valueClass="text-indigo-400" />
            <Row label="Baz MRR" value={formatMrr(card.baseMrr)} valueClass="text-zinc-300" />
            <Row label="Aşama Olasılığı" value={formatPct(Math.round(card.stageProbability * 100))} valueClass="text-zinc-400" />
          </div>
        </Section>

        {/* Related Risks */}
        <Section label="Risk Analizi">
          <div className={`rounded-lg border divide-y ${RISK_CARD[card.riskLevel]}`}>
            <Row label="Risk Skoru" value={`${card.riskScore}/100`} valueClass="text-rose-400" />
            <Row label="Risk Seviyesi" value={card.riskLevelLabel} valueClass="text-rose-400" />
            <Row label="Riskli Gelir" value={formatMrr(card.riskRevenue)} valueClass="text-rose-400" />
          </div>
        </Section>

        {/* Recovery Opportunity */}
        <Section label="Kurtarma Potansiyeli">
          <div className={`rounded-lg border divide-y ${RECOVERY_CARD[card.recoveryLevel]}`}>
            <Row label="Kurtarma Skoru" value={`${card.recoveryScore}/100`} valueClass="text-emerald-400" />
            <Row label="Kurtarma Seviyesi" value={card.recoveryLevelLabel} valueClass="text-emerald-400" />
            <Row label="Kurtarılabilir Gelir" value={formatMrr(card.recoveryRevenue)} valueClass="text-emerald-400" />
          </div>
          {card.recoveryReason && (
            <p className="text-xs text-zinc-500 mt-1.5">▲ {card.recoveryReason}</p>
          )}
        </Section>

        {/* Why this matters */}
        {card.opportunityReasons.length > 0 && (
          <Section label="Fırsat Sinyalleri">
            <div className="flex flex-wrap gap-1.5">
              {card.opportunityReasons.slice(0, 4).map((r, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full bg-indigo-900/40 text-indigo-400 text-[10px]">
                  {r}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* AI Insight */}
        {card.aiInsight && (
          <Section label="AI İçgörü">
            <div className="rounded-lg bg-indigo-950/30 border border-indigo-900/30 px-3 py-2.5">
              <p className="text-xs text-zinc-400 leading-relaxed">{card.aiInsight}</p>
            </div>
          </Section>
        )}

        {/* Recommended Next Action */}
        <Section label="Önerilen Aksiyon">
          <div className="rounded-lg bg-amber-950/30 border border-amber-900/30 px-3 py-3 space-y-2">
            <p className="text-xs font-semibold text-amber-300">{card.actionLabel}</p>
            {card.outreachAngle && (
              <p className="text-xs text-zinc-400 leading-relaxed">{card.outreachAngle}</p>
            )}
            {card.recoveryAction && (
              <p className="text-[10px] text-zinc-600 leading-relaxed border-t border-amber-900/20 pt-2 mt-1">
                {card.recoveryAction}
              </p>
            )}
          </div>
        </Section>

      </div>
    </div>
  );
}

// ── shared sub-components ─────────────────────────────────────

function PanelLabel({ label }: { label: string }) {
  return (
    <p className="text-[10px] uppercase tracking-widest font-semibold text-zinc-500">{label}</p>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <PanelLabel label={label} />
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className={`text-xs font-medium ${valueClass}`}>{value}</span>
    </div>
  );
}

function Badge({ label, colorClass }: { label: string; colorClass: string }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colorClass}`}>{label}</span>
  );
}

function InsightLine({ index, insight }: { index: number; insight: AnalyticsInsight }) {
  const colorMap: Record<AnalyticsInsight["accent"], string> = {
    indigo: "text-indigo-400",
    emerald: "text-emerald-400",
    rose: "text-rose-400",
    amber: "text-amber-400",
    sky: "text-sky-400",
    violet: "text-violet-400",
  };
  return (
    <div className="flex items-start gap-2">
      <span className={`text-xs font-bold flex-shrink-0 mt-0.5 ${colorMap[insight.accent]}`}>
        {index}
      </span>
      <p className="text-xs text-zinc-400 leading-relaxed">{insight.text}</p>
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 70) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-zinc-500";
}

const PRIORITY_LABEL: Record<string, string> = {
  critical: "Kritik",
  high: "Yüksek",
  medium: "Orta",
  low: "Düşük",
};

const PRIORITY_BADGE: Record<string, string> = {
  critical: "bg-rose-900/60 text-rose-300",
  high: "bg-amber-900/60 text-amber-300",
  medium: "bg-sky-900/60 text-sky-300",
  low: "bg-zinc-800 text-zinc-400",
};

const RISK_CARD: Record<string, string> = {
  critical: "bg-rose-950/40 border-rose-900/40 divide-rose-900/30",
  high: "bg-rose-950/30 border-rose-900/30 divide-rose-900/20",
  medium: "bg-amber-950/30 border-amber-900/30 divide-amber-900/20",
  low: "bg-zinc-800/50 border-zinc-700/30 divide-zinc-700/30",
};

const RECOVERY_CARD: Record<string, string> = {
  high: "bg-emerald-950/30 border-emerald-900/30 divide-emerald-900/20",
  medium: "bg-sky-950/30 border-sky-900/30 divide-sky-900/20",
  low: "bg-amber-950/30 border-amber-900/30 divide-amber-900/20",
  lost: "bg-zinc-800/50 border-zinc-700/30 divide-zinc-700/30",
};
