"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/app/components/LocaleProvider";
import type { Locale } from "@/app/lib/i18n";

/**
 * In-page section navigation for the long single-page Lead Engine dashboard.
 *
 * This is NOT a global sidebar or a router — it only scrolls the current page to
 * one of its main sections and highlights the section currently in view. It does
 * not change the page structure, order, data, or any business logic.
 */

export type SectionNavigationItem = {
  id: string;
  label: string;
  shortLabel?: string;
};

type SectionNavigationDef = {
  id: string;
  tr: string;
  en: string;
  shortTr?: string;
  shortEn?: string;
};

/**
 * Single source of truth for the navigable sections. `id` values are stable,
 * ASCII-safe, unique and must match the `id` attributes rendered on the page.
 * Labels are derived from the real section headings.
 */
export const SECTION_NAV_DEFS: readonly SectionNavigationDef[] = [
  { id: "genel-bakis", tr: "Genel Bakış", en: "Overview", shortTr: "Genel", shortEn: "Overview" },
  {
    id: "bugunun-operasyonu",
    tr: "Bugünün Operasyonu",
    en: "Today's Operations",
    shortTr: "Operasyon",
    shortEn: "Ops",
  },
  { id: "satis-plani", tr: "Satış Planı", en: "Sales Plan", shortTr: "Plan", shortEn: "Plan" },
  {
    id: "gelir-risk",
    tr: "Gelir ve Risk",
    en: "Revenue & Risk",
    shortTr: "Gelir",
    shortEn: "Revenue",
  },
  {
    id: "bugunun-firsatlari",
    tr: "Bugünün Fırsatları",
    en: "Today's Opportunities",
    shortTr: "Fırsatlar",
    shortEn: "Opportunities",
  },
  {
    id: "satis-boru-hatti",
    tr: "Satış Boru Hattı",
    en: "Sales Pipeline",
    shortTr: "Pipeline",
    shortEn: "Pipeline",
  },
  { id: "lead-havuzu", tr: "Lead Havuzu", en: "Lead Pool", shortTr: "Havuz", shortEn: "Pool" },
  {
    id: "sicak-leadler",
    tr: "Sıcak Lead'ler",
    en: "Hot Leads",
    shortTr: "Sıcak",
    shortEn: "Hot",
  },
  { id: "tum-leadler", tr: "Tüm Lead'ler", en: "All Leads", shortTr: "Tümü", shortEn: "All" },
] as const;

/**
 * Shared class applied to every section anchor so the sticky mobile bar / desktop
 * offset never covers a section heading when navigated to.
 */
export const SECTION_ANCHOR_CLS = "scroll-mt-[72px] lg:scroll-mt-6";

export function getSectionNavItems(locale: Locale): SectionNavigationItem[] {
  return SECTION_NAV_DEFS.map((def) => ({
    id: def.id,
    label: locale === "tr" ? def.tr : def.en,
    shortLabel: locale === "tr" ? def.shortTr ?? def.tr : def.shortEn ?? def.en,
  }));
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Tracks which section is currently near the top of the viewport using a single
 * IntersectionObserver (no scroll listeners). `revalidateKey` lets the caller
 * re-establish observation once conditionally-rendered sections mount.
 */
export function useActiveSection(
  ids: string[],
  revalidateKey?: unknown,
): [string | null, (id: string) => void] {
  const [activeId, setActiveId] = useState<string | null>(ids[0] ?? null);
  const idsKey = ids.join("|");

  useEffect(() => {
    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return;
    const idList = idsKey ? idsKey.split("|") : [];
    const elements = idList
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el != null);
    if (elements.length === 0) return;

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        // The active section is the lowest one (in document order) currently
        // inside the detection band near the top of the viewport. This keeps the
        // active state stable while scrolling quickly between adjacent sections.
        let next: string | null = null;
        for (const id of idList) {
          if (visible.has(id)) next = id;
        }
        if (next) setActiveId(next);
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // idsKey covers the id list; revalidateKey re-runs after late-mounting sections.
  }, [idsKey, revalidateKey]);

  return [activeId, setActiveId];
}

function scrollToSection(id: string, updateHash = true) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "start",
  });
  if (updateHash) {
    try {
      // replaceState avoids polluting the browser history stack with anchors.
      history.replaceState(null, "", `#${id}`);
    } catch {
      /* ignore */
    }
  }
  // Move focus to the target for keyboard/screen-reader users without a second scroll.
  window.requestAnimationFrame(() => {
    el.focus({ preventScroll: true });
  });
}

export function SectionNavigationRail({
  items,
  revalidateKey,
}: {
  items: SectionNavigationItem[];
  revalidateKey?: unknown;
}) {
  const { locale } = useLocale();
  const ids = items.map((i) => i.id);
  const [activeId, setActiveId] = useActiveSection(ids, revalidateKey);
  const didInitHash = useRef(false);

  // On first load with #section-id (once the target has mounted), scroll to it.
  useEffect(() => {
    if (didInitHash.current) return;
    if (typeof window === "undefined") return;
    const hash = window.location.hash.slice(1);
    if (!hash || !ids.includes(hash)) return;
    const el = document.getElementById(hash);
    if (!el) return; // target not mounted yet — retry when revalidateKey changes
    didInitHash.current = true;
    setActiveId(hash);
    el.scrollIntoView({ block: "start", behavior: "auto" });
    window.requestAnimationFrame(() => el.focus({ preventScroll: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revalidateKey]);

  const handleActivate = useCallback(
    (id: string) => {
      // Optimistic highlight for instant feedback; the observer refines the
      // active section as the user continues scrolling.
      setActiveId(id);
      scrollToSection(id);
    },
    [setActiveId],
  );

  const sectionsLabel = locale === "tr" ? "BÖLÜMLER" : "SECTIONS";
  const backToTop = locale === "tr" ? "Başa Dön" : "Back to top";
  const goToLast = locale === "tr" ? "Son Bölüme Git" : "Go to last section";
  const navAria = locale === "tr" ? "Sayfa bölümleri" : "Page sections";
  const lastId = ids[ids.length - 1];

  return (
    <nav aria-label={navAria} className="lg:sticky lg:top-6 lg:self-start">
      {/* Compact horizontal bar for tablet / mobile (below lg) */}
      <div className="sticky top-0 z-30 -mx-4 mb-4 border-b border-white/10 bg-[#07070a]/90 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:hidden">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            {sectionsLabel}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleActivate("genel-bakis")}
              className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-300 transition hover:bg-white/10"
            >
              ↑ {backToTop}
            </button>
          </div>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((item) => {
            const active = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? "location" : undefined}
                onClick={() => handleActivate(item.id)}
                className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset transition ${
                  active
                    ? "bg-indigo-500/20 text-indigo-100 ring-indigo-400/40"
                    : "bg-white/5 text-zinc-400 ring-white/10 hover:bg-white/10 hover:text-zinc-200"
                }`}
              >
                {item.shortLabel ?? item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Vertical rail for desktop (lg+) */}
      <div className="hidden max-h-[calc(100vh-3rem)] flex-col overflow-y-auto rounded-xl border border-white/10 bg-white/[0.02] p-3 backdrop-blur lg:flex">
        <span className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          {sectionsLabel}
        </span>
        <ul className="relative flex flex-col gap-0.5 border-l border-white/10 pl-2">
          {items.map((item) => {
            const active = item.id === activeId;
            return (
              <li key={item.id} className="relative">
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute -left-[9px] top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-indigo-400"
                  />
                )}
                <button
                  type="button"
                  aria-current={active ? "location" : undefined}
                  onClick={() => handleActivate(item.id)}
                  className={`w-full rounded-md px-2 py-1.5 text-left text-xs font-medium transition ${
                    active
                      ? "bg-indigo-500/10 text-indigo-200"
                      : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                  }`}
                >
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 flex flex-col gap-1 border-t border-white/5 pt-2">
          <button
            type="button"
            onClick={() => handleActivate("genel-bakis")}
            className="rounded-md px-2 py-1 text-left text-[11px] text-zinc-500 transition hover:bg-white/5 hover:text-zinc-300"
          >
            ↑ {backToTop}
          </button>
          {lastId && (
            <button
              type="button"
              onClick={() => handleActivate(lastId)}
              className="rounded-md px-2 py-1 text-left text-[11px] text-zinc-500 transition hover:bg-white/5 hover:text-zinc-300"
            >
              ↓ {goToLast}
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
