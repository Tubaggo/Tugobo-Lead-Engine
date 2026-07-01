"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/app/components/v2/primitives/Badge";
import {
  fmtCurrency,
  type QueueRow,
  type MockKpi,
  type PackageTier,
  type Priority,
  type ActionChannel,
} from "@/app/components/v2/mock/mock-queue";

/* ── helpers ──────────────────────────────────────────────── */

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

function priorityVariant(p: Priority): "critical" | "high" | "medium" | "low" {
  return p;
}

const PRIORITY_LABEL: Record<Priority, string> = {
  critical: "Kritik",
  high: "Yüksek",
  medium: "Orta",
  low: "Düşük",
};

function conversionColor(pct: number): string {
  if (pct >= 75) return "text-emerald-400";
  if (pct >= 50) return "text-amber-400";
  return "text-rose-400";
}

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

function hotelInitials(name: string): string {
  const words = name
    .split(" ")
    .filter((w) => w.length > 1 && w !== "&");
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
}

/* ── channel action icons ─────────────────────────────────── */

function ChannelIcon({ channel, urgent }: { channel: ActionChannel; urgent?: boolean }) {
  const color = urgent
    ? "text-emerald-400"
    : channel === "WhatsApp"
    ? "text-emerald-500"
    : channel === "Arama"
    ? "text-sky-400"
    : "text-amber-400";

  if (channel === "WhatsApp") {
    return (
      <svg viewBox="0 0 16 16" fill="currentColor" className={`h-3.5 w-3.5 ${color}`} aria-hidden>
        <path d="M8 1a7 7 0 0 1 6.06 10.47L15 15l-3.67-.91A7 7 0 1 1 8 1Zm0 1.4a5.6 5.6 0 0 0-4.84 8.39l.15.26-.77 1.92 1.98-.75.25.15A5.6 5.6 0 1 0 8 2.4Zm-1.8 2.7c.14 0 .29.01.41.04.14.04.3.08.44.4l.54 1.33c.1.25.03.46-.1.63l-.33.41c-.12.15-.11.3-.04.45.4.84 1.1 1.55 1.9 1.95.14.07.28.08.4-.05l.37-.44c.15-.18.36-.23.56-.13l1.34.67c.3.15.32.3.31.44-.05.83-.62 1.41-1.46 1.41H11c-.8 0-1.81-.4-3.15-1.7C6.5 9.43 5.9 8.3 5.9 7.48c0-.73.56-1.38 1.3-1.38Z" />
      </svg>
    );
  }
  if (channel === "Arama") {
    return (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        className={`h-3.5 w-3.5 ${color}`}
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
      className={`h-3.5 w-3.5 ${color}`}
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

/* ── crown icon for top-3 ─────────────────────────────────── */

function CrownIcon() {
  return (
    <svg
      viewBox="0 0 12 9"
      fill="currentColor"
      className="h-2.5 w-3 text-amber-400"
      aria-hidden
    >
      <path d="M0 8h12L10 3 6 6.5 2 1 0 8z" />
      <rect x="0" y="7.5" width="12" height="1.5" rx="0.5" />
    </svg>
  );
}

/* ── search icon ──────────────────────────────────────────── */

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className="h-3 w-3 shrink-0 text-zinc-600"
      aria-hidden
    >
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/* ── tab filter logic ─────────────────────────────────────── */

function filterByTab(rows: QueueRow[], tabIndex: number): QueueRow[] {
  switch (tabIndex) {
    case 1: return rows.filter((r) => r.channel === "Arama");
    case 2: return rows.filter((r) => r.channel === "WhatsApp");
    case 3: return rows.filter((r) =>
      r.lastActionAgo.includes("gün") || r.lastActionAgo.includes("hafta")
    );
    case 4: return rows.filter((r) => r.priority === "low" || r.priority === "medium");
    default: return rows;
  }
}

/* ── main component ───────────────────────────────────────── */

export default function RevenueQueueScreen({
  rows,
  kpi,
  selectedRowId,
  onSelectRow,
}: {
  rows: QueueRow[];
  kpi: MockKpi;
  selectedRowId?: string | null;
  onSelectRow?: (id: string | null) => void;
}) {
  const [activeTab, setActiveTab] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);

  const effectiveSelectedId = selectedRowId !== undefined ? selectedRowId : internalSelectedId;
  const handleSelect = (id: string | null) => {
    if (onSelectRow) onSelectRow(id);
    else setInternalSelectedId(id);
  };

  const tabCounts = useMemo(() => [
    rows.length,
    filterByTab(rows, 1).length,
    filterByTab(rows, 2).length,
    filterByTab(rows, 3).length,
    filterByTab(rows, 4).length,
  ], [rows]);

  const SUB_TABS = [
    { label: "Fırsat Kuyruğu", count: tabCounts[0] },
    { label: "Aranacaklar", count: tabCounts[1] },
    { label: "Mesaj Atılacaklar", count: tabCounts[2] },
    { label: "Takip Edilecekler", count: tabCounts[3] },
    { label: "Bekleyenler", count: tabCounts[4] },
  ];

  const filteredRows = useMemo(() => {
    let result = filterByTab(rows, activeTab);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.hotelName.toLowerCase().includes(q) ||
          r.city.toLowerCase().includes(q),
      );
    }
    return result;
  }, [rows, activeTab, searchQuery]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-[var(--background-elev)] shadow-xl shadow-black/20">
      {/* Sub-tab row */}
      <div className="flex shrink-0 items-center gap-0.5 border-b border-white/[0.06] px-4">
        <div className="flex flex-1 items-center gap-0">
          {SUB_TABS.map((tab, i) => (
            <button
              key={tab.label}
              type="button"
              onClick={() => {
                setActiveTab(i);
                handleSelect(null);
              }}
              className={`flex items-center gap-1.5 border-b-2 px-3.5 py-3 text-[11px] font-medium transition-colors ${
                activeTab === i
                  ? "border-indigo-500 text-indigo-300"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {tab.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums ${
                  activeTab === i
                    ? "bg-indigo-500/25 text-indigo-400"
                    : "bg-white/[0.06] text-zinc-600"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search + view toggle */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 focus-within:border-indigo-500/40 focus-within:bg-white/[0.05] transition-colors">
            <SearchIcon />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Fırsat ara..."
              className="w-28 bg-transparent text-[11px] text-zinc-300 outline-none placeholder:text-zinc-600"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="text-zinc-600 hover:text-zinc-400 transition-colors"
                aria-label="Aramayı temizle"
              >
                <svg viewBox="0 0 16 16" fill="none" className="h-2.5 w-2.5" aria-hidden>
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300 transition-colors"
            aria-label="Liste görünümü"
          >
            <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" aria-hidden>
              <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300 transition-colors"
            aria-label="Sütun ayarları"
          >
            <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" aria-hidden>
              <path
                d="M3 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM13 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"
                stroke="currentColor"
                strokeWidth="1.4"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-[var(--background-elev)]">
            <tr className="border-b border-white/[0.06]">
              <th className="w-10 py-3 pl-4 pr-2 text-center text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
                #
              </th>
              <th className="min-w-48 py-3 pl-2 pr-3 text-left text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
                Fırsat
              </th>
              <th className="py-3 px-3 text-left text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
                Paket
              </th>
              <th className="py-3 px-3 text-right text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
                Ağırlıklı MRR
              </th>
              <th className="py-3 px-3 text-center text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
                Dönüşüm
              </th>
              <th className="py-3 px-3 text-left text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
                Priority
              </th>
              <th className="py-3 px-3 text-left text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
                Aksiyon Önerisi
              </th>
              <th className="py-3 pr-4 pl-3 text-left text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
                Son Aksiyon
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-14 text-center text-[12px] text-zinc-600">
                  {searchQuery.trim()
                    ? `"${searchQuery}" için sonuç bulunamadı`
                    : "Bu filtrede fırsat yok"}
                </td>
              </tr>
            ) : (
              filteredRows.map((row, idx) => {
                const avatarColor = AVATAR_COLORS[idx % AVATAR_COLORS.length];
                const initials = hotelInitials(row.hotelName);
                const isUrgent = row.actionLabel === "Hemen Ara";
                const isSelected = effectiveSelectedId === row.id;

                return (
                  <tr
                    key={row.id}
                    onClick={() => handleSelect(isSelected ? null : row.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-indigo-500/[0.07] ring-1 ring-inset ring-indigo-500/20"
                        : "hover:bg-white/[0.03]"
                    }`}
                  >
                    {/* Rank */}
                    <td className="w-10 py-3.5 pl-4 pr-2">
                      <div className="flex flex-col items-center gap-0.5">
                        {row.rank <= 3 && <CrownIcon />}
                        <span
                          className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold tabular-nums ${
                            row.rank <= 3
                              ? "bg-indigo-500/20 text-indigo-300"
                              : "text-zinc-600"
                          }`}
                        >
                          {row.rank}
                        </span>
                      </div>
                    </td>

                    {/* Hotel with avatar */}
                    <td className="min-w-48 py-3.5 pl-2 pr-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${avatarColor}`}
                        >
                          {initials}
                        </div>
                        <div>
                          <p className="text-[12px] font-semibold text-zinc-100 leading-snug">
                            {row.hotelName}
                          </p>
                          <p className="text-[10px] text-zinc-600">{row.city}</p>
                        </div>
                      </div>
                    </td>

                    {/* Package */}
                    <td className="py-3.5 px-3">
                      <Badge variant={packageVariant(row.packageTier)}>
                        {row.packageTier}
                      </Badge>
                    </td>

                    {/* Weighted MRR */}
                    <td className="py-3.5 px-3 text-right">
                      <span className="text-[13px] font-bold tabular-nums text-emerald-400">
                        {fmtCurrency(row.weightedMrr)}
                      </span>
                      <p className="text-[9px] text-zinc-600">/ay</p>
                    </td>

                    {/* Conversion */}
                    <td className="py-3.5 px-3 text-center">
                      <span
                        className={`text-[13px] font-bold tabular-nums ${conversionColor(row.conversion)}`}
                      >
                        %{row.conversion}
                      </span>
                    </td>

                    {/* Priority + score */}
                    <td className="py-3.5 px-3">
                      <div className="space-y-1">
                        <Badge variant={priorityVariant(row.priority)}>
                          {PRIORITY_LABEL[row.priority]}
                        </Badge>
                        <p className="text-[9px] tabular-nums text-zinc-600">
                          {row.priorityScore} / 100
                        </p>
                      </div>
                    </td>

                    {/* Action recommendation */}
                    <td className="py-3.5 px-3">
                      <div className="flex items-start gap-1.5">
                        <ChannelIcon channel={row.channel} urgent={isUrgent} />
                        <div>
                          <p
                            className={`text-[11px] font-semibold ${
                              isUrgent ? "text-emerald-400" : "text-sky-300"
                            }`}
                          >
                            {row.actionLabel}
                          </p>
                          <p className="text-[9px] text-zinc-600">{row.actionSub}</p>
                        </div>
                      </div>
                    </td>

                    {/* Last action */}
                    <td className="py-3.5 pr-4 pl-3">
                      <p className="text-[11px] font-medium text-zinc-400">
                        {row.lastActionChannel}
                      </p>
                      <p className="text-[9px] text-zinc-600">{row.lastActionAgo}</p>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      <div className="flex shrink-0 items-center justify-between border-t border-white/[0.06] px-4 py-2.5">
        <span className="text-[10px] text-zinc-600">
          {filteredRows.length} / {kpi.opportunityCount} fırsat gösteriliyor
          {searchQuery.trim() && (
            <span className="ml-1 text-indigo-400">
              — "{searchQuery}" için
            </span>
          )}
        </span>
        <div className="flex items-center gap-1">
          {[1, 2, 3].map((p) => (
            <button
              key={p}
              type="button"
              className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-semibold transition-colors ${
                p === 1
                  ? "bg-indigo-500/25 text-indigo-300"
                  : "text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-300"
              }`}
            >
              {p}
            </button>
          ))}
          <span className="px-1 text-[10px] text-zinc-700">…</span>
          <button
            type="button"
            className="flex h-6 w-8 items-center justify-center gap-1 rounded-md text-[10px] text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-300 transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3" aria-hidden>
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <select className="rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-1 text-[10px] text-zinc-500 cursor-pointer hover:border-white/[0.12] transition-colors">
          <option>20 / sayfa</option>
          <option>50 / sayfa</option>
        </select>
      </div>
    </div>
  );
}
