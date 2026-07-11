/**
 * Hermes Acquisition Founder adapter (Sprint C1 — Scope 8/9).
 *
 * Pure presentation-layer projection: turns the sanitized
 * `/api/hermes/acquisition/status` payload into the founder copy the
 * "Hermes Fırsat Keşfi" section and the V2 header read. Computes nothing
 * new — every line is a count, timestamp, or Turkish summary the run
 * registry already produced.
 *
 * Founder-language contract: no technical vocabulary
 * (`FOUNDER_FORBIDDEN_TERMS` — no "mission", no "dry run", no "provider",
 * no env name), no raw errors, no request-count tables. The release-audit
 * test asserts this over every string this module can emit.
 *
 * Deliberately dependency-free (no "@/" imports, no React, no browser API)
 * so it runs under plain `node --test` — the same convention every v8
 * adapter follows.
 */

/** Structural subset of the status route payload — only what the founder view reads. */
export type AcquisitionStatusLike = {
  configOk: boolean;
  enabled: boolean;
  dryRun: boolean;
  running: boolean;
  lastScanAt: number | null;
  today: {
    evaluatedToday: number;
    importedToday: number;
    duplicatesToday: number;
    missionCandidatesToday: number;
    runsToday: number;
  };
  /** `summaryTr` of the newest finished run, when one exists. */
  lastRunSummaryTr?: string | null;
  /** Founder-safe blocking reasons of the newest run, when it was blocked. */
  lastRunBlockingReasons?: string[];
};

export type HermesAcquisitionFounderView = {
  /** One-line operational status — the section's headline sentence. */
  statusLineTr: string;
  /** Supporting facts, already founder-safe; may be empty. */
  detailLinesTr: string[];
  lastScanAt: number | null;
  /** True when the configuration needs a human look — renders "Kontrol Gerekli", never the technical note. */
  needsAttention: boolean;
  counters: {
    evaluatedToday: number;
    newOpportunitiesToday: number;
    salesJobsWaiting: number;
    duplicatesSkippedToday: number;
  };
};

export const HERMES_ACQUISITION_FOUNDER_LABELS = {
  sectionCounters: {
    evaluated: "Bugün Değerlendirilen",
    newOpportunities: "Yeni Fırsat",
    salesJobs: "Satış İşi",
    duplicates: "Atlanan (Zaten Listede)",
  },
  lastScan: "Son Tarama",
  neverScanned: "Henüz yok",
  scanning: "Hermes fırsatları tarıyor.",
  notEnabled: "Fırsat taraması henüz etkin değil.",
  needsAttention: "Tarama yapılandırması kontrol gerektiriyor.",
  readyForScheduled: "Hermes planlı taramalara hazır — yeni fırsatlar bulundukça burada görünecek.",
} as const;

export function computeHermesAcquisitionFounderView(
  status: AcquisitionStatusLike | null,
): HermesAcquisitionFounderView {
  const empty: HermesAcquisitionFounderView = {
    statusLineTr: HERMES_ACQUISITION_FOUNDER_LABELS.notEnabled,
    detailLinesTr: [],
    lastScanAt: null,
    needsAttention: false,
    counters: {
      evaluatedToday: 0,
      newOpportunitiesToday: 0,
      salesJobsWaiting: 0,
      duplicatesSkippedToday: 0,
    },
  };
  if (!status) return empty;

  const counters = {
    evaluatedToday: status.today.evaluatedToday,
    newOpportunitiesToday: status.today.importedToday,
    salesJobsWaiting: status.today.missionCandidatesToday,
    duplicatesSkippedToday: status.today.duplicatesToday,
  };

  let statusLineTr: string;
  const detailLinesTr: string[] = [];

  if (!status.configOk) {
    statusLineTr = HERMES_ACQUISITION_FOUNDER_LABELS.needsAttention;
  } else if (status.running) {
    statusLineTr = HERMES_ACQUISITION_FOUNDER_LABELS.scanning;
  } else if (!status.enabled) {
    statusLineTr = HERMES_ACQUISITION_FOUNDER_LABELS.notEnabled;
  } else if (status.today.evaluatedToday > 0) {
    statusLineTr = `Hermes bugün ${status.today.evaluatedToday} işletmeyi değerlendirdi.`;
    if (status.today.importedToday > 0) {
      detailLinesTr.push(`${status.today.importedToday} yeni fırsat bulundu.`);
    }
    if (status.today.missionCandidatesToday > 0) {
      detailLinesTr.push(`${status.today.missionCandidatesToday} satış işi kararını bekliyor.`);
    }
    if (status.today.duplicatesToday > 0) {
      detailLinesTr.push(
        `${status.today.duplicatesToday} işletme zaten listede olduğu için atlandı.`,
      );
    }
  } else if (status.lastRunBlockingReasons && status.lastRunBlockingReasons.length > 0) {
    // Blocked runs carry founder-safe copy already (the policy module wrote it).
    statusLineTr = status.lastRunBlockingReasons[0];
  } else if (status.lastRunSummaryTr && status.lastRunSummaryTr.trim()) {
    statusLineTr = status.lastRunSummaryTr;
  } else {
    statusLineTr = HERMES_ACQUISITION_FOUNDER_LABELS.readyForScheduled;
  }

  return {
    statusLineTr,
    detailLinesTr,
    lastScanAt: status.lastScanAt,
    needsAttention: !status.configOk,
    counters,
  };
}
