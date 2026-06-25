"use client";

import { useState, useMemo } from "react";
import type {
  RecoveryCard,
  RecoveryLevel,
  RecoverySortKey,
} from "@/app/components/v2/adapters/revenue-recovery-adapter";
import {
  computeRecoverySummary,
  formatMrr,
  formatPct,
  RECOVERY_LEVELS,
  RECOVERY_LEVEL_META,
} from "@/app/components/v2/adapters/revenue-recovery-adapter";
import {
  PIPELINE_STAGES,
  STAGE_META,
  type PipelineStage,
} from "@/app/components/v2/adapters/revenue-pipeline-adapter";
import {
  type RiskLevel,
  RISK_LEVELS,
  RISK_LEVEL_META,
} from "@/app/components/v2/adapters/revenue-risk-adapter";
import { Badge } from "@/app/components/v2/primitives/Badge";
import type { PackageTier } from "@/app/components/v2/mock/mock-queue";

// ── recovery level visuals ────────────────────────────────────

const RECOVERY_STYLE: Record<
  RecoveryLevel,
  { dot: string; text: string; ring: string; bg: string }
> = {
  high: {
    dot: "bg-emerald-400",
    text: "text-emerald-300",
    ring: "ring-emerald-500/40",
    bg: "bg-emerald-500/10",
  },
  medium: {
    dot: "bg-sky-400",
    text: "text-sky-300",
    ring: "ring-sky-500/30",
    bg: "bg-sky-500/10",
  },
  low: {
    dot: "bg-amber-400",
    text: "text-amber-300",
    ring: "ring-amber-500/30",
    bg: "bg-amber-500/10",
  },
  lost: {
    dot: "bg-zinc-500",
    text: "text-zinc-400",
    ring: "ring-zinc-600/30",
    bg: "bg-zinc-600/10",
  },
};

const RECOVERY_LEFT_BORDER: Record<RecoveryLevel, string> = {
  high: "border-l-emerald-500/70",
  medium: "border-l-sky-500/60",
  low: "border-l-amber-500/60",
  lost: "border-l-zinc-600/40",
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

const SORT_LABEL: Record<RecoverySortKey, string> = {
  "recovery-score": "Kurtarma Skoru",
  "recoverable-revenue": "Kurtarılabilir Gelir",
  "risk-score": "Risk Skoru",
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
  cards: RecoveryCard[];
  selectedId: string | null;
  onSelect: (card: RecoveryCard) => void;
};

export default function RevenueRecoveryScreen({
  cards,
  selectedId,
  onSelect,
}: Props) {
  const [search, setSearch] = useState("");
  const [recoveryLevelFilter, setRecoveryLevelFilter] = useState<
    RecoveryLevel | "all"
  >("all");
  const [riskLevelFilter, setRiskLevelFilter] = useState<RiskLevel | "all">(
    "all",
  );
  const [stageFilter, setStageFilter] = useState<PipelineStage | "all">("all");
  const [tierFilter, setTierFilter] = useState<PackageTier | "all">("all");
  const [sortKey, setSortKey] = useState<RecoverySortKey>("recoverable-revenue");

  const summary = useMemo(() => computeRecoverySummary(cards), [cards]);

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

    if (recoveryLevelFilter !== "all") {
      result = result.filter((c) => c.recoveryLevel === recoveryLevelFilter);
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
        case "recovery-score":
          return b.recoveryScore - a.recoveryScore;
        case "recoverable-revenue":
          return b.recoveryRevenue - a.recoveryRevenue || b.recoveryScore - a.recoveryScore;
        case "risk-score":
          return b.riskScore - a.riskScore;
        case "opportunity-score":
          return b.opportunityScore - a.opportunityScore;
        default:
          return 0;
      }
    });
  }, [cards, search, recoveryLevelFilter, riskLevelFilter, stageFilter, tierFilter, sortKey]);

  const hasFilters =
    search.trim() !== "" ||
    recoveryLevelFilter !== "all" ||
    riskLevelFilter !== "all" ||
    stageFilter !== "all" ||
    tierFilter !== "all" ||
    sortKey !== "recoverable-revenue";

  function clearFilters() {
    setSearch("");
    setRecoveryLevelFilter("all");
    setRiskLevelFilter("all");
    setStageFilter("all");
    setTierFilter("all");
    setSortKey("recoverable-revenue");
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.025]">
      {/* KPI strip */}
      <div className="shrink-0 grid grid-cols-4 divide-x divide-white/[0.06] border-b border-white/[0.06]">
        <KpiTile
          label="Kurtarılabilir Gelir"
          value={formatMrr(summary.totalRecoveryRevenue)}
          sub="geri kazanılabilir tahmin"
          accent="text-emerald-300"
        />
        <KpiTile
          label="Kurtarma Fırsatı"
          value={String(summary.recoveryOpportunityCount)}
          sub="yüksek + orta kurtarma"
          accent="text-sky-300"
        />
        <KpiTile
          label="Ort. Kurtarma Skoru"
          value={String(summary.avgRecoveryScore)}
          sub="tüm aktif leadler"
          accent={
            summary.avgRecoveryScore >= 50
              ? "text-emerald-300"
              : summary.avgRecoveryScore >= 30
                ? "text-sky-300"
                : "text-zinc-400"
          }
        />
        <KpiTile
          label="Kurtarma Verimliliği"
          value={formatPct(summary.recoveryEfficiencyPct)}
          sub="riskten kurtarılabilir pay"
          accent={
            summary.recoveryEfficiencyPct >= 60
              ? "text-emerald-300"
              : summary.recoveryEfficiencyPct >= 35
                ? "text-violet-300"
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
          value={recoveryLevelFilter}
          onChange={(e) =>
            setRecoveryLevelFilter(e.target.value as RecoveryLevel | "all")
          }
          className={selectCls}
        >
          <option value="all">Tüm Kurtarma</option>
          {RECOVERY_LEVELS.map((level) => (
            <option key={level} value={level}>
              {RECOVERY_LEVEL_META[level].label}
            </option>
          ))}
        </select>

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
          onChange={(e) => setSortKey(e.target.value as RecoverySortKey)}
          className={selectCls}
        >
          {(Object.keys(SORT_LABEL) as RecoverySortKey[]).map((v) => (
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
            <RecoveryCardRow
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

// ── recovery card row ─────────────────────────────────────────

function RecoveryCardRow({
  card,
  isSelected,
  onSelect,
}: {
  card: RecoveryCard;
  isSelected: boolean;
  onSelect: (c: RecoveryCard) => void;
}) {
  const avatarCls = AVATAR_COLORS[stableAvatarIdx(card.id)];
  const recStyle = RECOVERY_STYLE[card.recoveryLevel];
  const leftBorder = RECOVERY_LEFT_BORDER[card.recoveryLevel];
  const stageStyle = STAGE_STYLE[card.stage];
  const isHighRecovery =
    card.recoveryLevel === "high" || card.recoveryLevel === "medium";

  return (
    <button
      onClick={() => onSelect(card)}
      className={[
        "w-full text-left rounded-lg border border-l-4 p-3 transition-colors",
        leftBorder,
        isSelected
          ? "border-indigo-500/40 bg-indigo-500/[0.07]"
          : isHighRecovery && card.recoveryLevel === "high"
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
            <span className="text-sm font-semibold text-white/90 truncate max-w-[140px]">
              {card.hotelName}
            </span>
            {/* Recovery level badge */}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${recStyle.bg} ${recStyle.text} ${recStyle.ring}`}
            >
              <span className={`h-1 w-1 rounded-full ${recStyle.dot}`} />
              {card.recoveryLevelLabel}
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
            {card.recoveryCategoryLabel} · {card.recoveryReason}
          </div>
        </div>

        {/* Recovery score + revenues */}
        <div className="shrink-0 text-right">
          <div
            className={`text-sm font-bold leading-tight tabular-nums ${recStyle.text}`}
          >
            {card.recoveryScore}
          </div>
          <div className="text-[10px] text-emerald-300/70 tabular-nums">
            {formatMrr(card.recoveryRevenue)} kurtarılabilir
          </div>
          <div className="text-[10px] text-rose-300/50 tabular-nums">
            {formatMrr(card.riskRevenue)} risk
          </div>
        </div>
      </div>

      {/* Footer row */}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <Badge variant={priorityVariant(card.priority)}>
          {PRIORITY_TR[card.priority]}
        </Badge>

        <span className="text-[10px] text-white/35 truncate max-w-[200px]">
          {card.recoveryAction.length > 50
            ? card.recoveryAction.slice(0, 50) + "…"
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
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
      <div>
        <p className="text-sm text-white/40">Eşleşen kurtarma fırsatı bulunamadı</p>
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
