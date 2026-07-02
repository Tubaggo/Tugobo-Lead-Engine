"use client";

import { useMemo, useState } from "react";
import type { RecoveryCard } from "@/app/components/v2/adapters/revenue-recovery-adapter";
import type { PipelineCard } from "@/app/components/v2/adapters/revenue-pipeline-adapter";
import { formatMrr } from "@/app/components/v2/adapters/founder-command-center-adapter";
import { SALES_PRIORITY_LABELS } from "@/lib/verified-opportunity/priority-engine";
import type {
  ExecutionQueueItem,
  ExecutionPriority,
  ExecutionState,
  OperationalMomentum,
  ExecutionConfidence,
  ExecutionTier,
} from "@/app/lib/execution-runtime";
import type { V2Screen } from "@/app/components/v2/types";

type Props = {
  executionQueue: ExecutionQueueItem[];
  recoveryCards: RecoveryCard[];
  pipelineCards: PipelineCard[];
  selectedId: string | null;
  onSelect: (card: RecoveryCard) => void;
  onNavigate: (screen: V2Screen) => void;
};

/**
 * The Execution Queue (from app/lib/execution-runtime) is the spine of this
 * screen. This component only groups/formats/labels the queue it's handed —
 * it never recomputes priority, state, action, momentum, or confidence.
 */
export default function FounderCommandCenterScreen({
  executionQueue,
  recoveryCards,
  selectedId,
  onSelect,
}: Props) {
  const [search, setSearch] = useState("");

  const q = search.toLowerCase().trim();
  const filteredQueue = useMemo(
    () =>
      q
        ? executionQueue.filter(
            (i) => i.hotelName.toLowerCase().includes(q) || i.city.toLowerCase().includes(q),
          )
        : executionQueue,
    [executionQueue, q],
  );

  const tier1 = filteredQueue.filter((i) => i.tier === "tier-1");
  const tier2 = filteredQueue.filter((i) => i.tier === "tier-2");
  const tier3 = filteredQueue.filter((i) => i.tier === "tier-3");

  const brief = useMemo(() => buildDayBrief(executionQueue), [executionQueue]);

  function handleRowClick(item: ExecutionQueueItem) {
    const card = recoveryCards.find((c) => c.id === item.leadId);
    if (card) onSelect(card);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden min-w-0">
      {/* Live Day Brief */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-white/[0.06]">
        <p className="text-sm font-semibold text-zinc-100">{brief.greeting}</p>
        <p className="text-sm text-zinc-300 mt-0.5">{brief.headline}</p>
        {brief.detail && <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{brief.detail}</p>}
      </div>

      {/* Daily Progress Strip */}
      <div className="flex-shrink-0 grid grid-cols-4 gap-3 px-4 py-3 border-b border-white/[0.06]">
        <KpiCell label="Bugünün İşleri" value={`${executionQueue.length}`} colorClass="text-zinc-200" bgClass="bg-zinc-800/50 border-zinc-700/40" />
        <KpiCell label="Şimdi Yap" value={`${tier1.length}`} colorClass="text-rose-400" bgClass="bg-rose-950/30 border-rose-900/40" />
        <KpiCell label="Bugün Bitir" value={`${tier2.length}`} colorClass="text-amber-400" bgClass="bg-amber-950/30 border-amber-900/40" />
        <KpiCell label="Vakit Kalırsa" value={`${tier3.length}`} colorClass="text-zinc-400" bgClass="bg-zinc-800/40 border-zinc-700/30" />
      </div>

      {/* Search */}
      <div className="flex-shrink-0 flex items-center gap-1.5 px-4 py-3 border-b border-white/[0.06]">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Otel veya şehir ara…"
          className="h-9 w-56 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-[11px] text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-indigo-500/40 focus:bg-white/[0.06] transition-colors duration-150"
        />
      </div>

      {/* Execution Queue */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {executionQueue.length === 0 ? (
          <ClearedState />
        ) : (
          <>
            <TierSection
              title="Şimdi Yap"
              accentClass="text-rose-500"
              items={tier1}
              selectedId={selectedId}
              onRowClick={handleRowClick}
              emptyText="Hemen aksiyon gerektiren iş yok."
            />
            <TierSection
              title="Bugün Bitir"
              accentClass="text-amber-500"
              items={tier2}
              selectedId={selectedId}
              onRowClick={handleRowClick}
              emptyText="Bugün için bekleyen iş yok."
            />
            <TierSection
              title="Vakit Kalırsa"
              accentClass="text-zinc-500"
              items={tier3}
              selectedId={selectedId}
              onRowClick={handleRowClick}
              emptyText="Ek iş yok."
            />
          </>
        )}
      </div>
    </div>
  );
}

// ── Live Day Brief (deterministic copy from queue counts — no runtime logic) ──

function buildDayBrief(queue: ExecutionQueueItem[]): {
  greeting: string;
  headline: string;
  detail: string;
} {
  const hour = new Date().getHours();
  const greetingWord = hour < 12 ? "Günaydın" : hour < 18 ? "İyi günler" : "İyi akşamlar";
  const greeting = `${greetingWord}, Gökhan.`;

  const total = queue.length;
  if (total === 0) {
    return {
      greeting,
      headline: "Bugünün operasyon kuyruğu temiz.",
      detail: "Şu an aksiyon bekleyen bir iş yok.",
    };
  }

  const tier1Count = queue.filter((i) => i.tier === "tier-1").length;
  const totalValue = queue.reduce((s, i) => s + i.estimatedValue, 0);
  const topItem = queue[0]; // already sorted by priority > tier > value by the runtime

  const headline = `Bugün öncelikli ${total} iş var.`;
  const detailParts = [
    tier1Count > 0
      ? `${tier1Count} tanesi hemen aksiyon gerektiriyor.`
      : "Şu an acil aksiyon bekleyen iş yok.",
    totalValue > 0 ? `Tahmini fırsat değeri: ${formatMrr(totalValue)}.` : "",
    topItem ? `En kritik iş: ${topItem.hotelName}.` : "",
  ].filter(Boolean);

  return { greeting, headline, detail: detailParts.join(" ") };
}

// ── sub-components ────────────────────────────────────────────

function KpiCell({
  label,
  value,
  colorClass,
  bgClass,
}: {
  label: string;
  value: string;
  colorClass: string;
  bgClass: string;
}) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${bgClass}`}>
      <p className="text-[10px] text-zinc-500 uppercase tracking-[0.12em]">{label}</p>
      <p className={`text-lg font-semibold mt-0.5 ${colorClass}`}>{value}</p>
    </div>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-zinc-500">{label}</p>
  );
}

function TierSection({
  title,
  accentClass,
  items,
  selectedId,
  onRowClick,
  emptyText,
}: {
  title: string;
  accentClass: string;
  items: ExecutionQueueItem[];
  selectedId: string | null;
  onRowClick: (item: ExecutionQueueItem) => void;
  emptyText: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <SectionLabel label={title} />
        <span className={`text-[10px] font-semibold ${accentClass}`}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-zinc-600 py-2 px-1">{emptyText}</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <QueueItemRow
              key={item.leadId}
              item={item}
              isSelected={item.leadId === selectedId}
              onClick={() => onRowClick(item)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QueueItemRow({
  item,
  isSelected,
  onClick,
}: {
  item: ExecutionQueueItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-lg border-l-2 transition-colors ${
        isSelected
          ? "bg-zinc-700/70 border-l-indigo-400"
          : `bg-zinc-800/40 hover:bg-zinc-800/70 ${TIER_BORDER[item.tier]}`
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-zinc-100 truncate">{item.hotelName}</p>
            <Badge label={SALES_PRIORITY_LABELS[item.priority]} colorClass={PRIORITY_BADGE[item.priority]} />
          </div>
          <p className="text-xs text-zinc-500 truncate mt-0.5">{item.city}</p>
          <p className="text-[11px] text-zinc-400 mt-1 truncate" title={item.topReason}>
            {item.topReason}
          </p>
        </div>
        <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
          <span className="text-xs font-medium text-amber-300 whitespace-nowrap">
            {item.recommendedAction.label}
          </span>
          {item.estimatedValue > 0 && (
            <span className="text-[11px] text-zinc-500">{formatMrr(item.estimatedValue)}</span>
          )}
          <div className="flex items-center gap-1">
            <Badge label={STATE_LABEL[item.executionState]} colorClass={STATE_BADGE[item.executionState]} />
            <Badge label={MOMENTUM_LABEL[item.operationalMomentum]} colorClass="bg-zinc-800 text-zinc-400" />
            <Badge label={CONFIDENCE_LABEL[item.executionConfidence]} colorClass={CONFIDENCE_BADGE[item.executionConfidence]} />
          </div>
        </div>
      </div>
    </button>
  );
}

function Badge({ label, colorClass }: { label: string; colorClass: string }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${colorClass}`}>
      {label}
    </span>
  );
}

function ClearedState() {
  return (
    <div className="rounded-xl bg-emerald-950/20 border border-emerald-900/30 px-6 py-10 text-center">
      <p className="text-sm font-semibold text-emerald-300">Kuyruk Temiz</p>
      <p className="text-xs text-emerald-400/70 mt-1.5">Bugünün operasyon kuyruğu temiz.</p>
    </div>
  );
}

// ── UI-only label/color maps (display mapping only — no business rules) ──

const TIER_BORDER: Record<ExecutionTier, string> = {
  "tier-1": "border-l-rose-600",
  "tier-2": "border-l-amber-600",
  "tier-3": "border-l-zinc-600",
};

const PRIORITY_BADGE: Record<ExecutionPriority, string> = {
  CRITICAL: "bg-rose-900/60 text-rose-300",
  URGENT: "bg-orange-900/60 text-orange-300",
  HIGH: "bg-amber-900/60 text-amber-300",
  NORMAL: "bg-sky-900/60 text-sky-300",
  LOW: "bg-zinc-800 text-zinc-400",
};

const STATE_LABEL: Record<ExecutionState, string> = {
  dormant: "Beklemede",
  ready: "Hazır",
  blocked: "Engellendi",
  waiting: "Yanıt Bekleniyor",
  scheduled: "Planlandı",
  completed: "Tamamlandı",
};

const STATE_BADGE: Record<ExecutionState, string> = {
  dormant: "bg-zinc-800 text-zinc-500",
  ready: "bg-emerald-900/50 text-emerald-400",
  blocked: "bg-rose-900/60 text-rose-300",
  waiting: "bg-sky-900/50 text-sky-400",
  scheduled: "bg-indigo-900/50 text-indigo-400",
  completed: "bg-zinc-800 text-zinc-500",
};

const MOMENTUM_LABEL: Record<OperationalMomentum, string> = {
  accelerating: "Hızlanıyor",
  stable: "Stabil",
  slowing: "Yavaşlıyor",
  stalled: "Durdu",
  recovering: "Toparlanıyor",
  reactivated: "Yeniden Aktif",
};

const CONFIDENCE_LABEL: Record<ExecutionConfidence, string> = {
  high: "Kanıt Güveni: Yüksek",
  medium: "Kanıt Güveni: Orta",
  low: "Kanıt Güveni: Düşük",
};

const CONFIDENCE_BADGE: Record<ExecutionConfidence, string> = {
  high: "bg-emerald-900/50 text-emerald-400",
  medium: "bg-amber-900/50 text-amber-400",
  low: "bg-rose-900/50 text-rose-400",
};
