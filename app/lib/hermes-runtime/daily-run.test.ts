import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  advancePastDailyRunItem,
  buildDailyRun,
  deriveDailyRunStatus,
  refreshDailyRun,
  selectDailyRunItem,
  skipDailyRunItem,
  UnknownDailyRunItemError,
} from "./daily-run.ts";
import { emptyDailyRunSummary } from "./schema.ts";

const NOW = "2026-07-29T09:00:00.000Z";

function summary(overrides: Partial<ReturnType<typeof emptyDailyRunSummary>> = {}) {
  return { ...emptyDailyRunSummary(), ...overrides };
}

describe("deriveDailyRunStatus", () => {
  test("1. actionable > 0 → waiting_founder", () => {
    assert.equal(deriveDailyRunStatus(summary({ actionable: 1 })), "waiting_founder");
  });
  test("2. waitingFounder > 0 → waiting_founder", () => {
    assert.equal(deriveDailyRunStatus(summary({ waitingFounder: 1 })), "waiting_founder");
  });
  test("3. everything zero → completed", () => {
    assert.equal(deriveDailyRunStatus(summary()), "completed");
  });
});

describe("buildDailyRun", () => {
  test("4. selects the first item as current", () => {
    const run = buildDailyRun(
      { localDate: "2026-07-29", itemIds: ["m-1", "m-2"], summary: summary({ actionable: 2 }) },
      NOW,
    );
    assert.equal(run.id, "2026-07-29");
    assert.equal(run.currentItemId, "m-1");
    assert.equal(run.status, "waiting_founder");
    assert.equal(run.queueRevision, 1);
    assert.deepEqual(run.skippedItemIds, []);
  });
  test("5. an empty queue has no current item and is completed", () => {
    const run = buildDailyRun({ localDate: "2026-07-29", itemIds: [], summary: summary() }, NOW);
    assert.equal(run.currentItemId, null);
    assert.equal(run.status, "completed");
  });
});

describe("refreshDailyRun", () => {
  test("6. current item is sticky when it is still in the new list", () => {
    const run = buildDailyRun(
      { localDate: "2026-07-29", itemIds: ["m-1", "m-2"], summary: summary({ actionable: 2 }) },
      NOW,
    );
    const selected = selectDailyRunItem(run, "m-2", NOW);
    const refreshed = refreshDailyRun(
      selected,
      { itemIds: ["m-2", "m-3"], summary: summary({ actionable: 2 }) },
      NOW,
    );
    assert.equal(refreshed.currentItemId, "m-2");
    assert.equal(refreshed.queueRevision, 2);
  });
  test("7. current item is replaced when it fell out of the new list", () => {
    const run = buildDailyRun(
      { localDate: "2026-07-29", itemIds: ["m-1"], summary: summary({ actionable: 1 }) },
      NOW,
    );
    const refreshed = refreshDailyRun(
      run,
      { itemIds: ["m-2"], summary: summary({ actionable: 1 }) },
      NOW,
    );
    assert.equal(refreshed.currentItemId, "m-2");
  });
  test("8. skipped ids that fell out of the new list are dropped", () => {
    const run = buildDailyRun(
      { localDate: "2026-07-29", itemIds: ["m-1", "m-2"], summary: summary({ actionable: 2 }) },
      NOW,
    );
    const skipped = skipDailyRunItem(run, "m-1", NOW);
    const refreshed = refreshDailyRun(
      skipped,
      { itemIds: ["m-2"], summary: summary({ actionable: 1 }) },
      NOW,
    );
    assert.deepEqual(refreshed.skippedItemIds, []);
  });
  test("9. an empty refreshed queue flips status to completed and stamps completedAt", () => {
    const run = buildDailyRun(
      { localDate: "2026-07-29", itemIds: ["m-1"], summary: summary({ actionable: 1 }) },
      NOW,
    );
    const refreshed = refreshDailyRun(run, { itemIds: [], summary: summary() }, NOW);
    assert.equal(refreshed.status, "completed");
    assert.equal(refreshed.completedAt, NOW);
  });
});

describe("selectDailyRunItem", () => {
  test("10. selects a valid item", () => {
    const run = buildDailyRun(
      { localDate: "2026-07-29", itemIds: ["m-1", "m-2"], summary: summary({ actionable: 2 }) },
      NOW,
    );
    const selected = selectDailyRunItem(run, "m-2", NOW);
    assert.equal(selected.currentItemId, "m-2");
  });
  test("11. throws for an id not in the queue", () => {
    const run = buildDailyRun(
      { localDate: "2026-07-29", itemIds: ["m-1"], summary: summary({ actionable: 1 }) },
      NOW,
    );
    assert.throws(() => selectDailyRunItem(run, "ghost", NOW), UnknownDailyRunItemError);
  });
});

describe("skip / advance", () => {
  test("12. skipping the current item advances the pointer", () => {
    const run = buildDailyRun(
      { localDate: "2026-07-29", itemIds: ["m-1", "m-2"], summary: summary({ actionable: 2 }) },
      NOW,
    );
    const skipped = skipDailyRunItem(run, "m-1", NOW);
    assert.equal(skipped.currentItemId, "m-2");
    assert.deepEqual(skipped.skippedItemIds, ["m-1"]);
  });
  test("13. advancePastDailyRunItem is a no-op unless the item is current", () => {
    const run = buildDailyRun(
      { localDate: "2026-07-29", itemIds: ["m-1", "m-2"], summary: summary({ actionable: 2 }) },
      NOW,
    );
    const unchanged = advancePastDailyRunItem(run, "m-2", NOW);
    assert.equal(unchanged.currentItemId, "m-1");
    assert.equal(unchanged.revision, run.revision);
  });
  test("14. advancePastDailyRunItem moves past the current item and excludes it going forward", () => {
    const run = buildDailyRun(
      { localDate: "2026-07-29", itemIds: ["m-1", "m-2"], summary: summary({ actionable: 2 }) },
      NOW,
    );
    const advanced = advancePastDailyRunItem(run, "m-1", NOW);
    assert.equal(advanced.currentItemId, "m-2");
  });
});
