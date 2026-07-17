/**
 * Hermes Acquisition Explainability adapter (Sprint C1.5 — Acquisition
 * Preview & Explainability).
 *
 * Pure presentation-layer projection that answers three founder questions
 * about today's autonomous discovery pass:
 *
 *   • Why did Hermes pick this business?
 *   • Why did Hermes set another one aside?
 *   • What does Hermes plan to do next?
 *
 * It computes NOTHING new. Every reason line is a read of a signal an
 * existing runtime already produced (`signalVerification` from the Signal
 * Verification Engine, `icpAlignment` from the ICP engine,
 * `websiteIntelligence` from homepage enrichment, `verifiedOpportunityScore`
 * from the opportunity scoring engine) — this module only translates those
 * fields into founder sentences. The priority bar is the exact same
 * threshold (70) the intake adapter and the acquisition policy's
 * `minVerifiedOpportunityScore` default already use, and the
 * priority gate mirrors `evaluateMissionCandidateEligibility`'s shape
 * (score + phone + website) without re-implementing it as policy — a lead
 * the runtime qualified will read as "öncelikli" here for the same visible
 * reasons.
 *
 * Founder-language contract: no technical vocabulary (release-audit checked
 * via `findForbiddenFounderTerm`), and never the words "Rejected", "Failed",
 * "Filtered" or "Low score" — a set-aside business is "İşleme alınmadı" and
 * always gets a "Hermes bu işletmeyi daha sonra tekrar değerlendirecek."
 * promise, never a verdict.
 *
 * Deliberately dependency-free (no "@/" imports, no React, no browser API)
 * so it runs under plain `node --test` — the same convention every v8
 * adapter follows.
 */

/**
 * Structural subset of `ScoredLead` this module reads — any real ScoredLead
 * satisfies it automatically (the `hermes-lead-intake-adapter` convention).
 * Every field is optional except `name`: older persisted leads may lack any
 * of them, and a missing signal simply produces no reason line.
 */
export type ExplainableLeadLike = {
  name: string;
  /** First time this business entered the pool — the "found today" filter key. */
  firstImportedAt?: number;
  createdAt?: number;
  phone?: string;
  website?: string;
  websiteCandidateUrl?: string;
  hasInstagram?: boolean;
  units?: number;
  reviewsCount?: number;
  leadScore?: number;
  opportunityScore?: number;
  verifiedOpportunityScore?: number;
  whatsappConfidence?: string;
  adsLikelihood?: string;
  otaConfidence?: string;
  otaDependencyLikelihood?: number;
  websiteIntelligence?: {
    hasWhatsAppLink?: boolean;
    hasBookingEngine?: boolean;
    hasOtaOutboundLinks?: boolean;
  };
  signalVerification?: {
    whatsappVerification?: string;
    websiteVerification?: string;
    reservationSignal?: string;
    instagramVerification?: string;
  };
  icpAlignment?: {
    estimatedPropertySize?: string;
    otaDependencyLevel?: string;
    directBookingReadiness?: string;
  };
};

/** Green / amber / gray — the section's whole color system. Red is reserved for a real error. */
export type AcquisitionAttentionLevel = "ready" | "watching" | "waiting";

export type FounderOpportunityExplanation = {
  /** Business name, verbatim. */
  title: string;
  /** One founder sentence — Hermes speaking, never a technical verdict. */
  status: string;
  /** "Fırsat Puanı 91" — null on a set-aside card (a business without a score reads no number). */
  scoreLabel: string | null;
  /** Founder-safe reason lines — why picked (ready/watching) or why set aside (waiting). */
  reasons: string[];
  /** What Hermes plans to do next, as a promise the founder can hold it to. */
  nextAction: string;
  attentionLevel: AcquisitionAttentionLevel;
};

export type HermesAcquisitionExplainabilityMode = "loading" | "error" | "empty" | "ready";

export type HermesAcquisitionExplainabilityView = {
  mode: HermesAcquisitionExplainabilityMode;
  /** Businesses Hermes picked or is watching — sorted by score, capped. */
  found: FounderOpportunityExplanation[];
  /** Businesses set aside for a later look — capped, never called rejected. */
  revisit: FounderOpportunityExplanation[];
};

export type ComputeAcquisitionExplainabilityInput = {
  /** The full scored lead pool — the adapter filters to businesses first seen today. */
  leads: ExplainableLeadLike[];
  /** The shell's acquisition status fetch state; decides loading vs error vs empty when no cards exist. */
  fetchState?: "loading" | "ready" | "error";
  /** Injectable for tests; defaults to `Date.now()`. */
  now?: number;
};

/**
 * The same "sales-ready" bar `hermes-lead-intake-adapter` reads and the
 * acquisition policy defaults to (`minVerifiedOpportunityScore` = 70).
 * Not a new rule — the existing bar read from the explanation angle.
 */
const PRIORITY_SCORE_THRESHOLD = 70;

const MAX_FOUND_CARDS = 5;
const MAX_REVISIT_CARDS = 3;

export const HERMES_ACQUISITION_EXPLAINABILITY_LABELS = {
  sectionTitle: "Hermes Bugün Bunları Buldu",
  sectionSubtitle: "Hermes'in bugünkü keşif turu — neyi neden seçtiği ve sırada ne olduğu.",
  loading: "Hermes bugünkü fırsatları hazırlıyor...",
  error: "Bugünkü fırsatlar şu anda yüklenemedi.",
  retry: "Tekrar Dene",
  emptyTitle: "Bugün yeni fırsat bulunmadı.",
  emptySubtitle: "Hermes mevcut işletmeleri izlemeye devam ediyor.",
  pickedIntro: "Hermes bunu seçti çünkü",
  revisitWhy: "Neden?",
  nextStep: "Sonraki adım",
  scorePrefix: "Fırsat Puanı",
} as const;

export const ACQUISITION_STATUS_SENTENCES = {
  ready: "Hermes bu işletmeyi öncelikli gördü.",
  watching: "Hermes bu işletmeyi izlemeye aldı.",
  waiting: "İşleme alınmadı",
} as const;

export const ACQUISITION_NEXT_ACTIONS = {
  prepareFirstContact: "İlk temas hazırlığı yapılacak — son karar sende olacak.",
  analyzeWebsite: "Website analizi yapılacak.",
  keepWatchingSignals: "Hermes yeni sinyaller geldikçe değerlendirmeyi güncelleyecek.",
  revisitLater: "Hermes bu işletmeyi daha sonra tekrar değerlendirecek.",
} as const;

/** Fixed founder vocabulary for the reason lines — the spec's exact wording. */
export const ACQUISITION_REASON_SENTENCES = {
  whatsappActive: "WhatsApp aktif",
  reservationEngine: "Rezervasyon motoru var",
  adsTrace: "Dijital reklam izi bulundu",
  otaDependencyHigh: "OTA bağımlılığı yüksek",
  largeProperty: "Büyük ölçekli tesis",
  websiteLive: "Web sitesi aktif",
  instagramVisible: "Instagram görünürlüğü var",
  reachableByPhone: "Telefonla ulaşılabilir",
  noWebsite: "Web sitesi bulunamadı",
  noContactChannel: "İletişim kanalı eksik",
  lowDigitalVisibility: "Dijital görünürlük düşük",
} as const;

/* ── signal reads — each is a lookup over an existing runtime's output ── */

function scoreOf(lead: ExplainableLeadLike): number {
  return lead.verifiedOpportunityScore ?? lead.opportunityScore ?? lead.leadScore ?? 0;
}

function hasWhatsAppSignal(lead: ExplainableLeadLike): boolean {
  const verification = lead.signalVerification?.whatsappVerification;
  if (verification === "verified" || verification === "likely") return true;
  if (lead.whatsappConfidence === "confirmed" || lead.whatsappConfidence === "likely") return true;
  return lead.websiteIntelligence?.hasWhatsAppLink === true;
}

function hasReservationEngine(lead: ExplainableLeadLike): boolean {
  const signal = lead.signalVerification?.reservationSignal;
  if (signal === "verified" || signal === "detected") return true;
  return lead.websiteIntelligence?.hasBookingEngine === true;
}

function hasAdsTrace(lead: ExplainableLeadLike): boolean {
  return lead.adsLikelihood === "confirmed" || lead.adsLikelihood === "likely";
}

function hasHighOtaDependency(lead: ExplainableLeadLike): boolean {
  if (lead.icpAlignment?.otaDependencyLevel === "high") return true;
  if ((lead.otaDependencyLikelihood ?? 0) >= 60) return true;
  if (lead.otaConfidence === "confirmed") return true;
  return lead.websiteIntelligence?.hasOtaOutboundLinks === true;
}

function isLargeProperty(lead: ExplainableLeadLike): boolean {
  return lead.icpAlignment?.estimatedPropertySize === "large" || (lead.units ?? 0) >= 30;
}

function hasWebsite(lead: ExplainableLeadLike): boolean {
  return Boolean(lead.website?.trim()) || Boolean(lead.websiteCandidateUrl?.trim());
}

function hasPhone(lead: ExplainableLeadLike): boolean {
  return Boolean(lead.phone?.trim());
}

function hasInstagramVisibility(lead: ExplainableLeadLike): boolean {
  if (lead.hasInstagram === true) return true;
  const verification = lead.signalVerification?.instagramVerification;
  return verification === "verified" || verification === "likely";
}

function websiteAlreadyAnalyzed(lead: ExplainableLeadLike): boolean {
  const verification = lead.signalVerification?.websiteVerification;
  return verification === "verified" || verification === "reachable";
}

/* ── classification ─────────────────────────────────────────── */

function attentionLevelOf(lead: ExplainableLeadLike): AcquisitionAttentionLevel {
  // Missing website or missing every contact channel: the business isn't
  // workable yet — same data gaps the qualification gate rejects on, read
  // as "come back later" instead of a verdict.
  if (!hasWebsite(lead) || (!hasPhone(lead) && !hasWhatsAppSignal(lead))) return "waiting";
  if (scoreOf(lead) >= PRIORITY_SCORE_THRESHOLD && hasPhone(lead)) return "ready";
  return "watching";
}

function pickedReasonsFor(lead: ExplainableLeadLike): string[] {
  const reasons: string[] = [];
  if (hasWhatsAppSignal(lead)) reasons.push(ACQUISITION_REASON_SENTENCES.whatsappActive);
  if (hasReservationEngine(lead)) reasons.push(ACQUISITION_REASON_SENTENCES.reservationEngine);
  if (hasAdsTrace(lead)) reasons.push(ACQUISITION_REASON_SENTENCES.adsTrace);
  if (hasHighOtaDependency(lead)) reasons.push(ACQUISITION_REASON_SENTENCES.otaDependencyHigh);
  if (isLargeProperty(lead)) reasons.push(ACQUISITION_REASON_SENTENCES.largeProperty);
  // Supporting facts only when the headline signals are thin — a card must
  // never explain a pick with an empty list.
  if (reasons.length < 2 && hasWebsite(lead)) reasons.push(ACQUISITION_REASON_SENTENCES.websiteLive);
  if (reasons.length < 2 && hasInstagramVisibility(lead)) {
    reasons.push(ACQUISITION_REASON_SENTENCES.instagramVisible);
  }
  if (reasons.length === 0 && hasPhone(lead)) {
    reasons.push(ACQUISITION_REASON_SENTENCES.reachableByPhone);
  }
  return reasons.slice(0, 5);
}

function revisitReasonsFor(lead: ExplainableLeadLike): string[] {
  const reasons: string[] = [];
  if (!hasWebsite(lead)) reasons.push(ACQUISITION_REASON_SENTENCES.noWebsite);
  if (!hasPhone(lead) && !hasWhatsAppSignal(lead)) {
    reasons.push(ACQUISITION_REASON_SENTENCES.noContactChannel);
  }
  if (!hasInstagramVisibility(lead) && (lead.reviewsCount ?? 0) < 10) {
    reasons.push(ACQUISITION_REASON_SENTENCES.lowDigitalVisibility);
  }
  if (reasons.length === 0) reasons.push(ACQUISITION_REASON_SENTENCES.lowDigitalVisibility);
  return reasons.slice(0, 3);
}

function nextActionFor(lead: ExplainableLeadLike, level: AcquisitionAttentionLevel): string {
  if (level === "waiting") return ACQUISITION_NEXT_ACTIONS.revisitLater;
  if (level === "ready") {
    return hasWhatsAppSignal(lead)
      ? ACQUISITION_NEXT_ACTIONS.prepareFirstContact
      : ACQUISITION_NEXT_ACTIONS.analyzeWebsite;
  }
  // Watching: a website nobody has verified yet is the concrete next step;
  // otherwise Hermes just keeps listening.
  return hasWebsite(lead) && !websiteAlreadyAnalyzed(lead)
    ? ACQUISITION_NEXT_ACTIONS.analyzeWebsite
    : ACQUISITION_NEXT_ACTIONS.keepWatchingSignals;
}

export function explainOpportunity(lead: ExplainableLeadLike): FounderOpportunityExplanation {
  const level = attentionLevelOf(lead);
  const score = Math.round(scoreOf(lead));
  return {
    title: lead.name,
    status: ACQUISITION_STATUS_SENTENCES[level],
    scoreLabel:
      level === "waiting"
        ? null
        : `${HERMES_ACQUISITION_EXPLAINABILITY_LABELS.scorePrefix} ${score}`,
    reasons: level === "waiting" ? revisitReasonsFor(lead) : pickedReasonsFor(lead),
    nextAction: nextActionFor(lead, level),
    attentionLevel: level,
  };
}

/* ── section view ───────────────────────────────────────────── */

/** Exported for reuse by hermes-working-queue-adapter.ts — the single freshness definition both sections read from. */
export function isSameCalendarDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

/** Exported for reuse by hermes-working-queue-adapter.ts — "found today" and "fresh opportunity" must always mean the same thing. */
export function firstSeenAt(lead: Pick<ExplainableLeadLike, "firstImportedAt" | "createdAt">): number | null {
  if (typeof lead.firstImportedAt === "number" && Number.isFinite(lead.firstImportedAt)) {
    return lead.firstImportedAt;
  }
  if (typeof lead.createdAt === "number" && Number.isFinite(lead.createdAt)) {
    return lead.createdAt;
  }
  return null;
}

export function computeAcquisitionExplainability(
  input: ComputeAcquisitionExplainabilityInput,
): HermesAcquisitionExplainabilityView {
  const now = input.now ?? Date.now();
  const leads = input.leads ?? [];

  const foundToday = leads.filter((lead) => {
    const at = firstSeenAt(lead);
    return at !== null && isSameCalendarDay(at, now);
  });

  const explained = foundToday.map(explainOpportunity);
  const found = explained
    .filter((e) => e.attentionLevel !== "waiting")
    .sort((a, b) => {
      // Ready before watching, then score descending, then name — stable
      // and deterministic for the founder's eye.
      if (a.attentionLevel !== b.attentionLevel) return a.attentionLevel === "ready" ? -1 : 1;
      const scoreA = Number(a.scoreLabel?.match(/\d+$/)?.[0] ?? 0);
      const scoreB = Number(b.scoreLabel?.match(/\d+$/)?.[0] ?? 0);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return a.title.localeCompare(b.title, "tr");
    })
    .slice(0, MAX_FOUND_CARDS);
  const revisit = explained
    .filter((e) => e.attentionLevel === "waiting")
    .sort((a, b) => a.title.localeCompare(b.title, "tr"))
    .slice(0, MAX_REVISIT_CARDS);

  if (found.length > 0 || revisit.length > 0) {
    return { mode: "ready", found, revisit };
  }
  if (input.fetchState === "loading") return { mode: "loading", found: [], revisit: [] };
  if (input.fetchState === "error") return { mode: "error", found: [], revisit: [] };
  return { mode: "empty", found: [], revisit: [] };
}
