import type { ScoredLead } from "@/app/lib/leads";
import type { MockKpi, MockContext } from "@/app/components/v2/mock/mock-queue";
import V2ContextPanel from "@/app/components/v2/layout/V2ContextPanel";
import {
  computeVerifiedOpportunity,
  type VerifiedOpportunity,
  type SalesPriority,
  type PipelineHealth,
  type Blocker,
  type NextBestAction,
} from "@/lib/verified-opportunity/verified-opportunity";

/* ── design tokens ──────────────────────────────────────────── */

const SECTION_LABEL =
  "text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-600";

const CARD = "rounded-xl border border-white/[0.08] bg-white/[0.03]";

/* ── opportunity grade ──────────────────────────────────────── */

type Grade = "A+" | "A" | "B" | "C" | "D";

type GradeInfo = {
  grade: Grade;
  stars: number;
  statusLabel: string;
  gradeCls: string;
  starCls: string;
};

const GRADE_BY_PRIORITY: Record<SalesPriority, GradeInfo> = {
  CRITICAL: {
    grade: "A+",
    stars: 5,
    statusLabel: "Satışa Hazır",
    gradeCls: "text-emerald-400",
    starCls: "text-emerald-400",
  },
  URGENT: {
    grade: "A",
    stars: 4,
    statusLabel: "Acil Fırsat",
    gradeCls: "text-amber-400",
    starCls: "text-amber-400",
  },
  HIGH: {
    grade: "B",
    stars: 3,
    statusLabel: "Güçlü Potansiyel",
    gradeCls: "text-sky-400",
    starCls: "text-sky-400",
  },
  NORMAL: {
    grade: "C",
    stars: 2,
    statusLabel: "Gelişiyor",
    gradeCls: "text-zinc-400",
    starCls: "text-zinc-500",
  },
  LOW: {
    grade: "D",
    stars: 1,
    statusLabel: "Keşif Aşaması",
    gradeCls: "text-zinc-600",
    starCls: "text-zinc-700",
  },
};

function Stars({ count, cls }: { count: number; cls: string }) {
  return (
    <span className={`text-[13px] tracking-tight leading-none ${cls}`} aria-hidden>
      {"★".repeat(count)}
      <span className="opacity-20">{"★".repeat(5 - count)}</span>
    </span>
  );
}

/* ── action impact map ──────────────────────────────────────── */

const ACTION_IMPACT: Record<NextBestAction["action"], string[]> = {
  call_today:         ["+Demo Fırsatı", "+Yanıt Sinyali"],
  send_whatsapp:      ["+15 Güven", "+Yanıt Sinyali"],
  reenrich_website:   ["+15 Güven", "+Yüksek Öncelik"],
  verify_contact:     ["+10 Güven", "+İletişim Kanalı"],
  book_demo:          ["+Demo", "+Dönüşüm Olasılığı"],
  wait_for_reply:     ["Yanıt Bekleniyor"],
  follow_up_tomorrow: ["+Yanıt Olasılığı", "+Sıcaklık"],
  prepare_proposal:   ["+Müzakere", "+Kapanış"],
  close_opportunity:  ["+Müşteri Dönüşümü"],
  lost_follow_up:     ["Yeniden Değerlendirme"],
};

/* ── blocker explanation map ────────────────────────────────── */

const BLOCKER_EXPLANATION: Record<Blocker["key"], string> = {
  no_website:          "Doğrudan iletişim kurulamaz.",
  no_whatsapp:         "Tercih edilen kanal erişilemez.",
  no_booking_engine:   "Rezervasyon geliri takip edilemiyor.",
  weak_instagram:      "Dijital varlık sınırlı.",
  low_review_count:    "Sosyal kanıt yetersiz.",
  unknown_contact:     "İletişim başlatılamaz.",
  outdated_enrichment: "Veriler güncel olmayabilir.",
  no_response:         "Mevcut kanal üzerinden ulaşılamıyor.",
  do_not_contact:      "Bu lead ile iletişim kurulamaz.",
};

/* ── health config map ──────────────────────────────────────── */

const HEALTH_CONFIG: Record<
  PipelineHealth,
  { explanation: string; bgCls: string; textCls: string; borderCls: string; dotCls: string }
> = {
  Healthy: {
    explanation: "Tüm sinyaller yeşil. Aksiyona hazır.",
    bgCls: "bg-emerald-500/[0.08]",
    textCls: "text-emerald-400",
    borderCls: "border-emerald-500/20",
    dotCls: "bg-emerald-400",
  },
  "Needs Attention": {
    explanation: "Bazı sinyaller eksik. Doğrulama önerilir.",
    bgCls: "bg-amber-500/[0.08]",
    textCls: "text-amber-400",
    borderCls: "border-amber-500/20",
    dotCls: "bg-amber-400",
  },
  "At Risk": {
    explanation: "Kritik engeller mevcut. Hızlı müdahale gerekli.",
    bgCls: "bg-orange-500/[0.08]",
    textCls: "text-orange-400",
    borderCls: "border-orange-500/20",
    dotCls: "bg-orange-400",
  },
  Stale: {
    explanation: "Uzun süredir temas yok. Yeniden aktive edilmeli.",
    bgCls: "bg-rose-500/[0.08]",
    textCls: "text-rose-400",
    borderCls: "border-rose-500/20",
    dotCls: "bg-rose-400",
  },
  Lost: {
    explanation: "Bu fırsat şu an kapalı durumda.",
    bgCls: "bg-zinc-800/50",
    textCls: "text-zinc-500",
    borderCls: "border-zinc-700/30",
    dotCls: "bg-zinc-600",
  },
};

/* ── blocker card ───────────────────────────────────────────── */

function BlockerCard({ blocker }: { blocker: Blocker }) {
  const SEVERITY_CFG = {
    critical: {
      badge: "KRİTİK",
      badgeCls: "bg-rose-500/15 text-rose-400 border-rose-500/25",
      borderCls: "border-rose-500/20",
      bgCls: "bg-rose-500/[0.04]",
    },
    major: {
      badge: "UYARI",
      badgeCls: "bg-amber-500/15 text-amber-400 border-amber-500/25",
      borderCls: "border-amber-500/20",
      bgCls: "bg-amber-500/[0.04]",
    },
    minor: {
      badge: "BİLGİ",
      badgeCls: "bg-zinc-700/40 text-zinc-400 border-zinc-700/30",
      borderCls: "border-white/[0.07]",
      bgCls: "bg-white/[0.02]",
    },
  } as const;

  const cfg = SEVERITY_CFG[blocker.severity];

  return (
    <div className={`rounded-lg border p-3 ${cfg.borderCls} ${cfg.bgCls}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-bold text-zinc-200 leading-snug">{blocker.label}</p>
        <span
          className={`shrink-0 rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${cfg.badgeCls}`}
        >
          {cfg.badge}
        </span>
      </div>
      <p className="mt-1.5 text-[10px] leading-normal text-zinc-500">
        {BLOCKER_EXPLANATION[blocker.key]}
      </p>
    </div>
  );
}

/* ── section arrow icon ─────────────────────────────────────── */

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 10 10"
      fill="none"
      className="h-3 w-3 shrink-0 text-indigo-400"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 5h6M5 2l3 3-3 3" />
    </svg>
  );
}

/* ── main detail view ───────────────────────────────────────── */

function VODetail({ lead, vo }: { lead: ScoredLead; vo: VerifiedOpportunity }) {
  const gradeInfo = GRADE_BY_PRIORITY[vo.priority];
  const healthCfg = HEALTH_CONFIG[vo.health];
  const impact = ACTION_IMPACT[vo.nextBestAction.action];

  /* First 2 sentences for hero summary */
  const heroParts = vo.founderInsight.split(". ").filter(Boolean);
  const heroSummary =
    heroParts
      .slice(0, 2)
      .map((s, i, arr) => (s.endsWith(".") ? s : i < arr.length - 1 ? s + "." : s + "."))
      .join(" ");

  return (
    <>
      {/* ── 1. AI Decision Summary ──────────────────────────── */}
      <div className="rounded-xl border border-white/[0.12] bg-white/[0.04] p-4">
        <p className={SECTION_LABEL + " mb-3"}>AI Karar Özeti</p>

        {/* Lead identity */}
        <p className="truncate text-[12px] font-semibold text-zinc-200">{lead.name}</p>
        <p className="mt-0.5 text-[10px] text-zinc-600">{lead.city} · {lead.type}</p>

        {/* Grade + stars */}
        <div className="mt-4 flex items-end gap-3">
          <span
            className={`text-[44px] font-black leading-none tabular-nums ${gradeInfo.gradeCls}`}
          >
            {gradeInfo.grade}
          </span>
          <div className="mb-1 flex flex-col gap-1">
            <Stars count={gradeInfo.stars} cls={gradeInfo.starCls} />
            <p className={`text-[11px] font-semibold ${gradeInfo.gradeCls}`}>
              {gradeInfo.statusLabel}
            </p>
          </div>
        </div>

        {/* Hero summary */}
        <p className="mt-3 border-t border-white/[0.06] pt-3 text-[11px] leading-relaxed text-zinc-400">
          {heroSummary}
        </p>
      </div>

      {/* ── 2. Recommended Action ───────────────────────────── */}
      <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.05] p-4">
        <p className={SECTION_LABEL + " text-indigo-400/60 mb-3"}>AI Önerisi</p>

        {/* Action */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/20">
            <ArrowIcon />
          </div>
          <p className="text-[13px] font-bold text-zinc-100">{vo.nextBestAction.label}</p>
        </div>

        {/* Reason */}
        <div className="mt-3.5">
          <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-zinc-600">Neden</p>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
            {vo.nextBestAction.reason}
          </p>
        </div>

        {/* Expected impact */}
        {impact.length > 0 && (
          <div className="mt-3.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-zinc-600">
              Beklenen Etki
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {impact.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── 3. Opportunity Health ───────────────────────────── */}
      <div
        className={`rounded-xl border p-4 ${healthCfg.borderCls} ${healthCfg.bgCls}`}
      >
        <p className={SECTION_LABEL + " mb-3"}>Fırsat Sağlığı</p>
        <div className="flex items-center gap-2.5">
          <span
            className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${healthCfg.dotCls}`}
          />
          <span className={`text-[17px] font-bold ${healthCfg.textCls}`}>{vo.healthLabel}</span>
        </div>
        <p className={`mt-2 text-[11px] leading-relaxed ${healthCfg.textCls} opacity-80`}>
          {healthCfg.explanation}
        </p>
      </div>

      {/* ── 4. Blockers ─────────────────────────────────────── */}
      {vo.blockers.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <p className={SECTION_LABEL}>Engeller</p>
            <span className="rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-bold text-rose-400">
              {vo.blockers.length}
            </span>
          </div>
          <div className="space-y-2">
            {vo.blockers.map((b) => (
              <BlockerCard key={b.key} blocker={b} />
            ))}
          </div>
        </div>
      )}

      {/* ── 5. Opportunity Timeline ─────────────────────────── */}
      {vo.timelineEvents.length > 0 && (
        <div className={CARD}>
          <div className="border-b border-white/[0.06] px-4 py-3">
            <p className={SECTION_LABEL}>Fırsat Zaman Çizelgesi</p>
          </div>
          <ol className="py-3 pl-4 pr-3">
            {vo.timelineEvents.map((ev, i) => {
              const isLast = i === vo.timelineEvents.length - 1;
              return (
                <li key={ev.type} className="relative flex items-start gap-3 pb-3 last:pb-0">
                  {!isLast && (
                    <div className="absolute left-[6px] top-4 bottom-0 w-px bg-white/[0.06]" />
                  )}
                  <div
                    className={`relative mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
                      isLast
                        ? "border-indigo-500/50 bg-indigo-500/20"
                        : "border-white/[0.09] bg-white/[0.04]"
                    }`}
                  >
                    <span
                      className={`h-1 w-1 rounded-full ${isLast ? "bg-indigo-400" : "bg-zinc-600"}`}
                    />
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p
                      className={`text-[11px] font-medium leading-snug ${
                        isLast ? "text-zinc-200" : "text-zinc-500"
                      }`}
                    >
                      {ev.label}
                    </p>
                    {ev.timestamp && (
                      <p className="mt-0.5 text-[9px] text-zinc-700">
                        {new Date(ev.timestamp).toLocaleDateString("tr-TR", {
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* ── 6. Founder Insight ──────────────────────────────── */}
      <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] p-4">
        <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-indigo-400/60 mb-3">
          AI Kurucu Analizi
        </p>
        <div className="relative pl-3">
          <span
            className="absolute -top-1 left-0 select-none font-bold text-indigo-400/30"
            style={{ fontSize: 28, lineHeight: 1 }}
            aria-hidden
          >
            "
          </span>
          <p className="text-[11px] leading-relaxed text-zinc-300 italic">
            {vo.founderInsight}
          </p>
        </div>
      </div>
    </>
  );
}

/* ── main export ────────────────────────────────────────────── */

export default function RevenueQueueContextPanel({
  selectedLead,
  kpi,
  ctx,
}: {
  selectedLead: ScoredLead | null;
  kpi: MockKpi;
  ctx: MockContext;
}) {
  if (!selectedLead) {
    return <V2ContextPanel kpi={kpi} ctx={ctx} />;
  }

  const vo = computeVerifiedOpportunity(selectedLead);

  return (
    <aside className="flex w-[260px] shrink-0 flex-col gap-3 overflow-y-auto">
      <VODetail lead={selectedLead} vo={vo} />
    </aside>
  );
}
