import { getRecentFollowUpCandidates } from "./follow-up-registry.ts";
import type { FollowUpCandidate } from "./follow-up-runtime.ts";
import { getRecentDemoScheduleItems } from "./demo-scheduling-registry.ts";
import { getSalesOutcomeByMissionId } from "./sales-outcome-registry.ts";
import { getRecentWhatsAppReplies } from "./whatsapp-reply-registry.ts";
import { getConversationByMissionId, getConversationByLeadId } from "./hermes-conversation-registry.ts";
import {
  evaluateFollowUpOrchestration,
  type FollowUpCandidateLike,
  type FollowUpOrchestrationDecision,
  type FollowUpSignals,
  type FollowUpTrigger,
} from "./hermes-autonomous-follow-up-orchestrator.ts";
import { defaultFollowUpPolicy, type HermesFollowUpPolicy } from "./hermes-follow-up-policy.ts";
import { recordFollowUpOrchestrationDecision } from "./hermes-follow-up-orchestration-registry.ts";

/**
 * Hermes Follow-up Orchestration Service (Sprint C5).
 *
 * ORCHESTRATION CHOKE POINT (server-only). Mevcut `follow-up-registry.ts`'in
 * ürettiği her aktif `FollowUpCandidate` için conversation/demo/outcome/reply
 * sinyallerini toplar, saf `evaluateFollowUpOrchestration`'ı çağırır ve
 * sonucu `hermes-follow-up-orchestration-registry.ts`'e persist eder.
 *
 * Bu servis MESAJ GÖNDERMEZ, ONAY ÜRETMEZ, provider/gateway import ETMEZ.
 * Yalnız zamanlama/durum değerlendirir. Deterministik ve idempotent: aynı
 * `now` + aynı dünya durumu → aynı kararlar → upsert (duplicate yok).
 *
 * Concurrent-evaluation koruması: basit re-entrancy lock — bir değerlendirme
 * sürerken ikinci çağrı `skipped` döner (JS tek-thread, senkron; lock yalnız
 * re-entrant persist'i engeller).
 */

const CONVERSATION_CLOSED_STATES: ReadonlySet<string> = new Set(["closed_won", "closed_lost", "blocked"]);
const DEMO_SETTLED_STATUSES: ReadonlySet<string> = new Set(["scheduled", "completed"]);
/** Bu adayın kendisi hariç, mission için mevcut bir onay-taslağı mı var? */
const APPROVAL_DRAFT_STATUSES: ReadonlySet<string> = new Set(["approval_required", "approved"]);

let isEvaluating = false;

function toCandidateLike(c: FollowUpCandidate): FollowUpCandidateLike {
  return {
    id: c.id,
    missionId: c.missionId,
    leadId: c.leadId,
    reason: c.reason as FollowUpTrigger,
    status: c.status,
    priority: c.priority,
    source: c.source,
    createdAt: c.createdAt,
    expiresAt: c.expiresAt,
  };
}

/**
 * Bir aday için güncel dünya durumundan sinyalleri toplar. Yalnız mevcut
 * registry'lerin ürettiği gerçekleri okur — hiçbir yeni sinyal hesaplamaz.
 */
function gatherSignals(
  candidate: FollowUpCandidate,
  allCandidates: FollowUpCandidate[],
  now: number,
): FollowUpSignals {
  const mapped = candidate.missionId != null;

  // Yeni cevap: bu adaydan sonra gelen, aynı mission'a ait bir cevap.
  let hasNewerReply = false;
  if (candidate.missionId) {
    hasNewerReply = getRecentWhatsAppReplies(50, now).some(
      (r) => r.missionId === candidate.missionId && r.occurredAt > candidate.createdAt,
    );
  }

  // Demo scheduled/completed.
  let demoScheduledOrCompleted = false;
  if (candidate.missionId) {
    demoScheduledOrCompleted = getRecentDemoScheduleItems(50, now).some(
      (d) => d.missionId === candidate.missionId && DEMO_SETTLED_STATUSES.has(d.status),
    );
  }

  // Satış sonucu.
  const outcome = candidate.missionId ? getSalesOutcomeByMissionId(candidate.missionId, now) : undefined;
  const outcomeWon = outcome?.status === "won";
  const outcomeLost = outcome?.status === "lost";

  // Konuşma durumu (mission > lead).
  const conv =
    (candidate.missionId ? getConversationByMissionId(candidate.missionId) : null) ??
    (candidate.leadId ? getConversationByLeadId(candidate.leadId) : null);
  const convState = conv?.decision.state;
  const conversationNotInterested = convState === "not_interested";
  const conversationWrongNumber = convState === "wrong_number";
  const conversationClosed = convState != null && CONVERSATION_CLOSED_STATES.has(convState);

  // Mission için (bu aday hariç) mevcut onay-taslağı.
  const hasActiveApprovalDraft = candidate.missionId
    ? allCandidates.some(
        (c) =>
          c.id !== candidate.id &&
          c.missionId === candidate.missionId &&
          APPROVAL_DRAFT_STATUSES.has(c.status),
      )
    : false;

  // Lead bazlı sayım + en son diğer takip zamanı.
  let followUpCountForLead = 0;
  let mostRecentOtherFollowUpAt: number | null = null;
  if (candidate.leadId) {
    for (const c of allCandidates) {
      if (c.leadId !== candidate.leadId) continue;
      followUpCountForLead += 1;
      if (c.id !== candidate.id) {
        if (mostRecentOtherFollowUpAt == null || c.createdAt > mostRecentOtherFollowUpAt) {
          mostRecentOtherFollowUpAt = c.createdAt;
        }
      }
    }
  }

  return {
    hasNewerReply,
    demoScheduledOrCompleted,
    outcomeWon,
    outcomeLost,
    conversationNotInterested,
    conversationWrongNumber,
    conversationClosed,
    // DNC lead alanıdır ve server registry'lerinde taşınmaz; konuşma
    // ilgilenmiyor/yanlış numara sinyalleri bu bloğu zaten kapsar.
    doNotContact: false,
    missionClosed: outcomeWon || outcomeLost,
    leadInvalid: false,
    hasActiveApprovalDraft,
    // Eşleşmiş bir mission zaten bir gönderim mapping'inden gelir → kanal vardır.
    hasContactPath: mapped,
    followUpCountForLead,
    mostRecentOtherFollowUpAt,
  };
}

export type RunFollowUpOrchestrationResult = {
  ok: true;
  skipped: boolean;
  evaluatedCount: number;
  decisions: FollowUpOrchestrationDecision[];
};

/**
 * Tüm aktif follow-up adaylarını değerlendirir ve orchestration
 * registry'sine persist eder. Idempotent + concurrent-safe.
 *
 * @param persist true ise kararlar registry'ye yazılır (evaluate/cron yolu);
 *                false ise yalnız hesaplanır (salt-okuma projeksiyon yolu).
 */
export function runFollowUpOrchestration(options: {
  now?: number;
  policy?: HermesFollowUpPolicy;
  persist?: boolean;
  leadNameById?: Record<string, string>;
} = {}): RunFollowUpOrchestrationResult {
  const now = options.now ?? Date.now();
  const policy = options.policy ?? defaultFollowUpPolicy();

  if (!policy.enabled) {
    return { ok: true, skipped: false, evaluatedCount: 0, decisions: [] };
  }

  if (isEvaluating) {
    return { ok: true, skipped: true, evaluatedCount: 0, decisions: [] };
  }

  isEvaluating = true;
  try {
    const candidates = getRecentFollowUpCandidates(500, now);
    const decisions: FollowUpOrchestrationDecision[] = [];

    for (const candidate of candidates) {
      const signals = gatherSignals(candidate, candidates, now);
      const decision = evaluateFollowUpOrchestration({
        candidate: toCandidateLike(candidate),
        signals,
        policy,
        currentTime: now,
      });
      decisions.push(decision);

      if (options.persist) {
        const businessName =
          (candidate.leadId ? options.leadNameById?.[candidate.leadId] : undefined) || undefined;
        recordFollowUpOrchestrationDecision({ decision, businessName, now });
      }
    }

    return { ok: true, skipped: false, evaluatedCount: decisions.length, decisions };
  } finally {
    isEvaluating = false;
  }
}

/** Test-only — re-entrancy lock'u sıfırlar. */
export function __resetFollowUpOrchestrationServiceForTests(): void {
  isEvaluating = false;
}
