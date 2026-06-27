import type { LeadCard, WebsiteStatus, WhatsAppStatus } from "@/app/components/v2/adapters/lead-list-adapter";
import { Badge } from "@/app/components/v2/primitives/Badge";
import { fmtCurrency, type PackageTier, type Priority, type ActionChannel } from "@/app/components/v2/mock/mock-queue";
import { OPPORTUNITY_REASON_LABELS } from "@/app/lib/opportunity-scoring";

const SECTION_TITLE = "text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500";

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

function stableAvatarIdx(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % AVATAR_COLORS.length;
}

function hotelInitials(name: string): string {
  const words = name.split(" ").filter((w) => w.length > 1 && w !== "&");
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
}

function scoreColor(n: number): string {
  if (n >= 70) return "text-emerald-400";
  if (n >= 50) return "text-amber-400";
  return "text-rose-400";
}

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

const PRIORITY_LABEL: Record<Priority, string> = {
  critical: "Kritik",
  high: "Yüksek",
  medium: "Orta",
  low: "Düşük",
};

/* ── icons ──────────────────────────────────────────────────── */

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className="h-3.5 w-3.5 shrink-0 text-emerald-400"
      aria-hidden
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M5.5 8.5l2 2 3-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChannelActionIcon({ channel }: { channel: ActionChannel }) {
  if (channel === "WhatsApp") {
    return (
      <svg
        viewBox="0 0 16 16"
        fill="currentColor"
        className="h-4 w-4 shrink-0 text-emerald-400"
        aria-hidden
      >
        <path d="M8 1a7 7 0 0 1 6.06 10.47L15 15l-3.67-.91A7 7 0 1 1 8 1Zm0 1.4a5.6 5.6 0 0 0-4.84 8.39l.15.26-.77 1.92 1.98-.75.25.15A5.6 5.6 0 1 0 8 2.4Zm-1.8 2.7c.14 0 .29.01.41.04.14.04.3.08.44.4l.54 1.33c.1.25.03.46-.1.63l-.33.41c-.12.15-.11.3-.04.45.4.84 1.1 1.55 1.9 1.95.14.07.28.08.4-.05l.37-.44c.15-.18.36-.23.56-.13l1.34.67c.3.15.32.3.31.44-.05.83-.62 1.41-1.46 1.41H11c-.8 0-1.81-.4-3.15-1.7C6.5 9.43 5.9 8.3 5.9 7.48c0-.73.56-1.38 1.3-1.38Z" />
      </svg>
    );
  }
  if (channel === "Arama") {
    return (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        className="h-4 w-4 shrink-0 text-sky-400"
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
      className="h-4 w-4 shrink-0 text-amber-400"
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

/* ── Workspace Summary ──────────────────────────────────────── */

function WorkspaceSummary({ cards }: { cards: LeadCard[] }) {
  const total = cards.length;
  const highPrio = cards.filter(
    (c) => c.priority === "critical" || c.priority === "high",
  ).length;

  const avgOpp =
    total > 0
      ? Math.round(
          cards.reduce((s, c) => s + c.opportunityScore, 0) / total,
        )
      : 0;

  const icpLeads = cards.filter((c) => c.icpScore > 0);
  const avgIcp =
    icpLeads.length > 0
      ? Math.round(icpLeads.reduce((s, c) => s + c.icpScore, 0) / icpLeads.length)
      : 0;

  const tierCounts: Record<PackageTier, number> = {
    Enterprise: 0,
    Growth: 0,
    Professional: 0,
    Starter: 0,
  };
  for (const c of cards) tierCounts[c.packageTier]++;

  const priorityCounts: Record<Priority, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const c of cards) priorityCounts[c.priority]++;

  const kpis = [
    { label: "Toplam Lead", value: String(total), color: "text-zinc-100" },
    {
      label: "Yüksek Öncelik",
      value: String(highPrio),
      color: "text-amber-400",
    },
    {
      label: "Ort. Fırsat",
      value: `%${avgOpp}`,
      color: scoreColor(avgOpp),
    },
    {
      label: "Ort. ICP",
      value: avgIcp > 0 ? `%${avgIcp}` : "—",
      color: avgIcp > 0 ? scoreColor(avgIcp) : "text-zinc-600",
    },
  ];

  const tiers: { tier: PackageTier; color: string }[] = [
    { tier: "Enterprise", color: "bg-purple-500" },
    { tier: "Growth", color: "bg-violet-500" },
    { tier: "Professional", color: "bg-sky-500" },
    { tier: "Starter", color: "bg-zinc-600" },
  ];

  const priorities: { key: Priority; label: string; color: string }[] = [
    { key: "critical", label: "Kritik", color: "bg-rose-500" },
    { key: "high", label: "Yüksek", color: "bg-amber-500" },
    { key: "medium", label: "Orta", color: "bg-blue-500" },
    { key: "low", label: "Düşük", color: "bg-zinc-600" },
  ];

  return (
    <>
      {/* KPI tiles */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03]">
        <div className="border-b border-white/[0.06] px-4 py-3">
          <h3 className={SECTION_TITLE}>Lead İstihbaratı Özeti</h3>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3">
          {kpis.map(({ label, value, color }) => (
            <div
              key={label}
              className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3"
            >
              <p
                className={`text-[20px] font-bold tabular-nums leading-none ${color}`}
              >
                {value}
              </p>
              <p className="mt-1 text-[10px] font-medium text-zinc-500">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tier breakdown */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03]">
        <div className="border-b border-white/[0.06] px-4 py-3">
          <h3 className={SECTION_TITLE}>Paket Dağılımı</h3>
        </div>
        <div className="space-y-2.5 p-4">
          {tiers.map(({ tier, color }) => {
            const count = tierCounts[tier];
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={tier} className="flex items-center gap-2">
                <span className="w-[72px] text-[10px] text-zinc-400">{tier}</span>
                <div className="flex-1 overflow-hidden rounded-full bg-white/[0.04]" style={{ height: 4 }}>
                  <div
                    className={`h-full rounded-full transition-all ${color}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-8 text-right text-[10px] tabular-nums text-zinc-600">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Priority breakdown */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03]">
        <div className="border-b border-white/[0.06] px-4 py-3">
          <h3 className={SECTION_TITLE}>Öncelik Dağılımı</h3>
        </div>
        <div className="space-y-2.5 p-4">
          {priorities.map(({ key, label, color }) => {
            const count = priorityCounts[key];
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="w-[72px] text-[10px] text-zinc-400">{label}</span>
                <div className="flex-1 overflow-hidden rounded-full bg-white/[0.04]" style={{ height: 4 }}>
                  <div
                    className={`h-full rounded-full transition-all ${color}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-8 text-right text-[10px] tabular-nums text-zinc-600">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hint */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15">
            <svg
              viewBox="0 0 16 16"
              fill="none"
              className="h-3.5 w-3.5 text-indigo-400"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-5 6a5 5 0 0 1 10 0H3z" />
            </svg>
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Detaylı lead profili ve fırsat analizi için bir karta tıklayın.
          </p>
        </div>
      </div>
    </>
  );
}

/* ── Lead Detail ─────────────────────────────────────────────── */

function ChannelStatusRow({
  label,
  websiteStatus,
  whatsappStatus,
  hasInstagram,
}: {
  label?: string;
  websiteStatus: WebsiteStatus;
  whatsappStatus: WhatsAppStatus;
  hasInstagram: boolean;
}) {
  const webLabel =
    websiteStatus === "active"
      ? "Aktif"
      : websiteStatus === "candidate"
      ? "Aday"
      : "Yok";
  const webColor =
    websiteStatus === "active"
      ? "text-emerald-400"
      : websiteStatus === "candidate"
      ? "text-amber-400"
      : "text-zinc-600";

  const waLabel =
    whatsappStatus === "high"
      ? "Doğrulandı"
      : whatsappStatus === "medium"
      ? "Olası"
      : whatsappStatus === "low"
      ? "Belirsiz"
      : "Yok";
  const waColor =
    whatsappStatus === "high"
      ? "text-emerald-400"
      : whatsappStatus === "medium"
      ? "text-sky-400"
      : whatsappStatus === "low"
      ? "text-amber-400"
      : "text-zinc-600";

  return (
    <div className="space-y-2">
      {label && <p className={SECTION_TITLE}>{label}</p>}
      <div className="space-y-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-zinc-500">Web Sitesi</span>
          <span className={`text-[11px] font-semibold ${webColor}`}>{webLabel}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-zinc-500">WhatsApp</span>
          <span className={`text-[11px] font-semibold ${waColor}`}>{waLabel}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-zinc-500">Instagram</span>
          <span
            className={`text-[11px] font-semibold ${
              hasInstagram ? "text-violet-400" : "text-zinc-600"
            }`}
          >
            {hasInstagram ? "Aktif" : "Yok"}
          </span>
        </div>
      </div>
    </div>
  );
}

function LeadDetail({ card }: { card: LeadCard }) {
  const initials = hotelInitials(card.hotelName);
  const avatarColor = AVATAR_COLORS[stableAvatarIdx(card.id)];

  const reasonLabels = card.opportunityReasons
    .map((key) => OPPORTUNITY_REASON_LABELS[key]?.tr)
    .filter((v): v is string => Boolean(v));

  return (
    <>
      {/* Lead header */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03]">
        <div className="border-b border-white/[0.06] px-4 py-3">
          <h3 className={SECTION_TITLE}>Lead Profili</h3>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${avatarColor}`}
            >
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-bold text-zinc-100">
                {card.hotelName}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                {card.city} · {card.hotelType}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Badge variant={packageVariant(card.packageTier)}>
              {card.packageTier}
            </Badge>
            <Badge variant={card.priority}>{PRIORITY_LABEL[card.priority]}</Badge>
          </div>

          {(card.units > 0 || card.rating > 0) && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {card.units > 0 && (
                <div className="rounded-lg border border-white/[0.05] bg-black/20 px-3 py-2">
                  <p className="text-[13px] font-bold tabular-nums text-zinc-100">
                    {card.units}
                  </p>
                  <p className="text-[9px] text-zinc-600">Oda / Birim</p>
                </div>
              )}
              {card.rating > 0 && (
                <div className="rounded-lg border border-white/[0.05] bg-black/20 px-3 py-2">
                  <p className="text-[13px] font-bold tabular-nums text-amber-400">
                    {card.rating.toFixed(1)}
                  </p>
                  <p className="text-[9px] text-zinc-600">Ortalama Puan</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Opportunity analysis */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03]">
        <div className="border-b border-white/[0.06] px-4 py-3">
          <h3 className={SECTION_TITLE}>Fırsat Analizi</h3>
        </div>

        {/* 3-score strip */}
        <div className="grid grid-cols-3 divide-x divide-white/[0.05] py-3">
          <div className="px-3 text-center">
            <p
              className={`text-[22px] font-bold tabular-nums leading-none ${scoreColor(card.opportunityScore)}`}
            >
              %{card.opportunityScore}
            </p>
            <p className="mt-1 text-[9px] text-zinc-600">Fırsat</p>
          </div>
          <div className="px-3 text-center">
            <p
              className={`text-[22px] font-bold tabular-nums leading-none ${
                card.icpScore > 0 ? scoreColor(card.icpScore) : "text-zinc-700"
              }`}
            >
              {card.icpScore > 0 ? `%${card.icpScore}` : "—"}
            </p>
            <p className="mt-1 text-[9px] text-zinc-600">ICP</p>
          </div>
          <div className="px-3 text-center">
            <p
              className={`text-[22px] font-bold tabular-nums leading-none ${scoreColor(card.confidenceScore)}`}
            >
              %{card.confidenceScore}
            </p>
            <p className="mt-1 text-[9px] text-zinc-600">Güven</p>
          </div>
        </div>

        {/* Revenue estimate */}
        {card.revenueEstimate > 0 && (
          <div className="border-t border-white/[0.05] px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-500">Tahmini Aylık Gelir</span>
              <span className="text-[14px] font-bold tabular-nums text-emerald-400">
                {fmtCurrency(card.revenueEstimate)}
                <span className="ml-0.5 text-[10px] font-normal text-zinc-600">/ay</span>
              </span>
            </div>
          </div>
        )}

        {/* Opportunity reasons */}
        {reasonLabels.length > 0 && (
          <div className="border-t border-white/[0.05] px-4 pb-3 pt-3">
            <ul className="space-y-2">
              {reasonLabels.map((label) => (
                <li key={label} className="flex items-center gap-2">
                  <CheckIcon />
                  <span className="text-[11px] text-zinc-300">{label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Recommended action */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03]">
        <div className="border-b border-white/[0.06] px-4 py-3">
          <h3 className={SECTION_TITLE}>Önerilen Aksiyon</h3>
        </div>
        <div className="p-4">
          <div className="flex items-start gap-3 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
            <ChannelActionIcon channel={card.actionChannel} />
            <div>
              <p className="text-[12px] font-semibold text-sky-300">
                {card.actionLabel}
              </p>
              {card.actionSub && (
                <p className="mt-0.5 text-[11px] text-zinc-500">{card.actionSub}</p>
              )}
            </div>
          </div>
          {card.outreachAngle && (
            <p className="mt-3 text-[11px] leading-relaxed text-zinc-400">
              {card.outreachAngle}
            </p>
          )}
        </div>
      </div>

      {/* Channel readiness */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03]">
        <div className="border-b border-white/[0.06] px-4 py-3">
          <h3 className={SECTION_TITLE}>Kanal Durumu</h3>
        </div>
        <div className="p-4">
          <ChannelStatusRow
            websiteStatus={card.websiteStatus}
            whatsappStatus={card.whatsappStatus}
            hasInstagram={card.hasInstagram}
          />
        </div>
      </div>

      {/* Why this lead */}
      {card.whyThisLead.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03]">
          <div className="border-b border-white/[0.06] px-4 py-3">
            <h3 className={SECTION_TITLE}>Neden Bu Lead?</h3>
          </div>
          <ul className="space-y-2.5 p-4">
            {card.whyThisLead.slice(0, 4).map((reason, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-px text-[9px] font-bold tabular-nums text-indigo-400">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[11px] leading-snug text-zinc-300">{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* AI insight */}
      {card.aiInsight && (
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04]">
          <div className="border-b border-indigo-500/15 px-4 py-3">
            <h3 className="text-[9px] font-bold uppercase tracking-[0.15em] text-indigo-400/70">
              AI İçgörü
            </h3>
          </div>
          <p className="px-4 py-3 text-[11px] leading-relaxed text-zinc-400">
            {card.aiInsight}
          </p>
        </div>
      )}
    </>
  );
}

/* ── main export ─────────────────────────────────────────────── */

export default function LeadListContextPanel({
  selectedCard,
  allCards,
}: {
  selectedCard: LeadCard | null;
  allCards: LeadCard[];
}) {
  return (
    <aside className="flex w-[260px] shrink-0 flex-col gap-3 overflow-y-auto">
      {selectedCard ? (
        <LeadDetail card={selectedCard} />
      ) : (
        <WorkspaceSummary cards={allCards} />
      )}
    </aside>
  );
}
