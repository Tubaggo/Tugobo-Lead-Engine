import { NextResponse } from "next/server";
import { loadAcquisitionConfigFromEnv } from "@/app/lib/hermes-acquisition-config";
import {
  getAcquisitionTodayCounters,
  getActiveAcquisitionRun,
  getPendingAcquisitionCandidates,
  getRecentAcquisitionRuns,
} from "@/app/lib/hermes-acquisition-run-registry";

/**
 * Hermes Autonomous Acquisition — sanitized status read (Sprint C1 —
 * Scope 8/9). GET-only, no side effects.
 *
 * Serves two consumers:
 *  - Hermes Home / the V2 header (founder view): last-scan moments, today's
 *    counters, run summaries — all founder-safe Turkish already;
 *  - Developer Mode (Lead Import screen panel): config health, blocking
 *    notes, recent run audit events.
 *
 * Also carries `pendingCandidates` — the qualified leads awaiting client
 * pickup. The client merges them through the existing import dedupe path
 * (`useLeadImport.ingestExternalLeads`), where missions then form through
 * the existing monitor and still require founder approval.
 *
 * Never in this payload: the cron secret, any env NAME, an API key, or a
 * raw provider response. Limits appear as plain numbers only.
 */
export async function GET() {
  const config = loadAcquisitionConfigFromEnv(process.env);
  const now = Date.now();

  const recentRuns = getRecentAcquisitionRuns(5);
  const activeRun = getActiveAcquisitionRun(now);
  const lastFinishedRun = recentRuns.find((r) => r.completedAt !== null) ?? null;
  const lastCompletedScan =
    recentRuns.find((r) => !r.dryRun && (r.status === "completed" || r.status === "partial")) ?? null;

  return NextResponse.json({
    configOk: config.configErrors.length === 0,
    configNotes: config.configErrors,
    // Strict Target Market Allowlist fix — the Founder Home active-queue
    // filter reads this to decide whether strict market eligibility applies
    // (only ever gated ON for `tugobo-need`; `turkey`/`custom` keep their
    // existing broad behavior). This is the single client-visible bridge —
    // no second config system.
    regionScope: config.regionScope,
    enabled: config.policy.enabled,
    mode: config.policy.mode,
    dryRun: config.policy.dryRun,
    limits: {
      dailyLeadLimit: config.policy.dailyLeadLimit,
      dailyExternalRequestLimit: config.policy.dailyExternalRequestLimit,
      maxRegionsPerRun: config.policy.maxRegionsPerRun,
      maxResultsPerRegion: config.policy.maxResultsPerRegion,
      maxMissionCandidatesPerRun: config.policy.maxMissionCandidatesPerRun,
      minVerifiedOpportunityScore: config.policy.minVerifiedOpportunityScore,
    },
    regionCount: config.regions.length,
    enabledRegionCount: config.regions.filter((r) => r.enabled).length,
    running: activeRun !== null,
    activeRunStartedAt: activeRun?.startedAt ?? null,
    lastRunAt: lastFinishedRun?.completedAt ?? null,
    lastScanAt: lastCompletedScan?.completedAt ?? null,
    today: getAcquisitionTodayCounters(now),
    recentRuns,
    pendingCandidates: getPendingAcquisitionCandidates(now),
  });
}
