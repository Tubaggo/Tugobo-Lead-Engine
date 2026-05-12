/**
 * Confidence layer for WhatsApp signals (no network I/O).
 * Values are intentionally narrow for lead reliability + UI.
 */

import {
  extractDigitsFromWhatsAppUrl,
  isValidTurkishWhatsAppIntl,
  isWhatsAppLinkPhoneValid,
  validateWhatsappLinks,
} from "@/app/lib/whatsapp-link-validation";

export type WhatsAppConfidence = "confirmed" | "likely" | "weak" | "none";

export type WhatsAppHtmlHints = {
  hasIconOrButton: boolean;
  strongCtaImpliesWa: boolean;
  suspiciousWaHref: boolean;
};

export type WhatsAppConfidenceInput = {
  listingPhoneRaw: string;
  /** True when {@link normalizePhoneForWhatsApp} would accept listing phone (TR mobile path). */
  hasWhatsAppPath: boolean;
  websiteHasWhatsAppLink?: boolean;
  websiteHasInvalidWhatsAppLinks?: boolean;
  validatedWaLinkCount: number;
  waAllLinksInvalid: boolean;
  waMixedValidation: boolean;
  /** TR international digits from a validated wa.me / api.whatsapp.com link (90…). */
  bestValidLinkDigitsTr90: string | null;
  htmlHints?: WhatsAppHtmlHints | null;
  /** Lowercased listing + bio / scan text snippet. */
  socialScanImpliesWhatsApp: boolean;
};

export type WhatsAppConfidenceResult = {
  confidence: WhatsAppConfidence;
  signals: string[];
};

const SIGNAL_CONFIRMED = "WhatsApp bağlantısı doğrulandı";
const SIGNAL_FOUND = "WhatsApp sinyali bulundu";
const SIGNAL_BROKEN = "WhatsApp linki bozuk görünüyor";
const SIGNAL_FORMAT = "Numara formatı doğrulanamadı";

/**
 * Normalizes Turkish GSM to E.164-style `+905XXXXXXXXX`.
 * Supports +90, 0090, 05xx, and 10-digit 5xx mobile forms.
 */
export function normalizePhoneNumber(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) return null;

  let d = trimmed.replace(/\D/g, "");
  if (!d) return null;

  while (d.startsWith("00") && d.length > 2) {
    d = d.slice(2);
  }

  if (d.startsWith("90")) {
    if (d.length > 12) d = d.slice(0, 12);
    if (d.length === 12 && d[2] === "5") return `+${d}`;
    return null;
  }

  if (d.startsWith("0") && d.length === 11 && d[1] === "5") {
    const intl = `90${d.slice(1)}`;
    return intl.length === 12 ? `+${intl}` : null;
  }

  if (d.length === 10 && d.startsWith("5")) {
    const intl = `90${d}`;
    return intl.length === 12 ? `+${intl}` : null;
  }

  return null;
}

/** Digits only (no +) for wa.me, when input is Turkish GSM. */
export function turkishGsmDigitsForWaMe(phone: string): string | null {
  const e164 = normalizePhoneNumber(phone);
  return e164 ? e164.replace(/^\+/, "") : null;
}

function normalizeLinkDigitsToTr90(digits: string): string | null {
  let d = digits.replace(/\D/g, "");
  if (!d) return null;
  while (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("90") && d.length >= 12) {
    d = d.slice(0, 12);
    return isValidTurkishWhatsAppIntl(d) ? d : null;
  }
  if (d.startsWith("0") && d.length === 11 && d[1] === "5") {
    const intl = `90${d.slice(1)}`;
    return isValidTurkishWhatsAppIntl(intl) ? intl : null;
  }
  if (d.length === 10 && d.startsWith("5")) {
    const intl = `90${d}`;
    return isValidTurkishWhatsAppIntl(intl) ? intl : null;
  }
  return null;
}

/**
 * Best-effort TR-normalized digits from the first valid WhatsApp URL (12-digit 90…).
 */
export function bestValidWaLinkDigits(links: readonly string[]): string | null {
  for (const link of links) {
    if (!isWhatsAppLinkPhoneValid(link)) continue;
    const raw = extractDigitsFromWhatsAppUrl(link);
    if (!raw) continue;
    const tr = normalizeLinkDigitsToTr90(raw);
    if (tr) return tr;
  }
  return null;
}

/**
 * Lightweight HTML heuristics: floating/icon CTAs, wording, suspicious hrefs.
 */
export function scanWhatsAppHtmlHints(html: string): WhatsAppHtmlHints {
  const lower = html.toLowerCase();
  const waHref =
    html.match(/href\s*=\s*["']([^"']*(?:wa\.me|whatsapp\.com)[^"']*)["']/gi) ?? [];
  let suspiciousWaHref = false;
  for (const m of waHref) {
    const inner = m.replace(/^href\s*=\s*["']/i, "").replace(/["']$/i, "");
    if (/^(javascript|data):/i.test(inner) || /%00|@wa\.me/i.test(inner)) {
      suspiciousWaHref = true;
      break;
    }
  }

  const hasIconOrButton =
    /class\s*=\s*["'][^"']*(?:whatsapp|wa-?float|float-wa|wp-button)[^"']*["']/i.test(html) ||
    /aria-label\s*=\s*["'][^"']*whatsapp[^"']*["']/i.test(html) ||
    /alt\s*=\s*["'][^"']*whatsapp[^"']*["']/i.test(html) ||
    /whatsapp.*\.(?:png|jpe?g|svg|webp)/i.test(html) ||
    waHref.length > 0;

  const strongCtaImpliesWa =
    /(whatsapp|wa\.me|wp\s*ile\s*iletişim|whatsapp['’]tan\s*yaz|bize\s*whatsapp)/i.test(
      lower,
    );

  return { hasIconOrButton, strongCtaImpliesWa, suspiciousWaHref };
}

/** Homepage crawl output — drives {@link detectWhatsAppConfidence} without storing raw URLs on the lead. */
export type WhatsAppSurfaceMeta = {
  validatedLinkCount: number;
  allLinksInvalid: boolean;
  mixedValidation: boolean;
  bestValidTr90Digits: string | null;
  htmlHints: WhatsAppHtmlHints;
};

export function buildWhatsappSurfaceMeta(
  html: string,
  whatsappLinks: readonly string[],
): WhatsAppSurfaceMeta {
  const waVal = validateWhatsappLinks(whatsappLinks);
  return {
    validatedLinkCount: whatsappLinks.filter((l) => isWhatsAppLinkPhoneValid(l)).length,
    allLinksInvalid: waVal.allLinksInvalid,
    mixedValidation: waVal.needsExtraVerification,
    bestValidTr90Digits: bestValidWaLinkDigits(whatsappLinks),
    htmlHints: scanWhatsAppHtmlHints(html),
  };
}

/**
 * Rule-based WhatsApp confidence for a lead snapshot.
 */
export function detectWhatsAppConfidence(input: WhatsAppConfidenceInput): WhatsAppConfidenceResult {
  const signals: string[] = [];
  const push = (s: string) => {
    if (!signals.includes(s)) signals.push(s);
  };

  const listingE164 = normalizePhoneNumber(input.listingPhoneRaw);
  const listingDigits = listingE164 ? listingE164.replace(/\D/g, "") : null;

  const hints = input.htmlHints ?? undefined;
  const hasWaSurface =
    Boolean(input.websiteHasWhatsAppLink) ||
    Boolean(hints?.hasIconOrButton) ||
    Boolean(input.socialScanImpliesWhatsApp);

  const brokenSurface =
    Boolean(input.websiteHasWhatsAppLink && input.waAllLinksInvalid) ||
    Boolean(
      input.websiteHasWhatsAppLink &&
        input.websiteHasInvalidWhatsAppLinks &&
        input.validatedWaLinkCount === 0,
    );

  let extractionConflict = false;
  if (listingDigits && input.validatedWaLinkCount > 0) {
    const fromLinks = input.bestValidLinkDigitsTr90;
    if (fromLinks && fromLinks !== listingDigits) extractionConflict = true;
  }

  if (extractionConflict) {
    push(SIGNAL_FORMAT);
    return { confidence: "weak", signals };
  }

  if (hints?.suspiciousWaHref && hasWaSurface) {
    push(SIGNAL_BROKEN);
    return { confidence: "weak", signals };
  }

  if (input.validatedWaLinkCount >= 1 && !input.waAllLinksInvalid) {
    push(SIGNAL_CONFIRMED);
    return { confidence: "confirmed", signals };
  }

  if (input.waMixedValidation) {
    push(SIGNAL_BROKEN);
    push(SIGNAL_FORMAT);
    return { confidence: "weak", signals };
  }

  if (brokenSurface) {
    push(SIGNAL_BROKEN);
    return { confidence: "weak", signals };
  }

  const listingMobileLikely = Boolean(listingE164 && input.hasWhatsAppPath);
  const ctaLikely =
    Boolean(hints?.strongCtaImpliesWa) &&
    (listingMobileLikely ||
      Boolean(input.websiteHasWhatsAppLink) ||
      input.socialScanImpliesWhatsApp);

  const iconOrUiWithoutWorkingNumber =
    Boolean(hints?.hasIconOrButton) &&
    input.validatedWaLinkCount === 0 &&
    !listingMobileLikely &&
    !input.socialScanImpliesWhatsApp &&
    !input.websiteHasWhatsAppLink;

  if (iconOrUiWithoutWorkingNumber) {
    push(SIGNAL_BROKEN);
    return { confidence: "weak", signals };
  }

  if (listingMobileLikely || input.socialScanImpliesWhatsApp || ctaLikely) {
    push(SIGNAL_FOUND);
    return { confidence: "likely", signals };
  }

  if (hasWaSurface) {
    push(SIGNAL_FOUND);
    return { confidence: "likely", signals };
  }

  return { confidence: "none", signals: [] };
}
