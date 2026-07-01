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
  onClick?: () => void;
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

export function KpiCard({ label, value, sub, trend, accent = "default", icon, iconBg, onClick }: Props) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={`flex items-center gap-3.5 rounded-xl border border-white/[0.08] bg-[var(--background-elev)] px-4 py-4 transition-colors duration-150${
        onClick ? " cursor-pointer hover:border-white/[0.14] hover:bg-[var(--background-soft)]" : ""
      }`}
    >
      {icon && (
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${iconBg ?? "bg-zinc-800"}`}
        >
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-[0.11em] text-zinc-500 leading-none">
          {label}
        </p>
        <p className={`text-[26px] font-bold leading-none tabular-nums ${ACCENT[accent]}`}>
          {value}
        </p>
        {(sub || trend) && (
          <div className="mt-1.5 flex items-center gap-1.5">
            {trend && (
              <span className={`text-[10px] font-semibold ${TREND_COLOR[trend.direction]}`}>
                {TREND_ARROW[trend.direction]} {trend.value}
              </span>
            )}
            {sub && <span className="text-[10px] text-zinc-600">{sub}</span>}
          </div>
        )}
      </div>
    </Wrapper>
  );
}
