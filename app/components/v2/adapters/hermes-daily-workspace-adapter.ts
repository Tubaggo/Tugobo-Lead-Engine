/**
 * Hermes Daily Workspace adapter (v8.6 — Founder Workflow Optimization).
 *
 * Pure presentation-layer projections that turn existing runtime state into
 * the three pieces of daily-workspace copy the founder reads first:
 *
 *   1. `computeHermesHeaderStatus` — the top-header operational strip
 *      (Çalışıyor/Beklemede, last scan, last activity, pending decisions)
 *      that replaces v8.5's static date selector + fake Filters button.
 *   2. `computeFounderDaySummary` — the Hermes Home subtitle: a greeting +
 *      one deterministic sentence about what Hermes did today.
 *   3. `computeTodayStatusSentence` — the one compact line above Karar
 *      Merkezi ("Hermes 4 karar hazırladı." / "Her şey kontrol altında…").
 *
 * Nothing here computes new runtime facts: every input is a count or
 * timestamp another runtime/adapter already produced (`useLeadImport`'s
 * import history, mission timelines, the shell's own pending-decision
 * count). No fetch, no Date.now() default that could hide a hardcoded
 * date — timestamps come in as numbers and go out unchanged.
 *
 * Deliberately dependency-free (no "@/" imports, no React, no browser API)
 * so it runs under plain `node --test` — the same convention every v8
 * adapter follows.
 */

export type HermesRuntimeMode = "running" | "idle" | "attention";

/** Founder-facing vocabulary for the daily-workspace header + Karar Merkezi all-clear state. Audited by the release tests. */
export const HERMES_DAILY_WORKSPACE_LABELS = {
  statusTitle: "Hermes",
  running: "Çalışıyor",
  idle: "Beklemede",
  attention: "Kontrol Gerekli",
  lastScan: "Son Tarama",
  lastActivity: "Son Aktivite",
  pendingDecisions: "Bekleyen Karar",
  runHermes: "Hermes'i Çalıştır",
  refreshStatus: "Durumu Yenile",
  neverYet: "Henüz yok",
  decisionAllClearTitle: "Her şey yolunda.",
  todayPendingDecisions: "Bekleyen Karar",
  todayDiscoveredOpportunities: "Keşfedilen Fırsat",
  todayRevenueWon: "Kazanılan Gelir",
} as const;

export type HermesHeaderStatus = {
  mode: HermesRuntimeMode;
  modeLabel: string;
  lastScanAt: number | null;
  lastActivityAt: number | null;
  pendingDecisionCount: number;
};

export type ComputeHermesHeaderStatusInput = {
  /** `useLeadImport().loading` — a scan fetch is in flight right now. */
  importInProgress: boolean;
  /** How many Hermes jobs are actively executing a stage right now. */
  runningJobCount: number;
  /** Newest import moment (`importHistory[0].importedAt`), or null when Hermes has never scanned. */
  lastScanAt: number | null;
  /** Newest mission-timeline moment across all missions, or null when nothing has happened yet. */
  lastActivityAt: number | null;
  /** The shell's existing pending-founder-decision count — the same number the sidebar badge shows. */
  pendingDecisionCount: number;
  /** Sprint C1 — an autonomous acquisition run is in flight on the server right now. */
  acquisitionRunning?: boolean;
  /** Sprint C1 — newest completed autonomous scan moment; merged with `lastScanAt` (newest wins). */
  acquisitionLastScanAt?: number | null;
  /** Sprint C1 — the acquisition config needs a human look (founder-safe "Kontrol Gerekli"). */
  acquisitionNeedsAttention?: boolean;
};

/**
 * "Running" means work is genuinely in flight (a scan, an executing job, or
 * a server-side acquisition run) — a mission merely existing keeps Hermes
 * watchful, not running. This is what gates the header's "Hermes'i Çalıştır"
 * action to idle only. A broken acquisition configuration surfaces as the
 * founder-safe "Kontrol Gerekli" state — never a technical error string.
 */
export function computeHermesHeaderStatus(input: ComputeHermesHeaderStatusInput): HermesHeaderStatus {
  const running =
    input.importInProgress || input.runningJobCount > 0 || input.acquisitionRunning === true;
  const mode: HermesRuntimeMode = running
    ? "running"
    : input.acquisitionNeedsAttention === true
      ? "attention"
      : "idle";

  const acquisitionScanAt = input.acquisitionLastScanAt ?? null;
  const lastScanAt =
    input.lastScanAt === null && acquisitionScanAt === null
      ? null
      : Math.max(input.lastScanAt ?? 0, acquisitionScanAt ?? 0);

  return {
    mode,
    modeLabel: HERMES_DAILY_WORKSPACE_LABELS[mode],
    lastScanAt,
    lastActivityAt: input.lastActivityAt,
    pendingDecisionCount: input.pendingDecisionCount,
  };
}

export type ComputeFounderDaySummaryInput = {
  /** Local hour 0–23 — injected (never read from a hardcoded date) so tests stay deterministic. */
  hour: number;
  isRunning: boolean;
  pendingDecisionCount: number;
};

function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return "Günaydın.";
  if (hour >= 12 && hour < 18) return "İyi günler.";
  return "İyi akşamlar.";
}

/**
 * The Hermes Home subtitle (Scope 3): greeting + one natural-language
 * sentence about today, chosen from runtime state — never a static tagline.
 */
export function computeFounderDaySummary(input: ComputeFounderDaySummaryInput): string {
  const greeting = greetingForHour(input.hour);
  if (input.isRunning) {
    return `${greeting} Hermes şu anda bugünün fırsatlarını işliyor.`;
  }
  if (input.pendingDecisionCount > 0) {
    return `${greeting} Hermes bugünün fırsatlarını işledi — ${input.pendingDecisionCount} karar seni bekliyor.`;
  }
  return `${greeting} Hermes bugünün analizini tamamladı.`;
}

/**
 * The one compact sentence above Karar Merkezi (Scope 5). Answers "what
 * requires my attention?" before the founder reads anything else.
 */
export function computeTodayStatusSentence(pendingDecisionCount: number): string {
  if (pendingDecisionCount <= 0) {
    return "Her şey kontrol altında — şu anda senden karar bekleyen bir şey yok.";
  }
  return `Hermes ${pendingDecisionCount} karar hazırladı.`;
}
