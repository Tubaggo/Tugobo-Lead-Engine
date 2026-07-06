/**
 * WhatsApp Provider Credential & Configuration Runtime (v5.0.0).
 *
 * This module does NOT send WhatsApp messages. It does not call the
 * WhatsApp Cloud API, does not read `process.env` itself, and does not
 * import `next/server` — it is pure, framework-agnostic TypeScript that
 * turns a set of already-resolved booleans (credential presence, policy
 * gates) into a readiness projection. The only place allowed to read
 * `process.env` for WhatsApp credentials is the route handler
 * (`app/api/hermes/providers/whatsapp/status/route.ts`), which passes
 * presence booleans in here — never the raw secret values.
 *
 * Strategic context: WhatsApp is the first real provider Hermes will
 * eventually integrate with live (Türkiye hotel leads are more reachable
 * via WhatsApp than Instagram DM or email). This module prepares the
 * credential/configuration readiness layer for that — it does not build
 * the send path itself. Real sending remains gated behind the existing
 * Controlled Live Provider Adapter (`hermes-live-provider-adapters.ts`)
 * and its POLICY BLOCK, which this module reads from but never modifies.
 *
 * `controlledLivePolicyAllowed` and `liveSendGateOk` are meant to be
 * supplied by the caller from the existing, already-hardcoded-false policy
 * singletons (`DEFAULT_CONTROLLED_LIVE_SEND_POLICY.liveSendEnabled` and
 * `DEFAULT_LIVE_SEND_POLICY.liveSendEnabled`) — this module never
 * re-implements or second-guesses those. Since both are `false` today,
 * `"controlled_live_ready"` is unreachable this sprint, same as every
 * other "kept for a future sprint" state already established across the
 * Hermes provider chain (Provider Connector's `supportsLiveSend`, Live
 * Send Gate's `liveSendEnabled`, Provider API Dry Mode's `test_sent`,
 * Controlled Live Provider Adapter's `live_sent`).
 */

export type WhatsAppProviderMode = "disabled" | "dry_run" | "controlled_live_ready";

export const WHATSAPP_MODE_LABELS: Record<WhatsAppProviderMode, string> = {
  disabled: "Kapalı",
  dry_run: "Dry Run",
  controlled_live_ready: "Controlled Live Hazır",
};

export type WhatsAppReadinessStatus =
  | "not_configured"
  | "partial"
  | "dry_run_ready"
  | "controlled_live_ready"
  | "blocked";

export const WHATSAPP_READINESS_STATUS_LABELS: Record<WhatsAppReadinessStatus, string> = {
  not_configured: "Yapılandırılmadı",
  partial: "Kısmi Yapılandırma",
  dry_run_ready: "Dry Run Hazır",
  controlled_live_ready: "Controlled Live Hazır",
  blocked: "Engellendi",
};

/* ── Safety copy ────────────────────────────────────────────────── */

export const WHATSAPP_PROVIDER_SECTION_LABEL = "WhatsApp Provider";
export const REAL_SEND_DISABLED_LABEL = "Gerçek gönderim kapalı";
export const CONTROLLED_LIVE_NOT_READY_LABEL = "Controlled live hazır değil";

export const BLOCKING_REASON_LABELS = {
  accessToken: "WhatsApp access token tanımlı değil",
  phoneNumberId: "Phone Number ID tanımlı değil",
  businessAccountId: "Business Account ID tanımlı değil",
  testRecipient: "Test alıcısı tanımlı değil",
  controlledLivePolicy: "Controlled live gönderim politikası şu anda kapalı",
  liveSendGate: "Live Send Gate aktif değil veya bloklu",
} as const;

/* ── Evaluator ──────────────────────────────────────────────────── */

export type WhatsAppReadinessInput = {
  accessTokenPresent: boolean;
  phoneNumberIdPresent: boolean;
  businessAccountIdPresent: boolean;
  testRecipientConfigured: boolean;
  /** Read from DEFAULT_CONTROLLED_LIVE_SEND_POLICY.liveSendEnabled by the caller — never re-derived here. */
  controlledLivePolicyAllowed: boolean;
  /** Read from DEFAULT_LIVE_SEND_POLICY.liveSendEnabled by the caller — never re-derived here. */
  liveSendGateOk: boolean;
};

export type WhatsAppReadinessEvaluation = {
  mode: WhatsAppProviderMode;
  readinessStatus: WhatsAppReadinessStatus;
  liveSendEligible: boolean;
  blockingReasons: string[];
};

/**
 * Pure — no env read, no network, no side effects. Precedence (most
 * complete first):
 *   1. every credential + policy/gate flag true  → controlled_live_ready
 *   2. every credential present, policy/gate not → blocked (the founder
 *      did everything right; Hermes's global policy still says no)
 *   3. core credentials present (token + phone number id) → dry_run_ready
 *   4. at least one signal present → partial
 *   5. nothing present → not_configured
 */
export function evaluateWhatsAppProviderReadiness(
  input: WhatsAppReadinessInput,
): WhatsAppReadinessEvaluation {
  const {
    accessTokenPresent,
    phoneNumberIdPresent,
    businessAccountIdPresent,
    testRecipientConfigured,
    controlledLivePolicyAllowed,
    liveSendGateOk,
  } = input;

  const blockingReasons: string[] = [];
  if (!accessTokenPresent) blockingReasons.push(BLOCKING_REASON_LABELS.accessToken);
  if (!phoneNumberIdPresent) blockingReasons.push(BLOCKING_REASON_LABELS.phoneNumberId);
  if (!businessAccountIdPresent) blockingReasons.push(BLOCKING_REASON_LABELS.businessAccountId);
  if (!testRecipientConfigured) blockingReasons.push(BLOCKING_REASON_LABELS.testRecipient);
  if (!controlledLivePolicyAllowed) blockingReasons.push(BLOCKING_REASON_LABELS.controlledLivePolicy);
  if (!liveSendGateOk) blockingReasons.push(BLOCKING_REASON_LABELS.liveSendGate);

  const hasCoreCredentials = accessTokenPresent && phoneNumberIdPresent;
  const hasAllCredentials = hasCoreCredentials && businessAccountIdPresent && testRecipientConfigured;
  const hasAnySignal =
    accessTokenPresent || phoneNumberIdPresent || businessAccountIdPresent || testRecipientConfigured;
  const liveSendEligible = hasAllCredentials && controlledLivePolicyAllowed && liveSendGateOk;

  if (liveSendEligible) {
    return { mode: "controlled_live_ready", readinessStatus: "controlled_live_ready", liveSendEligible, blockingReasons: [] };
  }
  if (hasAllCredentials) {
    // Credentials are fully configured — the only remaining reasons are
    // policy/gate, so blockingReasons here only ever contains those two.
    return { mode: "dry_run", readinessStatus: "blocked", liveSendEligible, blockingReasons };
  }
  if (hasCoreCredentials) {
    return { mode: "dry_run", readinessStatus: "dry_run_ready", liveSendEligible, blockingReasons };
  }
  if (hasAnySignal) {
    return { mode: "disabled", readinessStatus: "partial", liveSendEligible, blockingReasons };
  }
  return { mode: "disabled", readinessStatus: "not_configured", liveSendEligible, blockingReasons };
}

/* ── Masking ────────────────────────────────────────────────────── */

/**
 * Never returns more than the last 2 characters of the input — this is the
 * only function in this sprint allowed to touch the raw test-recipient
 * value, and only to produce a display-safe mask. Access token / phone
 * number id / business account id are never masked-and-shown — only their
 * *presence* is ever surfaced (see WhatsAppProviderConfig below).
 */
export function maskTestRecipient(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const visible = trimmed.slice(-2);
  return `••• ••• ${visible}`;
}

/* ── Public config shape (safe to return from an API route) ───────── */

export type WhatsAppProviderAuditEntry = {
  timestamp: number;
  actor: string;
  action: string;
  details: string;
};

export type WhatsAppProviderConfig = {
  provider: "whatsapp";
  mode: WhatsAppProviderMode;
  accessTokenPresent: boolean;
  phoneNumberIdPresent: boolean;
  businessAccountIdPresent: boolean;
  testRecipientConfigured: boolean;
  testRecipientMasked: string | null;
  liveSendEligible: boolean;
  readinessStatus: WhatsAppReadinessStatus;
  blockingReasons: string[];
  updatedAt: number;
  /** Rebuilt fresh on every call — never persisted, mirrors buildProviderRuntime()'s own audit convention. */
  audit: WhatsAppProviderAuditEntry[];
};

function buildWhatsAppAudit(
  evaluation: WhatsAppReadinessEvaluation,
  now: number,
): WhatsAppProviderAuditEntry[] {
  const audit: WhatsAppProviderAuditEntry[] = [
    {
      timestamp: now,
      actor: "Gateway",
      action: "whatsapp_provider_config_checked",
      details: "WhatsApp provider yapılandırması kontrol edildi.",
    },
  ];

  switch (evaluation.readinessStatus) {
    case "not_configured":
      audit.push({
        timestamp: now + 1,
        actor: "Gateway",
        action: "whatsapp_provider_partial",
        details: "WhatsApp provider yapılandırılmadı.",
      });
      break;
    case "partial":
      audit.push({
        timestamp: now + 1,
        actor: "Gateway",
        action: "whatsapp_provider_partial",
        details: "WhatsApp provider kısmen yapılandırıldı.",
      });
      break;
    case "dry_run_ready":
      audit.push({
        timestamp: now + 1,
        actor: "Gateway",
        action: "whatsapp_provider_dry_run_ready",
        details: "WhatsApp provider dry run için hazır.",
      });
      break;
    case "blocked":
      audit.push({
        timestamp: now + 1,
        actor: "Gateway",
        action: "whatsapp_provider_blocked",
        details: "WhatsApp provider tam yapılandırıldı ancak politika nedeniyle engellendi.",
      });
      break;
    case "controlled_live_ready":
      audit.push({
        timestamp: now + 1,
        actor: "Gateway",
        action: "whatsapp_provider_controlled_live_ready",
        details: "WhatsApp provider controlled live gönderim için hazır.",
      });
      break;
  }

  return audit;
}

export type BuildWhatsAppProviderConfigInput = {
  accessTokenPresent: boolean;
  phoneNumberIdPresent: boolean;
  businessAccountIdPresent: boolean;
  /** Raw value — only ever passed in from the server route; masked before leaving this function. */
  testRecipientRaw: string | null | undefined;
  controlledLivePolicyAllowed: boolean;
  liveSendGateOk: boolean;
  now?: number;
};

/**
 * Pure — composes evaluateWhatsAppProviderReadiness() + maskTestRecipient()
 * into the exact safe shape the status route returns. Never includes an
 * access token, phone number id, business account id, or unmasked
 * recipient value — only booleans, a masked string, and readiness metadata.
 */
export function buildWhatsAppProviderConfig(
  input: BuildWhatsAppProviderConfigInput,
): WhatsAppProviderConfig {
  const now = input.now ?? Date.now();
  const testRecipientConfigured = Boolean(input.testRecipientRaw?.trim());

  const evaluation = evaluateWhatsAppProviderReadiness({
    accessTokenPresent: input.accessTokenPresent,
    phoneNumberIdPresent: input.phoneNumberIdPresent,
    businessAccountIdPresent: input.businessAccountIdPresent,
    testRecipientConfigured,
    controlledLivePolicyAllowed: input.controlledLivePolicyAllowed,
    liveSendGateOk: input.liveSendGateOk,
  });

  return {
    provider: "whatsapp",
    mode: evaluation.mode,
    accessTokenPresent: input.accessTokenPresent,
    phoneNumberIdPresent: input.phoneNumberIdPresent,
    businessAccountIdPresent: input.businessAccountIdPresent,
    testRecipientConfigured,
    testRecipientMasked: maskTestRecipient(input.testRecipientRaw),
    liveSendEligible: evaluation.liveSendEligible,
    readinessStatus: evaluation.readinessStatus,
    blockingReasons: evaluation.blockingReasons,
    updatedAt: now,
    audit: buildWhatsAppAudit(evaluation, now),
  };
}
