"use client";

import { useState } from "react";
import type { RecoveryCard } from "@/app/components/v2/adapters/revenue-recovery-adapter";
import type { PipelineCard } from "@/app/components/v2/adapters/revenue-pipeline-adapter";
import {
  computeCommandCenter,
  formatMrr,
  type CommandFilter,
  type PipelineStageSnapshot,
} from "@/app/components/v2/adapters/founder-command-center-adapter";

type Props = {
  recoveryCards: RecoveryCard[];
  pipelineCards: PipelineCard[];
  selectedId: string | null;
  onSelect: (card: RecoveryCard) => void;
};

const FILTERS: { key: CommandFilter; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "critical", label: "Kritik" },
  { key: "today", label: "Bugün" },
  { key: "revenue", label: "Gelir" },
  { key: "recovery", label: "Kurtarma" },
  { key: "risk", label: "Risk" },
];

const PRIORITY_LABEL: Record<string, string> = {
  critical: "Kritik",
  high: "Yüksek",
  medium: "Orta",
  low: "Düşük",
};

const PRIORITY_COLOR: Record<string, string> = {
  critical: "bg-rose-900/60 text-rose-300",
  high: "bg-amber-900/60 text-amber-300",
  medium: "bg-sky-900/60 text-sky-300",
  low: "bg-zinc-800 text-zinc-400",
};

export default function FounderCommandCenterScreen({
  recoveryCards,
  pipelineCards,
  selectedId,
  onSelect,
}: Props) {
  const [filter, setFilter] = useState<CommandFilter>("all");
  const [search, setSearch] = useState("");

  const summary = computeCommandCenter(recoveryCards, pipelineCards);

  const q = search.toLowerCase().trim();
  const applySearch = (cards: RecoveryCard[]) =>
    q ? cards.filter((c) => c.hotelName.toLowerCase().includes(q) || c.city.toLowerCase().includes(q)) : cards;

  const showRevenueOverview = filter === "all" || filter === "revenue";
  const showPriorityQueue = filter === "all" || filter === "critical" || filter === "revenue";
  const showRecoveryAlerts = filter === "all" || filter === "recovery";
  const showCriticalRisks = filter === "all" || filter === "risk";
  const showCommAlerts = filter === "all";
  const showFollowUpToday = filter === "all" || filter === "today";
  const showPipelineSnapshot = filter === "all";

  const priorityRows = applySearch(summary.priorityQueue);
  const recoveryRows = applySearch(summary.recoveryAlerts);
  const riskRows = applySearch(summary.criticalRisks);
  const commRows = applySearch(summary.commAlerts);
  const followUpRows = applySearch(summary.followUpToday);

  const totalPipelineLeads = pipelineCards.length || 1;

  return (
    <div className="flex flex-1 flex-col overflow-hidden min-w-0">

      {/* KPI Strip */}
      <div className="flex-shrink-0 grid grid-cols-4 gap-3 px-4 py-3 border-b border-zinc-800">
        <KpiCell label="Beklenen Gelir" value={formatMrr(summary.expectedRevenue)} colorClass="text-indigo-400" bgClass="bg-indigo-950/30 border-indigo-900/40" />
        <KpiCell label="Riskli Gelir" value={formatMrr(summary.revenueAtRisk)} colorClass="text-rose-400" bgClass="bg-rose-950/30 border-rose-900/40" />
        <KpiCell label="Kurtarılabilir" value={formatMrr(summary.recoverableRevenue)} colorClass="text-emerald-400" bgClass="bg-emerald-950/30 border-emerald-900/40" />
        <KpiCell label="Bugünkü Fırsatlar" value={`${summary.todaysOpportunities}`} colorClass="text-amber-400" bgClass="bg-amber-950/30 border-amber-900/40" />
      </div>

      {/* Filter + Search */}
      <div className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 border-b border-zinc-800">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              filter === f.key
                ? "bg-zinc-700 text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {f.label}
          </button>
        ))}
        <div className="ml-auto">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ara..."
            className="bg-zinc-800/80 border border-zinc-700 rounded px-2.5 py-1 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 w-36"
          />
        </div>
      </div>

      {/* Scrollable Sections */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">

        {/* Revenue Overview */}
        {showRevenueOverview && (
          <div className="space-y-2">
            <SectionLabel label="Gelir Özeti" />
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/40 px-3 py-2.5">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Tahmin</p>
                <p className="text-base font-semibold text-indigo-400 mt-0.5">{formatMrr(summary.expectedRevenue)}</p>
              </div>
              <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/40 px-3 py-2.5">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Riskli</p>
                <p className="text-base font-semibold text-rose-400 mt-0.5">{formatMrr(summary.revenueAtRisk)}</p>
              </div>
              <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/40 px-3 py-2.5">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Kurtarılabilir</p>
                <p className="text-base font-semibold text-emerald-400 mt-0.5">{formatMrr(summary.recoverableRevenue)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Priority Queue */}
        {showPriorityQueue && (
          <Section title="Öncelikli Fırsatlar" count={priorityRows.length} accentClass="text-indigo-500">
            {priorityRows.length === 0 ? (
              <EmptyState text="Fırsat bulunamadı." />
            ) : (
              priorityRows.map((card) => (
                <LeadRow
                  key={card.id}
                  card={card}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  borderColor="border-l-indigo-600"
                  right={
                    <>
                      <span className="text-[10px] text-zinc-500 truncate max-w-[80px] hidden sm:block">{card.actionLabel}</span>
                      <Badge label={PRIORITY_LABEL[card.priority] ?? card.priority} colorClass={PRIORITY_COLOR[card.priority] ?? PRIORITY_COLOR.low} />
                    </>
                  }
                />
              ))
            )}
          </Section>
        )}

        {/* Recovery Alerts */}
        {showRecoveryAlerts && (
          <Section title="Kurtarma Uyarıları" count={recoveryRows.length} accentClass="text-emerald-500">
            {recoveryRows.length === 0 ? (
              <EmptyState text="Kurtarma fırsatı yok." />
            ) : (
              recoveryRows.map((card) => (
                <LeadRow
                  key={card.id}
                  card={card}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  borderColor="border-l-emerald-600"
                  right={
                    <>
                      <span className="text-xs font-medium text-emerald-400">{formatMrr(card.recoveryRevenue)}</span>
                      <Badge label={card.recoveryLevelLabel} colorClass={RECOVERY_BADGE[card.recoveryLevel]} />
                    </>
                  }
                />
              ))
            )}
          </Section>
        )}

        {/* Critical Risks */}
        {showCriticalRisks && (
          <Section title="Kritik Riskler" count={riskRows.length} accentClass="text-rose-500">
            {riskRows.length === 0 ? (
              <EmptyState text="Kritik risk yok." />
            ) : (
              riskRows.map((card) => (
                <LeadRow
                  key={card.id}
                  card={card}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  borderColor="border-l-rose-600"
                  right={
                    <>
                      <span className="text-xs font-medium text-rose-400">{formatMrr(card.riskRevenue)}</span>
                      <Badge label={card.riskLevelLabel} colorClass={RISK_BADGE[card.riskLevel]} />
                    </>
                  }
                />
              ))
            )}
          </Section>
        )}

        {/* Communication Alerts */}
        {showCommAlerts && (
          <Section title="İletişim Bekleyenler" count={commRows.length} accentClass="text-sky-500">
            {commRows.length === 0 ? (
              <EmptyState text="Tüm fırsatlarla temas kurulmuş." />
            ) : (
              commRows.map((card) => (
                <LeadRow
                  key={card.id}
                  card={card}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  borderColor="border-l-sky-600"
                  right={
                    <>
                      <span className="text-xs text-zinc-500">%{card.opportunityScore}</span>
                      <Badge label="Temas Yok" colorClass="bg-sky-900/60 text-sky-300" />
                    </>
                  }
                />
              ))
            )}
          </Section>
        )}

        {/* Follow-up Today */}
        {showFollowUpToday && (
          <Section title="Bugünkü Takipler" count={followUpRows.length} accentClass="text-amber-500">
            {followUpRows.length === 0 ? (
              <EmptyState text="Bugün takip yok." />
            ) : (
              followUpRows.map((card) => (
                <LeadRow
                  key={card.id}
                  card={card}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  borderColor={card.isFollowUpOverdue ? "border-l-rose-600" : "border-l-amber-600"}
                  right={
                    <>
                      <span className="text-[10px] text-zinc-500">{card.lastContactLabel}</span>
                      <Badge
                        label={card.isFollowUpOverdue ? "Gecikmiş" : "Bugün"}
                        colorClass={card.isFollowUpOverdue ? "bg-rose-900/60 text-rose-300" : "bg-amber-900/60 text-amber-300"}
                      />
                    </>
                  }
                />
              ))
            )}
          </Section>
        )}

        {/* Pipeline Snapshot */}
        {showPipelineSnapshot && summary.pipelineSnapshot.length > 0 && (
          <div className="space-y-2">
            <SectionLabel label="Pipeline Dağılımı" />
            <div className="rounded-lg bg-zinc-800/40 border border-zinc-700/30 overflow-hidden">
              {summary.pipelineSnapshot.map((row, i) => (
                <PipelineRow
                  key={row.stage}
                  row={row}
                  totalLeads={totalPipelineLeads}
                  isLast={i === summary.pipelineSnapshot.length - 1}
                />
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
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
    <div className={`rounded-lg border px-3 py-2.5 ${bgClass}`}>
      <p className="text-[10px] text-zinc-500 uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-semibold mt-0.5 ${colorClass}`}>{value}</p>
    </div>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="text-[10px] uppercase tracking-widest font-semibold text-zinc-500">
      {label}
    </p>
  );
}

function Section({
  title,
  count,
  accentClass,
  children,
}: {
  title: string;
  count: number;
  accentClass: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-[10px] uppercase tracking-widest font-semibold text-zinc-500">
          {title}
        </p>
        <span className={`text-[10px] font-semibold ${accentClass}`}>{count}</span>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function LeadRow({
  card,
  selectedId,
  onSelect,
  borderColor,
  right,
}: {
  card: RecoveryCard;
  selectedId: string | null;
  onSelect: (c: RecoveryCard) => void;
  borderColor: string;
  right: React.ReactNode;
}) {
  const isSelected = card.id === selectedId;
  return (
    <button
      onClick={() => onSelect(card)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border-l-2 transition-colors text-left ${
        isSelected
          ? "bg-zinc-700/70 border-l-indigo-400"
          : `bg-zinc-800/40 hover:bg-zinc-800/70 ${borderColor}`
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-100 truncate">{card.hotelName}</p>
        <p className="text-xs text-zinc-500 truncate">{card.city}</p>
      </div>
      <div className="flex-shrink-0 flex items-center gap-2">{right}</div>
    </button>
  );
}

function Badge({ label, colorClass }: { label: string; colorClass: string }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colorClass}`}>
      {label}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-xs text-zinc-600 py-2 px-1">{text}</p>;
}

function PipelineRow({
  row,
  totalLeads,
  isLast,
}: {
  row: PipelineStageSnapshot;
  totalLeads: number;
  isLast: boolean;
}) {
  const pct = Math.round((row.count / totalLeads) * 100);
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 ${
        isLast ? "" : "border-b border-zinc-700/30"
      }`}
    >
      <span className="text-xs text-zinc-400 w-28 truncate flex-shrink-0">{row.label}</span>
      <div className="flex-1 bg-zinc-700/40 rounded-full h-1.5">
        <div
          className="bg-indigo-500/70 h-1.5 rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-zinc-500 w-5 text-right flex-shrink-0">{row.count}</span>
      <span className="text-xs text-zinc-600 w-14 text-right flex-shrink-0">
        {formatMrr(row.totalWeightedMrr)}
      </span>
    </div>
  );
}

// ── badge color maps ──────────────────────────────────────────

const RECOVERY_BADGE: Record<string, string> = {
  high: "bg-emerald-900/60 text-emerald-300",
  medium: "bg-sky-900/60 text-sky-300",
  low: "bg-amber-900/60 text-amber-300",
  lost: "bg-zinc-800 text-zinc-500",
};

const RISK_BADGE: Record<string, string> = {
  critical: "bg-rose-900/70 text-rose-300",
  high: "bg-rose-900/50 text-rose-400",
  medium: "bg-amber-900/50 text-amber-400",
  low: "bg-zinc-800 text-zinc-500",
};
