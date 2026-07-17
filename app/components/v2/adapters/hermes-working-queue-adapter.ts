import {
  explainOpportunity,
  firstSeenAt,
  isSameCalendarDay,
  type ExplainableLeadLike,
} from "./hermes-acquisition-explainability-adapter.ts";
import type { HermesDecisionItem, HermesDecisionType } from "./hermes-decision-queue-adapter.ts";

/**
 * Hermes Working Queue adapter (Founder Working Queue + Deal Workspace v1.0).
 *
 * "Bugünkü Çalışma Listesi" — the founder's single default view. It does
 * NOT recompute priority, does NOT re-run qualification, and does NOT
 * introduce a second decision/acquisition system. It composes exactly two
 * already-existing, already-tested outputs:
 *
 *   1. `HermesDecisionItem[]` (`hermes-decision-queue-adapter.ts`) — every
 *      old-or-new lead that genuinely needs a founder decision today
 *      (failed delivery, hot reply, demo pending, follow-up due, approval
 *      required, etc.). Order and copy are reused verbatim, unchanged.
 *   2. Fresh, qualified opportunities — leads whose `firstImportedAt`/
 *      `createdAt` falls on today (`firstSeenAt`/`isSameCalendarDay`, the
 *      exact same freshness definition "Hermes Bugün Bunları Buldu"
 *      already uses) and whose `explainOpportunity(lead).attentionLevel`
 *      is not `"waiting"` (i.e. Hermes would actually pick this one, not
 *      set it aside). A lead that already produced a decision item is
 *      never also shown as a fresh opportunity — one business, one row.
 *
 * A lead with neither a real decision nor today's freshness never appears
 * — this is what keeps old, inactive, seed/demo leads out of the founder's
 * default view. Nothing here invents a "new" label: `firstSeenAt` returns
 * `null` for every seed lead (they carry no `firstImportedAt`/`createdAt`
 * at all), so a seed lead can structurally never be marked fresh.
 *
 * Deliberately dependency-free (no "@/" imports, no React, no browser API)
 * so it runs under plain `node --test` — the same convention every v8
 * adapter in this codebase follows.
 */

export type WorkingQueueItemKind = "decision" | "fresh_opportunity";

export type WorkingQueueItem = {
  id: string;
  kind: WorkingQueueItemKind;
  missionId: string | null;
  leadId: string | null;
  /** Business/hotel name. */
  title: string;
  /** True only for a lead first seen (firstImportedAt/createdAt) today. */
  isNew: boolean;
  /** Why this item is in today's queue — one founder sentence. */
  whyInQueue: string;
  /** Current commercial stage, short label (e.g. "Onay Bekliyor", "Yeni Fırsat"). */
  commercialStageLabel: string;
  /** The single next founder decision, one sentence. */
  nextDecisionLabel: string;
  /** Last meaningful change moment, or null when nothing has happened yet. */
  lastMeaningfulChangeAt: number | null;
  /** True only when a real pipeline is actively `"running"` for this mission right now. */
  isHermesWorking: boolean;
  primaryActionLabel: string;
  secondaryActionLabel: string | null;
  /** Carries the original decision item through unchanged — only present for `kind: "decision"`, so the founder-mode Onayla/Reddet handlers stay exactly the ones Karar Merkezi already uses. */
  sourceDecisionItem: HermesDecisionItem | null;
};

/** Structural subset of `ScoredLead` this module reads — any real ScoredLead satisfies it automatically. */
export type WorkingQueueLeadLike = ExplainableLeadLike & {
  id: string;
};

export type WorkingQueueMissionLike = {
  missionId: string;
  leadId: string;
};

export type ComputeFounderWorkingQueueInput = {
  decisionItems: HermesDecisionItem[];
  /** The full scored lead pool — filtered internally to today's fresh, qualified opportunities. */
  leads: WorkingQueueLeadLike[];
  /** Every real mission — used only to resolve a fresh opportunity's missionId (every lead already has one via `buildHermesMissions`, even pre-approval) so the Working Queue card can open the Deal Workspace. */
  missions?: WorkingQueueMissionLike[];
  /** missionId -> true only when a real pipeline is `state: "running"` right now. */
  runningMissionIds?: ReadonlySet<string>;
  /** Injectable for tests; defaults to `Date.now()`. */
  now?: number;
};

const FRESH_OPPORTUNITY_LABEL = "Yeni Fırsat";
const FRESH_OPPORTUNITY_NEXT_DECISION = "Fırsatı incele — Hermes henüz bir görev başlatmadı.";
const FRESH_OPPORTUNITY_PRIMARY_ACTION = "İncele";

function decisionToWorkingQueueItem(
  item: HermesDecisionItem,
  runningMissionIds: ReadonlySet<string>,
): WorkingQueueItem {
  return {
    id: item.id,
    kind: "decision",
    missionId: item.missionId,
    leadId: item.leadId,
    title: item.title,
    isNew: false,
    whyInQueue: item.whatHappened,
    commercialStageLabel: item.statusLabel,
    nextDecisionLabel: item.founderDecisionLabel,
    lastMeaningfulChangeAt: item.lastActivityAt,
    isHermesWorking: item.missionId !== null && runningMissionIds.has(item.missionId),
    primaryActionLabel: item.primaryActionLabel,
    secondaryActionLabel: item.secondaryActionLabel,
    sourceDecisionItem: item,
  };
}

function freshOpportunityToWorkingQueueItem(
  lead: WorkingQueueLeadLike,
  seenAt: number,
  missionId: string | null,
): WorkingQueueItem {
  const explanation = explainOpportunity(lead);
  return {
    id: `working-queue:fresh:${lead.id}`,
    kind: "fresh_opportunity",
    missionId,
    leadId: lead.id,
    title: lead.name,
    isNew: true,
    whyInQueue: explanation.status,
    commercialStageLabel: FRESH_OPPORTUNITY_LABEL,
    nextDecisionLabel: FRESH_OPPORTUNITY_NEXT_DECISION,
    lastMeaningfulChangeAt: seenAt,
    isHermesWorking: false,
    primaryActionLabel: FRESH_OPPORTUNITY_PRIMARY_ACTION,
    secondaryActionLabel: null,
    sourceDecisionItem: null,
  };
}

/**
 * Decisions keep the exact order `computeHermesDecisionQueue` already
 * produced (critical → high → medium → low, newest-first within a tier) —
 * this module never re-ranks them. Fresh opportunities are appended after
 * every real decision (the sprint's "position 8": important, but never
 * more urgent than something the founder must actually decide today),
 * sorted newest-first among themselves.
 */
export function computeFounderWorkingQueue(input: ComputeFounderWorkingQueueInput): WorkingQueueItem[] {
  const now = input.now ?? Date.now();
  const runningMissionIds = input.runningMissionIds ?? new Set<string>();
  const missionIdByLeadId = new Map((input.missions ?? []).map((m) => [m.leadId, m.missionId]));

  const decisionLeadIds = new Set(
    input.decisionItems.map((item) => item.leadId).filter((id): id is string => id !== null),
  );

  const freshOpportunities = (input.leads ?? [])
    .filter((lead) => !decisionLeadIds.has(lead.id))
    .map((lead) => ({ lead, seenAt: firstSeenAt(lead) }))
    .filter((entry): entry is { lead: WorkingQueueLeadLike; seenAt: number } => entry.seenAt !== null)
    .filter((entry) => isSameCalendarDay(entry.seenAt, now))
    .filter((entry) => explainOpportunity(entry.lead).attentionLevel !== "waiting")
    .sort((a, b) => b.seenAt - a.seenAt)
    .map((entry) =>
      freshOpportunityToWorkingQueueItem(entry.lead, entry.seenAt, missionIdByLeadId.get(entry.lead.id) ?? null),
    );

  const decisions = input.decisionItems.map((item) => decisionToWorkingQueueItem(item, runningMissionIds));

  return [...decisions, ...freshOpportunities];
}

export type WorkingQueueSummary = {
  total: number;
  decisionCount: number;
  freshOpportunityCount: number;
};

export function summarizeFounderWorkingQueue(items: WorkingQueueItem[]): WorkingQueueSummary {
  return {
    total: items.length,
    decisionCount: items.filter((i) => i.kind === "decision").length,
    freshOpportunityCount: items.filter((i) => i.kind === "fresh_opportunity").length,
  };
}

/**
 * Founder Mode Deal Workspace fix — the Working Queue must only ever
 * *select* an opportunity (opening the Deal Workspace); the real decision
 * always happens there. `approve_message` is the one decisionType whose
 * primary/secondary labels ("Onayla"/"Reddet") are wired to a real mutation
 * (`onApproveMission`/`onRejectTask`) rather than a focus-only action — this
 * flags exactly that case so the queue's own renderer knows to route its
 * card/keyboard/button interactions to selection instead of mutation, and to
 * show "Fırsatı Aç" in place of the mutating labels. Every other
 * decisionType's primary action already only focuses the matching mission
 * (see `hermes-decision-queue-adapter.ts`), so this stays a single check.
 */
export function isDirectMutationDecisionType(decisionType: HermesDecisionType | null | undefined): boolean {
  return decisionType === "approve_message";
}
