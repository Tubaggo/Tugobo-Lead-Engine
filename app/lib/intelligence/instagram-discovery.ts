/**
 * Instagram discovery confidence layer (deterministic, rule-based).
 *
 * No scraping, no API calls, no browser automation.
 * Generates plausible Instagram handle candidates from listing fields and
 * combines them with the validation result to produce a richer status that
 * avoids false negatives (i.e. claiming "no Instagram" when we just didn't
 * find a link).
 */

export type InstagramDiscoveryStatus =
  | "verified"
  | "possible"
  | "not_found"
  | "broken"
  | "unknown";

export type InstagramDiscoveryProfile = {
  instagramDiscoveryStatus: InstagramDiscoveryStatus;
  instagramConfidence: number;
  suggestedInstagramHandles: string[];
  instagramNeedsManualCheck: boolean;
};

const TURKISH_MAP: Record<string, string> = {
  ç: "c",
  Ç: "c",
  ğ: "g",
  Ğ: "g",
  ı: "i",
  İ: "i",
  ö: "o",
  Ö: "o",
  ş: "s",
  Ş: "s",
  ü: "u",
  Ü: "u",
};

function deTurkify(input: string): string {
  let out = "";
  for (const ch of input) out += TURKISH_MAP[ch] ?? ch;
  return out.toLowerCase();
}

function tokenize(s: string | undefined): string[] {
  if (!s?.trim()) return [];
  return deTurkify(s)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Words that often appear at the *end* of a hospitality name and act as type markers. */
const TYPE_WORDS = new Set<string>([
  "hotel",
  "otel",
  "pension",
  "pansiyon",
  "bungalow",
  "bungalov",
  "villa",
  "boutique",
  "apart",
  "suit",
  "suite",
  "resort",
  "hostel",
]);

/** Common business-type swaps used in Turkey (e.g. `pension` → `otel`). */
const TYPE_REPLACEMENTS: Record<string, string> = {
  hotel: "otel",
  pension: "otel",
  pansiyon: "otel",
  bungalow: "otel",
  bungalov: "otel",
  apart: "otel",
};

/** Same regex as IG validation — keeps suggestions strictly handle-shaped. */
const IG_HANDLE_RE = /^(?!\.)(?!.*\.\.)[A-Za-z0-9._]{1,30}(?<!\.)$/;

function isHandleShaped(s: string): boolean {
  return s.length >= 4 && s.length <= 30 && IG_HANDLE_RE.test(s);
}

/**
 * Generate plausible Instagram handle candidates from a listing's name + city.
 * Returns up to 6 unique handle-shaped strings, ordered by likelihood.
 */
export function generateInstagramHandleSuggestions(input: {
  name?: string;
  type?: string;
  city?: string;
}): string[] {
  const tokens = tokenize(input.name);
  if (tokens.length === 0) return [];

  const ordered: string[] = [];
  const push = (s: string) => {
    if (!ordered.includes(s)) ordered.push(s);
  };

  push(tokens.join(""));
  if (tokens.length >= 2) push(tokens.join("_"));

  const nonType = tokens.filter((t) => !TYPE_WORDS.has(t));
  if (nonType.length > 0 && nonType.length < tokens.length) {
    push(nonType.join(""));
  }

  if (tokens.length >= 2) push(tokens.slice(-2).join(""));
  if (tokens.length >= 2) push(tokens.slice(1).join(""));

  const replacedTokens = tokens.map((t) => TYPE_REPLACEMENTS[t] ?? t);
  if (replacedTokens.join("") !== tokens.join("")) {
    push(replacedTokens.join(""));
  }

  const cityTokens = tokenize(input.city);
  if (cityTokens.length > 0 && !tokens.includes(cityTokens[0])) {
    push([...cityTokens, ...tokens].join(""));
  }

  return ordered.filter(isHandleShaped).slice(0, 6);
}

/**
 * Combine validation + suggestion generation into a single discovery profile.
 *
 * Status rules:
 *  - verified  : a valid IG link exists on the listing.
 *  - broken    : an IG link exists but failed validation (reserved path, login redirect, malformed handle, "page not available", …).
 *  - possible  : no link found, but plausible handle candidates can be generated from the business name → manual check recommended.
 *  - unknown   : no link, no usable name. Don't penalize.
 *  - not_found : reserved for explicit external evidence; never auto-set here.
 */
export function determineInstagramDiscovery(input: {
  hasInstagramRaw: boolean;
  validationStatus: "valid" | "invalid" | "unknown";
  validationConfidence: number;
  businessName?: string;
  city?: string;
  type?: string;
}): InstagramDiscoveryProfile {
  const suggestions = generateInstagramHandleSuggestions({
    name: input.businessName,
    type: input.type,
    city: input.city,
  });

  let status: InstagramDiscoveryStatus;
  let confidence: number;

  if (input.hasInstagramRaw && input.validationStatus === "valid") {
    status = "verified";
    confidence = Math.max(78, Math.round(input.validationConfidence + 10));
  } else if (input.hasInstagramRaw && input.validationStatus === "invalid") {
    status = "broken";
    confidence = 22;
  } else if (suggestions.length > 0) {
    status = "possible";
    confidence = 35 + Math.min(suggestions.length, 4) * 4;
  } else if (!input.businessName?.trim()) {
    status = "unknown";
    confidence = 8;
  } else {
    status = "unknown";
    confidence = 12;
  }

  const needsManualCheck = status === "possible" || status === "broken";

  return {
    instagramDiscoveryStatus: status,
    instagramConfidence: Math.max(0, Math.min(100, Math.round(confidence))),
    suggestedInstagramHandles: suggestions,
    instagramNeedsManualCheck: needsManualCheck,
  };
}

/** Best public URL to manually verify a "possible" Instagram (open the first suggestion's profile). */
export function buildInstagramVerifyUrl(handles: readonly string[]): string | null {
  const first = handles[0];
  if (!first) return null;
  return `https://www.instagram.com/${encodeURIComponent(first.replace(/^@/, ""))}/`;
}
