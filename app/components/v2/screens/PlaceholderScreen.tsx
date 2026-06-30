import type { V2Screen } from "@/app/components/v2/types";

/* ── per-screen config ────────────────────────────────────── */

type ScreenCfg = {
  label: string;
  description: string;
  features: string[];
  sprintLabel: string;
  /** Tailwind pairs — must be complete static strings for JIT */
  iconBg: string;
  iconColor: string;
  badgeBg: string;
  badgeText: string;
  /** Inline SVG content (no outer <svg>) */
  iconContent: string;
};

const SCREEN_CFG: Record<Exclude<V2Screen, "revenue-queue" | "lead-import" | "data-sources" | "automation-center">, ScreenCfg> = {
  "command-center": {
    label: "Komuta Merkezi",
    description:
      "Tüm satış operasyonlarınızı tek ekrandan yönetin — kritik uyarılar, öncelikli aksiyonlar ve günlük brifing.",
    features: [
      "Kritik uyarı ve alert sistemi",
      "Günlük founder brifing özeti",
      "Öncelikli aksiyon kuyruğu",
      "Pipeline anlık görünümü",
    ],
    sprintLabel: "Sprint v5.6",
    iconBg: "bg-indigo-500/15",
    iconColor: "text-indigo-400",
    badgeBg: "bg-indigo-500/20",
    badgeText: "text-indigo-300",
    iconContent:
      '<rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5"/>',
  },
  "lead-list": {
    label: "Lead Listesi",
    description:
      "30 aktif lead profilinizi detaylı inceleyin — skor, kanal, segment ve aksiyon geçmişiyle.",
    features: [
      "Detaylı lead profil kartları",
      "Tier ve segment filtreleme",
      "Kanal ve skor bazlı sıralama",
      "Gerçek zamanlı skor güncelleme",
    ],
    sprintLabel: "Sprint v5.6",
    iconBg: "bg-violet-500/15",
    iconColor: "text-violet-400",
    badgeBg: "bg-violet-500/20",
    badgeText: "text-violet-300",
    iconContent:
      '<circle cx="8" cy="6" r="3" stroke="currentColor" stroke-width="1.5"/><path d="M2 16c0-3.3 2.7-5 6-5s6 1.7 6 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  },
  "icp-analysis": {
    label: "ICP Analizi",
    description:
      "İdeal müşteri profili skorlama, segmentasyon ve ICP uyum analiziyle doğru leadi doğru anda hedefleyin.",
    features: [
      "ICP skor hesaplama motoru",
      "Segment analizi ve radar grafik",
      "Uyum skoru haritası",
      "ICP preset konfigürasyonu",
    ],
    sprintLabel: "Sprint v5.7",
    iconBg: "bg-teal-500/15",
    iconColor: "text-teal-400",
    badgeBg: "bg-teal-500/20",
    badgeText: "text-teal-300",
    iconContent:
      '<circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none"/>',
  },
  "communication-intelligence": {
    label: "İletişim Zekası",
    description:
      "Kanal optimizasyonu, yanıt oranı analitiği ve en doğru iletişim zamanını otomatik önerin.",
    features: [
      "Kanal performans karşılaştırması",
      "Yanıt oranı ve açılma takibi",
      "Optimal temas zamanı önerisi",
      "İletişim geçmiş özeti",
    ],
    sprintLabel: "Sprint v5.7",
    iconBg: "bg-sky-500/15",
    iconColor: "text-sky-400",
    badgeBg: "bg-sky-500/20",
    badgeText: "text-sky-300",
    iconContent:
      '<path d="M2 3h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H5L2 15V4a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  },
  "follow-ups": {
    label: "Takip Edilecekler",
    description:
      "Süresi gelen takipler, geciken aksiyonlar ve planlı aramalar için öncelikli sıralama.",
    features: [
      "Geciken takip listesi",
      "Planlı arama takvimi",
      "Otomatik hatırlatıcı sistemi",
      "Takip performans skoru",
    ],
    sprintLabel: "Sprint v5.6",
    iconBg: "bg-amber-500/15",
    iconColor: "text-amber-400",
    badgeBg: "bg-amber-500/20",
    badgeText: "text-amber-300",
    iconContent:
      '<circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M8 5v3.5l2.5 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  "revenue-pipeline": {
    label: "Gelir Pipeline",
    description:
      "Satış aşaması takibi, deal progression ve konversiyon oranlı pipeline görünümü.",
    features: [
      "Aşama bazlı kanban ve liste",
      "Deal progression timeline",
      "Konversiyon oranı analizi",
      "Stage sıkışma tespiti",
    ],
    sprintLabel: "Sprint v5.7",
    iconBg: "bg-emerald-500/15",
    iconColor: "text-emerald-400",
    badgeBg: "bg-emerald-500/20",
    badgeText: "text-emerald-300",
    iconContent:
      '<path d="M2 3h12l-4 6v5l-4-2V9L2 3z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  },
  "revenue-forecast": {
    label: "Gelir Tahmini",
    description:
      "30–90 günlük gelir projeksiyonu, üç bant senaryo analizi ve güven aralıklı tahmin motoru.",
    features: [
      "3 bant senaryo tahmini",
      "Güven aralığı görselleştirme",
      "Aylık breakdown projeksiyonu",
      "Tahmin vs gerçekleşen karşılaştırma",
    ],
    sprintLabel: "Sprint v5.7",
    iconBg: "bg-blue-500/15",
    iconColor: "text-blue-400",
    badgeBg: "bg-blue-500/20",
    badgeText: "text-blue-300",
    iconContent:
      '<path d="M2 12l3-5 3 3 3-5 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 4l2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  },
  "revenue-risk": {
    label: "Gelir Risk",
    description:
      "Risk altındaki fırsatların tespiti, erken uyarı sistemi ve kayıp önleme playbook'ları.",
    features: [
      "5-tip risk tarayıcı motoru",
      "Risk skorlu fırsat listesi",
      "Erken uyarı bildirimleri",
      "Kayıp önleme playbook",
    ],
    sprintLabel: "Sprint v5.8",
    iconBg: "bg-rose-500/15",
    iconColor: "text-rose-400",
    badgeBg: "bg-rose-500/20",
    badgeText: "text-rose-300",
    iconContent:
      '<path d="M8 2l6 11H2L8 2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 7v3M8 11.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  },
  "revenue-recovery": {
    label: "Gelir Recovery",
    description:
      "Kaybedilen veya soğuyan fırsatları geri kazanma stratejileri ve recovery aksiyon kuyruğu.",
    features: [
      "Recovery adayı tespiti",
      "Win-back strateji önerileri",
      "Recovery oranı takibi",
      "Kaybedilen gelir analizi",
    ],
    sprintLabel: "Sprint v5.8",
    iconBg: "bg-orange-500/15",
    iconColor: "text-orange-400",
    badgeBg: "bg-orange-500/20",
    badgeText: "text-orange-300",
    iconContent:
      '<path d="M13.5 5A6 6 0 1 0 14 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M13.5 1.5v3.5H10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  "revenue-analytics": {
    label: "Gelir Analizi",
    description:
      "Derinlemesine gelir analitiği, cohort analizi ve uzun vadeli performans raporları.",
    features: [
      "Gelir trend grafikleri",
      "Cohort analizi tabloları",
      "Performans benchmark karşılaştırma",
      "İndirilebilir raporlar",
    ],
    sprintLabel: "Sprint v5.8",
    iconBg: "bg-purple-500/15",
    iconColor: "text-purple-400",
    badgeBg: "bg-purple-500/20",
    badgeText: "text-purple-300",
    iconContent:
      '<path d="M4 14V8M8 14V5M12 14v-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  },
};

/* ── icon component ───────────────────────────────────────── */

function ScreenIcon({
  iconContent,
  iconBg,
  iconColor,
  size = "lg",
}: {
  iconContent: string;
  iconBg: string;
  iconColor: string;
  size?: "sm" | "lg";
}) {
  const dim = size === "lg" ? "h-12 w-12" : "h-8 w-8";
  const svgDim = size === "lg" ? "h-6 w-6" : "h-4 w-4";
  return (
    <div
      className={`flex ${dim} shrink-0 items-center justify-center rounded-xl ${iconBg} ring-1 ring-inset ring-white/[0.08]`}
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        className={`${svgDim} ${iconColor}`}
        aria-hidden
        dangerouslySetInnerHTML={{ __html: iconContent }}
      />
    </div>
  );
}

/* ── check icon ───────────────────────────────────────────── */

function Check() {
  return (
    <svg viewBox="0 0 14 14" fill="none" className="h-3 w-3 shrink-0 text-zinc-500" aria-hidden>
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M4.5 7.5l2 2 3-3"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ── ghost skeleton rows ──────────────────────────────────── */

function GhostRows() {
  const rows = [
    { w1: "w-48", w2: "w-20", w3: "w-16", w4: "w-24", w5: "w-14" },
    { w1: "w-56", w2: "w-16", w3: "w-20", w4: "w-20", w5: "w-12" },
    { w1: "w-40", w2: "w-24", w3: "w-14", w4: "w-28", w5: "w-16" },
    { w1: "w-52", w2: "w-18", w3: "w-18", w4: "w-22", w5: "w-14" },
  ];
  return (
    <div className="mt-4 space-y-2 opacity-30">
      <div className="flex items-center gap-3 border-b border-white/[0.04] pb-2">
        {["w-8", "w-36", "w-20", "w-24", "w-16"].map((w, i) => (
          <div key={i} className={`h-2 rounded-full bg-white/20 ${w}`} />
        ))}
      </div>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <div className={`h-6 w-6 rounded-full bg-white/10 ${r.w1.replace("w-", "").length ? "" : ""}`} />
          <div className={`h-2 rounded-full bg-white/10 ${r.w1}`} />
          <div className={`h-2 rounded-full bg-white/10 ${r.w2}`} />
          <div className={`h-2 rounded-full bg-white/10 ${r.w3}`} />
          <div className={`h-2 rounded-full bg-white/10 ${r.w4}`} />
          <div className={`h-2 rounded-full bg-white/10 ${r.w5}`} />
        </div>
      ))}
    </div>
  );
}

/* ── main placeholder workspace ───────────────────────────── */

export default function PlaceholderScreen({ screen }: { screen: Exclude<V2Screen, "revenue-queue" | "lead-import" | "data-sources" | "automation-center"> }) {
  const cfg = SCREEN_CFG[screen];

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
      {/* Hero card */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-6 shadow-xl shadow-black/20">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <ScreenIcon
              iconContent={cfg.iconContent}
              iconBg={cfg.iconBg}
              iconColor={cfg.iconColor}
            />
            <div>
              <h2 className="text-[20px] font-bold tracking-tight text-zinc-100">
                {cfg.label}
              </h2>
              <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-zinc-400">
                {cfg.description}
              </p>
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ring-1 ring-inset ring-white/[0.08] ${cfg.badgeBg} ${cfg.badgeText}`}
          >
            {cfg.sprintLabel}
          </span>
        </div>

        {/* Feature grid */}
        <div className="mt-6">
          <p className="mb-3 text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-600">
            Gelecek Özellikler
          </p>
          <div className="grid grid-cols-2 gap-2">
            {cfg.features.map((f) => (
              <div
                key={f}
                className="flex items-center gap-2.5 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2.5"
              >
                <Check />
                <span className="text-[12px] text-zinc-300">{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Ghost preview */}
        <div className="mt-6">
          <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-700">
            Workspace Önizlemesi
          </p>
          <GhostRows />
        </div>
      </div>

      {/* Info strip */}
      <div className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.015] px-5 py-3">
        <svg
          viewBox="0 0 16 16"
          fill="none"
          className="h-3.5 w-3.5 shrink-0 text-zinc-600"
          aria-hidden
        >
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 7.5v4M8 5.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <p className="text-[11px] text-zinc-600">
          Bu ekran bir sonraki sprintte bağlanacak. Veriler hazır, UI entegrasyonu planlandı.
        </p>
      </div>
    </div>
  );
}

/* ── placeholder context panel (named export) ─────────────── */

export function PlaceholderContextPanel({
  screen,
}: {
  screen: Exclude<V2Screen, "revenue-queue" | "lead-import" | "data-sources" | "automation-center">;
}) {
  const cfg = SCREEN_CFG[screen];

  const SECTION = "text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-500";

  return (
    <aside className="flex w-[260px] shrink-0 flex-col gap-3 overflow-y-auto">
      {/* Screen info card */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03]">
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
          <ScreenIcon
            iconContent={cfg.iconContent}
            iconBg={cfg.iconBg}
            iconColor={cfg.iconColor}
            size="sm"
          />
          <h3 className={SECTION}>{cfg.label} Hakkında</h3>
        </div>
        <div className="px-4 py-3.5">
          <p className="text-[11px] leading-relaxed text-zinc-400">{cfg.description}</p>
        </div>
      </div>

      {/* Coming features card */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03]">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <h3 className={SECTION}>Planlanmış Özellikler</h3>
          <span
            className={`rounded-full px-2 py-0.5 text-[9px] font-bold ring-1 ring-inset ring-white/[0.08] ${cfg.badgeBg} ${cfg.badgeText}`}
          >
            {cfg.sprintLabel}
          </span>
        </div>
        <ul className="space-y-2.5 px-4 py-3.5">
          {cfg.features.map((f) => (
            <li key={f} className="flex items-center gap-2.5">
              <svg
                viewBox="0 0 14 14"
                fill="none"
                className={`h-3.5 w-3.5 shrink-0 ${cfg.iconColor}`}
                aria-hidden
              >
                <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.25" />
                <path
                  d="M4.5 7.5l2 2 3-3"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-[11px] leading-snug text-zinc-300">{f}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Progress card */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
        <p className={`mb-3 ${SECTION}`}>Geliştirme Durumu</p>
        <div className="space-y-2.5">
          {[
            { label: "Veri modeli", done: true },
            { label: "Business logic", done: true },
            { label: "UI tasarım", done: true },
            { label: "UI entegrasyon", done: false },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-400">{item.label}</span>
              <span
                className={`text-[9px] font-semibold ${
                  item.done ? "text-emerald-400" : "text-amber-400"
                }`}
              >
                {item.done ? "✓ Tamamlandı" : "⟳ Planlandı"}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400" />
        </div>
        <p className="mt-1.5 text-right text-[9px] text-zinc-600">%75 hazır</p>
      </div>
    </aside>
  );
}
