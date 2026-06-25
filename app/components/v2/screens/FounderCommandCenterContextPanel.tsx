import type { RecoveryCard } from "@/app/components/v2/adapters/revenue-recovery-adapter";
import type { PipelineCard } from "@/app/components/v2/adapters/revenue-pipeline-adapter";
import type { CommCard } from "@/app/components/v2/adapters/communication-intelligence-adapter";
import { STAGE_META } from "@/app/components/v2/adapters/revenue-pipeline-adapter";
import {
  computeCommandCenter,
  formatMrr,
  formatPct,
} from "@/app/components/v2/adapters/founder-command-center-adapter";

type Props = {
  selectedCard: RecoveryCard | null;
  recoveryCards: RecoveryCard[];
  pipelineCards: PipelineCard[];
  commCards: CommCard[];
};

export default function FounderCommandCenterContextPanel({
  selectedCard,
  recoveryCards,
  pipelineCards,
  commCards,
}: Props) {
  if (selectedCard) {
    return <LeadDetail card={selectedCard} commCards={commCards} />;
  }
  return <FounderBriefPanel recoveryCards={recoveryCards} pipelineCards={pipelineCards} />;
}

// ── Founder Brief (no selection) ─────────────────────────────

function FounderBriefPanel({
  recoveryCards,
  pipelineCards,
}: {
  recoveryCards: RecoveryCard[];
  pipelineCards: PipelineCard[];
}) {
  const summary = computeCommandCenter(recoveryCards, pipelineCards);

  return (
    <div className="w-[360px] flex-shrink-0 flex flex-col overflow-hidden border-l border-zinc-800">
      <div className="flex-shrink-0 px-4 py-3 border-b border-zinc-800">
        <p className="text-xs font-semibold text-zinc-300">Kurucu Özeti</p>
        <p className="text-[10px] text-zinc-600 mt-0.5">Güncel operasyonel durum</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

        {/* Revenue Summary */}
        <div className="space-y-2">
          <PanelLabel label="Gelir Durumu" />
          <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/30 divide-y divide-zinc-700/30">
            <Row label="Beklenen Gelir" value={formatMrr(summary.expectedRevenue)} valueClass="text-indigo-400" />
            <Row label="Riskli Gelir" value={formatMrr(summary.revenueAtRisk)} valueClass="text-rose-400" />
            <Row label="Kurtarılabilir" value={formatMrr(summary.recoverableRevenue)} valueClass="text-emerald-400" />
            <Row label="Bugünkü Fırsatlar" value={`${summary.todaysOpportunities}`} valueClass="text-amber-400" />
          </div>
          <div className="space-y-1.5 mt-1">
            <BriefLine text={summary.founderBrief.revenueSummary} color="text-zinc-300" />
            <BriefLine text={summary.founderBrief.riskSummary} color={summary.criticalRisks.length > 0 ? "text-rose-400" : "text-emerald-400"} />
            <BriefLine text={summary.founderBrief.recoverySummary} color="text-zinc-400" />
            <BriefLine text={summary.founderBrief.prioritySummary} color="text-zinc-500" />
          </div>
        </div>

        {/* Top Risks */}
        {summary.criticalRisks.length > 0 && (
          <div className="space-y-2">
            <PanelLabel label="Kritik Riskler" />
            <div className="space-y-1">
              {summary.criticalRisks.slice(0, 3).map((c) => (
                <MiniRow
                  key={c.id}
                  name={c.hotelName}
                  city={c.city}
                  value={formatMrr(c.riskRevenue)}
                  badge={c.riskLevelLabel}
                  badgeClass="bg-rose-900/50 text-rose-400"
                  valueClass="text-rose-400"
                />
              ))}
            </div>
          </div>
        )}

        {/* Top Recovery */}
        {summary.recoveryAlerts.length > 0 && (
          <div className="space-y-2">
            <PanelLabel label="Kurtarma Fırsatları" />
            <div className="space-y-1">
              {summary.recoveryAlerts.slice(0, 3).map((c) => (
                <MiniRow
                  key={c.id}
                  name={c.hotelName}
                  city={c.city}
                  value={formatMrr(c.recoveryRevenue)}
                  badge={c.recoveryLevelLabel}
                  badgeClass="bg-emerald-900/50 text-emerald-400"
                  valueClass="text-emerald-400"
                />
              ))}
            </div>
          </div>
        )}

        {/* Today's Priorities */}
        {summary.priorityQueue.length > 0 && (
          <div className="space-y-2">
            <PanelLabel label="Öncelikli Fırsatlar" />
            <div className="space-y-1">
              {summary.priorityQueue.slice(0, 3).map((c) => (
                <MiniRow
                  key={c.id}
                  name={c.hotelName}
                  city={c.city}
                  value={c.actionLabel}
                  badge={`%${c.opportunityScore}`}
                  badgeClass="bg-indigo-900/50 text-indigo-400"
                  valueClass="text-zinc-400"
                />
              ))}
            </div>
          </div>
        )}

        {/* Operating Sequence */}
        <div className="space-y-2">
          <PanelLabel label="Önerilen Çalışma Sırası" />
          <div className="space-y-2">
            {summary.operatingSequence.map((step, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-900/60 text-indigo-400 text-[10px] font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <p className="text-xs text-zinc-400 leading-relaxed">{step}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-2 border-t border-zinc-800">
          <p className="text-[10px] text-zinc-700 text-center">
            ↑ Bir fırsat seçin — 360° detay görünümü açılır
          </p>
        </div>

      </div>
    </div>
  );
}

// ── Lead Detail (selected) ────────────────────────────────────

function LeadDetail({
  card,
  commCards,
}: {
  card: RecoveryCard;
  commCards: CommCard[];
}) {
  const commCard = commCards.find((c) => c.id === card.id) ?? null;
  const stageMeta = STAGE_META[card.stage];

  const nextFollowUpLabel = card.nextFollowUpAtMs
    ? new Date(card.nextFollowUpAtMs).toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "short",
      })
    : null;

  return (
    <div className="w-[360px] flex-shrink-0 flex flex-col overflow-hidden border-l border-zinc-800">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-zinc-800">
        <p className="text-xs font-semibold text-zinc-100 truncate">{card.hotelName}</p>
        <p className="text-[10px] text-zinc-500 mt-0.5">{card.hotelType} · {card.city}</p>
        <div className="flex items-center gap-1.5 mt-2">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-900/50 text-indigo-400">
            {stageMeta.label}
          </span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${PRIORITY_BADGE[card.priority]}`}>
            {PRIORITY_LABEL[card.priority]}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-400">
            {card.packageTier}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* Revenue */}
        <Section label="Gelir">
          <div className="rounded-lg bg-indigo-950/30 border border-indigo-900/30 divide-y divide-indigo-900/20">
            <Row label="Tahmini Gelir" value={formatMrr(card.forecastContribution)} valueClass="text-indigo-400" />
            <Row label="Baz MRR" value={formatMrr(card.baseMrr)} valueClass="text-zinc-300" />
            <Row label="Aşama Olasılığı" value={formatPct(Math.round(card.stageProbability * 100))} valueClass="text-zinc-400" />
          </div>
        </Section>

        {/* Risk */}
        <Section label="Risk">
          <div className={`rounded-lg border divide-y ${RISK_CARD[card.riskLevel]}`}>
            <Row label="Risk Skoru" value={`${card.riskScore}/100`} valueClass="text-rose-400" />
            <Row label="Risk Seviyesi" value={card.riskLevelLabel} valueClass="text-rose-400" />
            <Row label="Riskli Gelir" value={formatMrr(card.riskRevenue)} valueClass="text-rose-400" />
          </div>
          {card.recoverySignals[0] && (
            <p className="text-xs text-zinc-500 mt-1.5">▲ {card.recoverySignals[0]}</p>
          )}
        </Section>

        {/* Recovery */}
        <Section label="Kurtarma">
          <div className={`rounded-lg border divide-y ${RECOVERY_CARD[card.recoveryLevel]}`}>
            <Row label="Kurtarma Skoru" value={`${card.recoveryScore}/100`} valueClass="text-emerald-400" />
            <Row label="Kurtarma Seviyesi" value={card.recoveryLevelLabel} valueClass="text-emerald-400" />
            <Row label="Kurtarılabilir Gelir" value={formatMrr(card.recoveryRevenue)} valueClass="text-emerald-400" />
          </div>
          {card.recoveryReason && (
            <p className="text-xs text-zinc-500 mt-1.5">▲ {card.recoveryReason}</p>
          )}
        </Section>

        {/* ICP */}
        <Section label="ICP Profili">
          <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/30 divide-y divide-zinc-700/30">
            <Row label="ICP Skoru" value={formatPct(card.icpScore)} valueClass={ICP_COLOR(card.icpScore)} />
            <Row label="Paket Tier" value={card.packageTier} valueClass="text-zinc-300" />
          </div>
        </Section>

        {/* Communication */}
        <Section label="İletişim">
          <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/30 divide-y divide-zinc-700/30">
            {commCard ? (
              <>
                <Row label="En İyi Kanal" value={commCard.bestChannel} valueClass="text-sky-400" />
                <Row label="Kanal Sayısı" value={`${commCard.channelCount}`} valueClass="text-zinc-300" />
                <Row label="İletişim Skoru" value={formatPct(commCard.commScore)} valueClass="text-zinc-400" />
              </>
            ) : (
              <Row label="Temas Sayısı" value={`${card.contactAttempts}`} valueClass="text-zinc-300" />
            )}
            <Row label="Son Temas" value={card.lastContactLabel} valueClass="text-zinc-400" />
          </div>
        </Section>

        {/* Follow-up */}
        <Section label="Takip">
          <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/30 divide-y divide-zinc-700/30">
            <Row
              label="Durum"
              value={card.isFollowUpOverdue ? "Gecikmiş" : nextFollowUpLabel ? "Planlandı" : "—"}
              valueClass={card.isFollowUpOverdue ? "text-rose-400" : "text-amber-400"}
            />
            {nextFollowUpLabel && (
              <Row label="Takip Tarihi" value={nextFollowUpLabel} valueClass="text-zinc-300" />
            )}
          </div>
        </Section>

        {/* Pipeline Stage */}
        <Section label="Pipeline Aşaması">
          <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/30 divide-y divide-zinc-700/30">
            <Row label="Aşama" value={stageMeta.label} valueClass="text-indigo-400" />
            <Row label="Aşama Olasılığı" value={formatPct(Math.round(card.stageProbability * 100))} valueClass="text-zinc-300" />
            <Row label="Aşama Sırası" value={`${card.stageRank + 1}/6`} valueClass="text-zinc-400" />
          </div>
        </Section>

        {/* Opportunity Reasons */}
        {card.opportunityReasons.length > 0 && (
          <Section label="Fırsat Sinyalleri">
            <div className="flex flex-wrap gap-1.5">
              {card.opportunityReasons.slice(0, 4).map((r, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full bg-indigo-900/40 text-indigo-400 text-[10px]">
                  {r}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* AI Insight */}
        {card.aiInsight && (
          <Section label="AI İçgörü">
            <div className="rounded-lg bg-indigo-950/30 border border-indigo-900/30 px-3 py-2.5">
              <p className="text-xs text-zinc-400 leading-relaxed">{card.aiInsight}</p>
            </div>
          </Section>
        )}

        {/* Recommended Action */}
        <Section label="Önerilen Aksiyon">
          <div className="rounded-lg bg-amber-950/30 border border-amber-900/30 px-3 py-3 space-y-2">
            <p className="text-xs font-semibold text-amber-300">{card.actionLabel}</p>
            {card.outreachAngle && (
              <p className="text-xs text-zinc-400 leading-relaxed">{card.outreachAngle}</p>
            )}
            {card.whyThisLead[0] && (
              <p className="text-[10px] text-zinc-600 leading-relaxed">{card.whyThisLead[0]}</p>
            )}
          </div>
        </Section>

      </div>
    </div>
  );
}

// ── shared sub-components ─────────────────────────────────────

function PanelLabel({ label }: { label: string }) {
  return (
    <p className="text-[10px] uppercase tracking-widest font-semibold text-zinc-500">
      {label}
    </p>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <PanelLabel label={label} />
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className={`text-xs font-medium ${valueClass}`}>{value}</span>
    </div>
  );
}

function BriefLine({ text, color }: { text: string; color: string }) {
  return <p className={`text-xs leading-relaxed ${color}`}>{text}</p>;
}

function MiniRow({
  name,
  city,
  value,
  badge,
  badgeClass,
  valueClass,
}: {
  name: string;
  city: string;
  value: string;
  badge: string;
  badgeClass: string;
  valueClass: string;
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-zinc-800/40">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-zinc-200 truncate">{name}</p>
        <p className="text-[10px] text-zinc-600">{city}</p>
      </div>
      <span className={`text-xs font-medium flex-shrink-0 ${valueClass}`}>{value}</span>
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${badgeClass}`}>
        {badge}
      </span>
    </div>
  );
}

// ── style maps ────────────────────────────────────────────────

const PRIORITY_LABEL: Record<string, string> = {
  critical: "Kritik",
  high: "Yüksek",
  medium: "Orta",
  low: "Düşük",
};

const PRIORITY_BADGE: Record<string, string> = {
  critical: "bg-rose-900/60 text-rose-300",
  high: "bg-amber-900/60 text-amber-300",
  medium: "bg-sky-900/60 text-sky-300",
  low: "bg-zinc-800 text-zinc-400",
};

const RISK_CARD: Record<string, string> = {
  critical: "bg-rose-950/40 border-rose-900/40 divide-rose-900/30",
  high: "bg-rose-950/30 border-rose-900/30 divide-rose-900/20",
  medium: "bg-amber-950/30 border-amber-900/30 divide-amber-900/20",
  low: "bg-zinc-800/50 border-zinc-700/30 divide-zinc-700/30",
};

const RECOVERY_CARD: Record<string, string> = {
  high: "bg-emerald-950/30 border-emerald-900/30 divide-emerald-900/20",
  medium: "bg-sky-950/30 border-sky-900/30 divide-sky-900/20",
  low: "bg-amber-950/30 border-amber-900/30 divide-amber-900/20",
  lost: "bg-zinc-800/50 border-zinc-700/30 divide-zinc-700/30",
};

function ICP_COLOR(score: number): string {
  if (score >= 70) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-zinc-500";
}
