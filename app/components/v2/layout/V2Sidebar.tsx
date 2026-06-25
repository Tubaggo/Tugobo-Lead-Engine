"use client";

import type { V2Screen } from "@/app/components/v2/types";

/* ── icons ────────────────────────────────────────────────────── */

type IconName =
  | "queue" | "list" | "analysis" | "integration" | "command"
  | "settings" | "users" | "target" | "message" | "clock"
  | "funnel" | "forecast" | "risk" | "refresh" | "bar-chart"
  | "plug" | "user-group";

const p = {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-5 w-5 shrink-0",
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
      { label: "Komuta Merkezi", icon: "command", screen: "command-center" },
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
    label: "Yönetim",
    items: [
      { label: "Entegrasyonlar", icon: "plug" },
      { label: "Ayarlar", icon: "settings" },
      { label: "Kullanıcılar", icon: "user-group" },
    ],
  },
];

/* ── group label ─────────────────────────────────────────────── */

const GROUP_LABEL_CLS =
  "mb-2 px-3.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500";

/* ── component ────────────────────────────────────────────────── */

type Props = {
  activeScreen: V2Screen;
  onNavigate: (screen: V2Screen) => void;
};

export default function V2Sidebar({ activeScreen, onNavigate }: Props) {
  return (
    <aside className="flex w-[240px] shrink-0 flex-col border-r border-white/[0.06] bg-[var(--background-elev)] px-3 py-5">
      {/* Logo */}
      <div className="mb-7 px-1">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/25 ring-1 ring-inset ring-indigo-400/40">
            <svg viewBox="0 0 20 20" fill="none" className="h-4.5 w-4.5 text-indigo-400" aria-hidden>
              <rect x="3" y="3" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              <rect x="11" y="3" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              <rect x="3" y="11" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11 14h6M14 11v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div className="leading-tight">
            <p className="text-[14px] font-extrabold tracking-tight text-zinc-100">TUGOBO</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-400/80">
              Lead Engine
            </p>
          </div>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 space-y-6 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className={GROUP_LABEL_CLS}>{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = item.screen !== undefined && activeScreen === item.screen;

                if (!item.screen) {
                  return (
                    <div
                      key={item.label}
                      className="flex cursor-default items-center gap-3 rounded-lg px-3.5 py-[11px] text-zinc-600 transition-colors duration-150 hover:bg-white/[0.03] hover:text-zinc-500"
                    >
                      <NavIcon name={item.icon} />
                      <span className="text-[15px] font-semibold leading-none">{item.label}</span>
                    </div>
                  );
                }

                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => onNavigate(item.screen!)}
                    className={[
                      "group flex w-full items-center gap-3 rounded-lg px-3.5 py-[11px] text-[15px] font-semibold transition-all duration-150",
                      isActive
                        ? "bg-indigo-500/[0.13] text-zinc-100 shadow-[inset_3px_0_0_rgba(99,102,241,0.85),inset_0_0_0_1px_rgba(99,102,241,0.18)]"
                        : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "shrink-0 transition-colors duration-150",
                        isActive ? "text-indigo-400" : "text-zinc-500 group-hover:text-zinc-300",
                      ].join(" ")}
                    >
                      <NavIcon name={item.icon} />
                    </span>
                    <span className="flex-1 truncate leading-none">{item.label}</span>
                    {isActive && (
                      <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom CTA */}
      <div className="mt-4 border-t border-white/[0.06] pt-4">
        <button
          type="button"
          onClick={() => onNavigate("revenue-queue")}
          className="flex w-full items-center justify-between gap-2 rounded-lg bg-amber-500/15 px-4 py-3 text-left ring-1 ring-inset ring-amber-400/25 transition-colors duration-150 hover:bg-amber-500/25"
        >
          <div className="flex items-center gap-2.5">
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 text-amber-400" aria-hidden>
              <path d="M9 2L4 9h5l-2 5 7-8H9l2-4H9z" />
            </svg>
            <span className="text-[12px] font-bold text-amber-300">Günlük Operasyon</span>
          </div>
          <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3 shrink-0 text-amber-400" aria-hidden>
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
