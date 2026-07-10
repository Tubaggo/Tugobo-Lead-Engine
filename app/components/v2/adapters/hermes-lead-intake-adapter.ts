import type { ScoredLead } from "../../../lib/leads.ts";

/**
 * Hermes Lead Intake adapter (v8.1 — Hermes Autonomous Lead Intake).
 *
 * Pure presentation-layer aggregation over client state that already
 * exists: the scored lead pool (`useV2LeadPool`, itself seed leads +
 * `useLeadImport`'s imported leads), Hermes missions (`hermes-mission-adapter`),
 * and `useLeadImport`'s own import history/loading/error state. It computes
 * nothing new — every count here is a filter or lookup over fields those
 * runtimes already produce (`leadScore`/`opportunityScore`/
 * `verifiedOpportunityScore`, `lastEnrichedAt`, mission `stage`, import
 * history entries). No provider call, no import trigger, no scheduling.
 *
 * Deliberately avoids "@/"-aliased imports (only a relative, type-only
 * import of `ScoredLead`) and avoids importing `HermesMission` or
 * `ImportHistoryEntry` directly — both live behind aliased import chains.
 * Instead this module declares the same structural-subset convention
 * `founder-revenue-workspace-adapter.ts` already uses (`MissionLike`): any
 * real `HermesMission[]`/`ImportHistoryEntry[]` satisfies these types
 * automatically. This keeps the module runnable under plain `node --test`.
 */

export type HermesLeadIntakeMissionLike = {
  stage: string;
};

export type HermesLeadIntakeImportEntryLike = {
  added: number;
  importedAt: number;
};

export type HermesIntakeStatus = "idle" | "scanning" | "ready" | "needs_attention" | "error";

export type HermesLeadIntakeSummary = {
  evaluatedLeadCount: number;
  newOpportunityCount: number;
  activeMissionCount: number;
  approvalRequiredCount: number;
  enrichedLeadCount: number;
  importedTodayCount: number;
  lastImportAt: number | null;
  intakeStatus: HermesIntakeStatus;
  founderSummary: string;
  suggestedAction: string;
};

export type ComputeHermesLeadIntakeSummaryInput = {
  leads: ScoredLead[];
  missions: HermesLeadIntakeMissionLike[];
  /** Newest-first, matching `useLeadImport`'s own `importHistory` convention. */
  importHistory?: HermesLeadIntakeImportEntryLike[];
  /** `useLeadImport().loading` — an import fetch is in flight right now. */
  importInProgress?: boolean;
  /** `useLeadImport().error` — the last import attempt failed. */
  importError?: string | null;
  /** Injectable for tests; defaults to `Date.now()`. */
  now?: number;
};

/**
 * The "sales-ready" bar — reuses the exact threshold `computeTodayActionStatus`
 * (leads.ts) already applies for its `DEMO_READY`/`HOT_NOW` tiers. Not a new
 * scoring rule, just the existing bar read from a different angle: "how many
 * businesses Hermes evaluated are worth the founder's attention."
 */
const OPPORTUNITY_SCORE_THRESHOLD = 70;

export const HERMES_LEAD_INTAKE_BUTTON_LABELS = {
  reviewOpportunities: "Fırsatları İncele",
  // v8.4 — founder wording; the button still opens the Developer-only Lead
  // Import screen (enabling Developer Mode first, see below), the founder
  // just never reads the technical name.
  openDeveloperLeadImport: "Tarama Ekranını Aç",
} as const;

export type ResolvedDeveloperLeadImportNavigation = {
  shouldEnableDeveloperMode: boolean;
};

/**
 * v8.1.1 — the founder never manually flips Developer Mode to reach Lead
 * Import: clicking "Tarama Ekranını Aç" while Developer Mode is
 * OFF enables it first, then navigates, in the same click, so the founder
 * never feels the technical detail. Pure decision only — the actual
 * `onToggleDeveloperMode()`/`onNavigate("lead-import")` calls happen in
 * `AutomationCenterScreen.tsx`, which owns both callbacks already.
 */
export function resolveDeveloperLeadImportNavigation(
  developerMode: boolean,
): ResolvedDeveloperLeadImportNavigation {
  return { shouldEnableDeveloperMode: !developerMode };
}

/** Labels the founder-facing Lead Intake section must never show — manual/bulk/auto-send controls stay Developer-only. */
export const HERMES_LEAD_INTAKE_FORBIDDEN_BUTTON_LABELS = [
  "Import Başlat",
  "Toplu Import",
  "Otomatik Import",
  "Mesaj Gönder",
] as const;

function opportunityScoreOf(lead: ScoredLead): number {
  return lead.verifiedOpportunityScore ?? lead.opportunityScore ?? lead.leadScore ?? 0;
}

function isSameCalendarDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function buildFounderSummary(args: {
  intakeStatus: HermesIntakeStatus;
  evaluatedLeadCount: number;
  newOpportunityCount: number;
  activeMissionCount: number;
  approvalRequiredCount: number;
}): string {
  const { intakeStatus, evaluatedLeadCount, newOpportunityCount, activeMissionCount, approvalRequiredCount } = args;

  if (intakeStatus === "idle") {
    // v8.5 — exact RC-spec copy (Scope 3): "fırsat", not the English "lead".
    return "Hermes henüz yeni fırsat taraması başlatmadı.";
  }

  if (intakeStatus === "error") {
    // v8.5 — same fix as the idle branch above: "fırsat", not the English "lead".
    return "Son fırsat taramasında bir sorun oluştu — Hermes yeni işletme değerlendirmesini duraklattı.";
  }

  const parts: string[] = [`Hermes bugüne kadar ${evaluatedLeadCount} işletmeyi değerlendirdi.`];

  if (newOpportunityCount > 0) {
    parts.push(`${newOpportunityCount} yeni satışa uygun fırsat bulundu.`);
  }

  if (activeMissionCount > 0) {
    parts.push(`Hermes ${activeMissionCount} işletmeyi satış görevine dönüştürdü.`);
  }

  if (approvalRequiredCount > 0) {
    parts.push(`${approvalRequiredCount} karar senin onayını bekliyor.`);
  }

  return parts.join(" ");
}

function buildSuggestedAction(args: {
  intakeStatus: HermesIntakeStatus;
  approvalRequiredCount: number;
  newOpportunityCount: number;
}): string {
  switch (args.intakeStatus) {
    case "idle":
      return "Hermes'in taramaya başlaması için tarama ekranını açabilirsin.";
    case "scanning":
      return "Hermes yeni işletmeleri tarıyor — sonuçlar birazdan burada görünecek.";
    case "error":
      return "Tarama ekranını açıp son taramayı kontrol et.";
    case "needs_attention":
      return `${args.approvalRequiredCount} karar seni bekliyor — fırsatları incele.`;
    case "ready":
    default:
      return args.newOpportunityCount > 0
        ? "Satışa uygun yeni fırsatlar hazır — incelemeye başlayabilirsin."
        : "Şu anda bekleyen yeni fırsat yok.";
  }
}

export function computeHermesLeadIntakeSummary(
  input: ComputeHermesLeadIntakeSummaryInput,
): HermesLeadIntakeSummary {
  const now = input.now ?? Date.now();
  const leads = input.leads ?? [];
  const missions = input.missions ?? [];
  const importHistory = input.importHistory ?? [];

  const evaluatedLeadCount = leads.length;
  const newOpportunityCount = leads.filter((l) => opportunityScoreOf(l) >= OPPORTUNITY_SCORE_THRESHOLD).length;
  const enrichedLeadCount = leads.filter((l) => Boolean(l.lastEnrichedAt)).length;

  const activeMissionCount = missions.filter((m) => m.stage !== "completed").length;
  const approvalRequiredCount = missions.filter((m) => m.stage === "approval").length;

  const importedTodayCount = importHistory
    .filter((entry) => isSameCalendarDay(entry.importedAt, now))
    .reduce((sum, entry) => sum + entry.added, 0);

  const lastImportAt = importHistory.length > 0 ? importHistory[0].importedAt : null;

  const hasError = Boolean(input.importError && input.importError.trim().length > 0);

  let intakeStatus: HermesIntakeStatus;
  if (hasError) {
    intakeStatus = "error";
  } else if (input.importInProgress) {
    intakeStatus = "scanning";
  } else if (evaluatedLeadCount === 0 && lastImportAt === null) {
    intakeStatus = "idle";
  } else if (approvalRequiredCount > 0) {
    intakeStatus = "needs_attention";
  } else {
    intakeStatus = "ready";
  }

  return {
    evaluatedLeadCount,
    newOpportunityCount,
    activeMissionCount,
    approvalRequiredCount,
    enrichedLeadCount,
    importedTodayCount,
    lastImportAt,
    intakeStatus,
    founderSummary: buildFounderSummary({
      intakeStatus,
      evaluatedLeadCount,
      newOpportunityCount,
      activeMissionCount,
      approvalRequiredCount,
    }),
    suggestedAction: buildSuggestedAction({ intakeStatus, approvalRequiredCount, newOpportunityCount }),
  };
}
