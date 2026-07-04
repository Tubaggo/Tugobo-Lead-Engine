import type { AutomationCard } from "@/app/components/v2/adapters/automation-center-adapter";
import type { HermesMissionTimelineItem } from "@/app/components/v2/adapters/hermes-mission-adapter";
import type { HermesOutboundDraft } from "@/app/components/v2/hermes-courier";
import type { DeliveryProvider, HermesDeliveryRequest } from "@/app/components/v2/hermes-delivery-gateway";

/**
 * Hermes Provider Connector Runtime (v4.4.0) — Shadow Send → Live Send.
 *
 * This is the first module that even gestures at real outbound delivery, so
 * it is deliberately the most conservative one in the codebase. It never
 * calls fetch, never touches a provider SDK, never opens a socket. Every
 * connector this sprint supports `shadow_send` only — a fully local,
 * deterministic simulation that produces a receipt describing what *would*
 * be sent, and explicitly says nothing was. `prepareLiveSend` exists only as
 * a typed placeholder for a future sprint; it always reports "kapalı"
 * (closed) and never flips to ready on its own.
 *
 * Session state only — HermesProviderReceipt is never persisted. Kept in a
 * Record<missionId, HermesProviderReceipt> by the caller (V2Shell), keyed
 * the same way hermesDecisions / hermesPipelines / hermesDrafts /
 * hermesDeliveries already are (one mission → at most one delivery → at
 * most one receipt, so missionId stays the single join key end to end;
 * `deliveryId`/`requestId` are still carried as their own fields for
 * traceability, per the spec's model).
 *
 * Does not touch Execution Runtime, the Decision Engine, Shadow Task
 * generation, mission grouping, the Pipeline Engine, the Courier Draft
 * Runtime, or the Delivery Gateway's own logic — it only reads what those
 * already produced (delivery request, draft, AutomationCard) and derives a
 * connector decision from them. Pure TypeScript, no React.
 */

export type HermesSendMode = "shadow_send" | "live_send_ready" | "live_send_disabled";

export const DEFAULT_SEND_MODE: HermesSendMode = "shadow_send";

export const SEND_MODE_LABELS: Record<HermesSendMode, string> = {
  shadow_send: "Shadow Send",
  live_send_ready: "Canlı Gönderime Hazır",
  live_send_disabled: "Canlı Gönderim Kapalı",
};

export type ConnectorSafetyLevel = "shadow-only" | "not-supported";

export type HermesProviderConnector = {
  provider: DeliveryProvider;
  label: string;
  supportsShadowSend: boolean;
  /** Always false this sprint for every provider — no live integration exists yet. */
  supportsLiveSend: boolean;
  requiresRecipient: boolean;
  requiresApprovedDraft: boolean;
  safetyLevel: ConnectorSafetyLevel;
};

/**
 * Static registry — no provider here has a real integration behind it, so
 * `supportsLiveSend` is false across the board. WhatsApp's existing
 * `wa.me` link-open (used elsewhere in this app) is a manual, founder-driven
 * browser action, not a programmatic send — it does not count as "an
 * existing safe integration" for this connector's purposes.
 */
export const PROVIDER_CONNECTORS: Record<DeliveryProvider, HermesProviderConnector> = {
  whatsapp: {
    provider: "whatsapp",
    label: "WhatsApp",
    supportsShadowSend: true,
    supportsLiveSend: false,
    requiresRecipient: true,
    requiresApprovedDraft: true,
    safetyLevel: "shadow-only",
  },
  instagram: {
    provider: "instagram",
    label: "Instagram",
    supportsShadowSend: true,
    supportsLiveSend: false,
    requiresRecipient: true,
    requiresApprovedDraft: true,
    safetyLevel: "shadow-only",
  },
  email: {
    provider: "email",
    label: "E-posta",
    supportsShadowSend: true,
    supportsLiveSend: false,
    requiresRecipient: true,
    requiresApprovedDraft: true,
    safetyLevel: "shadow-only",
  },
  sms: {
    provider: "sms",
    label: "SMS",
    supportsShadowSend: true,
    supportsLiveSend: false,
    requiresRecipient: true,
    requiresApprovedDraft: true,
    safetyLevel: "shadow-only",
  },
  unknown: {
    provider: "unknown",
    label: "Sağlayıcı Belirsiz",
    supportsShadowSend: false,
    supportsLiveSend: false,
    requiresRecipient: false,
    requiresApprovedDraft: true,
    safetyLevel: "not-supported",
  },
};

export type ProviderRequestSource = "founder-shadow-preview" | "system-auto";

export type HermesProviderSendRequest = {
  id: string;
  deliveryId: string;
  missionId: string;
  leadId: string;
  draftId: string;
  provider: DeliveryProvider;
  channel: HermesDeliveryRequest["channel"];
  recipient: string | null;
  body: string;
  mode: HermesSendMode;
  requestedAt: number;
  requestedBy: string;
  /** Only "founder-shadow-preview" is reachable this sprint — "system-auto" is reserved vocabulary, never produced here. */
  source: ProviderRequestSource;
};

export type ProviderReceiptStatus = "shadow_sent" | "ready_for_live_send" | "blocked" | "failed";

export type ProviderAuditEntry = {
  timestamp: number;
  actor: string;
  action: string;
  details: string;
};

export type HermesProviderReceipt = {
  id: string;
  requestId: string;
  deliveryId: string;
  missionId: string;
  leadId: string;
  provider: DeliveryProvider;
  mode: HermesSendMode;
  status: ProviderReceiptStatus;
  createdAt: number;
  sentAt?: number;
  providerMessageId?: string;
  previewBody: string;
  recipient: string | null;
  resultMessage: string;
  error?: string;
  /** Append-only — mirrors HermesDeliveryRequest.audit's convention. */
  audit: ProviderAuditEntry[];
};

export const RECEIPT_STATUS_LABELS: Record<ProviderReceiptStatus, string> = {
  shadow_sent: "Shadow Send Tamamlandı",
  ready_for_live_send: "Canlı Gönderime Hazır",
  blocked: "Engellendi",
  failed: "Başarısız",
};

export const SHADOW_SEND_RESULT_MESSAGE = "Shadow send tamamlandı — mesaj gönderilmedi.";
export const LIVE_SEND_DISABLED_MESSAGE = "Canlı gönderim bu sprintte kapalı.";
export const LIVE_SEND_NEXT_SPRINT_NOTE = "Canlı gönderim sonraki sprintte bağlanacak.";
export const SHADOW_SEND_DISCLAIMER =
  "Bu işlem mesaj göndermez. Sadece sağlayıcı gönderim önizlemesi üretir.";

export type ProviderGuardResult = { allowed: boolean; reason: string };

/**
 * Safety gate — always returns { allowed, reason }, never a bare boolean.
 * Shared by both send modes: `runShadowSend` calls it with mode
 * "shadow_send"; `prepareLiveSend` would call it with a live mode if one
 * were ever reachable (it isn't, this sprint). Data-driven off the
 * connector's own `requiresRecipient` / `requiresApprovedDraft` flags rather
 * than hardcoding provider-specific rules here.
 */
export function canProviderSend(
  mode: HermesSendMode,
  delivery: HermesDeliveryRequest | undefined,
  draft: HermesOutboundDraft | undefined,
  card: AutomationCard | undefined,
  existingReceipt: HermesProviderReceipt | undefined,
): ProviderGuardResult {
  if (!delivery) {
    return { allowed: false, reason: "Teslimat isteği bulunamadı — Provider Connector çalıştırılamaz." };
  }
  if (delivery.status !== "ready") {
    return { allowed: false, reason: "Teslimat isteği henüz Sağlayıcı İçin Hazır durumunda değil." };
  }

  const connector = PROVIDER_CONNECTORS[delivery.provider];

  if (connector.requiresApprovedDraft) {
    if (!draft) return { allowed: false, reason: "Onaylı taslak bulunamadı." };
    if (draft.status === "rejected") {
      return { allowed: false, reason: "Taslak reddedildi — gönderim engellendi." };
    }
    if (draft.status !== "approved") {
      return { allowed: false, reason: "Taslak henüz onaylanmadı." };
    }
    if (!draft.body.trim()) {
      return { allowed: false, reason: "Mesaj içeriği boş — gönderim engellendi." };
    }
  }

  if (card?.scoredLead.doNotContact) {
    return { allowed: false, reason: "İletişim yasağı (DNC) aktif — gönderim engellendi." };
  }

  if (connector.requiresRecipient && !delivery.recipient) {
    return { allowed: false, reason: "Alıcı bilgisi bulunamadı." };
  }

  if (delivery.provider === "unknown") {
    return { allowed: false, reason: "Sağlayıcı belirlenemedi." };
  }

  if (existingReceipt) {
    return {
      allowed: false,
      reason: "Bu teslimat için zaten bir sağlayıcı kaydı var — mükerrer gönderim engellendi.",
    };
  }

  if (mode === "shadow_send" && !connector.supportsShadowSend) {
    return { allowed: false, reason: `${connector.label} shadow send desteklemiyor.` };
  }
  if (mode !== "shadow_send" && !connector.supportsLiveSend) {
    return { allowed: false, reason: "Canlı gönderim bu sağlayıcı için kapalı." };
  }

  return { allowed: true, reason: "Shadow send için tüm koşullar sağlandı." };
}

/** Pure — builds the transient request object the shadow send flow acts on. Never stored on its own; the receipt below carries its id forward. */
export function buildProviderSendRequest(
  delivery: HermesDeliveryRequest,
  draft: HermesOutboundDraft,
  mode: HermesSendMode,
): HermesProviderSendRequest {
  return {
    id: `request:${delivery.missionId}`,
    deliveryId: delivery.id,
    missionId: delivery.missionId,
    leadId: delivery.leadId,
    draftId: draft.id,
    provider: delivery.provider,
    channel: delivery.channel,
    recipient: delivery.recipient,
    body: draft.body,
    mode,
    requestedAt: Date.now(),
    requestedBy: "Founder",
    source: "founder-shadow-preview",
  };
}

/**
 * Runs the Provider Connector → Shadow Send → Provider Receipt Preview chain
 * in one synchronous, deterministic pass. No network, no fetch, no provider
 * SDK — there is nothing to await, because nothing here leaves the process.
 * Callers must call `canProviderSend` first; this assumes the gate already
 * passed.
 */
export function runShadowSend(
  delivery: HermesDeliveryRequest,
  draft: HermesOutboundDraft,
  connector: HermesProviderConnector,
): HermesProviderReceipt {
  const request = buildProviderSendRequest(delivery, draft, "shadow_send");
  const t0 = request.requestedAt;

  const audit: ProviderAuditEntry[] = [
    {
      timestamp: t0,
      actor: "Gateway",
      action: "connector_selected",
      details: `Connector seçildi: ${connector.label}.`,
    },
    {
      timestamp: t0 + 1,
      actor: "Courier",
      action: "shadow_prepared",
      details: "Shadow send hazırlandı.",
    },
    {
      timestamp: t0 + 2,
      actor: "Courier",
      action: "preview_generated",
      details: "Mesaj önizlemesi oluşturuldu.",
    },
    {
      timestamp: t0 + 3,
      actor: "Gateway",
      action: "no_external_delivery",
      details: "Dış teslimat gerçekleştirilmedi.",
    },
  ];

  return {
    id: `receipt:${delivery.missionId}`,
    requestId: request.id,
    deliveryId: delivery.id,
    missionId: delivery.missionId,
    leadId: delivery.leadId,
    provider: delivery.provider,
    mode: "shadow_send",
    status: "shadow_sent",
    createdAt: t0,
    previewBody: request.body,
    recipient: request.recipient,
    resultMessage: SHADOW_SEND_RESULT_MESSAGE,
    audit,
  };
}

export type LiveSendPrepareResult = { ready: boolean; message: string };

/**
 * Placeholder only — prepares the shape a future sprint will fill in.
 * Never sends, never flips `ready` to true on its own: every provider's
 * `supportsLiveSend` is false this sprint, so this always reports closed.
 */
export function prepareLiveSend(
  _delivery: HermesDeliveryRequest | undefined,
  connector: HermesProviderConnector | undefined,
): LiveSendPrepareResult {
  if (!connector || !connector.supportsLiveSend) {
    return { ready: false, message: LIVE_SEND_DISABLED_MESSAGE };
  }
  // Unreachable this sprint (no connector has supportsLiveSend = true) — kept
  // so the function's shape already matches what a future sprint expects.
  return { ready: false, message: LIVE_SEND_NEXT_SPRINT_NOTE };
}

/**
 * Presentation-only projection for the mission card / sidebar badge — mirrors
 * `computeMissionDeliveryUiState`'s "real state if it exists, else a derived
 * pre-state" convention.
 */
export type MissionConnectorUiState = "not-ready" | "blocked" | "shadow-ready" | "shadow-sent";

export function computeMissionConnectorUiState(
  delivery: HermesDeliveryRequest | undefined,
  draft: HermesOutboundDraft | undefined,
  card: AutomationCard | undefined,
  receipt: HermesProviderReceipt | undefined,
): MissionConnectorUiState {
  if (receipt) return "shadow-sent";
  if (!delivery || delivery.status !== "ready") return "not-ready";
  return canProviderSend("shadow_send", delivery, draft, card, receipt).allowed ? "shadow-ready" : "blocked";
}

export const MISSION_CONNECTOR_STATE_LABELS: Record<MissionConnectorUiState, string> = {
  "not-ready": "Provider Connector Hazır Değil",
  blocked: "Shadow Send Engellendi",
  "shadow-ready": "Shadow Send Hazır",
  "shadow-sent": "Shadow Send Tamamlandı",
};

/**
 * Mission timeline entries — a pure projection of the receipt's own audit
 * log, exactly like buildDraftTimelineEntries / buildDeliveryTimelineEntries
 * project theirs. The audit trail *is* the timeline; nothing extra invented.
 */
export function buildConnectorTimelineEntries(
  receipt: HermesProviderReceipt | undefined,
): HermesMissionTimelineItem[] {
  if (!receipt) return [];
  return receipt.audit.map((entry) => ({
    at: entry.timestamp,
    actorLabel: entry.actor,
    actorCls: entry.actor === "Founder" ? "text-zinc-100" : "text-indigo-300",
    text: entry.details,
  }));
}
