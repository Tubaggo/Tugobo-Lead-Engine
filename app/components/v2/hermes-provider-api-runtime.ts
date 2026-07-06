import type { DeliveryProvider, HermesDeliveryRequest } from "@/app/components/v2/hermes-delivery-gateway";
import type { DraftChannel, HermesOutboundDraft } from "@/app/components/v2/hermes-courier";
import type { HermesProviderReceipt } from "@/app/components/v2/hermes-provider-connectors";
import type { HermesProviderSession } from "@/app/components/v2/hermes-provider-sessions";
import type { HermesProvider } from "@/app/components/v2/hermes-provider-runtime";
import type { HermesLiveSendGate } from "@/app/components/v2/hermes-live-send-gate";
import type { HermesMissionTimelineItem } from "@/app/components/v2/adapters/hermes-mission-adapter";

/**
 * Hermes Provider API Integration Runtime (v4.8.0) — Dry Mode.
 *
 * This is the first module that even gestures at a real provider API
 * *shape* (endpoint, method, auth type, payload), so it is deliberately as
 * conservative as Provider Connector was when it introduced shadow send.
 * Every adapter this sprint runs in `dry_mode` only: it builds the exact
 * request/response contract a live integration would need, but the network
 * call itself never happens. `future_live_mode` exists purely as a typed
 * placeholder — no adapter is ever built with it, no code path reaches it.
 *
 * Architecture:
 *
 *   Hermes → Provider Runtime → Provider API Adapter → (dry_mode only)
 *
 * Hermes never calls a provider API. It never even calls this module
 * directly — Provider Runtime is still the only thing Hermes talks to
 * conceptually; this module is what Provider Runtime would delegate to if
 * it ever needed to *shape* a request. No fetch, no axios, no provider SDK,
 * no Meta Graph API call, no WhatsApp Cloud API call, no SMTP call, no SMS
 * API call, no webhook, no cron, no background worker, no token exchange.
 *
 * Session state only — HermesProviderApiDryResponse is never persisted.
 * Kept in a Record<missionId, HermesProviderApiDryResponse> by the caller
 * (V2Shell), the same convention every prior Hermes Record already uses.
 *
 * Deliberately gated behind Live Send Gate reaching `confirmed_but_blocked`
 * — dry mode previews what a *future* live send would look like only after
 * the founder has already walked the full supervised chain (draft approved
 * → delivery ready → shadow receipt → gate confirmed). It does not replace
 * or restyle any of those guards; `canBuildProviderApiDryRequest` is an
 * additive, stricter guard layered on top of them.
 *
 * Does not touch Execution Runtime, Hermes Monitor, the Decision Engine,
 * Mission Adapter, Pipeline Engine, Courier Draft Runtime, Delivery Gateway,
 * Provider Connector, Provider Runtime, Provider Session, or Live Send
 * Gate's own business rules — it only reads what those already produced.
 * Pure TypeScript, no React.
 */

export type HermesProviderApiMode = "dry_mode" | "disabled" | "future_live_mode";

export const DEFAULT_PROVIDER_API_MODE: HermesProviderApiMode = "dry_mode";

export const PROVIDER_API_MODE_LABELS: Record<HermesProviderApiMode, string> = {
  dry_mode: "Dry Mode",
  disabled: "Kapalı",
  future_live_mode: "Gelecekte Canlı Mod",
};

export type HermesProviderApiAuthType =
  | "bearer_token_required"
  | "graph_api_token_required"
  | "smtp_or_api_key_required"
  | "api_key_required"
  | "none";

export const AUTH_TYPE_LABELS: Record<HermesProviderApiAuthType, string> = {
  bearer_token_required: "Bearer Token Gerekli",
  graph_api_token_required: "Graph API Token Gerekli",
  smtp_or_api_key_required: "SMTP veya API Anahtarı Gerekli",
  api_key_required: "API Anahtarı Gerekli",
  none: "Kimlik Doğrulama Yok",
};

export type HermesProviderApiAdapterStatus =
  | "dry_ready"
  | "disabled"
  | "missing_configuration"
  | "unsupported";

export const ADAPTER_STATUS_LABELS: Record<HermesProviderApiAdapterStatus, string> = {
  dry_ready: "Adapter Hazır",
  disabled: "Kapalı",
  missing_configuration: "Yapılandırma Eksik",
  unsupported: "Desteklenmiyor",
};

export type HermesProviderApiAdapter = {
  provider: DeliveryProvider;
  label: string;
  mode: HermesProviderApiMode;
  supportsDryRun: boolean;
  /** Always false this sprint for every adapter — no live integration exists yet. */
  supportsLiveSend: boolean;
  endpointLabel: string;
  methodLabel: string;
  authType: HermesProviderApiAuthType;
  requiredFields: string[];
  optionalFields: string[];
  rateLimitHint: string;
  payloadShapeHint: string;
  status: HermesProviderApiAdapterStatus;
};

/**
 * Static registry — deterministic, no env read, no real endpoints (labels
 * only, per spec). `missing_configuration` is unreachable this sprint (every
 * adapter's `status` is fixed at build time); kept only so the type already
 * matches what a future sprint's real-credential check would produce.
 */
export const PROVIDER_API_ADAPTERS: Record<DeliveryProvider, HermesProviderApiAdapter> = {
  whatsapp: {
    provider: "whatsapp",
    label: "WhatsApp",
    mode: "dry_mode",
    supportsDryRun: true,
    supportsLiveSend: false,
    endpointLabel: "WhatsApp Cloud API /messages",
    methodLabel: "POST",
    authType: "bearer_token_required",
    requiredFields: ["recipient", "body", "access_token", "phone_number_id"],
    optionalFields: ["template_name", "language_code"],
    rateLimitHint: "Sağlayıcıya özel hız sınırı bu sprintte uygulanmadı.",
    payloadShapeHint: "messaging_product, to, type, text.body",
    status: "dry_ready",
  },
  instagram: {
    provider: "instagram",
    label: "Instagram",
    mode: "dry_mode",
    supportsDryRun: true,
    supportsLiveSend: false,
    endpointLabel: "Instagram Graph API /messages",
    methodLabel: "POST",
    authType: "graph_api_token_required",
    requiredFields: ["recipient", "body", "page_access_token", "instagram_account_id"],
    optionalFields: ["quick_replies"],
    rateLimitHint: "Sağlayıcıya özel hız sınırı bu sprintte uygulanmadı.",
    payloadShapeHint: "recipient.id, message.text",
    status: "dry_ready",
  },
  email: {
    provider: "email",
    label: "E-posta",
    mode: "dry_mode",
    supportsDryRun: true,
    supportsLiveSend: false,
    endpointLabel: "Email Provider /send",
    methodLabel: "POST",
    authType: "smtp_or_api_key_required",
    requiredFields: ["recipient", "subject", "body", "from"],
    optionalFields: ["reply_to", "html"],
    rateLimitHint: "Sağlayıcıya özel hız sınırı bu sprintte uygulanmadı.",
    payloadShapeHint: "to, subject, text/html",
    status: "dry_ready",
  },
  sms: {
    provider: "sms",
    label: "SMS",
    mode: "dry_mode",
    supportsDryRun: true,
    supportsLiveSend: false,
    endpointLabel: "SMS Provider /messages",
    methodLabel: "POST",
    authType: "api_key_required",
    requiredFields: ["recipient", "body", "sender_id"],
    optionalFields: ["unicode"],
    rateLimitHint: "Sağlayıcıya özel hız sınırı bu sprintte uygulanmadı.",
    payloadShapeHint: "to, message, sender",
    status: "dry_ready",
  },
  unknown: {
    provider: "unknown",
    label: "Sağlayıcı Belirsiz",
    mode: "disabled",
    supportsDryRun: false,
    supportsLiveSend: false,
    endpointLabel: "—",
    methodLabel: "—",
    authType: "none",
    requiredFields: [],
    optionalFields: [],
    rateLimitHint: "—",
    payloadShapeHint: "—",
    status: "unsupported",
  },
};

export function getProviderApiAdapter(provider: DeliveryProvider): HermesProviderApiAdapter {
  return PROVIDER_API_ADAPTERS[provider];
}

/**
 * Dry payload shapes only — never sent anywhere. Matches the spec's exact
 * per-provider shape so the founder previews the real future contract.
 */
export function buildDryPayloadPreview(
  provider: DeliveryProvider,
  recipient: string | null,
  body: string,
  subject?: string,
): Record<string, unknown> {
  switch (provider) {
    case "whatsapp":
      return { messaging_product: "whatsapp", to: recipient, type: "text", text: { body } };
    case "instagram":
      return { recipient: { id: recipient }, message: { text: body } };
    case "email":
      return { to: recipient, subject: subject ?? "", text: body };
    case "sms":
      return { to: recipient, message: body };
    case "unknown":
    default:
      return {};
  }
}

export type HermesProviderApiDryRequestSource = "founder-dry-run";

export type HermesProviderApiDryRequest = {
  id: string;
  missionId: string;
  leadId: string;
  draftId: string;
  deliveryId: string;
  receiptId: string;
  gateId: string;
  provider: DeliveryProvider;
  channel: DraftChannel;
  recipient: string | null;
  body: string;
  mode: HermesProviderApiMode;
  endpointLabel: string;
  methodLabel: string;
  authType: HermesProviderApiAuthType;
  payloadPreview: Record<string, unknown>;
  createdAt: number;
  source: HermesProviderApiDryRequestSource;
};

export type HermesProviderApiValidationResult = {
  allowed: boolean;
  reason: string;
  missingFields: string[];
  warnings: string[];
};

export type ProviderApiAuditEntry = {
  timestamp: number;
  actor: string;
  action: string;
  details: string;
};

export type HermesProviderApiDryResponseStatus = "dry_ready" | "dry_blocked" | "disabled" | "unsupported";

export const DRY_RESPONSE_STATUS_LABELS: Record<HermesProviderApiDryResponseStatus, string> = {
  dry_ready: "Dry Run Tamamlandı",
  dry_blocked: "Dry Run Engellendi",
  disabled: "Canlı API Kapalı",
  unsupported: "Desteklenmiyor",
};

export type HermesProviderApiDryResponse = {
  id: string;
  requestId: string;
  provider: DeliveryProvider;
  mode: HermesProviderApiMode;
  status: HermesProviderApiDryResponseStatus;
  createdAt: number;
  resultMessage: string;
  payloadPreview: Record<string, unknown>;
  validationResult: HermesProviderApiValidationResult;
  /** Append-only — mirrors HermesDeliveryRequest.audit's convention. */
  audit: ProviderApiAuditEntry[];
};

/* ── Safety copy ────────────────────────────────────────────────── */

export const PROVIDER_API_DRY_MODE_SECTION_LABEL = "Provider API Dry Mode";
export const API_DRY_RUN_BUTTON_LABEL = "API Dry Run Oluştur";
export const DRY_MODE_COMPLETED_MESSAGE = "Dry mode tamamlandı — gerçek API çağrısı yapılmadı.";
export const NO_REAL_API_CALL_NOTE = "Bu işlem gerçek API çağrısı yapmaz.";
export const LIVE_API_DISABLED_LABEL = "Canlı API Kapalı";
export const PAYLOAD_PREVIEW_LABEL = "Payload Önizlemesi";
export const MISSING_FIELDS_LABEL = "Eksik Alanlar";
export const NOT_SENT_DRY_LABEL = "Gönderim yapılmadı.";
export const DRY_MODE_NOT_READY_LABEL = "API Dry Mode Hazır Değil";
export const DRY_MODE_READY_LABEL = "API Dry Mode Hazır";

/**
 * Full guardrail ladder — every condition the spec lists, in order.
 *
 * Because live sending is disabled everywhere, "live send policy disabled"
 * is deliberately NOT one of the blocking conditions below — the spec's own
 * clarification is explicit: dry mode must stay reachable precisely because
 * live send is closed. Credential-shaped required fields (access_token,
 * phone_number_id, page_access_token, instagram_account_id, from,
 * sender_id) never block `allowed` either — no messaging credential exists
 * anywhere in this codebase (same precedent `hermes-provider-sessions.ts`
 * established), and dry mode's entire purpose is to preview the request
 * shape *before* those exist. They still populate `missingFields` so the
 * founder can see exactly what a live integration would still need.
 */
export function canBuildProviderApiDryRequest(
  gate: HermesLiveSendGate | undefined,
  receipt: HermesProviderReceipt | undefined,
  delivery: HermesDeliveryRequest | undefined,
  draft: HermesOutboundDraft | undefined,
  runtime: HermesProvider | undefined,
  session: HermesProviderSession | undefined,
  adapter: HermesProviderApiAdapter | undefined,
  existing: HermesProviderApiDryResponse | undefined,
): HermesProviderApiValidationResult {
  const blocked = (reason: string): HermesProviderApiValidationResult => ({
    allowed: false,
    reason,
    missingFields: [],
    warnings: [],
  });

  if (existing) {
    return blocked("Bu mission için zaten bir Dry Run sonucu var — mükerrer çalıştırma engellendi.");
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
  if (delivery.provider === "unknown") return blocked("Sağlayıcı belirlenemedi.");
  if (!adapter || !adapter.supportsDryRun || adapter.status === "unsupported") {
    return blocked("Bu sağlayıcı için API adapter desteklenmiyor.");
  }
  if (adapter.mode === "disabled") return blocked("API adapter modu kapalı.");
  if (!delivery.recipient) return blocked("Alıcı bilgisi bulunamadı.");
  if (!draft.body.trim()) return blocked("Mesaj içeriği boş — dry run oluşturulamaz.");
  if (!runtime) return blocked("Provider Runtime bulunamadı.");
  if (runtime.connectionState === "blocked" || runtime.status === "blocked") {
    return blocked("Provider Runtime engellendi.");
  }
  if (runtime.status === "offline") return blocked("Provider Runtime çevrimdışı.");
  if (!session) return blocked("Provider oturumu bulunamadı.");
  if (!session.canShadowSend) return blocked("Provider oturumu shadow send yeteneğine sahip değil.");

  const resolved: Record<string, string | undefined> = {
    recipient: delivery.recipient ?? undefined,
    body: draft.body,
    subject: draft.subject,
  };
  const missingFields = adapter.requiredFields.filter((field) => !resolved[field]?.trim());
  const warnings =
    missingFields.length > 0
      ? ["Gerçek gönderim için kimlik bilgileri (credentials) henüz tanımlı değil."]
      : [];

  return { allowed: true, reason: "Dry Run için tüm koşullar sağlandı.", missingFields, warnings };
}

/**
 * Runs the Adapter Selection → Payload Build → Field Validation → Dry
 * Complete chain in one synchronous, deterministic pass — there is no real
 * work to await, so there is no reason to fake one with timers. Callers
 * must call `canBuildProviderApiDryRequest` first; this assumes the gate
 * already passed, so `status` is always `dry_ready` here — `dry_blocked`,
 * `disabled`, and `unsupported` are valid response shapes but only ever
 * appear as presentational states when a response was never built at all
 * (see `computeMissionApiDryUiState`), not as this function's own output.
 */
export function runProviderApiDryMode(
  gate: HermesLiveSendGate,
  receipt: HermesProviderReceipt,
  delivery: HermesDeliveryRequest,
  draft: HermesOutboundDraft,
  adapter: HermesProviderApiAdapter,
  validation: HermesProviderApiValidationResult,
): HermesProviderApiDryResponse {
  const now = Date.now();
  const payloadPreview = buildDryPayloadPreview(delivery.provider, delivery.recipient, draft.body, draft.subject);

  const request: HermesProviderApiDryRequest = {
    id: `dry-request:${delivery.missionId}`,
    missionId: delivery.missionId,
    leadId: delivery.leadId,
    draftId: draft.id,
    deliveryId: delivery.id,
    receiptId: receipt.id,
    gateId: gate.id,
    provider: delivery.provider,
    channel: delivery.channel,
    recipient: delivery.recipient,
    body: draft.body,
    mode: adapter.mode,
    endpointLabel: adapter.endpointLabel,
    methodLabel: adapter.methodLabel,
    authType: adapter.authType,
    payloadPreview,
    createdAt: now,
    source: "founder-dry-run",
  };

  const audit: ProviderApiAuditEntry[] = [
    {
      timestamp: now,
      actor: "Gateway",
      action: "adapter_selected",
      details: `${adapter.label} API adapter seçildi.`,
    },
    {
      timestamp: now + 1,
      actor: "Gateway",
      action: "payload_built",
      details: "Dry payload oluşturuldu.",
    },
    {
      timestamp: now + 2,
      actor: "Gateway",
      action: "fields_validated",
      details:
        validation.missingFields.length > 0
          ? `Zorunlu alanlar doğrulandı — eksik: ${validation.missingFields.join(", ")}.`
          : "Zorunlu alanlar doğrulandı.",
    },
    {
      timestamp: now + 3,
      actor: "Gateway",
      action: "live_call_skipped",
      details: "Canlı API çağrısı atlandı.",
    },
    {
      timestamp: now + 4,
      actor: "Gateway",
      action: "dry_mode_completed",
      details: DRY_MODE_COMPLETED_MESSAGE,
    },
  ];

  return {
    id: `dry-response:${delivery.missionId}`,
    requestId: request.id,
    provider: delivery.provider,
    mode: adapter.mode,
    status: "dry_ready",
    createdAt: now,
    resultMessage: DRY_MODE_COMPLETED_MESSAGE,
    payloadPreview,
    validationResult: validation,
    audit,
  };
}

/**
 * Presentation-only projection for the mission card / sidebar badge — mirrors
 * `computeMissionGateUiState`'s "real state if it exists, else a derived
 * pre-state" convention. `blocked` only ever appears when a gate is
 * confirmed but the guard still fails (e.g. provider runtime went offline
 * after the gate was confirmed) — everything before "confirmed_but_blocked"
 * simply reads as "not-ready", matching the spec's "show nothing until the
 * gate is confirmed" flow.
 */
export type MissionApiDryUiState = "not-ready" | "blocked" | "dry-ready" | "dry-completed";

export function computeMissionApiDryUiState(
  gate: HermesLiveSendGate | undefined,
  response: HermesProviderApiDryResponse | undefined,
  guard: HermesProviderApiValidationResult,
): MissionApiDryUiState {
  if (response) return "dry-completed";
  if (!gate || gate.status !== "confirmed_but_blocked") return "not-ready";
  return guard.allowed ? "dry-ready" : "blocked";
}

export const MISSION_API_DRY_STATE_LABELS: Record<MissionApiDryUiState, string> = {
  "not-ready": DRY_MODE_NOT_READY_LABEL,
  blocked: "API Dry Run Engellendi",
  "dry-ready": DRY_MODE_READY_LABEL,
  "dry-completed": "API Dry Run Tamamlandı",
};

/**
 * Mission timeline entries — a pure projection of the response's own audit
 * log, exactly like every other Hermes *TimelineEntries builder. Unlike
 * Provider Runtime/Session's builders, callers MAY also merge this into the
 * global "Bugünün Hermes Aktivitesi" feed (gated per-mission on the response
 * actually existing, same as buildGateTimelineEntries already is) — a dry
 * run is a founder-triggered, per-mission event, not a five-times-repeated
 * global registry snapshot, so it does not flood the feed.
 */
export function buildProviderApiDryTimelineEntries(
  response: HermesProviderApiDryResponse | undefined,
): HermesMissionTimelineItem[] {
  if (!response) return [];
  return response.audit.map((entry) => ({
    at: entry.timestamp,
    actorLabel: entry.actor,
    actorCls: entry.actor === "Founder" ? "text-zinc-100" : "text-indigo-300",
    text: entry.details,
  }));
}
