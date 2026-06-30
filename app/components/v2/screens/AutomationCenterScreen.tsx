"use client";

import { useState, useMemo } from "react";
import {
  adaptScoredLeadsToAutomationCards,
  computeAutomationSummary,
  QUEUE_LABELS,
  type AutomationCard,
  type AutomationQueueType,
  type AutomationSummary,
} from "@/app/components/v2/adapters/automation-center-adapter";
import type { ScoredLead } from "@/app/lib/leads";
import {
  selectCls,
  inputCls,
  kpiStripCls,
  kpiLabelCls,
  kpiValueCls,
  kpiSubCls,
  toolbarCls,
  screenCardCls,
  rowSelectedCls,
  rowUnselectedCls,
  sectionLabelCls,
} from "@/app/components/v2/design-system";

/* ── Props ──────────────────────────────────────────────────────── */

type Props = {
  leads: ScoredLead[];
  selectedId: string | null;
  onSelect: (card: AutomationCard) => void;
};

/* ── Sub-components ─────────────────────────────────────────────── */

const QUEUE_FILTER_OPTIONS: Array<{ value: AutomationQueueType | "all"; label: string }> = [
  { value: "all", label: "Tüm Kuyruklar" },
  { value: "daily-outreach", label: "Günlük Outreach" },
  { value: "follow-up", label: "Takip" },
  { value: "re-enrich", label: "Yeniden Zenginleştir" },
  { value: "website-scan", label: "Web Sitesi Tarama" },
  { value: "contact-finder", label: "İletişim Bul" },
  { value: "whatsapp-verify", label: "WhatsApp Doğrula" },
  { value: "ai-review", label: "AI İnceleme" },
];

function PriorityDot({ priority }: { priority: AutomationCard["priority"] }) {
  const cls =
    priority === "critical"
      ? "bg-rose-400"
      : priority === "high"
        ? "bg-amber-400"
        : priority === "medium"
          ? "bg-sky-400"
          : "bg-zinc-600";
  return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${cls}`} />;
}

function StatusBadge({ status, label }: { status: AutomationCard["status"]; label: string }) {
  const cls =
    status === "overdue"
      ? "bg-rose-500/[0.12] text-rose-400 ring-rose-500/20"
      : status === "blocked"
        ? "bg-zinc-700/50 text-zinc-500 ring-zinc-600/20"
        : status === "ready"
          ? "bg-emerald-500/[0.10] text-emerald-400 ring-emerald-500/20"
          : "bg-zinc-700/50 text-zinc-500 ring-zinc-600/20";
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wide ring-1 ring-inset ${cls}`}
    >
      {label}
    </span>
  );
}

function QueueBadge({ queue }: { queue: AutomationQueueType }) {
  const label = QUEUE_LABELS[queue];
  const cls =
    queue === "follow-up" || queue === "daily-outreach"
      ? "bg-amber-500/[0.10] text-amber-400 ring-amber-500/20"
      : queue === "re-enrich" || queue === "website-scan"
        ? "bg-sky-500/[0.10] text-sky-400 ring-sky-500/20"
        : queue === "contact-finder" || queue === "whatsapp-verify"
          ? "bg-violet-500/[0.10] text-violet-400 ring-violet-500/20"
          : "bg-indigo-500/[0.10] text-indigo-400 ring-indigo-500/20";
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-[1px] text-[9px] font-medium ring-1 ring-inset ${cls}`}
    >
      {label}
    </span>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-5 py-3.5">
      <p className={kpiLabelCls}>{label}</p>
      <p className={`${kpiValueCls} ${accent ?? "text-zinc-100"}`}>{value}</p>
      {sub && <p className={kpiSubCls}>{sub}</p>}
    </div>
  );
}

function QueueSummaryStrip({ summary }: { summary: AutomationSummary }) {
  return (
    <div className="shrink-0 overflow-x-auto border-b border-white/[0.06]">
      <div className="flex min-w-max gap-0 divide-x divide-white/[0.06]">
        {summary.queues.map((q) => (
          <div key={q.type} className="flex min-w-[110px] flex-col gap-0.5 px-4 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-zinc-600">
              {q.label}
            </p>
            <p className="text-[18px] font-bold tabular-nums leading-none text-zinc-200">
              {q.total}
            </p>
            <p className="text-[9px] text-zinc-600">
              {q.ready} hazır{q.overdue > 0 ? ` · ${q.overdue} gecikti` : ""}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main screen ────────────────────────────────────────────────── */

export default function AutomationCenterScreen({ leads, selectedId, onSelect }: Props) {
  const [queueFilter, setQueueFilter] = useState<AutomationQueueType | "all">("all");
  const [search, setSearch] = useState("");

  const allCards = useMemo(() => adaptScoredLeadsToAutomationCards(leads), [leads]);
  const summary = useMemo(() => computeAutomationSummary(allCards), [allCards]);

  const filtered = useMemo(() => {
    let list = allCards;
    if (queueFilter !== "all") {
      list = list.filter((c) => c.queues.includes(queueFilter));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.hotelName.toLowerCase().includes(q) ||
          c.city.toLowerCase().includes(q),
      );
    }
    return list;
  }, [allCards, queueFilter, search]);

  return (
    <div className={`${screenCardCls} flex-1`}>
      {/* KPI strip */}
      <div className={kpiStripCls}>
        <KpiCard label="Toplam Bekleyen" value={summary.total} sub="aktif otomasyon" />
        <KpiCard
          label="Hazır"
          value={summary.ready}
          sub="şimdi çalıştırılabilir"
          accent="text-emerald-400"
        />
        <KpiCard
          label="Gecikmiş"
          value={summary.overdue}
          sub="takip geçti"
          accent={summary.overdue > 0 ? "text-rose-400" : "text-zinc-100"}
        />
        <KpiCard
          label="Engellendi"
          value={summary.blocked}
          sub="DNC / geçersiz"
          accent={summary.blocked > 0 ? "text-amber-400" : "text-zinc-100"}
        />
      </div>

      {/* Queue summary strip */}
      <QueueSummaryStrip summary={summary} />

      {/* Toolbar */}
      <div className={toolbarCls}>
        <select
          className={selectCls}
          value={queueFilter}
          onChange={(e) => setQueueFilter(e.target.value as AutomationQueueType | "all")}
        >
          {QUEUE_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          className={inputCls}
          placeholder="Otel veya şehir ara..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="ml-auto text-[10px] text-zinc-600">
          {filtered.length} lead
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
            <p className="text-[13px] font-medium">Bekleyen otomasyon yok</p>
            <p className="mt-1 text-[11px]">Filtre veya arama koşullarını değiştirin</p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-[var(--background-elev)]">
              <tr className="border-b border-white/[0.06]">
                {[
                  "Otel",
                  "Kuyruk",
                  "Öncelik",
                  "Durum",
                  "Neden",
                  "Fırsat",
                  "Son Aktivite",
                  "Aksiyon",
                ].map((h) => (
                  <th
                    key={h}
                    className={`${sectionLabelCls} px-4 py-2.5 text-left font-semibold`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((card) => {
                const isSelected = card.id === selectedId;
                return (
                  <tr
                    key={`${card.id}-${card.primaryQueue}`}
                    onClick={() => onSelect(card)}
                    className={[
                      "cursor-pointer border-b border-white/[0.04] transition-colors duration-100",
                      isSelected
                        ? "bg-indigo-500/[0.08]"
                        : "hover:bg-white/[0.03]",
                    ].join(" ")}
                  >
                    {/* Otel */}
                    <td className="px-4 py-2.5">
                      <p className="text-[12px] font-medium text-zinc-200 leading-snug">
                        {card.hotelName}
                      </p>
                      <p className="text-[10px] text-zinc-600">
                        {card.city} · {card.hotelType}
                      </p>
                    </td>

                    {/* Kuyruk */}
                    <td className="px-4 py-2.5">
                      <QueueBadge queue={card.primaryQueue} />
                    </td>

                    {/* Öncelik */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <PriorityDot priority={card.priority} />
                        <span className="text-[11px] capitalize text-zinc-400">
                          {card.priority === "critical"
                            ? "Kritik"
                            : card.priority === "high"
                              ? "Yüksek"
                              : card.priority === "medium"
                                ? "Orta"
                                : "Düşük"}
                        </span>
                      </div>
                    </td>

                    {/* Durum */}
                    <td className="px-4 py-2.5">
                      <StatusBadge status={card.status} label={card.statusLabel} />
                    </td>

                    {/* Neden */}
                    <td className="max-w-[200px] px-4 py-2.5">
                      <p className="truncate text-[11px] text-zinc-500">{card.reason}</p>
                    </td>

                    {/* Fırsat */}
                    <td className="px-4 py-2.5">
                      <span className="text-[12px] font-semibold tabular-nums text-zinc-300">
                        {card.opportunityScore}
                      </span>
                    </td>

                    {/* Son Aktivite */}
                    <td className="px-4 py-2.5">
                      <span className="text-[11px] text-zinc-600">
                        {card.lastActivityLabel}
                      </span>
                    </td>

                    {/* Aksiyon */}
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(card);
                        }}
                        className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium text-zinc-300 transition-colors duration-100 hover:bg-white/[0.08] hover:text-zinc-100"
                      >
                        {card.actionLabel}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
