import type {
  RiskCard,
  RiskLevel,
  RiskSummary,
} from "@/app/components/v2/adapters/revenue-risk-adapter";
import {
  computeRiskSummary,
  formatMrr,
  formatPct,
  RISK_CATEGORY_LABEL,
} from "@/app/components/v2/adapters/revenue-risk-adapter";
import {
  STAGE_META,
  type PipelineStage,
} from "@/app/components/v2/adapters/revenue-pipeline-adapter";
import { Badge } from "@/app/components/v2/primitives/Badge";

// ── risk colors ───────────────────────────────────────────────

const RISK_COLOR: Record<
  RiskLevel,
  { text: string; bg: string; border: string; bar: string }
> = {
  critical: {
    text: "text-rose-300",
    bg: "bg-rose-500/10",
    border: "border-rose-500/25",
    bar: "bg-rose-500/60",
  },
  high: {
    text: "text-rose-200",
    bg: "bg-rose-400/[0.08]",
    border: "border-rose-400/20",
    bar: "bg-rose-400/50",
  },
  medium: {
    text: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    bar: "bg-amber-500/50",
  },
  low: {
    text: "text-zinc-400",
    bg: "bg-zinc-600/10",
    border: "border-zinc-600/20",
    bar: "bg-zinc-500/40",
  },
};

// ── stage colors ──────────────────────────────────────────────

const STAGE_COLOR: Record<
  PipelineStage,
  { text: string; bg: string; border: string }
> = {
  new: {
    text: "text-zinc-400",
    bg: "bg-zinc-600/10",
    border: "border-zinc-600/20",
  },
  prioritized: {
    text: "text-indigo-300",
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/20",
  },
  contacted: {
    text: "text-sky-300",
    bg: "bg-sky-500/10",
    border: "border-sky-500/20",
  },
  "follow-up": {
    text: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
  demo: {
    text: "text-violet-300",
    bg: "bg-violet-500/10",
    border: "border-violet-500/20",
  },
  closing: {
    text: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
};

// ── avatar ────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-violet-500/25 text-violet-300",
  "bg-indigo-500/25 text-indigo-300",
  "bg-sky-500/25 text-sky-300",
  "bg-emerald-500/25 text-emerald-300",
  "bg-amber-500/25 text-amber-300",
  "bg-rose-500/25 text-rose-300",
  "bg-teal-500/25 text-teal-300",
];

function stableAvatarIdx(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % AVATAR_COLORS.length;
}

const PRIORITY_TR: Record<string, string> = {
  critical: "Kritik",
  high: "Yüksek",
  medium: "Orta",
  low: "Düşük",
};

function priorityVariant(p: string) {
  switch (p) {
    case "critical":
      return "critical" as const;
    case "high":
      return "high" as const;
    case "medium":
      return "medium" as const;
    default:
      return "low" as const;
  }
}

// ── shared primitives ─────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2">
      {children}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="text-xs text-white/40">{label}</span>
      <span className="text-xs font-medium text-white/70">{value}</span>
    </div>
  );
}

function MiniKpi({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-lg bg-white/[0.03] p-2.5">
      <div className="text-[10px] text-white/35 mb-0.5">{label}</div>
      <div className={`text-sm font-bold ${color}`}>{value}</div>
    </div>
  );
}

// ── root ──────────────────────────────────────────────────────

type Props = {
  selectedCard: RiskCard | null;
  allCards: RiskCard[];
};

export default function RevenueRiskContextPanel({
  selectedCard,
  allCards,
}: Props) {
  if (selectedCard) return <RiskDetail card={selectedCard} />;
  return <RiskOverview cards={allCards} />;
}

// ── no selection: risk overview ───────────────────────────────

function RiskOverview({ cards }: { cards: RiskCard[] }) {
  const summary: RiskSummary = computeRiskSummary(cards);
  const maxRiskRevenue = Math.max(
    ...summary.riskDistribution.map((d) => d.riskRevenue),
    1,
  );

  return (
    <aside className="flex w-[330px] shrink-0 flex-col gap-3 overflow-y-auto">
      {/* Risk summary */}
      <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-4">
        <SectionLabel>Gelir Risk Özeti</SectionLabel>
        <div className="text-2xl font-bold text-rose-300 mb-0.5">
          {formatMrr(summary.totalRiskRevenue)}
        </div>
        <div className="text-[11px] text-white/40 mb-3">
          risk altındaki gelir · {formatPct(summary.riskExposurePct)} maruziyet
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MiniKpi
            label="Yüksek Risk"
            value={String(summary.highRiskCount)}
            color="text-rose-300"
          />
          <MiniKpi
            label="Ort. Risk Skoru"
            value={String(summary.avgRiskScore)}
            color={
              summary.avgRiskScore >= 50
                ? "text-rose-300"
                : summary.avgRiskScore >= 30
                  ? "text-amber-300"
                  : "text-zinc-400"
            }
          />
          <MiniKpi
            label="Aktif Fırsat"
            value={String(summary.totalActive)}
            color="text-white/70"
          />
          <MiniKpi
            label="Tahmin MRR"
            value={formatMrr(summary.totalForecastMrr)}
            color="text-emerald-300/70"
          />
        </div>
      </div>

      {/* Risk distribution */}
      {summary.riskDistribution.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
          <SectionLabel>Risk Dağılımı</SectionLabel>
          <div className="space-y-2.5">
            {summary.riskDistribution.map((d) => {
              const pct =
                maxRiskRevenue > 0
                  ? Math.round((d.riskRevenue / maxRiskRevenue) * 100)
                  : 0;
              const color = RISK_COLOR[d.level];
              return (
                <div key={d.level} className="flex items-center gap-2">
                  <span
                    className={`w-14 text-[10px] shrink-0 ${color.text}`}
                  >
                    {d.label}
                  </span>
                  <div className="flex-1 h-1 rounded-full bg-white/[0.06]">
                    <div
                      className={`h-full rounded-full ${color.bar}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-white/30 tabular-nums w-3 text-right shrink-0">
                    {d.count}
                  </span>
                  <span
                    className={`text-[10px] tabular-nums w-12 text-right shrink-0 ${color.text}`}
                  >
                    {d.riskRevenue > 0 ? formatMrr(d.riskRevenue) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top risk cards */}
      {summary.topRiskCards.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
          <SectionLabel>En Yüksek Riskler</SectionLabel>
          <div className="space-y-2">
            {summary.topRiskCards.map((c) => {
              const rColor = RISK_COLOR[c.riskLevel];
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-2.5 rounded-lg bg-white/[0.03] p-2.5"
                >
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold ${AVATAR_COLORS[stableAvatarIdx(c.id)]}`}
                  >
                    {c.hotelName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-white/80 truncate">
                      {c.hotelName}
                    </div>
                    <div className="text-[10px] text-white/35">
                      {c.city} · {c.riskCategoryLabel}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className={`text-[11px] font-bold tabular-nums ${rColor.text}`}
                    >
                      {c.riskScore}
                    </div>
                    <div className="text-[10px] text-rose-300/60 tabular-nums">
                      {formatMrr(c.riskRevenue)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Operational bottlenecks */}
      {summary.operationalBottlenecks.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
          <SectionLabel>Operasyonel Darboğazlar</SectionLabel>
          <div className="space-y-2">
            {summary.operationalBottlenecks.map((b) => (
              <div
                key={b.category}
                className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-2"
              >
                <div>
                  <div className="text-xs text-white/70">{b.label}</div>
                  <div className="text-[10px] text-white/35">
                    {b.count} fırsat
                  </div>
                </div>
                <div className="text-[11px] font-semibold text-amber-300 shrink-0 ml-2 tabular-nums">
                  {formatMrr(b.totalRiskRevenue)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Immediate actions */}
      {summary.immediateActions.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
          <SectionLabel>Acil Aksiyonlar</SectionLabel>
          <div className="space-y-2">
            {summary.immediateActions.map((action, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="shrink-0 text-[9px] font-bold text-rose-400/70 mt-0.5 w-4">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="text-[11px] text-white/55 leading-relaxed">
                  {action}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Select hint */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 flex items-start gap-2.5">
        <div className="mt-0.5 h-5 w-5 shrink-0 rounded-md bg-rose-500/20 flex items-center justify-center">
          <svg
            className="h-3 w-3 text-rose-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
        </div>
        <p className="text-[11px] text-white/35 leading-relaxed">
          Risk hesabı, sinyal analizi ve kurtarma önerisi için soldaki
          listeden bir lead seçin.
        </p>
      </div>
    </aside>
  );
}

// ── selected lead: risk detail ────────────────────────────────

function RiskDetail({ card }: { card: RiskCard }) {
  const avatarCls = AVATAR_COLORS[stableAvatarIdx(card.id)];
  const riskColor = RISK_COLOR[card.riskLevel];
  const stageColor = STAGE_COLOR[card.stage];
  const stageMeta = STAGE_META[card.stage];

  return (
    <aside className="flex w-[330px] shrink-0 flex-col gap-3 overflow-y-auto">
      {/* 1. Risk profile */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base font-bold ${avatarCls}`}
          >
            {card.hotelName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-white/90 text-sm leading-tight truncate">
              {card.hotelName}
            </div>
            <div className="text-[11px] text-white/40 mt-0.5">
              {card.city} · {card.hotelType}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              <Badge variant={priorityVariant(card.priority)}>
                {PRIORITY_TR[card.priority] ?? card.priority}
              </Badge>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${riskColor.bg} ${riskColor.text} ${riskColor.border}`}
              >
                {card.riskLevelLabel} Risk
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${stageColor.bg} ${stageColor.text} ${stageColor.border}`}
              >
                {stageMeta.label}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Revenue exposure */}
      <div className={`rounded-xl border p-4 ${riskColor.bg} ${riskColor.border}`}>
        <SectionLabel>Gelir Maruziyeti</SectionLabel>
        <div className={`text-2xl font-bold mb-0.5 ${riskColor.text}`}>
          {formatMrr(card.riskRevenue)}
        </div>
        <div className="text-[11px] text-white/40 mb-3">
          risk altındaki gelir · {formatPct(card.riskScore)} risk skoru
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-white/[0.04] p-2.5 text-center">
            <div className="text-sm font-bold text-emerald-300/80 tabular-nums">
              {formatMrr(card.forecastContribution)}
            </div>
            <div className="text-[10px] text-white/35 mt-0.5">
              Tahmin Katkısı
            </div>
          </div>
          <div className="rounded-lg bg-white/[0.04] p-2.5 text-center">
            <div
              className={`text-sm font-bold tabular-nums ${riskColor.text}`}
            >
              {formatMrr(card.riskRevenue)}
            </div>
            <div className="text-[10px] text-white/35 mt-0.5">Risk Geliri</div>
          </div>
        </div>
      </div>

      {/* 3. Risk calculation */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
        <SectionLabel>Risk Hesabı</SectionLabel>
        <div className="space-y-0">
          <CalcRow
            label="Tahmin Katkısı"
            value={formatMrr(card.forecastContribution)}
            note="pipeline × fırsat skoru"
          />
          <CalcRow
            label="Risk Skoru"
            value={`× ${formatPct(card.riskScore)}`}
            note={`${card.riskLevelLabel} risk seviyesi`}
          />
          <CalcRow
            label="Risk Altındaki Gelir"
            value={formatMrr(card.riskRevenue)}
            note="kaybolabilecek tahmin değeri"
            accent
          />
        </div>
        <div className="mt-3">
          <StatRow label="Pipeline Aşaması" value={stageMeta.label} />
          <StatRow label="Fırsat Skoru" value={formatPct(card.opportunityScore)} />
          <StatRow
            label="Temas Sayısı"
            value={card.contactAttempts > 0 ? `${card.contactAttempts}x` : "Hiç yok"}
          />
          {card.icpScore > 0 && (
            <StatRow label="ICP Uyumu" value={formatPct(card.icpScore)} />
          )}
          {card.isFollowUpOverdue && (
            <StatRow label="Takip Durumu" value="Gecikmiş" />
          )}
        </div>
      </div>

      {/* 4. Risk signals */}
      {card.riskSignals.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
          <SectionLabel>Risk Sinyalleri</SectionLabel>
          <div className="space-y-1.5">
            {card.riskSignals.map((signal, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="shrink-0 text-rose-400/70 text-[10px] mt-0.5">
                  ▲
                </span>
                <span className="text-[11px] text-white/55 leading-relaxed">
                  {signal}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Opportunity reasons */}
      {card.opportunityReasons.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
          <SectionLabel>Fırsat Sinyalleri</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {card.opportunityReasons.slice(0, 6).map((r) => (
              <span
                key={r}
                className="rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-[10px] font-medium text-indigo-300 ring-1 ring-inset ring-indigo-500/25"
              >
                {r.replaceAll("_", " ")}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 6. AI insight */}
      {card.aiInsight && (
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] p-4">
          <SectionLabel>AI İçgörü</SectionLabel>
          <p className="text-[11px] text-white/60 leading-relaxed">
            {card.aiInsight}
          </p>
        </div>
      )}

      {/* 7. Recovery recommendation */}
      <div
        className={`rounded-xl border p-4 ${riskColor.bg} ${riskColor.border}`}
      >
        <SectionLabel>Kurtarma Önerisi</SectionLabel>
        <div className={`text-sm font-semibold mb-2 ${riskColor.text}`}>
          {RISK_CATEGORY_LABEL[card.riskCategory]}
        </div>
        <p className="text-[11px] text-white/55 leading-relaxed">
          {card.recoveryAction}
        </p>
      </div>

      {/* 8. Recommended next action */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
        <SectionLabel>Sonraki En İyi Aksiyon</SectionLabel>
        <div className="text-sm font-semibold text-amber-300 mb-2">
          {card.actionLabel}
        </div>
        {card.outreachAngle && (
          <p className="text-[11px] text-white/55 leading-relaxed">
            {card.outreachAngle}
          </p>
        )}
        {card.whyThisLead.length > 0 && (
          <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-1.5">
            {card.whyThisLead.slice(0, 2).map((reason, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="shrink-0 text-[9px] font-bold text-white/25 mt-0.5 w-4">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[11px] text-white/45 leading-relaxed">
                  {reason}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

// ── sub-components ────────────────────────────────────────────

function CalcRow({
  label,
  value,
  note,
  accent,
}: {
  label: string;
  value: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <div
      className={[
        "flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0",
        accent ? "border-t border-white/[0.08] mt-1 pt-3" : "",
      ].join(" ")}
    >
      <div>
        <div
          className={`text-xs ${accent ? "font-semibold text-rose-300" : "text-white/40"}`}
        >
          {label}
        </div>
        <div className="text-[10px] text-white/25">{note}</div>
      </div>
      <span
        className={`text-sm font-bold tabular-nums ${accent ? "text-rose-300" : "text-white/60"}`}
      >
        {value}
      </span>
    </div>
  );
}
