import { normalizeWebsiteUrl } from "@/app/lib/places-import";

const STOPWORDS = new Set([
  "the",
  "and",
  "ve",
  "bir",
  "ile",
  "hotel",
  "otel",
  "butik",
  "boutique",
  "pansiyon",
  "bungalow",
  "bungalov",
  "villa",
  "resort",
  "spa",
  "city",
  "grand",
  "lux",
]);

function uniqHostnames(hosts: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const h of hosts) {
    const v = h.trim().toLowerCase();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

const BLOCKED_HOST_SUBSTRINGS = [
  "booking.com",
  "airbnb.",
  "hotels.com",
  "expedia.",
  "instagram.com",
  "facebook.com",
  "google.com",
  "tripadvisor.",
  "wikipedia.org",
] as const;

export function isAllowedDiscoveryHostname(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (!h.includes(".")) return false;
  return !BLOCKED_HOST_SUBSTRINGS.some((s) => h.includes(s));
}

/** Fold Turkish letters to ASCII for domain guessing / fuzzy match. */
export function turkishAsciiFold(s: string): string {
  const map: Record<string, string> = {
    İ: "i",
    I: "i",
    ı: "i",
    Ğ: "g",
    ğ: "g",
    Ü: "u",
    ü: "u",
    Ş: "s",
    ş: "s",
    Ö: "o",
    ö: "o",
    Ç: "c",
    ç: "c",
  };
  let out = "";
  for (const ch of s) {
    out += map[ch] ?? ch;
  }
  return out;
}

function stripCorporateNoise(name: string): string {
  return name.replace(/\b(a\.?\s*ş\.?|ltd\.?|inc\.?|co\.?)\b/gi, " ").trim();
}

/**
 * If the listing name embeds a domain in parentheses, e.g. `Sio Otel (siootel.com)`.
 */
export function extractDomainHintFromBusinessName(name: string): string | undefined {
  const m = name.match(/\(\s*([a-z0-9][a-z0-9.-]*\.[a-z]{2,})\s*\)/i);
  if (!m?.[1]) return undefined;
  return normalizeWebsiteUrl(m[1]);
}

function slugToken(raw: string): string {
  const folded = turkishAsciiFold(stripCorporateNoise(raw));
  return folded
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^0+/, "");
}

function tokenizeForMatch(name: string): string[] {
  const folded = turkishAsciiFold(stripCorporateNoise(name))
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return folded
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

function baseSlugsFromName(businessName: string): string[] {
  const tokens = tokenizeForMatch(businessName);
  const compact = slugToken(businessName);
  const out: string[] = [];
  if (compact.length >= 3) out.push(compact);
  if (tokens.length >= 2) {
    const joined = tokens.join("");
    if (joined.length >= 3 && joined !== compact) out.push(joined);
    const first = tokens[0] ?? "";
    if (first.length >= 4) out.push(first);
  }
  const withoutHospitality = tokens.filter((t) => !STOPWORDS.has(t));
  if (withoutHospitality.length >= 2) {
    const core = withoutHospitality.join("");
    if (core.length >= 3) out.push(core);
  }
  return uniqStrings(out);
}

function uniqStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of items) {
    const v = x.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function otelHotelVariants(slugs: string[]): string[] {
  const extra: string[] = [];
  for (const s of slugs) {
    if (s.length < 3) continue;
    if (!/otel$/i.test(s) && !/hotel$/i.test(s)) {
      extra.push(`${s}otel`, `${s}hotel`);
    }
  }
  return uniqStrings(extra);
}

function cityAsciiSlug(city: string): string {
  return slugToken(city);
}

/**
 * Build plausible official hostnames when Google Places omits `website`.
 * Order: explicit hints → name-derived `.com` / `.com.tr` and common TR hospitality typos.
 */
export function generateWebsiteDomainCandidates(input: {
  businessName: string;
  city: string;
  knownWebsiteHint?: string;
}): string[] {
  const hosts: string[] = [];
  const hint =
    (input.knownWebsiteHint && normalizeWebsiteUrl(input.knownWebsiteHint)) ||
    extractDomainHintFromBusinessName(input.businessName);
  if (hint) hosts.push(hint);

  const slugs = baseSlugsFromName(input.businessName);
  const slugExtras = otelHotelVariants(slugs);
  const allSlugs = uniqStrings([...slugs, ...slugExtras]);

  const citySlug = cityAsciiSlug(input.city);
  for (const slug of allSlugs) {
    if (slug.length < 3) continue;
    hosts.push(`${slug}.com`);
    hosts.push(`${slug}.com.tr`);
  }

  if (citySlug.length >= 2) {
    for (const slug of slugs) {
      if (slug.length < 4) continue;
      hosts.push(`${slug}${citySlug}.com.tr`);
    }
  }

  return uniqHostnames(hosts).filter(isAllowedDiscoveryHostname);
}

function extractHtmlTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m?.[1] ? m[1].replace(/\s+/g, " ").trim() : "";
}

function stripHtmlToSnippet(html: string, maxLen: number): string {
  const plain = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.slice(0, maxLen);
}

export type PageNameMatch = {
  score: number;
  strength: "strong" | "uncertain" | "none";
};

/**
 * Compare listing name to fetched homepage title + leading visible text (single page only).
 */
export function scoreBusinessNamePageMatch(businessName: string, html: string): PageNameMatch {
  const title = extractHtmlTitle(html);
  const snippet = stripHtmlToSnippet(html, 3500);
  const tokens = tokenizeForMatch(businessName).filter((t) => t.length > 2);
  if (tokens.length === 0) {
    const compact = slugToken(businessName);
    if (compact.length >= 4) {
      const hay = turkishAsciiFold(`${title} ${snippet}`).toLowerCase();
      const ok = hay.includes(compact);
      return ok
        ? { score: 72, strength: "strong" }
        : { score: 0, strength: "none" };
    }
    return { score: 0, strength: "none" };
  }

  const hay = turkishAsciiFold(`${title} ${snippet}`).toLowerCase();
  let hits = 0;
  for (const t of tokens) {
    if (hay.includes(t)) hits += 1;
  }
  const ratio = hits / tokens.length;
  const score = Math.round(ratio * 100);
  if (score >= 70) return { score, strength: "strong" };
  if (score >= 42) return { score, strength: "uncertain" };
  return { score, strength: "none" };
}
