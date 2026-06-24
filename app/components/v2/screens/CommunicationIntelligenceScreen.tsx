"use client";

import { useState, useMemo } from "react";
import type {
  CommCard,
  ChannelFilter,
  CommSortKey,
  BestChannel,
  ChannelStatus,
  LeadTemperature,
} from "@/app/components/v2/adapters/communication-intelligence-adapter";
import { computeCommSummary } from "@/app/components/v2/adapters/communication-intelligence-adapter";
import { Badge } from "@/app/components/v2/primitives/Badge";

type Props = {
  cards: CommCard[];
  selectedId: string | null;
  onSelect: (card: CommCard) => void;
};

const CHANNEL_FILTER_LABEL: Record<ChannelFilter, string> = {
  all: "Tümü",
  whatsapp: "WhatsApp Hazır",
  instagram: "Instagram Hazır",
  website: "Website Hazır",
  multi: "Çok Kanal",
};

const SORT_LABEL: Record<CommSortKey, string> = {
  "comm-score": "İletişim Skoru",
  opportunity: "Fırsat Skoru",
  icp: "ICP Skoru",
  priority: "Öncelik",
};

const BEST_CHANNEL_CLS: Record<BestChannel, string> = {
  WhatsApp: "bg-emerald-500/20 text-emerald-300 ring-emerald-500/30",
  Instagram: "bg-violet-500/20 text-violet-300 ring-violet-500/30",
  Website: "bg-sky-500/20 text-sky-300 ring-sky-500/30",
  Telefon: "bg-amber-500/20 text-amber-300 ring-amber-500/30",
  Çoklu: "bg-indigo-500/20 text-indigo-300 ring-indigo-500/30",
};

const TEMP_DOT: Record<LeadTemperature, string> = {
  hot: "bg-rose-400",
  warm: "bg-amber-400",
  cold: "bg-zinc-600",
};

const TEMP_LABEL: Record<LeadTemperature, string> = {
  hot: "Sıcak",
  warm: "Ilık",
  cold: "Soğuk",
};

function statusDot(s: ChannelStatus) {
  switch (s) {
    case "verified":
      return "bg-emerald-400";
    case "likely":
      return "bg-amber-400";
    case "partial":
      return "bg-zinc-500";
    default:
      return "bg-zinc-700";
  }
}

const AVATAR_COLORS = [
  "bg-emerald-500/25 text-emerald-300",
  "bg-violet-500/25 text-violet-300",
  "bg-sky-500/25 text-sky-300",
  "bg-indigo-500/25 text-indigo-300",
  "bg-amber-500/25 text-amber-300",
  "bg-rose-500/25 text-rose-300",
  "bg-teal-500/25 text-teal-300",
];

function stableAvatarIdx(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % AVATAR_COLORS.length;
}

const badgePill =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset";

const selectCls =
  "rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-xs text-white/70 outline-none focus:ring-1 focus:ring-indigo-500/50 hover:bg-white/[0.07] transition-colors";

export default function CommunicationIntelligenceScreen({ cards, selectedId, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [sortKey, setSortKey] = useState<CommSortKey>("comm-score");

  const summary = useMemo(() => computeCommSummary(cards), [cards]);

  const filtered = useMemo(() => {
    let result = cards;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) => c.hotelName.toLowerCase().includes(q) || c.city.toLowerCase().includes(q),
      );
    }

    switch (channelFilter) {
      case "whatsapp":
        result = result.filter((c) => c.whatsappScore > 40);
        break;
      case "instagram":
        result = result.filter((c) => c.instagramScore > 40);
        break;
      case "website":
        result = result.filter((c) => c.websiteScore > 40);
        break;
      case "multi":
        result = result.filter((c) => c.isMultiChannel);
        break;
    }

    return [...result].sort((a, b) => {
      switch (sortKey) {
        case "comm-score":
          return b.commScore - a.commScore;
        case "opportunity":
          return b.opportunityScore - a.opportunityScore;
        case "icp":
          return b.icpScore - a.icpScore;
        case "priority":
          return b.outreachPriority - a.outreachPriority;
        default:
          return b.commScore - a.commScore;
      }
    });
  }, [cards, search, channelFilter, sortKey]);

  const hasFilters = search.trim() !== "" || channelFilter !== "all" || sortKey !== "comm-score";

  function clearFilters() {
    setSearch("");
    setChannelFilter("all");
    setSortKey("comm-score");
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.025]">
      {/* Summary strip */}
      <div className="shrink-0 grid grid-cols-4 divide-x divide-white/[0.06] border-b border-white/[0.06]">
        <KpiTile
          label="WhatsApp Hazır"
          value={String(summary.whatsappReadyCount)}
          sub={`/ ${summary.total} lead`}
          accent="text-emerald-300"
        />
        <KpiTile
          label="Instagram Hazır"
          value={String(summary.instagramReadyCount)}
          sub="aktif Instagram sinyal"
          accent="text-violet-300"
        />
        <KpiTile
          label="Website Hazır"
          value={String(summary.websiteReadyCount)}
          sub="aktif web varlığı"
          accent="text-sky-300"
        />
        <KpiTile
          label="Çok Kanal"
          value={String(summary.multiChannelCount)}
          sub="2+ kanal aktif"
          accent="text-indigo-300"
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
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value as ChannelFilter)}
          className={selectCls}
        >
          {(["all", "whatsapp", "instagram", "website", "multi"] as ChannelFilter[]).map((v) => (
            <option key={v} value={v}>
              {CHANNEL_FILTER_LABEL[v]}
            </option>
          ))}
        </select>

        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as CommSortKey)}
          className={selectCls}
        >
          {(Object.keys(SORT_LABEL) as CommSortKey[]).map((v) => (
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
            <CommCardRow
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

function CommCardRow({
  card,
  isSelected,
  onSelect,
}: {
  card: CommCard;
  isSelected: boolean;
  onSelect: (c: CommCard) => void;
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
            {/* Best channel */}
            <span
              className={`${badgePill} ${BEST_CHANNEL_CLS[card.bestChannel]}`}
            >
              {card.bestChannel}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-white/40">
            {card.city} · {card.hotelType}
          </div>
        </div>

        {/* Comm score + temperature */}
        <div className="shrink-0 flex flex-col items-end gap-1">
          <div className="text-xl font-bold text-white/90 leading-tight">
            {card.commScore > 0 ? `%${card.commScore}` : "—"}
          </div>
          <div className="flex items-center gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${TEMP_DOT[card.leadTemperature]}`} />
            <span className="text-[10px] text-white/35">{TEMP_LABEL[card.leadTemperature]}</span>
          </div>
        </div>
      </div>

      {/* Channel status indicators */}
      <div className="mt-2.5 flex items-center gap-3">
        <ChannelIndicator label="WA" dot={statusDot(card.whatsappStatus)} score={card.whatsappScore} />
        <ChannelIndicator label="IG" dot={statusDot(card.instagramStatus)} score={card.instagramScore} />
        <ChannelIndicator label="Web" dot={statusDot(card.websiteStatus)} score={card.websiteScore} />
        {card.isMultiChannel && (
          <span className="ml-auto text-[10px] text-indigo-400 font-medium">
            {card.channelCount} kanal
          </span>
        )}
        <span className="ml-auto">
          <Badge variant={priorityVariant(card.priority)}>
            {PRIORITY_TR[card.priority]}
          </Badge>
        </span>
      </div>
    </button>
  );
}

function ChannelIndicator({
  label,
  dot,
  score,
}: {
  label: string;
  dot: string;
  score: number;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      <span className="text-[10px] text-white/40">{label}</span>
      {score > 0 && (
        <span className="text-[10px] text-white/25 tabular-nums">{score}</span>
      )}
    </div>
  );
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
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
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
