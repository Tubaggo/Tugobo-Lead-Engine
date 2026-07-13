import type { QualificationResult } from "./hermes-autonomous-qualification-runtime.ts";

/**
 * Hermes Qualification Registry (Sprint C2 — Scope 5).
 *
 * Server-only, in-memory qualification kayıt defteri — diğer tüm Hermes
 * registry'leriyle (acquisition run registry, demo-scheduling, reply)
 * aynı tradeoff: modül düzeyi store, server restart'ında kaybolur,
 * sınırlandırılmıştır, asla sınırsız büyüyemez.
 *
 * Ne saklar: yalnız sanitize edilmiş `QualificationResult` — skor
 * snapshot'ları, reason kodları, Türkçe founder copy, audit event'leri.
 *
 * Ne SAKLAMAZ (yapısal olarak — QualificationResult bu alanları taşımaz):
 * ham telefon, API key, secret, provider payload'ı, website HTML'i,
 * AI cevabı.
 *
 * Dedup: lead bazlı upsert — aynı lead yeniden değerlendirilirse yeni sonuç
 * eskisinin yerini alır; audit geçmişi sınırlı tutulur (son
 * MAX_AUDIT_EVENTS_PER_ITEM event), duplicate kayıt oluşmaz.
 */

const TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 gün
const MAX_STORED_RESULTS = 500;
const MAX_AUDIT_EVENTS_PER_ITEM = 12;

type StoredQualification = {
  result: QualificationResult;
  /** Founder görünümleri için görünen ad — asla telefon/iç payload değil. */
  businessName: string;
  storedAt: number;
};

const itemsByLeadId = new Map<string, StoredQualification>();

function cloneResult(result: QualificationResult): QualificationResult {
  return {
    ...result,
    scoreSnapshot: { ...result.scoreSnapshot },
    positiveReasons: [...result.positiveReasons],
    cautionReasons: [...result.cautionReasons],
    blockingReasons: [...result.blockingReasons],
    auditEvents: result.auditEvents.map((e) => ({
      ...e,
      reasonCodes: [...e.reasonCodes],
      scoreSnapshot: e.scoreSnapshot ? { ...e.scoreSnapshot } : null,
    })),
  };
}

function pruneExpired(now: number): void {
  for (const [leadId, item] of itemsByLeadId) {
    if (now - item.storedAt > TTL_MS) itemsByLeadId.delete(leadId);
  }
  if (itemsByLeadId.size > MAX_STORED_RESULTS) {
    const sorted = [...itemsByLeadId.entries()].sort((a, b) => a[1].storedAt - b[1].storedAt);
    for (const [leadId] of sorted.slice(0, itemsByLeadId.size - MAX_STORED_RESULTS)) {
      itemsByLeadId.delete(leadId);
    }
  }
}

export type RecordQualificationInput = {
  result: QualificationResult;
  businessName: string;
  now?: number;
};

/**
 * Lead bazlı upsert. leadId'siz sonuç kaydedilmez (bloklu sonuçlar zaten
 * değerlendirme çıktısında raporlanır); önceki kaydın audit geçmişi sınırlı
 * biçimde yeni kayda taşınır.
 */
export function recordQualificationResult(input: RecordQualificationInput): boolean {
  const leadId = input.result.leadId;
  if (!leadId) return false;
  const now = input.now ?? Date.now();
  pruneExpired(now);

  const previous = itemsByLeadId.get(leadId);
  const next = cloneResult(input.result);
  if (previous) {
    next.auditEvents = [...previous.result.auditEvents, ...next.auditEvents].slice(
      -MAX_AUDIT_EVENTS_PER_ITEM,
    );
  } else {
    next.auditEvents = next.auditEvents.slice(-MAX_AUDIT_EVENTS_PER_ITEM);
  }

  itemsByLeadId.set(leadId, {
    result: next,
    businessName: input.businessName?.trim() || "İsimsiz işletme",
    storedAt: now,
  });
  return true;
}

export type StoredQualificationView = {
  result: QualificationResult;
  businessName: string;
  storedAt: number;
};

function toView(item: StoredQualification): StoredQualificationView {
  return {
    result: cloneResult(item.result),
    businessName: item.businessName,
    storedAt: item.storedAt,
  };
}

export function getQualificationResult(id: string): StoredQualificationView | null {
  for (const item of itemsByLeadId.values()) {
    if (item.result.id === id) return toView(item);
  }
  return null;
}

export function getQualificationByLeadId(leadId: string): StoredQualificationView | null {
  const item = itemsByLeadId.get(leadId);
  return item ? toView(item) : null;
}

export function getRecentQualificationResults(
  limit: number = 50,
  now: number = Date.now(),
): StoredQualificationView[] {
  pruneExpired(now);
  return [...itemsByLeadId.values()]
    .sort((a, b) => b.storedAt - a.storedAt)
    .slice(0, Math.max(0, limit))
    .map(toView);
}

export function getQualificationResultsByRun(
  runId: string,
  now: number = Date.now(),
): StoredQualificationView[] {
  pruneExpired(now);
  return [...itemsByLeadId.values()]
    .filter((i) => i.result.acquisitionRunId === runId)
    .sort((a, b) => b.storedAt - a.storedAt)
    .map(toView);
}

/** İsteğe bağlı manuel temizlik — kaldırılan kayıt sayısını döner. */
export function clearExpiredQualificationResults(now: number = Date.now()): number {
  const before = itemsByLeadId.size;
  pruneExpired(now);
  return before - itemsByLeadId.size;
}

/** Test-only escape hatch — her test arasında store sıfırlanır. */
export function __resetQualificationRegistryForTests(): void {
  itemsByLeadId.clear();
}
