import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeTodayActionStatus,
  isHotNowLead,
  selectHotNowLeads,
  type TodayActionState,
} from "./today-action.ts";

const NOW = 1_700_000_000_000;

type Row = {
  id: string;
  verifiedOpportunityScore: number;
  hotScore: number;
  _s: TodayActionState;
};

function row(
  id: string,
  status: TodayActionState["status"],
  verifiedOpportunityScore: number,
  hotScore: number,
  extra: Partial<TodayActionState> = {},
): Row {
  return { id, verifiedOpportunityScore, hotScore, _s: { status, ...extra } };
}

/**
 * HOT_NOW is exactly `status === "new" && verifiedOpportunityScore >= 80`
 * (per computeTodayActionStatus). hotScore is deliberately varied to prove it
 * is NOT part of the selector.
 */
const FIXTURES: Row[] = [
  row("hot-a", "new", 85, 90), // HOT_NOW
  row("hot-b", "new", 80, 12), // HOT_NOW (score boundary; low hotScore)
  row("warm", "new", 79, 99), // NEEDS_CONTACT — high hotScore but not HOT_NOW
  row("contacted-hot", "contacted", 95, 95), // no follow-up scheduled → NO_ACTION
  row("meeting", "meeting", 99, 99), // NO_ACTION
  row("replied", "replied", 90, 90), // DEMO_READY
  row("won", "won", 90, 90), // terminal
  row("lost", "lost", 90, 90), // terminal
];

const EXPECTED_HOT_IDS = ["hot-a", "hot-b"];

describe("isHotNowLead — single HOT_NOW selector", () => {
  it("6. includes a genuine HOT_NOW lead", () => {
    assert.equal(isHotNowLead({ verifiedOpportunityScore: 85 }, { status: "new" }, NOW), true);
  });

  it("5. excludes a high hotScore lead that is not HOT_NOW", () => {
    // hotScore 99 but status new + score 79 → NEEDS_CONTACT, not HOT_NOW.
    assert.equal(isHotNowLead({ verifiedOpportunityScore: 79 }, { status: "new" }, NOW), false);
    // hotScore 95 but contacted with no due follow-up → NO_ACTION.
    assert.equal(
      isHotNowLead({ verifiedOpportunityScore: 95 }, { status: "contacted" }, NOW),
      false,
    );
  });

  it("7. wrong-status edges follow computeTodayActionStatus", () => {
    for (const status of ["meeting", "replied", "won", "lost"] as const) {
      const lead = { verifiedOpportunityScore: 99 };
      assert.equal(
        isHotNowLead(lead, { status }, NOW),
        computeTodayActionStatus(lead, { status }, NOW) === "HOT_NOW",
      );
    }
  });
});

describe("selectHotNowLeads — exact count & id-set parity", () => {
  it("1+2. card count and destination list use the same selector", () => {
    // "card" side: how the workflow strip counts (filter by the shared helper).
    const cardHotIds = FIXTURES.filter((r) => isHotNowLead(r, r._s, NOW)).map((r) => r.id);
    // "destination" side: how the All-Leads list filters.
    const destinationIds = selectHotNowLeads(FIXTURES, NOW).map((r) => r.id);
    assert.deepEqual(cardHotIds, destinationIds);
  });

  it("3. id sets are exactly equal (not just the same length)", () => {
    const ids = selectHotNowLeads(FIXTURES, NOW).map((r) => r.id).sort();
    assert.deepEqual(ids, [...EXPECTED_HOT_IDS].sort());
  });

  it("4. count N → destination N for a larger roster", () => {
    const roster: Row[] = [];
    for (let i = 0; i < 19; i++) roster.push(row(`hot-${i}`, "new", 88, i % 100));
    // Noise that must never leak into the hot set.
    for (let i = 0; i < 7; i++) roster.push(row(`warm-${i}`, "new", 65, 95));
    for (let i = 0; i < 5; i++) roster.push(row(`mtg-${i}`, "meeting", 99, 99));

    const cardCount = roster.filter((r) => isHotNowLead(r, r._s, NOW)).length;
    const destination = selectHotNowLeads(roster, NOW);
    assert.equal(cardCount, 19);
    assert.equal(destination.length, 19);
    assert.equal(destination.length, cardCount);
  });

  it("empty roster yields an empty hot set (safe zero state)", () => {
    assert.deepEqual(selectHotNowLeads([], NOW), []);
    const noneHot = FIXTURES.filter((r) => r._s.status !== "new");
    assert.deepEqual(selectHotNowLeads(noneHot, NOW), []);
  });
});
