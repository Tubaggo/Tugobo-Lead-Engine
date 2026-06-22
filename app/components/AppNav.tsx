"use client";

import { useState } from "react";
import Link from "next/link";
import { LocaleToggle, useLocale } from "@/app/components/LocaleProvider";

type WorkspaceId =
  | "opportunities"
  | "revenue"
  | "execution"
  | "intelligence"
  | "followups"
  | "acquisition";

type NavItem = {
  label: { en: string; tr: string };
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

// v5.0 — sidebar is the single navigation system (top workspace tabs removed).
const NAV_GROUPS: NavGroup[] = [
  {
    id: "overview",
    label: { en: "Overview", tr: "Genel Bakış" },
    items: [
      { label: { en: "Command Center", tr: "Komuta Merkezi" }, workspace: "execution" },
      { label: { en: "Revenue Queue", tr: "Gelir Kuyruğu" }, workspace: "opportunities", subTab: "queue" },
      { label: { en: "Revenue Analysis", tr: "Gelir Analizi" }, workspace: "revenue" },
    ],
  },
  {
    id: "pipeline",
    label: { en: "Pipeline", tr: "Pipeline" },
    items: [
      { label: { en: "Lead List", tr: "Lead Listesi" }, workspace: "intelligence" },
      { label: { en: "ICP Analysis", tr: "ICP Analizi" }, workspace: "intelligence", subTab: "icp" },
      { label: { en: "Contact Intelligence", tr: "İletişim Zekası" }, workspace: "intelligence", subTab: "comms" },
    ],
  },
  {
    id: "operation",
    label: { en: "Operations", tr: "Operasyon" },
    items: [
      { label: { en: "Calls", tr: "Aranacaklar" }, workspace: "opportunities", subTab: "calls" },
      { label: { en: "Messages", tr: "Mesaj Atılacaklar" }, workspace: "opportunities", subTab: "messages" },
      { label: { en: "Follow-ups", tr: "Takipler" }, workspace: "followups" },
      { label: { en: "Waiting", tr: "Bekleyenler" }, workspace: "opportunities", subTab: "waiting" },
    ],
  },
  {
    id: "settings",
    label: { en: "Settings", tr: "Ayarlar" },
    items: [
      { label: { en: "Lead Acquisition", tr: "Entegrasyonlar" }, workspace: "acquisition" },
      { label: { en: "Settings", tr: "Ayarlar" }, isSoon: true },
    ],
  },
];

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

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>(["overview", "pipeline", "operation"]);
    for (const group of NAV_GROUPS) {
      if (
        group.items.some(
          (item) => item.href && !item.isSoon && item.href === currentPath && currentPath !== "/",
        )
      ) {
        initial.add(group.id);
      }
    }
    return initial;
  });

  function toggleGroup(id: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function isItemActive(item: NavItem): boolean {
    if (item.isSoon) return false;
    if (item.href) return item.href === currentPath && currentPath !== "/";
    if (!item.workspace) return false;
    if (item.workspace !== activeWorkspace) return false;
    if (item.subTab) return item.subTab === activeSubTab;
    return true;
  }

  return (
    <nav className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
          {locale === "tr" ? "Founder Revenue OS" : "Founder Revenue OS"}
        </span>
        {showLocaleToggle && <LocaleToggle />}
      </div>

      <div className="space-y-0.5">
        {NAV_GROUPS.map((group) => {
          const isOpen = openGroups.has(group.id);
          const hasActive = group.items.some((item) => isItemActive(item));

          return (
            <div key={group.id}>
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors ${
                  hasActive
                    ? "bg-indigo-500/15 text-indigo-300"
                    : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                }`}
              >
                <span>{locale === "tr" ? group.label.tr : group.label.en}</span>
                <svg
                  className={`h-3 w-3 shrink-0 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
                  viewBox="0 0 12 12"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M2.5 4.5l3.5 3 3.5-3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              {isOpen && (
                <div className="ml-2 mt-0.5 space-y-0.5 border-l border-white/[0.05] pl-2.5">
                  {group.items.map((item) => {
                    const label = locale === "tr" ? item.label.tr : item.label.en;

                    if (item.isSoon) {
                      return (
                        <div
                          key={label}
                          className="flex items-center justify-between rounded px-2 py-1 text-[11px] text-zinc-700"
                        >
                          <span>{label}</span>
                          <span className="text-[9px] uppercase tracking-wider text-zinc-700">
                            soon
                          </span>
                        </div>
                      );
                    }

                    if (item.workspace) {
                      const active = isItemActive(item);
                      const sharedClass = `block w-full rounded px-2 py-1 text-left text-[11px] transition-colors ${
                        active
                          ? "bg-orange-500/15 font-medium text-orange-200"
                          : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                      }`;
                      if (onNavigate) {
                        return (
                          <button
                            key={label}
                            type="button"
                            onClick={() => onNavigate(item.workspace!, item.subTab)}
                            className={sharedClass}
                          >
                            {label}
                          </button>
                        );
                      }
                      return (
                        <Link key={label} href="/" className={sharedClass}>
                          {label}
                        </Link>
                      );
                    }

                    const isActive = !item.isSoon && item.href === currentPath && currentPath !== "/";
                    return (
                      <Link
                        key={label}
                        href={item.href!}
                        className={`block rounded px-2 py-1 text-[11px] transition-colors ${
                          isActive
                            ? "bg-orange-500/15 font-medium text-orange-200"
                            : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                        }`}
                      >
                        {label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
