"use client";

import { useState } from "react";
import type { V2Screen } from "@/app/components/v2/types";
import {
  founderVisibleNavEntries,
  navEntryIdForScreen,
  type V2NavEntry,
  type V2NavEntryId,
} from "@/app/components/v2/layout/v2-nav";

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

function NavIcon({ name }: { name: string }) {
  switch (name as IconName) {
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

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className={`h-[11px] w-[11px] shrink-0 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
      aria-hidden
    >
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── component ────────────────────────────────────────────────── */

/**
 * v8.1.1 — Hide Developer Navigation.
 *
 * Exactly one founder-facing top-level entry (Hermes) by default, defined as
 * pure data in `v2-nav.ts`. The badge exists only on Hermes and only carries
 * the pending-decision count. Developer no longer renders at all unless
 * Developer Mode is ON (`developerMode` prop, sourced from the existing
 * `useDeveloperMode` hook lifted to `V2Shell.tsx`) — when it is, the same
 * separated, low-contrast, collapsed-by-default group from v8.0.1 appears at
 * the bottom, untouched.
 */

type Props = {
  activeScreen: V2Screen;
  onNavigate: (screen: V2Screen) => void;
  /** v8.0: only "hermes" is ever read — the sole badge in the sidebar. */
  counts?: Partial<Record<V2Screen, number>>;
  /** v8.1.1 — the Developer group renders only while this is true. */
  developerMode: boolean;
};

export default function V2Sidebar({ activeScreen, onNavigate, counts, developerMode }: Props) {
  // Explicit founder toggles; a group without an explicit toggle auto-opens
  // when it contains the active screen, so deep-linked state stays visible.
  const [expanded, setExpanded] = useState<Partial<Record<V2NavEntryId, boolean>>>({});
  const activeEntryId = navEntryIdForScreen(activeScreen);

  const isOpen = (entry: V2NavEntry) => expanded[entry.id] ?? entry.id === activeEntryId;
  const toggle = (id: V2NavEntryId) =>
    setExpanded((prev) => ({ ...prev, [id]: !(prev[id] ?? id === activeEntryId) }));

  const pendingDecisionCount = counts?.hermes ?? 0;

  const renderEntry = (entry: V2NavEntry) => {
    const isGroup = entry.items !== undefined;
    const open = isGroup && isOpen(entry);
    const entryActive = entry.screen !== undefined && activeScreen === entry.screen;
    const containsActive = entry.id === activeEntryId;

    const baseTone = entry.muted
      ? "text-zinc-600 hover:bg-white/[0.03] hover:text-zinc-400"
      : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300";

    return (
      <div key={entry.id}>
        <button
          type="button"
          onClick={() => (isGroup ? toggle(entry.id) : onNavigate(entry.screen!))}
          className={[
            "group relative flex w-full items-center gap-2 rounded-md px-2 py-[7px] text-[13px] font-medium leading-none transition-all duration-150",
            entryActive
              ? "bg-indigo-500/[0.12] text-zinc-100"
              : containsActive && !open
                ? "text-zinc-300"
                : baseTone,
          ].join(" ")}
        >
          {entryActive && (
            <span className="absolute left-0 top-[6px] bottom-[6px] w-[3px] rounded-r-full bg-indigo-500" />
          )}
          <span
            className={[
              "shrink-0 transition-colors duration-150",
              entryActive
                ? "text-indigo-400"
                : entry.muted
                  ? "text-zinc-700 group-hover:text-zinc-500"
                  : "text-zinc-600 group-hover:text-zinc-400",
            ].join(" ")}
          >
            <NavIcon name={entry.icon} />
          </span>
          <span className="flex-1 truncate text-left">{entry.label}</span>
          {entry.showsPendingDecisionBadge && pendingDecisionCount > 0 ? (
            <span
              className={[
                "ml-auto flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums leading-none",
                entryActive ? "bg-indigo-500/25 text-indigo-300" : "bg-amber-500/[0.15] text-amber-400",
              ].join(" ")}
            >
              {pendingDecisionCount}
            </span>
          ) : isGroup ? (
            <span className={entry.muted ? "text-zinc-700" : "text-zinc-600"}>
              <Chevron open={open} />
            </span>
          ) : null}
        </button>

        {isGroup && open && (
          <div className="mt-0.5 space-y-0.5 pl-3">
            {entry.items!.map((item, index) => {
              const itemActive = activeScreen === item.screen;
              // v8.4 — Developer Panel Organization: render a small section
              // header whenever a leaf starts a new logical group.
              const previous = entry.items![index - 1];
              const startsNewSection = item.section !== undefined && item.section !== previous?.section;
              return (
                <div key={item.screen}>
                  {startsNewSection && (
                    <p className={`px-2 pb-0.5 text-[8px] font-bold uppercase tracking-[0.18em] text-zinc-700 ${index > 0 ? "pt-2" : "pt-1"}`}>
                      {item.section}
                    </p>
                  )}
                <button
                  type="button"
                  onClick={() => onNavigate(item.screen)}
                  className={[
                    "group relative flex w-full items-center gap-2 rounded-md px-2 py-[6px] text-[12px] font-medium leading-none transition-all duration-150",
                    itemActive
                      ? "bg-indigo-500/[0.12] text-zinc-100"
                      : entry.muted
                        ? "text-zinc-600 hover:bg-white/[0.03] hover:text-zinc-400"
                        : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300",
                  ].join(" ")}
                >
                  {itemActive && (
                    <span className="absolute left-0 top-[5px] bottom-[5px] w-[3px] rounded-r-full bg-indigo-500" />
                  )}
                  <span
                    className={[
                      "shrink-0 transition-colors duration-150",
                      itemActive
                        ? "text-indigo-400"
                        : entry.muted
                          ? "text-zinc-700 group-hover:text-zinc-500"
                          : "text-zinc-600 group-hover:text-zinc-400",
                    ].join(" ")}
                  >
                    <NavIcon name={item.icon} />
                  </span>
                  <span className="flex-1 truncate text-left">{item.label}</span>
                </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const visibleEntries = founderVisibleNavEntries(developerMode);
  const founderEntries = visibleEntries.filter((entry) => !entry.muted);
  const developerEntries = visibleEntries.filter((entry) => entry.muted);

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
            <p className="text-[12px] font-extrabold tracking-tight text-zinc-100 leading-none">HERMES</p>
            <p className="mt-[3px] text-[8px] font-bold uppercase tracking-[0.22em] text-indigo-400/75">
              Operating System
            </p>
          </div>
        </div>
      </div>

      {/* Founder nav: Hermes only */}
      <nav className="flex-1 space-y-0.5">
        {founderEntries.map(renderEntry)}
      </nav>

      {/* Developer: only rendered at all while Developer Mode is ON — invisible otherwise, not just muted */}
      {developerEntries.length > 0 && (
        <div className="mt-3 space-y-0.5 border-t border-white/[0.06] pt-3">
          {developerEntries.map(renderEntry)}
        </div>
      )}
    </aside>
  );
}
