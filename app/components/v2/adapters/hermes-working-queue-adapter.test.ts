import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeFounderWorkingQueue,
  isDirectMutationDecisionType,
  summarizeFounderWorkingQueue,
  type ComputeFounderWorkingQueueInput,
  type WorkingQueueLeadLike,
} from "./hermes-working-queue-adapter.ts";
import type { HermesDecisionItem, HermesDecisionType } from "./hermes-decision-queue-adapter.ts";

const NOW = new Date(2026, 6, 15, 12, 0, 0).getTime(); // 15 Temmuz 2026, öğlen
const TODAY_EARLY = new Date(2026, 6, 15, 3, 0, 0).getTime();
const YESTERDAY = new Date(2026, 6, 14, 12, 0, 0).getTime();

function buildLead(overrides: Partial<WorkingQueueLeadLike> = {}): WorkingQueueLeadLike {
  return {
    id: "lead-1",
    name: "Test Otel",
    phone: "+90 555 000 0000",
    website: "testotel.com",
    leadScore: 80,
    verifiedOpportunityScore: 85,
    ...overrides,
  };
}

function buildDecisionItem(overrides: Partial<HermesDecisionItem> = {}): HermesDecisionItem {
  return {
    id: "decision:mission:lead-2:approval",
    missionId: "mission:lead-2",
    leadId: "lead-2",
    title: "Karar Gereken Otel",
    decisionType: "approve_message",
    priority: "high",
    statusLabel: "Onay Bekliyor",
    whatHappened: "Hermes bir mesaj taslağı hazırladı.",
    whyItMatters: "Onaylanmazsa mesaj gönderilmez.",
    hermesRecommendation: "Mesajı gözden geçir.",
    founderDecisionLabel: "Mesajı onayla ya da reddet.",
    primaryActionLabel: "Onayla",
    secondaryActionLabel: "Reddet",
    lastActivityAt: NOW - 1000,
    sourceStage: "approval_required",
    mapped: true,
    confidence: null,
    urgency: null,
    ...overrides,
  };
}

function buildInput(overrides: Partial<ComputeFounderWorkingQueueInput> = {}): ComputeFounderWorkingQueueInput {
  return { decisionItems: [], leads: [], now: NOW, ...overrides };
}

/* ── 1. Fresh qualified opportunity appears ────────────────────────── */

test("a fresh, qualified lead (first seen today, not set-aside) appears as a fresh_opportunity item", () => {
  const lead = buildLead({ id: "fresh-1", firstImportedAt: TODAY_EARLY, phone: "+90 555 111 2233" });
  const items = computeFounderWorkingQueue(buildInput({ leads: [lead] }));
  assert.equal(items.length, 1);
  assert.equal(items[0]!.kind, "fresh_opportunity");
  assert.equal(items[0]!.isNew, true);
  assert.equal(items[0]!.leadId, "fresh-1");
});

/* ── 2. Old inactive lead does not appear ──────────────────────────── */

test("an old lead with no decision and no freshness does not appear at all", () => {
  const oldLead = buildLead({ id: "old-1", firstImportedAt: YESTERDAY });
  const items = computeFounderWorkingQueue(buildInput({ leads: [oldLead] }));
  assert.equal(items.length, 0);
});

test("a seed/demo lead (no firstImportedAt, no createdAt) never appears, even with a strong score", () => {
  const seedLead = buildLead({ id: "seed-1", firstImportedAt: undefined, createdAt: undefined, verifiedOpportunityScore: 99 });
  const items = computeFounderWorkingQueue(buildInput({ leads: [seedLead] }));
  assert.equal(items.length, 0);
});

/* ── 3/4/5/6. Old lead with new development / approval / failed ──────── */

test("an old lead with a pending founder decision appears via the decision item, regardless of lead freshness", () => {
  const decision = buildDecisionItem({ leadId: "old-with-decision" });
  const items = computeFounderWorkingQueue(buildInput({ decisionItems: [decision] }));
  assert.equal(items.length, 1);
  assert.equal(items[0]!.kind, "decision");
  assert.equal(items[0]!.isNew, false);
});

test("failed/blocked decision item is preserved with its own priority — computeFounderWorkingQueue never re-ranks decisions", () => {
  const failed = buildDecisionItem({
    id: "decision:mission:failed-1:failed",
    leadId: "failed-1",
    decisionType: "resolve_failed_delivery",
    priority: "critical",
  });
  const approval = buildDecisionItem({ id: "decision:mission:lead-2:approval", leadId: "lead-2", priority: "high" });
  // computeHermesDecisionQueue already sorts critical before high — this
  // module trusts that order and must not reshuffle it.
  const items = computeFounderWorkingQueue(buildInput({ decisionItems: [failed, approval] }));
  assert.deepEqual(items.map((i) => i.leadId), ["failed-1", "lead-2"]);
});

/* ── 7. Duplicate lead is not shown as a new opportunity ──────────────── */

test("a lead that already has a decision item is never also shown as a fresh opportunity (one business, one row)", () => {
  const decision = buildDecisionItem({ leadId: "dup-1" });
  const freshLookingLead = buildLead({ id: "dup-1", firstImportedAt: TODAY_EARLY });
  const items = computeFounderWorkingQueue(buildInput({ decisionItems: [decision], leads: [freshLookingLead] }));
  assert.equal(items.length, 1);
  assert.equal(items[0]!.kind, "decision");
});

test("a lead first imported earlier (even if later updated) is not shown as fresh — firstImportedAt is the freshness key, never a later touch", () => {
  const lead = buildLead({ id: "updated-1", firstImportedAt: YESTERDAY });
  const items = computeFounderWorkingQueue(buildInput({ leads: [lead] }));
  assert.equal(items.length, 0);
});

/* ── 9. Queue order follows the canonical action priority, fresh last ── */

test("queue order: every decision item first (their own existing order), fresh opportunities appended after", () => {
  const decision = buildDecisionItem({ leadId: "decided-1" });
  const fresh = buildLead({ id: "fresh-1", firstImportedAt: TODAY_EARLY });
  const items = computeFounderWorkingQueue(buildInput({ decisionItems: [decision], leads: [fresh] }));
  assert.deepEqual(items.map((i) => i.kind), ["decision", "fresh_opportunity"]);
});

test("fresh opportunities set aside by Hermes ('waiting'/no channel) never enter the queue", () => {
  const noChannelLead = buildLead({ id: "no-channel-1", firstImportedAt: TODAY_EARLY, phone: undefined, website: undefined });
  const items = computeFounderWorkingQueue(buildInput({ leads: [noChannelLead] }));
  assert.equal(items.length, 0);
});

/* ── 10. Queue counters remain consistent with the authoritative source ── */

test("summarizeFounderWorkingQueue counts match the item array exactly", () => {
  const decision = buildDecisionItem({ leadId: "decided-1" });
  const fresh = buildLead({ id: "fresh-1", firstImportedAt: TODAY_EARLY });
  const items = computeFounderWorkingQueue(buildInput({ decisionItems: [decision], leads: [fresh] }));
  const summary = summarizeFounderWorkingQueue(items);
  assert.equal(summary.total, items.length);
  assert.equal(summary.decisionCount, items.filter((i) => i.kind === "decision").length);
  assert.equal(summary.freshOpportunityCount, items.filter((i) => i.kind === "fresh_opportunity").length);
  assert.equal(summary.total, 2);
  assert.equal(summary.decisionCount, 1);
  assert.equal(summary.freshOpportunityCount, 1);
});

/* ── isHermesWorking ────────────────────────────────────────────────── */

test("isHermesWorking is true only when the decision's own mission is in the runningMissionIds set", () => {
  const decision = buildDecisionItem({ missionId: "mission:running-1", leadId: "lead-running" });
  const runningItems = computeFounderWorkingQueue(
    buildInput({ decisionItems: [decision], runningMissionIds: new Set(["mission:running-1"]) }),
  );
  assert.equal(runningItems[0]!.isHermesWorking, true);

  const idleItems = computeFounderWorkingQueue(buildInput({ decisionItems: [decision] }));
  assert.equal(idleItems[0]!.isHermesWorking, false);
});

test("a fresh opportunity resolves its missionId from the missions array, so its card can open the Deal Workspace", () => {
  const lead = buildLead({ id: "fresh-1", firstImportedAt: TODAY_EARLY });
  const items = computeFounderWorkingQueue(
    buildInput({ leads: [lead], missions: [{ missionId: "mission:fresh-1", leadId: "fresh-1" }] }),
  );
  assert.equal(items[0]!.missionId, "mission:fresh-1");
});

/* ── TUGOBO Need-Based Acquisition Engine — Working Queue gate ────────── */

test("#31 a fresh lead with confirmed-low digital need never enters the Working Queue", () => {
  const lowNeedLead = buildLead({
    id: "low-need-1",
    firstImportedAt: TODAY_EARLY,
    verifiedOpportunityScore: undefined,
    leadScore: undefined,
    signalVerification: {
      whatsappVerification: "not_found",
      websiteVerification: "not_found",
      instagramVerification: "not_found",
      reservationSignal: "not_found",
    },
    hasInstagram: false,
    reviewsCount: 3,
  } as Partial<WorkingQueueLeadLike>);
  const items = computeFounderWorkingQueue(buildInput({ leads: [lowNeedLead] }));
  assert.equal(items.length, 0);
});

test("#32 insufficient-evidence leads still enter the queue — Hermes hasn't ruled them out", () => {
  // attentionLevel needs a website + a contact path to pass the pre-existing
  // gate at all; beyond that, nothing else is set, so the need assessment
  // has too little coverage to judge — it must not be silently eliminated.
  const thinDataLead = buildLead({
    id: "thin-data-1",
    firstImportedAt: TODAY_EARLY,
    verifiedOpportunityScore: undefined,
    leadScore: undefined,
  } as Partial<WorkingQueueLeadLike>);
  const items = computeFounderWorkingQueue(buildInput({ leads: [thinDataLead] }));
  assert.equal(items.length, 1);
  assert.equal(items[0]!.tugoboNeed?.level, "insufficient_evidence");
});

test("#36 the founder-facing whyInQueue text explains real need evidence, not just a status sentence", () => {
  const strongLead = buildLead({
    id: "strong-1",
    firstImportedAt: TODAY_EARLY,
    hasInstagram: true,
    signalVerification: { whatsappVerification: "verified" },
  });
  const items = computeFounderWorkingQueue(buildInput({ leads: [strongLead] }));
  assert.equal(items.length, 1);
  assert.ok(items[0]!.whyInQueue.includes("temel nedeni"));
  assert.ok(items[0]!.tugoboNeed !== null);
});

test("#37 geography-only explanation never appears — city is sourcing context, not the stated reason", () => {
  const lead = buildLead({
    id: "geo-1",
    firstImportedAt: TODAY_EARLY,
    hasInstagram: true,
    website: "otel.com",
    city: "Antalya",
  } as Partial<WorkingQueueLeadLike>);
  const items = computeFounderWorkingQueue(buildInput({ leads: [lead] }));
  assert.equal(items.length, 1);
  assert.ok(!/^Antalya'da olduğu için/.test(items[0]!.whyInQueue));
});

test("decision items always carry tugoboNeed: null — the need gate only ever applies to fresh opportunities", () => {
  const decision = buildDecisionItem({ leadId: "decided-1" });
  const items = computeFounderWorkingQueue(buildInput({ decisionItems: [decision] }));
  assert.equal(items[0]!.tugoboNeed, null);
});

/* ── Empty state ───────────────────────────────────────────────────── */

test("no decisions and no fresh opportunities produces an empty queue, not a fallback list", () => {
  const items = computeFounderWorkingQueue(buildInput());
  assert.deepEqual(items, []);
});

/* ── Founder Mode Deal Workspace fix — isDirectMutationDecisionType ───── */

test("isDirectMutationDecisionType flags only approve_message as a direct-mutation decision", () => {
  assert.equal(isDirectMutationDecisionType("approve_message"), true);
  const others: HermesDecisionType[] = [
    "review_hot_reply",
    "plan_demo",
    "decide_follow_up",
    "mark_outcome",
    "resolve_failed_delivery",
    "review_unknown",
    "review_qualification",
  ];
  for (const decisionType of others) {
    assert.equal(isDirectMutationDecisionType(decisionType), false, decisionType);
  }
  assert.equal(isDirectMutationDecisionType(null), false);
  assert.equal(isDirectMutationDecisionType(undefined), false);
});

test("an approve_message working queue item still carries its real Onayla/Reddet labels — the fix is in how the queue renders/routes them, not in the underlying decision data", () => {
  const decision = buildDecisionItem({ leadId: "lead-2" });
  const items = computeFounderWorkingQueue(buildInput({ decisionItems: [decision] }));
  assert.equal(items[0]!.sourceDecisionItem?.decisionType, "approve_message");
  assert.equal(items[0]!.primaryActionLabel, "Onayla");
  assert.equal(items[0]!.secondaryActionLabel, "Reddet");
  assert.equal(isDirectMutationDecisionType(items[0]!.sourceDecisionItem?.decisionType), true);
});

/* ── Strict Target Market Allowlist & Active Queue Cleanup ────────────── */

function strongNeedOverrides(): Partial<WorkingQueueLeadLike> {
  return {
    hasInstagram: true,
    signalVerification: { whatsappVerification: "verified" },
  };
}

test("#27 an existing İstanbul fresh opportunity disappears once restricted to the target market", () => {
  const istanbulLead = buildLead({
    id: "ist-010",
    firstImportedAt: TODAY_EARLY,
    city: "İstanbul",
    ...strongNeedOverrides(),
  });
  const items = computeFounderWorkingQueue(
    buildInput({ leads: [istanbulLead], restrictToTargetMarket: true }),
  );
  assert.equal(items.length, 0);
});

test("#28 an existing İstanbul approval-mission decision item disappears once restricted", () => {
  const istanbulLead = buildLead({ id: "ist-010", city: "İstanbul" });
  const decision = buildDecisionItem({ leadId: "ist-010" });
  const items = computeFounderWorkingQueue(
    buildInput({ decisionItems: [decision], leads: [istanbulLead], restrictToTargetMarket: true }),
  );
  assert.equal(items.length, 0);
});

test("#29 an out-of-scope decision item is excluded from summarizeFounderWorkingQueue's counts", () => {
  const istanbulLead = buildLead({ id: "ist-010", city: "İstanbul" });
  const decision = buildDecisionItem({ leadId: "ist-010" });
  const items = computeFounderWorkingQueue(
    buildInput({ decisionItems: [decision], leads: [istanbulLead], restrictToTargetMarket: true }),
  );
  const summary = summarizeFounderWorkingQueue(items);
  assert.equal(summary.total, 0);
  assert.equal(summary.decisionCount, 0);
});

test("#30 an Antalya item with strong need evidence appears when restricted", () => {
  const antalyaLead = buildLead({
    id: "antalya-1",
    firstImportedAt: TODAY_EARLY,
    city: "Antalya",
    ...strongNeedOverrides(),
  });
  const items = computeFounderWorkingQueue(
    buildInput({ leads: [antalyaLead], restrictToTargetMarket: true }),
  );
  assert.equal(items.length, 1);
  assert.equal(items[0]!.leadId, "antalya-1");
});

test("#31 an Antalya item with low need evidence still never becomes an automatic opportunity", () => {
  const weakAntalyaLead = buildLead({
    id: "antalya-2",
    firstImportedAt: TODAY_EARLY,
    city: "Antalya",
    verifiedOpportunityScore: undefined,
    leadScore: undefined,
    signalVerification: {
      whatsappVerification: "not_found",
      websiteVerification: "not_found",
      instagramVerification: "not_found",
      reservationSignal: "not_found",
    },
    hasInstagram: false,
    reviewsCount: 3,
  } as Partial<WorkingQueueLeadLike>);
  const items = computeFounderWorkingQueue(
    buildInput({ leads: [weakAntalyaLead], restrictToTargetMarket: true }),
  );
  assert.equal(items.length, 0);
});

test("#32 an unknown-market lead is excluded from the active queue but the call never fails or fabricates anything", () => {
  const unknownLead = buildLead({
    id: "unknown-1",
    firstImportedAt: TODAY_EARLY,
    city: "Nowhereville",
    ...strongNeedOverrides(),
  });
  const items = computeFounderWorkingQueue(
    buildInput({ leads: [unknownLead], restrictToTargetMarket: true }),
  );
  assert.equal(items.length, 0);
});

test("#33 the target-market filter applies to decision-kind items, not only fresh opportunities", () => {
  const antalyaLead = buildLead({ id: "antalya-3", city: "Antalya" });
  const istanbulLead = buildLead({ id: "ist-011", city: "İstanbul" });
  const decisions = [
    buildDecisionItem({ id: "d1", leadId: "antalya-3" }),
    buildDecisionItem({ id: "d2", leadId: "ist-011" }),
  ];
  const items = computeFounderWorkingQueue(
    buildInput({ decisionItems: decisions, leads: [antalyaLead, istanbulLead], restrictToTargetMarket: true }),
  );
  assert.deepEqual(items.map((i) => i.leadId), ["antalya-3"]);
});

test("#34 an orphan decision item (leadId with no matching lead) never crashes and is excluded when restricted", () => {
  const decision = buildDecisionItem({ leadId: "ghost-lead" });
  assert.doesNotThrow(() => {
    const items = computeFounderWorkingQueue(
      buildInput({ decisionItems: [decision], leads: [], restrictToTargetMarket: true }),
    );
    assert.equal(items.length, 0);
  });
});

test("a decision item with no leadId at all is never hidden by market filtering (no geography concept applies)", () => {
  const decision = buildDecisionItem({ leadId: null });
  const items = computeFounderWorkingQueue(
    buildInput({ decisionItems: [decision], restrictToTargetMarket: true }),
  );
  assert.equal(items.length, 1);
});

test("#37/38 turkey/custom scope (restrictToTargetMarket omitted) keeps the existing broad behavior — İstanbul still appears", () => {
  const istanbulLead = buildLead({
    id: "ist-012",
    firstImportedAt: TODAY_EARLY,
    city: "İstanbul",
    ...strongNeedOverrides(),
  });
  const items = computeFounderWorkingQueue(buildInput({ leads: [istanbulLead] }));
  assert.equal(items.length, 1);
  assert.equal(items[0]!.leadId, "ist-012");
});

test("the two-gate founder sentence separates market fit from need evidence when restricted", () => {
  const antalyaLead = buildLead({
    id: "antalya-4",
    firstImportedAt: TODAY_EARLY,
    city: "Antalya",
    ...strongNeedOverrides(),
  });
  const items = computeFounderWorkingQueue(
    buildInput({ leads: [antalyaLead], restrictToTargetMarket: true }),
  );
  assert.equal(items.length, 1);
  assert.ok(items[0]!.whyInQueue.startsWith("Pazar uygunluğu:"));
  assert.ok(items[0]!.whyInQueue.includes("TUGOBO ihtiyacı:"));
  assert.ok(!items[0]!.whyInQueue.match(/^Antalya'da olduğu için/));
});

/* ── Target Market Cluster Coverage Fix — Uçhisar restoration / İstanbul isolation ── */

test("#39 a real Uçhisar (Kapadokya) opportunity with strong need evidence appears when restricted", () => {
  const uchisarLead = buildLead({
    id: "nev-028",
    firstImportedAt: TODAY_EARLY,
    city: "Uçhisar",
    hasInstagram: true,
    signalVerification: { whatsappVerification: "verified" },
  } as Partial<WorkingQueueLeadLike>);
  const items = computeFounderWorkingQueue(buildInput({ leads: [uchisarLead], restrictToTargetMarket: true }));
  assert.equal(items.length, 1);
  assert.equal(items[0]!.leadId, "nev-028");
  assert.ok(items[0]!.whyInQueue.includes("Kapadokya"));
});

test("#40 an Uçhisar approval-mission decision item is included in the pending count once restricted", () => {
  const uchisarLead = buildLead({ id: "nev-028", city: "Uçhisar" });
  const decision = buildDecisionItem({ leadId: "nev-028" });
  const items = computeFounderWorkingQueue(
    buildInput({ decisionItems: [decision], leads: [uchisarLead], restrictToTargetMarket: true }),
  );
  assert.equal(items.length, 1);
  const summary = summarizeFounderWorkingQueue(items);
  assert.equal(summary.decisionCount, 1);
});

test("#42/43 an İstanbul mission still never appears and never counts, even after the cluster fix", () => {
  const istanbulLead = buildLead({ id: "ist-010", city: "İstanbul" });
  const decision = buildDecisionItem({ leadId: "ist-010" });
  const items = computeFounderWorkingQueue(
    buildInput({ decisionItems: [decision], leads: [istanbulLead], restrictToTargetMarket: true }),
  );
  assert.equal(items.length, 0);
  assert.equal(summarizeFounderWorkingQueue(items).decisionCount, 0);
});

test("#45 an unknown-market lead is excluded from the active queue without any deletion happening (nothing to delete — read-only adapter)", () => {
  const unknownLead = buildLead({
    id: "unknown-2",
    firstImportedAt: TODAY_EARLY,
    city: "Nowhereville",
    hasInstagram: true,
    signalVerification: { whatsappVerification: "verified" },
  } as Partial<WorkingQueueLeadLike>);
  const items = computeFounderWorkingQueue(buildInput({ leads: [unknownLead], restrictToTargetMarket: true }));
  assert.equal(items.length, 0);
});

test("#46 a target-market business with low need evidence still never becomes an automatic opportunity", () => {
  const lowNeedUchisar = buildLead({
    id: "nev-029",
    firstImportedAt: TODAY_EARLY,
    city: "Uçhisar",
    verifiedOpportunityScore: undefined,
    leadScore: undefined,
    signalVerification: {
      whatsappVerification: "not_found",
      websiteVerification: "not_found",
      instagramVerification: "not_found",
      reservationSignal: "not_found",
    },
    hasInstagram: false,
    reviewsCount: 2,
  } as Partial<WorkingQueueLeadLike>);
  const items = computeFounderWorkingQueue(buildInput({ leads: [lowNeedUchisar], restrictToTargetMarket: true }));
  assert.equal(items.length, 0);
});

test("#47 an out-of-scope business with strong need evidence still never enters the active queue", () => {
  const highNeedIstanbul = buildLead({
    id: "ist-011",
    firstImportedAt: TODAY_EARLY,
    city: "İstanbul",
    hasInstagram: true,
    reviewsCount: 200,
    verifiedOpportunityScore: 95,
    signalVerification: { whatsappVerification: "verified", websiteVerification: "verified" },
  } as Partial<WorkingQueueLeadLike>);
  const items = computeFounderWorkingQueue(buildInput({ leads: [highNeedIstanbul], restrictToTargetMarket: true }));
  assert.equal(items.length, 0);
});

test("#48/49 turkey/custom scope (restrictToTargetMarket omitted) preserves broad behavior for both İstanbul and Uçhisar", () => {
  const istanbulLead = buildLead({ id: "ist-012", firstImportedAt: TODAY_EARLY, city: "İstanbul", hasInstagram: true, signalVerification: { whatsappVerification: "verified" } });
  const uchisarLead = buildLead({ id: "nev-030", firstImportedAt: TODAY_EARLY, city: "Uçhisar", hasInstagram: true, signalVerification: { whatsappVerification: "verified" } });
  const items = computeFounderWorkingQueue(buildInput({ leads: [istanbulLead, uchisarLead] }));
  assert.equal(items.length, 2);
});
