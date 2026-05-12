import type { SignalConfidence } from "@/app/lib/intelligence/confidence";
import type { ScoredLead } from "@/app/lib/leads";
import { enrichScoredLeadIntelligence } from "@/app/lib/leads";
import { fetchHomepageHtml } from "@/app/lib/fetch-homepage-html";
import { extractContactSignalsFromHtml } from "@/app/lib/extract-contact-signals-from-html";
import { interpretExtractedWebsiteContactSignals } from "@/app/lib/llm/provider";

export type EnrichLeadHomepageOptions = {
  fetchTimeoutMs?: number;
};

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
    return url.toLowerCase().includes(`instagram.com/${h}`) && !url.toLowerCase().includes(`instagram.com/${h}/p/`);
  }
}

/**
 * Runs synchronous lead enrichment, then (when `website` is set) fetches the homepage once,
 * extracts contact signals, and updates confidence / extracted fields without re-running scoring.
 */
export async function enrichLeadWithHomepageSignals(
  lead: ScoredLead,
  options?: EnrichLeadHomepageOptions,
): Promise<ScoredLead> {
  const base = enrichScoredLeadIntelligence(lead);
  const websiteRaw = base.website?.trim();
  if (!websiteRaw) {
    return base;
  }

  const fetchResult = await fetchHomepageHtml(websiteRaw, {
    timeoutMs: options?.fetchTimeoutMs,
  });

  const baseWeb = (base.websiteConfidence ?? "missing") as SignalConfidence;
  const baseWa = (base.whatsappConfidence ?? "missing") as SignalConfidence;

  let finalWebsite: SignalConfidence;
  let finalWhatsapp = base.whatsappConfidence;
  let finalInstagram = base.instagramConfidence;

  let extractedPhones: string[] | undefined;
  let extractedEmails: string[] | undefined;
  let extractedSocialLinks: string[] | undefined;
  let hasReservationCTA: boolean | undefined;
  let hasContactPage: boolean | undefined;
  let turkishGsmExtracted: string[] = [];

  if (fetchResult.ok && fetchResult.html) {
    const signals = extractContactSignalsFromHtml(fetchResult.html, {
      pageUrl: fetchResult.url,
    });

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

    if (signals.turkishGsmNumbers.length > 0 || signals.whatsappLinks.length > 0) {
      finalWhatsapp = maxSignal(baseWa, "likely");
    }

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
  }

  const acq = base.acquisitionIntelligence;
  const nextAcq = acq
    ? {
        ...acq,
        websiteConfidence: finalWebsite,
        whatsappConfidence: (finalWhatsapp ?? acq.whatsappConfidence) as SignalConfidence,
        instagramConfidence: finalInstagram ?? acq.instagramConfidence,
      }
    : acq;

  const merged: ScoredLead = {
    ...base,
    websiteConfidence: finalWebsite,
    whatsappConfidence: finalWhatsapp ?? base.whatsappConfidence,
    instagramConfidence: finalInstagram ?? base.instagramConfidence,
    extractedPhones,
    extractedEmails,
    extractedSocialLinks,
    hasReservationCTA,
    hasContactPage,
    acquisitionIntelligence: nextAcq ?? base.acquisitionIntelligence,
  };

  const websiteContactSignalsInterpretation = await interpretExtractedWebsiteContactSignals({
    websiteConfidence: finalWebsite,
    extractedPhones: merged.extractedPhones ?? [],
    turkishGsmNumbers: turkishGsmExtracted,
    emails: merged.extractedEmails ?? [],
    socialLinks: merged.extractedSocialLinks ?? [],
    hasReservationCTA: Boolean(merged.hasReservationCTA),
    hasContactPage: Boolean(merged.hasContactPage),
    whatsappConfidence: merged.whatsappConfidence ?? null,
    instagramConfidence: merged.instagramConfidence ?? null,
  });

  return { ...merged, websiteContactSignalsInterpretation };
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
