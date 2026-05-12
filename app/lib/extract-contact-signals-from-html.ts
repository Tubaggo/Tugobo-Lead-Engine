/**
 * Parses HTML (or HTML-like text) for contact / booking signals.
 * Does not perform network requests and does not validate social accounts.
 */

const MAX_PER_LIST = 80;
const MAX_CTA_SNIPPETS = 25;
const CTA_WINDOW = 90;

export type ExtractContactSignalsOptions = {
  /**
   * Page URL used only to resolve relative `href`s (e.g. `/iletisim`).
   * If omitted, relative links are skipped.
   */
  pageUrl?: string;
};

/** Structured contact signals extracted from a single HTML document. */
export type ContactSignalsExtraction = {
  phones: string[];
  turkishGsmNumbers: string[];
  emails: string[];
  instagramLinks: string[];
  facebookLinks: string[];
  whatsappLinks: string[];
  reservationBookingCtaSnippets: string[];
  contactPageLinks: string[];
};

function uniqCap(items: string[], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const v = raw.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

function stripTagsForText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

/** Turkish GSM in international form `90` + 10 digits starting with `5`. */
function normalizeTurkishGsmDigits(d: string): string | null {
  let x = onlyDigits(d);
  if (!x) return null;
  while (x.startsWith("00") && x.length > 2) x = x.slice(2);
  if (x.startsWith("90") && x.length >= 12) x = x.slice(2);
  if (x.length === 10 && x.startsWith("5")) return `90${x}`;
  if (x.length === 11 && x.startsWith("05")) return `90${x.slice(1)}`;
  return null;
}

function tryResolveHref(href: string, pageUrl?: string): string | null {
  const h = href.trim();
  if (!h || h.startsWith("javascript:") || h.startsWith("mailto:") || h.startsWith("tel:")) {
    return null;
  }
  if (!pageUrl) {
    if (/^https?:\/\//i.test(h)) return h;
    return null;
  }
  try {
    return new URL(h, pageUrl).href;
  } catch {
    return null;
  }
}

const CONTACT_PATH =
  /(?:contact|iletisim|bize-ulasin|reach-us|get-in-touch|kontakt|reservation-contact|book(?:ing)?|rezervasyon)(?:[^"'?\s]*)?/i;

function isLikelyContactPageHref(href: string): boolean {
  const path = href.split(/[?#]/)[0] ?? href;
  return CONTACT_PATH.test(path);
}

const BOOKING_CTA_PATTERN =
  /(rezervasyon|hemen\s*rezervasyon|book\s*now|check\s*availability|availability|book\s*direct|direct\s*booking|online\s*rezervasyon|instant\s*book|check\s*rates|book\s*a\s*room|reserve\s*now|book\s*your\s*stay)/gi;

function extractBookingCtaSnippets(html: string): string[] {
  const lower = html;
  const out: string[] = [];
  BOOKING_CTA_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BOOKING_CTA_PATTERN.exec(lower)) !== null) {
    const start = Math.max(0, m.index - CTA_WINDOW);
    const end = Math.min(lower.length, m.index + m[0].length + CTA_WINDOW);
    let snippet = lower.slice(start, end).replace(/\s+/g, " ").trim();
    if (snippet.length > 200) snippet = `${snippet.slice(0, 197)}…`;
    out.push(snippet);
    if (out.length >= MAX_CTA_SNIPPETS) break;
  }
  return uniqCap(out, MAX_CTA_SNIPPETS);
}

function extractTelHrefs(html: string): string[] {
  const matches = html.match(/tel:([^"'<>\s]+)/gi) ?? [];
  const out: string[] = [];
  for (const m of matches) {
    const raw = m.slice(4);
    try {
      out.push(decodeURIComponent(raw.replace(/[),.;]+$/g, "")));
    } catch {
      out.push(raw.replace(/[),.;]+$/g, ""));
    }
  }
  return out;
}

/** Turkish-style numbers (mobile + landline patterns). */
function extractTurkishStylePhoneStrings(text: string): string[] {
  const candidates =
    text.match(
      /(?:\+?90|0090|90|0)?\s*\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}/g,
    ) ?? [];
  return candidates.map((c) => c.trim()).filter(Boolean);
}

/** Simple international `+` prefixes (non-Turkish lines still surface as phones). */
function extractIntlPlusPhones(text: string): string[] {
  const matches = text.match(/\+(?:[1-9]\d{8,14})\b/g) ?? [];
  return matches.map((m) => m.trim());
}

function extractEmails(text: string): string[] {
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return matches.map((x) => x.trim());
}

function extractInstagramLinks(html: string): string[] {
  const matches =
    html.match(/https?:\/\/(?:www\.|m\.)?instagram\.com\/[a-zA-Z0-9._%+-/]+/gi) ?? [];
  return matches.map((m) => m.replace(/[),.;]+$/g, ""));
}

function extractFacebookLinks(html: string): string[] {
  const matches =
    html.match(
      /https?:\/\/(?:www\.|m\.|web\.)?(?:facebook\.com|fb\.com|fb\.me)\/[^\s"'<>]+/gi,
    ) ?? [];
  return matches.map((m) => m.replace(/[),.;]+$/g, ""));
}

function extractWhatsappLinks(html: string): string[] {
  const matches =
    html.match(/https?:\/\/(?:wa\.me|(?:api\.)?whatsapp\.com)\/[^\s"'<>]*/gi) ?? [];
  return matches.map((m) => m.replace(/[),.;]+$/g, ""));
}

function extractAnchorHrefs(html: string): string[] {
  const out: string[] = [];
  const re = /<a[^>]+href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out.push(m[1]);
  }
  return out;
}

/**
 * Extract phones, emails, social links, booking CTA snippets, and contact-page URLs
 * from one HTML string. No network I/O.
 */
export function extractContactSignalsFromHtml(
  html: string,
  options?: ExtractContactSignalsOptions,
): ContactSignalsExtraction {
  const pageUrl = options?.pageUrl?.trim();
  const plain = stripTagsForText(html);

  const telParts = extractTelHrefs(html);
  const trStyle = extractTurkishStylePhoneStrings(plain);
  const intlPlus = extractIntlPlusPhones(plain);

  const gsmSet = new Set<string>();
  const phoneChunks = [...telParts, ...trStyle, ...intlPlus];

  for (const chunk of phoneChunks) {
    const norm = normalizeTurkishGsmDigits(chunk);
    if (norm) gsmSet.add(norm);
  }

  const turkishGsmNumbers = uniqCap([...gsmSet], MAX_PER_LIST);
  const phones = uniqCap(
    phoneChunks.map((c) => c.replace(/\s+/g, " ").trim()),
    MAX_PER_LIST,
  );

  const emails = uniqCap(extractEmails(plain + " " + html), MAX_PER_LIST);
  const instagramLinks = uniqCap(extractInstagramLinks(html), MAX_PER_LIST);
  const facebookLinks = uniqCap(extractFacebookLinks(html), MAX_PER_LIST);
  const whatsappLinks = uniqCap(extractWhatsappLinks(html), MAX_PER_LIST);
  const reservationBookingCtaSnippets = extractBookingCtaSnippets(html);

  const contactUrls: string[] = [];
  for (const href of extractAnchorHrefs(html)) {
    if (!isLikelyContactPageHref(href)) continue;
    const resolved = tryResolveHref(href, pageUrl);
    if (resolved) contactUrls.push(resolved);
  }

  return {
    phones,
    turkishGsmNumbers,
    emails,
    instagramLinks,
    facebookLinks,
    whatsappLinks,
    reservationBookingCtaSnippets,
    contactPageLinks: uniqCap(contactUrls, MAX_PER_LIST),
  };
}
