import type {
  PipelineCard,
  PipelineStage,
  PipelineSummary,
} from "@/app/components/v2/adapters/revenue-pipeline-adapter";
import {
  PIPELINE_STAGES,
  STAGE_META,
  computePipelineSummary,
  formatMrr,
} from "@/app/components/v2/adapters/revenue-pipeline-adapter";
import { Badge } from "@/app/components/v2/primitives/Badge";

// ── stage visual config ───────────────────────────────────────

const STAGE_COLOR: Record<PipelineStage, { text: string; bar: string; bg: string; border: string }> = {
  new: { text: "text-zinc-400", bar: "bg-zinc-500/50", bg: "bg-zinc-600/10", border: "border-zinc-600/20" },
  prioritized: { text: "text-indigo-300", bar: "bg-indigo-500/60", bg: "bg-indigo-500/10", border: "border-indigo-500/20" },
  contacted: { text: "text-sky-300", bar: "bg-sky-500/60", bg: "bg-sky-500/10", border: "border-sky-500/20" },
  "follow-up": { text: "text-amber-300", bar: "bg-amber-500/60", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  demo: { text: "text-violet-300", bar: "bg-violet-500/60", bg: "bg-violet-500/10", border: "border-violet-500/20" },
  closing: { text: "text-emerald-300", bar: "bg-emerald-500/60", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
};

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

// ── root ──────────────────────────────────────────────────────

type Props = {
  selectedCard: PipelineCard | null;
  allCards: PipelineCard[];
};

export default function RevenuePipelineContextPanel({ selectedCard, allCards }: Props) {
  if (selectedCard) return <OpportunityDetail card={selectedCard} />;
  return <PipelineOverview cards={allCards} />;
}

// ── no selection: pipeline overview ──────────────────────────

function PipelineOverview({ cards }: { cards: PipelineCard[] }) {
  const summary: PipelineSummary = computePipelineSummary(cards);

  const totalMrrByStage: Record<PipelineStage, number> = {
    new: 0, prioritized: 0, contacted: 0, "follow-up": 0, demo: 0, closing: 0,
  };
  const countByStage: Record<PipelineStage, number> = {
    new: 0, prioritized: 0, contacted: 0, "follow-up": 0, demo: 0, closing: 0,
  };
  for (const c of cards) {
    totalMrrByStage[c.stage] += c.weightedMrr;
    countByStage[c.stage]++;
  }

  // Top 3 closing-soon leads
  const topClosing = cards
    .filter((c) => c.stage === "closing" || c.stage === "demo")
    .sort((a, b) => b.weightedMrr - a.weightedMrr)
    .slice(0, 3);

  const bottleneckMeta = STAGE_META[summary.bottleneckStage];
  const strongestMeta = STAGE_META[summary.strongestStage];

  return (
    <aside className="flex w-[260px] shrink-0 flex-col gap-3 overflow-y-auto">
      {/* Pipeline total */}
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
        <SectionLabel>Pipeline Özeti</SectionLabel>
        <div className="text-2xl font-bold text-emerald-300 mb-0.5">
          {formatMrr(summary.totalWeightedMrr)}
        </div>
        <div className="text-[11px] text-white/40 mb-3">aylık ağırlıklı pipeline değeri</div>
        <div className="grid grid-cols-2 gap-3">
          <MiniKpi
            label="Aktif Lead"
            value={String(summary.activeCount)}
            color="text-white/70"
          />
          <MiniKpi
            label="Kapanışa Yakın"
            value={String(summary.closingSoonCount)}
            color="text-violet-300"
          />
          <MiniKpi
            label="Ort. Fırsat"
            value={`%${summary.avgOpportunityScore}`}
            color="text-indigo-300"
          />
          <MiniKpi
            label="En Güçlü Aşama"
            value={strongestMeta.label.split(" ")[0]}
            color={STAGE_COLOR[summary.strongestStage].text}
          />
        </div>
      </div>

      {/* Stage distribution */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
        <SectionLabel>Aşama Dağılımı</SectionLabel>
        <div className="space-y-2.5">
          {PIPELINE_STAGES.map((stage) => {
            const count = countByStage[stage];
            const mrr = totalMrrByStage[stage];
            const pct = summary.activeCount > 0
              ? Math.round((count / summary.activeCount) * 100)
              : 0;
            const color = STAGE_COLOR[stage];

            return (
              <div key={stage} className="flex items-center gap-2">
                <span className="w-[88px] text-[10px] text-white/50 truncate">
                  {STAGE_META[stage].label}
                </span>
                <div className="flex-1 h-1 rounded-full bg-white/[0.06]">
                  <div
                    className={`h-full rounded-full ${color.bar}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[10px] text-white/30 tabular-nums w-4 text-right">
                  {count}
                </span>
                {mrr > 0 && (
                  <span className={`text-[10px] tabular-nums w-12 text-right ${color.text}`}>
                    {formatMrr(mrr)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottleneck + strongest */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
        <SectionLabel>Pipeline Sağlığı</SectionLabel>
        <div className={`mb-3 rounded-lg border p-3 ${STAGE_COLOR[summary.bottleneckStage].bg} ${STAGE_COLOR[summary.bottleneckStage].border}`}>
          <div className="text-[10px] text-white/40 mb-0.5">Darboğaz Aşama</div>
          <div className={`text-sm font-semibold ${STAGE_COLOR[summary.bottleneckStage].text}`}>
            {bottleneckMeta.label}
          </div>
          <div className="text-[10px] text-white/35 mt-0.5">
            {countByStage[summary.bottleneckStage]} lead burada bekliyor
          </div>
        </div>
        <div className={`rounded-lg border p-3 ${STAGE_COLOR[summary.strongestStage].bg} ${STAGE_COLOR[summary.strongestStage].border}`}>
          <div className="text-[10px] text-white/40 mb-0.5">En Güçlü Aşama</div>
          <div className={`text-sm font-semibold ${STAGE_COLOR[summary.strongestStage].text}`}>
            {strongestMeta.label}
          </div>
          <div className="text-[10px] text-white/35 mt-0.5">
            {formatMrr(totalMrrByStage[summary.strongestStage])} pipeline değeri
          </div>
        </div>
      </div>

      {/* Closing soon */}
      {topClosing.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
          <SectionLabel>Öncelikli Kapanışlar</SectionLabel>
          <div className="space-y-2">
            {topClosing.map((c) => {
              const color = STAGE_COLOR[c.stage];
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
                    <div className="text-[10px] text-white/35">{c.city}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-[11px] font-bold ${color.text}`}>
                      {formatMrr(c.weightedMrr)}
                    </div>
                    <div className="text-[10px] text-white/30">%{c.opportunityScore}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pipeline action */}
      <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] p-4">
        <SectionLabel>Önerilen Pipeline Aksiyonu</SectionLabel>
        <div className="space-y-2">
          <RecoLine
            icon="◉"
            text={`${countByStage["closing"]} kapanış fırsatını bugün tamamla`}
          />
          <RecoLine
            icon="◎"
            text={`${countByStage["follow-up"]} takip gereken lead iletişim bekliyor`}
          />
          <RecoLine
            icon="○"
            text={`${countByStage["prioritized"]} öncelikli lead henüz temas görmedi`}
          />
        </div>
        <p className="mt-3 text-[10px] text-white/30 leading-relaxed">
          Demo ve kapanış aşamasına odaklanın — en yüksek gelir etkisi burada.
        </p>
      </div>

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
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </div>
        <p className="text-[11px] text-white/35 leading-relaxed">
          Fırsat detayı, gelir potansiyeli ve aksiyon planı için soldaki listeden bir lead seçin.
        </p>
      </div>
    </aside>
  );
}

// ── selected opportunity detail ───────────────────────────────

function OpportunityDetail({ card }: { card: PipelineCard }) {
  const avatarCls = AVATAR_COLORS[stableAvatarIdx(card.id)];
  const stageColor = STAGE_COLOR[card.stage];
  const stageMeta = STAGE_META[card.stage];

  const stageReasoningLines = buildStageReasoning(card);
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
            </div>
          </div>
        </div>
      </div>

      {/* 2. Pipeline stage reasoning */}
      <div className={`rounded-xl border p-4 ${stageColor.bg} ${stageColor.border}`}>
        <SectionLabel>Pipeline Aşama Gerekçesi</SectionLabel>
        <div className={`text-base font-bold mb-1 ${stageColor.text}`}>
          {stageMeta.label}
        </div>
        <p className="text-[10px] text-white/40 mb-3">{stageMeta.description}</p>
        <div className="space-y-1.5">
          {stageReasoningLines.map((line, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className={`text-[9px] mt-0.5 shrink-0 ${stageColor.text}`}>▸</span>
              <span className="text-[11px] text-white/55 leading-relaxed">{line}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Revenue potential */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
        <SectionLabel>Gelir Potansiyeli</SectionLabel>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <ScoreTile
            label="Ağırlıklı MRR"
            value={formatMrr(card.weightedMrr)}
            color="text-emerald-300"
          />
          <ScoreTile
            label="Fırsat Skoru"
            value={`%${card.opportunityScore}`}
            color="text-indigo-300"
          />
        </div>
        <div className="pt-3 border-t border-white/[0.06]">
          <StatRow label="Baz MRR" value={formatMrr(card.baseMrr)} />
          <StatRow label="Dönüşüm Ağırlığı" value={`%${card.opportunityScore}`} />
          {card.icpScore > 0 && (
            <StatRow label="ICP Uyumu" value={`%${card.icpScore}`} />
          )}
          <StatRow
            label="Temas Sayısı"
            value={card.contactAttempts > 0 ? `${card.contactAttempts}x` : "İlk temas"}
          />
          <StatRow
            label="Son Temas"
            value={card.lastContactLabel !== "—" ? card.lastContactLabel : "Hiç temas yok"}
          />
        </div>
      </div>

      {/* 4. Next best action */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
        <SectionLabel>Sonraki En İyi Aksiyon</SectionLabel>
        <div className="text-sm font-semibold text-amber-300 mb-2">
          {card.actionLabel}
        </div>
        <p className="text-[11px] text-white/55 leading-relaxed">{nextActionText}</p>
        {card.outreachAngle && (
          <div className="mt-3 pt-3 border-t border-white/[0.06]">
            <div className="text-[10px] text-white/30 mb-1">Outreach Açısı</div>
            <p className="text-[11px] text-white/55 leading-relaxed">{card.outreachAngle}</p>
          </div>
        )}
      </div>

      {/* 5. Why this opportunity */}
      {card.whyThisLead.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
          <SectionLabel>Neden Bu Fırsat Önemli?</SectionLabel>
          <div className="space-y-2">
            {card.whyThisLead.slice(0, 4).map((reason, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="shrink-0 text-[9px] font-bold tabular-nums text-white/25 mt-0.5 w-4">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[11px] text-white/55 leading-relaxed">{reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Opportunity reasons */}
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

      {/* AI insight */}
      {card.aiInsight && (
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] p-4">
          <SectionLabel>AI İçgörü</SectionLabel>
          <p className="text-[11px] text-white/60 leading-relaxed">{card.aiInsight}</p>
        </div>
      )}
    </aside>
  );
}

// ── reasoning builders ────────────────────────────────────────

function buildStageReasoning(card: PipelineCard): string[] {
  const lines: string[] = [];

  switch (card.stage) {
    case "new":
      lines.push("Henüz hiç temas kurulmamış fırsat.");
      lines.push("Outreach aksiyonu ilk adım olmalı.");
      if (card.outreachPriority > 60) lines.push("Yüksek outreach önceliği mevcut.");
      break;

    case "prioritized":
      lines.push("Yüksek öncelik atandı, temas bekleniyor.");
      if (card.priority === "critical") lines.push("Kritik öncelikli — bugün temas kurulmalı.");
      lines.push(`Fırsat skoru %${card.opportunityScore} ile ilerletme için hazır.`);
      break;

    case "contacted":
      lines.push(`${card.contactAttempts}x temas yapıldı.`);
      lines.push("Takip aksiyonu henüz planlanmadı.");
      lines.push("Yanıt bekleniyor veya follow-up gerekiyor.");
      break;

    case "follow-up":
      lines.push(`${card.contactAttempts}x temas sonrası takip aşamasında.`);
      lines.push("Follow-up aksiyonu aktif olarak planlandı.");
      if (card.lastContactLabel !== "—") {
        lines.push(`Son temas: ${card.lastContactLabel}.`);
      }
      break;

    case "demo":
      lines.push(`Fırsat skoru %${card.opportunityScore} ile demo aşamasına uygun.`);
      lines.push(`${card.contactAttempts}x temas ile güçlü ilgi mevcut.`);
      lines.push("Teklif veya demo sunumu için hazır.");
      break;

    case "closing":
      lines.push("Kritik aşama — kapanışa en yakın fırsat.");
      lines.push(`Fırsat skoru %${card.opportunityScore} ile en yüksek band.`);
      lines.push("Tüm sinyaller kapatmaya uygun gösteriyor.");
      break;
  }

  return lines;
}

function buildNextAction(card: PipelineCard): string {
  switch (card.stage) {
    case "new":
      return "İlk temas için WhatsApp mesajı veya araması yapın. Bu lead henüz hiç temas görmeди.";
    case "prioritized":
      return "Yüksek öncelikli — bugün veya yarın temas kurun. Fırsat penceresi daralıyor.";
    case "contacted":
      return "İlk temas yapıldı, yanıt gelmediyse 24-48 saat içinde takip edin.";
    case "follow-up":
      return "Takip zamanı geldi. Önceki temasın üzerine inşa edin, değer önerisi sunun.";
    case "demo":
      return "Demo veya teklif sunum fırsatı olgunlaştı. TUGOBO değer propozisyonunu paylaşın.";
    case "closing":
      return "Kapatma fırsatı kritik eşikte. Karar vericiyi belirleyin ve teklifi somutlaştırın.";
  }
}

// ── sub-components ────────────────────────────────────────────

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
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-white/35 mt-0.5">{label}</div>
    </div>
  );
}

function RecoLine({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-indigo-400 text-xs mt-0.5 shrink-0">{icon}</span>
      <span className="text-[11px] text-white/60 leading-relaxed">{text}</span>
    </div>
  );
}
