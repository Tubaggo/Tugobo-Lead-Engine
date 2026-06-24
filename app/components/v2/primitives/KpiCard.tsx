import type { ReactNode } from "react";

type Direction = "up" | "down" | "neutral";

type Props = {
  label: string;
  value: string;
  sub?: string;
  trend?: { direction: Direction; value: string };
  accent?: "default" | "emerald" | "amber" | "indigo" | "rose" | "purple" | "sky" | "orange" | "violet";
  icon?: ReactNode;
  iconBg?: string;
};

const ACCENT: Record<NonNullable<Props["accent"]>, string> = {
  default: "text-zinc-100",
  emerald: "text-emerald-400",
  amber: "text-amber-400",
  indigo: "text-indigo-400",
  rose: "text-rose-400",
  purple: "text-purple-400",
  sky: "text-sky-400",
  orange: "text-orange-400",
  violet: "text-violet-400",
};

const TREND_COLOR: Record<Direction, string> = {
  up: "text-emerald-400",
  down: "text-rose-400",
  neutral: "text-zinc-500",
};

const TREND_ARROW: Record<Direction, string> = {
  up: "↑",
  down: "↓",
  neutral: "→",
};

export function KpiCard({ label, value, sub, trend, accent = "default", icon, iconBg }: Props) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-4 shadow-sm">
      {icon && (
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg ?? "bg-zinc-800"}`}
        >
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-zinc-500">
          {label}
        </p>
        <p className={`text-[19px] font-bold leading-none tabular-nums ${ACCENT[accent]}`}>
          {value}
        </p>
        {(sub || trend) && (
          <div className="mt-1 flex items-center gap-1.5">
            {trend && (
              <span className={`text-[10px] font-semibold ${TREND_COLOR[trend.direction]}`}>
                {TREND_ARROW[trend.direction]} {trend.value}
              </span>
            )}
            {sub && <span className="text-[10px] text-zinc-600">{sub}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
