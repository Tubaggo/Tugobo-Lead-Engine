/**
 * v3.7.9 — Sender identity hallucination guard.
 *
 * A live model, told to write in a "founder voice", invented a sender name
 * ("Merhaba, ben Tuğrul.") that exists nowhere in the system. That is a trust
 * breach: the founder never authorised that identity.
 *
 * This module is the single source of truth for the rule:
 *   - No configured sender name  → NO first-person named self-introduction.
 *   - A configured sender name    → ONLY that exact (normalized) name may appear.
 *
 * Pure — no I/O at import time — so it is fully unit testable. The optional env
 * read (`getConfiguredSenderName`) resolves lazily at call time and never
 * returns or logs the raw value beyond the trimmed name itself.
 */

/** Company self-reference — a role reference, not a personal sender name. */
const COMPANY_TOKEN = "tugobo";

/**
 * First-person named self-introduction shapes. Each captures the *name token*
 * as group 1, anchored to Title case so ordinary lowercase words after "ben"
 * ("ben size", "ben de") never match.
 */
const INTRO_PATTERNS: readonly RegExp[] = [
  /(?:^|[,.\s])[Bb]en\s+([A-ZÇĞİÖŞÜ][\p{Ll}]+)/u, // "ben Tuğrul", "Ben Ahmet"
  /(?:^|[,.\s])[Aa]d[ıi]m\s+([A-ZÇĞİÖŞÜ][\p{Ll}]+)/u, // "Adım Mehmet"
  /(?:^|[,.\s])[İi]smim\s+([A-ZÇĞİÖŞÜ][\p{Ll}]+)/u, // "ismim Ahmet"
  /([A-ZÇĞİÖŞÜ][\p{Ll}]+)\s+ben(?=[\s.,!?…]|$)/u, // "Tuğrul ben"
];

/** Lowercase (tr), letters only — so "Ayşe'yim" and "AYŞE" both fold to "ayşe". */
export function normalizeSenderName(raw: string): string {
  return raw.toLocaleLowerCase("tr-TR").replace(/[^\p{L}]+/gu, "");
}

/**
 * Returns the normalized personal name a message introduces itself with, or
 * null when there is no named self-introduction. A bare company/role reference
 * ("TUGOBO'nun kurucusuyum") is intentionally NOT a personal name.
 */
export function detectSenderIntroduction(message: string): string | null {
  for (const re of INTRO_PATTERNS) {
    const match = message.match(re);
    if (match && match[1]) {
      const name = normalizeSenderName(match[1]);
      if (name && name !== COMPANY_TOKEN) return name;
    }
  }
  return null;
}

export type SenderIdentityVerdict = { ok: true } | { ok: false; found: string };

/**
 * The rule. `senderName` is the (optional) configured identity; anything else
 * introducing a personal name is an invented identity.
 */
export function checkSenderIdentity(
  message: string,
  senderName?: string | null,
): SenderIdentityVerdict {
  const found = detectSenderIntroduction(message);
  if (!found) return { ok: true };
  const configured = senderName ? normalizeSenderName(senderName) : "";
  if (configured && found === configured) return { ok: true };
  return { ok: false, found };
}

/**
 * The configured sender name, or null. Default is null → the safest "nameless
 * founder voice". A user's OS/login name is NEVER assumed; only an explicit,
 * exact `OUTREACH_SENDER_NAME` is honoured. The value is server-side only and
 * must never be sent to the client.
 */
export function getConfiguredSenderName(): string | null {
  const raw = process.env.OUTREACH_SENDER_NAME;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
