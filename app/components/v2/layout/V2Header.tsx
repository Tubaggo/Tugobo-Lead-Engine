"use client";

import {
  HERMES_DAILY_WORKSPACE_LABELS,
  type HermesHeaderStatus,
} from "@/app/components/v2/adapters/hermes-daily-workspace-adapter";

/**
 * v8.6 (Founder Workflow Optimization, Scope 1/2/8): the fake dashboard
 * controls are gone — the static date selector (a hardcoded date), the
 * Filters button (a hardcoded count, wired to nothing), and the
 * notification bell all implied manual exploration that never existed.
 * The founder never manually filters; Hermes filters.
 *
 * In their place, the Hermes screen's header carries operational state
 * (Çalışıyor/Beklemede · Son Tarama · Son Aktivite · Bekleyen Karar — all
 * read from existing runtime state, never a hardcoded date) and operational
 * actions ("Hermes'i Çalıştır" only while idle, "Durumu Yenile" always,
 * the Geliştirici Modu toggle only while Developer Mode is already ON).
 * Both actions re-run the workspace's existing read-only data pass — no
 * new runtime, no new API. Screens without Hermes props (Developer
 * screens) show only the profile chip.
 */

export type V2HeaderHermesProps = {
  status: HermesHeaderStatus;
  /** Re-runs Hermes's read-only data pass. Rendered only while idle. */
  onRunHermes: () => void;
  /** Same underlying refresh — always available. */
  onRefreshStatus: () => void;
  /** The toggle renders only while Developer Mode is already ON — the founder never sees it. */
  developerMode: boolean;
  onToggleDeveloperMode: () => void;
};

/** Short operational timestamp — day + time, from a real runtime moment only. */
function formatStatusTime(at: number | null): string {
  if (at === null || at <= 0) return HERMES_DAILY_WORKSPACE_LABELS.neverYet;
  return new Date(at).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusItem({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="hidden flex-col items-start leading-tight lg:flex">
      <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-600">{label}</span>
      <span className={`mt-0.5 text-[11px] font-medium ${accent ?? "text-zinc-300"}`}>{value}</span>
    </div>
  );
}

export default function V2Header({
  title,
  subtitle,
  hermes,
}: {
  title: string;
  subtitle: string;
  hermes?: V2HeaderHermesProps;
}) {
  const isRunning = hermes?.status.mode === "running";
  // Sprint C1 — "Kontrol Gerekli": the acquisition configuration needs a
  // human look. Amber, never a technical error string.
  const isAttention = hermes?.status.mode === "attention";

  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/[0.06] bg-[var(--background-elev)] px-6 py-3.5">
      {/* Title area */}
      <div className="min-w-0">
        <h1 className="text-[24px] font-bold tracking-tight text-zinc-100 leading-none">
          {title}
        </h1>
        <p className="mt-1 truncate text-[12.5px] text-zinc-500">
          {subtitle}
        </p>
      </div>

      {/* Right area — operational state + operational actions only */}
      <div className="flex shrink-0 items-center gap-2">
        {hermes && (
          <>
            {/* Hermes status strip — everything from existing runtime state */}
            <div className="flex items-center gap-4 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-1.5">
              <div className="flex flex-col items-start leading-tight">
                <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
                  {HERMES_DAILY_WORKSPACE_LABELS.statusTitle}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      isRunning ? "animate-pulse bg-emerald-400" : isAttention ? "bg-amber-400" : "bg-zinc-500"
                    }`}
                  />
                  <span
                    className={`text-[11px] font-semibold ${
                      isRunning ? "text-emerald-300" : isAttention ? "text-amber-300" : "text-zinc-300"
                    }`}
                  >
                    {hermes.status.modeLabel}
                  </span>
                </span>
              </div>
              <StatusItem
                label={HERMES_DAILY_WORKSPACE_LABELS.lastScan}
                value={formatStatusTime(hermes.status.lastScanAt)}
              />
              <StatusItem
                label={HERMES_DAILY_WORKSPACE_LABELS.lastActivity}
                value={formatStatusTime(hermes.status.lastActivityAt)}
              />
              <StatusItem
                label={HERMES_DAILY_WORKSPACE_LABELS.pendingDecisions}
                value={String(hermes.status.pendingDecisionCount)}
                accent={hermes.status.pendingDecisionCount > 0 ? "text-amber-400" : "text-zinc-300"}
              />
            </div>

            {/* Operational actions */}
            {!isRunning && (
              <button
                type="button"
                onClick={hermes.onRunHermes}
                className="flex h-9 items-center gap-2 rounded-lg bg-indigo-500 px-3.5 text-[11px] font-semibold text-white transition-colors duration-150 hover:bg-indigo-400"
              >
                <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3 shrink-0" aria-hidden>
                  <path d="M5 3.5v9l7-4.5-7-4.5z" fill="currentColor" />
                </svg>
                <span>{HERMES_DAILY_WORKSPACE_LABELS.runHermes}</span>
              </button>
            )}
            <button
              type="button"
              onClick={hermes.onRefreshStatus}
              className="flex h-9 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 text-[11px] font-medium text-zinc-300 transition-colors duration-150 hover:bg-white/[0.06] hover:text-zinc-100"
            >
              <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden>
                <path
                  d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v2.6h-2.6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>{HERMES_DAILY_WORKSPACE_LABELS.refreshStatus}</span>
            </button>
            {hermes.developerMode && (
              <button
                type="button"
                onClick={hermes.onToggleDeveloperMode}
                className="flex h-9 items-center rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 text-[11px] font-medium text-zinc-500 transition-colors duration-150 hover:bg-white/[0.06] hover:text-zinc-200"
              >
                Geliştirici Modu: Açık
              </button>
            )}
          </>
        )}

        {/* Founder profile */}
        <div className="flex h-9 items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.03] pl-1.5 pr-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-500/35 text-[10px] font-bold text-indigo-200 ring-1 ring-inset ring-indigo-400/40">
            TF
          </div>
          <div className="leading-tight">
            <p className="text-[11px] font-semibold text-zinc-200">Tugobo Founder</p>
            <p className="text-[10px] text-zinc-600">Kurucu Hesap</p>
          </div>
        </div>
      </div>
    </header>
  );
}
