import {
  ACQUISITION_BLOCKING_REASONS,
  buildAcquisitionAuditEvent,
  enforceAcquisitionBudget,
  evaluateAutonomousAcquisitionEligibility,
  selectNextAcquisitionRegions,
  summarizeAcquisitionRun,
  type AcquisitionAuditEvent,
  type AcquisitionRegion,
  type AcquisitionRunStatus,
  type AcquisitionTrigger,
} from "./hermes-autonomous-acquisition-policy.ts";
import type { AcquisitionConfig } from "./hermes-acquisition-config.ts";
import {
  finishAcquisitionRun,
  getAcquisitionTodayCounters,
  getActiveAcquisitionRun,
  getPendingAcquisitionCandidates,
  getRegionLastRunAt,
  hasSeenAcquisitionDedupeKey,
  markRegionsScanned,
  recordBlockedAcquisitionRun,
  registerAcquisitionCandidates,
  rememberAcquisitionDedupeKeys,
  startAcquisitionRun,
  type HermesAcquisitionRun,
} from "./hermes-acquisition-run-registry.ts";
import { leadDedupeKeysFor } from "./lead-dedupe.ts";
import {
  buildQualificationPreview,
  evaluateHermesQualification,
  type QualificationLeadLike,
  type QualificationPreview,
  type QualificationResult,
} from "./hermes-autonomous-qualification-runtime.ts";
import { deriveQualificationPolicy } from "./hermes-qualification-policy.ts";
import { recordQualificationResult } from "./hermes-qualification-registry.ts";
import {
  evaluateAutonomousOutreach,
  type OutreachLeadLike,
} from "./hermes-autonomous-outreach-runtime.ts";
import { deriveOutreachPolicy } from "./hermes-outreach-policy.ts";
import { recordOutreachDecision } from "./hermes-outreach-registry.ts";

/**
 * Hermes Autonomous Acquisition Runtime (Sprint C1 — Scope 4).
 *
 * The orchestrator that turns policy decisions into one controlled
 * acquisition pass:
 *
 *   policy/config → eligibility → lock/idempotency → budget → region
 *   selection → EXISTING import path (injected adapter around
 *   `discoverGooglePlacesLeads` + `enrichLeadsWithHomepageSignalsBatched`)
 *   → EXISTING dedupe keys (`lead-dedupe.ts`) → EXISTING scoring
 *   (`verifiedOpportunityScore`, already on the enriched leads) → capped
 *   mission-candidate handoff → run summary + audit events.
 *
 * What this module can NEVER do, structurally:
 *  - send a WhatsApp message (no messaging import exists here);
 *  - approve anything (candidates enter the pool exactly like a manual
 *    import; missions then form through the existing client-side monitor
 *    and still require the founder's decision in Karar Merkezi);
 *  - call a provider directly (all external I/O lives behind the injected
 *    `importAdapter`, and a dry run never invokes it).
 *
 * The import adapter is dependency-injected so this module stays
 * node-testable; the production wiring is
 * `hermes-acquisition-server-adapter.ts`, used only by the run route.
 */

/** Structural subset of ScoredLead the orchestrator reads — the full object flows through untouched. */
export type AcquisitionDiscoveredLead = {
  id: string;
  name: string;
  city: string;
  phone?: string;
  website?: string;
  leadScore?: number;
  opportunityScore?: number;
  verifiedOpportunityScore?: number;
} & Record<string, unknown>;

export type AcquisitionImportAdapterResult =
  | { ok: true; leads: AcquisitionDiscoveredLead[]; externalRequestCount: number }
  | { ok: false; kind: "rate_limit" | "provider_error"; externalRequestCount: number };

export type AcquisitionImportAdapter = (input: {
  region: AcquisitionRegion;
  maxResults: number;
}) => Promise<AcquisitionImportAdapterResult>;

export type RunAcquisitionInput = {
  trigger: AcquisitionTrigger;
  config: AcquisitionConfig;
  /** Production: `hermesAcquisitionServerImportAdapter`. Tests: a fake. Never invoked on a dry run. */
  importAdapter?: AcquisitionImportAdapter;
  /** A client may only ever force dry-run ON — never off. */
  forceDryRun?: boolean;
  /** Cron/webhook retry protection; derived from trigger + time window when absent. */
  idempotencyKey?: string;
  now?: number;
};

export type RunAcquisitionResult = {
  status: AcquisitionRunStatus;
  runId: string | null;
  dryRun: boolean;
  /** City names only — safe for the founder/developer panel, no query text, no key. */
  selectedRegionsSafe: string[];
  blockingReasons: string[];
  summaryTr: string;
  evaluatedCount: number;
  importedCount: number;
  duplicateCount: number;
  qualifiedCount: number;
  missionCandidateCount: number;
  missionCreatedCount: number;
  /** Real (non-dry) runs: requests actually made. Dry runs: requests that WOULD have been made — never a real call. */
  externalRequestCount: number;
  /** Sprint C2 — qualification aşamasının run düzeyi sayaçları. */
  qualificationEvaluatedCount: number;
  salesReadyCount: number;
  reviewRequiredCount: number;
  dataNeededCount: number;
  watchCount: number;
  notQualifiedCount: number;
  qualificationBlockedCount: number;
  /**
   * Founder-safe qualification önizlemesi. Gerçek run'da bu run'ın
   * değerlendirmelerinden; dry-run'da (dış çağrı yasak olduğundan) teslim
   * bekleyen mevcut aday havuzundan üretilir — her iki yolda da sıfır mutation.
   */
  qualificationPreview: QualificationPreview | null;
  /**
   * Refresh Persistence Recovery fix — the exact candidate leads registered
   * for THIS run (same objects handed to `registerAcquisitionCandidates`,
   * never re-fetched or re-normalized). Lets the client persist them
   * immediately via the existing `ingestExternalLeads` path instead of
   * waiting on a second `/status` round trip. Always `[]` for a dry run, a
   * blocked run, or a run where nothing qualified — never fabricated.
   */
  candidateLeads: AcquisitionDiscoveredLead[];
};

function hourWindow(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}-${d.getHours()}`;
}

function defaultIdempotencyKey(trigger: AcquisitionTrigger, now: number): string {
  if (trigger === "scheduled") return `scheduled|${hourWindow(now)}`;
  // Manual/developer double-click protection: one real run per 2-minute window.
  return `${trigger}|${Math.floor(now / (2 * 60 * 1000))}`;
}

function toResult(
  run: HermesAcquisitionRun,
  qualificationPreview: QualificationPreview | null = null,
  candidateLeads: AcquisitionDiscoveredLead[] = [],
): RunAcquisitionResult {
  return {
    status: run.status,
    runId: run.id,
    dryRun: run.dryRun,
    selectedRegionsSafe: run.selectedRegionsSafe,
    blockingReasons: run.blockingReasons,
    summaryTr: run.summaryTr,
    evaluatedCount: run.evaluatedCount,
    importedCount: run.importedCount,
    duplicateCount: run.duplicateCount,
    qualifiedCount: run.qualifiedCount,
    missionCandidateCount: run.missionCandidateCount,
    missionCreatedCount: run.missionCreatedCount,
    externalRequestCount: run.externalRequestCount,
    qualificationEvaluatedCount: run.qualificationEvaluatedCount,
    salesReadyCount: run.salesReadyCount,
    reviewRequiredCount: run.reviewRequiredCount,
    dataNeededCount: run.dataNeededCount,
    watchCount: run.watchCount,
    notQualifiedCount: run.notQualifiedCount,
    qualificationBlockedCount: run.qualificationBlockedCount,
    qualificationPreview,
    candidateLeads,
  };
}

type QualificationStageCounters = {
  evaluated: number;
  salesReady: number;
  reviewRequired: number;
  dataNeeded: number;
  watch: number;
  notQualified: number;
  blocked: number;
};

function emptyQualificationCounters(): QualificationStageCounters {
  return {
    evaluated: 0,
    salesReady: 0,
    reviewRequired: 0,
    dataNeeded: 0,
    watch: 0,
    notQualified: 0,
    blocked: 0,
  };
}

function countQualification(counters: QualificationStageCounters, result: QualificationResult): void {
  counters.evaluated += 1;
  if (result.status === "sales_ready") counters.salesReady += 1;
  else if (result.status === "review_required") counters.reviewRequired += 1;
  else if (result.status === "data_needed") counters.dataNeeded += 1;
  else if (result.status === "watch") counters.watch += 1;
  else if (result.status === "not_qualified") counters.notQualified += 1;
  else counters.blocked += 1;
}

export async function runHermesAutonomousAcquisition(
  input: RunAcquisitionInput,
): Promise<RunAcquisitionResult> {
  const now = input.now ?? Date.now();
  const { policy, configErrors } = input.config;
  const dryRun = policy.dryRun || input.forceDryRun === true;

  const audit: AcquisitionAuditEvent[] = [
    buildAcquisitionAuditEvent({
      type: "hermes_acquisition_run_requested",
      at: now,
      detailTr: `Tarama isteği alındı (${input.trigger}).`,
    }),
  ];

  // Regions carry their real last-run moments from the registry.
  const regions = input.config.regions.map((r) => ({
    ...r,
    lastRunAt: getRegionLastRunAt(r.id),
  }));

  const counters = getAcquisitionTodayCounters(now);
  const eligibility = evaluateAutonomousAcquisitionEligibility({
    policy,
    configErrors,
    trigger: input.trigger,
    hasActiveRun: getActiveAcquisitionRun(now) !== null,
    counters,
    enabledRegionCount: regions.filter((r) => r.enabled).length,
  });

  const blockRun = (reasons: string[]): RunAcquisitionResult => {
    const summaryTr = summarizeAcquisitionRun({
      status: "blocked",
      dryRun,
      regionCities: [],
      evaluatedCount: 0,
      importedCount: 0,
      duplicateCount: 0,
      qualifiedCount: 0,
      missionCandidateCount: 0,
      blockingReasons: reasons,
    });
    const run = recordBlockedAcquisitionRun({
      trigger: input.trigger,
      mode: policy.mode,
      dryRun,
      blockingReasons: reasons,
      summaryTr,
      auditEvents: [
        ...audit,
        buildAcquisitionAuditEvent({
          type: "hermes_acquisition_run_blocked",
          at: now,
          detailTr: reasons.join(" "),
        }),
      ],
      now,
    });
    return toResult(run);
  };

  if (!eligibility.eligible) {
    return blockRun(eligibility.blockingReasons);
  }

  const selectedRegions = selectNextAcquisitionRegions({ policy, regions, now });
  if (selectedRegions.length === 0) {
    return blockRun([ACQUISITION_BLOCKING_REASONS.noEligibleRegion]);
  }

  const budget = enforceAcquisitionBudget({
    policy,
    counters,
    selectedRegionCount: selectedRegions.length,
  });
  if (!budget.allowed) {
    return blockRun(budget.blockingReasons);
  }

  const started = startAcquisitionRun({
    trigger: input.trigger,
    mode: policy.mode,
    dryRun,
    selectedRegionsSafe: selectedRegions.map((r) => r.city),
    idempotencyKey: input.idempotencyKey ?? defaultIdempotencyKey(input.trigger, now),
    now,
  });
  if (!started.ok) {
    const reason =
      started.reason === "active_run"
        ? ACQUISITION_BLOCKING_REASONS.activeRun
        : ACQUISITION_BLOCKING_REASONS.duplicateRun;
    return blockRun([reason]);
  }
  const run = started.run;
  const regionCities = selectedRegions.map((r) => r.city);

  /* ── dry run: plan only, zero external calls, zero mutation ── */
  if (dryRun) {
    const plannedPerRegion = selectedRegions.map((r) =>
      Math.min(r.maxResultsPerRun, budget.maxResultsPerRegion),
    );
    const plannedEvaluations = plannedPerRegion.reduce((s, n) => s + n, 0);
    const plannedCandidates = Math.min(
      budget.maxMissionCandidates,
      budget.remainingLeadBudget,
      plannedEvaluations,
    );
    // Planned, not real: 1 text search per region + 1 detail fetch per
    // planned evaluation, capped at today's remaining request budget so a
    // preview can never claim more than a real run would be allowed to
    // spend. Zero external calls are made to produce this number.
    const plannedExternalRequestCount = Math.min(
      selectedRegions.length + plannedEvaluations,
      budget.remainingRequestBudget,
    );

    // Sprint C2 — qualification önizlemesi: dry-run dış çağrı yapamayacağı
    // için yeni işletme değerlendiremez; teslim bekleyen GERÇEK aday havuzu
    // sıfır mutation ile değerlendirilir (registry'ye kayıt yok, mission yok).
    const qualPolicy = deriveQualificationPolicy(policy);
    const qualCounters = emptyQualificationCounters();
    const previewInputs: { result: QualificationResult; businessName: string }[] = [];
    for (const batch of getPendingAcquisitionCandidates(now)) {
      for (const lead of batch.leads) {
        try {
          const result = evaluateHermesQualification({
            // Gerçek ScoredLead objeleri — yapısal alt kümeye güvenli daraltma.
            lead: lead as QualificationLeadLike,
            existingMissionId: null,
            acquisitionRunId: run.id,
            policy: qualPolicy,
            currentTime: now,
          });
          countQualification(qualCounters, result);
          previewInputs.push({ result, businessName: lead.name });
        } catch {
          qualCounters.evaluated += 1;
          qualCounters.blocked += 1;
        }
      }
    }
    const qualificationPreview = buildQualificationPreview(previewInputs);

    const summaryTr = summarizeAcquisitionRun({
      status: "completed",
      dryRun: true,
      regionCities,
      evaluatedCount: plannedEvaluations,
      importedCount: 0,
      duplicateCount: 0,
      qualifiedCount: 0,
      missionCandidateCount: plannedCandidates,
      blockingReasons: [],
    });
    const finished = finishAcquisitionRun(
      run.id,
      {
        status: "completed",
        evaluatedCount: plannedEvaluations,
        missionCandidateCount: plannedCandidates,
        externalRequestCount: plannedExternalRequestCount,
        qualificationEvaluatedCount: qualCounters.evaluated,
        salesReadyCount: qualCounters.salesReady,
        reviewRequiredCount: qualCounters.reviewRequired,
        dataNeededCount: qualCounters.dataNeeded,
        watchCount: qualCounters.watch,
        notQualifiedCount: qualCounters.notQualified,
        qualificationBlockedCount: qualCounters.blocked,
        summaryTr,
        auditEvents: [
          ...audit,
          buildAcquisitionAuditEvent({
            type: "hermes_acquisition_dry_run_completed",
            at: now,
            detailTr: `Önizleme tamamlandı: ${regionCities.join(", ")} için en fazla ${plannedEvaluations} işletme, ${plannedCandidates} satış işi adayı planlandı.`,
          }),
        ],
      },
      now,
    );
    return toResult(finished!, qualificationPreview);
  }

  /* ── real safe run ──────────────────────────────────────────── */
  if (!input.importAdapter) {
    const finished = finishAcquisitionRun(
      run.id,
      {
        status: "failed",
        safeErrors: ["Tarama bağlantısı hazır değil."],
        summaryTr: summarizeAcquisitionRun({
          status: "failed",
          dryRun: false,
          regionCities,
          evaluatedCount: 0,
          importedCount: 0,
          duplicateCount: 0,
          qualifiedCount: 0,
          missionCandidateCount: 0,
          blockingReasons: [],
        }),
        auditEvents: [
          ...audit,
          buildAcquisitionAuditEvent({
            type: "hermes_acquisition_run_failed",
            at: now,
            detailTr: "Tarama bağlantısı hazır olmadığı için çalıştırma durduruldu.",
          }),
        ],
      },
      now,
    );
    return toResult(finished!);
  }

  audit.push(
    buildAcquisitionAuditEvent({
      type: "hermes_acquisition_run_started",
      at: now,
      detailTr: `Tarama başladı: ${regionCities.join(", ")}.`,
    }),
  );

  let evaluatedCount = 0;
  let importedCount = 0;
  let duplicateCount = 0;
  let enrichedCount = 0;
  let qualifiedCount = 0;
  let missionCandidateCount = 0;
  let externalRequestCount = 0;
  const safeErrors: string[] = [];
  let hitProviderTrouble = false;
  let stoppedEarly = false;
  // Sprint C2 — qualification aşaması: tek bir lead'in değerlendirme hatası
  // tüm taramayı asla düşürmez (partial sonuç).
  const qualPolicy = deriveQualificationPolicy(policy);
  // Sprint C3 — Autonomous Outreach: sales_ready + güvenilir kanal olan her
  // aday için mesaj HAZIRLIĞI (gönderim değil) üretilir ve outreach registry'ye
  // yazılır. Founder onayı zorunludur; bu modül hiçbir mesaj göndermez.
  const outreachPolicy = deriveOutreachPolicy(policy);
  const qualCounters = emptyQualificationCounters();
  const qualPreviewInputs: { result: QualificationResult; businessName: string }[] = [];
  let qualificationTrouble = false;

  let remainingRequestBudget = budget.remainingRequestBudget;
  let remainingLeadBudget = budget.remainingLeadBudget;
  let remainingCandidateBudget = budget.maxMissionCandidates;
  const seenThisRun = new Set<string>();
  // Refresh Persistence Recovery fix — the exact objects handed to
  // `registerAcquisitionCandidates` below, accumulated across every region,
  // so the caller can return them verbatim in `RunAcquisitionResult` without
  // a second read of the registry or any re-normalization.
  const runCandidateLeads: AcquisitionDiscoveredLead[] = [];

  try {
    for (const region of selectedRegions) {
      // A region scan costs at least 1 text search + 1 detail request per
      // result — never start a region the remaining budget can't cover.
      const maxResults = Math.min(
        region.maxResultsPerRun,
        budget.maxResultsPerRegion,
        Math.max(0, remainingRequestBudget - 1),
      );
      if (maxResults <= 0 || remainingLeadBudget <= 0 || remainingCandidateBudget <= 0) {
        stoppedEarly = true;
        break;
      }

      audit.push(
        buildAcquisitionAuditEvent({
          type: "hermes_acquisition_region_selected",
          at: now,
          detailTr: `Bölge seçildi: ${region.city} (${region.leadType}).`,
        }),
      );

      const result = await input.importAdapter({ region, maxResults });
      externalRequestCount += result.externalRequestCount;
      remainingRequestBudget = Math.max(0, remainingRequestBudget - result.externalRequestCount);
      markRegionsScanned([region.id], now);

      if (!result.ok) {
        hitProviderTrouble = true;
        safeErrors.push(
          result.kind === "rate_limit"
            ? `${region.city}: dış kaynak kısa süreli limit bildirdi, tarama duraklatıldı.`
            : `${region.city}: dış kaynak yanıt vermedi, bölge atlandı.`,
        );
        if (result.kind === "rate_limit") break;
        continue;
      }

      evaluatedCount += result.leads.length;
      enrichedCount += result.leads.length;
      audit.push(
        buildAcquisitionAuditEvent({
          type: "hermes_acquisition_leads_discovered",
          at: now,
          detailTr: `${region.city}: ${result.leads.length} işletme değerlendirildi.`,
        }),
      );

      const fresh: AcquisitionDiscoveredLead[] = [];
      let regionDuplicates = 0;
      for (const lead of result.leads) {
        const keys = leadDedupeKeysFor(lead);
        const intraRunDuplicate = keys.some((k) => seenThisRun.has(k));
        if (intraRunDuplicate || hasSeenAcquisitionDedupeKey(keys)) {
          regionDuplicates += 1;
          continue;
        }
        for (const k of keys) seenThisRun.add(k);
        fresh.push(lead);
      }
      duplicateCount += regionDuplicates;
      if (regionDuplicates > 0) {
        audit.push(
          buildAcquisitionAuditEvent({
            type: "hermes_acquisition_duplicates_skipped",
            at: now,
            detailTr: `${region.city}: ${regionDuplicates} işletme zaten bilindiği için atlandı.`,
          }),
        );
      }

      // Sprint C2 — Autonomous Qualification: mission adaylığı artık tek
      // açıklanabilir qualification kararı üzerinden. Her sonuç registry'ye
      // yazılır (founder görünümleri oradan okur); yalnız `eligibleForMission`
      // olanlar mevcut capped mission yoluna devam eder.
      const qualified: AcquisitionDiscoveredLead[] = [];
      for (const lead of fresh) {
        try {
          const result = evaluateHermesQualification({
            lead: lead as QualificationLeadLike,
            existingMissionId: null,
            acquisitionRunId: run.id,
            policy: qualPolicy,
            currentTime: now,
          });
          countQualification(qualCounters, result);
          recordQualificationResult({ result, businessName: lead.name, now });
          qualPreviewInputs.push({ result, businessName: lead.name });
          if (result.eligibleForMission) qualified.push(lead);
          // Sprint C3 — outreach hazırlığı: yalnız taslağa uygun (sales_ready +
          // güvenilir kanal) adaylar için. Hata bir lead'i düşürür, run'ı asla.
          if (result.eligibleForOutreachDraft) {
            try {
              const outreach = evaluateAutonomousOutreach({
                qualification: result,
                lead: lead as OutreachLeadLike,
                mission: null,
                existingDraft: false,
                acquisitionRunId: run.id,
                policy: outreachPolicy,
                currentTime: now,
              });
              recordOutreachDecision({ decision: outreach, businessName: lead.name, now });
            } catch {
              qualificationTrouble = true;
            }
          }
        } catch {
          qualCounters.evaluated += 1;
          qualCounters.blocked += 1;
          qualificationTrouble = true;
          if (!safeErrors.includes("Bir işletmenin ticari değerlendirmesi tamamlanamadı.")) {
            safeErrors.push("Bir işletmenin ticari değerlendirmesi tamamlanamadı.");
          }
        }
      }
      qualifiedCount += qualified.length;
      if (qualified.length > 0) {
        audit.push(
          buildAcquisitionAuditEvent({
            type: "hermes_acquisition_candidates_qualified",
            at: now,
            detailTr: `${region.city}: ${qualified.length} işletme satışa hazır bulundu — founder onayı bekliyor.`,
          }),
        );
      }

      const handoffCap = Math.min(remainingCandidateBudget, remainingLeadBudget);
      const candidates = qualified.slice(0, Math.max(0, handoffCap));
      if (candidates.length > 0) {
        registerAcquisitionCandidates(run.id, candidates, now);
        runCandidateLeads.push(...candidates);
        for (const c of candidates) rememberAcquisitionDedupeKeys(leadDedupeKeysFor(c));
        importedCount += candidates.length;
        missionCandidateCount += candidates.length;
        remainingLeadBudget -= candidates.length;
        remainingCandidateBudget -= candidates.length;
        audit.push(
          buildAcquisitionAuditEvent({
            type: "hermes_acquisition_missions_created",
            at: now,
            detailTr: `${region.city}: ${candidates.length} satış işi adayı oluşturuldu — founder onayı bekliyor.`,
          }),
        );
      }
      if (qualified.length > candidates.length) stoppedEarly = true;
    }
  } catch {
    // A crash inside the loop must never leave the lock held or the run
    // half-open — the run is finalized as failed with a safe error only.
    const finished = finishAcquisitionRun(
      run.id,
      {
        status: "failed",
        evaluatedCount,
        importedCount,
        duplicateCount,
        enrichedCount,
        qualifiedCount,
        missionCandidateCount,
        missionCreatedCount: missionCandidateCount,
        externalRequestCount,
        qualificationEvaluatedCount: qualCounters.evaluated,
        salesReadyCount: qualCounters.salesReady,
        reviewRequiredCount: qualCounters.reviewRequired,
        dataNeededCount: qualCounters.dataNeeded,
        watchCount: qualCounters.watch,
        notQualifiedCount: qualCounters.notQualified,
        qualificationBlockedCount: qualCounters.blocked,
        safeErrors: [...safeErrors, "Tarama sırasında beklenmeyen bir sorun oluştu."],
        summaryTr: summarizeAcquisitionRun({
          status: "failed",
          dryRun: false,
          regionCities,
          evaluatedCount,
          importedCount,
          duplicateCount,
          qualifiedCount,
          missionCandidateCount,
          blockingReasons: [],
        }),
        auditEvents: [
          ...audit,
          buildAcquisitionAuditEvent({
            type: "hermes_acquisition_run_failed",
            at: now,
            detailTr: "Tarama beklenmeyen bir sorunla karşılaştı ve güvenli şekilde durduruldu.",
          }),
        ],
      },
      now,
    );
    // A mid-loop crash still leaves any already-registered candidates real
    // and reachable — reporting them here lets the client persist whatever
    // genuinely succeeded before the failure, same as the registry already does.
    return toResult(finished!, null, runCandidateLeads);
  }

  const status: AcquisitionRunStatus =
    hitProviderTrouble || stoppedEarly || qualificationTrouble ? "partial" : "completed";
  const skippedCount = Math.max(0, evaluatedCount - importedCount - duplicateCount);

  audit.push(
    buildAcquisitionAuditEvent({
      type: status === "partial" ? "hermes_acquisition_run_partial" : "hermes_acquisition_run_completed",
      at: now,
      detailTr:
        status === "partial"
          ? "Tarama limitler veya dış kaynak nedeniyle kısmen tamamlandı."
          : "Tarama tamamlandı.",
    }),
  );

  const finished = finishAcquisitionRun(
    run.id,
    {
      status,
      evaluatedCount,
      importedCount,
      duplicateCount,
      enrichedCount,
      qualifiedCount,
      missionCandidateCount,
      // Candidates become missions through the existing client-side mission
      // path and each still requires the founder's approval — this counter
      // reports how many were handed to that path, never an auto-approval.
      missionCreatedCount: missionCandidateCount,
      skippedCount,
      externalRequestCount,
      qualificationEvaluatedCount: qualCounters.evaluated,
      salesReadyCount: qualCounters.salesReady,
      reviewRequiredCount: qualCounters.reviewRequired,
      dataNeededCount: qualCounters.dataNeeded,
      watchCount: qualCounters.watch,
      notQualifiedCount: qualCounters.notQualified,
      qualificationBlockedCount: qualCounters.blocked,
      safeErrors,
      summaryTr: summarizeAcquisitionRun({
        status,
        dryRun: false,
        regionCities,
        evaluatedCount,
        importedCount,
        duplicateCount,
        qualifiedCount,
        missionCandidateCount,
        blockingReasons: [],
      }),
      auditEvents: audit,
    },
    now,
  );
  return toResult(finished!, buildQualificationPreview(qualPreviewInputs), runCandidateLeads);
}
