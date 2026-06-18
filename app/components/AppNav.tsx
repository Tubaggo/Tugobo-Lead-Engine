"use client";

import { useState } from "react";
import Link from "next/link";
import { LocaleToggle, useLocale } from "@/app/components/LocaleProvider";

type NavItem = {
  label: { en: string; tr: string };
  href: string;
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
      { label: { en: "Command Center", tr: "Komuta Merkezi" }, href: "/" },
      { label: { en: "Revenue Pipeline", tr: "Gelir Hattı" }, href: "/" },
      { label: { en: "Commercial Overview", tr: "Ticari Bakış" }, href: "/" },
    ],
  },
  {
    id: "opportunities",
    label: { en: "Opportunities", tr: "Fırsatlar" },
    items: [
      { label: { en: "Lead List", tr: "Lead Listesi" }, href: "/" },
      { label: { en: "ICP Analysis", tr: "ICP Analizi" }, href: "/" },
      { label: { en: "Opportunity Queue", tr: "Fırsat Kuyruğu" }, href: "/" },
      { label: { en: "Contact Intel", tr: "İletişim Zekası" }, href: "/" },
    ],
  },
  {
    id: "revenue",
    label: { en: "Revenue", tr: "Gelir" },
    items: [
      { label: { en: "Revenue Potential", tr: "Gelir Potansiyeli" }, href: "/" },
      { label: { en: "Forecast", tr: "Tahmin" }, href: "/" },
      { label: { en: "Risk", tr: "Risk" }, href: "/" },
      { label: { en: "Recovery", tr: "Toparlanma" }, href: "/" },
    ],
  },
  {
    id: "execution",
    label: { en: "Execution", tr: "Uygulama" },
    items: [
      { label: { en: "Sales Plan", tr: "Satış Planı" }, href: "/" },
      { label: { en: "Activity Timeline", tr: "Aktivite Geçmişi" }, href: "/" },
      { label: { en: "Follow-up Queue", tr: "Takip Kuyruğu" }, href: "/dashboard/follow-ups" },
      { label: { en: "Founder Assistant", tr: "Kurucu Asistanı" }, href: "/" },
    ],
  },
  {
    id: "settings",
    label: { en: "Settings", tr: "Ayarlar" },
    items: [
      { label: { en: "Integrations", tr: "Entegrasyonlar" }, href: "/", isSoon: true },
      { label: { en: "Configuration", tr: "Yapılandırma" }, href: "/", isSoon: true },
      { label: { en: "System Settings", tr: "Sistem Ayarları" }, href: "/", isSoon: true },
    ],
  },
];

export default function AppNav({
  currentPath,
  showLocaleToggle = false,
}: {
  currentPath: string;
  showLocaleToggle?: boolean;
}) {
  const { locale } = useLocale();

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>(["overview", "opportunities"]);
    for (const group of NAV_GROUPS) {
      if (
        group.items.some(
          (item) => !item.isSoon && item.href === currentPath && currentPath !== "/",
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
            (item) => !item.isSoon && item.href === currentPath && currentPath !== "/",
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
                    const isActive =
                      !item.isSoon && item.href === currentPath && currentPath !== "/";

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

                    return (
                      <Link
                        key={label}
                        href={item.href}
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
