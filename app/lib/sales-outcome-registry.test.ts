import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  __resetSalesOutcomeRegistryForTests,
  clearExpiredSalesOutcomes,
  getRecentSalesOutcomeItems,
  getSalesOutcomeByMissionId,
  getSalesOutcomeItem,
  updateSalesOutcomeStatus,
  upsertSalesOutcomeItem,
} from "./sales-outcome-registry.ts";
import type { SalesOutcomeInput } from "./sales-outcome-runtime.ts";

beforeEach(() => {
  __resetSalesOutcomeRegistryForTests();
});

function buildInput(overrides: Partial<SalesOutcomeInput> = {}): SalesOutcomeInput {
  return {
    missionId: "mission-1",
    leadId: "lead-1",
    source: "demo_scheduling",
    sourceProviderMessageId: "demo:wamid.R1",
    ...overrides,
  };
}

test("upsertSalesOutcomeItem creates a new item keyed deterministically by missionId", () => {
  const item = upsertSalesOutcomeItem(buildInput(), 1000);
  assert.equal(item.id, "outcome:mission-1");
  assert.equal(item.status, "open");
  assert.equal(getRecentSalesOutcomeItems(10, 1000).length, 1);
});

test("duplicate upserts for the same mission do not create a duplicate item", () => {
  upsertSalesOutcomeItem(buildInput(), 1000);
  upsertSalesOutcomeItem(buildInput(), 2000);
  assert.equal(getRecentSalesOutcomeItems(10, 2000).length, 1);
});

test("a duplicate upsert never clobbers a founder-set status on the existing item", () => {
  const created = upsertSalesOutcomeItem(buildInput(), 1000);
  updateSalesOutcomeStatus(created.id, { status: "won", package: "growth" }, 1500);
  upsertSalesOutcomeItem(buildInput(), 2000);
  const item = getSalesOutcomeItem(created.id, 2000);
  assert.equal(item?.status, "won");
});

test("getSalesOutcomeItem returns undefined for an unknown id", () => {
  assert.equal(getSalesOutcomeItem("outcome:never", 1000), undefined);
});

test("getSalesOutcomeByMissionId finds the item for a given mission", () => {
  upsertSalesOutcomeItem(buildInput({ missionId: "mission-42" }), 1000);
  const item = getSalesOutcomeByMissionId("mission-42", 1000);
  assert.ok(item);
  assert.equal(item?.missionId, "mission-42");
});

test("status update to won works", () => {
  const created = upsertSalesOutcomeItem(buildInput(), 1000);
  const result = updateSalesOutcomeStatus(created.id, { status: "won", package: "growth", estimatedMrr: 12000 }, 2000);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.item.status, "won");
});

test("status update to lost works", () => {
  const created = upsertSalesOutcomeItem(buildInput(), 1000);
  const result = updateSalesOutcomeStatus(created.id, { status: "lost", lostReason: "budget" }, 2000);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.item.status, "lost");
});

test("an invalid won update (no package or revenue) is rejected", () => {
  const created = upsertSalesOutcomeItem(buildInput(), 1000);
  const result = updateSalesOutcomeStatus(created.id, { status: "won" }, 2000);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error, "invalid_update");
});

test("an invalid lost update (no reason or note) is rejected", () => {
  const created = upsertSalesOutcomeItem(buildInput(), 1000);
  const result = updateSalesOutcomeStatus(created.id, { status: "lost" }, 2000);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error, "invalid_update");
});

test("status update returns not_found for an unknown id, never throws", () => {
  assert.doesNotThrow(() => updateSalesOutcomeStatus("outcome:never", { status: "won", package: "growth" }, 1000));
  const result = updateSalesOutcomeStatus("outcome:never", { status: "won", package: "growth" }, 1000);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error, "not_found");
});

test("unmapped candidates are still stored safely", () => {
  const item = upsertSalesOutcomeItem(buildInput({ missionId: null, leadId: null }), 1000);
  assert.equal(item.missionId, null);
  assert.equal(getRecentSalesOutcomeItems(10, 1000).length, 1);
});

test("an open item past the 30-day TTL is pruned", () => {
  upsertSalesOutcomeItem(buildInput(), 1000);
  const withinTtl = getRecentSalesOutcomeItems(10, 1000 + 29 * 24 * 60 * 60 * 1000);
  assert.equal(withinTtl.length, 1);
  const pastTtl = getRecentSalesOutcomeItems(10, 1000 + 31 * 24 * 60 * 60 * 1000);
  assert.equal(pastTtl.length, 0);
});

test("a won item never expires on its own, even far past the open TTL window", () => {
  const created = upsertSalesOutcomeItem(buildInput(), 1000);
  updateSalesOutcomeStatus(created.id, { status: "won", package: "growth" }, 1000);
  const farFuture = getRecentSalesOutcomeItems(10, 1000 + 365 * 24 * 60 * 60 * 1000);
  assert.equal(farFuture.length, 1);
  assert.equal(farFuture[0].status, "won");
});

test("clearExpiredSalesOutcomes hard-deletes only past-TTL open/paused/no_decision items, never won/lost", () => {
  const openItem = upsertSalesOutcomeItem(buildInput({ missionId: "m-open" }), 1000);
  const wonSource = upsertSalesOutcomeItem(buildInput({ missionId: "m-won" }), 1000);
  updateSalesOutcomeStatus(wonSource.id, { status: "won", package: "growth" }, 1000);

  const cleared = clearExpiredSalesOutcomes(1000 + 31 * 24 * 60 * 60 * 1000);
  assert.equal(cleared, 1);
  assert.equal(getSalesOutcomeItem(openItem.id, 1000 + 31 * 24 * 60 * 60 * 1000), undefined);
  assert.ok(getSalesOutcomeItem(wonSource.id, 1000 + 31 * 24 * 60 * 60 * 1000));
});

test("getRecentSalesOutcomeItems sorts undecided items before won/lost ones", () => {
  const won = upsertSalesOutcomeItem(buildInput({ missionId: "m-won2" }), 1000);
  updateSalesOutcomeStatus(won.id, { status: "won", package: "growth" }, 1000);
  const open = upsertSalesOutcomeItem(buildInput({ missionId: "m-open2" }), 1000);

  const recent = getRecentSalesOutcomeItems(10, 1000);
  assert.equal(recent[0].id, open.id);
});
