import type { SignalConfidence } from "@/app/lib/intelligence/confidence";
import {
  enrichScoredLeadIntelligence,
  type ScoredLead,
} from "@/app/lib/leads";
import { fetchHomepageHtml } from "@/app/lib/fetch-homepage-html";
import { extractContactSignalsFromHtml } from "@/app/lib/extract-contact-signals-from-html";
import { interpretExtractedWebsiteContactSignals } from "@/app/lib/llm/provider";
import {
  generateWebsiteDomainCandidates,
  isAllowedDiscoveryHostname,
  scoreBusinessNamePageMatch,
} from "@/app/lib/website-candidate-discovery";
import {
  buildWhatsappSurfaceMeta,
  turkishGsmDigitsForWaMe,
} from "@/app/lib/intelligence/whatsapp-verification";
import { inferWebsiteIntelligenceFromHomepageHtml } from "@/app/lib/website-html-intelligence";
import {
  buildSignalVerificationProfile,
  scanLeadPagesForSignals,
  type MultiPageSignalScan,
} from "@/app/lib/signal-verification";

export type EnrichLeadHomepageOptions = {
  fetchTimeoutMs?: number;
};

const SIGNAL_WEBSITE_CANDIDATE = "Web sitesi adayı bulundu";
const SIGNAL_WEBSITE_GOOGLE_MISSING = "Web sitesi Google kaydında yok, arama ile aday bulundu";
const SIGNAL_WA_INVALID = "WhatsApp linki var ancak numara doğrulanamadı";
const SIGNAL_WA_VERIFY = "WhatsApp linki var ancak doğrulama gerekli";

const MAX_WEBSITE_CANDIDATE_FETCHES = 5;
const DEFAULT_CANDIDATE_TIMEOUT_MS = 10_000;

function uniqStrings(items: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const v = raw.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function appendBizSignal(signals: readonly string[], extra: string): string[] {
  if (signals.some((s) => s === extra)) return [...signals];
  return [...signals, extra];
}

function confidenceRank(c: SignalConfidence): number {
  const order: SignalConfidence[] = ["missing", "unknown", "weak", "likely", "confirmed"];
  const i = order.indexOf(c);
  return i === -1 ? 0 : i;
}

function maxSignal(a: SignalConfidence, b: SignalConfidence): SignalConfidence {
  return confidenceRank(a) >= confidenceRank(b) ? a : b;
}

function normalizeIgHandle(handle?: string): string | null {
  const h = handle?.trim().replace(/^@+/, "");
  return h ? h.toLowerCase() : null;
}

function instagramUrlMatchesHandle(url: string, handle: string): boolean {
  const h = handle.toLowerCase();
  try {
    const u = new URL(url);
    if (!u.hostname.toLowerCase().includes("instagram.com")) return false;
    const seg = u.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
    return seg === h;
  } catch {
    return (
      url.toLowerCase().includes(`instagram.com/${h}`) &&
      !url.toLowerCase().includes(`instagram.com/${h}/p/`)
    );
  }
}

function buildLeadVerification(
  base: ScoredLead,
  websiteUrl: string | null,
  websiteFetchOk: boolean | null,
  websiteFetchError: string | null,
  scan: MultiPageSignalScan | null,
  websiteOrigin: "google" | "candidate" | null,
) {
  return buildSignalVerificationProfile({
    businessName: base.name,
    websiteUrl,
    websiteFetchOk,
    websiteFetchError,
    instagramHandle: base.instagram ?? null,
    listingPhoneIsMobile: turkishGsmDigitsForWaMe(base.phone ?? "") !== null,
    websiteOrigin,
    scan,
  });
}

async function enrichFromDiscoveredWebsiteCandidate(
  base: ScoredLead,
  options?: EnrichLeadHomepageOptions,
): Promise<ScoredLead> {
  const candidates = generateWebsiteDomainCandidates({
    businessName: base.name,
    city: base.city,
    knownWebsiteHint: base.googleWebsiteSearchHint?.trim(),
  }).filter(isAllowedDiscoveryHostname);

  const timeoutMs = Math.min(
    options?.fetchTimeoutMs ?? DEFAULT_CANDIDATE_TIMEOUT_MS,
    12_000,
  );

  let bestStrong: { host: string; html: string; url: string } | null = null;
  let bestUncertain: { host: string; html: string; url: string } | null = null;

  for (const host of candidates.slice(0, MAX_WEBSITE_CANDIDATE_FETCHES)) {
    const fetchResult = await fetchHomepageHtml(host, { timeoutMs });
    if (!fetchResult.ok || !fetchResult.html) continue;
    const match = scoreBusinessNamePageMatch(base.name, fetchResult.html);
    if (match.strength === "strong") {
      bestStrong = { host, html: fetchResult.html, url: fetchResult.url };
      break;
    }
    if (match.strength === "uncertain" && !bestUncertain) {
      bestUncertain = { host, html: fetchResult.html, url: fetchResult.url };
    }
  }

  const pick = bestStrong ?? bestUncertain;
  if (!pick) {
    // No website at all — still record verified-absence + ownership classification.
    const verification = buildLeadVerification(base, null, null, null, null, null);
    return enrichScoredLeadIntelligence({ ...base, signalVerification: verification });
  }

  const candidateMatch: "strong" | "uncertain" = bestStrong ? "strong" : "uncertain";

  // Multi-page signal discovery (contact / reservation / about pages, max 5 total).
  const scan = await scanLeadPagesForSignals(pick.host, { url: pick.url, html: pick.html });
  const extracted = scan?.merged ?? extractContactSignalsFromHtml(pick.html, { pageUrl: pick.url });
  const waMeta = scan?.waMeta ?? buildWhatsappSurfaceMeta(pick.html, extracted.whatsappLinks);
  const verification = buildLeadVerification(base, pick.host, true, null, scan, "candidate");

  const inferred = {
    ...inferWebsiteIntelligenceFromHomepageHtml(pick.html, {
      hasWhatsAppLink: extracted.whatsappLinks.length > 0,
      hasInvalidWhatsAppLinks: waMeta.allLinksInvalid,
      websiteCandidateMatch: candidateMatch,
    }),
    whatsappSurfaceMeta: waMeta,
  };

  let nextSignals = appendBizSignal(base.signals ?? [], SIGNAL_WEBSITE_CANDIDATE);
  nextSignals = appendBizSignal(nextSignals, SIGNAL_WEBSITE_GOOGLE_MISSING);
  if (waMeta.allLinksInvalid) {
    nextSignals = appendBizSignal(nextSignals, SIGNAL_WA_INVALID);
  } else if (waMeta.mixedValidation) {
    nextSignals = appendBizSignal(nextSignals, SIGNAL_WA_VERIFY);
  }

  const igHandle = normalizeIgHandle(base.instagram);
  let finalInstagram = base.instagramConfidence;
  if (typeof base.instagramConfidence !== "number") {
    const cur = (base.instagramConfidence ?? "missing") as SignalConfidence;
    if (igHandle && extracted.instagramLinks.some((u) => instagramUrlMatchesHandle(u, igHandle))) {
      finalInstagram = maxSignal(cur, "confirmed");
    } else if (extracted.instagramLinks.length > 0) {
      finalInstagram = maxSignal(cur, "likely");
    }
  }

  const extractedPhones = uniqStrings([
    ...(base.extractedPhones ?? []),
    ...extracted.phones,
    ...extracted.turkishGsmNumbers,
  ]);
  const extractedEmails = uniqStrings([...(base.extractedEmails ?? []), ...extracted.emails]);
  const extractedSocialLinks = uniqStrings([
    ...(base.extractedSocialLinks ?? []),
    ...extracted.instagramLinks,
    ...extracted.facebookLinks,
    ...extracted.whatsappLinks,
  ]);
  const hasReservationCTA =
    Boolean(base.hasReservationCTA) || extracted.reservationBookingCtaSnippets.length > 0;
  const hasContactPage = Boolean(base.hasContactPage) || extracted.contactPageLinks.length > 0;
  const turkishGsmExtracted = [...extracted.turkishGsmNumbers];

  const preMerged: ScoredLead = {
    ...base,
    websiteCandidateUrl: pick.host,
    websiteVerificationStatus: candidateMatch === "uncertain" ? "needs_manual_check" : undefined,
    websiteIntelligence: inferred,
    extractedPhones,
    extractedEmails,
    extractedSocialLinks,
    hasReservationCTA,
    hasContactPage,
    signals: nextSignals,
    signalVerification: verification,
  };

  let enriched = enrichScoredLeadIntelligence(preMerged);
  const acq = enriched.acquisitionIntelligence;
  if (acq) {
    enriched = {
      ...enriched,
      instagramConfidence: finalInstagram ?? enriched.instagramConfidence,
      acquisitionIntelligence: {
        ...acq,
        instagramConfidence: (finalInstagram ?? acq.instagramConfidence) as SignalConfidence,
      },
    };
  }

  const websiteContactSignalsInterpretation = await interpretExtractedWebsiteContactSignals({
    websiteConfidence: (enriched.websiteConfidence ?? "missing") as SignalConfidence,
    extractedPhones: enriched.extractedPhones ?? [],
    turkishGsmNumbers: turkishGsmExtracted,
    emails: enriched.extractedEmails ?? [],
    socialLinks: enriched.extractedSocialLinks ?? [],
    hasReservationCTA: Boolean(enriched.hasReservationCTA),
    hasContactPage: Boolean(enriched.hasContactPage),
    whatsappConfidence: enriched.whatsappConfidence ?? null,
    instagramConfidence: enriched.instagramConfidence ?? null,
    verification: enriched.signalVerification ?? null,
  });

  return { ...enriched, websiteContactSignalsInterpretation };
}

/**
 * Runs synchronous lead enrichment, then (when `website` is set) fetches the homepage once,
 * extracts contact signals, and updates confidence / extracted fields without re-running scoring.
 * When `website` is missing, tries a small bounded set of guessed domains (single GET each).
 */
export async function enrichLeadWithHomepageSignals(
  lead: ScoredLead,
  options?: EnrichLeadHomepageOptions,
): Promise<ScoredLead> {
  const base = enrichScoredLeadIntelligence(lead);
  const websiteRaw = base.website?.trim();
  if (!websiteRaw) {
    return enrichFromDiscoveredWebsiteCandidate(base, options);
  }

  const fetchResult = await fetchHomepageHtml(websiteRaw, {
    timeoutMs: options?.fetchTimeoutMs,
  });

  const baseWeb = (base.websiteConfidence ?? "missing") as SignalConfidence;
  let finalInstagram = base.instagramConfidence;

  let extractedPhones: string[] | undefined;
  let extractedEmails: string[] | undefined;
  let extractedSocialLinks: string[] | undefined;
  let hasReservationCTA: boolean | undefined;
  let hasContactPage: boolean | undefined;
  let turkishGsmExtracted: string[] = [];
  let websiteIntelligence = base.websiteIntelligence;
  let finalWebsite: SignalConfidence = (base.websiteConfidence ?? "missing") as SignalConfidence;
  let verification = base.signalVerification;

  if (fetchResult.ok && fetchResult.html) {
    // Multi-page signal discovery (contact / reservation / about pages, max 5 total).
    const scan = await scanLeadPagesForSignals(websiteRaw, {
      url: fetchResult.url,
      html: fetchResult.html,
    });
    const signals =
      scan?.merged ??
      extractContactSignalsFromHtml(fetchResult.html, { pageUrl: fetchResult.url });
    const waMeta =
      scan?.waMeta ?? buildWhatsappSurfaceMeta(fetchResult.html, signals.whatsappLinks);
    verification = buildLeadVerification(base, websiteRaw, true, null, scan, "google");
    const inferred = {
      ...inferWebsiteIntelligenceFromHomepageHtml(fetchResult.html, {
        hasWhatsAppLink: signals.whatsappLinks.length > 0,
        hasInvalidWhatsAppLinks: waMeta.allLinksInvalid,
      }),
      whatsappSurfaceMeta: waMeta,
    };
    websiteIntelligence = inferred;

    const strong =
      signals.whatsappLinks.length > 0 ||
      signals.turkishGsmNumbers.length > 0 ||
      signals.emails.length > 0 ||
      signals.contactPageLinks.length > 0 ||
      signals.reservationBookingCtaSnippets.length > 0 ||
      signals.phones.length >= 2;

    const tier: SignalConfidence = strong ? "confirmed" : "likely";
    finalWebsite = maxSignal(tier, baseWeb === "missing" ? tier : baseWeb);
    if (finalWebsite === "missing") finalWebsite = tier;

    const igHandle = normalizeIgHandle(base.instagram);
    if (typeof base.instagramConfidence !== "number") {
      const cur = (base.instagramConfidence ?? "missing") as SignalConfidence;
      if (igHandle && signals.instagramLinks.some((u) => instagramUrlMatchesHandle(u, igHandle))) {
        finalInstagram = maxSignal(cur, "confirmed");
      } else if (signals.instagramLinks.length > 0) {
        finalInstagram = maxSignal(cur, "likely");
      }
    }

    extractedPhones = uniqStrings([
      ...(base.extractedPhones ?? []),
      ...signals.phones,
      ...signals.turkishGsmNumbers,
    ]);
    extractedEmails = uniqStrings([...(base.extractedEmails ?? []), ...signals.emails]);
    extractedSocialLinks = uniqStrings([
      ...(base.extractedSocialLinks ?? []),
      ...signals.instagramLinks,
      ...signals.facebookLinks,
      ...signals.whatsappLinks,
    ]);
    hasReservationCTA =
      Boolean(base.hasReservationCTA) || signals.reservationBookingCtaSnippets.length > 0;
    hasContactPage = Boolean(base.hasContactPage) || signals.contactPageLinks.length > 0;
    turkishGsmExtracted = [...signals.turkishGsmNumbers];
  } else {
    finalWebsite = "weak";
    websiteIntelligence = {
      ...base.websiteIntelligence,
      websiteConfidence: "weak",
    };
    verification = buildLeadVerification(
      base,
      websiteRaw,
      false,
      fetchResult.error ?? null,
      null,
      "google",
    );
  }

  const preMerged: ScoredLead = {
    ...base,
    websiteIntelligence,
    extractedPhones,
    extractedEmails,
    extractedSocialLinks,
    hasReservationCTA,
    hasContactPage,
    signalVerification: verification,
  };

  let enriched = enrichScoredLeadIntelligence(preMerged);
  if (enriched.acquisitionIntelligence) {
    enriched = {
      ...enriched,
      websiteConfidence: finalWebsite,
      instagramConfidence: finalInstagram ?? enriched.instagramConfidence,
      acquisitionIntelligence: {
        ...enriched.acquisitionIntelligence,
        websiteConfidence: finalWebsite,
        instagramConfidence: (finalInstagram ??
          enriched.acquisitionIntelligence.instagramConfidence) as SignalConfidence,
      },
    };
  } else {
    enriched = {
      ...enriched,
      websiteConfidence: finalWebsite,
      instagramConfidence: finalInstagram ?? enriched.instagramConfidence,
    };
  }

  const websiteContactSignalsInterpretation = await interpretExtractedWebsiteContactSignals({
    websiteConfidence: (enriched.websiteConfidence ?? "missing") as SignalConfidence,
    extractedPhones: enriched.extractedPhones ?? [],
    turkishGsmNumbers: turkishGsmExtracted,
    emails: enriched.extractedEmails ?? [],
    socialLinks: enriched.extractedSocialLinks ?? [],
    hasReservationCTA: Boolean(enriched.hasReservationCTA),
    hasContactPage: Boolean(enriched.hasContactPage),
    whatsappConfidence: enriched.whatsappConfidence ?? null,
    instagramConfidence: enriched.instagramConfidence ?? null,
    verification: enriched.signalVerification ?? null,
  });

  return { ...enriched, websiteContactSignalsInterpretation };
}

/** Bounded parallel map for homepage enrichment (import batches). */
export async function enrichLeadsWithHomepageSignalsBatched(
  leads: ScoredLead[],
  batchSize = 4,
  options?: EnrichLeadHomepageOptions,
): Promise<ScoredLead[]> {
  const out: ScoredLead[] = [];
  for (let i = 0; i < leads.length; i += batchSize) {
    const slice = leads.slice(i, i + batchSize);
    const done = await Promise.all(slice.map((l) => enrichLeadWithHomepageSignals(l, options)));
    out.push(...done);
  }
  return out;
}
