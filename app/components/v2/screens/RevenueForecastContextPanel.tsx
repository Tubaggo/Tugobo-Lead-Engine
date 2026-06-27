import type {
  ForecastCard,
  ForecastConfidenceLevel,
  ForecastSummary,
} from "@/app/components/v2/adapters/revenue-forecast-adapter";
import {
  computeForecastSummary,
  formatMrr,
  formatProbabilityPct,
} from "@/app/components/v2/adapters/revenue-forecast-adapter";
import {
  STAGE_META,
  type PipelineStage,
} from "@/app/components/v2/adapters/revenue-pipeline-adapter";
import { Badge } from "@/app/components/v2/primitives/Badge";

// ── stage colors ──────────────────────────────────────────────

const STAGE_COLOR: Record<
  PipelineStage,
  { text: string; bar: string; bg: string; border: string }
> = {
  new: {
    text: "text-zinc-400",
    bar: "bg-zinc-500/50",
    bg: "bg-zinc-600/10",
    border: "border-zinc-600/20",
  },
  prioritized: {
    text: "text-indigo-300",
    bar: "bg-indigo-500/60",
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/20",
  },
  contacted: {
    text: "text-sky-300",
    bar: "bg-sky-500/60",
    bg: "bg-sky-500/10",
    border: "border-sky-500/20",
  },
  "follow-up": {
    text: "text-amber-300",
    bar: "bg-amber-500/60",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
  demo: {
    text: "text-violet-300",
    bar: "bg-violet-500/60",
    bg: "bg-violet-500/10",
    border: "border-violet-500/20",
  },
  closing: {
    text: "text-emerald-300",
    bar: "bg-emerald-500/60",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
};

// ── confidence colors ─────────────────────────────────────────

const CONF_COLOR: Record<
  ForecastConfidenceLevel,
  { text: string; bg: string; border: string; bar: string }
> = {
  high: {
    text: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    bar: "bg-emerald-500/60",
  },
  medium: {
    text: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    bar: "bg-amber-500/60",
  },
  low: {
    text: "text-zinc-400",
    bg: "bg-zinc-600/10",
    border: "border-zinc-600/20",
    bar: "bg-zinc-500/50",
  },
};

// ── avatar ────────────────────────────────────────────────────

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

const PRIORITY_TR: Record<string, string> = {
  critical: "Kritik",
  high: "Yüksek",
  medium: "Orta",
  low: "Düşük",
};

function priorityVariant(p: string) {
  switch (p) {
    case "critical": return "critical" as const;
    case "high": return "high" as const;
    case "medium": return "medium" as const;
    default: return "low" as const;
  }
}

// ── shared primitives ─────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 mb-2">
      {children}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="text-xs text-white/40">{label}</span>
      <span className="text-xs font-medium text-white/70">{value}</span>
    </div>
  );
}

function MiniKpi({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-lg bg-white/[0.03] p-2.5">
      <div className="text-[10px] text-white/35 mb-0.5">{label}</div>
      <div className={`text-sm font-bold ${color}`}>{value}</div>
    </div>
  );
}

// ── root ──────────────────────────────────────────────────────

type Props = {
  selectedCard: ForecastCard | null;
  allCards: ForecastCard[];
};

export default function RevenueForecastContextPanel({
  selectedCard,
  allCards,
}: Props) {
  if (selectedCard) return <ForecastDetail card={selectedCard} />;
  return <ForecastOverview cards={allCards} />;
}

// ── no selection: forecast overview ──────────────────────────

function ForecastOverview({ cards }: { cards: ForecastCard[] }) {
  const summary: ForecastSummary = computeForecastSummary(cards);
  const maxWeekMrr = Math.max(
    ...summary.weeklyDistribution.map((w) => w.forecastMrr),
    1,
  );

  return (
    <aside className="flex w-[260px] shrink-0 flex-col gap-3 overflow-y-auto">
      {/* Forecast summary */}
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
        <SectionLabel>Gelir Tahmini (Gerçekçi)</SectionLabel>
        <div className="text-2xl font-bold text-emerald-300 mb-0.5">
          {formatMrr(summary.forecastMrr)}
        </div>
        <div className="text-[11px] text-white/40 mb-3">
          aylık tahmin · {formatMrr(summary.forecastArr)} yıllık
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MiniKpi
            label="Beklenen Kapanış"
            value={String(summary.expectedClosings)}
            color="text-violet-300"
          />
          <MiniKpi
            label="Tahmin Güveni"
            value={`%${summary.forecastConfidence}`}
            color={
              summary.forecastConfidence >= 65
                ? "text-emerald-300"
                : summary.forecastConfidence >= 40
                  ? "text-amber-300"
                  : "text-zinc-400"
            }
          />
          <MiniKpi
            label="Aktif Fırsat"
            value={String(summary.totalActive)}
            color="text-white/70"
          />
          <MiniKpi
            label="Güven Seviyesi"
            value={summary.forecastConfidenceLabel}
            color={
              summary.forecastConfidenceLabel === "Yüksek"
                ? "text-emerald-300"
                : summary.forecastConfidenceLabel === "Orta"
                  ? "text-amber-300"
                  : "text-zinc-400"
            }
          />
        </div>
      </div>

      {/* Scenario comparison */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
        <SectionLabel>Senaryo Karşılaştırması</SectionLabel>
        <div className="space-y-2">
          {/* Conservative */}
          <div className="rounded-lg border border-zinc-600/20 bg-zinc-600/[0.06] p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-zinc-300">
                {summary.conservative.label}
              </span>
              <span className="text-xs font-bold text-zinc-300">
                {formatMrr(summary.conservative.mrr)}
              </span>
            </div>
            <p className="text-[10px] text-white/35 leading-relaxed mb-1.5">
              {summary.conservative.description}
            </p>
            {summary.conservative.assumptions.map((a, i) => (
              <div key={i} className="text-[10px] text-white/25 flex items-start gap-1">
                <span className="shrink-0 text-zinc-500">·</span>
                {a}
              </div>
            ))}
          </div>

          {/* Realistic */}
          <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/[0.06] p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-indigo-300">
                  {summary.realistic.label}
                </span>
                <span className="rounded-full bg-indigo-500/20 px-1.5 py-0.5 text-[9px] text-indigo-400 ring-1 ring-indigo-500/30">
                  Baz
                </span>
              </div>
              <span className="text-xs font-bold text-indigo-300">
                {formatMrr(summary.realistic.mrr)}
              </span>
            </div>
            <p className="text-[10px] text-white/35 leading-relaxed mb-1.5">
              {summary.realistic.description}
            </p>
            {summary.realistic.assumptions.map((a, i) => (
              <div key={i} className="text-[10px] text-white/25 flex items-start gap-1">
                <span className="shrink-0 text-indigo-500">·</span>
                {a}
              </div>
            ))}
          </div>

          {/* Optimistic */}
          <div className="rounded-lg border border-violet-500/20 bg-violet-500/[0.06] p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-violet-300">
                {summary.optimistic.label}
              </span>
              <span className="text-xs font-bold text-violet-300">
                {formatMrr(summary.optimistic.mrr)}
              </span>
            </div>
            <p className="text-[10px] text-white/35 leading-relaxed mb-1.5">
              {summary.optimistic.description}
            </p>
            {summary.optimistic.assumptions.map((a, i) => (
              <div key={i} className="text-[10px] text-white/25 flex items-start gap-1">
                <span className="shrink-0 text-violet-500">·</span>
                {a}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Monthly distribution */}
      {summary.weeklyDistribution.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
          <SectionLabel>Aylık Dağılım</SectionLabel>
          <div className="space-y-2.5">
            {summary.weeklyDistribution.map((w) => {
              const pct =
                maxWeekMrr > 0
                  ? Math.round((w.forecastMrr / maxWeekMrr) * 100)
                  : 0;
              const isHighest = w.forecastMrr === maxWeekMrr;
              return (
                <div key={w.week} className="flex items-center gap-2">
                  <span className="w-16 text-[10px] text-white/50 shrink-0">
                    {w.label}
                  </span>
                  <div className="flex-1 h-1 rounded-full bg-white/[0.06]">
                    <div
                      className={`h-full rounded-full ${isHighest ? "bg-emerald-500/60" : "bg-indigo-500/40"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-white/30 tabular-nums w-4 text-right shrink-0">
                    {w.count}
                  </span>
                  <span className="text-[10px] tabular-nums w-12 text-right shrink-0 text-emerald-300/70">
                    {w.forecastMrr > 0 ? formatMrr(w.forecastMrr) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top expected closings */}
      {summary.topExpectedClosings.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
          <SectionLabel>Beklenen Kapanışlar</SectionLabel>
          <div className="space-y-2">
            {summary.topExpectedClosings.map((c) => {
              const confColor = CONF_COLOR[c.confidenceLevel];
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-2.5 rounded-lg bg-white/[0.03] p-2.5"
                >
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold ${AVATAR_COLORS[stableAvatarIdx(c.id)]}`}
                  >
                    {c.hotelName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-white/80 truncate">
                      {c.hotelName}
                    </div>
                    <div className="text-[10px] text-white/35">
                      {c.city} · {c.forecastWindow}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[11px] font-bold text-emerald-300">
                      {formatMrr(c.forecastContribution)}
                    </div>
                    <div className={`text-[10px] ${confColor.text}`}>
                      {c.confidenceLabel}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Revenue at risk */}
      {summary.atRiskCards.length > 0 && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-4">
          <SectionLabel>Düşük Güven Riski</SectionLabel>
          <div className="space-y-1.5 mb-2">
            {summary.atRiskCards.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-2"
              >
                <div className="min-w-0">
                  <div className="text-xs text-white/70 truncate">{c.hotelName}</div>
                  <div className="text-[10px] text-white/35">{c.city}</div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <div className="text-[11px] font-semibold text-rose-300">
                    {formatMrr(c.weightedMrr)}
                  </div>
                  <div className="text-[10px] text-white/30">
                    {STAGE_META[c.stage].label}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-white/30 leading-relaxed">
            Bu fırsatlar erken aşamada — temas olmadan kaybolabilir.
          </p>
        </div>
      )}

      {/* Select hint */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 flex items-start gap-2.5">
        <div className="mt-0.5 h-5 w-5 shrink-0 rounded-md bg-indigo-500/20 flex items-center justify-center">
          <svg
            className="h-3 w-3 text-indigo-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
        </div>
        <p className="text-[11px] text-white/35 leading-relaxed">
          Gelir hesabı, aşama güveni ve tahmin gerekçesi için soldaki listeden bir lead seçin.
        </p>
      </div>
    </aside>
  );
}

// ── selected lead: forecast detail ───────────────────────────

function ForecastDetail({ card }: { card: ForecastCard }) {
  const avatarCls = AVATAR_COLORS[stableAvatarIdx(card.id)];
  const stageColor = STAGE_COLOR[card.stage];
  const stageMeta = STAGE_META[card.stage];
  const confColor = CONF_COLOR[card.confidenceLevel];

  const forecastReasoningLines = buildForecastReasoning(card);
  const confidenceReasoning = buildConfidenceReasoning(card);
  const nextActionText = buildNextAction(card);

  return (
    <aside className="flex w-[260px] shrink-0 flex-col gap-3 overflow-y-auto">
      {/* 1. Opportunity profile */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base font-bold ${avatarCls}`}
          >
            {card.hotelName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-white/90 text-sm leading-tight truncate">
              {card.hotelName}
            </div>
            <div className="text-[11px] text-white/40 mt-0.5">
              {card.city} · {card.hotelType}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              <Badge variant={priorityVariant(card.priority)}>
                {PRIORITY_TR[card.priority] ?? card.priority}
              </Badge>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${stageColor.bg} ${stageColor.text} ${stageColor.border}`}
              >
                {stageMeta.label}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${confColor.bg} ${confColor.text} ${confColor.border}`}
              >
                {card.confidenceLabel}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Forecast contribution */}
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
        <SectionLabel>Tahmin Katkısı</SectionLabel>
        <div className="text-2xl font-bold text-emerald-300 mb-0.5">
          {formatMrr(card.forecastContribution)}
        </div>
        <div className="text-[11px] text-white/40 mb-3">
          aylık tahmin katkısı · pencere: {card.forecastWindow}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ScoreTile
            label="Aşama Olasılığı"
            value={formatProbabilityPct(card.stageProbability)}
            color="text-indigo-300"
          />
          <ScoreTile
            label="Ağırlıklı MRR"
            value={formatMrr(card.weightedMrr)}
            color="text-violet-300"
          />
        </div>
      </div>

      {/* 3. Revenue calculation breakdown */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
        <SectionLabel>Gelir Hesabı</SectionLabel>
        <div className="space-y-0">
          <CalcRow
            label="Baz MRR"
            value={formatMrr(card.baseMrr)}
            note={`${card.packageTier} paketi`}
          />
          <CalcRow
            label="Dönüşüm Ağırlığı"
            value={`× %${card.opportunityScore}`}
            note="fırsat skoru"
          />
          <CalcRow
            label="Ağırlıklı MRR"
            value={formatMrr(card.weightedMrr)}
            note="beklenen aylık değer"
            highlight
          />
          <CalcRow
            label="Aşama Olasılığı"
            value={formatProbabilityPct(card.stageProbability)}
            note={stageMeta.label}
          />
          <CalcRow
            label="Tahmin Katkısı"
            value={formatMrr(card.forecastContribution)}
            note="bu ay beklenen gelir"
            accent
          />
        </div>
      </div>

      {/* 4. Pipeline stage confidence */}
      <div
        className={`rounded-xl border p-4 ${confColor.bg} ${confColor.border}`}
      >
        <SectionLabel>Pipeline Aşama Güveni</SectionLabel>
        <div className={`text-base font-bold mb-1 ${confColor.text}`}>
          {card.confidenceLabel} Güven
        </div>
        <p className="text-[11px] text-white/50 leading-relaxed mb-2">
          {confidenceReasoning}
        </p>
        <div className="mt-2">
          <StatRow label="Pipeline Aşaması" value={stageMeta.label} />
          <StatRow label="Temas Sayısı" value={card.contactAttempts > 0 ? `${card.contactAttempts}x` : "Hiç yok"} />
          <StatRow label="Fırsat Skoru" value={`%${card.opportunityScore}`} />
          {card.icpScore > 0 && (
            <StatRow label="ICP Uyumu" value={`%${card.icpScore}`} />
          )}
        </div>
      </div>

      {/* 5. Forecast reasoning */}
      <div className={`rounded-xl border p-4 ${stageColor.bg} ${stageColor.border}`}>
        <SectionLabel>Tahmin Gerekçesi</SectionLabel>
        <div className={`text-sm font-semibold mb-1 ${stageColor.text}`}>
          {card.forecastWindow} · {stageMeta.label}
        </div>
        <p className="text-[10px] text-white/40 mb-3">{stageMeta.description}</p>
        <div className="space-y-1.5">
          {forecastReasoningLines.map((line, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className={`text-[9px] mt-0.5 shrink-0 ${stageColor.text}`}>
                ▸
              </span>
              <span className="text-[11px] text-white/55 leading-relaxed">
                {line}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 6. Next best action */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
        <SectionLabel>Sonraki En İyi Aksiyon</SectionLabel>
        <div className="text-sm font-semibold text-amber-300 mb-2">
          {card.actionLabel}
        </div>
        <p className="text-[11px] text-white/55 leading-relaxed">{nextActionText}</p>
        {card.outreachAngle && (
          <div className="mt-3 pt-3 border-t border-white/[0.06]">
            <div className="text-[10px] text-white/30 mb-1">Outreach Açısı</div>
            <p className="text-[11px] text-white/55 leading-relaxed">
              {card.outreachAngle}
            </p>
          </div>
        )}
      </div>

      {/* 7. Opportunity signals */}
      {card.opportunityReasons.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
          <SectionLabel>Fırsat Sinyalleri</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {card.opportunityReasons.slice(0, 6).map((r) => (
              <span
                key={r}
                className="rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-[10px] font-medium text-indigo-300 ring-1 ring-inset ring-indigo-500/25"
              >
                {r.replaceAll("_", " ")}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 8. Why this opportunity */}
      {card.whyThisLead.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
          <SectionLabel>Neden Bu Fırsat?</SectionLabel>
          <div className="space-y-2">
            {card.whyThisLead.slice(0, 3).map((reason, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="shrink-0 text-[9px] font-bold tabular-nums text-white/25 mt-0.5 w-4">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[11px] text-white/55 leading-relaxed">
                  {reason}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 9. AI insight */}
      {card.aiInsight && (
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] p-4">
          <SectionLabel>AI İçgörü</SectionLabel>
          <p className="text-[11px] text-white/60 leading-relaxed">
            {card.aiInsight}
          </p>
        </div>
      )}
    </aside>
  );
}

// ── reasoning builders ────────────────────────────────────────

function buildForecastReasoning(card: ForecastCard): string[] {
  const lines: string[] = [];

  switch (card.stage) {
    case "closing":
      lines.push("Kapanış aşamasında — bu hafta tamamlanabilir.");
      lines.push("Karar vericiyle son temas yapın, teklife onay isteyin.");
      if (card.contactAttempts > 1) {
        lines.push(`${card.contactAttempts}x temas güçlü ilişki sinyali.`);
      }
      break;
    case "demo":
      lines.push("Demo/teklif aşamasında — 2 hafta içinde kapanış bekleniyor.");
      lines.push("Teklif sunumu veya demo için randevu alın.");
      if (card.contactAttempts > 0) {
        lines.push("Temas geçmişi değer önerisini güçlendiriyor.");
      }
      break;
    case "follow-up":
      lines.push("Takip aşamasında — 3 hafta içinde yanıt alınabilir.");
      lines.push("Önceki temasa referansla değer önerisi güçlendirin.");
      if (card.contactAttempts > 0) {
        lines.push(`${card.lastContactLabel} son temas yapıldı.`);
      }
      break;
    case "contacted":
      lines.push("İletişim kuruldu — bu ay içinde ilerleme bekleniyor.");
      lines.push("Takip mesajı gönderin, karar kıldırıcı argüman ekleyin.");
      break;
    case "prioritized":
      lines.push("Önceliklendirildi, henüz temas yok — 2 ayı aşmamalı.");
      lines.push("İlk temas için WhatsApp veya aramayı planlayın.");
      break;
    default:
      lines.push("Yeni fırsat, henüz temas yok — 3 ay+ zaman çerçevesi.");
      lines.push("Önce araştırın, ardından outreach açısını belirleyin.");
  }

  if (card.opportunityScore >= 65) {
    lines.push(`%${card.opportunityScore} fırsat skoru güçlü dönüşüm sinyali.`);
  }

  return lines;
}

function buildConfidenceReasoning(card: ForecastCard): string {
  switch (card.confidenceLevel) {
    case "high":
      if (card.stage === "closing") {
        return "Kapanış aşaması ve pipeline sinyalleri yüksek güveni destekliyor.";
      }
      return "Demo aşaması ile temas geçmişi yüksek dönüşüm olasılığı gösteriyor.";
    case "medium":
      if (card.stage === "follow-up") {
        return "Takip aşamasında aktif süreç var, ancak karar henüz alınmadı.";
      }
      if (card.stage === "contacted") {
        return "İlk temas yapıldı, yanıt bekleniyor — orta güven beklenen.";
      }
      return "Orta aşamada — temas artışı güveni yükseltecek.";
    case "low":
      if (card.contactAttempts === 0) {
        return "Hiç temas yok — düşük güven beklenen. İlk temas güveni hızla artırır.";
      }
      return "Erken aşama, yeterli pipeline sinyali birikmedi.";
  }
}

function buildNextAction(card: ForecastCard): string {
  switch (card.stage) {
    case "closing":
      return "Kapatma fırsatı kritik eşikte. Karar vericiyi belirleyin ve teklifi somutlaştırın.";
    case "demo":
      return "Demo veya teklif sunum fırsatı olgunlaştı. TUGOBO değer propozisyonunu paylaşın.";
    case "follow-up":
      return "Takip zamanı geldi. Önceki temasın üzerine inşa edin, değer önerisi sunun.";
    case "contacted":
      return "İlk temas yapıldı, yanıt gelmediyse 24-48 saat içinde takip edin.";
    case "prioritized":
      return "Yüksek öncelikli — bugün veya yarın temas kurun. Fırsat penceresi daralıyor.";
    default:
      return "İlk temas için WhatsApp mesajı veya araması yapın. Bu lead henüz hiç temas görmedi.";
  }
}

// ── sub-components ────────────────────────────────────────────

function ScoreTile({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-lg bg-white/[0.03] p-3 text-center">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-white/35 mt-0.5">{label}</div>
    </div>
  );
}

function CalcRow({
  label,
  value,
  note,
  highlight,
  accent,
}: {
  label: string;
  value: string;
  note: string;
  highlight?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={[
        "flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0",
        highlight ? "border-t border-white/[0.08] mt-1 pt-3" : "",
        accent ? "border-t border-white/[0.08] mt-1 pt-3" : "",
      ].join(" ")}
    >
      <div>
        <div
          className={`text-xs ${accent ? "font-semibold text-emerald-300" : highlight ? "font-medium text-white/70" : "text-white/40"}`}
        >
          {label}
        </div>
        <div className="text-[10px] text-white/25">{note}</div>
      </div>
      <span
        className={`text-sm font-bold ${accent ? "text-emerald-300" : highlight ? "text-white/80" : "text-white/60"}`}
      >
        {value}
      </span>
    </div>
  );
}
