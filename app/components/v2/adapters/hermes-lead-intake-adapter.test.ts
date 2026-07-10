import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeHermesLeadIntakeSummary,
  HERMES_LEAD_INTAKE_BUTTON_LABELS,
  HERMES_LEAD_INTAKE_FORBIDDEN_BUTTON_LABELS,
  resolveDeveloperLeadImportNavigation,
  type HermesLeadIntakeImportEntryLike,
  type HermesLeadIntakeMissionLike,
} from "./hermes-lead-intake-adapter.ts";
import type { ScoredLead } from "../../../lib/leads.ts";

const NOW = new Date("2026-07-09T10:00:00.000Z").getTime();

function buildLead(overrides: Partial<ScoredLead> = {}): ScoredLead {
  return {
    id: "lead-1",
    name: "Otel Test",
    city: "İzmir",
    leadScore: 40,
    hotScore: 0,
    ...overrides,
  } as ScoredLead;
}

function buildMission(overrides: Partial<HermesLeadIntakeMissionLike> = {}): HermesLeadIntakeMissionLike {
  return { stage: "prepare", ...overrides };
}

function buildImportEntry(
  overrides: Partial<HermesLeadIntakeImportEntryLike> = {},
): HermesLeadIntakeImportEntryLike {
  return { added: 3, importedAt: NOW, ...overrides };
}

test("lead intake adapter empty state: no leads, no missions, no import history never throws", () => {
  const result = computeHermesLeadIntakeSummary({ leads: [], missions: [], now: NOW });
  assert.equal(result.evaluatedLeadCount, 0);
  assert.equal(result.newOpportunityCount, 0);
  assert.equal(result.activeMissionCount, 0);
  assert.equal(result.approvalRequiredCount, 0);
  assert.equal(result.enrichedLeadCount, 0);
  assert.equal(result.importedTodayCount, 0);
  assert.equal(result.lastImportAt, null);
  assert.equal(result.intakeStatus, "idle");
});

test("evaluated lead count: equals the full scored lead pool size", () => {
  const leads = [buildLead({ id: "a" }), buildLead({ id: "b" }), buildLead({ id: "c" })];
  const result = computeHermesLeadIntakeSummary({ leads, missions: [], now: NOW });
  assert.equal(result.evaluatedLeadCount, 3);
});

test("new opportunity count: only leads at/above the sales-ready score bar count", () => {
  const leads = [
    buildLead({ id: "a", verifiedOpportunityScore: 85 }),
    buildLead({ id: "b", verifiedOpportunityScore: 70 }),
    buildLead({ id: "c", verifiedOpportunityScore: 40 }),
    buildLead({ id: "d", opportunityScore: 90, verifiedOpportunityScore: undefined }),
  ];
  const result = computeHermesLeadIntakeSummary({ leads, missions: [], now: NOW });
  assert.equal(result.newOpportunityCount, 3);
});

test("enriched lead count: only leads with lastEnrichedAt set count", () => {
  const leads = [
    buildLead({ id: "a", lastEnrichedAt: "2026-07-01T00:00:00.000Z" }),
    buildLead({ id: "b" }),
  ];
  const result = computeHermesLeadIntakeSummary({ leads, missions: [], now: NOW });
  assert.equal(result.enrichedLeadCount, 1);
});

test("active mission count: excludes completed missions", () => {
  const missions = [
    buildMission({ stage: "discover" }),
    buildMission({ stage: "approval" }),
    buildMission({ stage: "completed" }),
    buildMission({ stage: "execution-ready" }),
  ];
  const result = computeHermesLeadIntakeSummary({ leads: [buildLead()], missions, now: NOW });
  assert.equal(result.activeMissionCount, 3);
});

test("approval required count: only missions in the approval stage count", () => {
  const missions = [
    buildMission({ stage: "approval" }),
    buildMission({ stage: "approval" }),
    buildMission({ stage: "prepare" }),
  ];
  const result = computeHermesLeadIntakeSummary({ leads: [buildLead()], missions, now: NOW });
  assert.equal(result.approvalRequiredCount, 2);
});

test("importedTodayCount sums only today's entries; lastImportAt reads the newest (first) entry", () => {
  const yesterday = NOW - 24 * 60 * 60 * 1000;
  const importHistory = [
    buildImportEntry({ added: 5, importedAt: NOW }),
    buildImportEntry({ added: 7, importedAt: yesterday }),
  ];
  const result = computeHermesLeadIntakeSummary({ leads: [], missions: [], importHistory, now: NOW });
  assert.equal(result.importedTodayCount, 5);
  assert.equal(result.lastImportAt, NOW);
});

test("intakeStatus is scanning while an import is in flight, even with existing data", () => {
  const result = computeHermesLeadIntakeSummary({
    leads: [buildLead()],
    missions: [],
    importInProgress: true,
    now: NOW,
  });
  assert.equal(result.intakeStatus, "scanning");
});

test("intakeStatus is error when the last import failed, overriding needs_attention", () => {
  const result = computeHermesLeadIntakeSummary({
    leads: [buildLead()],
    missions: [buildMission({ stage: "approval" })],
    importError: "Import başarısız oldu.",
    now: NOW,
  });
  assert.equal(result.intakeStatus, "error");
});

test("intakeStatus is needs_attention when a decision is pending", () => {
  const result = computeHermesLeadIntakeSummary({
    leads: [buildLead()],
    missions: [buildMission({ stage: "approval" })],
    now: NOW,
  });
  assert.equal(result.intakeStatus, "needs_attention");
});

test("intakeStatus is ready when there is data and nothing needs the founder's attention", () => {
  const result = computeHermesLeadIntakeSummary({
    leads: [buildLead()],
    missions: [buildMission({ stage: "execution-ready" })],
    now: NOW,
  });
  assert.equal(result.intakeStatus, "ready");
});

test("founder summary with no data: exact idle-state Turkish copy", () => {
  const result = computeHermesLeadIntakeSummary({ leads: [], missions: [], now: NOW });
  assert.equal(result.founderSummary, "Hermes henüz yeni fırsat taraması başlatmadı.");
});

test("founder summary with active missions: mentions the mission conversion sentence", () => {
  const leads = [buildLead({ id: "a" }), buildLead({ id: "b" })];
  const missions = [buildMission({ stage: "prepare" }), buildMission({ stage: "enrich" })];
  const result = computeHermesLeadIntakeSummary({ leads, missions, now: NOW });
  assert.match(result.founderSummary, /Hermes 2 işletmeyi satış görevine dönüştürdü\./);
});

test("founder summary with approval required: mentions the pending-decision sentence", () => {
  const leads = [buildLead()];
  const missions = [buildMission({ stage: "approval" })];
  const result = computeHermesLeadIntakeSummary({ leads, missions, now: NOW });
  assert.match(result.founderSummary, /1 karar senin onayını bekliyor\./);
});

test("founder summary and suggested action are never empty, in any state (always renderable in Hermes Home)", () => {
  const states: Array<Parameters<typeof computeHermesLeadIntakeSummary>[0]> = [
    { leads: [], missions: [], now: NOW },
    { leads: [buildLead()], missions: [], now: NOW },
    { leads: [buildLead()], missions: [buildMission({ stage: "approval" })], now: NOW },
    { leads: [buildLead()], missions: [], importInProgress: true, now: NOW },
    { leads: [buildLead()], missions: [], importError: "boom", now: NOW },
  ];
  for (const state of states) {
    const result = computeHermesLeadIntakeSummary(state);
    assert.ok(result.founderSummary.trim().length > 0);
    assert.ok(result.suggestedAction.trim().length > 0);
  }
});

test("no forbidden button labels: the two allowed labels never overlap the forbidden manual-import vocabulary", () => {
  const allowed = Object.values(HERMES_LEAD_INTAKE_BUTTON_LABELS);
  assert.deepEqual(allowed, ["Fırsatları İncele", "Tarama Ekranını Aç"]);
  for (const forbidden of HERMES_LEAD_INTAKE_FORBIDDEN_BUTTON_LABELS) {
    assert.ok(!allowed.includes(forbidden as (typeof allowed)[number]));
  }
});

// v8.1.1 — Hide Developer Navigation: "Tarama Ekranını Aç" must
// still navigate even though Developer is no longer in the sidebar. It
// enables Developer Mode first (if it wasn't already on), then navigates.
test("lead import button still navigates: enables developer mode first when it was off", () => {
  const result = resolveDeveloperLeadImportNavigation(false);
  assert.equal(result.shouldEnableDeveloperMode, true);
});

test("lead import button still navigates: does not re-toggle developer mode when it was already on", () => {
  const result = resolveDeveloperLeadImportNavigation(true);
  assert.equal(result.shouldEnableDeveloperMode, false);
});
