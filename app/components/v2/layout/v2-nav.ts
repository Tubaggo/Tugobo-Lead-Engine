import type { V2Screen } from "../types.ts";

/**
 * v8.0.1 — Founder Navigation Lockdown.
 *
 * The founder-facing navigation is exactly one top-level entry:
 *
 *   Hermes    → the single operating screen (Hermes Home)
 *   Developer → every other screen (former Gelir + Ayarlar + legacy
 *               dashboard screens), grouped, visually muted, collapsed by
 *               default at the bottom — a back door, not a destination.
 *
 * Nothing was deleted: every pre-v8 screen keeps its component, its adapter
 * and its V2Screen id — the only change is where it hangs in the tree.
 * This module is pure data (no JSX, no browser APIs) so the IA itself is
 * unit-testable under `node --test`.
 */

export type V2NavLeaf = {
  label: string;
  screen: V2Screen;
  icon: string;
};

export type V2NavEntryId = "hermes" | "developer";

export type V2NavEntry = {
  id: V2NavEntryId;
  label: string;
  icon: string;
  /** Direct navigation target — only the Hermes entry has one. */
  screen?: V2Screen;
  /** Collapsible children — only group entries have them. */
  items?: V2NavLeaf[];
  /**
   * The pending-decision badge. By v8.0 decree exactly one entry may carry
   * a badge, and it is Hermes — attention flows to one place only.
   */
  showsPendingDecisionBadge?: boolean;
  /** Developer is rendered low-contrast and separated — a back door, not a destination. */
  muted?: boolean;
};

export const V2_NAV: V2NavEntry[] = [
  {
    id: "hermes",
    label: "Hermes",
    icon: "automation",
    screen: "hermes",
    showsPendingDecisionBadge: true,
  },
  {
    id: "developer",
    label: "Developer",
    icon: "integration",
    muted: true,
    items: [
      { label: "Gelir Pipeline", screen: "revenue-pipeline", icon: "funnel" },
      { label: "Gelir Tahmini", screen: "revenue-forecast", icon: "forecast" },
      { label: "Gelir Risk", screen: "revenue-risk", icon: "risk" },
      { label: "Gelir Recovery", screen: "revenue-recovery", icon: "refresh" },
      { label: "Gelir Analizi", screen: "revenue-analytics", icon: "bar-chart" },
      { label: "Veri Kaynakları", screen: "data-sources", icon: "database" },
      { label: "Lead Import", screen: "lead-import", icon: "import" },
      { label: "Günlük Operasyon", screen: "command-center", icon: "command" },
      { label: "Fırsat Kuyruğu", screen: "revenue-queue", icon: "queue" },
      { label: "Takip Edilecekler", screen: "follow-ups", icon: "clock" },
      { label: "Lead Listesi", screen: "lead-list", icon: "users" },
      { label: "ICP Analizi", screen: "icp-analysis", icon: "target" },
      { label: "İletişim Zekası", screen: "communication-intelligence", icon: "message" },
    ],
  },
];

/** Every screen reachable from the nav — used to validate persisted values. */
export const ALL_NAV_SCREENS: V2Screen[] = V2_NAV.flatMap((entry) => [
  ...(entry.screen ? [entry.screen] : []),
  ...(entry.items ? entry.items.map((item) => item.screen) : []),
]);

/** The top-level entry a screen lives under — drives the sidebar's auto-expand + active highlight. */
export function navEntryIdForScreen(screen: V2Screen): V2NavEntryId {
  for (const entry of V2_NAV) {
    if (entry.screen === screen) return entry.id;
    if (entry.items?.some((item) => item.screen === screen)) return entry.id;
  }
  // Unreachable while ALL_NAV_SCREENS covers V2Screen (unit-tested); Hermes
  // is the safe home for anything unexpected.
  return "hermes";
}

/**
 * v8.1.1 — Founder-visible top-level entries. Hermes always shows; the
 * Developer group now renders only when Developer Mode is ON (the existing
 * `useDeveloperMode` hook, lifted to `V2Shell.tsx` so the same flag gates
 * both the sidebar and Hermes Home's own Developer runtime view) — replacing
 * v8.0.1's always-present-but-muted Developer entry. Pure data filter: no
 * entry is ever removed from `V2_NAV`/`ALL_NAV_SCREENS`, only what the
 * sidebar renders changes, so every screen stays reachable once Developer
 * Mode is on and no persisted deep link ever breaks.
 */
export function founderVisibleNavEntries(developerMode: boolean): V2NavEntry[] {
  return V2_NAV.filter((entry) => !entry.muted || developerMode);
}
