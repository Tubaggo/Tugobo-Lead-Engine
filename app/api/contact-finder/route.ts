import { NextResponse } from "next/server";
import type { SignalConfidence } from "@/app/lib/intelligence/confidence";
import type { WhatsAppConfidence } from "@/app/lib/intelligence/whatsapp-verification";
import { withAdminSession } from "@/app/lib/auth/require-admin-session";
import { extractContactSignalsFromHtml } from "@/app/lib/extract-contact-signals-from-html";
import { inferWebsiteIntelligenceFromHomepageHtml } from "@/app/lib/website-html-intelligence";
import { buildContactFinderCanonicalPatch } from "@/app/lib/contact-finder-canonicalization";
import { getRoster, putRoster } from "@/app/lib/operational-state/repository";
import { isValidLeadId } from "@/app/lib/operational-state/lead-id";
import type { ScoredLead, WebsiteIntelligenceSummary } from "@/app/lib/leads";

/**
 * Contact Finder — v3.8.2 canonicalization.
 *
 * v3.7.x behaviour is preserved for the preview (crawl a homepage, recommend
 * the best contact surface); what changes is where the underlying channel
 * signals land. Two duplications this route used to own are gone:
 *
 *  1. Its own HTML-scanning regexes for booking CTA / booking engine /
 *     contact page / inquiry form / social icons / OTA links / viewport are
 *     replaced by the canonical `inferWebsiteIntelligenceFromHomepageHtml`
 *     (`website-html-intelligence.ts`) — the same function the real
 *     import/re-enrichment pipeline uses. One HTML→signal reading, not two
 *     that can silently drift apart.
 *  2. Its own WhatsApp/Instagram/email link regexes are replaced by
 *     `extractContactSignalsFromHtml`, the same extractor
 *     `enrich-lead-homepage.ts` already uses.
 *
 * What is genuinely Contact Finder's own — "which single contact surface
 * should the founder use" (`pickBestContact`) and Turkish phone
 * classification — stays local; that decision has no canonical owner
 * elsewhere because nothing else needs to make it.
 *
 * New: when the caller supplies a `leadId` that the roster already knows,
 * a verified finding is merged into the canonical roster through the same
 * `putRoster` path import/re-enrichment already uses — guarded so a weaker
 * finding can never downgrade a stronger one, a phone-derived guess can
 * never read as "confirmed", and Instagram evidence can never become
 * WhatsApp confidence. `canonicalPersisted` in the response tells the
 * caller whether that actually happened; a `false` must never be shown to
 * the founder as "verified".
 */

type ContactFinderType =
  | "VERIFIED_WHATSAPP"
  | "GENERATED_WHATSAPP"
  | "PHONE_ONLY"
  | "instagram"
  | "email"
  | "website";

type ContactFinderConfidence = "high" | "medium" | "low";

type ContactFinderResponse = {
  bestContactType: ContactFinderType;
  bestContactValue: string;
  confidence: ContactFinderConfidence;
  foundPhones: string[];
  foundEmails: string[];
  foundInstagram: string[];
  foundWhatsapp: string[];
  source:
    | "Website WhatsApp link"
    | "Website phone number"
    | "Website Instagram link"
    | "Website email"
    | "Website homepage";
  reason: string;
  websiteIntelligence?: WebsiteIntelligenceSummary;
  /** True only when the finding was actually merged into the canonical roster. */
  canonicalPersisted: boolean;
};

function normalizeWebsite(input: string): string {
  const raw = input.trim();
  if (!raw) return "";
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function uniq(items: string[]): string[] {
  return Array.from(new Set(items.map((v) => v.trim()).filter(Boolean)));
}

function classifyPhones(candidates: string[]): { mobile: string[]; landline: string[] } {
  const mobile: string[] = [];
  const landline: string[] = [];

  for (const candidate of candidates) {
    let d = candidate.replace(/\D/g, "");
    if (!d) continue;
    while (d.startsWith("00") && d.length > 2) d = d.slice(2);
    if (d.startsWith("90") && d.length > 2) d = d.slice(2);

    if (d.length === 10) {
      if (d.startsWith("5")) mobile.push(candidate.trim());
      else if (d.startsWith("2") || d.startsWith("3")) landline.push(candidate.trim());
      continue;
    }
    if (d.length === 11 && d.startsWith("0")) {
      if (d[1] === "5") mobile.push(candidate.trim());
      else if (d[1] === "2" || d[1] === "3") landline.push(candidate.trim());
    }
  }

  return { mobile: uniq(mobile), landline: uniq(landline) };
}

function toWaMeFromPhone(phone: string): string | null {
  let d = phone.replace(/\D/g, "");
  if (!d) return null;
  while (d.startsWith("00") && d.length > 2) d = d.slice(2);
  if (d.startsWith("90")) {
    return d.length >= 12 ? `https://wa.me/${d}` : null;
  }
  if (d.startsWith("0")) {
    const intl = `90${d.slice(1)}`;
    return intl.length >= 12 ? `https://wa.me/${intl}` : null;
  }
  if (d.length === 10) {
    return `https://wa.me/90${d}`;
  }
  return null;
}

function normalizeWhatsAppLinkToWaMe(link: string): string {
  const raw = link.trim();
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();

    if (host === "wa.me" || host.endsWith(".wa.me")) {
      const phone = u.pathname.replace(/\//g, "");
      if (!phone) return raw;
      const text = u.searchParams.get("text");
      return text
        ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
        : `https://wa.me/${phone}`;
    }

    if (host.includes("whatsapp.com")) {
      const pathParts = u.pathname.split("/").filter(Boolean);
      const sendPhone = u.searchParams.get("phone");
      const pathPhone = pathParts.length > 0 ? pathParts[pathParts.length - 1] : null;
      const phone = (sendPhone || pathPhone || "").replace(/\D/g, "");
      if (!phone) return raw;
      const text = u.searchParams.get("text");
      return text
        ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
        : `https://wa.me/${phone}`;
    }
    return raw;
  } catch {
    return raw;
  }
}

function pickBestContact(data: {
  website: string;
  whatsapp: string[];
  mobile: string[];
  landline: string[];
  instagram: string[];
  emails: string[];
}): Omit<ContactFinderResponse, "websiteIntelligence" | "canonicalPersisted"> {
  if (data.whatsapp.length > 0) {
    const normalized = normalizeWhatsAppLinkToWaMe(data.whatsapp[0]);
    return {
      bestContactType: "VERIFIED_WHATSAPP",
      bestContactValue: normalized,
      confidence: "high",
      foundPhones: [...data.mobile, ...data.landline],
      foundEmails: data.emails,
      foundInstagram: data.instagram,
      foundWhatsapp: data.whatsapp,
      source: "Website WhatsApp link",
      reason: "WhatsApp link found on website",
    };
  }

  if (data.mobile.length > 0) {
    const generated = toWaMeFromPhone(data.mobile[0]);
    if (generated) {
      return {
        bestContactType: "GENERATED_WHATSAPP",
        bestContactValue: generated,
        confidence: "medium",
        foundPhones: [...data.mobile, ...data.landline],
        foundEmails: data.emails,
        foundInstagram: data.instagram,
        foundWhatsapp: data.whatsapp,
        source: "Website phone number",
        reason: "Phone number is active on WhatsApp",
      };
    }
    return {
      bestContactType: "PHONE_ONLY",
      bestContactValue: data.mobile[0],
      confidence: "medium",
      foundPhones: [...data.mobile, ...data.landline],
      foundEmails: data.emails,
      foundInstagram: data.instagram,
      foundWhatsapp: data.whatsapp,
      source: "Website phone number",
      reason: "No WhatsApp detected",
    };
  }

  if (data.landline.length > 0) {
    return {
      bestContactType: "PHONE_ONLY",
      bestContactValue: data.landline[0],
      confidence: "low",
      foundPhones: [...data.mobile, ...data.landline],
      foundEmails: data.emails,
      foundInstagram: data.instagram,
      foundWhatsapp: data.whatsapp,
      source: "Website phone number",
      reason: "No WhatsApp detected",
    };
  }

  if (data.instagram.length > 0) {
    return {
      bestContactType: "instagram",
      bestContactValue: data.instagram[0],
      confidence: "medium",
      foundPhones: [...data.mobile, ...data.landline],
      foundEmails: data.emails,
      foundInstagram: data.instagram,
      foundWhatsapp: data.whatsapp,
      source: "Website Instagram link",
      reason: "Instagram link found on homepage",
    };
  }

  if (data.emails.length > 0) {
    return {
      bestContactType: "email",
      bestContactValue: data.emails[0],
      confidence: "medium",
      foundPhones: [...data.mobile, ...data.landline],
      foundEmails: data.emails,
      foundInstagram: data.instagram,
      foundWhatsapp: data.whatsapp,
      source: "Website email",
      reason: "Email address found on homepage",
    };
  }

  return {
    bestContactType: "website",
    bestContactValue: data.website,
    confidence: data.landline.length > 0 ? "low" : "medium",
    foundPhones: [...data.mobile, ...data.landline],
    foundEmails: data.emails,
    foundInstagram: data.instagram,
    foundWhatsapp: data.whatsapp,
    source: "Website homepage",
    reason:
      data.landline.length > 0
        ? "Only landline found"
        : "No direct channel found; fallback to website homepage",
  };
}

/**
 * Merges a guarded canonical patch into the one roster entry matching
 * `leadId`, and persists via the existing `putRoster` path. Returns whether
 * anything was actually written — `false` when the lead is unknown, which
 * the caller must treat as "not verified", not as a soft failure.
 */
async function canonicalizeIntoRoster(
  leadId: string,
  patch: { whatsappConfidence?: WhatsAppConfidence; instagramConfidence?: SignalConfidence; websiteIntelligence: WebsiteIntelligenceSummary },
): Promise<boolean> {
  const roster = await getRoster();
  const index = roster.findIndex((lead) => lead.id === leadId);
  if (index === -1) return false;

  const current = roster[index];
  const next: ScoredLead = {
    ...current,
    websiteIntelligence: patch.websiteIntelligence,
    ...(patch.whatsappConfidence ? { whatsappConfidence: patch.whatsappConfidence } : {}),
    ...(patch.instagramConfidence ? { instagramConfidence: patch.instagramConfidence } : {}),
  };

  const updatedRoster = [...roster];
  updatedRoster[index] = next;
  await putRoster(updatedRoster);
  return true;
}

async function handlePOST(req: Request) {
  let body: { website?: string; phone?: string; instagram?: string; leadId?: string };
  try {
    body = (await req.json()) as {
      website?: string;
      phone?: string;
      instagram?: string;
      leadId?: string;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const leadId = typeof body.leadId === "string" && isValidLeadId(body.leadId) ? body.leadId : null;

  const url = normalizeWebsite(body.website ?? "");
  if (!url) {
    // No website — try phone then instagram as fallback contact surfaces.
    // No HTML was fetched, so there is no `websiteIntelligence` to
    // canonicalize; these fallbacks stay preview-only, exactly as before.
    const phone = body.phone?.trim() ?? "";
    const instagram = body.instagram?.trim() ?? "";
    if (phone) {
      const waLink = toWaMeFromPhone(phone);
      if (waLink) {
        return NextResponse.json({
          bestContactType: "GENERATED_WHATSAPP",
          bestContactValue: waLink,
          confidence: "medium",
          foundPhones: [phone],
          foundEmails: [],
          foundInstagram: [],
          foundWhatsapp: [waLink],
          source: "Website phone number",
          reason: "WhatsApp path via listing phone (no website available)",
          canonicalPersisted: false,
        } satisfies ContactFinderResponse);
      }
      return NextResponse.json({
        bestContactType: "PHONE_ONLY",
        bestContactValue: phone,
        confidence: "low",
        foundPhones: [phone],
        foundEmails: [],
        foundInstagram: [],
        foundWhatsapp: [],
        source: "Website phone number",
        reason: "Phone fallback (no website, no mobile WA path)",
        canonicalPersisted: false,
      } satisfies ContactFinderResponse);
    }
    if (instagram) {
      return NextResponse.json({
        bestContactType: "instagram",
        bestContactValue: instagram,
        confidence: "medium",
        foundPhones: [],
        foundEmails: [],
        foundInstagram: [instagram],
        foundWhatsapp: [],
        source: "Website Instagram link",
        reason: "Instagram fallback (no website available)",
        canonicalPersisted: false,
      } satisfies ContactFinderResponse);
    }
    return NextResponse.json({ error: "website, phone, or instagram is required" }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TugoboContactFinder/1.0)",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Website request failed (${res.status})` },
        { status: 502 },
      );
    }

    const html = await res.text();

    // Canonical extraction — the same functions the real import/re-enrichment
    // pipeline uses. No regex here is Contact Finder's own anymore.
    const signals = extractContactSignalsFromHtml(html, { pageUrl: url });
    const foundWhatsapp = signals.whatsappLinks;
    const foundInstagram = signals.instagramLinks;
    const foundEmails = signals.emails;
    const phones = classifyPhones([...signals.phones, ...signals.turkishGsmNumbers]);

    const websiteIntelligence = inferWebsiteIntelligenceFromHomepageHtml(html, {
      hasWhatsAppLink: foundWhatsapp.length > 0,
    });

    const picked = pickBestContact({
      website: url,
      whatsapp: foundWhatsapp,
      mobile: phones.mobile,
      landline: phones.landline,
      instagram: foundInstagram,
      emails: foundEmails,
    });

    let canonicalPersisted = false;
    if (leadId) {
      try {
        const roster = await getRoster();
        const current = roster.find((lead) => lead.id === leadId);
        const patch = buildContactFinderCanonicalPatch(
          {
            whatsappConfidence: current?.whatsappConfidence ?? null,
            instagramConfidence: current?.instagramConfidence ?? null,
            websiteIntelligence: current?.websiteIntelligence,
          },
          {
            verifiedWhatsAppLink: foundWhatsapp.length > 0,
            generatedWhatsAppOnly: foundWhatsapp.length === 0 && phones.mobile.length > 0,
            instagramLinkFound: foundInstagram.length > 0,
            websiteIntelligence,
          },
        );
        canonicalPersisted = await canonicalizeIntoRoster(leadId, patch);
      } catch {
        // A failed canonical write must not fail the whole request — the
        // founder still gets the preview, just correctly marked unverified.
        canonicalPersisted = false;
      }
    }

    return NextResponse.json({
      ...picked,
      websiteIntelligence,
      canonicalPersisted,
    } satisfies ContactFinderResponse);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch or analyze website" },
      { status: 502 },
    );
  }
}

/** Protected: unauthenticated callers get a generic JSON 401. */
export const POST = withAdminSession(handlePOST);
