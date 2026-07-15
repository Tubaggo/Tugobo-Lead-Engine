/**
 * Hermes Founder Narrative adapter (Founder Narrative Layer v1.0).
 *
 * Pure presentation-layer synthesis — turns runtime state four other
 * adapters already computed (`computeRevenueSummary`,
 * `computeHermesLeadIntakeSummary`, `computeHermesDecisionQueue`'s own
 * `.length`, and the two session-only `hermesPipelines`/`hermesDrafts`
 * Records V2Shell already maintains) into ONE operational briefing: what is
 * Hermes doing right now, what did it finish, what did it find, what does
 * it need from the founder. It computes nothing new — every number it reads
 * is a count another module already produced; this module only picks,
 * prioritizes, and phrases up to six short Turkish sentences from them.
 *
 * Deterministic by construction: no `Date.now()`, no randomness, no I/O, no
 * async, no AI/LLM call of any kind. Same input always produces the exact
 * same `FounderNarrative`.
 *
 * Deliberately dependency-free (no "@/" imports, no React, no browser API)
 * so it runs under plain `node --test` — the same convention every v8
 * adapter in this codebase follows. `*Like` input types are structural
 * subsets of `RevenueSummary`/`HermesLeadIntakeSummary` (both real objects
 * satisfy them automatically); this module never imports those adapters
 * directly to avoid pulling in their own transitive import chains.
 */

/** Structural subset of `founder-revenue-workspace-adapter.ts`'s `RevenueSummary`. */
export type FounderNarrativeRevenueSummaryLike = {
  replyReceivedCount: number;
  hotReplyCount: number;
  followUpRequiredCount: number;
  wonCount: number;
  lostCount: number;
};

/** Structural subset of `hermes-lead-intake-adapter.ts`'s `HermesLeadIntakeSummary`. */
export type FounderNarrativeIntakeSummaryLike = {
  evaluatedLeadCount: number;
  newOpportunityCount: number;
};

export type ComputeFounderNarrativeInput = {
  /** True only when a real `HermesPipeline.state === "running"` exists for at least one mission right now. */
  isRunning: boolean;
  /** `decisionItems.length` — the same number Karar Merkezi/the header badge/every other counter already derives from `mission.stage`. */
  pendingDecisionCount: number;
  /** Count of `hermesDrafts` entries — real Courier drafts Hermes has prepared, never a send. */
  draftsPreparedCount: number;
  revenueSummary: FounderNarrativeRevenueSummaryLike;
  intakeSummary: FounderNarrativeIntakeSummaryLike;
};

export type FounderNarrative = {
  /** Exactly one sentence — section 1, current operational status. */
  status: string;
  /** 0–2 sentences — section 2, work completed. */
  workCompleted: string[];
  /** 0–2 sentences — section 3, important findings. */
  findings: string[];
  /** Exactly one sentence — section 4, what the founder must do. */
  requiredAction: string;
};

/**
 * Section 1. Only two possible states: Hermes is actively mid-pipeline right
 * now, or it isn't. Never mentions a specific stage/agent here — that detail
 * belongs to the Mission Execution panel, not the daily narrative.
 */
function buildStatus(input: ComputeFounderNarrativeInput): string {
  return input.isRunning ? "Hermes şu anda çalışıyor." : "Hazırlığım tamam.";
}

/**
 * Section 2. Priority order (most operationally significant first), capped
 * to 2 so the whole narrative never exceeds its 6-sentence budget. A clause
 * is included only when its underlying count is greater than zero — nothing
 * is ever phrased as "0 of something."
 */
function buildWorkCompleted(input: ComputeFounderNarrativeInput): string[] {
  const candidates: string[] = [];
  const { evaluatedLeadCount, newOpportunityCount } = input.intakeSummary;

  if (evaluatedLeadCount > 0) {
    candidates.push(`Hermes bugüne kadar ${evaluatedLeadCount} işletmeyi değerlendirdi.`);
  }
  if (newOpportunityCount > 0) {
    candidates.push(`${newOpportunityCount} tanesi satış için uygun bulundu.`);
  }
  if (input.draftsPreparedCount > 0) {
    candidates.push(`${input.draftsPreparedCount} mesaj taslağı hazırladı.`);
  }

  return candidates.slice(0, 2);
}

/**
 * Section 3. Priority order: a hot reply outranks a generic reply (the two
 * never co-occur in the output — a hot reply already is a reply, so showing
 * both would repeat the same underlying event), then follow-up timing, then
 * a resolved sales outcome. Capped to 2 for the same budget reason as above.
 */
function buildFindings(input: ComputeFounderNarrativeInput): string[] {
  const candidates: string[] = [];
  const { replyReceivedCount, hotReplyCount, followUpRequiredCount, wonCount, lostCount } = input.revenueSummary;

  if (hotReplyCount > 0) {
    candidates.push(`${hotReplyCount} sıcak cevap geldi.`);
  } else if (replyReceivedCount > 0) {
    candidates.push(`${replyReceivedCount} işletmeden cevap geldi.`);
  }
  if (followUpRequiredCount > 0) {
    candidates.push(`${followUpRequiredCount} işletme için takip zamanı geldi.`);
  }
  if (wonCount > 0) {
    candidates.push(`${wonCount} satış kazanıldı.`);
  }
  if (lostCount > 0) {
    candidates.push(`${lostCount} satış kaybedildi.`);
  }

  return candidates.slice(0, 2);
}

/** Section 4. Always exactly one sentence — the founder never closes this without knowing whether anything is asked of them. */
function buildRequiredAction(input: ComputeFounderNarrativeInput): string {
  if (input.pendingDecisionCount > 0) {
    return `Bugün senden yalnızca ${input.pendingDecisionCount} karar bekliyorum.`;
  }
  return "Şimdilik senden herhangi bir işlem beklemiyorum.";
}

export function computeFounderNarrative(input: ComputeFounderNarrativeInput): FounderNarrative {
  return {
    status: buildStatus(input),
    workCompleted: buildWorkCompleted(input),
    findings: buildFindings(input),
    requiredAction: buildRequiredAction(input),
  };
}

/** Flattens a `FounderNarrative` into an ordered sentence list — status → workCompleted → findings → requiredAction, always 4–6 sentences total. Convenience for callers that just want to `.map()` and render, never re-orders or re-derives anything. */
export function founderNarrativeSentences(narrative: FounderNarrative): string[] {
  return [narrative.status, ...narrative.workCompleted, ...narrative.findings, narrative.requiredAction];
}
