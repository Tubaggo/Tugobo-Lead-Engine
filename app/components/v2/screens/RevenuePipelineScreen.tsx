"use client";

import { useState, useMemo } from "react";
import type {
  PipelineCard,
  PipelineFilter,
  PipelineSortKey,
  PipelineStage,
} from "@/app/components/v2/adapters/revenue-pipeline-adapter";
import {
  PIPELINE_STAGES,
  STAGE_META,
  computePipelineSummary,
  formatMrr,
} from "@/app/components/v2/adapters/revenue-pipeline-adapter";
import { Badge } from "@/app/components/v2/primitives/Badge";

// ── stage visual config ───────────────────────────────────────

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

// ── filter / sort labels ──────────────────────────────────────

const FILTER_LABEL: Record<PipelineFilter, string> = {
  all: "Tüm Pipeline",
  "high-value": "Yüksek Değer",
  "closing-soon": "Kapanışa Yakın",
  "follow-up-needed": "Takip Gerekli",
  "no-contact": "Temas Yok",
};

const SORT_LABEL: Record<PipelineSortKey, string> = {
  "pipeline-value": "Pipeline Değeri",
  opportunity: "Fırsat Skoru",
  stage: "Aşama",
  "last-contact": "Son Temas",
};

const PRIORITY_TR: Record<string, string> = {
  critical: "Kritik",
  high: "Yüksek",
  medium: "Orta",
  low: "Düşük",
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
  cards: PipelineCard[];
  selectedId: string | null;
  onSelect: (card: PipelineCard) => void;
};

export default function RevenuePipelineScreen({ cards, selectedId, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<PipelineFilter>("all");
  const [sortKey, setSortKey] = useState<PipelineSortKey>("pipeline-value");

  const summary = useMemo(() => computePipelineSummary(cards), [cards]);

  // Stage board data (always unfiltered)
  const stageGroups = useMemo(() => {
    const groups: Record<PipelineStage, PipelineCard[]> = {
      new: [],
      prioritized: [],
      contacted: [],
      "follow-up": [],
      demo: [],
      closing: [],
    };
    for (const c of cards) groups[c.stage].push(c);
    return groups;
  }, [cards]);

  const stageMrr = useMemo(() => {
    const mrr: Record<PipelineStage, number> = {
      new: 0,
      prioritized: 0,
      contacted: 0,
      "follow-up": 0,
      demo: 0,
      closing: 0,
    };
    for (const c of cards) mrr[c.stage] += c.weightedMrr;
    return mrr;
  }, [cards]);

  // Filtered + sorted opportunity list
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

    switch (filter) {
      case "high-value":
        result = result.filter((c) => c.weightedMrr >= 10_000);
        break;
      case "closing-soon":
        result = result.filter(
          (c) => c.stage === "closing" || c.stage === "demo",
        );
        break;
      case "follow-up-needed":
        result = result.filter((c) => c.stage === "follow-up");
        break;
      case "no-contact":
        result = result.filter(
          (c) => c.stage === "new" || c.stage === "prioritized",
        );
        break;
    }

    return [...result].sort((a, b) => {
      switch (sortKey) {
        case "pipeline-value":
          return b.weightedMrr - a.weightedMrr;
        case "opportunity":
          return b.opportunityScore - a.opportunityScore;
        case "stage":
          return b.stageRank - a.stageRank || b.weightedMrr - a.weightedMrr;
        case "last-contact":
          return (b.lastContactedAtMs ?? 0) - (a.lastContactedAtMs ?? 0);
        default:
          return 0;
      }
    });
  }, [cards, search, filter, sortKey]);

  const hasFilters =
    search.trim() !== "" || filter !== "all" || sortKey !== "pipeline-value";

  function clearFilters() {
    setSearch("");
    setFilter("all");
    setSortKey("pipeline-value");
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.025]">
      {/* KPI strip */}
      <div className="shrink-0 grid grid-cols-4 divide-x divide-white/[0.06] border-b border-white/[0.06]">
        <KpiTile
          label="Toplam Pipeline Geliri"
          value={formatMrr(summary.totalWeightedMrr)}
          sub="aylık ağırlıklı MRR"
          accent="text-emerald-300"
        />
        <KpiTile
          label="Aktif Fırsat"
          value={String(summary.activeCount)}
          sub="pipeline'daki lead sayısı"
          accent="text-white/80"
        />
        <KpiTile
          label="Kapanışa Yakın"
          value={String(summary.closingSoonCount)}
          sub="demo + kapanış aşaması"
          accent="text-violet-300"
        />
        <KpiTile
          label="Ort. Fırsat Skoru"
          value={`%${summary.avgOpportunityScore}`}
          sub="tüm pipeline ortalaması"
          accent="text-indigo-300"
        />
      </div>

      {/* Stage board */}
      <div className="shrink-0 border-b border-white/[0.06] p-3">
        <div className="grid grid-cols-6 gap-2">
          {PIPELINE_STAGES.map((stage) => {
            const meta = STAGE_META[stage];
            const style = STAGE_STYLE[stage];
            const group = stageGroups[stage];
            const mrr = stageMrr[stage];
            const topLeads = group.slice(0, 2);
            const rest = group.length - topLeads.length;

            return (
              <div
                key={stage}
                className={`rounded-lg border p-2.5 ${style.bg} ${style.border}`}
              >
                {/* Stage header */}
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${style.dot}`} />
                  <span className={`text-[10px] font-semibold truncate ${style.text}`}>
                    {meta.label}
                  </span>
                </div>

                {/* Count + MRR */}
                <div className="flex items-baseline gap-1.5 mb-2">
                  <span className="text-sm font-bold text-white/80">
                    {group.length}
                  </span>
                  <span className="text-[10px] text-white/35">lead</span>
                  {mrr > 0 && (
                    <span className={`ml-auto text-[10px] font-semibold ${style.text}`}>
                      {formatMrr(mrr)}
                    </span>
                  )}
                </div>

                {/* Top leads */}
                <div className="space-y-1">
                  {topLeads.map((c) => (
                    <div
                      key={c.id}
                      className="text-[10px] text-white/40 truncate leading-tight"
                    >
                      {c.hotelName}
                    </div>
                  ))}
                  {rest > 0 && (
                    <div className="text-[10px] text-white/25">
                      +{rest} daha
                    </div>
                  )}
                  {group.length === 0 && (
                    <div className="text-[10px] text-white/20 italic">boş</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Toolbar */}
      <div className="shrink-0 flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <input
          type="text"
          placeholder="Hotel veya şehir ara…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-44 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-xs text-white/80 placeholder:text-white/30 outline-none focus:ring-1 focus:ring-indigo-500/50"
        />

        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as PipelineFilter)}
          className={selectCls}
        >
          {(
            [
              "all",
              "high-value",
              "closing-soon",
              "follow-up-needed",
              "no-contact",
            ] as PipelineFilter[]
          ).map((v) => (
            <option key={v} value={v}>
              {FILTER_LABEL[v]}
            </option>
          ))}
        </select>

        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as PipelineSortKey)}
          className={selectCls}
        >
          {(Object.keys(SORT_LABEL) as PipelineSortKey[]).map((v) => (
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

      {/* Opportunity list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {filtered.length === 0 ? (
          <EmptyState onClear={clearFilters} />
        ) : (
          filtered.map((card) => (
            <PipelineCardRow
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

// ── pipeline card row ─────────────────────────────────────────

function PipelineCardRow({
  card,
  isSelected,
  onSelect,
}: {
  card: PipelineCard;
  isSelected: boolean;
  onSelect: (c: PipelineCard) => void;
}) {
  const avatarCls = AVATAR_COLORS[stableAvatarIdx(card.id)];
  const stageStyle = STAGE_STYLE[card.stage];
  const leftBorder = STAGE_LEFT_BORDER[card.stage];
  const isClosing = card.stage === "closing";

  return (
    <button
      onClick={() => onSelect(card)}
      className={[
        "w-full text-left rounded-lg border border-l-4 p-3 transition-colors",
        leftBorder,
        isSelected
          ? "border-indigo-500/40 bg-indigo-500/[0.07]"
          : isClosing
          ? "border-white/[0.06] bg-emerald-500/[0.04] hover:bg-emerald-500/[0.07]"
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
            <span className="text-sm font-semibold text-white/90 truncate max-w-[180px]">
              {card.hotelName}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${stageStyle.bg} ${stageStyle.text} ${stageStyle.ring}`}
            >
              <span className={`h-1 w-1 rounded-full ${stageStyle.dot}`} />
              {STAGE_META[card.stage].label}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-white/40">
            {card.city} · {card.hotelType}
          </div>
        </div>

        {/* MRR + score */}
        <div className="shrink-0 text-right">
          <div className="text-sm font-bold text-emerald-300 leading-tight">
            {formatMrr(card.weightedMrr)}
          </div>
          <div className="text-[10px] text-white/30">%{card.opportunityScore}</div>
        </div>
      </div>

      {/* Footer row */}
      <div className="mt-2 flex items-center gap-2.5 flex-wrap">
        <Badge variant={priorityVariant(card.priority)}>
          {PRIORITY_TR[card.priority]}
        </Badge>

        {card.icpScore > 0 && (
          <span className="text-[10px] text-white/35">
            ICP %{card.icpScore}
          </span>
        )}

        <span className="text-[10px] text-white/40">{card.actionLabel}</span>

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
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
      <div>
        <p className="text-sm text-white/40">Eşleşen fırsat bulunamadı</p>
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
