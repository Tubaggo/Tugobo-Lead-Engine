"use client";

import { useMemo, useRef, useState } from "react";
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
  FounderCoachInsight,
  CoachInsightSeverity,
} from "@/app/lib/execution-runtime";
import type { V2Screen } from "@/app/components/v2/types";

type Props = {
  executionQueue: ExecutionQueueItem[];
  coachInsights: FounderCoachInsight[];
  recoveryCards: RecoveryCard[];
  pipelineCards: PipelineCard[];
  selectedId: string | null;
  // Accepts null so clearing an active Kurucu Koçu filter can also clear the
  // current selection — the underlying setter passed from V2Shell already
  // supports null (its state is RecoveryCard | null); this only widens the
  // type declared here to match what's actually passed in.
  onSelect: (card: RecoveryCard | null) => void;
  onNavigate: (screen: V2Screen) => void;
};

/**
 * The Execution Queue (from app/lib/execution-runtime) is the spine of this
 * screen. This component only groups/formats/labels the queue it's handed —
 * it never recomputes priority, state, action, momentum, or confidence.
 */
export default function FounderCommandCenterScreen({
  executionQueue,
  coachInsights,
  recoveryCards,
  selectedId,
  onSelect,
}: Props) {
  const [search, setSearch] = useState("");
  // Which Kurucu Koçu insight (if any) the founder navigated in from — drives
  // a display-only narrowing of the queue below. Never touches runtime data.
  const [activeCoachInsightId, setActiveCoachInsightId] = useState<string | null>(null);

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

  // KPI counts always reflect the true daily totals — unaffected by an
  // active coach-driven view filter, so the numbers never look inconsistent.
  const tier1 = filteredQueue.filter((i) => i.tier === "tier-1");
  const tier2 = filteredQueue.filter((i) => i.tier === "tier-2");
  const tier3 = filteredQueue.filter((i) => i.tier === "tier-3");

  const activeCoachInsight = coachInsights.find((i) => i.id === activeCoachInsightId) ?? null;

  const displayQueue = useMemo(
    () => applyCoachFilter(filteredQueue, activeCoachInsight),
    [filteredQueue, activeCoachInsight],
  );
  const displayTier1 = displayQueue.filter((i) => i.tier === "tier-1");
  const displayTier2 = displayQueue.filter((i) => i.tier === "tier-2");
  const displayTier3 = displayQueue.filter((i) => i.tier === "tier-3");

  const brief = useMemo(() => buildDayBrief(executionQueue), [executionQueue]);

  const queueScrollRef = useRef<HTMLDivElement>(null);

  function handleRowClick(item: ExecutionQueueItem) {
    const card = recoveryCards.find((c) => c.id === item.leadId);
    if (card) onSelect(card);
  }

  function handleCoachInsightClick(insight: FounderCoachInsight) {
    setSearch("");
    setActiveCoachInsightId(insight.id);
    // Reuses the exact same selection mechanism as clicking a queue row —
    // no second selection model.
    const firstMatch = applyCoachFilter(executionQueue, insight)[0];
    if (firstMatch) handleRowClick(firstMatch);
    queueScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleClearCoachFilter() {
    setActiveCoachInsightId(null);
    onSelect(null);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden min-w-0">
      {/* Live Day Brief */}
      <div className="flex-shrink-0 px-4 py-2.5 border-b border-white/[0.06]">
        <p className="text-sm font-semibold text-zinc-100">{brief.greeting}</p>
        <p className="text-sm text-zinc-300 mt-0.5">{brief.headline}</p>
        {brief.detail && <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{brief.detail}</p>}
      </div>

      {/* Bugünkü Operasyon Planı (Founder Coach) */}
      <CoachSection
        insights={coachInsights}
        activeInsightId={activeCoachInsightId}
        onSelectInsight={handleCoachInsightClick}
      />

      {/* Daily Progress Strip */}
      <div className="flex-shrink-0 grid grid-cols-4 gap-3 px-4 py-2 border-b border-white/[0.06]">
        <KpiCell label="Bugünün İşleri" value={`${executionQueue.length}`} colorClass="text-zinc-200" bgClass="bg-zinc-800/50 border-zinc-700/40" />
        <KpiCell label="Şimdi Yap" value={`${tier1.length}`} colorClass="text-rose-400" bgClass="bg-rose-950/30 border-rose-900/40" />
        <KpiCell label="Bugün Bitir" value={`${tier2.length}`} colorClass="text-amber-400" bgClass="bg-amber-950/30 border-amber-900/40" />
        <KpiCell label="Vakit Kalırsa" value={`${tier3.length}`} colorClass="text-zinc-400" bgClass="bg-zinc-800/40 border-zinc-700/30" />
      </div>

      {/* Search */}
      <div className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 border-b border-white/[0.06]">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setActiveCoachInsightId(null);
          }}
          placeholder="Otel veya şehir ara…"
          className="h-9 w-56 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-[11px] text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-indigo-500/40 focus:bg-white/[0.06] transition-colors duration-150"
        />
      </div>

      {/* Execution Queue */}
      <div ref={queueScrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {activeCoachInsight && (
          <FilterContextHeader
            insight={activeCoachInsight}
            resultCount={displayQueue.length}
            onClear={handleClearCoachFilter}
          />
        )}
        {executionQueue.length === 0 ? (
          <ClearedState />
        ) : activeCoachInsight && displayQueue.length === 0 ? (
          <p className="text-xs text-zinc-600 py-2 px-1">
            Bu operasyon planı için aktif çalışma bulunamadı.
          </p>
        ) : (
          <>
            <TierSection
              title="Şimdi Yap"
              accentClass="text-rose-500"
              items={displayTier1}
              selectedId={selectedId}
              onRowClick={handleRowClick}
              emptyText="Hemen aksiyon gerektiren iş yok."
              emphasize
            />
            <TierSection
              title="Bugün Bitir"
              accentClass="text-amber-500"
              items={displayTier2}
              selectedId={selectedId}
              onRowClick={handleRowClick}
              emptyText="Bugün için bekleyen iş yok."
            />
            <TierSection
              title="Vakit Kalırsa"
              accentClass="text-zinc-500"
              items={displayTier3}
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

// ── Coach-driven queue narrowing (display-only; reads existing fields only) ──
// Maps a clicked insight's `type` to a filter/sort over the already-derived
// ExecutionQueueItem[] — never recomputes priority/state/momentum/confidence,
// only reads them. Mirrors the same boolean conditions the coach rules
// already use (coach.ts), so results always match what generated the insight.

function applyCoachFilter(
  queue: ExecutionQueueItem[],
  insight: FounderCoachInsight | null,
): ExecutionQueueItem[] {
  if (!insight) return queue;

  switch (insight.type) {
    case "focus":
      return queue.filter((i) => i.tier === "tier-1");
    case "confidence":
      return queue.filter((i) => i.executionConfidence === "low");
    case "blocker":
      return queue.filter((i) => i.executionState === "blocked");
    case "momentum":
      return queue.filter(
        (i) => i.operationalMomentum === "stalled" || i.operationalMomentum === "slowing",
      );
    case "risk":
      return queue.filter((i) => i.priority === "CRITICAL" || i.priority === "URGENT");
    case "warning":
      return queue.filter(
        (i) =>
          (i.priority === "CRITICAL" || i.priority === "URGENT" || i.priority === "HIGH") &&
          i.executionConfidence === "low",
      );
    case "opportunity":
      return [...queue].sort((a, b) => b.estimatedValue - a.estimatedValue);
    case "progress": {
      // A positive/completion insight means Tier 1 is already clear — guide
      // the founder toward the next reasonable work set instead of a dead end.
      const tier2Items = queue.filter((i) => i.tier === "tier-2");
      if (tier2Items.length > 0) return tier2Items;
      const tier3Items = queue.filter((i) => i.tier === "tier-3");
      if (tier3Items.length > 0) return tier3Items;
      return [];
    }
    default:
      return queue;
  }
}

const COACH_TYPE_EXPLANATION: Partial<Record<FounderCoachInsight["type"], string>> = {
  focus: "Bu fırsatlar Şimdi Yap kuyruğunda olduğu için listelendi.",
  confidence: "Bu fırsatlar kanıt güveni düşük olduğu için listelendi.",
  blocker: "Bu fırsatlar aksiyon engeli taşıdığı için listelendi.",
  momentum: "Bu fırsatlar ivme kaybettiği için listelendi.",
  risk: "Bu fırsatlar yüksek öncelikli olduğu için listelendi.",
  warning: "Bu fırsatlar yüksek öncelik ve düşük kanıt güveni taşıdığı için listelendi.",
  opportunity: "Bu liste tahmini değere göre sıralandı.",
  progress: "Bu liste bugünkü ikincil öncelikleri gösteriyor.",
};

const DEFAULT_COACH_EXPLANATION =
  "Bu liste, seçili operasyon planına uyan fırsatları gösteriyor.";

function FilterContextHeader({
  insight,
  resultCount,
  onClear,
}: {
  insight: FounderCoachInsight;
  resultCount: number;
  onClear: () => void;
}) {
  return (
    <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/40 px-3 py-2 space-y-0.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-zinc-100 truncate">
          Bugünkü Operasyon Planı: {insight.title}
        </p>
        <button
          type="button"
          onClick={onClear}
          className="flex-shrink-0 text-[11px] text-indigo-400 hover:text-indigo-300 font-medium"
        >
          Filtreyi Temizle
        </button>
      </div>
      <p className="text-[11px] text-zinc-500">{resultCount} sonuç gösteriliyor.</p>
      <p className="text-[10px] text-zinc-600">
        {COACH_TYPE_EXPLANATION[insight.type] ?? DEFAULT_COACH_EXPLANATION}
      </p>
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

// ── Bugünkü Operasyon Planı (Founder Coach) — renders FounderCoachInsight[] ──
// as-is; no rule/threshold logic lives here, only display formatting. Each
// row initiates work (filters + selects) rather than just informing.

function CoachSection({
  insights,
  activeInsightId,
  onSelectInsight,
}: {
  insights: FounderCoachInsight[];
  activeInsightId: string | null;
  onSelectInsight: (insight: FounderCoachInsight) => void;
}) {
  if (insights.length === 0) return null;

  // Capped to 3 so the plan always fits without an internal scrollbar —
  // the queue below remains the hero, the plan is a fixed, glanceable strip.
  const visibleInsights = insights.slice(0, 3);

  return (
    <div className="flex-shrink-0 px-4 py-2 border-b border-white/[0.06]">
      <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-zinc-500 mb-1">
        Bugünkü Operasyon Planı
      </p>
      <div className="space-y-1">
        {visibleInsights.map((insight, i) => (
          <CoachInsightRow
            key={insight.id}
            index={i + 1}
            insight={insight}
            isActive={activeInsightId === insight.id}
            onClick={() => onSelectInsight(insight)}
          />
        ))}
      </div>
    </div>
  );
}

function CoachInsightRow({
  index,
  insight,
  isActive,
  onClick,
}: {
  index: number;
  insight: FounderCoachInsight;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      aria-label={`${insight.title} — ilgili fırsatları görüntülemek için tıkla`}
      className={`w-full text-left pl-2 pr-1.5 py-0.5 rounded-r transition-all duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 ${COACH_SEVERITY_BORDER[insight.severity]} ${
        isActive
          ? "border-l-4 bg-zinc-700/60 ring-1 ring-inset ring-indigo-400/30"
          : "border-l-2 hover:bg-zinc-800/50"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-baseline gap-1.5">
          <p className="text-[13px] font-semibold text-zinc-100 truncate">
            {CIRCLED_DIGIT[index] ?? `${index}.`} {insight.title}
          </p>
          {insight.evidence[0] && (
            <p className="text-[10px] text-zinc-500 truncate">— {insight.evidence[0]}</p>
          )}
        </div>
        <span className="flex-shrink-0 text-zinc-600 text-xs" aria-hidden="true">
          →
        </span>
      </div>
    </button>
  );
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
    <div className={`rounded-lg border px-3 py-1.5 ${bgClass}`}>
      <p className="text-[10px] text-zinc-500 uppercase tracking-[0.12em] leading-none">{label}</p>
      <p className={`text-lg font-semibold leading-tight mt-0.5 ${colorClass}`}>{value}</p>
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
  emphasize = false,
}: {
  title: string;
  accentClass: string;
  items: ExecutionQueueItem[];
  selectedId: string | null;
  onRowClick: (item: ExecutionQueueItem) => void;
  emptyText: string;
  emphasize?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      {emphasize ? (
        <p className={`text-sm font-bold uppercase tracking-wide ${accentClass}`}>
          {title} <span>• {items.length}</span>
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <SectionLabel label={title} />
          <span className={`text-[10px] font-semibold ${accentClass}`}>{items.length}</span>
        </div>
      )}
      {items.length === 0 ? (
        <p className="text-xs text-zinc-600 py-2 px-1">{emptyText}</p>
      ) : (
        <div className="space-y-1">
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
      className={`w-full text-left px-3 py-2 rounded-lg border-l-2 transition-colors ${
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
          {/* Primary Action — the operator's next move, read second, before any explanation. */}
          <p className="text-xs font-semibold text-amber-300 mt-0.5 truncate">
            → {item.recommendedAction.label}
          </p>
          <p className="text-[10px] text-zinc-500 mt-0.5 truncate" title={item.topReason}>
            {item.city} · {item.topReason}
          </p>
        </div>
        <div className="flex-shrink-0 flex flex-col items-end gap-1">
          <div className="flex items-center gap-1">
            <Badge label={STATE_LABEL[item.executionState]} colorClass={STATE_BADGE[item.executionState]} />
            <Badge label={MOMENTUM_LABEL[item.operationalMomentum]} colorClass="bg-zinc-800 text-zinc-400" />
            <Badge label={CONFIDENCE_LABEL[item.executionConfidence]} colorClass={CONFIDENCE_BADGE[item.executionConfidence]} />
          </div>
          {item.estimatedValue > 0 && (
            <span className="text-[11px] text-zinc-500">{formatMrr(item.estimatedValue)}</span>
          )}
        </div>
      </div>
    </button>
  );
}

function Badge({ label, colorClass }: { label: string; colorClass: string }) {
  return (
    <span className={`px-1 py-0.5 rounded text-[10px] font-medium leading-none whitespace-nowrap ${colorClass}`}>
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
  // "blocked" here always means a structural contact/channel gap (no
  // WhatsApp, unverified contact, etc.) — never a founder-imposed DNC,
  // which is its own separate "completed" state and never appears in the
  // visible queue. "Doğrulama Gerekli" reflects that accurately.
  blocked: "Doğrulama Gerekli",
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
  high: "Kanıt: Yüksek",
  medium: "Kanıt: Orta",
  low: "Kanıt: Düşük",
};

const CONFIDENCE_BADGE: Record<ExecutionConfidence, string> = {
  high: "bg-emerald-900/50 text-emerald-400",
  medium: "bg-amber-900/50 text-amber-400",
  low: "bg-rose-900/50 text-rose-400",
};

const COACH_SEVERITY_BORDER: Record<CoachInsightSeverity, string> = {
  critical: "border-l-rose-600",
  important: "border-l-amber-600",
  normal: "border-l-sky-600",
  positive: "border-l-emerald-600",
};

const CIRCLED_DIGIT: Record<number, string> = {
  1: "①",
  2: "②",
  3: "③",
  4: "④",
};
