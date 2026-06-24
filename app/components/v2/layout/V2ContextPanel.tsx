import { fmtCurrencyTR, type MockKpi, type MockContext } from "@/app/components/v2/mock/mock-queue";

function InfoIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className="h-3.5 w-3.5 shrink-0 text-zinc-600"
      aria-hidden
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 7.5v4M8 5.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className="h-4 w-4 shrink-0 text-emerald-400"
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

const CHART_MRR_Y = [68, 58, 46, 35, 23, 14, 5];
const CHART_ARR_Y = [64, 54, 43, 32, 21, 12, 3];
const CHART_X = [0, 41, 82, 123, 164, 205, 246];
const CHART_DATES = ["21 May", "22 May", "23 May", "24 May", "25 May", "26 May", "27 May"];

function mrrPolyline() {
  return CHART_X.map((x, i) => `${x},${CHART_MRR_Y[i]}`).join(" ");
}

function arrPolyline() {
  return CHART_X.map((x, i) => `${x},${CHART_ARR_Y[i]}`).join(" ");
}

function mrrFill() {
  return (
    CHART_X.map((x, i) => `${x},${CHART_MRR_Y[i]}`).join(" ") +
    ` ${CHART_X[CHART_X.length - 1]},78 0,78`
  );
}

function arrFill() {
  return (
    CHART_X.map((x, i) => `${x},${CHART_ARR_Y[i]}`).join(" ") +
    ` ${CHART_X[CHART_X.length - 1]},78 0,78`
  );
}

type TileConfig = {
  count: number;
  label: string;
  sub: string;
  color: string;
  iconPath: string;
};

const TILE_COLORS: Record<string, { text: string; bg: string; count: string }> = {
  sky: { text: "text-sky-400", bg: "bg-sky-500/15", count: "text-sky-300" },
  emerald: { text: "text-emerald-400", bg: "bg-emerald-500/15", count: "text-emerald-300" },
  amber: { text: "text-amber-400", bg: "bg-amber-500/15", count: "text-amber-300" },
  purple: { text: "text-purple-400", bg: "bg-purple-500/15", count: "text-purple-300" },
};

const SECTION_TITLE =
  "text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-500";

export default function V2ContextPanel({ kpi, ctx }: { kpi: MockKpi; ctx: MockContext }) {
  const { rankingReasons } = ctx;

  const ACTION_TILES: TileConfig[] = [
    {
      count: kpi.callsToday,
      label: "Arama Yapılacak",
      sub: "En yüksek gelir etkisi",
      color: "sky",
      iconPath: "M3 3.5c0 5 4.5 9.5 9.5 9.5l.5-2.5-3-1-1 1.5A7 7 0 0 1 6 7.5L7.5 6l-1-3-3 .5z",
    },
    {
      count: kpi.messagesToday,
      label: "Mesaj Atılacak",
      sub: "WhatsApp / Instagram",
      color: "emerald",
      iconPath: "M2 3h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H5L2 15V4a1 1 0 0 1 1-1z",
    },
    {
      count: kpi.followUpsToday,
      label: "Takip Zamanı Gelen",
      sub: "Süre sınırına yaklaşanlar",
      color: "amber",
      iconPath: "M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zm0 3v3.5l2.5 2",
    },
    {
      count: kpi.pendingApprovals,
      label: "Bekleyen Onaylar",
      sub: "Karar sürecinde olanlar",
      color: "purple",
      iconPath: "M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-5 6a5 5 0 0 1 10 0H3z",
    },
  ];

  return (
    <aside className="flex w-[330px] shrink-0 flex-col gap-3 overflow-y-auto">
      {/* Card 1: Why this ranking */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03]">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <h3 className={SECTION_TITLE}>Neden Bu Sıralama?</h3>
          <InfoIcon />
        </div>
        <ul className="space-y-2.5 px-4 py-3.5">
          {rankingReasons.map((reason, i) => (
            <li key={i} className="flex items-center gap-2.5">
              <CheckIcon />
              <span className="text-[11px] leading-snug text-zinc-300">{reason}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Card 2: Revenue summary with sparkline */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03]">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <h3 className={SECTION_TITLE}>Kuyruk Gelir Özeti</h3>
          <button
            type="button"
            className="flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[9px] font-semibold text-zinc-400 hover:bg-white/[0.07]"
          >
            7 Günlük
            <svg viewBox="0 0 10 10" fill="none" className="h-2 w-2" aria-hidden>
              <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Metrics */}
        <div className="flex gap-3 border-b border-white/[0.04] px-4 py-3">
          <div className="flex-1">
            <div className="mb-0.5 flex items-center gap-1.5">
              <span className="h-1.5 w-3 rounded-full bg-blue-400" />
              <span className="text-[9px] text-zinc-500">Ağırlıklı MRR</span>
            </div>
            <p className="text-[15px] font-bold tabular-nums text-zinc-100">
              {fmtCurrencyTR(kpi.totalWeightedMrr)}
            </p>
            <p className="text-[9px] text-zinc-600">/ay</p>
          </div>
          <div className="flex-1">
            <div className="mb-0.5 flex items-center gap-1.5">
              <span className="h-1.5 w-3 rounded-full bg-emerald-400" />
              <span className="text-[9px] text-zinc-500">Ağırlıklı ARR</span>
            </div>
            <p className="text-[15px] font-bold tabular-nums text-zinc-100">
              {fmtCurrencyTR(kpi.totalWeightedArr)}
            </p>
            <p className="text-[9px] text-zinc-600">/yıl</p>
          </div>
        </div>

        {/* Sparkline chart */}
        <div className="px-4 pb-1 pt-3">
          <svg
            viewBox="0 0 246 78"
            className="h-[72px] w-full overflow-visible"
            preserveAspectRatio="none"
            aria-hidden
          >
            <defs>
              <linearGradient id="v2MrrGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="v2ArrGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Fill areas */}
            <polygon points={mrrFill()} fill="url(#v2MrrGrad)" />
            <polygon points={arrFill()} fill="url(#v2ArrGrad)" />

            {/* Lines */}
            <polyline
              points={arrPolyline()}
              stroke="#10b981"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <polyline
              points={mrrPolyline()}
              stroke="#3b82f6"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />

            {/* Dots on MRR line */}
            {CHART_X.map((x, i) => (
              <circle key={i} cx={x} cy={CHART_MRR_Y[i]} r="2.5" fill="#3b82f6" />
            ))}
            {/* Dots on ARR line */}
            {CHART_X.map((x, i) => (
              <circle key={i} cx={x} cy={CHART_ARR_Y[i]} r="2" fill="#10b981" />
            ))}
          </svg>

          {/* Date labels */}
          <div className="mt-1 flex justify-between pb-2">
            {CHART_DATES.map((d) => (
              <span key={d} className="text-[8px] text-zinc-700">
                {d}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Card 3: Today's action plan tiles */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03]">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <h3 className={SECTION_TITLE}>Bugünün Önerilen Aksiyon Planınız</h3>
          <InfoIcon />
        </div>

        <div className="grid grid-cols-2 gap-2 p-3">
          {ACTION_TILES.map((tile) => {
            const c = TILE_COLORS[tile.color];
            return (
              <div
                key={tile.label}
                className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3"
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <p className={`text-[22px] font-bold tabular-nums leading-none ${c.count}`}>
                      {tile.count}
                    </p>
                    <p className="mt-1 text-[10px] font-semibold leading-tight text-zinc-200">
                      {tile.label}
                    </p>
                    <p className="mt-0.5 text-[9px] leading-tight text-zinc-600">{tile.sub}</p>
                  </div>
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${c.bg}`}
                  >
                    <svg
                      viewBox="0 0 16 16"
                      fill="none"
                      className={`h-3.5 w-3.5 ${c.text}`}
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d={tile.iconPath} />
                    </svg>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="px-3 pb-3">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-[12px] font-semibold text-white shadow-lg shadow-indigo-900/30 transition-colors hover:bg-indigo-500"
          >
            Günlük Operasyon Masasına Git
            <svg
              viewBox="0 0 16 16"
              fill="none"
              className="h-3.5 w-3.5 shrink-0"
              aria-hidden
            >
              <path
                d="M3 8h10M9 4l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
