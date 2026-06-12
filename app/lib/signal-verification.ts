/**
 * Signal Verification + ICP Discovery Engine v1.3.
 *
 * Verifies WhatsApp / website / Instagram / reservation signals across the
 * homepage plus a bounded set of discovered subpages (contact, reservation,
 * about), classifies chain vs. independent ownership, and produces a separate
 * `icpFitScore` (0–100). Does not touch Lead Score / Hot Score / Operational
 * Value calculations.
 */

import {
  fetchHomepageHtml,
  type FetchHomepageHtmlResult,
} from "./fetch-homepage-html";
import {
  extractContactSignalsFromHtml,
  type ContactSignalsExtraction,
} from "./extract-contact-signals-from-html";
import {
  buildWhatsappSurfaceMeta,
  type WhatsAppSurfaceMeta,
} from "./intelligence/whatsapp-verification";

export type WhatsappVerificationState = "verified" | "likely" | "not_found";
export type WebsiteVerificationState = "verified" | "reachable" | "broken" | "not_found";
export type InstagramVerificationState = "verified" | "likely" | "candidate" | "not_found";
export type ReservationSignalState = "verified" | "detected" | "not_found";
export type BusinessOwnershipType = "independent" | "chain" | "unknown";

/** Stable evidence-source keys (v1.4) — localized for display in the UI. */
export type SignalSourceKey =
  | "homepage"
  | "contact_page"
  | "reservation_page"
  | "about_page"
  | "footer_link"
  | "social_section"
  | "official_website"
  | "google_maps"
  | "google_business_profile"
  | "detected_candidate";

export type SignalVerificationProfile = {
  whatsappVerification: WhatsappVerificationState;
  /** 0–100 */
  whatsappConfidence: number;
  /** Where the WhatsApp evidence was found (v1.4). */
  whatsappSource?: SignalSourceKey;
  whatsappSourceUrl?: string;
  websiteVerification: WebsiteVerificationState;
  /** 0–100 */
  websiteConfidence: number;
  websiteSource?: SignalSourceKey;
  websiteSourceUrl?: string;
  instagramVerification: InstagramVerificationState;
  /** 0–100 */
  instagramConfidence: number;
  instagramSource?: SignalSourceKey;
  instagramSourceUrl?: string;
  reservationSignal: ReservationSignalState;
  /** 0–100 */
  reservationConfidence: number;
  reservationSource?: SignalSourceKey;
  reservationSourceUrl?: string;
  businessOwnershipType: BusinessOwnershipType;
  /** Matched brand label when {@link businessOwnershipType} is "chain". */
  chainBrand?: string;
  /** Pages used for verification (homepage + discovered subpages, max 5). */
  discoveredPages: string[];
  /** ISO datetime of this verification run. */
  verifiedAt: string;
};

const MAX_PAGES_PER_BUSINESS = 5;
const SUBPAGE_TIMEOUT_MS = 8_000;
const SUBPAGE_MAX_BYTES = 1024 * 1024;

/** Likely high-signal paths probed in order (contact → reservation → about). */
const IMPORTANT_PAGE_PATHS = [
  "/contact",
  "/contact-us",
  "/contactus",
  "/iletisim",
  "/bize-ulasin",
  "/rezervasyon",
  "/reservation",
  "/book",
  "/book-now",
  "/booking",
  "/about",
  "/about-us",
  "/hakkimizda",
] as const;

/** Brand keywords for corporate chain classification (name or website host). */
const CHAIN_BRAND_PATTERNS: { brand: string; pattern: RegExp }[] = [
  { brand: "Hilton", pattern: /\bhilton\b/i },
  { brand: "DoubleTree", pattern: /\bdouble\s*tree\b/i },
  { brand: "Hampton", pattern: /\bhampton\b/i },
  { brand: "Dedeman", pattern: /\bdedeman\b/i },
  { brand: "Radisson", pattern: /\bradisson\b/i },
  { brand: "Ramada", pattern: /\bramada\b/i },
  { brand: "Wyndham", pattern: /\bwyndham\b/i },
  { brand: "Marriott", pattern: /\bmarriott\b/i },
  { brand: "Sheraton", pattern: /\bsheraton\b/i },
  { brand: "Holiday Inn", pattern: /\bholiday\s*inn\b/i },
  { brand: "Crowne Plaza", pattern: /\bcrowne\s*plaza\b/i },
  { brand: "Novotel", pattern: /\bnovotel\b/i },
  { brand: "Ibis", pattern: /\bibis\b/i },
  { brand: "Accor", pattern: /\baccor\b/i },
  { brand: "Swissôtel", pattern: /\bswiss[oô]tel\b/i },
  { brand: "Mercure", pattern: /\bmercure\b/i },
  { brand: "Best Western", pattern: /\bbest\s*western\b/i },
];

const clamp100 = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Classify chain vs. independent from business name and (optionally) website host.
 * Classification only — never used to reduce Lead/Hot scores.
 */
export function detectBusinessOwnership(
  businessName: string,
  websiteHost?: string | null,
): { type: BusinessOwnershipType; brand?: string } {
  const name = businessName?.trim() ?? "";
  const host = websiteHost?.trim() ?? "";
  if (!name && !host) return { type: "unknown" };
  for (const { brand, pattern } of CHAIN_BRAND_PATTERNS) {
    if ((name && pattern.test(name)) || (host && pattern.test(host.replace(/[.-]/g, " ")))) {
      return { type: "chain", brand };
    }
  }
  if (!name) return { type: "unknown" };
  return { type: "independent" };
}

function safeOrigin(pageUrl: string): string | null {
  try {
    return new URL(pageUrl).origin;
  } catch {
    return null;
  }
}

function pathDepthOk(url: string): boolean {
  try {
    const u = new URL(url);
    return u.pathname.split("/").filter(Boolean).length <= 3;
  } catch {
    return false;
  }
}

/**
 * Discover likely high-signal URLs for one business: same-origin contact /
 * reservation / about links found in the homepage HTML, then well-known paths.
 * Returns at most `maxPages` URLs (homepage excluded).
 */
export function discoverImportantPages(
  homepageUrl: string,
  homepageHtml: string,
  maxPages = MAX_PAGES_PER_BUSINESS - 1,
): string[] {
  const origin = safeOrigin(homepageUrl);
  if (!origin) return [];

  const out: string[] = [];
  const seen = new Set<string>([homepageUrl.replace(/\/+$/, "")]);
  const push = (url: string) => {
    const key = url.replace(/\/+$/, "");
    if (seen.has(key) || out.length >= maxPages) return;
    seen.add(key);
    out.push(url);
  };

  // Real links from the homepage first — they reflect the site's actual structure.
  const extracted = extractContactSignalsFromHtml(homepageHtml, { pageUrl: homepageUrl });
  for (const link of extracted.contactPageLinks) {
    if (!link.startsWith(origin)) continue;
    if (!pathDepthOk(link)) continue;
    push(link.split("#")[0]);
    if (out.length >= maxPages) return out;
  }

  // Then probe the conventional paths.
  for (const path of IMPORTANT_PAGE_PATHS) {
    push(`${origin}${path}`);
    if (out.length >= maxPages) break;
  }
  return out;
}

function mergeExtractions(parts: ContactSignalsExtraction[]): ContactSignalsExtraction {
  const uniq = (lists: string[][]) => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const list of lists) {
      for (const raw of list) {
        const v = raw.trim();
        if (!v || seen.has(v)) continue;
        seen.add(v);
        out.push(v);
      }
    }
    return out;
  };
  return {
    phones: uniq(parts.map((p) => p.phones)),
    turkishGsmNumbers: uniq(parts.map((p) => p.turkishGsmNumbers)),
    emails: uniq(parts.map((p) => p.emails)),
    instagramLinks: uniq(parts.map((p) => p.instagramLinks)),
    facebookLinks: uniq(parts.map((p) => p.facebookLinks)),
    whatsappLinks: uniq(parts.map((p) => p.whatsappLinks)),
    reservationBookingCtaSnippets: uniq(parts.map((p) => p.reservationBookingCtaSnippets)),
    contactPageLinks: uniq(parts.map((p) => p.contactPageLinks)),
  };
}

function mergeWaMetas(metas: WhatsAppSurfaceMeta[]): WhatsAppSurfaceMeta {
  const withLinks = metas.filter(
    (m) => m.validatedLinkCount > 0 || m.allLinksInvalid || m.mixedValidation,
  );
  return {
    validatedLinkCount: metas.reduce((acc, m) => acc + m.validatedLinkCount, 0),
    allLinksInvalid:
      withLinks.length > 0 && withLinks.every((m) => m.allLinksInvalid) &&
      metas.every((m) => m.validatedLinkCount === 0),
    mixedValidation: metas.some((m) => m.mixedValidation),
    bestValidTr90Digits:
      metas.map((m) => m.bestValidTr90Digits).find((d) => Boolean(d)) ?? null,
    htmlHints: {
      hasIconOrButton: metas.some((m) => m.htmlHints.hasIconOrButton),
      strongCtaImpliesWa: metas.some((m) => m.htmlHints.strongCtaImpliesWa),
      suspiciousWaHref: metas.some((m) => m.htmlHints.suspiciousWaHref),
    },
  };
}

/** Per-page signal extraction — retained so v1.4 can attribute evidence sources. */
export type PageScan = {
  url: string;
  html: string;
  extraction: ContactSignalsExtraction;
  waMeta: WhatsAppSurfaceMeta;
};

export type MultiPageSignalScan = {
  /** Homepage fetch result (provided or fetched here). */
  homepage: FetchHomepageHtmlResult;
  /** All page URLs that contributed signals (homepage first). */
  scannedPages: string[];
  /** Per-page extractions (homepage first) for evidence-source attribution. */
  pages: PageScan[];
  /** Signals merged across every successfully fetched page. */
  merged: ContactSignalsExtraction;
  /** WhatsApp surface meta merged across pages. */
  waMeta: WhatsAppSurfaceMeta;
};

/**
 * Fetches up to {@link MAX_PAGES_PER_BUSINESS} pages (homepage + discovered
 * subpages) and merges contact/booking signals. A pre-fetched homepage can be
 * passed to avoid a duplicate request.
 */
export async function scanLeadPagesForSignals(
  websiteUrl: string,
  preFetchedHomepage?: { url: string; html: string },
): Promise<MultiPageSignalScan | null> {
  const homepage: FetchHomepageHtmlResult = preFetchedHomepage
    ? { ok: true, url: preFetchedHomepage.url, html: preFetchedHomepage.html }
    : await fetchHomepageHtml(websiteUrl);

  if (!homepage.ok || !homepage.html) return null;

  const homeExtraction = extractContactSignalsFromHtml(homepage.html, { pageUrl: homepage.url });
  const pages: PageScan[] = [
    {
      url: homepage.url,
      html: homepage.html,
      extraction: homeExtraction,
      waMeta: buildWhatsappSurfaceMeta(homepage.html, homeExtraction.whatsappLinks),
    },
  ];

  const candidates = discoverImportantPages(homepage.url, homepage.html).slice(
    0,
    MAX_PAGES_PER_BUSINESS - 1,
  );
  const results = await Promise.all(candidates.map((u) => fetchHomepageSubPage(u)));
  for (const res of results) {
    if (pages.length >= MAX_PAGES_PER_BUSINESS) break;
    if (!res.ok || !res.html) continue;
    const extraction = extractContactSignalsFromHtml(res.html, { pageUrl: res.url });
    pages.push({
      url: res.url,
      html: res.html,
      extraction,
      waMeta: buildWhatsappSurfaceMeta(res.html, extraction.whatsappLinks),
    });
  }

  return {
    homepage,
    scannedPages: pages.map((p) => p.url),
    pages,
    merged: mergeExtractions(pages.map((p) => p.extraction)),
    waMeta: mergeWaMetas(pages.map((p) => p.waMeta)),
  };
}

/** Single bounded GET that keeps the exact path (no `/` normalization). */
async function fetchHomepageSubPage(pageUrl: string): Promise<FetchHomepageHtmlResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUBPAGE_TIMEOUT_MS);
  try {
    const res = await fetch(pageUrl, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0 (compatible; TugoboLeadEngine/1.3; +signal-verification)",
      },
    });
    if (!res.ok) return { ok: false, url: res.url || pageUrl, error: `HTTP ${res.status}` };
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) {
      return { ok: false, url: res.url || pageUrl, error: `Skipped content-type ${contentType}` };
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > SUBPAGE_MAX_BYTES) {
      return { ok: false, url: res.url || pageUrl, error: "Subpage too large" };
    }
    const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    return { ok: true, url: res.url || pageUrl, html };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, url: pageUrl, error: message };
  } finally {
    clearTimeout(timer);
  }
}

const RESERVATION_INTENT_HINT =
  /(rezervasyon|reservation|booking|book\s*now|book(?!let)|reserve|online\s*rezervasyon|hemen\s*rezervasyon|online\s*booking)/i;

export type VerificationBuildInput = {
  businessName: string;
  /** Normalized homepage host or URL recorded on the lead (Google or candidate). */
  websiteUrl?: string | null;
  /** Whether the homepage URL fetch succeeded; null when never attempted. */
  websiteFetchOk: boolean | null;
  /** Error string from the failed homepage fetch, when any. */
  websiteFetchError?: string | null;
  /** Lead's known Instagram handle (may be a name-based assumption). */
  instagramHandle?: string | null;
  /** Listing phone is a usable TR mobile (WhatsApp path). */
  listingPhoneIsMobile: boolean;
  /** Where the website URL was obtained — drives the website evidence source (v1.4). */
  websiteOrigin?: "google" | "candidate" | null;
  scan?: MultiPageSignalScan | null;
};

function normalizeIgHandle(handle?: string | null): string | null {
  const h = handle?.trim().replace(/^@+/, "");
  return h ? h.toLowerCase() : null;
}

function igLinkMatchesHandle(url: string, handle: string): boolean {
  try {
    const u = new URL(url);
    if (!u.hostname.toLowerCase().includes("instagram.com")) return false;
    const seg = u.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
    return seg === handle;
  } catch {
    return url.toLowerCase().includes(`instagram.com/${handle}`);
  }
}

function verifyWhatsapp(input: VerificationBuildInput): {
  state: WhatsappVerificationState;
  confidence: number;
} {
  const scan = input.scan;
  const links = scan?.merged.whatsappLinks ?? [];
  const meta = scan?.waMeta;

  if (links.length > 0 && !meta?.allLinksInvalid) {
    // Official wa.me / api.whatsapp.com evidence.
    const validated = (meta?.validatedLinkCount ?? 0) > 0;
    return { state: "verified", confidence: validated ? 100 : 90 };
  }

  let score = 0;
  if (meta?.htmlHints.hasIconOrButton) score += 35;
  if (meta?.htmlHints.strongCtaImpliesWa) score += 25;
  if ((scan?.merged.turkishGsmNumbers.length ?? 0) > 0) score += 25;
  if (input.listingPhoneIsMobile) score += 35;
  if (links.length > 0 && meta?.allLinksInvalid) score = Math.min(score, 45);

  if (score >= 35) return { state: "likely", confidence: clamp100(Math.min(score, 80)) };
  return { state: "not_found", confidence: 0 };
}

function verifyWebsite(input: VerificationBuildInput): {
  state: WebsiteVerificationState;
  confidence: number;
} {
  if (!input.websiteUrl?.trim()) return { state: "not_found", confidence: 0 };
  if (input.websiteFetchOk === false) {
    return { state: "broken", confidence: 12 };
  }
  const scan = input.scan;
  if (!scan) {
    // URL on record but never fetched in this run.
    return { state: "reachable", confidence: 45 };
  }
  const m = scan.merged;
  const meaningfulSignals =
    (m.phones.length > 0 ? 1 : 0) +
    (m.emails.length > 0 ? 1 : 0) +
    (m.whatsappLinks.length > 0 ? 1 : 0) +
    (m.instagramLinks.length > 0 || m.facebookLinks.length > 0 ? 1 : 0) +
    (m.reservationBookingCtaSnippets.length > 0 ? 1 : 0) +
    (m.contactPageLinks.length > 0 ? 1 : 0);
  const contentLength = scan.homepage.html?.length ?? 0;

  if (meaningfulSignals >= 2 || (meaningfulSignals >= 1 && contentLength > 20_000)) {
    const score = 82 + Math.min(16, meaningfulSignals * 4) + (scan.scannedPages.length > 1 ? 2 : 0);
    return { state: "verified", confidence: clamp100(score) };
  }
  if (contentLength > 2_000) {
    return { state: "reachable", confidence: clamp100(55 + meaningfulSignals * 5) };
  }
  return { state: "reachable", confidence: 45 };
}

function verifyInstagram(input: VerificationBuildInput): {
  state: InstagramVerificationState;
  confidence: number;
} {
  const handle = normalizeIgHandle(input.instagramHandle);
  const igLinks = input.scan?.merged.instagramLinks ?? [];

  if (handle && igLinks.some((u) => igLinkMatchesHandle(u, handle))) {
    return { state: "verified", confidence: 95 };
  }
  if (igLinks.length > 0) {
    return { state: "likely", confidence: 72 };
  }
  if (handle) {
    // Name-based assumption only — surfaced as a candidate account.
    return { state: "candidate", confidence: 55 };
  }
  return { state: "not_found", confidence: 0 };
}

function verifyReservation(input: VerificationBuildInput): {
  state: ReservationSignalState;
  confidence: number;
} {
  const scan = input.scan;
  if (!scan) return { state: "not_found", confidence: 0 };

  const ctaCount = scan.merged.reservationBookingCtaSnippets.length;
  if (ctaCount > 0) {
    return { state: "verified", confidence: clamp100(82 + Math.min(14, ctaCount * 3)) };
  }

  const reservationPathLink = scan.merged.contactPageLinks.some((u) =>
    /rezervasyon|reservation|book/i.test(u),
  );
  const reservationPageScanned = scan.scannedPages.some((u) =>
    /rezervasyon|reservation|book/i.test(u),
  );
  const textIntent = RESERVATION_INTENT_HINT.test(scan.homepage.html ?? "");
  if (reservationPathLink || reservationPageScanned || textIntent) {
    return { state: "detected", confidence: 55 };
  }
  return { state: "not_found", confidence: 0 };
}

/** Classify a scanned page URL into an evidence-source key by its path. */
function classifyPageSource(url: string): SignalSourceKey {
  let path = "";
  try {
    const u = new URL(url);
    path = u.pathname.toLowerCase();
  } catch {
    path = url.toLowerCase();
  }
  if (path === "/" || path === "") return "homepage";
  if (/iletisim|contact|bize-ulasin|reach-us|get-in-touch|kontakt/.test(path)) return "contact_page";
  if (/rezervasyon|reservation|book/.test(path)) return "reservation_page";
  if (/hakkimizda|about/.test(path)) return "about_page";
  return "official_website";
}

/** Light heuristic: is `needle` inside a footer region of the homepage HTML? */
function isInFooter(html: string | undefined, needle: string): boolean {
  if (!html) return false;
  const lower = html.toLowerCase();
  const idx = lower.lastIndexOf(needle.toLowerCase());
  if (idx === -1) return false;
  const footerIdx = lower.lastIndexOf("<footer");
  if (footerIdx !== -1 && idx >= footerIdx) return true;
  return idx >= lower.length * 0.8;
}

/** Find the first page whose extraction satisfies `pick`, returning source + URL. */
function findSignalSource(
  scan: MultiPageSignalScan | null | undefined,
  pick: (e: ContactSignalsExtraction) => string | undefined,
): { source: SignalSourceKey; url?: string } | null {
  if (!scan) return null;
  for (const page of scan.pages) {
    const hit = pick(page.extraction);
    if (hit) {
      let source = classifyPageSource(page.url);
      if (source === "homepage" && isInFooter(page.html, hit)) source = "footer_link";
      return { source, url: hit };
    }
  }
  return null;
}

/** Builds the full verification profile from one multi-page scan (pure). */
export function buildSignalVerificationProfile(
  input: VerificationBuildInput,
): SignalVerificationProfile {
  const wa = verifyWhatsapp(input);
  const web = verifyWebsite(input);
  const ig = verifyInstagram(input);
  const cta = verifyReservation(input);
  const ownership = detectBusinessOwnership(input.businessName, input.websiteUrl ?? null);
  const scan = input.scan;

  // WhatsApp source: prefer the page carrying the link; else the listing (GBP).
  const waSrc = findSignalSource(scan, (e) => e.whatsappLinks[0]);
  const whatsappSource: SignalSourceKey | undefined =
    wa.state === "not_found"
      ? undefined
      : waSrc?.source ?? (input.listingPhoneIsMobile ? "google_business_profile" : undefined);
  const whatsappSourceUrl = waSrc?.url;

  // Website source: where the URL came from (Google Maps vs. discovered candidate).
  const websiteSource: SignalSourceKey | undefined =
    web.state === "not_found"
      ? undefined
      : input.websiteOrigin === "candidate"
        ? "detected_candidate"
        : input.websiteUrl
          ? "google_maps"
          : undefined;
  const websiteSourceUrl = input.websiteUrl?.trim()
    ? scan?.homepage.url ?? input.websiteUrl
    : undefined;

  // Instagram source: page carrying the IG link; candidate handle has no URL source.
  const igHandle = normalizeIgHandle(input.instagramHandle);
  const igSrc =
    findSignalSource(scan, (e) =>
      igHandle
        ? e.instagramLinks.find((u) => igLinkMatchesHandle(u, igHandle)) ?? e.instagramLinks[0]
        : e.instagramLinks[0],
    ) ?? null;
  const instagramSource: SignalSourceKey | undefined =
    ig.state === "not_found"
      ? undefined
      : ig.state === "candidate"
        ? "detected_candidate"
        : igSrc
          ? igSrc.source === "homepage"
            ? "social_section"
            : igSrc.source
          : undefined;
  const instagramSourceUrl = igSrc?.url;

  // Reservation source: page carrying the booking CTA snippet.
  const resSrc = findSignalSource(scan, (e) =>
    e.reservationBookingCtaSnippets.length > 0 ? e.reservationBookingCtaSnippets[0] : undefined,
  );
  const reservationSourceUrl = (() => {
    if (cta.state === "not_found" || !scan) return undefined;
    const page = scan.pages.find((p) => p.extraction.reservationBookingCtaSnippets.length > 0);
    return page?.url;
  })();
  const reservationSource: SignalSourceKey | undefined =
    cta.state === "not_found" ? undefined : resSrc?.source ?? "homepage";

  return {
    whatsappVerification: wa.state,
    whatsappConfidence: wa.confidence,
    whatsappSource,
    whatsappSourceUrl,
    websiteVerification: web.state,
    websiteConfidence: web.confidence,
    websiteSource,
    websiteSourceUrl,
    instagramVerification: ig.state,
    instagramConfidence: ig.confidence,
    instagramSource,
    instagramSourceUrl,
    reservationSignal: cta.state,
    reservationConfidence: cta.confidence,
    reservationSource,
    reservationSourceUrl,
    businessOwnershipType: ownership.type,
    chainBrand: ownership.brand,
    discoveredPages: input.scan?.scannedPages ?? [],
    verifiedAt: new Date().toISOString(),
  };
}

/** One-line Turkish summary stored in lead memory as `lastVerificationResult`. */
export function summarizeVerificationResult(p: SignalVerificationProfile): string {
  const verified = [
    p.websiteVerification === "verified",
    p.whatsappVerification === "verified",
    p.instagramVerification === "verified",
    p.reservationSignal === "verified",
  ].filter(Boolean).length;
  const parts: string[] = [`${verified}/4 sinyal doğrulandı`];
  if (p.whatsappVerification === "verified") parts.push("WhatsApp ✓");
  if (p.websiteVerification === "verified") parts.push("Web ✓");
  if (p.instagramVerification === "verified") parts.push("Instagram ✓");
  else if (p.instagramVerification === "candidate") parts.push("Instagram aday");
  if (p.reservationSignal === "verified") parts.push("Rezervasyon CTA ✓");
  if (p.businessOwnershipType === "chain") parts.push("Kurumsal zincir");
  return parts.join(" · ");
}

export type IcpFitScoreInput = {
  /** DIGITAL PRESENCE */
  hasWebsite: boolean;
  hasInstagram: boolean;
  hasWhatsapp: boolean;
  /** DEMAND ACTIVITY */
  reviewsCount: number;
  daysSinceLastReview: number;
  /** RESERVATION ACTIVITY */
  hasReservationSignal: boolean;
  hasDirectContactPath: boolean;
  /** OPERATIONAL COMPLEXITY */
  channelCount: number;
  otaPresence: boolean;
  /** Verification layer sharpens the estimate when present. */
  verification?: SignalVerificationProfile | null;
};

/**
 * TUGOBO ICP fit (0–100). Separate metric — never replaces Lead Score or
 * Hot Score. Evaluates digital presence, demand, reservation activity,
 * operational complexity and direct-booking opportunity.
 */
export function calculateIcpFitScore(input: IcpFitScoreInput): number {
  const v = input.verification;
  let score = 0;

  // Digital presence (max 30)
  if (input.hasWebsite) score += v?.websiteVerification === "verified" ? 12 : 8;
  if (input.hasInstagram) score += v?.instagramVerification === "verified" ? 9 : 6;
  if (input.hasWhatsapp || v?.whatsappVerification === "verified") {
    score += v?.whatsappVerification === "verified" ? 12 : 8;
  } else if (v?.whatsappVerification === "likely") {
    score += 5;
  }

  // Demand activity (max 25)
  score += Math.min(15, input.reviewsCount * 0.06);
  if (input.daysSinceLastReview <= 3) score += 10;
  else if (input.daysSinceLastReview <= 7) score += 7;
  else if (input.daysSinceLastReview <= 14) score += 3;

  // Reservation activity (max 18)
  if (v?.reservationSignal === "verified") score += 14;
  else if (v?.reservationSignal === "detected" || input.hasReservationSignal) score += 8;
  if (input.hasDirectContactPath) score += 4;

  // Operational complexity (max 15)
  score += Math.min(8, input.channelCount * 3);
  if (input.otaPresence) score += 4;
  const presenceCount =
    (input.hasWebsite ? 1 : 0) + (input.hasInstagram ? 1 : 0) + (input.hasWhatsapp ? 1 : 0);
  if (presenceCount >= 3) score += 3;

  // Direct booking opportunity (max 12)
  if (
    (v?.reservationSignal === "verified" || input.hasReservationSignal) &&
    input.hasWebsite &&
    (input.hasWhatsapp || v?.whatsappVerification !== "not_found")
  ) {
    score += 12;
  } else if (input.hasWebsite && input.hasWhatsapp) {
    score += 7;
  }

  return clamp100(score);
}
