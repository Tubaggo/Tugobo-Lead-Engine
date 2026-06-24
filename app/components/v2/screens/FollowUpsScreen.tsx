"use client";

import { useState, useMemo } from "react";
import type {
  FollowUpCard,
  FollowUpState,
  PriorityFilter,
  StateFilter,
  FollowUpSortKey,
  LeadTemperature,
} from "@/app/components/v2/adapters/follow-ups-adapter";
import { computeFollowUpSummary, stateRank } from "@/app/components/v2/adapters/follow-ups-adapter";
import { Badge } from "@/app/components/v2/primitives/Badge";

type Props = {
  cards: FollowUpCard[];
  selectedId: string | null;
  onSelect: (card: FollowUpCard) => void;
};

// ── constants ─────────────────────────────────────────────────

const STATE_FILTER_LABEL: Record<StateFilter, string> = {
  all: "Tüm Takipler",
  today: "Bugün",
  "this-week": "Bu Hafta",
  overdue: "Gecikmiş",
  done: "Tamamlandı",
};

const PRIORITY_FILTER_LABEL: Record<PriorityFilter, string> = {
  all: "Tüm Öncelikler",
  critical: "Kritik",
  high: "Yüksek",
  medium: "Orta",
  low: "Düşük",
};

const SORT_LABEL: Record<FollowUpSortKey, string> = {
  priority: "Takip Önceliği",
  opportunity: "Fırsat Skoru",
  icp: "ICP Skoru",
  "last-contact": "Son Temas",
};

const STATE_BADGE: Record<
  FollowUpState,
  { label: string; cls: string }
> = {
  overdue: { label: "Gecikmiş", cls: "bg-rose-500/20 text-rose-300 ring-rose-500/30" },
  today: { label: "Bugün Ara", cls: "bg-amber-500/20 text-amber-300 ring-amber-500/30" },
  "this-week": { label: "Bu Hafta", cls: "bg-sky-500/20 text-sky-300 ring-sky-500/30" },
  scheduled: { label: "Planlandı", cls: "bg-zinc-600/20 text-zinc-400 ring-zinc-600/20" },
  done: { label: "Tamamlandı", cls: "bg-emerald-500/20 text-emerald-300 ring-emerald-500/30" },
};

const STATE_LEFT_BORDER: Record<FollowUpState, string> = {
  overdue: "border-l-rose-500/70",
  today: "border-l-amber-500/70",
  "this-week": "border-l-sky-500/40",
  scheduled: "border-l-white/[0.06]",
  done: "border-l-emerald-500/30",
};

const TEMP_DOT: Record<LeadTemperature, string> = {
  hot: "bg-rose-400",
  warm: "bg-amber-400",
  cold: "bg-zinc-600",
};

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

const PRIORITY_TR: Record<string, string> = {
  critical: "Kritik",
  high: "Yüksek",
  medium: "Orta",
  low: "Düşük",
};

const selectCls =
  "rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-xs text-white/70 outline-none focus:ring-1 focus:ring-indigo-500/50 hover:bg-white/[0.07] transition-colors";

// ── component ─────────────────────────────────────────────────

export default function FollowUpsScreen({ cards, selectedId, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [sortKey, setSortKey] = useState<FollowUpSortKey>("priority");

  const summary = useMemo(() => computeFollowUpSummary(cards), [cards]);

  const filtered = useMemo(() => {
    let result = cards;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) => c.hotelName.toLowerCase().includes(q) || c.city.toLowerCase().includes(q),
      );
    }

    if (stateFilter !== "all") {
      if (stateFilter === "today") {
        result = result.filter(
          (c) => c.followUpState === "today" || c.followUpState === "overdue",
        );
      } else {
        result = result.filter((c) => c.followUpState === stateFilter);
      }
    }

    if (priorityFilter !== "all") {
      result = result.filter((c) => c.priority === priorityFilter);
    }

    return [...result].sort((a, b) => {
      switch (sortKey) {
        case "priority":
          return (
            stateRank(b.followUpState) - stateRank(a.followUpState) ||
            b.outreachPriority - a.outreachPriority
          );
        case "opportunity":
          return b.opportunityScore - a.opportunityScore;
        case "icp":
          return b.icpScore - a.icpScore;
        case "last-contact":
          return (b.lastContactedAtMs ?? 0) - (a.lastContactedAtMs ?? 0);
        default:
          return 0;
      }
    });
  }, [cards, search, stateFilter, priorityFilter, sortKey]);

  const hasFilters =
    search.trim() !== "" ||
    stateFilter !== "all" ||
    priorityFilter !== "all" ||
    sortKey !== "priority";

  function clearFilters() {
    setSearch("");
    setStateFilter("all");
    setPriorityFilter("all");
    setSortKey("priority");
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.025]">
      {/* KPI strip */}
      <div className="shrink-0 grid grid-cols-4 divide-x divide-white/[0.06] border-b border-white/[0.06]">
        <KpiTile
          label="Takip Bekleyen"
          value={String(summary.pendingCount)}
          sub={`/ ${summary.total} toplam lead`}
          accent="text-white/80"
        />
        <KpiTile
          label="Bugün Aranacak"
          value={String(summary.todayCount)}
          sub={summary.overdueCount > 0 ? `${summary.overdueCount} gecikmiş dahil` : "acil aksiyon"}
          accent="text-amber-300"
        />
        <KpiTile
          label="Geciken Takip"
          value={String(summary.overdueCount)}
          sub="öncelikli müdahale"
          accent="text-rose-300"
        />
        <KpiTile
          label="Sıcak Lead"
          value={String(summary.hotCount)}
          sub="yüksek ivme"
          accent="text-orange-300"
        />
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
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
          className={selectCls}
        >
          {(["all", "critical", "high", "medium", "low"] as PriorityFilter[]).map((v) => (
            <option key={v} value={v}>
              {PRIORITY_FILTER_LABEL[v]}
            </option>
          ))}
        </select>

        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value as StateFilter)}
          className={selectCls}
        >
          {(["all", "today", "this-week", "overdue", "done"] as StateFilter[]).map((v) => (
            <option key={v} value={v}>
              {STATE_FILTER_LABEL[v]}
            </option>
          ))}
        </select>

        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as FollowUpSortKey)}
          className={selectCls}
        >
          {(Object.keys(SORT_LABEL) as FollowUpSortKey[]).map((v) => (
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

      {/* Card list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {filtered.length === 0 ? (
          <EmptyState onClear={clearFilters} />
        ) : (
          filtered.map((card) => (
            <FollowUpCardRow
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
      <span className="text-[10px] font-medium uppercase tracking-wide text-white/40">{label}</span>
      <span className={`text-2xl font-bold ${accent}`}>{value}</span>
      <span className="text-[10px] text-white/30">{sub}</span>
    </div>
  );
}

// ── Follow-up card row ────────────────────────────────────────

function FollowUpCardRow({
  card,
  isSelected,
  onSelect,
}: {
  card: FollowUpCard;
  isSelected: boolean;
  onSelect: (c: FollowUpCard) => void;
}) {
  const avatarCls = AVATAR_COLORS[stableAvatarIdx(card.id)];
  const stateBadge = STATE_BADGE[card.followUpState];
  const leftBorder = STATE_LEFT_BORDER[card.followUpState];
  const isOverdue = card.followUpState === "overdue";

  return (
    <button
      onClick={() => onSelect(card)}
      className={[
        "w-full text-left rounded-lg border border-l-4 p-3 transition-colors",
        leftBorder,
        isSelected
          ? "border-indigo-500/40 bg-indigo-500/[0.07]"
          : isOverdue
          ? "border-white/[0.06] bg-rose-500/[0.04] hover:bg-rose-500/[0.07]"
          : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]",
      ].join(" ")}
    >
      {/* Header row */}
      <div className="flex items-start gap-2.5">
        {/* Avatar */}
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${avatarCls}`}
        >
          {card.hotelName.charAt(0).toUpperCase()}
        </div>

        {/* Name + city */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-white/90 truncate max-w-[180px]">
              {card.hotelName}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${stateBadge.cls}`}
            >
              {stateBadge.label}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-white/40">
            {card.city} · {card.hotelType}
          </div>
        </div>

        {/* Scores */}
        <div className="shrink-0 text-right">
          <div className="text-base font-bold text-white/80 leading-tight">
            %{card.opportunityScore}
          </div>
          <div className="text-[10px] text-white/30">Fırsat</div>
        </div>
      </div>

      {/* Footer row */}
      <div className="mt-2.5 flex items-center gap-3 flex-wrap">
        <Badge variant={priorityVariant(card.priority)}>
          {PRIORITY_TR[card.priority]}
        </Badge>

        {card.icpScore > 0 && (
          <span className="text-[10px] text-white/40">
            ICP %{card.icpScore}
          </span>
        )}

        <span className="flex items-center gap-1">
          <span className={`h-1.5 w-1.5 rounded-full ${TEMP_DOT[card.leadTemperature]}`} />
          <span className="text-[10px] text-white/40">{card.actionLabel}</span>
        </span>

        <span className="ml-auto text-[10px] text-white/30">
          {card.lastContactLabel !== "—"
            ? `Son temas: ${card.lastContactLabel}`
            : "İlk temas bekleniyor"}
        </span>
      </div>
    </button>
  );
}

// ── Empty state ───────────────────────────────────────────────

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
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
        />
      </svg>
      <div>
        <p className="text-sm text-white/40">Eşleşen takip bulunamadı</p>
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
