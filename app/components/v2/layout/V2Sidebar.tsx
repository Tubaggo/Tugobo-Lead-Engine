"use client";

import type { V2Screen } from "@/app/components/v2/types";

/* ── icons ────────────────────────────────────────────────────── */

type IconName =
  | "queue" | "list" | "analysis" | "integration" | "command"
  | "settings" | "users" | "target" | "message" | "clock"
  | "funnel" | "forecast" | "risk" | "refresh" | "bar-chart"
  | "plug" | "user-group" | "import" | "database" | "automation";

const p = {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-[15px] w-[15px] shrink-0",
  "aria-hidden": true,
} as const;

function NavIcon({ name }: { name: IconName }) {
  switch (name) {
    case "queue":      return <svg {...p}><path d="M2 4h12M2 8h12M2 12h7" /></svg>;
    case "list":       return <svg {...p}><path d="M5 4h9M5 8h9M5 12h9" /><circle cx="2.5" cy="4" r="0.6" fill="currentColor" stroke="none" /><circle cx="2.5" cy="8" r="0.6" fill="currentColor" stroke="none" /><circle cx="2.5" cy="12" r="0.6" fill="currentColor" stroke="none" /></svg>;
    case "analysis":   return <svg {...p}><path d="M2 13V3M2 13h12M5 10l3-3 2 2 4-4" /></svg>;
    case "integration":return <svg {...p}><path d="M6.5 9.5 4 12a2 2 0 0 1-3-3l2.5-2.5M9.5 6.5 12 4a2 2 0 0 1 3 3l-2.5 2.5M6 10l4-4" /></svg>;
    case "command":    return <svg {...p}><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></svg>;
    case "settings":   return <svg {...p}><circle cx="8" cy="8" r="2" /><path d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M12.6 12.6l-1.4-1.4M4.8 4.8 3.4 3.4" /></svg>;
    case "users":      return <svg {...p}><circle cx="6" cy="5.5" r="2.5" /><path d="M1 14c0-3 2.2-5 5-5s5 2 5 5" /><circle cx="12" cy="6" r="2" /><path d="M14 14c0-2.2-1.3-3.8-3-4.3" /></svg>;
    case "target":     return <svg {...p}><circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="3" /><circle cx="8" cy="8" r="0.8" fill="currentColor" stroke="none" /></svg>;
    case "message":    return <svg {...p}><path d="M2 3h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H5L2 15V4a1 1 0 0 1 1-1z" /></svg>;
    case "clock":      return <svg {...p}><circle cx="8" cy="8" r="6" /><path d="M8 5v3.5l2.5 2" /></svg>;
    case "funnel":     return <svg {...p}><path d="M2 3h12l-4 6v5l-4-2V9L2 3z" /></svg>;
    case "forecast":   return <svg {...p}><path d="M2 12l3-5 3 3 3-5 3-3" /><path d="M12 4l2 2" /></svg>;
    case "risk":       return <svg {...p}><path d="M8 2l6 11H2L8 2z" /><path d="M8 7v3M8 11.5v.5" /></svg>;
    case "refresh":    return <svg {...p}><path d="M13.5 5A6 6 0 1 0 14 8" /><path d="M13.5 1.5v3.5H10" /></svg>;
    case "bar-chart":  return <svg {...p}><path d="M4 14V8M8 14V5M12 14v-4" /></svg>;
    case "plug":       return <svg {...p}><path d="M6 1v4M10 1v4M5 5h6v3a3 3 0 0 1-6 0V5zM8 8v4" /></svg>;
    case "user-group": return <svg {...p}><circle cx="8" cy="6" r="3" /><path d="M2 15c0-3.3 2.7-5 6-5s6 1.7 6 5" /></svg>;
    case "import":     return <svg {...p}><path d="M8 2v9M5 8l3 3 3-3M2 13h12" /></svg>;
    case "database":   return <svg {...p}><ellipse cx="8" cy="5" rx="5" ry="2" /><path d="M3 5v6c0 1.1 2.2 2 5 2s5-.9 5-2V5M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" /></svg>;
    case "automation": return <svg {...p}><path d="M3 3l10 5-10 5V3z" fill="currentColor" stroke="none" /><path d="M3 3l10 5-10 5" /></svg>;
    default:           return null;
  }
}

/* ── nav data ─────────────────────────────────────────────────── */

type NavItem = {
  label: string;
  icon: IconName;
  screen?: V2Screen;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Genel",
    items: [
      { label: "Günlük Operasyon", icon: "command", screen: "command-center" },
    ],
  },
  {
    label: "Operasyon",
    items: [
      { label: "Fırsat Kuyruğu", icon: "queue", screen: "revenue-queue" },
      { label: "Takip Edilecekler", icon: "clock", screen: "follow-ups" },
    ],
  },
  {
    label: "Analiz",
    items: [
      { label: "Lead Listesi", icon: "users", screen: "lead-list" },
      { label: "ICP Analizi", icon: "target", screen: "icp-analysis" },
      { label: "İletişim Zekası", icon: "message", screen: "communication-intelligence" },
    ],
  },
  {
    label: "Gelir",
    items: [
      { label: "Gelir Pipeline", icon: "funnel", screen: "revenue-pipeline" },
      { label: "Gelir Tahmini", icon: "forecast", screen: "revenue-forecast" },
      { label: "Gelir Risk", icon: "risk", screen: "revenue-risk" },
      { label: "Gelir Recovery", icon: "refresh", screen: "revenue-recovery" },
      { label: "Gelir Analizi", icon: "bar-chart", screen: "revenue-analytics" },
    ],
  },
  {
    label: "Sistem",
    items: [
      { label: "Lead Import", icon: "import", screen: "lead-import" as const },
      { label: "Veri Kaynakları", icon: "database", screen: "data-sources" as const },
      { label: "Hermes Workspace", icon: "automation", screen: "automation-center" as const },
    ],
  },
];

/* ── component ────────────────────────────────────────────────── */

type Props = {
  activeScreen: V2Screen;
  onNavigate: (screen: V2Screen) => void;
  counts?: Partial<Record<V2Screen, number>>;
};

export default function V2Sidebar({ activeScreen, onNavigate, counts }: Props) {
  return (
    <aside className="flex w-[208px] shrink-0 flex-col border-r border-white/[0.06] bg-[var(--background-elev)] px-2 py-4">

      {/* Logo */}
      <div className="mb-5 px-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-indigo-600/20 ring-1 ring-inset ring-indigo-500/30">
            <svg viewBox="0 0 20 20" fill="none" className="h-[15px] w-[15px] text-indigo-400" aria-hidden>
              <rect x="3" y="3" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              <rect x="11" y="3" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              <rect x="3" y="11" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11 14h6M14 11v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <p className="text-[12px] font-extrabold tracking-tight text-zinc-100 leading-none">TUGOBO</p>
            <p className="mt-[3px] text-[8px] font-bold uppercase tracking-[0.22em] text-indigo-400/75">
              Lead Engine
            </p>
          </div>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 space-y-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1 px-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = item.screen !== undefined && activeScreen === item.screen;
                const count = item.screen !== undefined ? counts?.[item.screen] : undefined;

                if (!item.screen) {
                  return (
                    <div
                      key={item.label}
                      className="flex w-full cursor-default items-center gap-2 px-2 py-[7px] text-[12px] font-medium text-zinc-700"
                    >
                      <span className="shrink-0 text-zinc-700">
                        <NavIcon name={item.icon} />
                      </span>
                      <span className="flex-1 truncate">{item.label}</span>
                    </div>
                  );
                }

                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => onNavigate(item.screen!)}
                    className={[
                      "group relative flex w-full items-center gap-2 rounded-md px-2 py-[7px] text-[13px] font-medium leading-none transition-all duration-150",
                      isActive
                        ? "bg-indigo-500/[0.12] text-zinc-100"
                        : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300",
                    ].join(" ")}
                  >
                    {/* Left accent bar for active state */}
                    {isActive && (
                      <span className="absolute left-0 top-[6px] bottom-[6px] w-[3px] rounded-r-full bg-indigo-500" />
                    )}
                    <span
                      className={[
                        "shrink-0 transition-colors duration-150",
                        isActive ? "text-indigo-400" : "text-zinc-600 group-hover:text-zinc-400",
                      ].join(" ")}
                    >
                      <NavIcon name={item.icon} />
                    </span>
                    <span className="flex-1 truncate">{item.label}</span>
                    {count !== undefined ? (
                      <span
                        className={[
                          "ml-auto flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums leading-none",
                          isActive
                            ? "bg-indigo-500/25 text-indigo-300"
                            : "bg-white/[0.07] text-zinc-500",
                        ].join(" ")}
                      >
                        {count}
                      </span>
                    ) : isActive ? (
                      <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400/60" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom CTA */}
      <div className="mt-3 border-t border-white/[0.06] pt-3">
        <button
          type="button"
          onClick={() => onNavigate("revenue-queue")}
          className="flex h-9 w-full items-center justify-between gap-2 rounded-lg bg-amber-500/[0.12] px-3 ring-1 ring-inset ring-amber-400/[0.18] transition-colors duration-150 hover:bg-amber-500/[0.18]"
        >
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 16 16" fill="none" className="h-[13px] w-[13px] shrink-0 text-amber-400" aria-hidden>
              <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M5 1.5v3M11 1.5v3M2 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="text-[11.5px] font-semibold text-amber-300">Günlük Operasyon</span>
          </div>
          <svg viewBox="0 0 16 16" fill="none" className="h-[11px] w-[11px] shrink-0 text-amber-400/50" aria-hidden>
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
