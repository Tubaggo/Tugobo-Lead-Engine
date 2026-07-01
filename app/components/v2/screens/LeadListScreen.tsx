"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/app/components/v2/primitives/Badge";
import type { LeadCard, WebsiteStatus, WhatsAppStatus } from "@/app/components/v2/adapters/lead-list-adapter";
import type { PackageTier, Priority, ActionChannel } from "@/app/components/v2/mock/mock-queue";

/* ── avatar ─────────────────────────────────────────────────── */

const AVATAR_COLORS = [
  "bg-amber-500/30 text-amber-200",
  "bg-violet-500/30 text-violet-200",
  "bg-indigo-500/30 text-indigo-200",
  "bg-rose-500/30 text-rose-200",
  "bg-teal-500/30 text-teal-200",
  "bg-sky-500/30 text-sky-200",
  "bg-orange-500/30 text-orange-200",
  "bg-emerald-500/30 text-emerald-200",
];

function stableAvatarIdx(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % AVATAR_COLORS.length;
}

function hotelInitials(name: string): string {
  const words = name.split(" ").filter((w) => w.length > 1 && w !== "&");
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
}

/* ── helpers ─────────────────────────────────────────────────── */

function scoreColor(n: number): string {
  if (n >= 70) return "text-emerald-400";
  if (n >= 50) return "text-amber-400";
  return "text-rose-400";
}

function packageVariant(
  tier: PackageTier,
): "enterprise" | "growth" | "professional" | "starter" {
  const map: Record<PackageTier, "enterprise" | "growth" | "professional" | "starter"> = {
    Enterprise: "enterprise",
    Growth: "growth",
    Professional: "professional",
    Starter: "starter",
  };
  return map[tier];
}

const PRIORITY_LABEL: Record<Priority, string> = {
  critical: "Kritik",
  high: "Yüksek",
  medium: "Orta",
  low: "Düşük",
};

/* ── SVG icons ──────────────────────────────────────────────── */

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className="h-3.5 w-3.5 shrink-0 text-zinc-600"
      aria-hidden
    >
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ChannelIcon({
  channel,
  urgent,
}: {
  channel: ActionChannel;
  urgent?: boolean;
}) {
  const color = urgent
    ? "text-emerald-400"
    : channel === "WhatsApp"
    ? "text-emerald-500"
    : channel === "Arama"
    ? "text-sky-400"
    : "text-amber-400";

  if (channel === "WhatsApp") {
    return (
      <svg
        viewBox="0 0 16 16"
        fill="currentColor"
        className={`h-3.5 w-3.5 shrink-0 ${color}`}
        aria-hidden
      >
        <path d="M8 1a7 7 0 0 1 6.06 10.47L15 15l-3.67-.91A7 7 0 1 1 8 1Zm0 1.4a5.6 5.6 0 0 0-4.84 8.39l.15.26-.77 1.92 1.98-.75.25.15A5.6 5.6 0 1 0 8 2.4Zm-1.8 2.7c.14 0 .29.01.41.04.14.04.3.08.44.4l.54 1.33c.1.25.03.46-.1.63l-.33.41c-.12.15-.11.3-.04.45.4.84 1.1 1.55 1.9 1.95.14.07.28.08.4-.05l.37-.44c.15-.18.36-.23.56-.13l1.34.67c.3.15.32.3.31.44-.05.83-.62 1.41-1.46 1.41H11c-.8 0-1.81-.4-3.15-1.7C6.5 9.43 5.9 8.3 5.9 7.48c0-.73.56-1.38 1.3-1.38Z" />
      </svg>
    );
  }
  if (channel === "Arama") {
    return (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        className={`h-3.5 w-3.5 shrink-0 ${color}`}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 3.5c0 5 4.5 9.5 9.5 9.5l.5-2.5-3-1-1 1.5A7 7 0 0 1 6 7.5L7.5 6l-1-3-3 .5z" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className={`h-3.5 w-3.5 shrink-0 ${color}`}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
      <path d="M2 5.5l6 4 6-4" />
    </svg>
  );
}

/* ── channel status pills ─────────────────────────────────────── */

function WebPill({ status }: { status: WebsiteStatus }) {
  if (status === "active") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        Web
      </span>
    );
  }
  if (status === "candidate") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-400 ring-1 ring-inset ring-amber-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        Web?
      </span>
    );
  }
  return (
    <span className="rounded-full bg-zinc-700/20 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-700 ring-1 ring-inset ring-zinc-700/20">
      Web
    </span>
  );
}

function WaPill({ status }: { status: WhatsAppStatus }) {
  if (status === "high") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        WA
      </span>
    );
  }
  if (status === "medium") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-sky-400 ring-1 ring-inset ring-sky-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
        WA
      </span>
    );
  }
  if (status === "low") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-500 ring-1 ring-inset ring-amber-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        WA
      </span>
    );
  }
  return (
    <span className="rounded-full bg-zinc-700/20 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-700 ring-1 ring-inset ring-zinc-700/20">
      WA
    </span>
  );
}

function InstaPill({ active }: { active: boolean }) {
  if (active) {
    return (
      <span className="flex items-center gap-1 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-violet-400 ring-1 ring-inset ring-violet-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
        IG
      </span>
    );
  }
  return (
    <span className="rounded-full bg-zinc-700/20 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-700 ring-1 ring-inset ring-zinc-700/20">
      IG
    </span>
  );
}

/* ── filter types ─────────────────────────────────────────────── */

type TierFilter = "all" | PackageTier;
type PriorityFilter = "all" | Priority;
type IcpFilter = "all" | "strong" | "good" | "weak";
type SortKey = "opportunity" | "icp" | "revenue";

const selectCls =
  "h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 text-[11px] text-zinc-400 outline-none hover:bg-white/[0.06] hover:text-zinc-200 focus:ring-1 focus:ring-indigo-500/40 transition-colors duration-150 cursor-pointer";

/* ── individual card ──────────────────────────────────────────── */

function LeadCardItem({
  card,
  isSelected,
  onSelect,
}: {
  card: LeadCard;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const initials = hotelInitials(card.hotelName);
  const avatarColor = AVATAR_COLORS[stableAvatarIdx(card.id)];
  const isUrgent = card.actionLabel === "Hemen Ara";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col rounded-xl border p-4 text-left transition-all ${
        isSelected
          ? "border-indigo-500/40 bg-indigo-500/[0.07] shadow-lg shadow-indigo-900/10 ring-1 ring-inset ring-indigo-500/20"
          : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.13] hover:bg-white/[0.04] hover:shadow-md hover:shadow-black/20"
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${avatarColor}`}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[12px] font-semibold leading-snug text-zinc-100">
              {card.hotelName}
            </p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="text-[10px] text-zinc-600">{card.city}</span>
              <span className="text-[10px] text-zinc-700">·</span>
              <Badge variant={packageVariant(card.packageTier)}>
                {card.packageTier}
              </Badge>
            </div>
          </div>
        </div>
        <Badge variant={card.priority}>{PRIORITY_LABEL[card.priority]}</Badge>
      </div>

      {/* Score strip */}
      <div className="mt-3 grid grid-cols-3 divide-x divide-white/[0.05] rounded-lg border border-white/[0.05] bg-black/20">
        <div className="py-2 text-center">
          <p
            className={`text-[15px] font-bold tabular-nums leading-none ${scoreColor(card.opportunityScore)}`}
          >
            %{card.opportunityScore}
          </p>
          <p className="mt-0.5 text-[8px] uppercase tracking-wider text-zinc-600">
            Fırsat
          </p>
        </div>
        <div className="py-2 text-center">
          <p
            className={`text-[15px] font-bold tabular-nums leading-none ${
              card.icpScore > 0 ? scoreColor(card.icpScore) : "text-zinc-700"
            }`}
          >
            {card.icpScore > 0 ? `%${card.icpScore}` : "—"}
          </p>
          <p className="mt-0.5 text-[8px] uppercase tracking-wider text-zinc-600">
            ICP
          </p>
        </div>
        <div className="py-2 text-center">
          <p
            className={`text-[15px] font-bold tabular-nums leading-none ${scoreColor(card.confidenceScore)}`}
          >
            %{card.confidenceScore}
          </p>
          <p className="mt-0.5 text-[8px] uppercase tracking-wider text-zinc-600">
            Güven
          </p>
        </div>
      </div>

      {/* Next action */}
      <div className="mt-3 flex items-start gap-2">
        <div className="mt-px">
          <ChannelIcon channel={card.actionChannel} urgent={isUrgent} />
        </div>
        <div className="min-w-0">
          <span
            className={`text-[11px] font-semibold ${
              isUrgent ? "text-emerald-400" : "text-sky-300"
            }`}
          >
            {card.actionLabel}
          </span>
          {card.actionSub && (
            <p className="mt-0.5 truncate text-[10px] text-zinc-600">
              {card.actionSub}
            </p>
          )}
        </div>
      </div>

      {/* Footer: channels + last activity */}
      <div className="mt-3 flex items-center justify-between border-t border-white/[0.05] pt-2.5">
        <div className="flex items-center gap-1.5">
          <WebPill status={card.websiteStatus} />
          <WaPill status={card.whatsappStatus} />
          <InstaPill active={card.hasInstagram} />
        </div>
        <div className="text-right">
          <p className="text-[10px] font-medium text-zinc-500">
            {card.lastActivityChannel}
          </p>
          <p className="text-[9px] text-zinc-700">{card.lastActivity}</p>
        </div>
      </div>
    </button>
  );
}

/* ── main component ───────────────────────────────────────────── */

export default function LeadListScreen({
  cards,
  selectedId,
  onSelect,
}: {
  cards: LeadCard[];
  selectedId: string | null;
  onSelect: (card: LeadCard | null) => void;
}) {
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [icpFilter, setIcpFilter] = useState<IcpFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("opportunity");

  const filtered = useMemo(() => {
    let result = [...cards];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.hotelName.toLowerCase().includes(q) ||
          c.city.toLowerCase().includes(q),
      );
    }

    if (tierFilter !== "all") {
      result = result.filter((c) => c.packageTier === tierFilter);
    }

    if (priorityFilter !== "all") {
      result = result.filter((c) => c.priority === priorityFilter);
    }

    if (icpFilter === "strong") {
      result = result.filter((c) => c.icpScore >= 70);
    } else if (icpFilter === "good") {
      result = result.filter((c) => c.icpScore >= 50 && c.icpScore < 70);
    } else if (icpFilter === "weak") {
      result = result.filter((c) => c.icpScore > 0 && c.icpScore < 50);
    }

    result.sort((a, b) => {
      if (sortKey === "icp") return b.icpScore - a.icpScore;
      if (sortKey === "revenue") return b.revenueEstimate - a.revenueEstimate;
      return b.opportunityScore - a.opportunityScore;
    });

    return result;
  }, [cards, search, tierFilter, priorityFilter, icpFilter, sortKey]);

  const activeFilterCount = [
    tierFilter !== "all",
    priorityFilter !== "all",
    icpFilter !== "all",
  ].filter(Boolean).length;

  function clearFilters() {
    setSearch("");
    setTierFilter("all");
    setPriorityFilter("all");
    setIcpFilter("all");
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.025] shadow-xl shadow-black/20">
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        {/* Search */}
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 focus-within:border-indigo-500/40 transition-colors">
          <SearchIcon />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Otel veya şehir ara..."
            className="w-36 bg-transparent text-[11px] text-zinc-300 outline-none placeholder:text-zinc-600"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-zinc-600 hover:text-zinc-400 transition-colors"
              aria-label="Aramayı temizle"
            >
              <svg viewBox="0 0 16 16" fill="none" className="h-2.5 w-2.5" aria-hidden>
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Tier filter */}
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value as TierFilter)}
          className={selectCls}
        >
          <option value="all">Tüm Tier</option>
          <option value="Enterprise">Enterprise</option>
          <option value="Growth">Growth</option>
          <option value="Professional">Professional</option>
          <option value="Starter">Starter</option>
        </select>

        {/* Priority filter */}
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
          className={selectCls}
        >
          <option value="all">Tüm Öncelik</option>
          <option value="critical">Kritik</option>
          <option value="high">Yüksek</option>
          <option value="medium">Orta</option>
          <option value="low">Düşük</option>
        </select>

        {/* ICP filter */}
        <select
          value={icpFilter}
          onChange={(e) => setIcpFilter(e.target.value as IcpFilter)}
          className={selectCls}
        >
          <option value="all">Tüm ICP</option>
          <option value="strong">Güçlü ICP (≥70)</option>
          <option value="good">İyi ICP (50–70)</option>
          <option value="weak">Zayıf ICP (&lt;50)</option>
        </select>

        {/* Sort */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-600">Sırala:</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className={selectCls}
          >
            <option value="opportunity">Fırsat Skoru</option>
            <option value="icp">ICP Uyumu</option>
            <option value="revenue">Gelir Potansiyeli</option>
          </select>
        </div>

        {/* Count + clear */}
        <div className="ml-auto flex items-center gap-3">
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3" aria-hidden>
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              Temizle
            </button>
          )}
          <span className="text-[10px] text-zinc-600">
            <span className="font-semibold text-zinc-400">{filtered.length}</span>
            {" / "}
            {cards.length} lead
          </span>
        </div>
      </div>

      {/* Card grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <svg
              viewBox="0 0 48 48"
              fill="none"
              className="h-10 w-10 text-zinc-700"
              aria-hidden
            >
              <circle cx="21" cy="21" r="14" stroke="currentColor" strokeWidth="2" />
              <path
                d="M31 31l10 10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M16 21h10M21 16v10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <p className="text-[13px] text-zinc-600">
              {search.trim()
                ? `"${search}" için sonuç bulunamadı`
                : "Bu filtrede lead yok"}
            </p>
            {(activeFilterCount > 0 || search) && (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-lg border border-white/[0.08] px-4 py-2 text-[11px] font-medium text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200 transition-colors"
              >
                Filtreleri temizle
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((card) => (
              <LeadCardItem
                key={card.id}
                card={card}
                isSelected={selectedId === card.id}
                onSelect={() => onSelect(selectedId === card.id ? null : card)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
