import type {
  CommCard,
  CommSummary,
  BestChannel,
  ChannelStatus,
  LeadTemperature,
  OutreachUrgency,
} from "@/app/components/v2/adapters/communication-intelligence-adapter";
import { computeCommSummary } from "@/app/components/v2/adapters/communication-intelligence-adapter";
import { Badge } from "@/app/components/v2/primitives/Badge";

type Props = {
  selectedCard: CommCard | null;
  allCards: CommCard[];
};

// ── Shared helpers ─────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-emerald-500/25 text-emerald-300",
  "bg-violet-500/25 text-violet-300",
  "bg-sky-500/25 text-sky-300",
  "bg-indigo-500/25 text-indigo-300",
  "bg-amber-500/25 text-amber-300",
  "bg-rose-500/25 text-rose-300",
  "bg-teal-500/25 text-teal-300",
];

function stableAvatarIdx(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % AVATAR_COLORS.length;
}

const BEST_CHANNEL_COLORS: Record<BestChannel, { bg: string; text: string; icon: string }> = {
  WhatsApp: { bg: "bg-emerald-500/15 border-emerald-500/30", text: "text-emerald-300", icon: "💬" },
  Instagram: { bg: "bg-violet-500/15 border-violet-500/30", text: "text-violet-300", icon: "📸" },
  Website: { bg: "bg-sky-500/15 border-sky-500/30", text: "text-sky-300", icon: "🌐" },
  Telefon: { bg: "bg-amber-500/15 border-amber-500/30", text: "text-amber-300", icon: "📞" },
  Çoklu: { bg: "bg-indigo-500/15 border-indigo-500/30", text: "text-indigo-300", icon: "⚡" },
};

const STATUS_LABEL: Record<ChannelStatus, { label: string; color: string }> = {
  verified: { label: "Doğrulandı", color: "text-emerald-400" },
  likely: { label: "Muhtemel", color: "text-amber-400" },
  partial: { label: "Kısmi", color: "text-zinc-400" },
  none: { label: "Yok", color: "text-zinc-600" },
};

const TEMP_CONFIG: Record<LeadTemperature, { label: string; dot: string; text: string }> = {
  hot: { label: "Sıcak", dot: "bg-rose-400", text: "text-rose-300" },
  warm: { label: "Ilık", dot: "bg-amber-400", text: "text-amber-300" },
  cold: { label: "Soğuk", dot: "bg-zinc-600", text: "text-zinc-400" },
};

const URGENCY_LABEL: Record<OutreachUrgency, string> = {
  high: "Yüksek",
  medium: "Orta",
  low: "Düşük",
};

const OUTREACH_STYLE_TR: Record<string, string> = {
  consultative: "Danışmanlık",
  direct: "Direkt",
  educational: "Eğitim Odaklı",
  relationship: "İlişki",
  "conversion-focused": "Dönüşüm Odaklı",
};

const SALES_APPROACH_TR: Record<string, string> = {
  "whatsapp-speed": "WhatsApp Hız",
  "direct-booking": "Direkt Rezervasyon",
  "conversion-gap": "Dönüşüm Açığı",
  "operational-efficiency": "Operasyonel Verimlilik",
  "social-demand": "Sosyal Talep",
  "guest-experience": "Misafir Deneyimi",
};

function priorityVariant(p: string) {
  switch (p) {
    case "critical": return "critical" as const;
    case "high": return "high" as const;
    case "medium": return "medium" as const;
    default: return "low" as const;
  }
}

const PRIORITY_TR: Record<string, string> = {
  critical: "Kritik",
  high: "Yüksek",
  medium: "Orta",
  low: "Düşük",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 mb-2">
      {children}
    </div>
  );
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-white/[0.06]">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <span className="w-7 text-right text-[11px] text-white/50 tabular-nums">
        {value > 0 ? value : "—"}
      </span>
    </div>
  );
}

// ── Root component ─────────────────────────────────────────────

export default function CommunicationIntelligenceContextPanel({ selectedCard, allCards }: Props) {
  if (selectedCard) return <LeadDetail card={selectedCard} />;
  return <WorkspaceSummary cards={allCards} />;
}

// ── No-selection: workspace summary ───────────────────────────

function WorkspaceSummary({ cards }: { cards: CommCard[] }) {
  const summary: CommSummary = computeCommSummary(cards);

  const strongestChannel = ((): BestChannel | null => {
    const counts: Partial<Record<BestChannel, number>> = {};
    for (const c of cards) {
      counts[c.bestChannel] = (counts[c.bestChannel] ?? 0) + 1;
    }
    const sorted = (Object.entries(counts) as [BestChannel, number][]).sort(
      (a, b) => b[1] - a[1],
    );
    return sorted[0]?.[0] ?? null;
  })();

  const noDigitalChannel = cards.filter(
    (c) => c.whatsappScore === 0 && c.instagramScore === 0 && c.websiteScore === 0,
  ).length;

  return (
    <aside className="flex w-[330px] shrink-0 flex-col gap-3 overflow-y-auto">
      {/* Channel coverage */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
        <SectionLabel>Kanal Kapsama Özeti</SectionLabel>
        <div className="space-y-2">
          <CovBar
            label="WhatsApp"
            count={summary.whatsappReadyCount}
            total={summary.total}
            color="bg-emerald-500/60"
          />
          <CovBar
            label="Instagram"
            count={summary.instagramReadyCount}
            total={summary.total}
            color="bg-violet-500/60"
          />
          <CovBar
            label="Website"
            count={summary.websiteReadyCount}
            total={summary.total}
            color="bg-sky-500/60"
          />
          <CovBar
            label="Çok Kanal"
            count={summary.multiChannelCount}
            total={summary.total}
            color="bg-indigo-500/60"
          />
        </div>
      </div>

      {/* Lead temperature */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
        <SectionLabel>Lead Sıcaklığı</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          <TempTile t="hot" count={summary.hotCount} />
          <TempTile t="warm" count={summary.warmCount} />
          <TempTile t="cold" count={summary.coldCount} />
        </div>
      </div>

      {/* Insights */}
      {strongestChannel && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
          <SectionLabel>Kanal Analizi</SectionLabel>
          <div className="space-y-3">
            <div>
              <div className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wide mb-0.5">
                En Güçlü Kanal
              </div>
              <div className="text-sm font-semibold text-white/80">{strongestChannel}</div>
              <div className="text-[11px] text-white/40">
                Leadlerin çoğu bu kanaldan ulaşılabilir
              </div>
            </div>
            {noDigitalChannel > 0 && (
              <div>
                <div className="text-[10px] text-rose-400 font-semibold uppercase tracking-wide mb-0.5">
                  Kapsama Açığı
                </div>
                <div className="text-[11px] text-white/50">
                  {noDigitalChannel} lead için dijital kanal sinyali yok — telefon tek seçenek
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Outreach recommendation */}
      <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] p-4">
        <SectionLabel>Outreach Önerisi</SectionLabel>
        <div className="space-y-2">
          <RecoLine
            icon="◉"
            text={`${summary.hotCount} sıcak lead önce iletişime geçilmeli`}
          />
          <RecoLine
            icon="◎"
            text={`${summary.multiChannelCount} çok kanallı lead için kombinasyon stratejisi`}
          />
          <RecoLine
            icon="○"
            text={`${summary.whatsappReadyCount} lead WhatsApp'tan direkt ulaşılabilir`}
          />
        </div>
        <p className="mt-3 text-[10px] text-white/30 leading-relaxed">
          Sıcak + WhatsApp kombinasyonu en yüksek dönüşüm oranını verir.
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
          Detaylı kanal analizi ve outreach stratejisi için soldaki listeden bir lead seçin.
        </p>
      </div>
    </aside>
  );
}

function CovBar({
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
      <span className="w-16 text-[11px] text-white/50">{label}</span>
      <div className="flex-1 h-1 rounded-full bg-white/[0.06]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-white/30 tabular-nums w-6 text-right">{count}</span>
    </div>
  );
}

function TempTile({ t, count }: { t: LeadTemperature; count: number }) {
  const cfg = TEMP_CONFIG[t];
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg bg-white/[0.03] py-2.5 px-1">
      <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
      <span className={`text-lg font-bold ${cfg.text}`}>{count}</span>
      <span className="text-[10px] text-white/35">{cfg.label}</span>
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

// ── Lead selected: detail panel ────────────────────────────────

function LeadDetail({ card }: { card: CommCard }) {
  const avatarCls = AVATAR_COLORS[stableAvatarIdx(card.id)];
  const channelCfg = BEST_CHANNEL_COLORS[card.bestChannel];
  const tempCfg = TEMP_CONFIG[card.leadTemperature];

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
              <Badge variant={priorityVariant(card.priority)}>
                {PRIORITY_TR[card.priority] ?? card.priority}
              </Badge>
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-medium ${tempCfg.text}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${tempCfg.dot}`} />
                {tempCfg.label}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Recommended Channel — prominent card */}
      <div
        className={`rounded-xl border p-4 ${channelCfg.bg}`}
      >
        <SectionLabel>Önerilen Kanal</SectionLabel>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{channelCfg.icon}</span>
          <div>
            <div className={`text-lg font-bold ${channelCfg.text}`}>{card.bestChannel}</div>
            {card.bestChannelReason && (
              <p className="text-[11px] text-white/50 leading-relaxed mt-0.5">
                {card.bestChannelReason}
              </p>
            )}
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-white/[0.06]">
          <div className="text-[11px] text-white/40">
            İletişim Skoru:{" "}
            <span className={`font-bold ${channelCfg.text}`}>
              %{card.commScore}
            </span>
          </div>
        </div>
      </div>

      {/* Channel confidence breakdown */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
        <SectionLabel>Kanal Güven Analizi</SectionLabel>
        <div className="space-y-3">
          <ChannelBreakdown
            label="WhatsApp"
            score={card.whatsappScore}
            status={card.whatsappStatus}
            barColor="bg-emerald-500/70"
          />
          <ChannelBreakdown
            label="Instagram"
            score={card.instagramScore}
            status={card.instagramStatus}
            barColor="bg-violet-500/70"
          />
          <ChannelBreakdown
            label="Website"
            score={card.websiteScore}
            status={card.websiteStatus}
            barColor="bg-sky-500/70"
          />
        </div>
      </div>

      {/* Outreach profile */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
        <SectionLabel>Outreach Profili</SectionLabel>
        <div className="space-y-1.5">
          <ProfileRow label="Aciliyet" value={URGENCY_LABEL[card.urgencyLevel]} />
          {card.outreachStyle && (
            <ProfileRow
              label="Yaklaşım Stili"
              value={OUTREACH_STYLE_TR[card.outreachStyle] ?? card.outreachStyle}
            />
          )}
          {card.salesApproach && (
            <ProfileRow
              label="Satış Yaklaşımı"
              value={SALES_APPROACH_TR[card.salesApproach] ?? card.salesApproach}
            />
          )}
          {card.actionLabel !== "—" && (
            <ProfileRow label="Önerilen Aksiyon" value={card.actionLabel} />
          )}
        </div>
      </div>

      {/* Outreach strategy */}
      {(card.outreachAngle || card.outreachRationale.length > 0) && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
          <SectionLabel>Outreach Stratejisi</SectionLabel>
          {card.outreachAngle && (
            <p className="text-[11px] text-white/60 leading-relaxed mb-2">{card.outreachAngle}</p>
          )}
          {card.outreachRationale.slice(0, 3).map((line, i) => (
            <div key={i} className="flex items-start gap-2 mt-1.5">
              <span className="text-indigo-400 text-xs shrink-0 mt-0.5">›</span>
              <span className="text-[11px] text-white/50 leading-relaxed">{line}</span>
            </div>
          ))}
        </div>
      )}

      {/* Why this lead */}
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

      {/* AI insight */}
      {card.aiInsight && (
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] p-4">
          <SectionLabel>AI İletişim İçgörüsü</SectionLabel>
          <p className="text-[11px] text-white/60 leading-relaxed">{card.aiInsight}</p>
        </div>
      )}

      {/* First action suggestion */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
        <SectionLabel>Önerilen İlk Adım</SectionLabel>
        <div className="flex items-start gap-2.5">
          <div
            className={`mt-0.5 h-6 w-6 shrink-0 rounded-md flex items-center justify-center text-sm ${channelCfg.bg}`}
          >
            {channelCfg.icon}
          </div>
          <p className={`text-sm font-medium leading-relaxed ${channelCfg.text}`}>
            {buildFirstAction(card)}
          </p>
        </div>
      </div>
    </aside>
  );
}

function ChannelBreakdown({
  label,
  score,
  status,
  barColor,
}: {
  label: string;
  score: number;
  status: ChannelStatus;
  barColor: string;
}) {
  const sc = STATUS_LABEL[status];
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-[11px] text-white/50">{label}</span>
        <span className={`text-[10px] font-medium ${sc.color}`}>{sc.label}</span>
      </div>
      <ScoreBar value={score} color={barColor} />
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-white/[0.04] last:border-0">
      <span className="text-[11px] text-white/40">{label}</span>
      <span className="text-[11px] font-medium text-white/70">{value}</span>
    </div>
  );
}

function buildFirstAction(card: CommCard): string {
  const hot = card.leadTemperature === "hot";
  const warm = card.leadTemperature === "warm";

  switch (card.bestChannel) {
    case "WhatsApp":
      if (hot) return "Hemen WhatsApp'tan iletişime geç — sıcak lead, bekleme";
      if (warm) return "WhatsApp mesajı gönder, yanıt süresi içinde takip et";
      return "WhatsApp mesajı gönder ve yanıt bekle";
    case "Instagram":
      if (hot) return "Instagram DM ile doğrudan ulaş — aktif profil mevcut";
      return "Instagram DM gönder, markalı mesaj kullan";
    case "Website":
      if (hot) return "Website iletişim formu üzerinden ulaş, hızlı yanıt iste";
      return "Website üzerinden iletişim kur, değer teklifini açıkla";
    case "Telefon":
      if (hot) return "Telefon ile doğrudan ara — dijital kanal yok";
      return "Telefon ile tanışma görüşmesi planla";
    case "Çoklu":
      return `WhatsApp + ${card.instagramScore > 50 ? "Instagram" : "Website"} kombinasyonuyla ulaş`;
    default:
      return "İletişim kanalını belirle ve outreach planla";
  }
}
