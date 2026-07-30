/**
 * Derived lead preparation assessment.
 *
 * v3.8.2 — Hermes Guided Lead Preparation.
 *
 * Discovery found no "preparation" concept anywhere in this codebase — a
 * founder had to cross-reference ICP badges, website-intelligence flags, a
 * Contact Finder badge, and the message editor's own stale-draft banner by
 * eye to answer "is this lead actually ready?". This module is the single
 * answer, computed fresh on every read from state that already exists:
 *
 *   canonical lead (roster) + evidence pack (`outreach/evidence.ts`,
 *   unmodified) + message workspace (`outreach/workspace.ts`, unmodified)
 *
 * There is deliberately no durable `LeadPreparation` record anywhere in
 * `hermes-runtime.json`. Every input is already persisted by its own
 * canonical owner; a second durable copy here would be exactly the
 * duplication risk the v3.8.2 discovery was run to avoid. See that
 * discovery's §15 for the full "derived vs durable" comparison.
 *
 * This module answers "is this lead ready", not "what should the message
 * say" — it never builds copy, never calls a provider, and never writes
 * anything. It only reads.
 *
 * Pure: no React, no I/O, no `server-only`.
 */

import {
  buildPersonalizationEvidence,
  computeEvidenceFingerprint,
  type EvidenceWebsiteIntelligence,
} from "../outreach/evidence.ts";
import { isStaleCopyDraft } from "../outreach/workspace.ts";
import type { LeadMessageWorkspaceState, PersistedOutreachDraft } from "../outreach/workspace.ts";

/* -------------------------------------------------------------------------- */
/* founder-facing statuses                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The five ways a lead's readiness reads to the founder, in the exact
 * vocabulary the sprint asked for. Every value is reachable from real,
 * already-persisted state — none of these is a status this module invents.
 */
export type LeadPreparationStatus =
  | "review_required"
  | "needs_channel"
  | "needs_research"
  | "needs_draft"
  | "draft_stale"
  | "ready";

export const LEAD_PREPARATION_STATUS_LABELS_TR: Record<LeadPreparationStatus, string> = {
  review_required: "İnceleme Gerekiyor",
  needs_channel: "Kanal Gerekiyor",
  needs_research: "Araştırma Gerekiyor",
  needs_draft: "Taslak Gerekiyor",
  draft_stale: "Taslak Eski",
  ready: "Hazır",
};

/* -------------------------------------------------------------------------- */
/* blockers                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Grounded in code, not invented. Each of these is a real, observable
 * condition this module can compute from persisted state — no `ICP_TOO_LOW`,
 * no `CHANNEL_MISMATCH`, no coded staleness-age threshold, because none of
 * those exist anywhere in the codebase to derive from (see the v3.8.2
 * discovery, §13).
 */
export type LeadPreparationBlockerCode =
  | "NO_VERIFIED_WHATSAPP"
  | "NO_USABLE_EVIDENCE"
  | "NO_CURRENT_DRAFT"
  | "DRAFT_VERSION_STALE"
  | "DRAFT_EVIDENCE_STALE";

export type LeadPreparationRepairAction =
  | "REENRICH"
  | "GENERATE_DRAFT"
  | "REGENERATE_DRAFT"
  | "REVIEW_DRAFT"
  | "NONE";

export type LeadPreparationBlocker = {
  code: LeadPreparationBlockerCode;
  severity: "blocking" | "warning";
  explanationTr: string;
  /** Grounded pointers into the fields this blocker was read from. */
  sourceRefs: string[];
  repairAction: LeadPreparationRepairAction;
};

const BLOCKER_EXPLANATION_TR: Record<LeadPreparationBlockerCode, string> = {
  NO_VERIFIED_WHATSAPP: "Doğrulanmış WhatsApp numarası yok",
  NO_USABLE_EVIDENCE: "Mesaj için kullanılabilir, işletmeye özel kanıt yok",
  NO_CURRENT_DRAFT: "Bu lead için henüz bir taslak yok",
  DRAFT_VERSION_STALE: "Taslak eski bir mesaj sürümüyle yazılmış",
  DRAFT_EVIDENCE_STALE: "Kanıtlar değişti — mevcut taslak artık güncel değil, incelenmeli",
};

const RECOMMENDED_ACTION_TR: Record<LeadPreparationStatus, string> = {
  review_required: "Taslağı incele, gerekirse yeniden üret ve yeniden onayla",
  needs_channel: "Yeniden zenginleştir — doğrulanmış bir kanal bulunamadı",
  needs_research: "Yeniden zenginleştir — kullanılabilir kanıt yok",
  needs_draft: "Taslak oluştur",
  draft_stale: "Taslağı yeniden üret",
  ready: "Gönderilmeye hazır",
};

/* -------------------------------------------------------------------------- */
/* evidence-aware draft staleness (v3.8.2 — the P0 fix)                       */
/* -------------------------------------------------------------------------- */

export type DraftStalenessReason =
  | "current"
  | "evidence_fingerprint_mismatch"
  | "reenriched_since_generation"
  | "not_applicable";

export type DraftStaleness = {
  stale: boolean;
  reason: DraftStalenessReason;
};

/**
 * Whether a draft's evidence has gone stale — the release blocker this
 * sprint exists to close. `isStaleCopyDraft` (`outreach/workspace.ts`) stays
 * exactly what it always was — a `copyVersion` check — because that is a
 * different, still-real question ("was this written under the current
 * generation contract?"). This function answers the one nothing previously
 * asked: "does this draft still describe the business as it actually is?"
 *
 * Two paths, matching the sprint's own backward-compatibility rule:
 *
 *  1. The draft carries an `evidenceFingerprint` (every draft generated after
 *     this sprint does) — compare it to the fingerprint of the *current*
 *     evidence pack. Any difference is real: the pack changed, which only
 *     happens when `websiteIntelligence`/channels/Instagram presence changed
 *     since generation.
 *  2. The draft has no fingerprint (every draft generated before this
 *     sprint) — fall back to comparing `lead.lastEnrichedAt` against the
 *     draft's own timestamp. Only flagged stale when enrichment has *run
 *     again* since the draft was written; a draft this module cannot judge
 *     is never blindly invalidated, per the sprint's explicit instruction.
 */
export function evaluateDraftStaleness(
  draft: PersistedOutreachDraft | undefined,
  currentFingerprint: string,
  lastEnrichedAtMs: number | null,
): DraftStaleness {
  if (!draft) return { stale: false, reason: "not_applicable" };

  if (draft.evidenceFingerprint) {
    return draft.evidenceFingerprint === currentFingerprint
      ? { stale: false, reason: "current" }
      : { stale: true, reason: "evidence_fingerprint_mismatch" };
  }

  if (lastEnrichedAtMs !== null) {
    const draftAtRaw = draft.generatedAt ?? draft.updatedAt;
    const draftAtMs = draftAtRaw ? Date.parse(draftAtRaw) : NaN;
    if (Number.isFinite(draftAtMs) && lastEnrichedAtMs > draftAtMs) {
      return { stale: true, reason: "reenriched_since_generation" };
    }
  }

  return { stale: false, reason: "not_applicable" };
}

/* -------------------------------------------------------------------------- */
/* preparation -> outreach handoff (v3.8.3)                                  */
/* -------------------------------------------------------------------------- */

/**
 * The single next Founder action for a lead, derived from its preparation
 * status plus the one thing preparation itself cannot see: whether the
 * current draft already carries a founder approval.
 *
 * v3.8.3 — Hermes Preparation-to-Outreach Handoff. This is deliberately a
 * second, tiny pure function rather than a field folded into
 * {@link LeadPreparationAssessment}: approval is resolved from the durable
 * Hermes mission file (`mission-approval-resolver.ts`), which is server-only
 * and async, while `computeLeadPreparation` above is synchronous and knows
 * nothing about missions. Keeping them separate keeps `lead-preparation.ts`
 * exactly what it already was — no second preparation engine, no new
 * durable state, just one more deterministic mapping over values that
 * already exist.
 */
export type PreparationAction =
  | "REENRICH"
  | "GENERATE_DRAFT"
  | "REGENERATE_DRAFT"
  | "REVIEW_DRAFT"
  | "APPROVE"
  | "OPEN_WHATSAPP"
  | "MARK_CONTACTED";

export const PREPARATION_ACTION_LABELS_TR: Record<PreparationAction, string> = {
  REENRICH: "Yeniden Zenginleştir",
  GENERATE_DRAFT: "Mesaj Oluştur",
  REGENERATE_DRAFT: "Mesajı Yenile",
  REVIEW_DRAFT: "İncele",
  APPROVE: "Onayla",
  OPEN_WHATSAPP: "WhatsApp'ta Aç",
  MARK_CONTACTED: "Gönderdim",
};

export type PreparationActionInput = {
  status: LeadPreparationStatus;
  /** True while the current draft is still awaiting the founder's approval (mission stage `"approval"`). */
  approvalPending: boolean;
  /** True once "WhatsApp'ta Aç" has been used for the current approved draft this session. */
  whatsappOpened?: boolean;
};

/**
 * The one recommended action for a `ready` lead is never ambiguous: an
 * unapproved draft always asks for {@link PreparationAction.APPROVE} first,
 * and only an approved one may be sent — this order can never be skipped.
 * Every other status maps 1:1 to the repair action its own blocker already
 * names in `lead-preparation.ts` (see `BLOCKER_EXPLANATION_TR` / the
 * `repairAction` on each `LeadPreparationBlocker`), reproduced here as a
 * flat switch so a caller does not have to know which blocker index to read.
 */
export function computeLeadPreparationAction(
  input: PreparationActionInput,
): PreparationAction {
  switch (input.status) {
    case "needs_research":
    case "needs_channel":
      return "REENRICH";
    case "needs_draft":
      return "GENERATE_DRAFT";
    case "draft_stale":
      return "REGENERATE_DRAFT";
    case "review_required":
      return "REVIEW_DRAFT";
    case "ready":
      if (input.approvalPending) return "APPROVE";
      return input.whatsappOpened ? "MARK_CONTACTED" : "OPEN_WHATSAPP";
  }
}

/* -------------------------------------------------------------------------- */
/* assessment                                                                 */
/* -------------------------------------------------------------------------- */

export type LeadPreparationChecks = {
  /** At least one evidence item came from the website itself (not Instagram/OTA alone). */
  websiteEvidence: boolean;
  verifiedWhatsApp: boolean;
  instagramKnown: boolean;
  otaKnown: boolean;
  usableEvidence: boolean;
  draftExists: boolean;
  draftCurrentVersion: boolean;
  draftEvidenceCurrent: boolean;
};

export type LeadPreparationAssessment = {
  status: LeadPreparationStatus;
  blockers: LeadPreparationBlocker[];
  checks: LeadPreparationChecks;
  recommendedAction: string;
  /** The current evidence pack's fingerprint — what a fresh generation would stamp on its draft. */
  evidenceFingerprint: string;
};

/** The subset of a canonical (roster) lead this module reads. Nothing here is Contact-Finder or localStorage sourced. */
export type LeadPreparationRosterInput = {
  businessType?: string;
  businessSignals?: string[];
  channels?: string[];
  hasInstagram?: boolean;
  hasOwnWebsite?: boolean;
  websiteIntelligence?: {
    hasWhatsAppLink?: boolean;
    hasBookingCtaText?: boolean;
    hasBookingEngine?: boolean;
    hasInquiryForm?: boolean;
  } | null;
  whatsappConfidence?: string | null;
  instagramConfidence?: string | number | null;
  otaConfidence?: string | null;
  /** ISO instant of the last successful enrichment/re-enrichment. */
  lastEnrichedAt?: string | null;
};

export type LeadPreparationInput = {
  leadId: string;
  lead: LeadPreparationRosterInput;
  workspace: LeadMessageWorkspaceState | undefined;
};

function isKnownConfidence(value: string | number | null | undefined): boolean {
  return value === "confirmed" || value === "likely";
}

/**
 * `outreach/evidence.ts`'s `contact_form` type is keyed to `hasContactForm`;
 * the canonical crawler (`website-html-intelligence.ts`) calls the same
 * observation `hasInquiryForm`. `generate-message/route.ts` already makes
 * this exact mapping (`readBool(wi.hasContactForm) ?? readBool(wi.hasInquiryForm)`)
 * — reused here rather than re-derived, so the two never drift apart.
 */
function toEvidenceWebsiteIntelligence(
  wi: LeadPreparationRosterInput["websiteIntelligence"],
): EvidenceWebsiteIntelligence | null {
  if (!wi) return null;
  return {
    hasWhatsAppLink: wi.hasWhatsAppLink,
    hasBookingCtaText: wi.hasBookingCtaText,
    hasBookingEngine: wi.hasBookingEngine,
    hasContactForm: wi.hasInquiryForm,
  };
}

/**
 * The one derived answer to "is this lead ready, and if not, why".
 *
 * Recomputed on every call — selected-lead load, roster update,
 * re-enrichment success, message-workspace update, draft
 * generation/regeneration all just mean "call this again"; there is no
 * cache to invalidate and no run to resume.
 */
export function computeLeadPreparation(input: LeadPreparationInput): LeadPreparationAssessment {
  const lead = input.lead;
  const evidencePack = buildPersonalizationEvidence({
    businessType: lead.businessType,
    businessSignals: lead.businessSignals,
    channels: lead.channels,
    hasInstagram: lead.hasInstagram,
    hasOwnWebsite: lead.hasOwnWebsite,
    websiteIntelligence: toEvidenceWebsiteIntelligence(lead.websiteIntelligence),
  });
  const currentFingerprint = computeEvidenceFingerprint(evidencePack);

  const usableEvidence = evidencePack.length > 0;
  const websiteEvidence = evidencePack.some(
    (item) => item.type !== "instagram_channel" && item.type !== "ota_presence",
  );
  const verifiedWhatsApp = isKnownConfidence(lead.whatsappConfidence ?? null);
  const instagramKnown = isKnownConfidence(lead.instagramConfidence ?? null);
  const otaKnown = isKnownConfidence(lead.otaConfidence ?? null);

  const workspace = input.workspace;
  const draft = workspace ? workspace.drafts[workspace.activeTone] : undefined;
  const draftExists = Boolean(draft);
  const versionStale = draftExists && isStaleCopyDraft(draft);
  const draftCurrentVersion = !versionStale;

  const lastEnrichedAtMs = lead.lastEnrichedAt ? Date.parse(lead.lastEnrichedAt) : NaN;
  const lastEnrichedAtValid = Number.isFinite(lastEnrichedAtMs) ? lastEnrichedAtMs : null;
  const staleness = evaluateDraftStaleness(draft, currentFingerprint, lastEnrichedAtValid);
  const draftEvidenceCurrent = !staleness.stale;

  const blockers: LeadPreparationBlocker[] = [];
  const addBlocker = (
    code: LeadPreparationBlockerCode,
    severity: "blocking" | "warning",
    repairAction: LeadPreparationRepairAction,
    sourceRefs: string[],
  ) => {
    blockers.push({
      code,
      severity,
      explanationTr: BLOCKER_EXPLANATION_TR[code],
      sourceRefs,
      repairAction,
    });
  };

  // Deterministic, fixed order — most fundamental blocker first. Callers
  // that want "the one reason" read `blockers[0]`; nothing here reorders
  // between two reads of the same state.
  if (!verifiedWhatsApp) {
    addBlocker("NO_VERIFIED_WHATSAPP", "blocking", "REENRICH", [
      `lead:${input.leadId}#whatsappConfidence`,
    ]);
  }
  if (!usableEvidence) {
    addBlocker("NO_USABLE_EVIDENCE", "blocking", "REENRICH", [
      `lead:${input.leadId}#websiteIntelligence`,
      `lead:${input.leadId}#hasInstagram`,
      `lead:${input.leadId}#channels`,
    ]);
  }
  if (usableEvidence && !draftExists) {
    addBlocker("NO_CURRENT_DRAFT", "blocking", "GENERATE_DRAFT", [
      `lead:${input.leadId}#messageWorkspace`,
    ]);
  }
  if (draft && staleness.stale) {
    addBlocker("DRAFT_EVIDENCE_STALE", "blocking", "REVIEW_DRAFT", [
      `lead:${input.leadId}#messageWorkspace.drafts.${draft.tone}`,
      `evidenceFingerprint:${currentFingerprint}`,
    ]);
  }
  if (draft && !staleness.stale && versionStale) {
    addBlocker("DRAFT_VERSION_STALE", "warning", "REGENERATE_DRAFT", [
      `lead:${input.leadId}#messageWorkspace.drafts.${draft.tone}.copyVersion`,
    ]);
  }

  /**
   * Status precedence — deliberately not the same order as the blocker list.
   * A founder needs the single most urgent *next action*, and reviewing a
   * draft that may now say something inaccurate outranks everything else,
   * including a missing channel: sending nothing is safer than sending the
   * wrong thing. `needs_channel` outranks `needs_research` next because
   * without a verified channel there is nowhere to send a message regardless
   * of how good its copy would be.
   */
  let status: LeadPreparationStatus;
  if (staleness.stale) {
    status = "review_required";
  } else if (!verifiedWhatsApp) {
    status = "needs_channel";
  } else if (!usableEvidence) {
    status = "needs_research";
  } else if (!draftExists) {
    status = "needs_draft";
  } else if (versionStale) {
    status = "draft_stale";
  } else {
    status = "ready";
  }

  return {
    status,
    blockers,
    checks: {
      websiteEvidence,
      verifiedWhatsApp,
      instagramKnown,
      otaKnown,
      usableEvidence,
      draftExists,
      draftCurrentVersion,
      draftEvidenceCurrent,
    },
    recommendedAction: RECOMMENDED_ACTION_TR[status],
    evidenceFingerprint: currentFingerprint,
  };
}
