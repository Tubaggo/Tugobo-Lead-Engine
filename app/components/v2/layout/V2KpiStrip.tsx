import { KpiCard } from "@/app/components/v2/primitives/KpiCard";
import { fmtCurrencyTR, type MockKpi } from "@/app/components/v2/mock/mock-queue";
import type { V2Screen } from "@/app/components/v2/types";

const sp = {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-4 w-4",
  "aria-hidden": true,
} as const;

const MrrIcon = () => (
  <svg {...sp}>
    <path d="M2 12l3-4 3 2 3-5 3-3" />
    <path d="M13 5l2-1-1 2" />
  </svg>
);

const ArrIcon = () => (
  <svg {...sp}>
    <rect x="2" y="3" width="12" height="11" rx="1.5" />
    <path d="M5 1.5v3M11 1.5v3M2 7h12" />
  </svg>
);

const OppsIcon = () => (
  <svg {...sp}>
    <circle cx="6" cy="5.5" r="2.5" />
    <path d="M1 14c0-3 2.2-5 5-5s5 2 5 5" />
    <circle cx="12" cy="6" r="2" />
    <path d="M14 14c0-2.2-1.3-3.8-3-4.3" />
  </svg>
);

const ConversionIcon = () => (
  <svg {...sp}>
    <circle cx="8" cy="8" r="6" />
    <circle cx="8" cy="8" r="3" />
    <circle cx="8" cy="8" r="0.8" fill="currentColor" stroke="none" />
  </svg>
);

const PhoneIcon = () => (
  <svg {...sp}>
    <path d="M3 3.5c0 5 4.5 9.5 9.5 9.5l.5-2.5-3-1-1 1.5A7 7 0 0 1 6 7.5L7.5 6l-1-3-3 .5z" />
  </svg>
);

const MessageIcon = () => (
  <svg {...sp} fill="none">
    <path d="M2 3h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H5L2 15V4a1 1 0 0 1 1-1z" />
  </svg>
);

export default function V2KpiStrip({ kpi, onNavigate }: { kpi: MockKpi; onNavigate: (screen: V2Screen) => void }) {
  const {
    totalWeightedMrr,
    totalWeightedArr,
    opportunityCount,
    avgConversion,
    callsToday,
    messagesToday,
  } = kpi;

  return (
    <div className="grid shrink-0 grid-cols-6 gap-2.5 border-b border-white/[0.06] px-5 py-3.5">
      <KpiCard
        label="Toplam Ağırlıklı MRR"
        value={fmtCurrencyTR(totalWeightedMrr)}
        sub="Bu kuyruktaki toplam"
        trend={{ direction: "up", value: "%18.6" }}
        accent="emerald"
        icon={<MrrIcon />}
        iconBg="bg-emerald-500/15 text-emerald-400"
      />
      <KpiCard
        label="Toplam Ağırlıklı ARR"
        value={fmtCurrencyTR(totalWeightedArr)}
        sub="Bu kuyruktaki toplam"
        trend={{ direction: "up", value: "%18.6" }}
        accent="violet"
        icon={<ArrIcon />}
        iconBg="bg-violet-500/15 text-violet-400"
      />
      <KpiCard
        label="Fırsat Sayısı"
        value={String(opportunityCount)}
        sub="Aktif ve aksiyonlanabilir"
        accent="amber"
        icon={<OppsIcon />}
        iconBg="bg-amber-500/15 text-amber-400"
      />
      <KpiCard
        label="Ort. Dönüşüm Olasılığı"
        value={`%${avgConversion}`}
        sub="Kuyruktaki ortalama"
        accent="orange"
        icon={<ConversionIcon />}
        iconBg="bg-orange-500/15 text-orange-400"
      />
      <KpiCard
        label="Bugün Önerilen Arama"
        value={String(callsToday)}
        sub="En yüksek gelir etkisi"
        accent="sky"
        icon={<PhoneIcon />}
        iconBg="bg-sky-500/15 text-sky-400"
        onClick={() => onNavigate("follow-ups")}
      />
      <KpiCard
        label="Bugün Önerilen Mesaj"
        value={String(messagesToday)}
        sub="WhatsApp / Instagram"
        accent="emerald"
        icon={<MessageIcon />}
        iconBg="bg-emerald-500/15 text-emerald-400"
        onClick={() => onNavigate("communication-intelligence")}
      />
    </div>
  );
}
