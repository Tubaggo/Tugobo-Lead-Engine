import type { DeliveryProvider } from "@/app/components/v2/hermes-delivery-gateway";
import { LIVE_SEND_DISABLED_MESSAGE, PROVIDER_CONNECTORS } from "@/app/components/v2/hermes-provider-connectors";
import type { HermesMissionTimelineItem } from "@/app/components/v2/adapters/hermes-mission-adapter";

/**
 * Hermes Provider Connection Runtime (v4.7.0).
 *
 * Today, Hermes' only notion of "can this provider do anything" is Provider
 * Connector (shadow-send capability) and Provider Session (a session-shaped
 * readiness projection). Neither models the thing every real integration
 * will eventually need underneath both of them: a provider registry with a
 * connection lifecycle, a health signal, and a capability surface that is
 * independent of any single mission. This module is that registry.
 *
 * Architecture this sprint introduces (and nothing beyond it):
 *
 *   Hermes → Provider Connection Runtime → WhatsApp / Instagram / Email / SMS
 *
 * Hermes never talks to a provider directly — it talks to this runtime, and
 * this runtime is the thing a future sprint would teach to talk to a real
 * provider. Today it talks to nothing. No fetch, no axios, no provider SDK,
 * no Graph API, no SMTP, no webhook receiver, no cron, no socket, no
 * realtime, no token exchange. Every field below is either a static registry
 * fact (this codebase has no real messaging credentials anywhere) or a pure
 * function of other static facts.
 *
 * Deliberately does NOT replace or restyle Provider Connector's shadow-send
 * guard (`canProviderSend`) or Provider Session's readiness guard
 * (`canUseProviderSession`) — both keep deciding what they already decide.
 * This module is an additional, read-only lens over the same conceptual
 * space: "is this provider's connection lifecycle far enough along to be
 * worth showing the founder," not "can this specific mission send right
 * now." Does not touch Execution Runtime, the Decision Engine, Mission
 * Adapter, Pipeline Engine, Courier Draft Runtime, Delivery Gateway, Provider
 * Connector, Live Send Gate, lead scoring, schemas, or Airtable.
 *
 * Deterministic, recomputed on demand (the caller — V2Shell — memoizes it
 * with `useMemo`, once, the same as `buildProviderSessions`). Not session
 * state, not persisted. Pure TypeScript, no React.
 */

export type HermesProviderCategory = "social" | "email" | "sms" | "unknown";

export const PROVIDER_CATEGORY_LABELS: Record<HermesProviderCategory, string> = {
  social: "Sosyal",
  email: "E-posta",
  sms: "SMS",
  unknown: "Bilinmiyor",
};

export type HermesProviderConnectionState =
  | "disconnected"
  | "configured"
  | "connecting"
  | "connected"
  | "authorized"
  | "ready"
  | "blocked";

export const CONNECTION_STATE_LABELS: Record<HermesProviderConnectionState, string> = {
  disconnected: "Bağlı Değil",
  configured: "Yapılandırıldı",
  connecting: "Bağlanıyor",
  connected: "Bağlandı",
  authorized: "Yetkilendirildi",
  ready: "Hazır",
  blocked: "Engellendi",
};

export type HermesProviderHealth = "healthy" | "warning" | "offline" | "blocked";

export const PROVIDER_HEALTH_LABELS: Record<HermesProviderHealth, string> = {
  healthy: "Bağlantı Sağlıklı",
  warning: "Bağlantı Uyarısı",
  offline: "Bağlantı Çevrimdışı",
  blocked: "Engellendi",
};

/**
 * "status" is the coarse, founder-facing readiness read (what the strip and
 * Decision Center lead with); "connectionState" underneath it is the finer
 * lifecycle position that explains *why* status reads the way it does — same
 * two-layer relationship `HermesProviderSession` already has between
 * `status` and its `configured`/`connected`/`authorized` triplet.
 */
export type HermesProviderReadiness =
  | "ready"
  | "partially_ready"
  | "configuration_required"
  | "authorization_required"
  | "blocked"
  | "offline";

export const PROVIDER_READINESS_LABELS: Record<HermesProviderReadiness, string> = {
  ready: "Hazır",
  partially_ready: "Shadow Hazır",
  configuration_required: "Yapılandırma Gerekli",
  authorization_required: "Yetkilendirme Gerekli",
  blocked: "Engellendi",
  offline: "Bağlantı Çevrimdışı",
};

export const PROVIDER_RUNTIME_SECTION_LABEL = "Provider Runtime";
export const PROVIDER_RUNTIME_CONNECTION_LABEL = "Provider Bağlantısı";
export const PROVIDER_RUNTIME_CHAIN_LABEL = "Runtime → Bağlantı → Session → Gate";

export type HermesProviderConfiguration = {
  configured: boolean;
  hasCredentials: boolean;
  hasSecret: boolean;
  hasEndpoint: boolean;
  requiresAuthorization: boolean;
  requiresWebhook: boolean;
  requiresVerification: boolean;
  notes: string;
};

export type HermesProviderCapabilityKey =
  | "shadow_send"
  | "live_send"
  | "delivery_receipt"
  | "session_tracking"
  | "reply_monitoring"
  | "rate_limit"
  | "recipient_validation";

export type HermesProviderCapability = {
  key: HermesProviderCapabilityKey;
  label: string;
  enabled: boolean;
  reason: string;
};

const CAPABILITY_LABELS: Record<HermesProviderCapabilityKey, string> = {
  shadow_send: "Shadow Send",
  live_send: "Canlı Gönderim",
  delivery_receipt: "Teslimat Makbuzu",
  session_tracking: "Oturum İzleme",
  reply_monitoring: "Yanıt İzleme",
  rate_limit: "Hız Sınırı",
  recipient_validation: "Alıcı Doğrulama",
};

export type HermesProvider = {
  id: string;
  provider: DeliveryProvider;
  label: string;
  category: HermesProviderCategory;
  status: HermesProviderReadiness;
  connectionState: HermesProviderConnectionState;
  capabilities: HermesProviderCapability[];
  configuration: HermesProviderConfiguration;
  health: HermesProviderHealth;
  priority: number;
  supportedChannels: DeliveryProvider[];
  createdAt: number;
  updatedAt: number;
  /** Append-only-per-build — mirrors buildProviderSessions' audit convention. Rebuilt fresh on every call, never persisted. */
  audit: ProviderRuntimeAuditEntry[];
};

export type ProviderRuntimeAuditEntry = {
  timestamp: number;
  actor: string;
  action: string;
  details: string;
};

/**
 * Raw connection facts behind the registry below — everything here is a
 * deterministic, hardcoded fact about *software configuration*, never a
 * live credential check (no env var exists for any messaging provider in
 * this codebase, matching the precedent `buildProviderSessions` already
 * established). The four real providers are seeded across four different
 * points in the lifecycle on purpose, so the runtime strip demonstrates the
 * full state machine (Shadow Ready / Needs Authorization / Configuration
 * Required / Offline) instead of one repeated state.
 */
type ProviderFacts = {
  provider: DeliveryProvider;
  label: string;
  category: HermesProviderCategory;
  configured: boolean;
  connected: boolean;
  authorized: boolean;
  priority: number;
  configuration: HermesProviderConfiguration;
};

const PROVIDER_FACTS: Record<DeliveryProvider, ProviderFacts> = {
  whatsapp: {
    provider: "whatsapp",
    label: "WhatsApp",
    category: "social",
    configured: true,
    connected: true,
    authorized: true,
    priority: 1,
    configuration: {
      configured: true,
      hasCredentials: false,
      hasSecret: false,
      hasEndpoint: false,
      requiresAuthorization: true,
      requiresWebhook: true,
      requiresVerification: true,
      notes: "WhatsApp Business API bağlantısı yazılımda tanımlı — gerçek kimlik bilgisi girilmedi.",
    },
  },
  instagram: {
    provider: "instagram",
    label: "Instagram",
    category: "social",
    configured: true,
    connected: true,
    authorized: false,
    priority: 2,
    configuration: {
      configured: true,
      hasCredentials: false,
      hasSecret: false,
      hasEndpoint: false,
      requiresAuthorization: true,
      requiresWebhook: true,
      requiresVerification: false,
      notes: "Instagram mesajlaşma bağlantısı tanımlı — yetkilendirme henüz tamamlanmadı.",
    },
  },
  email: {
    provider: "email",
    label: "E-posta",
    category: "email",
    configured: false,
    connected: false,
    authorized: false,
    priority: 3,
    configuration: {
      configured: false,
      hasCredentials: false,
      hasSecret: false,
      hasEndpoint: false,
      requiresAuthorization: false,
      requiresWebhook: false,
      requiresVerification: true,
      notes: "E-posta gönderim sağlayıcısı (SMTP) henüz yapılandırılmadı.",
    },
  },
  sms: {
    provider: "sms",
    label: "SMS",
    category: "sms",
    configured: true,
    connected: false,
    authorized: false,
    priority: 4,
    configuration: {
      configured: true,
      hasCredentials: false,
      hasSecret: false,
      hasEndpoint: false,
      requiresAuthorization: true,
      requiresWebhook: false,
      requiresVerification: true,
      notes: "SMS sağlayıcı bağlantısı tanımlı — bağlantı kurulamadı, çevrimdışı.",
    },
  },
  unknown: {
    provider: "unknown",
    label: "Sağlayıcı Belirsiz",
    category: "unknown",
    configured: false,
    connected: false,
    authorized: false,
    priority: 99,
    configuration: {
      configured: false,
      hasCredentials: false,
      hasSecret: false,
      hasEndpoint: false,
      requiresAuthorization: false,
      requiresWebhook: false,
      requiresVerification: false,
      notes: "Sağlayıcı belirlenemedi — yapılandırma uygulanamaz.",
    },
  },
};

/**
 * Connection lifecycle — pure. `connecting` and the terminal `ready` state
 * are unreachable this sprint (no provider ever gets `liveCapable = true`),
 * kept only so the type already matches what a future sprint's live
 * connection attempt would flow through.
 */
export function computeProviderConnectionState(
  category: HermesProviderCategory,
  configured: boolean,
  connected: boolean,
  authorized: boolean,
  liveCapable: boolean,
): HermesProviderConnectionState {
  if (category === "unknown") return "blocked";
  if (!configured) return "disconnected";
  if (!connected) return "configured";
  if (!authorized) return "connected";
  if (!liveCapable) return "authorized";
  return "ready";
}

/** Readiness — pure. `ready` is unreachable this sprint for the same reason `connectionState` never reaches it: live send is hard-disabled everywhere. */
export function computeProviderReadiness(
  category: HermesProviderCategory,
  configured: boolean,
  connected: boolean,
  authorized: boolean,
  shadowCapable: boolean,
  liveCapable: boolean,
): HermesProviderReadiness {
  if (category === "unknown") return "blocked";
  if (!configured) return "configuration_required";
  if (!connected) return "offline";
  if (!authorized) return "authorization_required";
  if (liveCapable) return "ready";
  return shadowCapable ? "partially_ready" : "blocked";
}

/** Health — a pure projection of readiness/connectionState, not an independent signal (no real network probe exists to feed one). */
export function computeProviderHealth(
  connectionState: HermesProviderConnectionState,
  readiness: HermesProviderReadiness,
): HermesProviderHealth {
  if (connectionState === "blocked") return "blocked";
  if (readiness === "offline") return "offline";
  if (readiness === "ready" || readiness === "partially_ready") return "healthy";
  return "warning";
}

function buildCapabilities(
  category: HermesProviderCategory,
  shadowCapable: boolean,
  requiresRecipient: boolean,
): HermesProviderCapability[] {
  return [
    {
      key: "shadow_send",
      label: CAPABILITY_LABELS.shadow_send,
      enabled: shadowCapable,
      reason: shadowCapable
        ? "Bu sağlayıcı için shadow send desteklenir — mesaj göndermeden önizleme üretilebilir."
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
      key: "session_tracking",
      label: CAPABILITY_LABELS.session_tracking,
      enabled: category !== "unknown",
      reason:
        category !== "unknown"
          ? "Provider Session Runtime bu sağlayıcı için oturum durumunu izler."
          : "Sağlayıcı belirsiz — izlenecek bir oturum yok.",
    },
    {
      key: "reply_monitoring",
      label: CAPABILITY_LABELS.reply_monitoring,
      enabled: false,
      reason: "Gelen yanıt izleme henüz güvenli şekilde modellenmedi.",
    },
    {
      key: "rate_limit",
      label: CAPABILITY_LABELS.rate_limit,
      enabled: false,
      reason: "Sağlayıcıya özel hız sınırı kontrolü bu sprintte uygulanmadı.",
    },
    {
      key: "recipient_validation",
      label: CAPABILITY_LABELS.recipient_validation,
      enabled: requiresRecipient,
      reason: requiresRecipient
        ? "Teslimat isteği oluşturulmadan önce alıcı bilgisi doğrulanır."
        : "Bu sağlayıcı için alıcı doğrulaması uygulanmaz.",
    },
  ];
}

function buildProviderAudit(
  facts: ProviderFacts,
  connectionState: HermesProviderConnectionState,
  readiness: HermesProviderReadiness,
  now: number,
): ProviderRuntimeAuditEntry[] {
  const audit: ProviderRuntimeAuditEntry[] = [
    {
      timestamp: now,
      actor: "Gateway",
      action: "runtime_evaluated",
      details: `${facts.label} Provider Runtime değerlendirildi.`,
    },
    {
      timestamp: now + 1,
      actor: "Gateway",
      action: "configuration_inspected",
      details: facts.configured
        ? `${facts.label} yapılandırması yazılımda tanımlı.`
        : `${facts.label} için yapılandırma eksik.`,
    },
  ];
  if (readiness === "authorization_required") {
    audit.push({
      timestamp: now + 2,
      actor: "Gateway",
      action: "authorization_required",
      details: `${facts.label} yetkilendirme bekliyor.`,
    });
  }
  if (readiness === "partially_ready") {
    audit.push({
      timestamp: now + 2,
      actor: "Gateway",
      action: "provider_ready_for_shadow",
      details: `${facts.label} shadow send için hazır.`,
    });
  }
  if (readiness === "offline") {
    audit.push({
      timestamp: now + 2,
      actor: "Gateway",
      action: "provider_offline",
      details: `${facts.label} bağlantısı çevrimdışı.`,
    });
  }
  audit.push({
    timestamp: now + 3,
    actor: "Gateway",
    action: "live_send_disabled",
    details: LIVE_SEND_DISABLED_MESSAGE,
  });
  return audit;
}

/**
 * Deterministic registry builder — no network, no env read. Called once by
 * the caller (V2Shell, memoized), same convention as `buildProviderSessions`.
 */
export function buildProviderRuntime(now: number = Date.now()): HermesProvider[] {
  return (Object.keys(PROVIDER_FACTS) as DeliveryProvider[]).map((provider) => {
    const facts = PROVIDER_FACTS[provider];
    const connector = PROVIDER_CONNECTORS[provider];
    const shadowCapable = facts.configured && connector.supportsShadowSend;
    const liveCapable = connector.supportsLiveSend;
    const connectionState = computeProviderConnectionState(
      facts.category,
      facts.configured,
      facts.connected,
      facts.authorized,
      liveCapable,
    );
    const readiness = computeProviderReadiness(
      facts.category,
      facts.configured,
      facts.connected,
      facts.authorized,
      shadowCapable,
      liveCapable,
    );
    const health = computeProviderHealth(connectionState, readiness);

    return {
      id: `provider-runtime:${provider}`,
      provider,
      label: facts.label,
      category: facts.category,
      status: readiness,
      connectionState,
      capabilities: buildCapabilities(facts.category, shadowCapable, connector.requiresRecipient),
      configuration: facts.configuration,
      health,
      priority: facts.priority,
      supportedChannels: facts.category === "unknown" ? [] : [provider],
      createdAt: now,
      updatedAt: now,
      audit: buildProviderAudit(facts, connectionState, readiness, now),
    };
  });
}

/* ── Lookup helpers — all pure, all read-only ─────────────────────── */

export function getProvider(providers: HermesProvider[], provider: DeliveryProvider): HermesProvider | undefined {
  return providers.find((p) => p.provider === provider);
}

export function findProviderByChannel(providers: HermesProvider[], channel: DeliveryProvider): HermesProvider | undefined {
  return providers.find((p) => p.supportedChannels.includes(channel));
}

export function findProviderByName(providers: HermesProvider[], label: string): HermesProvider | undefined {
  const q = label.trim().toLowerCase();
  return providers.find((p) => p.label.toLowerCase() === q);
}

/**
 * Mission timeline entries — a pure projection of the provider's own audit
 * log, exactly like every other Hermes *TimelineEntries builder. Callers
 * must only merge this into a *per-mission* timeline (Workspace Mission
 * Card, Decision Center) when that mission actually has a delivery/provider
 * to show — never into the global activity feed for all five providers on
 * every render, which would flood it identically on every load.
 */
export function buildProviderRuntimeTimelineEntries(
  provider: HermesProvider | undefined,
): HermesMissionTimelineItem[] {
  if (!provider) return [];
  return provider.audit.map((entry) => ({
    at: entry.timestamp,
    actorLabel: entry.actor,
    actorCls: entry.actor === "Founder" ? "text-zinc-100" : "text-indigo-300",
    text: entry.details,
  }));
}
