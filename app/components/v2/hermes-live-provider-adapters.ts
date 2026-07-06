import type { DeliveryProvider, HermesDeliveryRequest } from "@/app/components/v2/hermes-delivery-gateway";
import type { HermesOutboundDraft } from "@/app/components/v2/hermes-courier";
import type { HermesProviderReceipt } from "@/app/components/v2/hermes-provider-connectors";
import type { HermesProviderSession } from "@/app/components/v2/hermes-provider-sessions";
import type { HermesProvider } from "@/app/components/v2/hermes-provider-runtime";
import type { HermesLiveSendGate } from "@/app/components/v2/hermes-live-send-gate";
import type { HermesProviderApiAuthType, HermesProviderApiDryResponse } from "@/app/components/v2/hermes-provider-api-runtime";
import type { HermesMissionTimelineItem } from "@/app/components/v2/adapters/hermes-mission-adapter";

/**
 * Hermes Controlled Live Provider Adapter (v4.9.0).
 *
 * This is the first module in the Hermes chain that even gestures at a real
 * *send* command, so it is deliberately the most conservative module in the
 * codebase. Every reachable code path this sprint resolves to `"blocked"`.
 * There is no env var, no config flag, no test-mode pattern anywhere in
 * this repository for any messaging provider (verified: `.env.local` only
 * has Google Maps / Airtable / DeepSeek keys) — so per this sprint's own
 * instruction ("If no such pattern exists, all live sends must return
 * blocked"), `test_sent` and `live_sent` are typed as valid
 * `HermesLiveSendResultStatus` values but this module never constructs one.
 * `HermesLiveAdapterMode.real_provider` is likewise typed but never assigned
 * to any registry entry.
 *
 * Architecture:
 *
 *   Founder final action → Controlled Live Adapter → (blocked by policy)
 *
 * No fetch, no axios, no provider SDK, no Meta Graph API call, no WhatsApp
 * Cloud API call, no SMTP call, no SMS API call, no webhook, no cron, no
 * background worker, no token exchange, no automatic/autonomous send. The
 * button this module powers ("Canlı Gönderim Denetimi Çalıştır") is
 * explicitly an *audit*, not a send — its entire purpose is to produce a
 * `"blocked"` result with a precise reason, not to attempt delivery that
 * then gets blocked reactively.
 *
 * Session state only — HermesLiveSendResult is never persisted. Kept in a
 * Record<missionId, HermesLiveSendResult> by the caller (V2Shell), the same
 * convention every prior Hermes Record already uses.
 *
 * Two-tier guard, mirroring hermes-live-send-gate.ts's own
 * `hasMinimumGatePrerequisites` / `canOpenLiveSendGate` split:
 *   - `hasMinimumControlledSendPrerequisites` (private) / exported wrapper
 *     `canCreateControlledLiveSendResultRecord` — decides whether a result
 *     record gets created at all (draft/delivery/receipt/gate/dry-response
 *     chain intact). Deliberately excludes provider runtime/session/adapter/
 *     policy — those decide the record's *status*, not whether it exists.
 *   - `canAttemptControlledLiveSend` — the full ladder, including the
 *     always-false policy/session/adapter checks, used both for the
 *     Decision Center's live guard display and internally by
 *     `attemptControlledLiveSend` to compute the final blocked reason.
 *
 * Does not touch Execution Runtime, Hermes Monitor, the Decision Engine,
 * Mission Adapter, Pipeline Engine, Courier Draft Runtime, Delivery
 * Gateway, Provider Connector, Provider Runtime, Provider Session, Live
 * Send Gate, or Provider API Dry Mode's own business rules — it only reads
 * what those already produced. Pure TypeScript, no React.
 */

/* ── Live send policy ───────────────────────────────────────────── */

export type HermesControlledLiveSendPolicy = {
  liveSendEnabled: boolean;
  requiresFounderFinalAction: boolean;
  requiresDryRunCompleted: boolean;
  requiresGateConfirmed: boolean;
  requiresProviderSessionAuthorized: boolean;
  requiresProviderRuntimeReady: boolean;
  allowTestAdapterOnly: boolean;
  allowRealProviderNetwork: boolean;
  reason: string;
};

/** This sprint's fixed policy — every "requires" flag is true (the full ladder still applies), but liveSendEnabled/allowRealProviderNetwork are hard false. */
export const DEFAULT_CONTROLLED_LIVE_SEND_POLICY: HermesControlledLiveSendPolicy = {
  liveSendEnabled: false,
  requiresFounderFinalAction: true,
  requiresDryRunCompleted: true,
  requiresGateConfirmed: true,
  requiresProviderSessionAuthorized: true,
  requiresProviderRuntimeReady: true,
  allowTestAdapterOnly: true,
  allowRealProviderNetwork: false,
  reason: "Canlı gönderim varsayılan olarak kapalı.",
};

/* ── Live adapter model ─────────────────────────────────────────── */

export type HermesLiveAdapterMode = "disabled" | "test_adapter" | "real_provider";

export const LIVE_ADAPTER_MODE_LABELS: Record<HermesLiveAdapterMode, string> = {
  disabled: "Kapalı",
  test_adapter: "Test Adapter",
  real_provider: "Gerçek Sağlayıcı",
};

export type HermesLiveAdapterSafetyLevel = "test-only" | "not-supported";

export type HermesLiveAdapterStatus =
  | "disabled"
  | "test_ready"
  | "missing_credentials"
  | "not_authorized"
  | "unsupported"
  | "ready";

export const LIVE_ADAPTER_STATUS_LABELS: Record<HermesLiveAdapterStatus, string> = {
  disabled: "Live Disabled",
  test_ready: "Test Adapter Hazır",
  missing_credentials: "Kimlik Bilgisi Eksik",
  not_authorized: "Yetkilendirilmedi",
  unsupported: "Desteklenmiyor",
  ready: "Hazır",
};

export type HermesLiveProviderAdapter = {
  provider: DeliveryProvider;
  label: string;
  mode: HermesLiveAdapterMode;
  /** Always false this sprint for every adapter — no live integration exists yet. */
  supportsLiveSend: boolean;
  supportsTestAdapter: boolean;
  requiresCredentials: boolean;
  requiresWebhook: boolean;
  requiresRateLimit: boolean;
  endpointLabel: string;
  authType: HermesProviderApiAuthType;
  safetyLevel: HermesLiveAdapterSafetyLevel;
  status: HermesLiveAdapterStatus;
};

/**
 * Static registry — deterministic, no env read, no real endpoints. Every
 * real provider's `mode` is fixed at `"disabled"` and `supportsLiveSend` at
 * `false`; `endpointLabel`/`authType` mirror the same vocabulary Provider
 * API Dry Mode (v4.8.0) already established for the same providers, so the
 * two registries never describe the same provider differently.
 */
export const LIVE_PROVIDER_ADAPTERS: Record<DeliveryProvider, HermesLiveProviderAdapter> = {
  whatsapp: {
    provider: "whatsapp",
    label: "WhatsApp",
    mode: "disabled",
    supportsLiveSend: false,
    supportsTestAdapter: true,
    requiresCredentials: true,
    requiresWebhook: true,
    requiresRateLimit: true,
    endpointLabel: "WhatsApp Cloud API /messages",
    authType: "bearer_token_required",
    safetyLevel: "test-only",
    status: "disabled",
  },
  instagram: {
    provider: "instagram",
    label: "Instagram",
    mode: "disabled",
    supportsLiveSend: false,
    supportsTestAdapter: true,
    requiresCredentials: true,
    requiresWebhook: true,
    requiresRateLimit: true,
    endpointLabel: "Instagram Graph API /messages",
    authType: "graph_api_token_required",
    safetyLevel: "test-only",
    status: "disabled",
  },
  email: {
    provider: "email",
    label: "E-posta",
    mode: "disabled",
    supportsLiveSend: false,
    supportsTestAdapter: true,
    requiresCredentials: true,
    requiresWebhook: false,
    requiresRateLimit: true,
    endpointLabel: "Email Provider /send",
    authType: "smtp_or_api_key_required",
    safetyLevel: "test-only",
    status: "disabled",
  },
  sms: {
    provider: "sms",
    label: "SMS",
    mode: "disabled",
    supportsLiveSend: false,
    supportsTestAdapter: true,
    requiresCredentials: true,
    requiresWebhook: false,
    requiresRateLimit: true,
    endpointLabel: "SMS Provider /messages",
    authType: "api_key_required",
    safetyLevel: "test-only",
    status: "disabled",
  },
  unknown: {
    provider: "unknown",
    label: "Sağlayıcı Belirsiz",
    mode: "disabled",
    supportsLiveSend: false,
    supportsTestAdapter: false,
    requiresCredentials: false,
    requiresWebhook: false,
    requiresRateLimit: false,
    endpointLabel: "—",
    authType: "none",
    safetyLevel: "not-supported",
    status: "unsupported",
  },
};

export function getLiveProviderAdapter(provider: DeliveryProvider): HermesLiveProviderAdapter {
  return LIVE_PROVIDER_ADAPTERS[provider];
}

/* ── Live send command model ────────────────────────────────────── */

export type HermesLiveSendCommandSource = "founder-live-attempt";

export type HermesLiveSendCommand = {
  id: string;
  missionId: string;
  leadId: string;
  draftId: string;
  deliveryId: string;
  receiptId: string;
  gateId: string;
  apiDryResponseId: string;
  provider: DeliveryProvider;
  recipient: string | null;
  body: string;
  mode: HermesLiveAdapterMode;
  requestedAt: number;
  requestedBy: string;
  source: HermesLiveSendCommandSource;
};

/* ── Live send result model ─────────────────────────────────────── */

export type HermesLiveSendResultStatus = "blocked" | "test_sent" | "live_sent" | "failed";

export const LIVE_SEND_RESULT_STATUS_LABELS: Record<HermesLiveSendResultStatus, string> = {
  blocked: "Politika Nedeniyle Engellendi",
  test_sent: "Test Adapter Sonucu",
  live_sent: "Canlı Gönderildi",
  failed: "Başarısız",
};

export type LiveSendAuditEntry = {
  timestamp: number;
  actor: string;
  action: string;
  details: string;
};

export type HermesLiveSendResult = {
  id: string;
  commandId: string;
  missionId: string;
  leadId: string;
  provider: DeliveryProvider;
  mode: HermesLiveAdapterMode;
  status: HermesLiveSendResultStatus;
  createdAt: number;
  completedAt?: number;
  providerMessageId?: string;
  resultMessage: string;
  error?: string;
  /** Append-only — mirrors HermesLiveSendGate.audit's convention. */
  audit: LiveSendAuditEntry[];
};

/* ── Safety copy ────────────────────────────────────────────────── */

export const CONTROLLED_LIVE_ADAPTER_SECTION_LABEL = "Controlled Live Adapter";
export const RUN_LIVE_SEND_AUDIT_BUTTON_LABEL = "Canlı Gönderim Denetimi Çalıştır";
export const LIVE_POLICY_DISABLED_LABEL = "Canlı gönderim politikası kapalı";
export const NO_REAL_MESSAGE_SENT_LABEL = "Gerçek mesaj gönderilmedi";
export const TEST_ADAPTER_RESULT_LABEL = "Test adapter sonucu";
export const LIVE_DISABLED_LABEL = "Live Disabled";
export const BLOCKED_BY_POLICY_LABEL = "Politika nedeniyle engellendi";
export const RESULT_READY_LABEL = "Denetim sonucu hazır";
export const NO_EXTERNAL_DELIVERY_MESSAGE = "Dış teslimat gerçekleştirilmedi.";
export const CONTROLLED_LIVE_SEND_WARNING =
  "Bu işlem gerçek mesaj göndermez. Canlı gönderim politikası kapalıdır.";
/** Unused in logic this sprint (test_sent is never produced) — declared so the copy already exists for the sprint that implements it. */
export const TEST_ADAPTER_COMPLETED_MESSAGE = "Test adapter sonucu oluşturuldu — gerçek mesaj gönderilmedi.";

export type HermesControlledLiveSendGuardResult = { allowed: boolean; reason: string };

/**
 * The subset of `canAttemptControlledLiveSend`'s ladder that must pass
 * before a result *record* is created at all. Deliberately excludes the
 * provider-runtime/session/adapter/policy tier — same split
 * `hasMinimumGatePrerequisites` established for Live Send Gate: those
 * checks decide the record's *status*, not whether it exists. Not
 * exported directly — `canCreateControlledLiveSendResultRecord` is the
 * public wrapper.
 */
function hasMinimumControlledSendPrerequisites(
  draft: HermesOutboundDraft | undefined,
  delivery: HermesDeliveryRequest | undefined,
  receipt: HermesProviderReceipt | undefined,
  gate: HermesLiveSendGate | undefined,
  apiDryResponse: HermesProviderApiDryResponse | undefined,
  existing: HermesLiveSendResult | undefined,
): HermesControlledLiveSendGuardResult {
  const blocked = (reason: string): HermesControlledLiveSendGuardResult => ({ allowed: false, reason });

  if (existing) {
    return blocked("Bu mission için zaten bir canlı gönderim denetim sonucu var — mükerrer deneme engellendi.");
  }
  if (!draft) return blocked("Onaylı taslak bulunamadı.");
  if (draft.status !== "approved") return blocked("Taslak henüz onaylanmadı.");
  if (!delivery) return blocked("Teslimat isteği bulunamadı.");
  if (delivery.status !== "ready") {
    return blocked("Teslimat isteği henüz Sağlayıcı İçin Hazır durumunda değil.");
  }
  if (!receipt) return blocked("Shadow send makbuzu bulunamadı.");
  if (receipt.status !== "shadow_sent") return blocked("Shadow send tamamlanmadı.");
  if (!gate) return blocked("Live Send Gate bulunamadı.");
  if (gate.status === "cancelled") return blocked("Live Send Gate iptal edildi.");
  if (gate.status !== "confirmed_but_blocked") return blocked("Live Send Gate henüz onaylanmadı.");
  if (!apiDryResponse) return blocked("API Dry Run sonucu bulunamadı.");
  if (apiDryResponse.status !== "dry_ready") return blocked("API Dry Run tamamlanmadı.");
  if (delivery.provider === "unknown") return blocked("Sağlayıcı belirlenemedi.");
  if (!delivery.recipient) return blocked("Alıcı bilgisi bulunamadı.");
  if (!draft.body.trim()) return blocked("Mesaj içeriği boş — canlı gönderim denetimi oluşturulamaz.");

  return { allowed: true, reason: "Canlı gönderim denetimi için minimum koşullar sağlandı." };
}

/** Exported so V2Shell can decide, before calling `attemptControlledLiveSend`, whether a result record should be created at all. */
export function canCreateControlledLiveSendResultRecord(
  draft: HermesOutboundDraft | undefined,
  delivery: HermesDeliveryRequest | undefined,
  receipt: HermesProviderReceipt | undefined,
  gate: HermesLiveSendGate | undefined,
  apiDryResponse: HermesProviderApiDryResponse | undefined,
  existing: HermesLiveSendResult | undefined,
): HermesControlledLiveSendGuardResult {
  return hasMinimumControlledSendPrerequisites(draft, delivery, receipt, gate, apiDryResponse, existing);
}

/**
 * Full guardrail ladder — every condition the spec lists, in order.
 * Answers "could this theoretically live-send right now" — always `false`
 * this sprint: `session.authorized` is hardcoded false for every provider
 * (no messaging credential exists anywhere in this codebase — see
 * `hermes-provider-sessions.ts`), every adapter's `mode` is hardcoded
 * `"disabled"`, and `DEFAULT_CONTROLLED_LIVE_SEND_POLICY.liveSendEnabled` is
 * hardcoded `false`. Three independent, structural reasons this can never
 * flip to `true` by accident.
 */
export function canAttemptControlledLiveSend(
  draft: HermesOutboundDraft | undefined,
  delivery: HermesDeliveryRequest | undefined,
  receipt: HermesProviderReceipt | undefined,
  gate: HermesLiveSendGate | undefined,
  apiDryResponse: HermesProviderApiDryResponse | undefined,
  runtime: HermesProvider | undefined,
  session: HermesProviderSession | undefined,
  adapter: HermesLiveProviderAdapter | undefined,
  policy: HermesControlledLiveSendPolicy,
  existing: HermesLiveSendResult | undefined,
): HermesControlledLiveSendGuardResult {
  const pre = hasMinimumControlledSendPrerequisites(draft, delivery, receipt, gate, apiDryResponse, existing);
  if (!pre.allowed) return pre;

  const blocked = (reason: string): HermesControlledLiveSendGuardResult => ({ allowed: false, reason });

  if (!runtime) return blocked("Provider Runtime bulunamadı.");
  if (runtime.connectionState === "blocked" || runtime.status === "blocked") {
    return blocked("Provider Runtime engellendi.");
  }
  if (runtime.status === "offline") return blocked("Provider Runtime çevrimdışı.");
  if (!session) return blocked("Provider oturumu bulunamadı.");
  if (!session.authorized) return blocked("Provider oturumu yetkilendirilmedi.");
  if (!adapter) return blocked("Live adapter bulunamadı.");
  if (adapter.mode === "disabled") return blocked("Live adapter modu kapalı.");
  if (!policy.liveSendEnabled) return blocked(policy.reason);
  if (adapter.mode === "real_provider" && !policy.allowRealProviderNetwork) {
    return blocked("Gerçek sağlayıcı ağı kapalı — canlı gönderim engellendi.");
  }

  return { allowed: true, reason: "Canlı gönderim denetimi için tüm koşullar sağlandı." };
}

/**
 * Runs the Founder Final Action → Dry Run Verification → Adapter Selection
 * → Live Policy Check chain in one synchronous, deterministic pass — there
 * is no real work to await, so there is no reason to fake one with timers.
 * Callers must call `canCreateControlledLiveSendResultRecord` first (like
 * `openLiveSendGate` assumes for its own minimum prerequisites); this
 * function then re-derives the *full* ladder internally to decide the
 * result's status/reason, exactly like `openLiveSendGate` does for its own
 * gate status.
 *
 * `status` is always `"blocked"` this sprint — `test_sent`/`live_sent`/
 * `failed` are valid shapes for a future sprint but are never constructed
 * here, per this sprint's explicit instruction to leave test-adapter
 * behavior unimplemented when no safe test-mode pattern already exists in
 * the repository (none does).
 */
export function attemptControlledLiveSend(
  draft: HermesOutboundDraft,
  delivery: HermesDeliveryRequest,
  receipt: HermesProviderReceipt,
  gate: HermesLiveSendGate,
  apiDryResponse: HermesProviderApiDryResponse,
  runtime: HermesProvider | undefined,
  session: HermesProviderSession | undefined,
  adapter: HermesLiveProviderAdapter,
  policy: HermesControlledLiveSendPolicy = DEFAULT_CONTROLLED_LIVE_SEND_POLICY,
): HermesLiveSendResult {
  const now = Date.now();
  const guard = canAttemptControlledLiveSend(
    draft,
    delivery,
    receipt,
    gate,
    apiDryResponse,
    runtime,
    session,
    adapter,
    policy,
    undefined,
  );

  const command: HermesLiveSendCommand = {
    id: `live-command:${delivery.missionId}`,
    missionId: delivery.missionId,
    leadId: delivery.leadId,
    draftId: draft.id,
    deliveryId: delivery.id,
    receiptId: receipt.id,
    gateId: gate.id,
    apiDryResponseId: apiDryResponse.id,
    provider: delivery.provider,
    recipient: delivery.recipient,
    body: draft.body,
    mode: adapter.mode,
    requestedAt: now,
    requestedBy: "Founder",
    source: "founder-live-attempt",
  };

  const audit: LiveSendAuditEntry[] = [
    {
      timestamp: now,
      actor: "Founder",
      action: "controlled_live_send_requested",
      details: "Founder canlı gönderim denetimini başlattı.",
    },
    {
      timestamp: now + 1,
      actor: "Gateway",
      action: "founder_final_action_verified",
      details: "Founder final aksiyonu doğrulandı.",
    },
    {
      timestamp: now + 2,
      actor: "Gateway",
      action: "dry_run_verified",
      details: "Dry run doğrulandı.",
    },
    {
      timestamp: now + 3,
      actor: "Gateway",
      action: "adapter_selected",
      details: `${adapter.label} live adapter seçildi.`,
    },
    {
      timestamp: now + 4,
      actor: "Gateway",
      action: "live_policy_checked",
      details: "Canlı gönderim politikası kontrol edildi.",
    },
    {
      timestamp: now + 5,
      actor: "Gateway",
      action: "live_send_blocked",
      details: guard.reason,
    },
    {
      timestamp: now + 6,
      actor: "Gateway",
      action: "no_external_delivery",
      details: NO_EXTERNAL_DELIVERY_MESSAGE,
    },
  ];

  return {
    id: `live-result:${delivery.missionId}`,
    commandId: command.id,
    missionId: delivery.missionId,
    leadId: delivery.leadId,
    provider: delivery.provider,
    mode: adapter.mode,
    status: "blocked",
    createdAt: now,
    completedAt: now + 6,
    resultMessage: guard.reason,
    audit,
  };
}

/**
 * Presentation-only projection for the mission card / sidebar badge — mirrors
 * `computeMissionApiDryUiState`'s "real state if it exists, else a derived
 * pre-state" convention.
 */
export type MissionLiveAdapterUiState = "not-ready" | "ready" | "completed";

export function computeMissionLiveAdapterUiState(
  apiDryResponse: HermesProviderApiDryResponse | undefined,
  result: HermesLiveSendResult | undefined,
): MissionLiveAdapterUiState {
  if (result) return "completed";
  if (!apiDryResponse || apiDryResponse.status !== "dry_ready") return "not-ready";
  return "ready";
}

export const MISSION_LIVE_ADAPTER_STATE_LABELS: Record<MissionLiveAdapterUiState, string> = {
  "not-ready": "Controlled Live Adapter Hazır Değil",
  ready: "Controlled Live Adapter Hazır",
  completed: RESULT_READY_LABEL,
};

/**
 * Mission timeline entries — a pure projection of the result's own audit
 * log, exactly like every other Hermes *TimelineEntries builder. Callers
 * MAY merge this into the global "Bugünün Hermes Aktivitesi" feed (gated
 * per-mission on the result actually existing, same convention
 * `buildProviderApiDryTimelineEntries` already uses) — a founder-triggered,
 * per-mission event, never a repeated global registry snapshot.
 */
export function buildLiveSendTimelineEntries(
  result: HermesLiveSendResult | undefined,
): HermesMissionTimelineItem[] {
  if (!result) return [];
  return result.audit.map((entry) => ({
    at: entry.timestamp,
    actorLabel: entry.actor,
    actorCls: entry.actor === "Founder" ? "text-zinc-100" : "text-indigo-300",
    text: entry.details,
  }));
}
