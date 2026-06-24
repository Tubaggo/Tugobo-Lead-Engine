import type { ReactNode } from "react";

const VARIANTS = {
  enterprise: "bg-purple-500/20 text-purple-300 ring-purple-500/30",
  growth: "bg-violet-500/20 text-violet-300 ring-violet-500/30",
  professional: "bg-sky-500/20 text-sky-300 ring-sky-500/30",
  starter: "bg-zinc-500/20 text-zinc-400 ring-zinc-500/30",
  critical: "bg-rose-500/20 text-rose-300 ring-rose-500/30",
  high: "bg-amber-500/20 text-amber-300 ring-amber-500/30",
  medium: "bg-blue-500/20 text-blue-300 ring-blue-500/30",
  low: "bg-zinc-600/20 text-zinc-500 ring-zinc-600/20",
  default: "bg-zinc-700/30 text-zinc-300 ring-zinc-700/30",
} as const;

type Variant = keyof typeof VARIANTS;

type Props = {
  children: ReactNode;
  variant?: Variant;
};

export function Badge({ children, variant = "default" }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${VARIANTS[variant]}`}
    >
      {children}
    </span>
  );
}
