"use client";

import { useState, useMemo } from "react";
import type {
  RiskCard,
  RiskLevel,
  RiskSortKey,
} from "@/app/components/v2/adapters/revenue-risk-adapter";
import {
  computeRiskSummary,
  formatMrr,
  formatPct,
  RISK_LEVELS,
  RISK_LEVEL_META,
} from "@/app/components/v2/adapters/revenue-risk-adapter";
import {
  PIPELINE_STAGES,
  STAGE_META,
  type PipelineStage,
} from "@/app/components/v2/adapters/revenue-pipeline-adapter";
import { Badge } from "@/app/components/v2/primitives/Badge";
import type { PackageTier } from "@/app/components/v2/mock/mock-queue";

// ── risk level visuals ────────────────────────────────────────

const RISK_STYLE: Record<
  RiskLevel,
  { dot: string; text: string; ring: string; bg: string }
> = {
  critical: {
    dot: "bg-rose-400",
    text: "text-rose-300",
    ring: "ring-rose-500/40",
    bg: "bg-rose-500/10",
  },
  high: {
    dot: "bg-rose-300",
    text: "text-rose-200",
    ring: "ring-rose-400/30",
    bg: "bg-rose-400/[0.08]",
  },
  medium: {
    dot: "bg-amber-400",
    text: "text-amber-300",
    ring: "ring-amber-500/30",
    bg: "bg-amber-500/10",
  },
  low: {
    dot: "bg-zinc-500",
    text: "text-zinc-400",
    ring: "ring-zinc-600/30",
    bg: "bg-zinc-600/10",
  },
};

const RISK_LEFT_BORDER: Record<RiskLevel, string> = {
  critical: "border-l-rose-500/80",
  high: "border-l-rose-400/60",
  medium: "border-l-amber-500/60",
  low: "border-l-zinc-600/40",
};

// ── stage visuals ─────────────────────────────────────────────

const STAGE_STYLE: Record<
  PipelineStage,
  { dot: string; text: string; ring: string; bg: string }
> = {
  new: {
    dot: "bg-zinc-500",
    text: "text-zinc-400",
    ring: "ring-zinc-600/30",
    bg: "bg-zinc-600/10",
  },
  prioritized: {
    dot: "bg-indigo-400",
    text: "text-indigo-300",
    ring: "ring-indigo-500/30",
    bg: "bg-indigo-500/10",
  },
  contacted: {
    dot: "bg-sky-400",
    text: "text-sky-300",
    ring: "ring-sky-500/30",
    bg: "bg-sky-500/10",
  },
  "follow-up": {
    dot: "bg-amber-400",
    text: "text-amber-300",
    ring: "ring-amber-500/30",
    bg: "bg-amber-500/10",
  },
  demo: {
    dot: "bg-violet-400",
    text: "text-violet-300",
    ring: "ring-violet-500/30",
    bg: "bg-violet-500/10",
  },
  closing: {
    dot: "bg-emerald-400",
    text: "text-emerald-300",
    ring: "ring-emerald-500/30",
    bg: "bg-emerald-500/10",
  },
};

// ── labels ────────────────────────────────────────────────────

const SORT_LABEL: Record<RiskSortKey, string> = {
  "risk-score": "Risk Skoru",
  "forecast-value": "Tahmin Değeri",
  "opportunity-score": "Fırsat Skoru",
};

const PRIORITY_TR: Record<string, string> = {
  critical: "Kritik",
  high: "Yüksek",
  medium: "Orta",
  low: "Düşük",
};

const TIER_LABEL: Record<PackageTier, string> = {
  Enterprise: "Enterprise",
  Growth: "Growth",
  Professional: "Professional",
  Starter: "Starter",
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

const selectCls =
  "rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-xs text-white/70 outline-none focus:ring-1 focus:ring-indigo-500/50 hover:bg-white/[0.07] transition-colors";

// ── component ─────────────────────────────────────────────────

type Props = {
  cards: RiskCard[];
  selectedId: string | null;
  onSelect: (card: RiskCard) => void;
};

export default function RevenueRiskScreen({ cards, selectedId, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const [riskLevelFilter, setRiskLevelFilter] = useState<RiskLevel | "all">("all");
  const [stageFilter, setStageFilter] = useState<PipelineStage | "all">("all");
  const [tierFilter, setTierFilter] = useState<PackageTier | "all">("all");
  const [sortKey, setSortKey] = useState<RiskSortKey>("risk-score");

  const summary = useMemo(() => computeRiskSummary(cards), [cards]);

  const filtered = useMemo(() => {
    let result = cards;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.hotelName.toLowerCase().includes(q) ||
          c.city.toLowerCase().includes(q),
      );
    }

    if (riskLevelFilter !== "all") {
      result = result.filter((c) => c.riskLevel === riskLevelFilter);
    }

    if (stageFilter !== "all") {
      result = result.filter((c) => c.stage === stageFilter);
    }

    if (tierFilter !== "all") {
      result = result.filter((c) => c.packageTier === tierFilter);
    }

    return [...result].sort((a, b) => {
      switch (sortKey) {
        case "risk-score":
          return b.riskScore - a.riskScore || b.riskRevenue - a.riskRevenue;
        case "forecast-value":
          return b.forecastContribution - a.forecastContribution;
        case "opportunity-score":
          return b.opportunityScore - a.opportunityScore;
        default:
          return 0;
      }
    });
  }, [cards, search, riskLevelFilter, stageFilter, tierFilter, sortKey]);

  const hasFilters =
    search.trim() !== "" ||
    riskLevelFilter !== "all" ||
    stageFilter !== "all" ||
    tierFilter !== "all" ||
    sortKey !== "risk-score";

  function clearFilters() {
    setSearch("");
    setRiskLevelFilter("all");
    setStageFilter("all");
    setTierFilter("all");
    setSortKey("risk-score");
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.025]">
      {/* KPI strip */}
      <div className="shrink-0 grid grid-cols-4 divide-x divide-white/[0.06] border-b border-white/[0.06]">
        <KpiTile
          label="Risk Altındaki Gelir"
          value={formatMrr(summary.totalRiskRevenue)}
          sub="ağırlıklı risk maruziyeti"
          accent="text-rose-300"
        />
        <KpiTile
          label="Yüksek Risk Fırsat"
          value={String(summary.highRiskCount)}
          sub="kritik + yüksek risk"
          accent="text-rose-300"
        />
        <KpiTile
          label="Risk Maruziyeti"
          value={formatPct(summary.riskExposurePct)}
          sub="tahmin MRR içindeki pay"
          accent={
            summary.riskExposurePct >= 60
              ? "text-rose-300"
              : summary.riskExposurePct >= 35
                ? "text-amber-300"
                : "text-zinc-400"
          }
        />
        <KpiTile
          label="Ortalama Risk Skoru"
          value={String(summary.avgRiskScore)}
          sub="tüm aktif leadler"
          accent={
            summary.avgRiskScore >= 60
              ? "text-rose-300"
              : summary.avgRiskScore >= 35
                ? "text-amber-300"
                : "text-zinc-400"
          }
        />
      </div>

      {/* Toolbar */}
      <div className="shrink-0 flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <input
          type="text"
          placeholder="Hotel veya şehir ara…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-40 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-xs text-white/80 placeholder:text-white/30 outline-none focus:ring-1 focus:ring-indigo-500/50"
        />

        <select
          value={riskLevelFilter}
          onChange={(e) =>
            setRiskLevelFilter(e.target.value as RiskLevel | "all")
          }
          className={selectCls}
        >
          <option value="all">Tüm Risk</option>
          {RISK_LEVELS.map((level) => (
            <option key={level} value={level}>
              {RISK_LEVEL_META[level].label}
            </option>
          ))}
        </select>

        <select
          value={stageFilter}
          onChange={(e) =>
            setStageFilter(e.target.value as PipelineStage | "all")
          }
          className={selectCls}
        >
          <option value="all">Tüm Aşamalar</option>
          {PIPELINE_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_META[s].label}
            </option>
          ))}
        </select>

        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value as PackageTier | "all")}
          className={selectCls}
        >
          <option value="all">Tüm Paketler</option>
          {(
            ["Enterprise", "Growth", "Professional", "Starter"] as PackageTier[]
          ).map((v) => (
            <option key={v} value={v}>
              {TIER_LABEL[v]}
            </option>
          ))}
        </select>

        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as RiskSortKey)}
          className={selectCls}
        >
          {(Object.keys(SORT_LABEL) as RiskSortKey[]).map((v) => (
            <option key={v} value={v}>
              ↕ {SORT_LABEL[v]}
            </option>
          ))}
        </select>

        <span className="ml-auto text-[11px] text-white/30">
          {filtered.length} / {cards.length}
        </span>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Temizle
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {filtered.length === 0 ? (
          <EmptyState onClear={clearFilters} />
        ) : (
          filtered.map((card) => (
            <RiskCardRow
              key={card.id}
              card={card}
              isSelected={card.id === selectedId}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── KPI tile ──────────────────────────────────────────────────

function KpiTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3">
      <span className="text-[10px] font-medium uppercase tracking-wide text-white/40">
        {label}
      </span>
      <span className={`text-2xl font-bold ${accent}`}>{value}</span>
      <span className="text-[10px] text-white/30">{sub}</span>
    </div>
  );
}

// ── risk card row ─────────────────────────────────────────────

function RiskCardRow({
  card,
  isSelected,
  onSelect,
}: {
  card: RiskCard;
  isSelected: boolean;
  onSelect: (c: RiskCard) => void;
}) {
  const avatarCls = AVATAR_COLORS[stableAvatarIdx(card.id)];
  const riskStyle = RISK_STYLE[card.riskLevel];
  const leftBorder = RISK_LEFT_BORDER[card.riskLevel];
  const stageStyle = STAGE_STYLE[card.stage];
  const isCriticalOrHigh =
    card.riskLevel === "critical" || card.riskLevel === "high";

  return (
    <button
      onClick={() => onSelect(card)}
      className={[
        "w-full text-left rounded-lg border border-l-4 p-3 transition-colors",
        leftBorder,
        isSelected
          ? "border-indigo-500/40 bg-indigo-500/[0.07]"
          : isCriticalOrHigh
            ? "border-white/[0.06] bg-rose-500/[0.03] hover:bg-rose-500/[0.06]"
            : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]",
      ].join(" ")}
    >
      {/* Top row */}
      <div className="flex items-start gap-2.5">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${avatarCls}`}
        >
          {card.hotelName.charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-white/90 truncate max-w-[140px]">
              {card.hotelName}
            </span>
            {/* Risk level badge */}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${riskStyle.bg} ${riskStyle.text} ${riskStyle.ring}`}
            >
              <span className={`h-1 w-1 rounded-full ${riskStyle.dot}`} />
              {card.riskLevelLabel}
            </span>
            {/* Stage badge */}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${stageStyle.bg} ${stageStyle.text} ${stageStyle.ring}`}
            >
              <span className={`h-1 w-1 rounded-full ${stageStyle.dot}`} />
              {STAGE_META[card.stage].label}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-white/40">
            {card.city} · {card.hotelType}
          </div>
          <div className="mt-0.5 text-[10px] text-white/30 truncate">
            {card.riskCategoryLabel}
            {card.riskSignals.length > 0 && ` · ${card.riskSignals[0]}`}
          </div>
        </div>

        {/* Risk score + risk revenue + forecast */}
        <div className="shrink-0 text-right">
          <div
            className={`text-sm font-bold leading-tight tabular-nums ${riskStyle.text}`}
          >
            {card.riskScore}
          </div>
          <div className="text-[10px] text-rose-300/60 tabular-nums">
            {formatMrr(card.riskRevenue)} risk
          </div>
          <div className="text-[10px] text-white/25 tabular-nums">
            ↗ {formatMrr(card.forecastContribution)}
          </div>
        </div>
      </div>

      {/* Footer row */}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <Badge variant={priorityVariant(card.priority)}>
          {PRIORITY_TR[card.priority]}
        </Badge>

        <span className="text-[10px] text-white/35 truncate max-w-[200px]">
          {card.recoveryAction.length > 48
            ? card.recoveryAction.slice(0, 48) + "…"
            : card.recoveryAction}
        </span>

        <span className="ml-auto text-[10px] text-white/30 shrink-0">
          {card.contactAttempts > 0
            ? `${card.contactAttempts}x temas · ${card.lastContactLabel}`
            : "Temas yok"}
        </span>
      </div>
    </button>
  );
}

// ── empty state ───────────────────────────────────────────────

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <svg
        className="h-10 w-10 text-white/15"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
        />
      </svg>
      <div>
        <p className="text-sm text-white/40">Eşleşen risk bulunamadı</p>
        <p className="text-xs text-white/25 mt-1">Filtrelerinizi değiştirin</p>
      </div>
      <button
        onClick={onClear}
        className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
      >
        Filtreleri temizle
      </button>
    </div>
  );
}
