import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  title?: string;
  titleExtra?: ReactNode;
};

export function Card({ children, className = "", title, titleExtra }: Props) {
  return (
    <div
      className={`rounded-xl border border-white/[0.08] bg-white/[0.03] ${className}`}
    >
      {title && (
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            {title}
          </h3>
          {titleExtra}
        </div>
      )}
      {children}
    </div>
  );
}
