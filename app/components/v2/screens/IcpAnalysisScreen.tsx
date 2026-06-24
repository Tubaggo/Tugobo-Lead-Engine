"use client";

import { useState, useMemo } from "react";
import type {
  IcpCard,
  IcpFitTier,
  EstimatedDemandVolume,
  DirectBookingReadiness,
  OtaDependencyLevel,
} from "@/app/components/v2/adapters/icp-analysis-adapter";
import { computeIcpSummary } from "@/app/components/v2/adapters/icp-analysis-adapter";
import { Badge } from "@/app/components/v2/primitives/Badge";

type IcpTierFilter = "all" | "strong" | "good" | "weak" | "no-data";
type SortKey = "icp" | "tugobo" | "demand" | "direct-booking" | "multi-channel" | "opportunity";

type Props = {
  cards: IcpCard[];
  selectedId: string | null;
  onSelect: (card: IcpCard) => void;
};

const DEMAND_LABEL: Record<EstimatedDemandVolume, string> = {
  high: "Yüksek Talep",
  medium: "Orta Talep",
  low: "Düşük Talep",
  unknown: "—",
};

const DEMAND_RANK: Record<EstimatedDemandVolume, number> = {
  high: 3,
  medium: 2,
  low: 1,
  unknown: 0,
};

const DIRECT_LABEL: Record<DirectBookingReadiness, string> = {
  high: "Direkt Hazır",
  medium: "Orta Direkt",
  low: "Zayıf Direkt",
  unknown: "—",
};

const DIRECT_RANK: Record<DirectBookingReadiness, number> = {
  high: 3,
  medium: 2,
  low: 1,
  unknown: 0,
};

const OTA_LABEL: Record<OtaDependencyLevel, string> = {
  high: "OTA Bağımlı",
  medium: "Karma OTA",
  low: "Düşük OTA",
  unknown: "—",
};

const ICP_TIER_LABEL: Record<IcpFitTier, string> = {
  strong: "Güçlü ICP",
  good: "İyi ICP",
  weak: "Zayıf ICP",
  "no-data": "Veri Yok",
};

const TIER_FILTER_LABEL: Record<IcpTierFilter, string> = {
  all: "Tümü",
  strong: "Güçlü",
  good: "İyi",
  weak: "Zayıf",
  "no-data": "Veri Yok",
};

const SORT_LABEL: Record<SortKey, string> = {
  icp: "ICP Skoru",
  tugobo: "Tugobo Fit",
  demand: "Talep Hacmi",
  "direct-booking": "Direkt Hazırlık",
  "multi-channel": "Çok Kanal",
  opportunity: "Fırsat Skoru",
};

function icpTierBadgeVariant(tier: IcpFitTier) {
  switch (tier) {
    case "strong":
      return "enterprise" as const;
    case "good":
      return "professional" as const;
    case "weak":
      return "starter" as const;
    default:
      return "default" as const;
  }
}

function demandPillCls(v: EstimatedDemandVolume) {
  if (v === "high") return "bg-emerald-500/15 text-emerald-400 ring-emerald-500/25";
  if (v === "medium") return "bg-amber-500/15 text-amber-400 ring-amber-500/25";
  if (v === "low") return "bg-zinc-600/20 text-zinc-500 ring-zinc-600/20";
  return "bg-zinc-700/20 text-zinc-600 ring-zinc-700/20";
}

function directPillCls(v: DirectBookingReadiness) {
  if (v === "high") return "bg-emerald-500/15 text-emerald-400 ring-emerald-500/25";
  if (v === "medium") return "bg-sky-500/15 text-sky-400 ring-sky-500/25";
  if (v === "low") return "bg-rose-500/15 text-rose-400 ring-rose-500/25";
  return "bg-zinc-700/20 text-zinc-600 ring-zinc-700/20";
}

function otaPillCls(v: OtaDependencyLevel) {
  if (v === "high") return "bg-amber-500/15 text-amber-400 ring-amber-500/25";
  if (v === "medium") return "bg-zinc-500/15 text-zinc-400 ring-zinc-500/25";
  if (v === "low") return "bg-emerald-500/15 text-emerald-400 ring-emerald-500/25";
  return "bg-zinc-700/20 text-zinc-600 ring-zinc-700/20";
}

function channelPillCls(active: boolean) {
  return active
    ? "bg-indigo-500/15 text-indigo-400 ring-indigo-500/25"
    : "bg-zinc-700/20 text-zinc-600 ring-zinc-700/20";
}

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
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return h % AVATAR_COLORS.length;
}

const smallPill = "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset";
const selectCls =
  "rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-xs text-white/70 outline-none focus:ring-1 focus:ring-indigo-500/50 hover:bg-white/[0.07] transition-colors";

export default function IcpAnalysisScreen({ cards, selectedId, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<IcpTierFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("icp");

  const summary = useMemo(() => computeIcpSummary(cards), [cards]);

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

    if (tierFilter !== "all") {
      result = result.filter((c) => c.icpFitTier === tierFilter);
    }

    return [...result].sort((a, b) => {
      switch (sortKey) {
        case "icp":
          return b.icpScore - a.icpScore;
        case "tugobo":
          return b.tugoboFitScore - a.tugoboFitScore;
        case "demand":
          return DEMAND_RANK[b.demandVolume] - DEMAND_RANK[a.demandVolume];
        case "direct-booking":
          return DIRECT_RANK[b.directBookingReadiness] - DIRECT_RANK[a.directBookingReadiness];
        case "multi-channel":
          return b.multiChannelScore - a.multiChannelScore;
        case "opportunity":
          return b.opportunityScore - a.opportunityScore;
        default:
          return b.icpScore - a.icpScore;
      }
    });
  }, [cards, search, tierFilter, sortKey]);

  function clearFilters() {
    setSearch("");
    setTierFilter("all");
    setSortKey("icp");
  }

  const hasFilters = search.trim() !== "" || tierFilter !== "all" || sortKey !== "icp";

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.025]">
      {/* Summary strip */}
      <div className="shrink-0 grid grid-cols-4 divide-x divide-white/[0.06] border-b border-white/[0.06]">
        <KpiTile
          label="Güçlü ICP Uyum"
          value={String(summary.strongCount)}
          sub={`/ ${summary.total} lead`}
          accent="text-purple-300"
        />
        <KpiTile
          label="Ort. ICP Skoru"
          value={summary.avgIcpScore > 0 ? `%${summary.avgIcpScore}` : "—"}
          sub="Skorlananlar arasında"
          accent="text-indigo-300"
        />
        <KpiTile
          label="Yüksek Talep"
          value={String(summary.highDemandCount)}
          sub="yüksek talep hacimli lead"
          accent="text-emerald-300"
        />
        <KpiTile
          label="Operasyonel Uyum"
          value={String(summary.operationalFitCount)}
          sub="Tugobo'ya hazır"
          accent="text-sky-300"
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
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value as IcpTierFilter)}
          className={selectCls}
        >
          {(["all", "strong", "good", "weak", "no-data"] as IcpTierFilter[]).map((v) => (
            <option key={v} value={v}>
              {TIER_FILTER_LABEL[v]}
            </option>
          ))}
        </select>

        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className={selectCls}
        >
          {(Object.keys(SORT_LABEL) as SortKey[]).map((v) => (
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

      {/* Lead list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {filtered.length === 0 ? (
          <EmptyState onClear={clearFilters} />
        ) : (
          filtered.map((card) => (
            <IcpCardRow
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

function IcpCardRow({
  card,
  isSelected,
  onSelect,
}: {
  card: IcpCard;
  isSelected: boolean;
  onSelect: (c: IcpCard) => void;
}) {
  const avatarCls = AVATAR_COLORS[stableAvatarIdx(card.id)];

  return (
    <button
      onClick={() => onSelect(card)}
      className={`w-full text-left rounded-lg border p-3 transition-colors ${
        isSelected
          ? "border-indigo-500/40 bg-indigo-500/[0.07]"
          : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]"
      }`}
    >
      {/* Header row */}
      <div className="flex items-start gap-2.5">
        {/* Avatar */}
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${avatarCls}`}
        >
          {card.hotelName.charAt(0).toUpperCase()}
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-white/90 truncate max-w-[180px]">
              {card.hotelName}
            </span>
            <Badge variant={icpTierBadgeVariant(card.icpFitTier)}>
              {ICP_TIER_LABEL[card.icpFitTier]}
            </Badge>
          </div>
          <div className="mt-0.5 text-[11px] text-white/40">
            {card.city} · {card.hotelType}
          </div>
        </div>

        {/* ICP Score */}
        <div className="shrink-0 text-right">
          <div className="text-xl font-bold text-white/90 leading-tight">
            {card.icpScore > 0 ? `%${card.icpScore}` : "—"}
          </div>
          <div className="text-[10px] text-white/35 mt-0.5">ICP</div>
        </div>
      </div>

      {/* Signal pills */}
      <div className="mt-2.5 flex flex-wrap gap-1.5 items-center">
        {card.demandVolume !== "unknown" && (
          <span className={`${smallPill} ${demandPillCls(card.demandVolume)}`}>
            {DEMAND_LABEL[card.demandVolume]}
          </span>
        )}
        {card.directBookingReadiness !== "unknown" && (
          <span className={`${smallPill} ${directPillCls(card.directBookingReadiness)}`}>
            {DIRECT_LABEL[card.directBookingReadiness]}
          </span>
        )}
        {card.otaDependencyLevel !== "unknown" && (
          <span className={`${smallPill} ${otaPillCls(card.otaDependencyLevel)}`}>
            {OTA_LABEL[card.otaDependencyLevel]}
          </span>
        )}
        {card.multiChannelScore > 0 && (
          <span className={`${smallPill} bg-zinc-600/20 text-zinc-400 ring-zinc-600/20`}>
            Çok Kanal {card.multiChannelScore}
          </span>
        )}
        {card.hasInstagram && (
          <span className={`${smallPill} ${channelPillCls(true)}`}>IG</span>
        )}
        {card.hasWhatsApp && (
          <span className={`${smallPill} ${channelPillCls(true)}`}>WA</span>
        )}
        {card.operationalFit && (
          <span className="text-[10px] text-emerald-400 font-semibold ml-auto">
            ✓ Op. Uyum
          </span>
        )}
      </div>
    </button>
  );
}

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
          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
      <div>
        <p className="text-sm text-white/40">Eşleşen lead bulunamadı</p>
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
