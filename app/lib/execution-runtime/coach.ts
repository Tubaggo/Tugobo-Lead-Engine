import type { ExecutionContext, ExecutionQueueItem, FounderCoachInsight } from "./types";
import { formatMrr } from "@/app/components/v2/adapters/founder-command-center-adapter";

const SEVERITY_RANK: Record<FounderCoachInsight["severity"], number> = {
  critical: 0,
  important: 1,
  normal: 2,
  positive: 3,
};

function names(items: ExecutionQueueItem[], limit = 3): string[] {
  return items.slice(0, limit).map((i) => i.hotelName);
}

function ids(items: ExecutionQueueItem[], limit = 3): string[] {
  return items.slice(0, limit).map((i) => i.leadId);
}

// ── Rule 1 — Focus ────────────────────────────────────────────
// If Tier 1 items exist, that queue is where today's execution must start.

function focusRule(queue: ExecutionQueueItem[]): FounderCoachInsight | null {
  const tier1 = queue.filter((i) => i.tier === "tier-1");
  if (tier1.length === 0) return null;

  const totalValue = tier1.reduce((s, i) => s + i.estimatedValue, 0);

  return {
    id: "focus",
    type: "focus",
    severity: "critical",
    title: "Bugün önce Şimdi Yap kuyruğunu temizle.",
    message: `${tier1.length} kritik iş doğrudan gelir etkisi taşıyor.`,
    evidence: [
      `Tier 1 (Şimdi Yap): ${tier1.length} iş`,
      totalValue > 0 ? `Toplam tahmini değer: ${formatMrr(totalValue)}` : "Tahmini değer verisi yok",
    ],
    relatedLeadIds: ids(tier1),
    relatedLeadNames: names(tier1),
    source: "execution-runtime",
  };
}

// ── Rule 2 — Highest value ────────────────────────────────────
// If one item's value clearly outweighs the rest, name it explicitly so it
// never gets buried under a longer, lower-value tier-1 list.

function highestValueRule(queue: ExecutionQueueItem[]): FounderCoachInsight | null {
  if (queue.length < 2) return null;
  const sorted = [...queue].sort((a, b) => b.estimatedValue - a.estimatedValue);
  const [top, second] = sorted;
  if (top.estimatedValue <= 0) return null;
  if (top.estimatedValue < second.estimatedValue * 1.5) return null;

  return {
    id: "highest-value",
    type: "opportunity",
    severity: "important",
    title: `En yüksek ticari değer ${top.hotelName} üzerinde.`,
    message: "Önceliği düşürme.",
    evidence: [
      `Tahmini değer: ${formatMrr(top.estimatedValue)}`,
      `Sıradaki fırsat: ${formatMrr(second.estimatedValue)}`,
    ],
    relatedLeadIds: [top.leadId],
    relatedLeadNames: [top.hotelName],
    source: "execution-runtime",
  };
}

// ── Rule 3 — Blocker ──────────────────────────────────────────
// Blocked items can't be worked at all until the structural gap is closed —
// surface the most common blocking reason so the founder knows what to fix.

function blockerRule(
  queue: ExecutionQueueItem[],
  contextsByLeadId: Map<string, ExecutionContext>,
): FounderCoachInsight | null {
  const blocked = queue.filter((i) => i.executionState === "blocked");
  if (blocked.length === 0) return null;

  const reasonCounts = new Map<string, number>();
  for (const item of blocked) {
    const ctx = contextsByLeadId.get(item.leadId);
    const label = ctx?.facts.blockers[0]?.label ?? item.topReason;
    reasonCounts.set(label, (reasonCounts.get(label) ?? 0) + 1);
  }
  const topReason = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "engel";

  return {
    id: "blocker",
    type: "blocker",
    severity: "important",
    title: `${blocked.length} fırsat aksiyon alamıyor.`,
    message: `Öncelikli engel: ${topReason}.`,
    evidence: [
      `Engellenmiş fırsat sayısı: ${blocked.length}`,
      `En sık engel: ${topReason}`,
    ],
    relatedLeadIds: ids(blocked),
    relatedLeadNames: names(blocked),
    source: "execution-runtime",
  };
}

// ── Rule 4 — Momentum ─────────────────────────────────────────
// Slowing/stalled leads lose reply likelihood the longer they sit untouched.

function momentumRule(queue: ExecutionQueueItem[]): FounderCoachInsight | null {
  const weak = queue.filter(
    (i) => i.operationalMomentum === "slowing" || i.operationalMomentum === "stalled",
  );
  if (weak.length === 0) return null;

  return {
    id: "momentum",
    type: "momentum",
    severity: weak.length >= 3 ? "important" : "normal",
    title: `${weak.length} lead ivme kaybediyor.`,
    message: "Bugün kısa bir takip mesajı göndermek dönüş ihtimalini korur.",
    evidence: [`Momentum: yavaşlıyor/durdu — ${weak.length} lead`],
    relatedLeadIds: ids(weak),
    relatedLeadNames: names(weak),
    source: "execution-runtime",
  };
}

// ── Rule 5 — Confidence ───────────────────────────────────────
// Low evidence quality means the recommended action itself is on shaky
// ground — verification should come before outreach.

function confidenceRule(queue: ExecutionQueueItem[]): FounderCoachInsight | null {
  const low = queue.filter((i) => i.executionConfidence === "low");
  if (low.length === 0) return null;

  return {
    id: "confidence",
    type: "confidence",
    severity: low.length >= Math.max(3, Math.ceil(queue.length / 2)) ? "important" : "normal",
    title: `${low.length} öneride kanıt güveni düşük.`,
    message: "Önce iletişim/veri doğrulaması yapılmalı.",
    evidence: [`Kanıt Güveni: düşük — ${low.length} fırsat`],
    relatedLeadIds: ids(low),
    relatedLeadNames: names(low),
    source: "execution-runtime",
  };
}

// ── Rule 8 — Mixed risk/opportunity ───────────────────────────
// The most dangerous combination: an important-looking deal resting on weak
// evidence. Rushing outreach here risks acting on a wrong assumption.

function mixedRiskConfidenceRule(queue: ExecutionQueueItem[]): FounderCoachInsight | null {
  const overlap = queue.filter(
    (i) =>
      (i.priority === "CRITICAL" || i.priority === "URGENT" || i.priority === "HIGH") &&
      i.executionConfidence === "low",
  );
  if (overlap.length === 0) return null;

  return {
    id: "mixed-risk-confidence",
    type: "warning",
    severity: "critical",
    title: `${overlap.length} yüksek öncelikli fırsatta kanıt güveni düşük.`,
    message: "Önce veri doğrulaması yap, sonra outreach yap.",
    evidence: [`Yüksek öncelik + düşük kanıt güveni: ${overlap.length} fırsat`],
    relatedLeadIds: ids(overlap),
    relatedLeadNames: names(overlap),
    source: "execution-runtime",
  };
}

// ── Rule 6/7 — Positive progress / completion ─────────────────
// Exactly one of these can ever fire: completion when the queue is empty,
// light-load guidance when it's small and nothing urgent remains.

function positiveOrCompletionRule(queue: ExecutionQueueItem[]): FounderCoachInsight | null {
  if (queue.length === 0) {
    return {
      id: "completion",
      type: "progress",
      severity: "positive",
      title: "Bugünün operasyon kuyruğu temiz.",
      message: "Yeni fırsat keşfi veya stratejik analiz için zaman ayırabilirsin.",
      evidence: ["Görünür kuyrukta 0 iş"],
      relatedLeadIds: [],
      relatedLeadNames: [],
      source: "execution-runtime",
    };
  }

  const tier1Count = queue.filter((i) => i.tier === "tier-1").length;
  if (queue.length <= 5 && tier1Count === 0) {
    return {
      id: "positive-progress",
      type: "progress",
      severity: "positive",
      title: "Bugünün operasyon kuyruğu hafif.",
      message: "Vakit kalırsa yeni fırsat keşfine odaklan.",
      evidence: [`Toplam ${queue.length} iş, kritik iş yok`],
      relatedLeadIds: [],
      relatedLeadNames: [],
      source: "execution-runtime",
    };
  }

  return null;
}

/**
 * Founder Coach — a deterministic, explainable coaching layer over the same
 * ExecutionContext[]/ExecutionQueueItem[] the queue itself is built from.
 * No LLM, no free-form prose, no new business logic: every insight only
 * counts, compares, or thresholds fields that already exist on the runtime
 * output. Never rebuilds contexts — always consumes what's passed in.
 *
 * Output is capped (max 3 primary insights, ordered critical > important >
 * normal, plus at most one positive/summary insight) so it reads as a short
 * daily briefing, not a report.
 */
export function buildFounderCoachInsights(
  contexts: ExecutionContext[],
  queue: ExecutionQueueItem[],
): FounderCoachInsight[] {
  const contextsByLeadId = new Map(contexts.map((c) => [c.leadId, c]));

  const primaryCandidates = [
    mixedRiskConfidenceRule(queue),
    focusRule(queue),
    blockerRule(queue, contextsByLeadId),
    momentumRule(queue),
    confidenceRule(queue),
    highestValueRule(queue),
  ].filter((i): i is FounderCoachInsight => i !== null);

  const primary = [...primaryCandidates]
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, 3);

  const summary = positiveOrCompletionRule(queue);

  return summary ? [...primary, summary] : primary;
}
