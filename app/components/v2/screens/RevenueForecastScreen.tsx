"use client";

import { useState, useMemo } from "react";
import type {
  ForecastCard,
  ForecastConfidenceLevel,
  ForecastSortKey,
} from "@/app/components/v2/adapters/revenue-forecast-adapter";
import {
  computeForecastSummary,
  formatMrr,
  formatProbabilityPct,
} from "@/app/components/v2/adapters/revenue-forecast-adapter";
import {
  PIPELINE_STAGES,
  STAGE_META,
  type PipelineStage,
} from "@/app/components/v2/adapters/revenue-pipeline-adapter";
import { Badge } from "@/app/components/v2/primitives/Badge";
import type { PackageTier } from "@/app/components/v2/mock/mock-queue";

// ── stage visuals (mirrors pipeline screen) ───────────────────

const STAGE_STYLE: Record<
  PipelineStage,
  { dot: string; text: string; ring: string; bg: string; border: string }
> = {
  new: {
    dot: "bg-zinc-500",
    text: "text-zinc-400",
    ring: "ring-zinc-600/30",
    bg: "bg-zinc-600/10",
    border: "border-zinc-600/20",
  },
  prioritized: {
    dot: "bg-indigo-400",
    text: "text-indigo-300",
    ring: "ring-indigo-500/30",
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/20",
  },
  contacted: {
    dot: "bg-sky-400",
    text: "text-sky-300",
    ring: "ring-sky-500/30",
    bg: "bg-sky-500/10",
    border: "border-sky-500/20",
  },
  "follow-up": {
    dot: "bg-amber-400",
    text: "text-amber-300",
    ring: "ring-amber-500/30",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
  demo: {
    dot: "bg-violet-400",
    text: "text-violet-300",
    ring: "ring-violet-500/30",
    bg: "bg-violet-500/10",
    border: "border-violet-500/20",
  },
  closing: {
    dot: "bg-emerald-400",
    text: "text-emerald-300",
    ring: "ring-emerald-500/30",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
};

const STAGE_LEFT_BORDER: Record<PipelineStage, string> = {
  new: "border-l-zinc-600/50",
  prioritized: "border-l-indigo-500/60",
  contacted: "border-l-sky-500/60",
  "follow-up": "border-l-amber-500/60",
  demo: "border-l-violet-500/60",
  closing: "border-l-emerald-500/70",
};

// ── confidence visuals ────────────────────────────────────────

const CONFIDENCE_STYLE: Record<
  ForecastConfidenceLevel,
  { text: string; bg: string; ring: string; dot: string }
> = {
  high: {
    text: "text-emerald-300",
    bg: "bg-emerald-500/10",
    ring: "ring-emerald-500/30",
    dot: "bg-emerald-400",
  },
  medium: {
    text: "text-amber-300",
    bg: "bg-amber-500/10",
    ring: "ring-amber-500/30",
    dot: "bg-amber-400",
  },
  low: {
    text: "text-zinc-400",
    bg: "bg-zinc-600/10",
    ring: "ring-zinc-600/30",
    dot: "bg-zinc-500",
  },
};

// ── forecast window badge color ───────────────────────────────

function windowBadgeCls(w: string): string {
  if (w === "Bu Hafta") return "text-emerald-300 bg-emerald-500/10 ring-emerald-500/30";
  if (w === "2 Hafta") return "text-violet-300 bg-violet-500/10 ring-violet-500/30";
  if (w === "3 Hafta") return "text-amber-300 bg-amber-500/10 ring-amber-500/30";
  if (w === "Bu Ay") return "text-sky-300 bg-sky-500/10 ring-sky-500/30";
  return "text-zinc-400 bg-zinc-600/10 ring-zinc-600/30";
}

// ── labels ────────────────────────────────────────────────────

const SORT_LABEL: Record<ForecastSortKey, string> = {
  "forecast-contribution": "Tahmin Katkısı",
  probability: "Olasılık",
  mrr: "MRR",
  stage: "Aşama",
};

const CONFIDENCE_LABEL_TR: Record<ForecastConfidenceLevel, string> = {
  high: "Yüksek Güven",
  medium: "Orta Güven",
  low: "Düşük Güven",
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
    case "critical": return "critical" as const;
    case "high": return "high" as const;
    case "medium": return "medium" as const;
    default: return "low" as const;
  }
}

const selectCls =
  "h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 text-[11px] text-zinc-400 outline-none hover:bg-white/[0.06] hover:text-zinc-200 focus:ring-1 focus:ring-indigo-500/40 transition-colors duration-150 cursor-pointer";

// ── component ─────────────────────────────────────────────────

type Props = {
  cards: ForecastCard[];
  selectedId: string | null;
  onSelect: (card: ForecastCard) => void;
};

export default function RevenueForecastScreen({
  cards,
  selectedId,
  onSelect,
}: Props) {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<PipelineStage | "all">("all");
  const [confidenceFilter, setConfidenceFilter] = useState<
    ForecastConfidenceLevel | "all"
  >("all");
  const [tierFilter, setTierFilter] = useState<PackageTier | "all">("all");
  const [sortKey, setSortKey] = useState<ForecastSortKey>("forecast-contribution");

  const summary = useMemo(() => computeForecastSummary(cards), [cards]);

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

    if (stageFilter !== "all") {
      result = result.filter((c) => c.stage === stageFilter);
    }

    if (confidenceFilter !== "all") {
      result = result.filter((c) => c.confidenceLevel === confidenceFilter);
    }

    if (tierFilter !== "all") {
      result = result.filter((c) => c.packageTier === tierFilter);
    }

    return [...result].sort((a, b) => {
      switch (sortKey) {
        case "forecast-contribution":
          return b.forecastContribution - a.forecastContribution;
        case "probability":
          return b.stageProbability - a.stageProbability;
        case "mrr":
          return b.weightedMrr - a.weightedMrr;
        case "stage":
          return (
            b.stageRank - a.stageRank ||
            b.forecastContribution - a.forecastContribution
          );
        default:
          return 0;
      }
    });
  }, [cards, search, stageFilter, confidenceFilter, tierFilter, sortKey]);

  const hasFilters =
    search.trim() !== "" ||
    stageFilter !== "all" ||
    confidenceFilter !== "all" ||
    tierFilter !== "all" ||
    sortKey !== "forecast-contribution";

  function clearFilters() {
    setSearch("");
    setStageFilter("all");
    setConfidenceFilter("all");
    setTierFilter("all");
    setSortKey("forecast-contribution");
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.025]">
      {/* KPI strip */}
      <div className="shrink-0 grid grid-cols-4 divide-x divide-white/[0.06] border-b border-white/[0.06]">
        <KpiTile
          label="Tahmin MRR"
          value={formatMrr(summary.forecastMrr)}
          sub="ağırlıklı aylık gelir tahmini"
          accent="text-emerald-300"
        />
        <KpiTile
          label="Tahmin ARR"
          value={formatMrr(summary.forecastArr)}
          sub="yıllık gelir projeksiyonu"
          accent="text-violet-300"
        />
        <KpiTile
          label="Beklenen Kapanış"
          value={String(summary.expectedClosings)}
          sub="yüksek güvenli fırsat"
          accent="text-amber-300"
        />
        <KpiTile
          label="Tahmin Güveni"
          value={`%${summary.forecastConfidence}`}
          sub={summary.forecastConfidenceLabel}
          accent={
            summary.forecastConfidence >= 65
              ? "text-emerald-300"
              : summary.forecastConfidence >= 40
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
          className="h-9 w-48 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-[11px] text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-indigo-500/40 focus:bg-white/[0.06] transition-colors duration-150"
        />

        {/* Stage filter */}
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

        {/* Confidence filter */}
        <select
          value={confidenceFilter}
          onChange={(e) =>
            setConfidenceFilter(e.target.value as ForecastConfidenceLevel | "all")
          }
          className={selectCls}
        >
          <option value="all">Tüm Güven</option>
          {(["high", "medium", "low"] as ForecastConfidenceLevel[]).map(
            (v) => (
              <option key={v} value={v}>
                {CONFIDENCE_LABEL_TR[v]}
              </option>
            ),
          )}
        </select>

        {/* Business tier filter */}
        <select
          value={tierFilter}
          onChange={(e) =>
            setTierFilter(e.target.value as PackageTier | "all")
          }
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

        {/* Sort */}
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as ForecastSortKey)}
          className={selectCls}
        >
          {(Object.keys(SORT_LABEL) as ForecastSortKey[]).map((v) => (
            <option key={v} value={v}>
              ↕ {SORT_LABEL[v]}
            </option>
          ))}
        </select>

        <span className="ml-auto text-[11px] text-zinc-500">
          {filtered.length} / {cards.length}
        </span>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors duration-150"
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
            <ForecastCardRow
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
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
        {label}
      </span>
      <span className={`text-[28px] font-bold ${accent}`}>{value}</span>
      <span className="text-[10px] text-zinc-600">{sub}</span>
    </div>
  );
}

// ── forecast card row ─────────────────────────────────────────

function ForecastCardRow({
  card,
  isSelected,
  onSelect,
}: {
  card: ForecastCard;
  isSelected: boolean;
  onSelect: (c: ForecastCard) => void;
}) {
  const avatarCls = AVATAR_COLORS[stableAvatarIdx(card.id)];
  const stageStyle = STAGE_STYLE[card.stage];
  const leftBorder = STAGE_LEFT_BORDER[card.stage];
  const confStyle = CONFIDENCE_STYLE[card.confidenceLevel];
  const isHighValue = card.stage === "closing" || card.stage === "demo";

  return (
    <button
      onClick={() => onSelect(card)}
      className={[
        "w-full text-left rounded-lg border border-l-4 p-3 transition-colors",
        leftBorder,
        isSelected
          ? "border-indigo-500/40 bg-indigo-500/[0.07] ring-1 ring-inset ring-indigo-500/20"
          : isHighValue
            ? "border-white/[0.06] bg-emerald-500/[0.03] hover:bg-emerald-500/[0.06]"
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
            <span className="text-sm font-semibold text-white/90 truncate max-w-[160px]">
              {card.hotelName}
            </span>
            {/* Stage badge */}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${stageStyle.bg} ${stageStyle.text} ${stageStyle.ring}`}
            >
              <span className={`h-1 w-1 rounded-full ${stageStyle.dot}`} />
              {STAGE_META[card.stage].label}
            </span>
            {/* Forecast window badge */}
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${windowBadgeCls(card.forecastWindow)}`}
            >
              {card.forecastWindow}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-white/40">
            {card.city} · {card.hotelType}
          </div>
        </div>

        {/* Forecast contribution + probability */}
        <div className="shrink-0 text-right">
          <div className="text-sm font-bold text-emerald-300 leading-tight">
            {formatMrr(card.forecastContribution)}
          </div>
          <div className="text-[10px] text-white/30">
            {formatProbabilityPct(card.stageProbability)} olasılık
          </div>
          <div className="text-[10px] text-white/25">
            MRR {formatMrr(card.weightedMrr)}
          </div>
        </div>
      </div>

      {/* Footer row */}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <Badge variant={priorityVariant(card.priority)}>
          {PRIORITY_TR[card.priority]}
        </Badge>

        {/* Confidence badge */}
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${confStyle.bg} ${confStyle.text} ${confStyle.ring}`}
        >
          <span className={`h-1 w-1 rounded-full ${confStyle.dot}`} />
          {card.confidenceLabel}
        </span>

        {card.icpScore > 0 && (
          <span className="text-[10px] text-white/35">
            ICP %{card.icpScore}
          </span>
        )}

        <span className="ml-auto text-[10px] text-white/30">
          {card.contactAttempts > 0
            ? `${card.contactAttempts}x temas · ${card.lastContactLabel}`
            : "İlk temas bekleniyor"}
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
          d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
        />
      </svg>
      <div>
        <p className="text-sm text-white/40">Eşleşen tahmin bulunamadı</p>
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
