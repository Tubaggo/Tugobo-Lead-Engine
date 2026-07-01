/**
 * TUGOBO Design System — canonical Tailwind className constants.
 * Import from this file across all V2 screens and context panels.
 * Never define selectCls / inputCls / sectionLabelCls locally.
 */

// ── Controls ───────────────────────────────────────────────────

/** Standard <select> / dropdown */
export const selectCls =
  "h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 text-[11px] text-zinc-400 outline-none hover:bg-white/[0.06] hover:text-zinc-200 focus:ring-1 focus:ring-indigo-500/40 transition-colors duration-150 cursor-pointer";

/** Standard text search input */
export const inputCls =
  "h-9 w-48 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-[11px] text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-indigo-500/40 focus:bg-white/[0.06] transition-colors duration-150";

/** Standard toolbar button (outline style) */
export const btnCls =
  "h-9 flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 text-[11px] font-medium text-zinc-300 outline-none hover:bg-white/[0.06] hover:text-zinc-100 transition-colors duration-150 cursor-pointer";

/** Primary / CTA button */
export const btnPrimaryCls =
  "h-9 flex items-center gap-2 rounded-lg bg-indigo-500 px-3.5 text-[11px] font-semibold text-white hover:bg-indigo-400 transition-colors duration-150 cursor-pointer";

// ── Typography ─────────────────────────────────────────────────

/** Section / card labels — used as headings inside cards and panels */
export const sectionLabelCls =
  "text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500";

// ── KPI strip ──────────────────────────────────────────────────

/** 4-column KPI strip container (uses CSS dividers) */
export const kpiStripCls =
  "shrink-0 grid grid-cols-4 divide-x divide-white/[0.06] border-b border-white/[0.06]";

/** KPI tile: label */
export const kpiLabelCls =
  "text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500";

/** KPI tile: value (big number) */
export const kpiValueCls = "text-[28px] font-bold tabular-nums leading-none";

/** KPI tile: sub-description */
export const kpiSubCls = "text-[10px] text-zinc-600";

// ── Layout ─────────────────────────────────────────────────────

/** Toolbar / filter bar */
export const toolbarCls =
  "shrink-0 flex flex-wrap items-center gap-2.5 border-b border-white/[0.06] px-5 py-3.5";

/** Main screen content card */
export const screenCardCls =
  "flex flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.025]";

// ── Card list rows ─────────────────────────────────────────────

/** Card row: selected state */
export const rowSelectedCls =
  "border-indigo-500/40 bg-indigo-500/[0.08] ring-1 ring-inset ring-indigo-500/20";

/** Card row: default + hover */
export const rowUnselectedCls =
  "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.10] hover:bg-white/[0.04] transition-colors duration-150";

// ── Card primitives ────────────────────────────────────────────

/** Card container */
export const cardCls = "rounded-xl border border-white/[0.08] bg-white/[0.03]";

/** Card section header (with bottom divider) */
export const cardHeaderCls = "border-b border-white/[0.06] px-4 py-3.5";

// ── Buttons ────────────────────────────────────────────────────

/** Text clear / reset link button */
export const clearBtnCls =
  "text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors duration-150";
