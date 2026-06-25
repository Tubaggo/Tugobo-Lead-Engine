import type {
  IcpCard,
  IcpFitTier,
  IcpSummary,
  EstimatedPropertySize,
  EstimatedDemandVolume,
  DirectBookingReadiness,
  OtaDependencyLevel,
} from "@/app/components/v2/adapters/icp-analysis-adapter";
import { computeIcpSummary } from "@/app/components/v2/adapters/icp-analysis-adapter";
import { Badge } from "@/app/components/v2/primitives/Badge";

type Props = {
  selectedCard: IcpCard | null;
  allCards: IcpCard[];
};

const PROPERTY_SIZE_LABEL: Record<EstimatedPropertySize, string> = {
  small: "Küçük",
  medium: "Orta",
  large: "Büyük",
  unknown: "—",
};

const DEMAND_LABEL: Record<EstimatedDemandVolume, string> = {
  high: "Yüksek",
  medium: "Orta",
  low: "Düşük",
  unknown: "—",
};

const DIRECT_LABEL: Record<DirectBookingReadiness, string> = {
  high: "Yüksek",
  medium: "Orta",
  low: "Düşük",
  unknown: "—",
};

const OTA_LABEL: Record<OtaDependencyLevel, string> = {
  high: "Yüksek",
  medium: "Orta",
  low: "Düşük",
  unknown: "—",
};

const ICP_TIER_LABEL: Record<IcpFitTier, string> = {
  strong: "Güçlü ICP",
  good: "İyi ICP",
  weak: "Zayıf ICP",
  "no-data": "ICP Verisi Yok",
};

function icpTierBadgeVariant(tier: IcpFitTier) {
  switch (tier) {
    case "strong":
      return "enterprise" as const;
    case "good":
      return "professional" as const;
    case "weak":
      return "starter" as const;
    default:
      return "default" as const;
  }
}

function priorityBadgeVariant(p: string) {
  switch (p) {
    case "critical":
      return "critical" as const;
    case "high":
      return "high" as const;
    case "medium":
      return "medium" as const;
    default:
      return "low" as const;
  }
}

const PRIORITY_TR: Record<string, string> = {
  critical: "Kritik",
  high: "Yüksek",
  medium: "Orta",
  low: "Düşük",
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
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return h % AVATAR_COLORS.length;
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-white/[0.06]">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <span className="w-7 text-right text-[11px] text-white/60 tabular-nums">
        {value > 0 ? value : "—"}
      </span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 mb-2">
      {children}
    </div>
  );
}

function DimRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="text-xs text-white/40">{label}</span>
      <span className="text-xs font-medium text-white/70">{value}</span>
    </div>
  );
}

function ChannelDot({ active, label }: { active: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-400" : "bg-zinc-600"}`}
      />
      <span className={`text-[11px] ${active ? "text-white/70" : "text-white/30"}`}>{label}</span>
    </div>
  );
}

export default function IcpAnalysisContextPanel({ selectedCard, allCards }: Props) {
  if (selectedCard) {
    return <LeadDetail card={selectedCard} />;
  }
  return <WorkspaceSummary cards={allCards} />;
}

function WorkspaceSummary({ cards }: { cards: IcpCard[] }) {
  const summary = computeIcpSummary(cards);

  // Find strongest and weakest city by avg ICP score
  const cityMap: Record<string, number[]> = {};
  for (const c of cards) {
    if (c.icpScore > 0) {
      if (!cityMap[c.city]) cityMap[c.city] = [];
      cityMap[c.city].push(c.icpScore);
    }
  }
  const cityAvgs = Object.entries(cityMap).map(([city, scores]) => ({
    city,
    avg: Math.round(scores.reduce((s, v) => s + v, 0) / scores.length),
    count: scores.length,
  }));
  cityAvgs.sort((a, b) => b.avg - a.avg);

  const strongest = cityAvgs[0] ?? null;
  const weakest = cityAvgs[cityAvgs.length - 1] ?? null;

  return (
    <aside className="flex w-[330px] shrink-0 flex-col gap-3 overflow-y-auto">
      {/* ICP Model Card */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
        <SectionLabel>ICP Hedefleme Modeli</SectionLabel>
        <p className="text-[11px] text-white/50 leading-relaxed">
          TUGOBO AI hedef kitlesini belirleyen kriterler: aktif Instagram veya WhatsApp kanalı,
          yüksek talep hacmi, OTA bağımlılığı ve zayıf direkt rezervasyon akışı olan oteller
          en yüksek operasyonel değeri temsil eder.
        </p>
      </div>

      {/* Distribution */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
        <SectionLabel>ICP Dağılımı</SectionLabel>
        <div className="space-y-2">
          <DistBar label="Güçlü" count={summary.strongCount} total={summary.total} color="bg-purple-500" />
          <DistBar label="İyi" count={summary.goodCount} total={summary.total} color="bg-sky-500" />
          <DistBar label="Zayıf" count={summary.weakCount} total={summary.total} color="bg-zinc-500" />
          <DistBar label="Veri Yok" count={summary.noDataCount} total={summary.total} color="bg-zinc-700" />
        </div>
      </div>

      {/* Segment Insight */}
      {cityAvgs.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
          <SectionLabel>Segment Analizi</SectionLabel>
          <div className="space-y-3">
            {strongest && (
              <div>
                <div className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wide mb-0.5">
                  En Güçlü Segment
                </div>
                <div className="text-sm font-medium text-white/80">{strongest.city}</div>
                <div className="text-[11px] text-white/40">
                  Ort. ICP %{strongest.avg} · {strongest.count} lead
                </div>
              </div>
            )}
            {weakest && weakest.city !== strongest?.city && (
              <div>
                <div className="text-[10px] text-rose-400 font-semibold uppercase tracking-wide mb-0.5">
                  En Zayıf Segment
                </div>
                <div className="text-sm font-medium text-white/80">{weakest.city}</div>
                <div className="text-[11px] text-white/40">
                  Ort. ICP %{weakest.avg} · {weakest.count} lead
                </div>
              </div>
            )}
          </div>

          {/* City bars */}
          {cityAvgs.length > 1 && (
            <div className="mt-3 space-y-1.5">
              {cityAvgs.slice(0, 6).map((entry) => (
                <div key={entry.city} className="flex items-center gap-2">
                  <span className="w-20 truncate text-[10px] text-white/40">{entry.city}</span>
                  <div className="flex-1 h-1 rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-indigo-500/60"
                      style={{ width: `${entry.avg}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-white/40 tabular-nums w-7 text-right">
                    %{entry.avg}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Targeting Recommendation */}
      <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] p-4">
        <SectionLabel>Hedefleme Önerisi</SectionLabel>
        <div className="space-y-2">
          <RecoLine icon="◉" text={`${summary.strongCount} güçlü ICP uyumlu lead direkt satışa hazır`} />
          <RecoLine
            icon="◎"
            text={`${summary.highDemandCount} lead yüksek talep hacmiyle öne çıkıyor`}
          />
          <RecoLine
            icon="○"
            text={`${summary.operationalFitCount} lead Tugobo operasyonel uyumunu karşılıyor`}
          />
        </div>
        <p className="mt-3 text-[10px] text-white/30 leading-relaxed">
          Güçlü ICP + yüksek talep kombinasyonu olan leadleri önceliklendirin.
        </p>
      </div>

      {/* Select hint */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 flex items-start gap-2.5">
        <div className="mt-0.5 h-5 w-5 shrink-0 rounded-md bg-indigo-500/20 flex items-center justify-center">
          <svg className="h-3 w-3 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </div>
        <p className="text-[11px] text-white/35 leading-relaxed">
          Detaylı ICP profili ve operasyonel değer analizi için soldaki listeden bir lead seçin.
        </p>
      </div>
    </aside>
  );
}

function DistBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-[11px] text-white/50">{label}</span>
      <div className="flex-1 h-1 rounded-full bg-white/[0.06]">
        <div className={`h-full rounded-full ${color}/60`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-white/30 tabular-nums w-6 text-right">{count}</span>
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

function LeadDetail({ card }: { card: IcpCard }) {
  const avatarCls = AVATAR_COLORS[stableAvatarIdx(card.id)];

  return (
    <aside className="flex w-[330px] shrink-0 flex-col gap-3 overflow-y-auto">
      {/* Header */}
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
              <Badge variant={icpTierBadgeVariant(card.icpFitTier)}>
                {ICP_TIER_LABEL[card.icpFitTier]}
              </Badge>
              <Badge variant={priorityBadgeVariant(card.priority)}>
                {PRIORITY_TR[card.priority] ?? card.priority}
              </Badge>
              {card.operationalFit && (
                <Badge variant="growth">Op. Uyum</Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ICP Score Breakdown */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
        <SectionLabel>ICP Skor Analizi</SectionLabel>
        <div className="space-y-2.5">
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-[11px] text-white/50">ICP Skoru</span>
              <span className="text-[11px] font-semibold text-white/80">
                {card.icpScore > 0 ? `%${card.icpScore}` : "—"}
              </span>
            </div>
            <ScoreBar value={card.icpScore} color="bg-purple-500/70" />
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-[11px] text-white/50">Tugobo Fit</span>
              <span className="text-[11px] font-semibold text-white/80">%{card.tugoboFitScore}</span>
            </div>
            <ScoreBar value={card.tugoboFitScore} color="bg-indigo-500/70" />
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-[11px] text-white/50">Çok Kanal</span>
              <span className="text-[11px] font-semibold text-white/80">%{card.multiChannelScore}</span>
            </div>
            <ScoreBar value={card.multiChannelScore} color="bg-sky-500/70" />
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-[11px] text-white/50">Op. Karmaşıklık</span>
              <span className="text-[11px] font-semibold text-white/80">%{card.operationalComplexityScore}</span>
            </div>
            <ScoreBar value={card.operationalComplexityScore} color="bg-emerald-500/70" />
          </div>
        </div>
      </div>

      {/* Operational Dimensions */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
        <SectionLabel>Operasyonel Boyutlar</SectionLabel>
        <DimRow label="Mülk Büyüklüğü" value={PROPERTY_SIZE_LABEL[card.propertySize]} />
        <DimRow label="Talep Hacmi" value={DEMAND_LABEL[card.demandVolume]} />
        <DimRow label="Direkt Hazırlık" value={DIRECT_LABEL[card.directBookingReadiness]} />
        <DimRow label="OTA Bağımlılığı" value={OTA_LABEL[card.otaDependencyLevel]} />
        <DimRow label="Fırsat Skoru" value={`%${card.opportunityScore}`} />
      </div>

      {/* Channel Status */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
        <SectionLabel>Kanal Varlığı</SectionLabel>
        <div className="flex gap-4">
          <ChannelDot active={card.hasWebsite} label="Website" />
          <ChannelDot active={card.hasWhatsApp} label="WhatsApp" />
          <ChannelDot active={card.hasInstagram} label="Instagram" />
        </div>
      </div>

      {/* Operational Value Summary */}
      {card.operationalValueSummary && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
          <SectionLabel>Operasyonel Değer Analizi</SectionLabel>
          <p className="text-[11px] text-white/55 leading-relaxed">{card.operationalValueSummary}</p>
        </div>
      )}

      {/* Why This Lead */}
      {card.whyThisLead.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
          <SectionLabel>Neden Bu Lead?</SectionLabel>
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

      {/* AI Insight */}
      {card.aiInsight && (
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] p-4">
          <SectionLabel>AI İçgörü</SectionLabel>
          <p className="text-[11px] text-white/60 leading-relaxed">{card.aiInsight}</p>
        </div>
      )}
    </aside>
  );
}
