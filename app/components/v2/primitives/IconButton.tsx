import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  label?: string;
  className?: string;
};

export function IconButton({ children, label, className = "" }: Props) {
  return (
    <button
      type="button"
      title={label}
      className={`flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-zinc-200 ${className}`}
    >
      {children}
    </button>
  );
}
