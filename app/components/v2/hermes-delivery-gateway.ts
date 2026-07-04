import type { AutomationCard } from "@/app/components/v2/adapters/automation-center-adapter";
import type { HermesMissionTimelineItem } from "@/app/components/v2/adapters/hermes-mission-adapter";
import type { DraftChannel, HermesOutboundDraft } from "@/app/components/v2/hermes-courier";

/**
 * Hermes Delivery Gateway (v4.2.0).
 *
 * This is NOT a sending sprint. This module is the universal gateway every
 * future provider (WhatsApp, Instagram, email, SMS) will eventually plug
 * into — today it validates, resolves a provider, and queues a delivery
 * request all the way to "ready", then stops. No fetch, no network, no
 * provider SDK, no background worker, no cron. `startDeliveryGateway` is a
 * pure synchronous function: given an approved draft, it returns a fully
 * populated HermesDeliveryRequest already at its terminal state for this
 * sprint ("ready") — there is nothing left to await, because nothing here
 * ever leaves the process.
 *
 * Session state only — HermesDeliveryRequest is never persisted. Kept in a
 * Record<missionId, HermesDeliveryRequest> by the caller (V2Shell), the same
 * convention hermesDecisions / hermesPipelines / hermesDrafts already use.
 *
 * Does not touch Execution Runtime, the Decision Engine, Shadow Task
 * generation, mission grouping, the Pipeline Engine, or the Courier Draft
 * Runtime — it only reads fields those already produce (mission, draft,
 * AutomationCard) and derives a delivery request from them. Pure TypeScript,
 * no React.
 */

export type DeliveryProvider = "whatsapp" | "instagram" | "email" | "sms" | "unknown";

export type DeliveryStatus =
  | "queued"
  | "approved"
  | "ready"
  | "sending"
  | "sent"
  | "delivered"
  | "failed"
  | "cancelled";

export type DeliveryAuditEntry = {
  timestamp: number;
  actor: string;
  action: string;
  details: string;
};

export type HermesDeliveryRequest = {
  id: string;
  missionId: string;
  leadId: string;
  draftId: string;
  /** The channel the draft was written for — carried over verbatim from HermesOutboundDraft. */
  channel: DraftChannel;
  recipient: string | null;
  /** The gateway's own resolved provider — may differ from `channel` (e.g. an unknown channel falling back to SMS). */
  provider: DeliveryProvider;
  status: DeliveryStatus;
  createdAt: number;
  approvedAt: number | null;
  queuedAt: number | null;
  readyAt: number | null;
  sentAt: number | null;
  deliveredAt: number | null;
  failedAt: number | null;
  failureReason: string | null;
  providerMessageId: string | null;
  /** Append-only — every state transition adds an entry, nothing is ever overwritten or removed. */
  audit: DeliveryAuditEntry[];
};

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  queued: "Kuyrukta",
  approved: "Onaylandı",
  ready: "Sağlayıcı İçin Hazır",
  sending: "Gönderiliyor",
  sent: "Gönderildi",
  delivered: "Teslim Edildi",
  failed: "Başarısız",
  cancelled: "İptal Edildi",
};

export const DELIVERY_PROVIDER_LABELS: Record<DeliveryProvider, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  email: "E-posta",
  sms: "SMS",
  unknown: "Sağlayıcı Belirsiz",
};

export const GATEWAY_STOP_NOTE =
  "Teslimat isteği sağlayıcı için hazır — bu sprintte hiçbir dış iletişim gerçekleşmez.";
export const NO_SEND_BUTTON_NOTE = "Gönderim yok — bu ekranda gönderim butonu bulunmaz.";

const MAX_DELIVERY_RETRIES = 3;

/**
 * Pure, deterministic provider resolution — no API, no network. Mirrors the
 * draft's own channel 1:1 in the common case; only falls back (whatsapp →
 * sms) when the draft's channel was never resolved to something concrete.
 */
export function resolveDeliveryProvider(
  draft: HermesOutboundDraft,
  card: AutomationCard | undefined,
): { provider: DeliveryProvider; reason: string } {
  switch (draft.channel) {
    case "whatsapp":
      return { provider: "whatsapp", reason: "Taslak kanalı WhatsApp olarak hazırlandı." };
    case "instagram":
      return { provider: "instagram", reason: "Taslak kanalı Instagram olarak hazırlandı." };
    case "email":
      return { provider: "email", reason: "Taslak kanalı e-posta olarak hazırlandı." };
    case "unknown":
    default:
      if (card?.phone) {
        return {
          provider: "sms",
          reason: "Kanal doğrulanamadı — telefon numarası üzerinden yedek SMS sağlayıcısına yönlendirildi.",
        };
      }
      return { provider: "unknown", reason: "Güvenilir bir teslimat sağlayıcısı bulunamadı." };
  }
}

/** Pure — the same contact fields Contact Finder / Re-Enrich / Courier already read, never a new signal source. */
function resolveRecipient(provider: DeliveryProvider, card: AutomationCard | undefined): string | null {
  if (!card) return null;
  switch (provider) {
    case "whatsapp":
    case "sms":
      return card.phone ?? null;
    case "instagram":
      return card.instagram ?? null;
    case "email":
    case "unknown":
    default:
      return null;
  }
}

export type DeliveryGuardResult = { allowed: boolean; reason: string };

/**
 * Safety gate — always returns { allowed, reason }, never a bare boolean.
 * Callers must run this before `startDeliveryGateway`.
 */
export function canDeliver(
  draft: HermesOutboundDraft | undefined,
  card: AutomationCard | undefined,
  existing: HermesDeliveryRequest | undefined,
): DeliveryGuardResult {
  if (!card) return { allowed: false, reason: "Lead bulunamadı — teslimat başlatılamaz." };
  if (card.scoredLead.doNotContact) {
    return { allowed: false, reason: "İletişim yasağı (DNC) aktif — teslimat başlatılamaz." };
  }
  if (card.scoredLead.status === "won") {
    return { allowed: false, reason: "Fırsat kazanıldı (Closed Won) — teslimat gerekmiyor." };
  }
  if (card.scoredLead.status === "lost") {
    return { allowed: false, reason: "Fırsat kaybedildi (Closed Lost) — teslimat başlatılamaz." };
  }
  if (!draft) return { allowed: false, reason: "Taslak bulunamadı — teslimat başlatılamaz." };
  if (draft.status !== "approved") {
    return { allowed: false, reason: "Taslak henüz onaylanmadı — teslimat başlatılamaz." };
  }
  if (existing && (existing.status === "sent" || existing.status === "delivered")) {
    return { allowed: false, reason: "Bu mission zaten gönderilmiş — tekrar teslimat oluşturulamaz." };
  }
  if (existing && existing.status !== "failed" && existing.status !== "cancelled") {
    return { allowed: false, reason: "Bu mission için zaten aktif bir teslimat isteği var — mükerrer teslimat engellendi." };
  }
  if (existing && existing.status === "failed") {
    const retryCount = existing.audit.filter((a) => a.action === "retry_requested").length;
    if (retryCount >= MAX_DELIVERY_RETRIES) {
      return { allowed: false, reason: "Yeniden deneme limiti aşıldı — teslimat başlatılamaz." };
    }
  }
  const { provider } = resolveDeliveryProvider(draft, card);
  if (provider === "unknown") {
    return { allowed: false, reason: "Sağlayıcı belirlenemedi — teslimat başlatılamaz." };
  }
  if (!resolveRecipient(provider, card)) {
    return { allowed: false, reason: "Alıcı bilgisi bulunamadı — teslimat başlatılamaz." };
  }
  return { allowed: true, reason: "Teslimat için tüm koşullar sağlandı." };
}

/**
 * Runs the full Founder Approval → Gateway Validation → Provider Resolution
 * → Queue → Ready For Provider chain in one synchronous, deterministic pass
 * — there is no real work to await, so there is no reason to fake one with
 * timers. Callers must call `canDeliver` first; this function assumes the
 * gate already passed. STOPS at "ready" — nothing beyond this sprint.
 */
export function startDeliveryGateway(draft: HermesOutboundDraft, card: AutomationCard): HermesDeliveryRequest {
  const t0 = Date.now();
  const { provider, reason: providerReason } = resolveDeliveryProvider(draft, card);
  const recipient = resolveRecipient(provider, card);

  const audit: DeliveryAuditEntry[] = [
    { timestamp: t0, actor: "Founder", action: "approved", details: "Founder teslimatı onayladı." },
    { timestamp: t0 + 1, actor: "Gateway", action: "validated", details: "Gateway teslimat isteğini doğruladı." },
    {
      timestamp: t0 + 2,
      actor: "Gateway",
      action: "provider_resolved",
      details: `Sağlayıcı belirlendi: ${DELIVERY_PROVIDER_LABELS[provider]} — ${providerReason}`,
    },
    { timestamp: t0 + 3, actor: "Gateway", action: "queued", details: "Teslimat isteği kuyruğa alındı." },
    {
      timestamp: t0 + 4,
      actor: "Gateway",
      action: "ready_for_provider",
      details: "Sağlayıcı için hazır — gönderim yapılmadı.",
    },
  ];

  return {
    id: `delivery:${draft.missionId}`,
    missionId: draft.missionId,
    leadId: draft.leadId,
    draftId: draft.id,
    channel: draft.channel,
    recipient,
    provider,
    status: "ready",
    createdAt: t0,
    approvedAt: t0,
    queuedAt: t0 + 3,
    readyAt: t0 + 4,
    sentAt: null,
    deliveredAt: null,
    failedAt: null,
    failureReason: null,
    providerMessageId: null,
    audit,
  };
}

/**
 * Presentation-only projection for the mission card / sidebar badge — mirrors
 * `computeMissionPipelineUiState`'s "real state if it exists, else a derived
 * pre-state" convention. "blocked" surfaces *why* no request was created
 * (recomputed live from the same guard, so it stays current as data changes).
 */
export type MissionDeliveryUiState = DeliveryStatus | "not-ready" | "blocked";

export function computeMissionDeliveryUiState(
  draft: HermesOutboundDraft | undefined,
  card: AutomationCard | undefined,
  existing: HermesDeliveryRequest | undefined,
): MissionDeliveryUiState {
  if (existing) return existing.status;
  if (!draft || draft.status !== "approved") return "not-ready";
  return canDeliver(draft, card, existing).allowed ? "not-ready" : "blocked";
}

export const MISSION_DELIVERY_STATE_LABELS: Record<MissionDeliveryUiState, string> = {
  ...DELIVERY_STATUS_LABELS,
  "not-ready": "Teslimat Hazır Değil",
  blocked: "Teslimat Engellendi",
};

/**
 * Mission timeline entries — a pure projection of the request's own audit
 * log, exactly like buildDraftTimelineEntries / buildPipelineTimelineEntries
 * project their own timestamps. The audit trail *is* the timeline; nothing
 * extra is invented here.
 */
export function buildDeliveryTimelineEntries(
  delivery: HermesDeliveryRequest | undefined,
): HermesMissionTimelineItem[] {
  if (!delivery) return [];
  return delivery.audit.map((entry) => ({
    at: entry.timestamp,
    actorLabel: entry.actor,
    actorCls: entry.actor === "Founder" ? "text-zinc-100" : "text-indigo-300",
    text: entry.details,
  }));
}
