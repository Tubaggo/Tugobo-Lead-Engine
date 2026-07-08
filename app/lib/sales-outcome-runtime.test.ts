import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  applySalesOutcomeStatusUpdate,
  buildSalesOutcomeItem,
  buildSalesOutcomeTimelineEvent,
  calculateEstimatedArr,
  deriveSalesOutcomePriority,
  deriveSalesOutcomeSuggestedAction,
  isValidSalesOutcomeStatusUpdate,
  isValidSalesOutcomeStatusUpdateTarget,
  isValidSalesLostReason,
  isValidSalesPackage,
  sanitizeOutcomeNotePreview,
  sortSalesOutcomeItems,
  summarizeSalesOutcomes,
  type SalesOutcomeInput,
  type SalesOutcomeItem,
} from "./sales-outcome-runtime.ts";

function buildInput(overrides: Partial<SalesOutcomeInput> = {}): SalesOutcomeInput {
  return {
    missionId: "mission-1",
    leadId: "lead-1",
    source: "demo_scheduling",
    sourceProviderMessageId: "demo:wamid.R1",
    ...overrides,
  };
}

/* ── calculateEstimatedArr ──────────────────────────────────────── */

test("calculateEstimatedArr multiplies MRR by 12", () => {
  assert.equal(calculateEstimatedArr(1000), 12000);
  assert.equal(calculateEstimatedArr(0), 0);
});

test("calculateEstimatedArr returns null for null MRR", () => {
  assert.equal(calculateEstimatedArr(null), null);
});

/* ── sanitizeOutcomeNotePreview ─────────────────────────────────── */

test("note preview is truncated to 180 chars and the raw longer text never appears", () => {
  const longNote = "A".repeat(400);
  const preview = sanitizeOutcomeNotePreview(longNote);
  assert.equal(preview?.length, 180);
});

test("sanitizeOutcomeNotePreview returns null for empty/whitespace input", () => {
  assert.equal(sanitizeOutcomeNotePreview(null), null);
  assert.equal(sanitizeOutcomeNotePreview(undefined), null);
  assert.equal(sanitizeOutcomeNotePreview("   "), null);
});

/* ── buildSalesOutcomeItem ──────────────────────────────────────── */

test("buildSalesOutcomeItem defaults to open status", () => {
  const item = buildSalesOutcomeItem(buildInput(), 1000);
  assert.equal(item.status, "open");
  assert.equal(item.priority, "high");
});

test("a missing missionId never crashes item derivation, falls back to leadId for the id", () => {
  assert.doesNotThrow(() => buildSalesOutcomeItem(buildInput({ missionId: null }), 1000));
  const item = buildSalesOutcomeItem(buildInput({ missionId: null }), 1000);
  assert.equal(item.missionId, null);
  assert.equal(item.id, "outcome:lead-1");
});

test("with neither missionId nor leadId, falls back to sourceProviderMessageId for the id", () => {
  const item = buildSalesOutcomeItem(buildInput({ missionId: null, leadId: null }), 1000);
  assert.equal(item.id, "outcome:demo:wamid.R1");
});

test("an unmapped open item's suggested action mentions the mapping limitation", () => {
  const item = buildSalesOutcomeItem(buildInput({ missionId: null, leadId: null, sourceProviderMessageId: null }), 1000);
  assert.ok(item.suggestedAction.includes("mission eşleşmedi"));
});

test("suggestedActionOverride is honored when provided", () => {
  const item = buildSalesOutcomeItem(buildInput({ suggestedActionOverride: "No-show sonrası sonucu belirle" }), 1000);
  assert.equal(item.suggestedAction, "No-show sonrası sonucu belirle");
});

/* ── deriveSalesOutcomePriority ─────────────────────────────────── */

test("deriveSalesOutcomePriority matches the rule table for every status", () => {
  assert.equal(deriveSalesOutcomePriority({ status: "open" }), "high");
  assert.equal(deriveSalesOutcomePriority({ status: "won" }), "low");
  assert.equal(deriveSalesOutcomePriority({ status: "lost" }), "low");
  assert.equal(deriveSalesOutcomePriority({ status: "paused" }), "medium");
  assert.equal(deriveSalesOutcomePriority({ status: "no_decision" }), "medium");
  assert.equal(deriveSalesOutcomePriority({ status: "unknown" }), "low");
});

/* ── isValidSalesOutcomeStatusUpdate ────────────────────────────── */

test("won requires a real package or a positive revenue estimate", () => {
  assert.equal(isValidSalesOutcomeStatusUpdate({ status: "won" }), false);
  assert.equal(isValidSalesOutcomeStatusUpdate({ status: "won", package: "unknown" }), false);
  assert.equal(isValidSalesOutcomeStatusUpdate({ status: "won", estimatedMrr: 0 }), false);
  assert.equal(isValidSalesOutcomeStatusUpdate({ status: "won", package: "growth" }), true);
  assert.equal(isValidSalesOutcomeStatusUpdate({ status: "won", estimatedMrr: 15000 }), true);
});

test("lost requires a real reason or a note", () => {
  assert.equal(isValidSalesOutcomeStatusUpdate({ status: "lost" }), false);
  assert.equal(isValidSalesOutcomeStatusUpdate({ status: "lost", lostReason: "unknown" }), false);
  assert.equal(isValidSalesOutcomeStatusUpdate({ status: "lost", lostReason: "budget" }), true);
  assert.equal(isValidSalesOutcomeStatusUpdate({ status: "lost", outcomeNote: "Fiyat çok yüksek dediler." }), true);
  assert.equal(isValidSalesOutcomeStatusUpdate({ status: "lost", outcomeNote: "   " }), false);
});

test("paused/no_decision/open have no extra requirement", () => {
  assert.equal(isValidSalesOutcomeStatusUpdate({ status: "paused" }), true);
  assert.equal(isValidSalesOutcomeStatusUpdate({ status: "no_decision" }), true);
  assert.equal(isValidSalesOutcomeStatusUpdate({ status: "open" }), true);
});

/* ── validators ─────────────────────────────────────────────────── */

test("isValidSalesOutcomeStatusUpdateTarget accepts only the five allowed targets", () => {
  assert.equal(isValidSalesOutcomeStatusUpdateTarget("won"), true);
  assert.equal(isValidSalesOutcomeStatusUpdateTarget("lost"), true);
  assert.equal(isValidSalesOutcomeStatusUpdateTarget("paused"), true);
  assert.equal(isValidSalesOutcomeStatusUpdateTarget("no_decision"), true);
  assert.equal(isValidSalesOutcomeStatusUpdateTarget("open"), true);
  assert.equal(isValidSalesOutcomeStatusUpdateTarget("unknown"), false);
  assert.equal(isValidSalesOutcomeStatusUpdateTarget("anything"), false);
  assert.equal(isValidSalesOutcomeStatusUpdateTarget(null), false);
});

test("isValidSalesPackage accepts only the defined set", () => {
  assert.equal(isValidSalesPackage("starter"), true);
  assert.equal(isValidSalesPackage("enterprise"), true);
  assert.equal(isValidSalesPackage("premium"), false);
  assert.equal(isValidSalesPackage(42), false);
});

test("isValidSalesLostReason accepts only the defined set", () => {
  assert.equal(isValidSalesLostReason("budget"), true);
  assert.equal(isValidSalesLostReason("hotel_closed"), true);
  assert.equal(isValidSalesLostReason("bogus"), false);
  assert.equal(isValidSalesLostReason(null), false);
});

/* ── applySalesOutcomeStatusUpdate ──────────────────────────────── */

test("status update to won works and sets closedAt/estimatedArr", () => {
  const item = buildSalesOutcomeItem(buildInput(), 1000);
  const updated = applySalesOutcomeStatusUpdate(item, { status: "won", package: "growth", estimatedMrr: 15000 }, 2000);
  assert.equal(updated.status, "won");
  assert.equal(updated.package, "growth");
  assert.equal(updated.estimatedMrr, 15000);
  assert.equal(updated.estimatedArr, 180000);
  assert.equal(updated.closedAt, 2000);
  assert.equal(updated.suggestedAction, "Satış kazanıldı, onboarding sürecine geç");
});

test("status update to lost works and sets closedAt/lostReason", () => {
  const item = buildSalesOutcomeItem(buildInput(), 1000);
  const updated = applySalesOutcomeStatusUpdate(item, { status: "lost", lostReason: "budget" }, 3000);
  assert.equal(updated.status, "lost");
  assert.equal(updated.lostReason, "budget");
  assert.equal(updated.closedAt, 3000);
});

test("status update honors an explicit closedAt override", () => {
  const item = buildSalesOutcomeItem(buildInput(), 1000);
  const updated = applySalesOutcomeStatusUpdate(item, { status: "won", package: "growth", closedAt: 5000 }, 9000);
  assert.equal(updated.closedAt, 5000);
});

test("status update to paused/no_decision does not set closedAt", () => {
  const item = buildSalesOutcomeItem(buildInput(), 1000);
  const paused = applySalesOutcomeStatusUpdate(item, { status: "paused" }, 2000);
  assert.equal(paused.closedAt, null);
  const noDecision = applySalesOutcomeStatusUpdate(item, { status: "no_decision" }, 2000);
  assert.equal(noDecision.closedAt, null);
});

/* ── buildSalesOutcomeTimelineEvent ─────────────────────────────── */

test("buildSalesOutcomeTimelineEvent produces a safe event for every audit type, with the right actor", () => {
  const item = buildSalesOutcomeItem(buildInput(), 1000);

  const created = buildSalesOutcomeTimelineEvent(item, "sales_outcome_created", 1000);
  assert.equal(created.actor, "Hermes");
  assert.ok(created.details.includes("mission-1"));

  for (const type of [
    "sales_outcome_won",
    "sales_outcome_lost",
    "sales_outcome_paused",
    "sales_outcome_no_decision",
    "sales_outcome_open",
  ] as const) {
    const event = buildSalesOutcomeTimelineEvent(item, type, 1000);
    assert.equal(event.actor, "Founder");
    assert.equal(event.action, type);
  }
});

/* ── summarizeSalesOutcomes ─────────────────────────────────────── */

test("summarizeSalesOutcomes counts won/lost/open and totals MRR/ARR from won items only", () => {
  const openItem = buildSalesOutcomeItem(buildInput({ sourceProviderMessageId: "s1" }), 1000);
  const wonItem = applySalesOutcomeStatusUpdate(
    buildSalesOutcomeItem(buildInput({ sourceProviderMessageId: "s2" }), 1000),
    { status: "won", package: "growth", estimatedMrr: 10000 },
    1000,
  );
  const lostItem = applySalesOutcomeStatusUpdate(
    buildSalesOutcomeItem(buildInput({ sourceProviderMessageId: "s3" }), 1000),
    { status: "lost", lostReason: "budget" },
    1000,
  );
  const pausedItem = applySalesOutcomeStatusUpdate(buildSalesOutcomeItem(buildInput({ sourceProviderMessageId: "s4" }), 1000), { status: "paused" }, 1000);
  const noDecisionItem = applySalesOutcomeStatusUpdate(
    buildSalesOutcomeItem(buildInput({ sourceProviderMessageId: "s5" }), 1000),
    { status: "no_decision" },
    1000,
  );

  const summary = summarizeSalesOutcomes([openItem, wonItem, lostItem, pausedItem, noDecisionItem]);
  assert.equal(summary.total, 5);
  assert.equal(summary.open, 1);
  assert.equal(summary.won, 1);
  assert.equal(summary.lost, 1);
  assert.equal(summary.paused, 1);
  assert.equal(summary.noDecision, 1);
  assert.equal(summary.estimatedMrrTotal, 10000);
  assert.equal(summary.estimatedArrTotal, 120000);
});

test("close rate is calculated safely — null when nothing has closed, a fraction otherwise", () => {
  const openItem = buildSalesOutcomeItem(buildInput(), 1000);
  assert.equal(summarizeSalesOutcomes([openItem]).closeRate, null);

  const wonItem = applySalesOutcomeStatusUpdate(buildSalesOutcomeItem(buildInput({ sourceProviderMessageId: "s2" }), 1000), { status: "won", package: "growth" }, 1000);
  const lostItem = applySalesOutcomeStatusUpdate(buildSalesOutcomeItem(buildInput({ sourceProviderMessageId: "s3" }), 1000), { status: "lost", lostReason: "budget" }, 1000);
  assert.equal(summarizeSalesOutcomes([wonItem, lostItem]).closeRate, 0.5);
  assert.equal(summarizeSalesOutcomes([wonItem]).closeRate, 1);
  assert.equal(summarizeSalesOutcomes([lostItem]).closeRate, 0);
});

/* ── sortSalesOutcomeItems ──────────────────────────────────────── */

test("sortSalesOutcomeItems prioritizes undecided items over won/lost", () => {
  const won = applySalesOutcomeStatusUpdate(buildSalesOutcomeItem(buildInput({ sourceProviderMessageId: "s2" }), 1000), { status: "won", package: "growth" }, 1000);
  const open = buildSalesOutcomeItem(buildInput({ sourceProviderMessageId: "s1" }), 1000);
  const sorted = sortSalesOutcomeItems([won, open]);
  assert.equal(sorted[0].id, open.id);
  assert.equal(sorted[1].id, won.id);
});

test("sortSalesOutcomeItems never mutates the input array", () => {
  const items = [buildSalesOutcomeItem(buildInput(), 1000)];
  const original = [...items];
  sortSalesOutcomeItems(items);
  assert.deepEqual(items, original);
});

/* ── Safety ─────────────────────────────────────────────────────── */

test("a derived sales outcome item never includes a raw phone or full reply body field", () => {
  const item: SalesOutcomeItem = buildSalesOutcomeItem(buildInput({ outcomeNote: "A".repeat(400) }), 1000);
  const serialized = JSON.stringify(item);
  assert.equal(serialized.includes("905551234567"), false);
  assert.equal("rawPayload" in item, false);
  assert.equal("accessToken" in item, false);
  assert.equal(item.outcomeNotePreview?.length, 180);
});

test("no fetch() call or external API import is present in the pure runtime source", () => {
  const source = readFileSync(fileURLToPath(new URL("./sales-outcome-runtime.ts", import.meta.url)), "utf8");
  assert.equal(source.includes("fetch("), false);
  assert.equal(source.includes("process.env."), false);
  assert.equal(/from\s+["']\.\/whatsapp-controlled-live/i.test(source), false);
});
