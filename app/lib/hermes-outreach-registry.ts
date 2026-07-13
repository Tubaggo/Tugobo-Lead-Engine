import type { AutonomousOutreachDecision } from "./hermes-autonomous-outreach-runtime.ts";

/**
 * Hermes Outreach Registry (Sprint C3 — Autonomous Outreach).
 *
 * Server-only, in-memory hazırlık kayıt defteri — diğer tüm Hermes
 * registry'leriyle (acquisition run, qualification, demo-scheduling, reply)
 * aynı tradeoff: modül düzeyi store, server restart'ında kaybolur,
 * sınırlandırılmıştır, asla sınırsız büyüyemez.
 *
 * Ne saklar: yalnız SANITIZE edilmiş `AutonomousOutreachDecision` — durum,
 * önerilen kanal/template/ton/dil, founder-güvenli personalization etiketleri,
 * Türkçe founder copy, audit event'leri.
 *
 * Ne SAKLAMAZ (yapısal olarak — AutonomousOutreachDecision bu alanları
 * TAŞIMAZ): ham mesaj metni, API key, secret, provider payload'ı, telefon
 * numarası. `recommendedTemplate` yalnız bir template ANAHTARIDIR, metin
 * değildir; personalization etiketleri founder-güvenli cümlelerdir.
 *
 * Dedup: lead bazlı UPSERT — aynı lead yeniden hazırlanırsa yeni karar
 * eskisinin yerini alır; duplicate kayıt oluşmaz.
 */

const TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 gün
const MAX_STORED_RESULTS = 500;
const MAX_AUDIT_EVENTS_PER_ITEM = 12;

/** Registry'ye giren telefon görünümlü diziler son savunma hattı olarak gizlenir. */
function scrubDetail(text: string): string {
  return text
    .replace(/Bearer\s+\S+/gi, "Bearer [gizli]")
    .replace(/(key|token|secret)=\S+/gi, "$1=[gizli]")
    .replace(/\+?\d[\d\s\-()]{8,}\d/g, "[numara gizli]");
}

type StoredOutreach = {
  decision: AutonomousOutreachDecision;
  /** Founder görünümleri için görünen ad — asla telefon/iç payload değil. */
  businessName: string;
  storedAt: number;
};

const itemsByLeadId = new Map<string, StoredOutreach>();

function cloneDecision(decision: AutonomousOutreachDecision): AutonomousOutreachDecision {
  return {
    ...decision,
    personalizationSignals: decision.personalizationSignals.map((s) => ({ ...s })),
    auditEvents: decision.auditEvents.map((e) => ({ ...e, detailTr: scrubDetail(e.detailTr) })),
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

export type RecordOutreachInput = {
  decision: AutonomousOutreachDecision;
  businessName: string;
  now?: number;
};

/**
 * Lead bazlı upsert. leadId'siz karar kaydedilmez (bloklu kararlar zaten
 * hazırlık çıktısında raporlanır); önceki kaydın audit geçmişi sınırlı
 * biçimde yeni kayda taşınır.
 */
export function recordOutreachDecision(input: RecordOutreachInput): boolean {
  const leadId = input.decision.leadId;
  if (!leadId) return false;
  const now = input.now ?? Date.now();
  pruneExpired(now);

  const previous = itemsByLeadId.get(leadId);
  const next = cloneDecision(input.decision);
  if (previous) {
    next.auditEvents = [...previous.decision.auditEvents, ...next.auditEvents].slice(
      -MAX_AUDIT_EVENTS_PER_ITEM,
    );
  } else {
    next.auditEvents = next.auditEvents.slice(-MAX_AUDIT_EVENTS_PER_ITEM);
  }

  itemsByLeadId.set(leadId, {
    decision: next,
    businessName: input.businessName?.trim() || "İsimsiz işletme",
    storedAt: now,
  });
  return true;
}

export type StoredOutreachView = {
  decision: AutonomousOutreachDecision;
  businessName: string;
  storedAt: number;
};

function toView(item: StoredOutreach): StoredOutreachView {
  return {
    decision: cloneDecision(item.decision),
    businessName: item.businessName,
    storedAt: item.storedAt,
  };
}

export function getOutreachByLeadId(leadId: string): StoredOutreachView | null {
  const item = itemsByLeadId.get(leadId);
  return item ? toView(item) : null;
}

export function getRecentOutreachDecisions(
  limit: number = 50,
  now: number = Date.now(),
): StoredOutreachView[] {
  pruneExpired(now);
  return [...itemsByLeadId.values()]
    .sort((a, b) => b.storedAt - a.storedAt)
    .slice(0, Math.max(0, limit))
    .map(toView);
}

export function getOutreachDecisionsByRun(
  runId: string,
  now: number = Date.now(),
): StoredOutreachView[] {
  pruneExpired(now);
  return [...itemsByLeadId.values()]
    .filter((i) => i.decision.acquisitionRunId === runId)
    .sort((a, b) => b.storedAt - a.storedAt)
    .map(toView);
}

/** İsteğe bağlı manuel temizlik — kaldırılan kayıt sayısını döner. */
export function clearExpiredOutreachDecisions(now: number = Date.now()): number {
  const before = itemsByLeadId.size;
  pruneExpired(now);
  return before - itemsByLeadId.size;
}

/** Test-only escape hatch — her test arasında store sıfırlanır. */
export function __resetOutreachRegistryForTests(): void {
  itemsByLeadId.clear();
}
