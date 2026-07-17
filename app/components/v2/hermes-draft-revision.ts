/**
 * Founder Conversational Message Revision (v1.0).
 *
 * Pure logic for the MESSAGE_REVIEW "Hermes'e Talimat Ver" flow: deciding
 * whether a founder instruction is an external-action request (send/deliver
 * — always intercepted deterministically, never left to the LLM), building
 * the list of real business-signal labels the AI is allowed to cite, and
 * validating/parsing the AI's structured JSON response.
 *
 * This module never calls a provider, never touches HermesOutboundDraft, and
 * never sends anything — it only decides what's safe to show/save once the
 * caller (the API route) already has a raw string back from the LLM.
 *
 * Deliberately dependency-free (no "@/" imports, no React, no browser API)
 * so it runs under plain `node --test`, matching every other adapter in
 * this codebase.
 */

export type DraftRevisionIntent = "revise_draft" | "explain_draft";
export type DraftRevisionLanguage = "tr" | "en" | "de" | "ru" | "other";

/** Real, already-verified business fields the revision prompt may cite — never invented, never fetched here. */
export type DraftRevisionBusinessContextLike = {
  hotelName: string;
  city: string;
  hotelType: string | null;
  website: string | null;
  websiteVerified: boolean;
  whatsappNumber: string | null;
  whatsappVerified: boolean;
  instagramHandle: string | null;
  instagramVerified: boolean;
  reservationCtaVerified: boolean;
  otaDependency: "high" | "medium" | "low" | null;
  icpScore: number | null;
  opportunityScore: number | null;
  opportunityTier: string | null;
  opportunityReasons: string[];
  channel: string;
};

export type DraftRevisionResult = {
  intent: DraftRevisionIntent;
  /** Non-null only for a successful revise_draft; always null for explain_draft. */
  revisedBody: string | null;
  language: DraftRevisionLanguage;
  changeSummary: string;
  /** Filtered down to only labels that were actually offered — never a hallucinated signal. */
  usedSignals: string[];
  warnings: string[];
};

const MAX_REVISED_BODY_LENGTH = 4000;
const MAX_CHANGE_SUMMARY_LENGTH = 600;
const MAX_WARNING_LENGTH = 300;

/**
 * Deterministic external-action interception. Founder instructions that ask
 * Hermes to actually deliver something ("WhatsApp'tan gönder", "şimdi
 * yolla") must never reach the LLM as a revision/explain request — the send
 * decision is never left to model judgement. Matches are intentionally
 * broad (Turkish + a few English variants); false positives just show the
 * safety explainer instead of revising, which is the safe direction to err.
 */
const EXTERNAL_ACTION_PATTERNS: RegExp[] = [
  /\bgönder\b/i,
  /\bgönderim/i,
  /\byolla\b/i,
  /\biletir?\s*misin\b/i,
  /\bilet\b/i,
  /\bpaylaş\b/i,
  /\bwhatsapp('|’)?(tan|dan|üzerinden)?\s*(gönder|yolla|ilet)/i,
  /\bşimdi\s+gönder/i,
  /\bmesaj\w*\s+at\b/i,
  /\bsend\s+(it|this|now|via)/i,
  /\bdeliver\s+(it|this|now)/i,
];

export function detectExternalActionIntent(instruction: string): boolean {
  const trimmed = instruction.trim();
  if (!trimmed) return false;
  return EXTERNAL_ACTION_PATTERNS.some((re) => re.test(trimmed));
}

function pushLabel(labels: string[], condition: unknown, label: string): void {
  if (condition) labels.push(label);
}

/**
 * Every label here maps 1:1 to a real, already-computed field — nothing is
 * derived or guessed inside this function. The AI prompt receives exactly
 * this list and is instructed to only ever cite labels from it verbatim;
 * `parseDraftRevisionResponse` then re-enforces that server-side regardless
 * of whether the model actually complied.
 */
export function buildAvailableSignalLabels(context: DraftRevisionBusinessContextLike): string[] {
  const labels: string[] = [];
  pushLabel(labels, context.websiteVerified && context.website, "Doğrulanmış web sitesi");
  pushLabel(labels, context.whatsappVerified && context.whatsappNumber, "Doğrulanmış WhatsApp");
  pushLabel(labels, context.instagramVerified && context.instagramHandle, "Doğrulanmış Instagram");
  pushLabel(labels, context.reservationCtaVerified, "Doğrulanmış rezervasyon çağrısı (CTA)");
  pushLabel(labels, context.otaDependency === "high", "Yüksek OTA bağımlılığı");
  pushLabel(labels, context.otaDependency === "medium", "Orta OTA bağımlılığı");
  pushLabel(labels, context.otaDependency === "low", "Düşük OTA bağımlılığı");
  pushLabel(labels, typeof context.icpScore === "number", "ICP uyum skoru");
  pushLabel(labels, typeof context.opportunityScore === "number", "Doğrulanmış fırsat skoru");
  pushLabel(labels, context.opportunityTier, "Fırsat kademesi");
  pushLabel(labels, context.hotelType, "İşletme türü");
  pushLabel(labels, context.city, "Şehir");
  for (const reason of context.opportunityReasons.slice(0, 6)) {
    if (reason.trim()) labels.push(reason.trim());
  }
  return Array.from(new Set(labels));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max).trim() : text;
}

/**
 * Validates the LLM's raw JSON text against the sprint's structured
 * contract. Returns null for anything unsafe to use — invalid JSON, missing
 * required fields, an empty `revisedBody` on a `revise_draft` intent, or a
 * non-string/garbage payload. The caller must leave the existing draft
 * untouched whenever this returns null.
 */
export function parseDraftRevisionResponse(
  raw: string,
  availableSignalLabels: string[],
): DraftRevisionResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  const intent = parsed.intent === "explain_draft" ? "explain_draft" : parsed.intent === "revise_draft" ? "revise_draft" : null;
  if (!intent) return null;

  const changeSummary = typeof parsed.changeSummary === "string" ? truncate(parsed.changeSummary.trim(), MAX_CHANGE_SUMMARY_LENGTH) : "";
  if (!changeSummary) return null;

  const languageRaw = typeof parsed.language === "string" ? parsed.language.trim().toLowerCase() : "";
  const language: DraftRevisionLanguage =
    languageRaw === "tr" || languageRaw === "en" || languageRaw === "de" || languageRaw === "ru" ? languageRaw : "other";

  let revisedBody: string | null = null;
  if (intent === "revise_draft") {
    const raw = typeof parsed.revisedBody === "string" ? parsed.revisedBody.trim() : "";
    if (!raw) return null; // boş revizyon asla kaydedilmez
    revisedBody = truncate(raw, MAX_REVISED_BODY_LENGTH);
  } else {
    revisedBody = null; // explain_draft draft'ı asla değiştirmez
  }

  const allowed = new Set(availableSignalLabels);
  const usedSignalsRaw = Array.isArray(parsed.usedSignals)
    ? parsed.usedSignals.filter((x): x is string => typeof x === "string")
    : [];
  const usedSignals = usedSignalsRaw.map((s) => s.trim()).filter((s) => allowed.has(s));

  const warningsRaw = Array.isArray(parsed.warnings) ? parsed.warnings.filter((x): x is string => typeof x === "string") : [];
  const warnings = warningsRaw.map((w) => truncate(w.trim(), MAX_WARNING_LENGTH)).filter(Boolean).slice(0, 5);

  return { intent, revisedBody, language, changeSummary, usedSignals, warnings };
}

export const EXTERNAL_ACTION_SAFETY_LABELS = {
  title: "Gönderim Ayrı Bir Founder Onayı Gerektirir",
  intro: "Hermes bu talimattan bir gönderim isteği anladı — mesaj burada hiçbir zaman otomatik gönderilmez.",
} as const;

export type ExternalActionReadinessLike = {
  draftStatusLabel: string;
  phoneLabel: string;
  controlledSendReady: boolean;
  controlledSendLabel: string;
  nextStepLabel: string;
};

/**
 * Deterministic, safe explainer shown instead of calling the AI at all when
 * `detectExternalActionIntent` matches. Never mutates the draft, never
 * calls a provider, never opens a send gate.
 */
export function buildExternalActionSafetyMessage(readiness: ExternalActionReadinessLike | null): string {
  const lines: string[] = [EXTERNAL_ACTION_SAFETY_LABELS.intro];
  if (readiness) {
    lines.push(`Taslak durumu: ${readiness.draftStatusLabel}.`);
    lines.push(`Numara: ${readiness.phoneLabel}.`);
    lines.push(`Kontrollü gönderime hazır mı: ${readiness.controlledSendLabel}.`);
    lines.push(`Sonraki adım: ${readiness.nextStepLabel}`);
  } else {
    lines.push("Bu taslak henüz onaylanmadı — gönderim için önce mesajı incele ve onayla.");
  }
  lines.push("Gerçek gönderim yalnızca ayrı, açık bir founder onayıyla tetiklenir.");
  return lines.join(" ");
}
