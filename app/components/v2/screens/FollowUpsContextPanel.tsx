"use client";

import { useState, useEffect } from "react";
import { flushSync } from "react-dom";
import type {
  FollowUpCard,
  FollowUpState,
  FollowUpSummary,
  LeadTemperature,
} from "@/app/components/v2/adapters/follow-ups-adapter";
import { computeFollowUpSummary } from "@/app/components/v2/adapters/follow-ups-adapter";
import { Badge } from "@/app/components/v2/primitives/Badge";
import { useLeadMutations } from "@/app/hooks/useLeadMutations";

type Props = {
  selectedCard: FollowUpCard | null;
  allCards: FollowUpCard[];
  onMutation?: () => void;
};

// ── shared helpers ────────────────────────────────────────────

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

const STATE_CONFIG: Record<FollowUpState, { label: string; color: string; bg: string }> = {
  overdue: { label: "Gecikmiş", color: "text-rose-300", bg: "bg-rose-500/15 border-rose-500/30" },
  today: { label: "Bugün Ara", color: "text-amber-300", bg: "bg-amber-500/15 border-amber-500/30" },
  tomorrow: { label: "Yarın Ara", color: "text-orange-300", bg: "bg-orange-500/15 border-orange-500/30" },
  "this-week": { label: "Bu Hafta", color: "text-sky-300", bg: "bg-sky-500/15 border-sky-500/30" },
  scheduled: { label: "Takip Gerekli", color: "text-zinc-400", bg: "bg-zinc-600/15 border-zinc-600/30" },
  done: { label: "Tamamlandı", color: "text-emerald-300", bg: "bg-emerald-500/15 border-emerald-500/30" },
};

const TEMP_CONFIG: Record<LeadTemperature, { label: string; dot: string; text: string }> = {
  hot: { label: "Sıcak", dot: "bg-rose-400", text: "text-rose-300" },
  warm: { label: "Ilık", dot: "bg-amber-400", text: "text-amber-300" },
  cold: { label: "Soğuk", dot: "bg-zinc-600", text: "text-zinc-400" },
};

const URGENCY_LABEL: Record<string, string> = {
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

const PRIORITY_TR: Record<string, string> = {
  critical: "Kritik",
  high: "Yüksek",
  medium: "Orta",
  low: "Düşük",
};

function formatAbsoluteDate(ms: number): string {
  return new Date(ms).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

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

export default function FollowUpsContextPanel({ selectedCard, allCards, onMutation }: Props) {
  if (selectedCard) return <LeadDetail card={selectedCard} key={selectedCard.id} onMutation={onMutation} />;
  return <WorkspaceSummary cards={allCards} />;
}

// ── no selection ──────────────────────────────────────────────

function WorkspaceSummary({ cards }: { cards: FollowUpCard[] }) {
  const summary: FollowUpSummary = computeFollowUpSummary(cards);

  // Top 3 hot leads for preview
  const hotLeads = cards
    .filter((c) => c.leadTemperature === "hot" && c.followUpState !== "done")
    .slice(0, 3);

  return (
    <aside className="flex w-[260px] shrink-0 flex-col gap-3 overflow-y-auto">
      {/* Takip dağılımı */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
        <SectionLabel>Takip Dağılımı</SectionLabel>
        <div className="space-y-2">
          <DistBar
            label="Gecikmiş"
            count={summary.overdueCount}
            total={summary.total}
            color="bg-rose-500/60"
          />
          <DistBar
            label="Bugün"
            count={summary.todayCount - summary.overdueCount}
            total={summary.total}
            color="bg-amber-500/60"
          />
          <DistBar
            label="Bu Hafta"
            count={summary.thisWeekCount}
            total={summary.total}
            color="bg-sky-500/60"
          />
          <DistBar
            label="Planlandı"
            count={summary.scheduledCount}
            total={summary.total}
            color="bg-zinc-500/40"
          />
          <DistBar
            label="Tamamlandı"
            count={summary.doneCount}
            total={summary.total}
            color="bg-emerald-500/40"
          />
        </div>
      </div>

      {/* Critical takip sayısı */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
        <SectionLabel>Takip Özeti</SectionLabel>
        <StatRow label="Toplam Takip Bekleyen" value={String(summary.pendingCount)} />
        <StatRow label="Kritik / Bugün Aranacak" value={String(summary.todayCount)} />
        <StatRow label="Gecikmiş Takip" value={String(summary.overdueCount)} />
        <StatRow label="Yanıt Vermedi" value={String(summary.noResponseCount)} />
        <StatRow label="Sıcak Lead" value={String(summary.hotCount)} />
        <StatRow label="Bu Hafta Tamamlanacak" value={String(summary.thisWeekCount)} />
      </div>

      {/* Hot leads preview */}
      {hotLeads.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
          <SectionLabel>Sıcak Lead Önizleme</SectionLabel>
          <div className="space-y-2">
            {hotLeads.map((lead) => {
              const sc = STATE_CONFIG[lead.followUpState];
              return (
                <div
                  key={lead.id}
                  className="flex items-center gap-2.5 rounded-lg bg-white/[0.03] p-2.5"
                >
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold ${AVATAR_COLORS[stableAvatarIdx(lead.id)]}`}
                  >
                    {lead.hotelName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-white/80 truncate">
                      {lead.hotelName}
                    </div>
                    <div className="text-[10px] text-white/35">{lead.city}</div>
                  </div>
                  <span className={`text-[10px] font-semibold ${sc.color}`}>
                    {sc.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Takip performansı */}
      <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] p-4">
        <SectionLabel>Aksiyon Önerisi</SectionLabel>
        <div className="space-y-2">
          <RecoLine icon="◉" text={`${summary.overdueCount} gecikmiş takibi önce tamamla`} />
          <RecoLine icon="◎" text={`${summary.todayCount} lead bugün iletişim bekliyor`} />
          {summary.noResponseCount > 0 && (
            <RecoLine icon="◑" text={`${summary.noResponseCount} lead yanıt vermedi — takip gerekli`} />
          )}
          <RecoLine icon="○" text={`${summary.hotCount} sıcak lead yüksek dönüşüm şansı taşıyor`} />
        </div>
        <p className="mt-3 text-[10px] text-white/30 leading-relaxed">
          Gecikmiş + sıcak kombinasyonunu önceliklendirin.
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
          Detaylı takip bilgisi ve outreach stratejisi için soldaki listeden bir lead seçin.
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
      <span className="w-16 text-[11px] text-white/50">{label}</span>
      <div className="flex-1 h-1 rounded-full bg-white/[0.06]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-white/30 tabular-nums w-5 text-right">{count}</span>
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

// ── action button ─────────────────────────────────────────────

function ActionBtn({
  label,
  onClick,
  variant = "default",
  disabled,
}: {
  label: string;
  onClick: () => void;
  variant?: "default" | "primary" | "danger";
  disabled?: boolean;
}) {
  const base =
    "flex min-h-8 w-full items-center justify-center rounded-lg px-3 py-1.5 text-center text-[11px] leading-tight font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40";
  const v =
    variant === "primary"
      ? "bg-indigo-500 text-white hover:bg-indigo-400"
      : variant === "danger"
        ? "bg-rose-500/[0.12] text-rose-400 ring-1 ring-inset ring-rose-500/20 hover:bg-rose-500/[0.18]"
        : "border border-white/[0.08] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] hover:text-zinc-100";
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${v}`}>
      {label}
    </button>
  );
}

// ── lead selected ─────────────────────────────────────────────

function LeadDetail({ card, onMutation }: { card: FollowUpCard; onMutation?: () => void }) {
  const {
    mounted,
    leadState,
    markContacted,
    markNoResponse,
    markDoNotContact,
    scheduleFollowUp,
    resetFollowUpState,
    undoLastAction,
    canUndo,
  } = useLeadMutations(card.id);

  const [lastAction, setLastAction] = useState<string | null>(null);

  useEffect(() => {
    if (!lastAction) return;
    const t = setTimeout(() => setLastAction(null), 3000);
    return () => clearTimeout(t);
  }, [lastAction]);

  function fire(mutation: () => void, label: string) {
    // flushSync forces React to process setStateMap's functional updater (and saveStateMap)
    // synchronously before we return. That means localStorage is written BEFORE onMutation()
    // bumps followUpMutVersion in V2Shell — so the followUpCards useMemo reads fresh storage.
    flushSync(() => mutation());
    setLastAction(label);
    onMutation?.();
  }

  const avatarCls = AVATAR_COLORS[stableAvatarIdx(card.id)];
  const stateCfg = STATE_CONFIG[card.followUpState];
  const tempCfg = TEMP_CONFIG[card.leadTemperature];

  // Prefer live mutation state once hydrated, fall back to adapter data
  const liveAttempts = mounted ? (leadState.contactAttempts ?? card.contactAttempts) : card.contactAttempts;
  const liveLastContactMs = mounted ? leadState.lastContactedAt : card.lastContactedAtMs;
  const liveLastContactLabel = liveLastContactMs
    ? (() => {
        const diffH = (Date.now() - liveLastContactMs) / (60 * 60 * 1_000);
        if (diffH < 1) return "Az önce";
        if (diffH < 24) return `${Math.round(diffH)} saat önce`;
        const diffD = Math.round(diffH / 24);
        if (diffD === 1) return "Dün";
        if (diffD <= 7) return `${diffD} gün önce`;
        if (diffD <= 14) return "1 hafta önce";
        return `${Math.round(diffD / 7)} hafta önce`;
      })()
    : card.lastContactLabel;
  const isDnc = mounted && leadState.doNotContact;

  return (
    <aside className="flex w-[260px] shrink-0 flex-col gap-3 overflow-y-auto">
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
              <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${tempCfg.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${tempCfg.dot}`} />
                {tempCfg.label}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Follow-up state — prominent card */}
      <div className={`rounded-xl border p-4 ${stateCfg.bg}`}>
        <SectionLabel>Takip Durumu</SectionLabel>
        <div className={`text-lg font-bold ${stateCfg.color} mb-1`}>{card.urgencyLabel}</div>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div>
            <div className="text-[10px] text-white/30">Son Temas</div>
            <div className="text-xs font-medium text-white/70 mt-0.5">{liveLastContactLabel}</div>
          </div>
          <div>
            <div className="text-[10px] text-white/30">Temas Sayısı</div>
            <div className="text-xs font-medium text-white/70 mt-0.5">
              {liveAttempts > 0 ? `${liveAttempts}x` : "İlk temas"}
            </div>
          </div>
        </div>
        <StatRow
          label="Sonraki Takip"
          value={card.nextFollowUpAtMs ? formatAbsoluteDate(card.nextFollowUpAtMs) : "—"}
        />
        {!isDnc && card.isNoResponse && (
          <div className="mt-2 rounded-lg bg-yellow-500/[0.10] border border-yellow-500/20 px-2.5 py-1.5 text-[10px] font-semibold text-yellow-300 text-center">
            Yanıt Yok — Takip Gerekli
          </div>
        )}
        {isDnc && (
          <div className="mt-2 rounded-lg bg-rose-500/[0.10] border border-rose-500/20 px-2.5 py-1.5 text-[10px] font-semibold text-rose-400 text-center">
            DNC — İletişim engellendi
          </div>
        )}
        {/* Secondary, low-priority action — intentionally not styled like the main quick
            actions below. Hidden entirely for DNC leads: İletişim Engelli is a separate,
            deliberate decision and must never be cleared by a follow-up state reset. */}
        {!isDnc && (
          <button
            type="button"
            onClick={() => fire(resetFollowUpState, "Takip durumu yeniden başlatıldı")}
            className="mt-2 w-full text-center text-[10px] text-white/35 hover:text-white/55 transition-colors duration-150"
          >
            Takibi Yeniden Başlat
          </button>
        )}
      </div>

      {/* Opportunity + ICP */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
        <SectionLabel>Fırsat Profili</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <ScoreTile label="Fırsat Skoru" value={`%${card.opportunityScore}`} color="text-indigo-300" />
          <ScoreTile
            label="ICP Skoru"
            value={card.icpScore > 0 ? `%${card.icpScore}` : "—"}
            color="text-purple-300"
          />
        </div>
        <div className="mt-3 pt-3 border-t border-white/[0.06]">
          <StatRow label="Aciliyet" value={URGENCY_LABEL[card.urgencyLevel] ?? "—"} />
          <StatRow label="Önerilen Aksiyon" value={card.actionLabel} />
        </div>
      </div>

      {/* Outreach angle */}
      {card.outreachAngle && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
          <SectionLabel>Outreach Açısı</SectionLabel>
          <p className="text-[11px] text-white/60 leading-relaxed">{card.outreachAngle}</p>
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
          <SectionLabel>AI İçgörü</SectionLabel>
          <p className="text-[11px] text-white/60 leading-relaxed">{card.aiInsight}</p>
        </div>
      )}

      {/* Quick actions */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
        <SectionLabel>Hızlı Aksiyon</SectionLabel>

        {/* Success feedback — auto-clears after 3s */}
        {lastAction && (
          <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.10] px-3 py-2 text-[11px] text-emerald-400">
            <span className="shrink-0 font-bold">✓</span>
            <span>{lastAction}</span>
          </div>
        )}

        {isDnc ? (
          <div className="rounded-lg bg-rose-500/[0.08] border border-rose-500/20 px-3 py-2 text-[11px] text-rose-400 text-center">
            DNC — İletişim kalıcı olarak engellendi
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <ActionBtn
              label="Temas Kuruldu"
              onClick={() => fire(markContacted, "Temas kuruldu")}
              variant="primary"
            />
            <div className="grid grid-cols-2 gap-1.5">
              <ActionBtn
                label="Yarın Hatırlat"
                onClick={() =>
                  fire(
                    () => scheduleFollowUp(Date.now() + 24 * 60 * 60 * 1_000),
                    "Yarın için hatırlatma kuruldu",
                  )
                }
              />
              <ActionBtn
                label="3 Gün Sonra Hatırlat"
                onClick={() =>
                  fire(
                    () => scheduleFollowUp(Date.now() + 3 * 24 * 60 * 60 * 1_000),
                    "3 gün sonra için hatırlatma kuruldu",
                  )
                }
              />
            </div>
            <ActionBtn
              label="Yanıt Yok"
              onClick={() => fire(markNoResponse, "Yanıt yok olarak işaretlendi")}
            />
            <ActionBtn
              label="İletişim Engelle (DNC)"
              onClick={() => fire(markDoNotContact, "İletişim engellendi")}
              variant="danger"
            />
          </div>
        )}

        {canUndo && (
          <button
            type="button"
            onClick={() => fire(undoLastAction, "Son aksiyon geri alındı")}
            className="mt-2 w-full text-center text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors duration-150"
          >
            ↩ Son aksiyonu geri al
          </button>
        )}
      </div>
    </aside>
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
