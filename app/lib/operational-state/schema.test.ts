import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  applyLeadStatePatch,
  emptyStateFile,
  isValidLeadId,
  MAX_ACTIVITY_PER_LEAD,
  MAX_NOTE_LENGTH,
  mergeActivity,
  normalizeActivityEntry,
  normalizeDailyQueue,
  normalizeLeadState,
  normalizeRoster,
  parseLeadStatePatch,
  parseStateFile,
  SCHEMA_VERSION,
  type ActivityEntry,
} from "./schema.ts";

const NOW = "2026-07-21T10:00:00.000Z";

describe("isValidLeadId", () => {
  test("accepts the real id shapes", () => {
    assert.equal(isValidLeadId("ant-001"), true);
    assert.equal(isValidLeadId("gmaps-ChIJN1t_tDeuEmsRUsoyG83frY4"), true);
  });

  test("rejects traversal-shaped and empty ids", () => {
    assert.equal(isValidLeadId(""), false);
    assert.equal(isValidLeadId("../etc/passwd"), false);
    assert.equal(isValidLeadId("a/b"), false);
    assert.equal(isValidLeadId("a..b"), false);
    assert.equal(isValidLeadId(null), false);
    assert.equal(isValidLeadId("x".repeat(500)), false);
  });
});

describe("parseStateFile", () => {
  test("rejects a file with the wrong schema version", () => {
    assert.equal(parseStateFile({ schemaVersion: 99, leads: {} }), null);
  });

  test("rejects non-objects", () => {
    assert.equal(parseStateFile(null), null);
    assert.equal(parseStateFile([]), null);
    assert.equal(parseStateFile("{}"), null);
  });

  test("round-trips an empty file", () => {
    const parsed = parseStateFile(emptyStateFile(NOW), NOW);
    assert.ok(parsed);
    assert.equal(parsed.schemaVersion, SCHEMA_VERSION);
    assert.deepEqual(parsed.leads, {});
    assert.deepEqual(parsed.roster, []);
  });

  test("drops leads whose key is not a valid id", () => {
    const parsed = parseStateFile(
      {
        schemaVersion: SCHEMA_VERSION,
        updatedAt: NOW,
        leads: { "ant-001": { leadId: "ant-001", activity: [] }, "../evil": {} },
        roster: [],
        rosterUpdatedAt: null,
        dailyQueue: null,
      },
      NOW,
    );
    assert.ok(parsed);
    assert.deepEqual(Object.keys(parsed.leads), ["ant-001"]);
  });
});

describe("normalizeLeadState", () => {
  test("drops unknown fields rather than storing them", () => {
    const state = normalizeLeadState(
      "ant-001",
      { founderNotes: "hi", attackerField: "x", workflow: { evil: 1, status: "new" } },
      NOW,
    );
    assert.equal("attackerField" in state, false);
    assert.equal(state.founderNotes, "hi");
    assert.deepEqual(state.workflow, { status: "new" });
  });

  test("truncates an oversized note", () => {
    const state = normalizeLeadState(
      "ant-001",
      { founderNotes: "x".repeat(MAX_NOTE_LENGTH + 500) },
      NOW,
    );
    assert.equal(state.founderNotes?.length, MAX_NOTE_LENGTH);
  });

  test("keeps only whitelisted workflow fields", () => {
    const state = normalizeLeadState(
      "ant-001",
      { workflow: { contactAttempts: 3, doNotContact: true, nope: "x" } },
      NOW,
    );
    assert.deepEqual(state.workflow, { contactAttempts: 3, doNotContact: true });
  });
});

describe("mergeActivity", () => {
  const entry = (id: string, createdAt: string): ActivityEntry => ({
    id,
    type: "contacted",
    title: "contacted",
    createdAt,
  });

  test("deduplicates on entry id", () => {
    const existing = [entry("a", "2026-07-01T00:00:00.000Z")];
    const merged = mergeActivity(existing, [
      entry("a", "2026-07-01T00:00:00.000Z"),
      entry("b", "2026-07-02T00:00:00.000Z"),
    ]);
    assert.equal(merged.length, 2);
    assert.deepEqual(
      merged.map((e) => e.id),
      ["a", "b"],
    );
  });

  test("is idempotent when replayed", () => {
    const incoming = [entry("a", "2026-07-01T00:00:00.000Z")];
    const once = mergeActivity([], incoming);
    const twice = mergeActivity(once, incoming);
    assert.deepEqual(once, twice);
  });

  test("sorts chronologically regardless of arrival order", () => {
    const merged = mergeActivity(
      [],
      [entry("b", "2026-07-05T00:00:00.000Z"), entry("a", "2026-07-01T00:00:00.000Z")],
    );
    assert.deepEqual(
      merged.map((e) => e.id),
      ["a", "b"],
    );
  });

  test("keeps the newest entries when over the cap", () => {
    const many = Array.from({ length: MAX_ACTIVITY_PER_LEAD + 40 }, (_, i) =>
      entry(`e${i}`, new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString()),
    );
    const merged = mergeActivity([], many);
    assert.equal(merged.length, MAX_ACTIVITY_PER_LEAD);
    assert.equal(merged[merged.length - 1].id, `e${MAX_ACTIVITY_PER_LEAD + 39}`);
  });
});

describe("normalizeActivityEntry", () => {
  test("rejects an entry without an id", () => {
    assert.equal(normalizeActivityEntry({ type: "contacted" }, NOW), null);
  });

  test("carries messageVariant and followUpAt", () => {
    const entry = normalizeActivityEntry(
      {
        id: "a",
        type: "message_prepared",
        title: "prep",
        messageVariant: "direct",
        followUpAt: "2026-08-01T00:00:00.000Z",
      },
      NOW,
    );
    assert.equal(entry?.messageVariant, "direct");
    assert.equal(entry?.followUpAt, "2026-08-01T00:00:00.000Z");
  });

  test("falls back to the supplied timestamp for an unparseable date", () => {
    const entry = normalizeActivityEntry({ id: "a", createdAt: "not a date" }, NOW);
    assert.equal(entry?.createdAt, NOW);
  });
});

describe("applyLeadStatePatch", () => {
  test("increments the revision on every write", () => {
    const first = applyLeadStatePatch(undefined, "ant-001", { queued: true }, NOW);
    assert.equal(first.revision, 1);
    const second = applyLeadStatePatch(first, "ant-001", { queued: false }, NOW);
    assert.equal(second.revision, 2);
  });

  test("merges workflow instead of replacing it", () => {
    const first = applyLeadStatePatch(
      undefined,
      "ant-001",
      { workflow: { contactAttempts: 2, doNotContact: true } },
      NOW,
    );
    const second = applyLeadStatePatch(
      first,
      "ant-001",
      { workflow: { contactAttempts: 3 } },
      NOW,
    );
    assert.equal(second.workflow?.contactAttempts, 3);
    assert.equal(second.workflow?.doNotContact, true, "untouched field survives");
  });

  test("leaves fields the patch did not mention alone", () => {
    const first = applyLeadStatePatch(undefined, "ant-001", { founderNotes: "keep" }, NOW);
    const second = applyLeadStatePatch(first, "ant-001", { queued: true }, NOW);
    assert.equal(second.founderNotes, "keep");
  });

  test("preserves createdAt across updates", () => {
    const first = applyLeadStatePatch(undefined, "ant-001", { queued: true }, NOW);
    const later = "2026-08-01T00:00:00.000Z";
    const second = applyLeadStatePatch(first, "ant-001", { queued: false }, later);
    assert.equal(second.createdAt, NOW);
    assert.equal(second.updatedAt, later);
  });
});

describe("parseLeadStatePatch", () => {
  test("rejects a non-object body", () => {
    assert.equal(parseLeadStatePatch(null), null);
    assert.equal(parseLeadStatePatch([]), null);
  });

  test("rejects an oversized note rather than truncating it", () => {
    assert.equal(
      parseLeadStatePatch({ founderNotes: "x".repeat(MAX_NOTE_LENGTH + 1) }),
      null,
    );
  });

  test("rejects a non-string note", () => {
    assert.equal(parseLeadStatePatch({ founderNotes: 42 }), null);
  });

  test("omits keys the body did not contain", () => {
    const patch = parseLeadStatePatch({ queued: true });
    assert.ok(patch);
    assert.equal("founderNotes" in patch, false);
    assert.equal("salesStage" in patch, false);
  });
});

describe("normalizeRoster", () => {
  test("drops entries without a valid id and deduplicates", () => {
    const roster = normalizeRoster([
      { id: "ant-001" },
      { id: "ant-001" },
      { id: "../x" },
      {},
      null,
      "nope",
    ]);
    assert.equal(roster.length, 1);
    assert.equal(roster[0].id, "ant-001");
  });

  test("returns empty for a non-array", () => {
    assert.deepEqual(normalizeRoster({ id: "ant-001" }), []);
  });
});

describe("normalizeDailyQueue", () => {
  test("requires a queueDate", () => {
    assert.equal(normalizeDailyQueue({ todayQueue: [] }, NOW), null);
  });

  test("filters invalid ids out of the queue", () => {
    const queue = normalizeDailyQueue(
      { queueDate: "2026-07-21", todayQueue: ["ant-001", "../evil", 7] },
      NOW,
    );
    assert.deepEqual(queue?.todayQueue, ["ant-001"]);
  });

  test("clamps negative counters to zero", () => {
    const queue = normalizeDailyQueue(
      { queueDate: "2026-07-21", completedToday: -5 },
      NOW,
    );
    assert.equal(queue?.completedToday, 0);
  });
});
