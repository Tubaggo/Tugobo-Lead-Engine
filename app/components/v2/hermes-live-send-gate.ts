import type { AutomationCard } from "@/app/components/v2/adapters/automation-center-adapter";
import type { HermesMissionTimelineItem } from "@/app/components/v2/adapters/hermes-mission-adapter";
import type { HermesOutboundDraft } from "@/app/components/v2/hermes-courier";
import type { DeliveryProvider, HermesDeliveryRequest } from "@/app/components/v2/hermes-delivery-gateway";
import { LIVE_SEND_DISABLED_MESSAGE } from "@/app/components/v2/hermes-provider-connectors";
import type { HermesProviderReceipt } from "@/app/components/v2/hermes-provider-connectors";
import type { HermesProviderSession } from "@/app/components/v2/hermes-provider-sessions";

/**
 * Hermes Live Send Gate (v4.6.0).
 *
 * The final supervised checkpoint before any future live send — this
 * sprint's output is the *gate*, not a send. Even in the hypothetical case
 * where every prerequisite (draft, delivery, shadow receipt, provider
 * session) were fully ready, `DEFAULT_LIVE_SEND_POLICY.liveSendEnabled` is
 * hard-coded `false`, so confirming a gate always resolves to
 * "confirmed_but_blocked" with the exact reason "Canlı gönderim bu sprintte
 * kapalı." — never a send. No fetch, no provider SDK, no network call
 * anywhere in this file.
 *
 * Session state only — HermesLiveSendGate is never persisted. Kept in a
 * Record<missionId, HermesLiveSendGate> by the caller (V2Shell), the same
 * convention every prior Hermes Record (hermesDecisions / hermesPipelines /
 * hermesDrafts / hermesDeliveries / hermesProviderReceipts) already uses.
 *
 * Does not touch Execution Runtime, the Decision Engine, Shadow Task
 * generation, mission grouping, the Pipeline Engine, the Courier Draft
 * Runtime, the Delivery Gateway's business rules, Provider Connector's
 * shadow-send behavior, or Provider Session's business rules — it only
 * reads what those already produced. Pure TypeScript, no React.
 */

export type HermesLiveSendGateStatus =
  | "pending_confirmation"
  | "confirmed_but_blocked"
  | "ready_for_future_live_send"
  | "blocked"
  | "cancelled"
  | "expired";

export const GATE_STATUS_LABELS: Record<HermesLiveSendGateStatus, string> = {
  pending_confirmation: "Onay Bekliyor",
  confirmed_but_blocked: "Onaylandı — Engellendi",
  ready_for_future_live_send: "Gelecekte Canlı Gönderime Hazır",
  blocked: "Engellendi",
  cancelled: "İptal Edildi",
  expired: "Süresi Doldu",
};

export type MissionGateUiState = HermesLiveSendGateStatus | "not-opened";

export const MISSION_GATE_STATE_LABELS: Record<MissionGateUiState, string> = {
  ...GATE_STATUS_LABELS,
  "not-opened": "Live Send Gate Hazır",
};

export type GateAuditEntry = {
  timestamp: number;
  actor: string;
  action: string;
  details: string;
};

export type HermesLiveSendPolicy = {
  liveSendEnabled: boolean;
  requiresFounderFinalConfirm: boolean;
  requiresProviderSessionReady: boolean;
  requiresShadowReceipt: boolean;
  requiresApprovedDraft: boolean;
  requiresDeliveryReady: boolean;
  allowExternalSend: boolean;
};

/** This sprint's fixed policy — every "requires" flag is true (the full ladder still applies), but liveSendEnabled/allowExternalSend are hard false. */
export const DEFAULT_LIVE_SEND_POLICY: HermesLiveSendPolicy = {
  liveSendEnabled: false,
  requiresFounderFinalConfirm: true,
  requiresProviderSessionReady: true,
  requiresShadowReceipt: true,
  requiresApprovedDraft: true,
  requiresDeliveryReady: true,
  allowExternalSend: false,
};

export type HermesLiveSendGate = {
  id: string;
  missionId: string;
  leadId: string;
  draftId: string;
  deliveryId: string;
  receiptId: string;
  provider: DeliveryProvider;
  recipient: string | null;
  status: HermesLiveSendGateStatus;
  createdAt: number;
  confirmedAt?: number;
  blockedAt?: number;
  cancelledAt?: number;
  reason: string;
  policy: HermesLiveSendPolicy;
  requiresFounderConfirmation: boolean;
  /** Append-only — every transition adds an entry, nothing is ever overwritten or removed. */
  audit: GateAuditEntry[];
};

export const LIVE_SEND_GATE_LABEL = "Live Send Gate";
export const GATE_SECTION_TITLE = "Canlı Gönderim Kapısı";
export const OPEN_GATE_BUTTON_LABEL = "Canlı Gönderim Kapısını Aç";
export const CONFIRM_GATE_BUTTON_LABEL = "Canlı Gönderimi Onayla";
export const CANCEL_GATE_BUTTON_LABEL = "İptal Et";
export const GATE_DRY_CONFIRM_NOTE = "Bu onay mesaj göndermez. Sadece denetim kaydı oluşturur.";
export const GATE_POLICY_WARNING =
  "Bu sprintte canlı gönderim kapalıdır. Onay yalnızca denetim kaydı oluşturur.";
export const GATE_NOT_SENT_LABEL = "Gönderim yapılmadı.";
export const GATE_POLICY_BLOCKED_LABEL = "Politika nedeniyle engellendi.";
export const GATE_AUDIT_RECORDED_LABEL = "Denetim kaydı oluşturuldu.";

export type LiveSendGateGuardResult = { allowed: boolean; reason: string };

/**
 * Full guardrail ladder — every condition the spec lists, in order. Answers
 * "could this theoretically live-send right now" — always `false` this
 * sprint, since the `live_send` capability is hard-disabled on every
 * provider session. The differentiated `reason` (missing draft vs. missing
 * receipt vs. session not authorized vs. capability disabled) is what
 * determines a freshly-opened gate's initial status and reason below.
 */
export function canOpenLiveSendGate(
  draft: HermesOutboundDraft | undefined,
  delivery: HermesDeliveryRequest | undefined,
  receipt: HermesProviderReceipt | undefined,
  session: HermesProviderSession | undefined,
  card: AutomationCard | undefined,
  existingGate: HermesLiveSendGate | undefined,
): LiveSendGateGuardResult {
  if (existingGate) {
    if (existingGate.status === "cancelled") {
      return { allowed: false, reason: "Live Send Gate iptal edildi — tekrar açılamaz." };
    }
    if (existingGate.status === "expired") {
      return { allowed: false, reason: "Live Send Gate süresi doldu — tekrar açılamaz." };
    }
    return { allowed: false, reason: "Bu mission için zaten bir Live Send Gate var — mükerrer kapı engellendi." };
  }
  if (!draft) return { allowed: false, reason: "Onaylı taslak bulunamadı." };
  if (draft.status === "rejected") return { allowed: false, reason: "Taslak reddedildi — Live Send Gate açılamaz." };
  if (draft.status !== "approved") return { allowed: false, reason: "Taslak henüz onaylanmadı." };
  if (!delivery) return { allowed: false, reason: "Teslimat isteği bulunamadı." };
  if (delivery.status !== "ready") {
    return { allowed: false, reason: "Teslimat isteği henüz Sağlayıcı İçin Hazır durumunda değil." };
  }
  if (!receipt) return { allowed: false, reason: "Shadow send makbuzu bulunamadı." };
  if (receipt.status !== "shadow_sent") return { allowed: false, reason: "Shadow send tamamlanmadı." };
  if (delivery.provider === "unknown") return { allowed: false, reason: "Sağlayıcı belirlenemedi." };
  if (card?.scoredLead.doNotContact) {
    return { allowed: false, reason: "İletişim yasağı (DNC) aktif — Live Send Gate açılamaz." };
  }
  if (!delivery.recipient) return { allowed: false, reason: "Alıcı bilgisi bulunamadı." };
  if (!session) return { allowed: false, reason: "Provider oturumu bulunamadı." };
  if (!session.configured) return { allowed: false, reason: "Provider yapılandırılmadı." };
  if (!session.connected) return { allowed: false, reason: "Provider bağlı değil." };
  if (!session.authorized) return { allowed: false, reason: "Provider yetkili değil." };
  const liveCapability = session.capabilities.find((c) => c.key === "live_send");
  if (!liveCapability?.enabled) return { allowed: false, reason: LIVE_SEND_DISABLED_MESSAGE };
  return { allowed: true, reason: "Live Send Gate açılabilir — canlı gönderim yine de kapalı kalır." };
}

/**
 * The subset of `canOpenLiveSendGate`'s ladder that must pass before a gate
 * *record* is created at all. Deliberately excludes the provider-session
 * tier — per spec, "Creates a gate only if minimum prerequisites exist ...
 * but it must record provider session readiness separately. If provider
 * session is not live-ready: Gate can still exist but must show blocked
 * reason." Not exported — `openLiveSendGate` is the only caller.
 */
function hasMinimumGatePrerequisites(
  draft: HermesOutboundDraft | undefined,
  delivery: HermesDeliveryRequest | undefined,
  receipt: HermesProviderReceipt | undefined,
  card: AutomationCard | undefined,
  existingGate: HermesLiveSendGate | undefined,
): LiveSendGateGuardResult {
  if (existingGate) {
    if (existingGate.status === "cancelled") {
      return { allowed: false, reason: "Live Send Gate iptal edildi — tekrar açılamaz." };
    }
    if (existingGate.status === "expired") {
      return { allowed: false, reason: "Live Send Gate süresi doldu — tekrar açılamaz." };
    }
    return { allowed: false, reason: "Bu mission için zaten bir Live Send Gate var — mükerrer kapı engellendi." };
  }
  if (!draft) return { allowed: false, reason: "Onaylı taslak bulunamadı." };
  if (draft.status === "rejected") return { allowed: false, reason: "Taslak reddedildi — Live Send Gate açılamaz." };
  if (draft.status !== "approved") return { allowed: false, reason: "Taslak henüz onaylanmadı." };
  if (!delivery) return { allowed: false, reason: "Teslimat isteği bulunamadı." };
  if (delivery.status !== "ready") {
    return { allowed: false, reason: "Teslimat isteği henüz Sağlayıcı İçin Hazır durumunda değil." };
  }
  if (!receipt) return { allowed: false, reason: "Shadow send makbuzu bulunamadı." };
  if (receipt.status !== "shadow_sent") return { allowed: false, reason: "Shadow send tamamlanmadı." };
  if (delivery.provider === "unknown") return { allowed: false, reason: "Sağlayıcı belirlenemedi." };
  if (card?.scoredLead.doNotContact) {
    return { allowed: false, reason: "İletişim yasağı (DNC) aktif — Live Send Gate açılamaz." };
  }
  if (!delivery.recipient) return { allowed: false, reason: "Alıcı bilgisi bulunamadı." };
  return { allowed: true, reason: "Live Send Gate için minimum koşullar sağlandı." };
}

/**
 * Creates a gate whenever the minimum prerequisites pass — regardless of
 * provider session readiness. Session readiness (plus the always-false
 * `live_send` capability) is evaluated separately via `canOpenLiveSendGate`
 * to decide the gate's *initial* status: "blocked" with the specific reason
 * when session/capability isn't ready (the reachable case every time this
 * sprint), or "pending_confirmation" in the hypothetical case everything
 * passes. Callers must run `hasMinimumGatePrerequisites`-equivalent checks
 * first — in practice, callers should treat a `null`-returning helper (see
 * V2Shell) as "do not call this."
 */
export function openLiveSendGate(
  draft: HermesOutboundDraft,
  delivery: HermesDeliveryRequest,
  receipt: HermesProviderReceipt,
  session: HermesProviderSession | undefined,
  card: AutomationCard | undefined,
): HermesLiveSendGate {
  const now = Date.now();
  const readiness = canOpenLiveSendGate(draft, delivery, receipt, session, card, undefined);
  const status: HermesLiveSendGateStatus = readiness.allowed ? "pending_confirmation" : "blocked";
  const reason = readiness.allowed ? "Founder onayı bekleniyor." : readiness.reason;

  const audit: GateAuditEntry[] = [
    { timestamp: now, actor: "Gateway", action: "gate_created", details: "Live Send Gate oluşturuldu." },
    {
      timestamp: now + 1,
      actor: "Gateway",
      action: "shadow_receipt_verified",
      details: "Shadow send makbuzu doğrulandı.",
    },
    {
      timestamp: now + 2,
      actor: "Gateway",
      action: "provider_session_checked",
      details: session
        ? `Provider oturumu kontrol edildi — ${session.connected ? "bağlı" : "bağlı değil"}.`
        : "Provider oturumu bulunamadı.",
    },
  ];
  if (status === "blocked") {
    audit.push({ timestamp: now + 3, actor: "Gateway", action: "live_send_blocked", details: reason });
  }
  audit.push({
    timestamp: now + 4,
    actor: "Gateway",
    action: "no_external_delivery",
    details: "Dış teslimat gerçekleştirilmedi.",
  });

  return {
    id: `gate:${delivery.missionId}`,
    missionId: delivery.missionId,
    leadId: delivery.leadId,
    draftId: draft.id,
    deliveryId: delivery.id,
    receiptId: receipt.id,
    provider: delivery.provider,
    recipient: delivery.recipient,
    status,
    createdAt: now,
    blockedAt: status === "blocked" ? now + 3 : undefined,
    reason,
    policy: DEFAULT_LIVE_SEND_POLICY,
    requiresFounderConfirmation: DEFAULT_LIVE_SEND_POLICY.requiresFounderFinalConfirm,
    audit,
  };
}

/** Exported so V2Shell can decide, before calling `openLiveSendGate`, whether a gate record should be created at all. */
export function canCreateLiveSendGateRecord(
  draft: HermesOutboundDraft | undefined,
  delivery: HermesDeliveryRequest | undefined,
  receipt: HermesProviderReceipt | undefined,
  card: AutomationCard | undefined,
  existingGate: HermesLiveSendGate | undefined,
): LiveSendGateGuardResult {
  return hasMinimumGatePrerequisites(draft, delivery, receipt, card, existingGate);
}

/**
 * Founder's final, explicit, dry-run confirmation — this is intentionally
 * NOT a send. Since `DEFAULT_LIVE_SEND_POLICY.liveSendEnabled` is hard
 * false, the result is always "confirmed_but_blocked" with the exact
 * required reason, regardless of the gate's status beforehand (even a
 * "blocked" gate can be confirmed — the founder's confirmation is itself
 * the audited action, not a precondition for it).
 */
export function confirmLiveSendGate(gate: HermesLiveSendGate): HermesLiveSendGate {
  const now = Date.now();
  const reason = LIVE_SEND_DISABLED_MESSAGE;
  return {
    ...gate,
    status: "confirmed_but_blocked",
    confirmedAt: now,
    reason,
    audit: [
      ...gate.audit,
      {
        timestamp: now,
        actor: "Founder",
        action: "final_confirmation_recorded",
        details: "Founder canlı gönderimi onayladı — denetim kaydı oluşturuldu.",
      },
      { timestamp: now + 1, actor: "Gateway", action: "live_send_blocked", details: reason },
      { timestamp: now + 2, actor: "Gateway", action: "no_external_delivery", details: GATE_NOT_SENT_LABEL },
    ],
  };
}

/** Sets the gate to "cancelled" — no send, ever. */
export function cancelLiveSendGate(gate: HermesLiveSendGate): HermesLiveSendGate {
  const now = Date.now();
  return {
    ...gate,
    status: "cancelled",
    cancelledAt: now,
    reason: "Founder tarafından iptal edildi.",
    audit: [
      ...gate.audit,
      { timestamp: now, actor: "Founder", action: "gate_cancelled", details: "Live Send Gate iptal edildi." },
      { timestamp: now + 1, actor: "Gateway", action: "no_external_delivery", details: GATE_NOT_SENT_LABEL },
    ],
  };
}

/**
 * Presentation-only projection for the mission card / sidebar badge —
 * mirrors `computeMissionDeliveryUiState`/`computeMissionConnectorUiState`'s
 * "real state if it exists, else a derived pre-state" convention.
 */
export function computeMissionGateUiState(gate: HermesLiveSendGate | undefined): MissionGateUiState {
  return gate ? gate.status : "not-opened";
}

/**
 * Mission timeline entries — a pure projection of the gate's own audit log,
 * exactly like every other Hermes *TimelineEntries builder. The audit trail
 * *is* the timeline; nothing extra is invented here.
 */
export function buildGateTimelineEntries(gate: HermesLiveSendGate | undefined): HermesMissionTimelineItem[] {
  if (!gate) return [];
  return gate.audit.map((entry) => ({
    at: entry.timestamp,
    actorLabel: entry.actor,
    actorCls: entry.actor === "Founder" ? "text-zinc-100" : "text-indigo-300",
    text: entry.details,
  }));
}
