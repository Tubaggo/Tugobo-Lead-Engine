import type { WhatsAppReadinessStatus } from "./whatsapp-provider-runtime.ts";

/**
 * Controlled WhatsApp Live Send Runtime (v5.1.0).
 *
 * Pure evaluator — no fetch, no `process.env` read, no import of
 * `next/server`. It turns a flat set of already-resolved gate booleans (the
 * same convention `whatsapp-provider-runtime.ts` established) into a
 * controlled-send decision. It never sends anything; `"controlled_live_ready"`
 * only ever means "every gate passed and Hermes could attempt a send if the
 * caller (the adapter) also allows it" — the attempt itself lives one layer
 * up, in `whatsapp-controlled-live-adapter.ts`.
 *
 * Every one of the ten spec conditions is checked independently and all
 * failing reasons are collected (not short-circuited), mirroring
 * `evaluateWhatsAppProviderReadiness`'s own "blocked" case. The only
 * exception is `runtimeMode !== "controlled_test_live"`: if that is the
 * *only* thing failing, the result is `"dry_run"` (forced), not `"blocked"` —
 * every other failing condition is a hard block.
 */

export type WhatsAppControlledLiveSendRuntimeMode = "dry_run" | "controlled_test_live";

export type WhatsAppControlledSendStatus =
  | "blocked"
  | "dry_run"
  | "controlled_live_ready"
  | "controlled_live_sent"
  | "failed";

export const CONTROLLED_SEND_STATUS_LABELS: Record<WhatsAppControlledSendStatus, string> = {
  blocked: "Engellendi",
  dry_run: "Dry Run",
  controlled_live_ready: "Controlled Live Hazır",
  controlled_live_sent: "Gönderildi",
  failed: "Başarısız",
};

export const BLOCKING_REASONS = {
  founderApproval: "Founder onayı yok",
  courierDraft: "Courier taslağı onaylı değil",
  deliveryGateway: "Delivery Gateway canlı gönderime izin vermiyor",
  providerReadiness: "WhatsApp provider controlled live hazır değil",
  liveSendGate: "Live Send Gate kapalı",
  controlledLivePolicy: "Controlled Live Provider politikası canlı gönderime izin vermiyor",
  recipientMismatch: "Alıcı test numarası ile eşleşmiyor",
  runtimeMode: "Runtime controlled test live modunda değil",
  emptyMessage: "Mesaj metni boş",
  unsafeMessage: "Mesaj metni güvenlik doğrulamasından geçemedi",
} as const;

export type WhatsAppControlledSendInput = {
  missionId: string;
  leadId: string;
  provider: "whatsapp";
  runtimeMode: WhatsAppControlledLiveSendRuntimeMode;
  founderApproved: boolean;
  courierDraftApproved: boolean;
  deliveryGatewayAllowed: boolean;
  whatsappReadinessStatus: WhatsAppReadinessStatus;
  liveSendGateAllowed: boolean;
  controlledLivePolicyAllowed: boolean;
  recipientPhone: string | null | undefined;
  configuredTestRecipient: string | null | undefined;
  messageText: string;
  createdAt?: number;
  requestedAt?: number;
};

export type WhatsAppControlledSendAuditEntry = {
  timestamp: number;
  actor: string;
  action: string;
  details: string;
};

export type WhatsAppControlledSendResult = {
  provider: "whatsapp";
  status: WhatsAppControlledSendStatus;
  canAttemptLiveSend: boolean;
  forcedDryRun: boolean;
  recipientMasked: string | null;
  messagePreview: string;
  blockingReasons: string[];
  audit: WhatsAppControlledSendAuditEntry[];
  payloadPreview: Record<string, unknown>;
  updatedAt: number;
};

/* ── Safety copy ────────────────────────────────────────────────── */

export const CONTROLLED_SEND_SECTION_LABEL = "Controlled WhatsApp Live Send";
export const CONTROLLED_SEND_NOT_SENT_LABEL = "Gönderim yapılmadı.";
export const CONTROLLED_SEND_REAL_SEND_OFF_LABEL = "Gerçek gönderim kapalı";
export const PREFLIGHT_BUTTON_LABEL = "Test Alıcısına Kontrollü Preflight";

/* ── Masking ────────────────────────────────────────────────────── */

/** Never returns more than the last 2 characters — mirrors `maskTestRecipient`'s own convention. */
export function maskWhatsAppRecipient(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const visible = trimmed.slice(-2);
  return `••• ••• ${visible}`;
}

function normalizePhoneForComparison(value: string | null | undefined): string {
  return (value ?? "").replace(/[\s\-()]/g, "").trim();
}

function recipientMatchesConfiguredTestRecipient(
  recipientPhone: string | null | undefined,
  configuredTestRecipient: string | null | undefined,
): boolean {
  const recipient = normalizePhoneForComparison(recipientPhone);
  const configured = normalizePhoneForComparison(configuredTestRecipient);
  if (!recipient || !configured) return false;
  return recipient === configured;
}

const MESSAGE_PREVIEW_MAX_LENGTH = 80;

function buildMessagePreview(text: string | null | undefined): string {
  const trimmed = (text ?? "").trim();
  if (trimmed.length <= MESSAGE_PREVIEW_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, MESSAGE_PREVIEW_MAX_LENGTH)}…`;
}

/* ── Message safety validation ──────────────────────────────────── */

const MAX_MESSAGE_LENGTH = 1500;
const UNSAFE_PLACEHOLDER_PATTERNS = ["{{", "}}", "[PHONE]", "[NAME]", "undefined", "null"];

export type WhatsAppMessageValidationResult = { valid: boolean; reason: string | null };

/** No external dependency — a non-empty length/pattern check only. */
export function validateWhatsAppMessageText(text: string | null | undefined): WhatsAppMessageValidationResult {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return { valid: false, reason: BLOCKING_REASONS.emptyMessage };
  if (trimmed.length > MAX_MESSAGE_LENGTH) return { valid: false, reason: BLOCKING_REASONS.unsafeMessage };
  const hasUnsafePattern = UNSAFE_PLACEHOLDER_PATTERNS.some((pattern) => trimmed.includes(pattern));
  if (hasUnsafePattern) return { valid: false, reason: BLOCKING_REASONS.unsafeMessage };
  return { valid: true, reason: null };
}

/* ── Payload preview (never carries secrets or the raw recipient) ─ */

export function buildControlledWhatsAppSendPayload(
  input: Pick<WhatsAppControlledSendInput, "recipientPhone" | "messageText">,
): Record<string, unknown> {
  return {
    messaging_product: "whatsapp",
    to: maskWhatsAppRecipient(input.recipientPhone),
    type: "text",
    text: { body: buildMessagePreview(input.messageText) },
  };
}

/* ── Audit ──────────────────────────────────────────────────────── */

function buildControlledSendAudit(
  status: WhatsAppControlledSendStatus,
  blockingReasons: string[],
  now: number,
): WhatsAppControlledSendAuditEntry[] {
  const audit: WhatsAppControlledSendAuditEntry[] = [
    {
      timestamp: now,
      actor: "Founder",
      action: "whatsapp_controlled_send_preflight_requested",
      details: "Controlled WhatsApp gönderim preflight istendi.",
    },
  ];

  if (status === "blocked") {
    audit.push({
      timestamp: now + 1,
      actor: "Gateway",
      action: "whatsapp_controlled_send_blocked",
      details: blockingReasons.join(" — ") || "Controlled gönderim engellendi.",
    });
  } else if (status === "dry_run") {
    audit.push({
      timestamp: now + 1,
      actor: "Gateway",
      action: "whatsapp_controlled_send_forced_dry_run",
      details: blockingReasons[0] ?? "Runtime dry run moduna zorlandı.",
    });
  } else if (status === "controlled_live_ready") {
    audit.push({
      timestamp: now + 1,
      actor: "Gateway",
      action: "whatsapp_controlled_send_ready",
      details: "Controlled live gönderim için tüm koşullar sağlandı — gönderim yapılmadı.",
    });
  }

  return audit;
}

/* ── Evaluator ──────────────────────────────────────────────────── */

/**
 * Pure — no env read, no network, no side effects. Precedence:
 *   1. any hard-block condition (1-7, 9, 10) fails → "blocked"
 *   2. only `runtimeMode !== "controlled_test_live"` fails → "dry_run" (forced)
 *   3. nothing fails → "controlled_live_ready"
 * `"controlled_live_sent"` / `"failed"` are valid `WhatsAppControlledSendStatus`
 * values but this function never constructs them — only the adapter, after an
 * actual (currently stubbed/disabled) send attempt, would ever produce them.
 */
export function evaluateControlledWhatsAppLiveSend(
  input: WhatsAppControlledSendInput,
): WhatsAppControlledSendResult {
  const now = input.requestedAt ?? input.createdAt ?? Date.now();
  const blockingReasons: string[] = [];

  if (!input.founderApproved) blockingReasons.push(BLOCKING_REASONS.founderApproval);
  if (!input.courierDraftApproved) blockingReasons.push(BLOCKING_REASONS.courierDraft);
  if (!input.deliveryGatewayAllowed) blockingReasons.push(BLOCKING_REASONS.deliveryGateway);
  if (input.whatsappReadinessStatus !== "controlled_live_ready") {
    blockingReasons.push(BLOCKING_REASONS.providerReadiness);
  }
  if (!input.liveSendGateAllowed) blockingReasons.push(BLOCKING_REASONS.liveSendGate);
  if (!input.controlledLivePolicyAllowed) blockingReasons.push(BLOCKING_REASONS.controlledLivePolicy);
  if (!recipientMatchesConfiguredTestRecipient(input.recipientPhone, input.configuredTestRecipient)) {
    blockingReasons.push(BLOCKING_REASONS.recipientMismatch);
  }
  if (input.runtimeMode !== "controlled_test_live") blockingReasons.push(BLOCKING_REASONS.runtimeMode);

  const messageValidation = validateWhatsAppMessageText(input.messageText);
  if (!messageValidation.valid && messageValidation.reason) {
    blockingReasons.push(messageValidation.reason);
  }

  const hardBlocked = blockingReasons.some((reason) => reason !== BLOCKING_REASONS.runtimeMode);

  let status: WhatsAppControlledSendStatus;
  let forcedDryRun = false;
  let canAttemptLiveSend = false;
  let finalReasons = blockingReasons;

  if (hardBlocked) {
    status = "blocked";
  } else if (blockingReasons.length > 0) {
    status = "dry_run";
    forcedDryRun = true;
  } else {
    status = "controlled_live_ready";
    canAttemptLiveSend = true;
    finalReasons = [];
  }

  return {
    provider: "whatsapp",
    status,
    canAttemptLiveSend,
    forcedDryRun,
    recipientMasked: maskWhatsAppRecipient(input.recipientPhone),
    messagePreview: buildMessagePreview(input.messageText),
    blockingReasons: finalReasons,
    audit: buildControlledSendAudit(status, finalReasons, now),
    payloadPreview: buildControlledWhatsAppSendPayload(input),
    updatedAt: now,
  };
}
