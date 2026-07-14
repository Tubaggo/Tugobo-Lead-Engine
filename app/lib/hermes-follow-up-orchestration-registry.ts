import {
  isActiveFollowUpOrchestration,
  sortFollowUpOrchestration,
  type FollowUpOrchestrationDecision,
} from "./hermes-autonomous-follow-up-orchestrator.ts";

/**
 * Hermes Follow-up Orchestration Registry (Sprint C5 — Scope 5).
 *
 * Server-only, in-memory ORCHESTRATION kayıt defteri. Mevcut
 * `follow-up-registry.ts` HÂLÂ tek doğruluk kaynağıdır (candidate + founder
 * status). Bu registry YALNIZ orchestration state snapshot'larını saklar —
 * paralel bir candidate sistemi DEĞİLDİR.
 *
 * Diğer Hermes registry'leriyle aynı tradeoff: modül düzeyi store, server
 * restart'ında kaybolur, 14 gün TTL, max 500 kayıt, newest-first,
 * followUpCandidateId bazlı upsert (retry-safe → duplicate yok).
 *
 * Ne SAKLAMAZ (yapısal olarak — `FollowUpOrchestrationDecision` bu alanları
 * TAŞIMAZ): ham telefon, ham cevap gövdesi, ham WhatsApp payload'ı, mesaj
 * metni, token, secret, provider yanıtı. Audit detay son savunma hattı olarak
 * scrub edilir.
 */

const TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 gün
const MAX_STORED = 500;
const MAX_AUDIT_EVENTS_PER_ITEM = 12;

function scrubDetail(text: string): string {
  return text
    .replace(/Bearer\s+\S+/gi, "Bearer [gizli]")
    .replace(/(key|token|secret)=\S+/gi, "$1=[gizli]")
    .replace(/\+?\d[\d\s\-()]{8,}\d/g, "[numara gizli]");
}

type StoredOrchestration = {
  decision: FollowUpOrchestrationDecision;
  /** Founder görünümleri için görünen ad — asla telefon/iç payload değil. */
  businessName: string;
  storedAt: number;
};

/** Birincil indeks: followUpCandidateId → kayıt (dedupe anahtarı). */
const itemsByCandidateId = new Map<string, StoredOrchestration>();

function cloneDecision(decision: FollowUpOrchestrationDecision): FollowUpOrchestrationDecision {
  return {
    ...decision,
    blockedReasonsTr: [...decision.blockedReasonsTr],
    auditEvents: decision.auditEvents
      .slice(-MAX_AUDIT_EVENTS_PER_ITEM)
      .map((e) => ({ ...e, detailTr: scrubDetail(e.detailTr) })),
  };
}

function pruneExpired(now: number): void {
  for (const [key, item] of itemsByCandidateId) {
    if (now - item.storedAt > TTL_MS) itemsByCandidateId.delete(key);
  }
  if (itemsByCandidateId.size > MAX_STORED) {
    const sorted = [...itemsByCandidateId.entries()].sort((a, b) => a[1].storedAt - b[1].storedAt);
    for (const [key] of sorted.slice(0, itemsByCandidateId.size - MAX_STORED)) {
      itemsByCandidateId.delete(key);
    }
  }
}

export type RecordFollowUpOrchestrationInput = {
  decision: FollowUpOrchestrationDecision;
  businessName?: string;
  now?: number;
};

/**
 * followUpCandidateId bazlı upsert. Aynı candidate yeniden değerlendirilirse
 * (scheduler retry) yeni karar eskisinin yerini alır; audit geçmişi sınırlı
 * biçimde taşınır; duplicate kayıt oluşmaz.
 */
export function recordFollowUpOrchestrationDecision(input: RecordFollowUpOrchestrationInput): boolean {
  const key = input.decision.followUpCandidateId;
  if (!key) return false;
  const now = input.now ?? Date.now();
  pruneExpired(now);

  const previous = itemsByCandidateId.get(key);
  const next = cloneDecision(input.decision);
  if (previous) {
    next.auditEvents = [...previous.decision.auditEvents, ...next.auditEvents].slice(-MAX_AUDIT_EVENTS_PER_ITEM);
  }

  itemsByCandidateId.set(key, {
    decision: next,
    businessName: input.businessName?.trim() || previous?.businessName || "İsimsiz işletme",
    storedAt: now,
  });
  return true;
}

export type StoredFollowUpOrchestrationView = {
  decision: FollowUpOrchestrationDecision;
  businessName: string;
  storedAt: number;
};

function toView(item: StoredOrchestration): StoredFollowUpOrchestrationView {
  return { decision: cloneDecision(item.decision), businessName: item.businessName, storedAt: item.storedAt };
}

export function getFollowUpOrchestrationByCandidateId(candidateId: string): StoredFollowUpOrchestrationView | null {
  const item = itemsByCandidateId.get(candidateId);
  return item ? toView(item) : null;
}

/** Bir lead'in en güncel orchestration kararı (varsa). */
export function getFollowUpOrchestrationByLeadId(leadId: string): StoredFollowUpOrchestrationView | null {
  let best: StoredOrchestration | null = null;
  for (const item of itemsByCandidateId.values()) {
    if (item.decision.leadId !== leadId) continue;
    if (!best || item.storedAt > best.storedAt) best = item;
  }
  return best ? toView(best) : null;
}

/** Bir mission'ın en güncel orchestration kararı (varsa). */
export function getFollowUpOrchestrationByMissionId(missionId: string): StoredFollowUpOrchestrationView | null {
  let best: StoredOrchestration | null = null;
  for (const item of itemsByCandidateId.values()) {
    if (item.decision.missionId !== missionId) continue;
    if (!best || item.storedAt > best.storedAt) best = item;
  }
  return best ? toView(best) : null;
}

/** İş önceliği sırasında (durum → öncelik → dueAt), yeni önce değil — deterministik. */
export function getRecentFollowUpOrchestrationDecisions(
  limit: number = 50,
  now: number = Date.now(),
): StoredFollowUpOrchestrationView[] {
  pruneExpired(now);
  const views = [...itemsByCandidateId.values()].map(toView);
  const sorted = sortFollowUpOrchestration(views.map((v) => v.decision));
  const byId = new Map(views.map((v) => [v.decision.id, v]));
  return sorted.slice(0, Math.max(0, limit)).map((d) => byId.get(d.id)!);
}

/** Yalnız aktif (founder'ın görmesi gereken) takipler. */
export function getActiveFollowUpOrchestrationDecisions(
  limit: number = 50,
  now: number = Date.now(),
): StoredFollowUpOrchestrationView[] {
  return getRecentFollowUpOrchestrationDecisions(500, now)
    .filter((v) => isActiveFollowUpOrchestration(v.decision))
    .slice(0, Math.max(0, limit));
}

/** Bu lead için mevcut orchestration kayıt sayısı (maxFollowUpsPerLead uygulaması için). */
export function countFollowUpOrchestrationForLead(leadId: string | null, now: number = Date.now()): number {
  if (!leadId) return 0;
  pruneExpired(now);
  let count = 0;
  for (const item of itemsByCandidateId.values()) {
    if (item.decision.leadId === leadId) count += 1;
  }
  return count;
}

export function clearExpiredFollowUpOrchestrationDecisions(now: number = Date.now()): number {
  const before = itemsByCandidateId.size;
  pruneExpired(now);
  return before - itemsByCandidateId.size;
}

/** Test-only escape hatch — her test arasında store sıfırlanır. */
export function __resetFollowUpOrchestrationRegistryForTests(): void {
  itemsByCandidateId.clear();
}
