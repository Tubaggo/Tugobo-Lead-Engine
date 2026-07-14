import {
  isActiveConversation,
  sortConversationDecisions,
  type ConversationDecision,
} from "./hermes-autonomous-conversation-runtime.ts";

/**
 * Hermes Conversation Registry (Sprint C4 — Autonomous Conversation).
 *
 * Server-only, in-memory konuşma kararı kayıt defteri — diğer tüm Hermes
 * registry'leriyle (outreach, qualification, demo-scheduling, reply) aynı
 * tradeoff: modül düzeyi store, server restart'ında kaybolur,
 * sınırlandırılmıştır, asla sınırsız büyüyemez.
 *
 * Ne saklar: yalnız SANITIZE edilmiş `ConversationDecision` — durum, öncelik,
 * güvenli cevap önizlemesi, Türkçe founder copy, audit event'leri.
 *
 * Ne SAKLAMAZ (yapısal olarak — `ConversationDecision` bu alanları TAŞIMAZ):
 * ham webhook payload'ı, ham telefon, access token, provider credential,
 * güvenli önizleme dışında ham cevap metni, secret, ham AI/classifier yanıtı.
 *
 * Dedup: provider message id ile UPSERT — aynı cevap yeniden işlenirse
 * (webhook retry) yeni karar eskisinin yerini alır; duplicate kayıt oluşmaz.
 * Ayrıca lead/mission indeksleri tutulur.
 */

const TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 gün
const MAX_STORED_DECISIONS = 500;
const MAX_AUDIT_EVENTS_PER_ITEM = 12;

/** Kayda giren telefon görünümlü diziler son savunma hattı olarak gizlenir. */
function scrubDetail(text: string): string {
  return text
    .replace(/Bearer\s+\S+/gi, "Bearer [gizli]")
    .replace(/(key|token|secret)=\S+/gi, "$1=[gizli]")
    .replace(/\+?\d[\d\s\-()]{8,}\d/g, "[numara gizli]");
}

type StoredConversation = {
  decision: ConversationDecision;
  /** Founder görünümleri için görünen ad — asla telefon/iç payload değil. */
  businessName: string;
  storedAt: number;
};

/** Birincil indeks: provider message id → kayıt (dedupe anahtarı). */
const itemsByProviderMessageId = new Map<string, StoredConversation>();

function cloneDecision(decision: ConversationDecision): ConversationDecision {
  return {
    ...decision,
    auditEvents: decision.auditEvents
      .slice(-MAX_AUDIT_EVENTS_PER_ITEM)
      .map((e) => ({ ...e, detailTr: scrubDetail(e.detailTr) })),
  };
}

function pruneExpired(now: number): void {
  for (const [key, item] of itemsByProviderMessageId) {
    if (now - item.storedAt > TTL_MS) itemsByProviderMessageId.delete(key);
  }
  if (itemsByProviderMessageId.size > MAX_STORED_DECISIONS) {
    const sorted = [...itemsByProviderMessageId.entries()].sort(
      (a, b) => a[1].storedAt - b[1].storedAt,
    );
    for (const [key] of sorted.slice(0, itemsByProviderMessageId.size - MAX_STORED_DECISIONS)) {
      itemsByProviderMessageId.delete(key);
    }
  }
}

export type RecordConversationInput = {
  decision: ConversationDecision;
  businessName: string;
  now?: number;
};

/**
 * Provider message id bazlı upsert. providerMessageIdSafe'siz karar
 * kaydedilmez; önceki kaydın audit geçmişi sınırlı biçimde yeni kayda
 * taşınır. Aynı cevap için (webhook retry) ikinci kayıt oluşmaz.
 */
export function recordConversationDecision(input: RecordConversationInput): boolean {
  const key = input.decision.providerMessageIdSafe;
  if (!key) return false;
  const now = input.now ?? Date.now();
  pruneExpired(now);

  const previous = itemsByProviderMessageId.get(key);
  const next = cloneDecision(input.decision);
  if (previous) {
    next.auditEvents = [...previous.decision.auditEvents, ...next.auditEvents].slice(
      -MAX_AUDIT_EVENTS_PER_ITEM,
    );
  }

  itemsByProviderMessageId.set(key, {
    decision: next,
    businessName: input.businessName?.trim() || "İsimsiz işletme",
    storedAt: now,
  });
  return true;
}

export type StoredConversationView = {
  decision: ConversationDecision;
  businessName: string;
  storedAt: number;
};

function toView(item: StoredConversation): StoredConversationView {
  return {
    decision: cloneDecision(item.decision),
    businessName: item.businessName,
    storedAt: item.storedAt,
  };
}

export function getConversationDecision(id: string): StoredConversationView | null {
  for (const item of itemsByProviderMessageId.values()) {
    if (item.decision.id === id) return toView(item);
  }
  return null;
}

export function getConversationByProviderMessageId(
  providerMessageIdSafe: string,
): StoredConversationView | null {
  const item = itemsByProviderMessageId.get(providerMessageIdSafe);
  return item ? toView(item) : null;
}

/** Bir lead'in en güncel konuşma kararı (varsa). */
export function getConversationByLeadId(leadId: string): StoredConversationView | null {
  let best: StoredConversation | null = null;
  for (const item of itemsByProviderMessageId.values()) {
    if (item.decision.leadId !== leadId) continue;
    if (!best || item.storedAt > best.storedAt) best = item;
  }
  return best ? toView(best) : null;
}

/** Bir mission'ın en güncel konuşma kararı (varsa). */
export function getConversationByMissionId(missionId: string): StoredConversationView | null {
  let best: StoredConversation | null = null;
  for (const item of itemsByProviderMessageId.values()) {
    if (item.decision.missionId !== missionId) continue;
    if (!best || item.storedAt > best.storedAt) best = item;
  }
  return best ? toView(best) : null;
}

/** İş önceliği sırasında (kritik → düşük), yeni önce — asla ekleme sırası değil. */
export function getRecentConversationDecisions(
  limit: number = 50,
  now: number = Date.now(),
): StoredConversationView[] {
  pruneExpired(now);
  const views = [...itemsByProviderMessageId.values()].map(toView);
  const sorted = sortConversationDecisions(views.map((v) => v.decision));
  const byId = new Map(views.map((v) => [v.decision.id, v]));
  return sorted.slice(0, Math.max(0, limit)).map((d) => byId.get(d.id)!);
}

/** Yalnız aktif (kapanmamış, ticari açıdan anlamlı) konuşmalar. */
export function getOpenConversationDecisions(
  limit: number = 50,
  now: number = Date.now(),
): StoredConversationView[] {
  return getRecentConversationDecisions(500, now)
    .filter((v) => isActiveConversation(v.decision))
    .slice(0, Math.max(0, limit));
}

/** İsteğe bağlı manuel temizlik — kaldırılan kayıt sayısını döner. */
export function clearExpiredConversationDecisions(now: number = Date.now()): number {
  const before = itemsByProviderMessageId.size;
  pruneExpired(now);
  return before - itemsByProviderMessageId.size;
}

/** Test-only escape hatch — her test arasında store sıfırlanır. */
export function __resetConversationRegistryForTests(): void {
  itemsByProviderMessageId.clear();
}
