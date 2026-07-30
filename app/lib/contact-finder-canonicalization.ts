/**
 * Turns a Contact Finder crawl into a safe, guarded patch onto the canonical
 * roster record.
 *
 * v3.8.2 — Hermes Guided Lead Preparation, closing the P0 the discovery
 * named: Contact Finder found real channel data and wrote it only to a
 * `localStorage` map (`contact-finder-map-v1`, explicitly documented as
 * `UI_ONLY_KEYS` in `operational-state/legacy-migration.ts`), so a founder
 * who verified a channel there saw Hermes still call it `missing_channel` —
 * because Hermes reads the roster, and the roster never heard about it.
 *
 * This module does not decide *how* the merge is written (that stays the
 * existing `operational-state` roster persistence path — see
 * `app/api/contact-finder/route.ts`); it only decides *what* is safe to
 * write, so the write site can stay a thin caller.
 *
 * Three safety rules, all explicit in the v3.8.2 brief and enforced here:
 *  - a guessed/phone-derived WhatsApp link is never marked `confirmed`
 *  - Instagram evidence never becomes WhatsApp confidence
 *  - a stronger existing confidence is never downgraded by a weaker finding
 *
 * Pure: no React, no I/O, no `server-only`, no fetch.
 */

import type { WebsiteIntelligenceSummary } from "./leads.ts";
import type { WhatsAppConfidence } from "./intelligence/whatsapp-verification.ts";
import type { SignalConfidence } from "./intelligence/confidence.ts";

const WHATSAPP_RANK: Record<WhatsAppConfidence, number> = {
  confirmed: 3,
  likely: 2,
  weak: 1,
  none: 0,
};

const SIGNAL_RANK: Record<SignalConfidence, number> = {
  confirmed: 3,
  likely: 2,
  weak: 1,
  missing: 0,
  unknown: 0,
};

function whatsappRank(value: string | null | undefined): number {
  return value && value in WHATSAPP_RANK ? WHATSAPP_RANK[value as WhatsAppConfidence] : 0;
}

function signalRank(value: string | number | null | undefined): number {
  return typeof value === "string" && value in SIGNAL_RANK
    ? SIGNAL_RANK[value as SignalConfidence]
    : 0;
}

/** Boolean website-intelligence fields: OR'd, never regressed from true to false. */
const BOOLEAN_WI_FIELDS = [
  "hasWhatsAppLink",
  "hasTelLink",
  "hasBookingCtaText",
  "hasBookingEngine",
  "hasContactPage",
  "hasInquiryForm",
  "hasSocialIcons",
  "hasOtaOutboundLinks",
  "mobileViewportPresent",
] as const satisfies readonly (keyof WebsiteIntelligenceSummary)[];

export type ContactFinderCurrentState = {
  whatsappConfidence?: string | null;
  instagramConfidence?: string | number | null;
  websiteIntelligence?: WebsiteIntelligenceSummary;
};

export type ContactFinderFindings = {
  /** A real `wa.me`/`whatsapp.com` link was found on the page — not a phone-number guess. */
  verifiedWhatsAppLink: boolean;
  /** Only a phone-derived `wa.me` link was constructed; nothing verified. */
  generatedWhatsAppOnly: boolean;
  instagramLinkFound: boolean;
  /** From the canonical `inferWebsiteIntelligenceFromHomepageHtml` — never Contact Finder's own scan. */
  websiteIntelligence: WebsiteIntelligenceSummary;
};

export type ContactFinderCanonicalPatch = {
  whatsappConfidence?: WhatsAppConfidence;
  instagramConfidence?: SignalConfidence;
  websiteIntelligence: WebsiteIntelligenceSummary;
};

/**
 * The guarded patch a Contact Finder run may apply to the canonical lead.
 *
 * Never returns a smaller claim than what is already on file, and never
 * invents a claim stronger than what was actually observed this run.
 */
export function buildContactFinderCanonicalPatch(
  current: ContactFinderCurrentState,
  found: ContactFinderFindings,
): ContactFinderCanonicalPatch {
  const patch: ContactFinderCanonicalPatch = {
    websiteIntelligence: mergeWebsiteIntelligence(current.websiteIntelligence, found.websiteIntelligence),
  };

  // A verified link outranks a generated one, which is why this is checked
  // first: if both happen to be true (should not happen, but inputs are not
  // trusted), the stronger claim wins rather than whichever branch runs last.
  if (found.verifiedWhatsAppLink) {
    const proposed: WhatsAppConfidence = "confirmed";
    if (whatsappRank(proposed) >= whatsappRank(current.whatsappConfidence)) {
      patch.whatsappConfidence = proposed;
    }
  } else if (found.generatedWhatsAppOnly) {
    // Never "confirmed" — a phone number that might answer on WhatsApp is not
    // the same fact as a link the business itself published.
    const proposed: WhatsAppConfidence = "likely";
    if (whatsappRank(proposed) >= whatsappRank(current.whatsappConfidence)) {
      patch.whatsappConfidence = proposed;
    }
  }
  // Neither found this run: the field is simply absent from the patch — a
  // transient crawl failure must never read as "we checked and there is none".

  if (found.instagramLinkFound) {
    const proposed: SignalConfidence = "confirmed";
    if (signalRank(proposed) >= signalRank(current.instagramConfidence)) {
      patch.instagramConfidence = proposed;
    }
  }

  return patch;
}

/**
 * Booleans OR together (a fact once observed stays observed); everything
 * else from this run overlays the existing record, so fields Contact Finder
 * does not compute (e.g. `directBookingMaturity`) survive untouched.
 */
function mergeWebsiteIntelligence(
  existing: WebsiteIntelligenceSummary | undefined,
  found: WebsiteIntelligenceSummary,
): WebsiteIntelligenceSummary {
  const merged: WebsiteIntelligenceSummary = { ...(existing ?? {}), ...found };
  for (const field of BOOLEAN_WI_FIELDS) {
    if (existing?.[field] === true) merged[field] = true;
  }
  return merged;
}
