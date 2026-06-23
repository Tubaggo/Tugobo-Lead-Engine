"use client";

import Link from "next/link";
import { LocaleToggle, useLocale } from "@/app/components/LocaleProvider";

type WorkspaceId =
  | "opportunities"
  | "revenue"
  | "execution"
  | "intelligence"
  | "followups"
  | "acquisition";

type IconName =
  | "command"
  | "queue"
  | "analysis"
  | "list"
  | "icp"
  | "comms"
  | "calls"
  | "messages"
  | "followups"
  | "waiting"
  | "integration"
  | "settings";

type NavItem = {
  label: { en: string; tr: string };
  icon: IconName;
  href?: string;
  workspace?: WorkspaceId;
  subTab?: string;
  isSoon?: boolean;
};

type NavGroup = {
  id: string;
  label: { en: string; tr: string };
  items: NavItem[];
};

// v6.0 — Revenue Operating System IA: minimal sidebar reflecting fewer primary views.
// Operational subviews (Calls/Messages/Follow-ups/Waiting) now live as queue tabs inside
// Gelir Kuyruğu — they are no longer separate sidebar pages. Komuta Merkezi is demoted.
const NAV_GROUPS: NavGroup[] = [
  {
    id: "primary",
    label: { en: "Revenue", tr: "Gelir" },
    items: [
      { label: { en: "Revenue Queue", tr: "Gelir Kuyruğu" }, icon: "queue", workspace: "opportunities" },
      { label: { en: "Lead Pool", tr: "Lead Havuzu" }, icon: "list", workspace: "intelligence" },
      { label: { en: "Revenue Analysis", tr: "Gelir Analizi" }, icon: "analysis", workspace: "revenue" },
      { label: { en: "Acquisition", tr: "Lead Edinimi" }, icon: "integration", workspace: "acquisition" },
    ],
  },
  {
    id: "more",
    label: { en: "More", tr: "Diğer" },
    items: [
      { label: { en: "Command Center", tr: "Komuta Merkezi" }, icon: "command", workspace: "execution" },
      { label: { en: "Settings", tr: "Ayarlar" }, icon: "settings", isSoon: true },
    ],
  },
];

/** Compact 16px stroke glyphs for the sidebar. Pure presentational. */
function NavIcon({ name }: { name: IconName }) {
  const common = {
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-4 w-4",
    "aria-hidden": true,
  };
  switch (name) {
    case "command":
      return (
        <svg {...common}><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></svg>
      );
    case "queue":
      return (
        <svg {...common}><path d="M2 4h12M2 8h12M2 12h7" /></svg>
      );
    case "analysis":
      return (
        <svg {...common}><path d="M2 13V3M2 13h12M5 10l3-3 2 2 4-4" /></svg>
      );
    case "list":
      return (
        <svg {...common}><path d="M5 4h9M5 8h9M5 12h9" /><circle cx="2.5" cy="4" r="0.6" fill="currentColor" stroke="none" /><circle cx="2.5" cy="8" r="0.6" fill="currentColor" stroke="none" /><circle cx="2.5" cy="12" r="0.6" fill="currentColor" stroke="none" /></svg>
      );
    case "icp":
      return (
        <svg {...common}><circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="3" /><circle cx="8" cy="8" r="0.6" fill="currentColor" stroke="none" /></svg>
      );
    case "comms":
      return (
        <svg {...common}><path d="M3 3h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H6l-3 3V4a1 1 0 0 1 1-1Z" /></svg>
      );
    case "calls":
      return (
        <svg {...common}><path d="M3 3.5c0 5 4.5 9.5 9.5 9.5l.5-2.5-3-1-1 1.5a7 7 0 0 1-3.5-3.5L7.5 6l-1-3-3 .5Z" /></svg>
      );
    case "messages":
      return (
        <svg {...common}><path d="M2.5 4h11v7h-7l-4 3V4Z" /></svg>
      );
    case "followups":
      return (
        <svg {...common}><circle cx="8" cy="8" r="6" /><path d="M8 5v3l2 1.5" /></svg>
      );
    case "waiting":
      return (
        <svg {...common}><path d="M4.5 2.5h7M4.5 13.5h7M5 2.5c0 3 6 3.5 6 5.5S5 10.5 5 13.5M11 2.5c0 3-6 3.5-6 5.5" /></svg>
      );
    case "integration":
      return (
        <svg {...common}><path d="M6.5 9.5 4 12a2 2 0 0 1-3-3l2.5-2.5M9.5 6.5 12 4a2 2 0 0 1 3 3l-2.5 2.5M6 10l4-4" /></svg>
      );
    case "settings":
      return (
        <svg {...common}><circle cx="8" cy="8" r="2" /><path d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M12.6 12.6l-1.4-1.4M4.8 4.8 3.4 3.4" /></svg>
      );
  }
}

export default function AppNav({
  currentPath,
  showLocaleToggle = false,
  activeWorkspace,
  activeSubTab,
  onNavigate,
}: {
  currentPath: string;
  showLocaleToggle?: boolean;
  activeWorkspace?: WorkspaceId;
  activeSubTab?: string;
  onNavigate?: (workspace: WorkspaceId, subTab?: string) => void;
}) {
  const { locale } = useLocale();

  function isItemActive(item: NavItem): boolean {
    if (item.isSoon) return false;
    if (item.href) return item.href === currentPath && currentPath !== "/";
    if (!item.workspace) return false;
    if (item.workspace !== activeWorkspace) return false;
    if (item.subTab) return item.subTab === activeSubTab;
    return true;
  }

  const rowBase =
    "group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors";
  const iconBase = "flex shrink-0 items-center justify-center";

  return (
    <nav className="flex h-full flex-col gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
      {/* Brand */}
      <div className="flex items-center justify-between px-1.5 pt-0.5">
        <span className="text-[12px] font-bold tracking-tight text-zinc-100">
          Revenue<span className="text-orange-300">OS</span>
        </span>
        {showLocaleToggle && <LocaleToggle />}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.id}>
            <div className="px-2 pb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
              {locale === "tr" ? group.label.tr : group.label.en}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const label = locale === "tr" ? item.label.tr : item.label.en;

                if (item.isSoon) {
                  return (
                    <div
                      key={label}
                      className={`${rowBase} cursor-default text-zinc-700`}
                    >
                      <span className={iconBase}>
                        <NavIcon name={item.icon} />
                      </span>
                      <span className="truncate">{label}</span>
                      <span className="ml-auto text-[9px] uppercase tracking-wider text-zinc-700">
                        soon
                      </span>
                    </div>
                  );
                }

                const active = isItemActive(item);
                const stateClass = active
                  ? "bg-indigo-500/15 font-medium text-indigo-100 ring-1 ring-inset ring-indigo-400/20"
                  : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200";
                const iconColor = active
                  ? "text-indigo-300"
                  : "text-zinc-500 group-hover:text-zinc-300";

                const content = (
                  <>
                    <span className={`${iconBase} ${iconColor}`}>
                      <NavIcon name={item.icon} />
                    </span>
                    <span className="truncate">{label}</span>
                  </>
                );

                if (item.workspace && onNavigate) {
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => onNavigate(item.workspace!, item.subTab)}
                      className={`${rowBase} ${stateClass}`}
                    >
                      {content}
                    </button>
                  );
                }

                return (
                  <Link
                    key={label}
                    href={item.href ?? "/"}
                    className={`${rowBase} ${stateClass}`}
                  >
                    {content}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
