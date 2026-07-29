import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  emptyHermesRuntimeFile,
  HERMES_SCHEMA_VERSION,
  parseHermesRuntimeFile,
} from "./schema.ts";

/**
 * v1 → v2 (v3.8.1) migration.
 *
 * A file written by v3.8.0 has `schemaVersion: 1` and none of `followUps`,
 * `salesOutcomes`, `dailyRuns`. It must still open cleanly, with those three
 * sections present but empty, and the file must be stamped with the current
 * version so the next write upgrades it in place.
 */

const NOW = "2026-07-29T09:00:00.000Z";

function v1File() {
  return {
    schemaVersion: 1,
    updatedAt: NOW,
    revision: 4,
    missions: {
      "m-1": {
        missionId: "m-1",
        leadId: "gmaps-abc",
        hotelName: "Otel A",
        stage: "prepare",
        stageLabel: "Hazırlık",
        progress: 65,
        status: "",
        decisionState: "not-required",
        approvalRequired: true,
        primaryTaskId: "",
        tasks: [],
        timeline: [],
        lastTransition: null,
        failure: null,
        createdAt: NOW,
        updatedAt: NOW,
        revision: 0,
      },
    },
    approvals: {},
    replies: {},
    demos: {},
    deliveries: {},
  };
}

describe("v1 → v2", () => {
  test("1. a v1 file opens with the new sections defaulted to empty", () => {
    const parsed = parseHermesRuntimeFile(v1File(), NOW);
    assert.ok(parsed);
    assert.deepEqual(parsed?.followUps, {});
    assert.deepEqual(parsed?.salesOutcomes, {});
    assert.deepEqual(parsed?.dailyRuns, {});
  });

  test("2. existing v1 records are retained", () => {
    const parsed = parseHermesRuntimeFile(v1File(), NOW);
    assert.ok(parsed?.missions["m-1"]);
    assert.equal(parsed?.missions["m-1"].stage, "prepare");
  });

  test("3. the parsed file always stamps the current schema version", () => {
    const parsed = parseHermesRuntimeFile(v1File(), NOW);
    assert.equal(parsed?.schemaVersion, HERMES_SCHEMA_VERSION);
    assert.equal(HERMES_SCHEMA_VERSION, 2);
  });

  test("4. an unsupported version (neither 1 nor 2) is treated as corrupt", () => {
    const bad = { ...v1File(), schemaVersion: 99 };
    assert.equal(parseHermesRuntimeFile(bad, NOW), null);
  });

  test("5. a v2 file with real follow-up/outcome/run data round-trips", () => {
    const v2 = {
      schemaVersion: 2,
      updatedAt: NOW,
      revision: 1,
      missions: {},
      approvals: {},
      replies: {},
      demos: {},
      deliveries: {},
      followUps: {
        "followup:m-1": {
          followUpId: "followup:m-1",
          missionId: "m-1",
          leadId: "gmaps-abc",
          reason: "manual",
          status: "candidate",
          dueAt: Date.parse(NOW),
          note: "",
          createdAt: NOW,
          updatedAt: NOW,
          completedAt: null,
          cancelledAt: null,
          revision: 0,
        },
      },
      salesOutcomes: {},
      dailyRuns: {
        "2026-07-29": {
          id: "2026-07-29",
          localDate: "2026-07-29",
          status: "waiting_founder",
          startedAt: NOW,
          updatedAt: NOW,
          completedAt: null,
          queueRevision: 1,
          currentItemId: "m-1",
          itemIds: ["m-1"],
          skippedItemIds: [],
          summary: {
            scanned: 1,
            actionable: 1,
            waitingFounder: 1,
            followUpDue: 0,
            replyAttention: 0,
            demoPending: 0,
            completed: 0,
          },
          revision: 0,
        },
      },
    };
    const parsed = parseHermesRuntimeFile(v2, NOW);
    assert.equal(parsed?.followUps["followup:m-1"]?.reason, "manual");
    assert.equal(parsed?.dailyRuns["2026-07-29"]?.currentItemId, "m-1");
  });

  test("6. emptyHermesRuntimeFile already carries the new sections", () => {
    const empty = emptyHermesRuntimeFile(NOW);
    assert.deepEqual(empty.followUps, {});
    assert.deepEqual(empty.salesOutcomes, {});
    assert.deepEqual(empty.dailyRuns, {});
    assert.equal(empty.schemaVersion, 2);
  });
});
