import type {
  HermesProviderConnector,
  HermesProviderReceipt,
  HermesSendMode,
} from "@/app/components/v2/hermes-provider-connectors";
import { LIVE_SEND_DISABLED_MESSAGE, PROVIDER_CONNECTORS } from "@/app/components/v2/hermes-provider-connectors";
import type { DeliveryProvider, HermesDeliveryRequest } from "@/app/components/v2/hermes-delivery-gateway";
import type { HermesMissionTimelineItem } from "@/app/components/v2/adapters/hermes-mission-adapter";

/**
 * Hermes Provider Session Runtime (v4.5.0).
 *
 * Answers "can this provider theoretically send?" — never "send now." This
 * module models whether each provider is configured, connected, authorized,
 * and safe *before* any live send could ever happen. It does not send
 * anything itself and does not change Provider Connector's shadow-send
 * behavior at all; `canUseProviderSession` is a second, additive readiness
 * signal the UI can display alongside the existing `canProviderSend` guard,
 * not a replacement for it.
 *
 * No network, no fetch, no provider SDK, no env read. This codebase has an
 * established "read env for configured/unconfigured" pattern
 * (`app/api/data-sources-status/route.ts`, `hasEnv()`) — but that pattern is
 * for data-acquisition providers (Google Maps, Airtable, DeepSeek/OpenAI,
 * Sheets) that already have real credentials wired up. No such env vars
 * exist for any messaging provider (WhatsApp/Instagram/email/SMS) anywhere
 * in this repo, and inventing one here would violate "do not invent
 * secrets." So every messaging session is deterministically built as
 * "configured in software, not connected, not authorized" — the honest,
 * uncertain-case answer the spec asks for.
 *
 * Pure projection, recomputed on demand (the caller — V2Shell — memoizes it
 * with `useMemo`, same as every other Hermes derived value). Not session
 * state, not persisted, not keyed by mission — provider sessions are global
 * (five sessions total: one per provider), looked up by `provider`, not by
 * missionId.
 *
 * Does not touch Execution Runtime, the Decision Engine, Shadow Task
 * generation, mission grouping, the Pipeline Engine, the Courier Draft
 * Runtime, the Delivery Gateway, or Provider Connector's own shadow-send
 * logic — it only reads their already-produced types. Pure TypeScript,
 * no React.
 */

export type SessionStatus =
  | "offline"
  | "not_configured"
  | "connected"
  | "authorized"
  | "ready"
  | "expired"
  | "error";

export type SessionHealth = "healthy" | "warning" | "blocked";

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  offline: "Çevrimdışı",
  not_configured: "Yapılandırılmadı",
  connected: "Bağlandı",
  authorized: "Yetkilendirildi",
  ready: "Hazır",
  expired: "Süresi Doldu",
  error: "Hata",
};

export const SESSION_HEALTH_LABELS: Record<SessionHealth, string> = {
  healthy: "Oturum Sağlıklı",
  warning: "Oturum Uyarısı",
  blocked: "Engellendi",
};

export const PROVIDER_SESSION_SECTION_LABEL = "Provider Oturumu";
export const NOT_CONNECTED_LABEL = "Bağlı Değil";
export const NOT_CONFIGURED_LABEL = "Yapılandırılmadı";
export const NOT_AUTHORIZED_LABEL = "Yetkili Değil";
export const SHADOW_READY_LABEL = "Shadow Hazır";
export const LIVE_SEND_CLOSED_LABEL = "Canlı Gönderim Kapalı";
export const SETUP_REQUIRED_LABEL = "Kurulum Gerekli";
export const PROVIDER_NOT_LIVE_READY_WARNING = "Provider oturumu canlı gönderim için hazır değil.";

export type ProviderCapabilityKey =
  | "shadow_send"
  | "live_send"
  | "delivery_receipt"
  | "inbound_reply_monitoring"
  | "template_required"
  | "rate_limit_check"
  | "recipient_validation";

export type HermesProviderCapability = {
  key: ProviderCapabilityKey;
  label: string;
  enabled: boolean;
  reason: string;
};

const CAPABILITY_LABELS: Record<ProviderCapabilityKey, string> = {
  shadow_send: "Shadow Send",
  live_send: "Canlı Gönderim",
  delivery_receipt: "Teslimat Makbuzu",
  inbound_reply_monitoring: "Gelen Yanıt İzleme",
  template_required: "Şablon Gerekli",
  rate_limit_check: "Hız Sınırı Kontrolü",
  recipient_validation: "Alıcı Doğrulama",
};

/**
 * Deterministic per-provider capability projection. `shadow_send` mirrors
 * the connector's own `supportsShadowSend`; `live_send` is hard-false for
 * every provider this sprint; `inbound_reply_monitoring` stays disabled —
 * the existing "listener" Hermes agent is a shadow-only concept with no real
 * inbox/webhook behind it, so it isn't "already safely modeled" as a live
 * capability yet.
 */
function buildCapabilities(provider: DeliveryProvider, connector: HermesProviderConnector): HermesProviderCapability[] {
  return [
    {
      key: "shadow_send",
      label: CAPABILITY_LABELS.shadow_send,
      enabled: connector.supportsShadowSend,
      reason: connector.supportsShadowSend
        ? "Connector shadow send'i destekliyor — mesaj göndermeden önizleme üretebilir."
        : "Bu sağlayıcı shadow send desteklemiyor.",
    },
    {
      key: "live_send",
      label: CAPABILITY_LABELS.live_send,
      enabled: false,
      reason: LIVE_SEND_DISABLED_MESSAGE,
    },
    {
      key: "delivery_receipt",
      label: CAPABILITY_LABELS.delivery_receipt,
      enabled: false,
      reason: "Gerçek sağlayıcı teslim makbuzu bu sprintte modellenmedi.",
    },
    {
      key: "inbound_reply_monitoring",
      label: CAPABILITY_LABELS.inbound_reply_monitoring,
      enabled: false,
      reason: "Gelen yanıt izleme henüz güvenli şekilde modellenmedi.",
    },
    {
      key: "template_required",
      label: CAPABILITY_LABELS.template_required,
      enabled: provider === "whatsapp",
      reason:
        provider === "whatsapp"
          ? "WhatsApp Business API, önceden onaylı mesaj şablonu gerektirir."
          : "Bu sağlayıcı için şablon zorunluluğu tanımlı değil.",
    },
    {
      key: "rate_limit_check",
      label: CAPABILITY_LABELS.rate_limit_check,
      enabled: false,
      reason: "Sağlayıcıya özel hız sınırı kontrolü bu sprintte uygulanmadı.",
    },
    {
      key: "recipient_validation",
      label: CAPABILITY_LABELS.recipient_validation,
      enabled: connector.requiresRecipient,
      reason: connector.requiresRecipient
        ? "Teslimat isteği oluşturulmadan önce alıcı bilgisi doğrulanır."
        : "Bu sağlayıcı için alıcı doğrulaması uygulanmaz.",
    },
  ];
}

const SETUP_HINTS: Record<DeliveryProvider, string> = {
  whatsapp: "WhatsApp Business API bağlantısı henüz kurulmadı — canlı gönderim için kurulum gerekli.",
  instagram: "Instagram mesajlaşma bağlantısı henüz kurulmadı — canlı gönderim için kurulum gerekli.",
  email: "E-posta gönderim sağlayıcısı (SMTP) henüz yapılandırılmadı — canlı gönderim için kurulum gerekli.",
  sms: "SMS sağlayıcı bağlantısı henüz kurulmadı — canlı gönderim için kurulum gerekli.",
  unknown: "Sağlayıcı belirlenemedi — kurulum yapılamaz.",
};

function deriveStatus(configured: boolean, connected: boolean, authorized: boolean, canLiveSend: boolean): SessionStatus {
  if (!configured) return "not_configured";
  if (!connected) return "offline";
  if (!authorized) return "connected";
  if (!canLiveSend) return "authorized";
  return "ready";
}

function deriveHealth(status: SessionStatus, canShadowSend: boolean): SessionHealth {
  if (status === "error" || status === "expired") return "blocked";
  if (status === "ready") return "healthy";
  return canShadowSend ? "warning" : "blocked";
}

export type SessionAuditEntry = {
  timestamp: number;
  actor: string;
  action: string;
  details: string;
};

function buildSessionAudit(
  connector: HermesProviderConnector,
  requiresSetup: boolean,
  setupHint: string,
  now: number,
): SessionAuditEntry[] {
  const audit: SessionAuditEntry[] = [
    { timestamp: now, actor: "Gateway", action: "session_inspected", details: `${connector.label} oturumu incelendi.` },
  ];
  if (connector.supportsShadowSend) {
    audit.push({
      timestamp: now + 1,
      actor: "Gateway",
      action: "shadow_supported",
      details: "Connector shadow send'i destekliyor.",
    });
  }
  audit.push({
    timestamp: now + 2,
    actor: "Gateway",
    action: "live_send_blocked",
    details: "Canlı gönderim politika gereği kapalı.",
  });
  if (requiresSetup) {
    audit.push({ timestamp: now + 3, actor: "Gateway", action: "setup_required", details: setupHint });
  }
  return audit;
}

export type HermesProviderSession = {
  id: string;
  provider: DeliveryProvider;
  label: string;
  status: SessionStatus;
  configured: boolean;
  connected: boolean;
  authorized: boolean;
  canShadowSend: boolean;
  canLiveSend: boolean;
  requiresSetup: boolean;
  setupHint: string;
  lastCheckedAt: number;
  expiresAt?: number;
  capabilities: HermesProviderCapability[];
  health: SessionHealth;
  /** Append-only, rebuilt fresh on every projection — never persisted, never mutated in place. */
  audit: SessionAuditEntry[];
};

/**
 * Deterministic registry builder — no network, no env read. `configured`
 * reflects whether a connector definition exists and declares shadow-send
 * support (a software-level fact, not a live credential); `connected` and
 * `authorized` stay false for every provider, since no real session/config
 * exists anywhere in this codebase yet.
 */
export function buildProviderSessions(now: number = Date.now()): HermesProviderSession[] {
  return (Object.keys(PROVIDER_CONNECTORS) as DeliveryProvider[]).map((provider) => {
    const connector = PROVIDER_CONNECTORS[provider];
    const configured = connector.supportsShadowSend || connector.supportsLiveSend;
    const connected = false;
    const authorized = false;
    const canShadowSend = configured && connector.supportsShadowSend;
    const canLiveSend = connector.supportsLiveSend;
    const status = deriveStatus(configured, connected, authorized, canLiveSend);
    const health = deriveHealth(status, canShadowSend);
    const requiresSetup = status !== "ready";
    const setupHint = SETUP_HINTS[provider];

    return {
      id: `session:${provider}`,
      provider,
      label: connector.label,
      status,
      configured,
      connected,
      authorized,
      canShadowSend,
      canLiveSend,
      requiresSetup,
      setupHint,
      lastCheckedAt: now,
      capabilities: buildCapabilities(provider, connector),
      health,
      audit: buildSessionAudit(connector, requiresSetup, setupHint, now),
    };
  });
}

export type ProviderSessionGuardResult = { allowed: boolean; reason: string };

/**
 * Readiness check — additive to `canProviderSend`, never a replacement for
 * it. For shadow send, only the `shadow_send` capability matters (per spec:
 * "only require shadow_send capability"). For any non-shadow mode this
 * sprint, the answer is unconditional and absolute — no ladder of reasons,
 * because live send is closed full stop, regardless of any other session
 * field.
 */
export function canUseProviderSession(
  mode: HermesSendMode,
  delivery: HermesDeliveryRequest | undefined,
  receipt: HermesProviderReceipt | undefined,
  session: HermesProviderSession | undefined,
): ProviderSessionGuardResult {
  if (!session) return { allowed: false, reason: "Provider oturumu bulunamadı." };

  if (mode !== "shadow_send") {
    return { allowed: false, reason: LIVE_SEND_DISABLED_MESSAGE };
  }

  if (!delivery) {
    return { allowed: false, reason: "Teslimat isteği bulunamadı — oturum kontrol edilemez." };
  }
  if (receipt) {
    return { allowed: false, reason: "Bu teslimat için zaten bir sağlayıcı kaydı var — mükerrer kontrol engellendi." };
  }

  const shadowCapability = session.capabilities.find((c) => c.key === "shadow_send");
  if (!shadowCapability?.enabled) {
    return { allowed: false, reason: `${session.label} shadow send yeteneğine sahip değil.` };
  }

  return { allowed: true, reason: "Provider oturumu shadow send için hazır." };
}

/**
 * Mission timeline entries — a pure projection of the session's own audit
 * log, exactly like buildDraftTimelineEntries / buildDeliveryTimelineEntries
 * / buildConnectorTimelineEntries project theirs. Callers must only merge
 * this into a *per-mission* timeline (Workspace Mission Card, Decision
 * Center) when a mission actually has a delivery/session to show — never
 * into the global "Bugünün Hermes Aktivitesi" feed for every provider
 * regardless of relevance, which would flood it with the same five
 * sessions' audit trails on every render.
 */
export function buildSessionTimelineEntries(
  session: HermesProviderSession | undefined,
): HermesMissionTimelineItem[] {
  if (!session) return [];
  return session.audit.map((entry) => ({
    at: entry.timestamp,
    actorLabel: entry.actor,
    actorCls: entry.actor === "Founder" ? "text-zinc-100" : "text-indigo-300",
    text: entry.details,
  }));
}
