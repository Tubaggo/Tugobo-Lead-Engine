"use client";

import { useState } from "react";
import Link from "next/link";
import { LocaleToggle, useLocale } from "@/app/components/LocaleProvider";

type WorkspaceId = "opportunities" | "revenue" | "execution" | "intelligence";

type NavItem = {
  label: { en: string; tr: string };
  href?: string;
  workspace?: WorkspaceId;
  isSoon?: boolean;
};

type NavGroup = {
  id: string;
  label: { en: string; tr: string };
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    id: "overview",
    label: { en: "Overview", tr: "Genel Bakış" },
    items: [
      { label: { en: "Command Center", tr: "Komuta Merkezi" }, workspace: "execution" },
      { label: { en: "Revenue Pipeline", tr: "Gelir Hattı" }, workspace: "revenue" },
      { label: { en: "Commercial Overview", tr: "Ticari Bakış" }, workspace: "revenue" },
    ],
  },
  {
    id: "opportunities",
    label: { en: "Opportunities", tr: "Fırsatlar" },
    items: [
      { label: { en: "Lead List", tr: "Lead Listesi" }, workspace: "intelligence" },
      { label: { en: "ICP Analysis", tr: "ICP Analizi" }, workspace: "opportunities" },
      { label: { en: "Opportunity Queue", tr: "Fırsat Kuyruğu" }, workspace: "opportunities" },
      { label: { en: "Contact Intel", tr: "İletişim Zekası" }, workspace: "execution" },
    ],
  },
  {
    id: "revenue",
    label: { en: "Revenue", tr: "Gelir" },
    items: [
      { label: { en: "Revenue Potential", tr: "Gelir Potansiyeli" }, workspace: "revenue" },
      { label: { en: "Forecast", tr: "Tahmin" }, workspace: "revenue" },
      { label: { en: "Risk", tr: "Risk" }, workspace: "revenue" },
      { label: { en: "Recovery", tr: "Toparlanma" }, workspace: "revenue" },
    ],
  },
  {
    id: "execution",
    label: { en: "Execution", tr: "Uygulama" },
    items: [
      { label: { en: "Sales Plan", tr: "Satış Planı" }, workspace: "execution" },
      { label: { en: "Activity Timeline", tr: "Aktivite Geçmişi" }, workspace: "execution" },
      { label: { en: "Founder Assistant", tr: "Kurucu Asistanı" }, workspace: "execution" },
    ],
  },
  {
    id: "followups",
    label: { en: "Follow-up Queue", tr: "Takip Kuyruğu" },
    items: [
      { label: { en: "Today's Follow-ups", tr: "Bugünün Takipleri" }, href: "/dashboard/follow-ups" },
    ],
  },
  {
    id: "settings",
    label: { en: "Settings", tr: "Ayarlar" },
    items: [
      { label: { en: "Integrations", tr: "Entegrasyonlar" }, isSoon: true },
      { label: { en: "Configuration", tr: "Yapılandırma" }, isSoon: true },
      { label: { en: "System Settings", tr: "Sistem Ayarları" }, isSoon: true },
    ],
  },
];

export default function AppNav({
  currentPath,
  showLocaleToggle = false,
  activeWorkspace,
  onNavigate,
}: {
  currentPath: string;
  showLocaleToggle?: boolean;
  activeWorkspace?: WorkspaceId;
  onNavigate?: (workspace: WorkspaceId) => void;
}) {
  const { locale } = useLocale();

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>(["overview", "opportunities"]);
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

  return (
    <nav className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-600">
          {locale === "tr" ? "Navigasyon" : "Navigation"}
        </span>
        {showLocaleToggle && <LocaleToggle />}
      </div>

      <div className="space-y-0.5">
        {NAV_GROUPS.map((group) => {
          const isOpen = openGroups.has(group.id);
          const hasActive = group.items.some(
            (item) =>
              !item.isSoon &&
              (item.href
                ? item.href === currentPath && currentPath !== "/"
                : item.workspace === activeWorkspace),
          );

          return (
            <div key={group.id}>
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ${
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
                      const isActive = item.workspace === activeWorkspace;
                      const sharedClass = `block w-full rounded px-2 py-1 text-left text-[11px] transition-colors ${
                        isActive
                          ? "bg-orange-500/15 font-medium text-orange-200"
                          : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                      }`;
                      if (onNavigate) {
                        return (
                          <button
                            key={label}
                            type="button"
                            onClick={() => onNavigate(item.workspace!)}
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
