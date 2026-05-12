/**
 * Validate WhatsApp deep links found in HTML (wa.me / api.whatsapp.com) without network I/O.
 */

function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

/** Turkish GSM in international form: 90 + 10 digits starting with 5. */
export function isValidTurkishWhatsAppIntl(digits: string): boolean {
  const d = onlyDigits(digits);
  return d.length === 12 && d.startsWith("90") && d[2] === "5";
}

/** Accept plausible international numbers for non-TR links (length bounds only). */
function isPlausibleIntlWhatsAppDigits(d: string): boolean {
  const x = onlyDigits(d);
  if (x.length < 8 || x.length > 15) return false;
  return /^[1-9]/.test(x);
}

/**
 * Extract the primary phone segment from a WhatsApp URL path or query.
 * Returns digit string (may include country code) or null if not parseable.
 */
export function extractDigitsFromWhatsAppUrl(link: string): string | null {
  const raw = link.trim();
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (host === "wa.me" || host.endsWith(".wa.me")) {
      const phone = u.pathname.split("/").filter(Boolean)[0];
      if (!phone) return null;
      const d = onlyDigits(phone);
      return d || null;
    }
    if (host.includes("whatsapp.com")) {
      const send = u.searchParams.get("phone");
      if (send) {
        const d = onlyDigits(send);
        return d || null;
      }
      const parts = u.pathname.split("/").filter(Boolean);
      const last = parts[parts.length - 1];
      if (last) {
        const d = onlyDigits(last);
        return d || null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function isWhatsAppLinkPhoneValid(link: string): boolean {
  const d = extractDigitsFromWhatsAppUrl(link);
  if (!d) return false;
  if (isValidTurkishWhatsAppIntl(d)) return true;
  return isPlausibleIntlWhatsAppDigits(d);
}

export type WhatsappLinkValidation = {
  hasLinks: boolean;
  /** True when at least one link exists but every link fails digit validation. */
  allLinksInvalid: boolean;
  /** True when some links validate and others do not (mixed bag). */
  needsExtraVerification: boolean;
};

export function validateWhatsappLinks(links: readonly string[]): WhatsappLinkValidation {
  const cleaned = links.map((l) => l.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    return { hasLinks: false, allLinksInvalid: false, needsExtraVerification: false };
  }
  let anyValid = false;
  let anyInvalid = false;
  for (const l of cleaned) {
    if (isWhatsAppLinkPhoneValid(l)) anyValid = true;
    else anyInvalid = true;
  }
  return {
    hasLinks: true,
    allLinksInvalid: anyInvalid && !anyValid,
    needsExtraVerification: anyValid && anyInvalid,
  };
}
