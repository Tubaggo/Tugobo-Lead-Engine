/**
 * The write path refuses to invent leads.
 *
 * `lead-id.test.ts` covers the validator in isolation; this covers what the
 * store actually does with it — that a refused id leaves *no* trace: no
 * record, no revision, no activity, no queue entry, no backup file. A guard
 * that rejects the response but still wrote the file would be worse than none.
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  appendLeadActivity,
  getState,
  isKnownLead,
  migrateLegacyState,
  patchLeadState,
  putDailyQueue,
  putRoster,
  resetLeadOperationalStates,
  UnknownLeadError,
} from "./repository.ts";

let tempDir: string;
let previousDataDir: string | undefined;

beforeEach(async () => {
  previousDataDir = process.env.LEAD_ENGINE_DATA_DIR;
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tugobo-leadid-"));
  process.env.LEAD_ENGINE_DATA_DIR = tempDir;
});

afterEach(async () => {
  if (previousDataDir === undefined) delete process.env.LEAD_ENGINE_DATA_DIR;
  else process.env.LEAD_ENGINE_DATA_DIR = previousDataDir;
  await fs.rm(tempDir, { recursive: true, force: true });
});

/** The ids the report named, plus the shapes around them. */
const REFUSED_IDS = [
  "",
  " ",
  "   ",
  "undefined",
  "null",
  "NaN",
  "[object Object]",
  "true",
  "false",
  "UNDEFINED",
  " undefined ",
  "%75ndefined",
  "../etc/passwd",
  "a/b",
  "a..b",
  "-leading-dash",
];

async function seedWorkspace(): Promise<void> {
  await putRoster([{ id: "gmaps-real", name: "Real Hotel" }]);
}

async function activity(id: string) {
  return [{ id, type: "note", title: "t", createdAt: "2026-07-25T09:00:00.000Z" }];
}

describe("patchLeadState refuses an unusable id", () => {
  beforeEach(seedWorkspace);

  it("throws for every placeholder and malformed value", async () => {
    for (const leadId of REFUSED_IDS) {
      await assert.rejects(
        () => patchLeadState(leadId, { salesStage: "demo" }),
        UnknownLeadError,
        JSON.stringify(leadId),
      );
    }
  });

  it("creates no lead record", async () => {
    for (const leadId of REFUSED_IDS) {
      await patchLeadState(leadId, { salesStage: "demo" }).catch(() => {});
    }
    const file = await getState();
    assert.deepEqual(Object.keys(file.leads), []);
  });

  it("does not advance any revision", async () => {
    await patchLeadState("gmaps-real", { salesStage: "demo" });
    const before = (await getState()).leads["gmaps-real"].revision;

    for (const leadId of REFUSED_IDS) {
      await patchLeadState(leadId, { salesStage: "won" }).catch(() => {});
    }

    const file = await getState();
    assert.equal(file.leads["gmaps-real"].revision, before);
    assert.deepEqual(Object.keys(file.leads), ["gmaps-real"]);
  });

  it("leaves the roster and the queue untouched", async () => {
    await putDailyQueue({
      queueDate: "2026-07-25",
      todayQueue: ["gmaps-real"],
      todayLog: [],
      queueItems: {},
    });
    const before = JSON.stringify(await getState());

    for (const leadId of REFUSED_IDS) {
      await patchLeadState(leadId, { queued: true }).catch(() => {});
    }

    const after = await getState();
    assert.deepEqual(after.leads, {});
    assert.deepEqual(after.roster.map((l) => l.id), ["gmaps-real"]);
    assert.deepEqual(after.dailyQueue?.todayQueue, ["gmaps-real"]);
    // Only `updatedAt` may differ, and only if something wrote — nothing did.
    assert.equal(JSON.stringify(after), before);
  });
});

describe("appendLeadActivity refuses an unusable id", () => {
  beforeEach(seedWorkspace);

  it("throws and writes no activity", async () => {
    for (const leadId of REFUSED_IDS) {
      await assert.rejects(
        async () => appendLeadActivity(leadId, await activity("a1")),
        UnknownLeadError,
        JSON.stringify(leadId),
      );
    }
    const file = await getState();
    assert.deepEqual(Object.keys(file.leads), []);
  });
});

describe("unknown but well-formed ids", () => {
  beforeEach(seedWorkspace);

  it("are refused rather than created", async () => {
    await assert.rejects(
      () => patchLeadState("gmaps-never-imported", { salesStage: "demo" }),
      UnknownLeadError,
    );
    assert.deepEqual(Object.keys((await getState()).leads), []);
  });

  it("are refused for activity too", async () => {
    await assert.rejects(
      async () => appendLeadActivity("gmaps-never-imported", await activity("a1")),
      UnknownLeadError,
    );
  });
});

describe("leads the workspace does know", () => {
  it("accepts a lead in the roster", async () => {
    await seedWorkspace();
    const state = await patchLeadState("gmaps-real", { salesStage: "demo" });
    assert.equal(state.revision, 1);
    assert.equal(state.salesStage, "demo");
  });

  it("accepts a bundled demo lead that is in no roster", async () => {
    await seedWorkspace();
    const state = await patchLeadState("nev-028", { salesStage: "demo" });
    assert.equal(state.leadId, "nev-028");
    assert.equal(state.revision, 1);
  });

  it("accepts a lead that only today's queue knows", async () => {
    await seedWorkspace();
    await putDailyQueue({
      queueDate: "2026-07-25",
      todayQueue: ["gmaps-queued"],
      todayLog: [],
      queueItems: {},
    });
    const state = await patchLeadState("gmaps-queued", { queued: true });
    assert.equal(state.revision, 1);
  });

  it("accepts a lead that already has a record", async () => {
    await seedWorkspace();
    await patchLeadState("gmaps-real", { salesStage: "demo" });
    await putRoster([]); // the roster is replaced wholesale on re-import
    const state = await patchLeadState("gmaps-real", { salesStage: "won" });
    assert.equal(state.revision, 2);
  });

  it("accepts any well-formed id while the workspace is still empty", async () => {
    // A fresh install has nothing to check against; refusing here would mean
    // the first save after the very first import could never land.
    const state = await patchLeadState("gmaps-first-ever", { salesStage: "demo" });
    assert.equal(state.revision, 1);
    // ...but a placeholder is still refused, roster or no roster.
    await assert.rejects(
      () => patchLeadState("undefined", { salesStage: "demo" }),
      UnknownLeadError,
    );
  });
});

describe("isKnownLead", () => {
  it("does not treat an empty workspace as a licence for placeholders", async () => {
    const file = await getState();
    assert.equal(isKnownLead(file, "anything-well-formed"), true);
    assert.equal(isKnownLead(file, "undefined"), true, "membership alone cannot judge it");
    // The format gate is what refuses it, and the write path runs both.
    await assert.rejects(
      () => patchLeadState("undefined", { queued: true }),
      UnknownLeadError,
    );
  });
});

describe("legacy migration", () => {
  it("adopts no lead whose key is a placeholder", async () => {
    const result = await migrateLegacyState({
      leads: {
        "gmaps-legacy": { salesStage: "demo" },
        undefined: { salesStage: "demo" },
        null: { salesStage: "demo" },
        "": { salesStage: "demo" },
        "../escape": { salesStage: "demo" },
      },
    });

    assert.equal(result.leadsAdded, 1);
    assert.deepEqual(Object.keys((await getState()).leads), ["gmaps-legacy"]);
  });

  it("adopts no activity keyed on a placeholder", async () => {
    await migrateLegacyState({
      activity: {
        undefined: [{ id: "a1", type: "note", title: "t" }],
        null: [{ id: "a2", type: "note", title: "t" }],
      },
    });
    assert.deepEqual(Object.keys((await getState()).leads), []);
  });
});

describe("reset", () => {
  it("takes no backup and changes nothing when no id is usable", async () => {
    await seedWorkspace();
    await patchLeadState("gmaps-real", { salesStage: "demo" });

    const outcome = await resetLeadOperationalStates(
      ["undefined", "null", "", "[object Object]", "../escape"],
      "untouched",
    );

    assert.equal(outcome.backupFile, null, "a refused batch must not snapshot");
    assert.equal(outcome.changedCount, 0);
    assert.deepEqual(outcome.results, []);
    assert.equal((await getState()).leads["gmaps-real"].revision, 1);

    const entries = await fs.readdir(path.join(tempDir, "backups")).catch(() => []);
    assert.deepEqual(entries, [], "no backup file may be written");
  });

  it("still reports a well-formed unknown id as a no-op", async () => {
    // Reset deletes; it never creates. So membership is not its gate, and the
    // founder keeps the "nothing to clear" row they asked for.
    await seedWorkspace();
    const outcome = await resetLeadOperationalStates(["gmaps-never-imported"], "untouched");
    assert.equal(outcome.results.length, 1);
    assert.equal(outcome.results[0].changed, false);
    assert.deepEqual(Object.keys((await getState()).leads), []);
  });

  it("still resets the usable ids in a mixed batch", async () => {
    await seedWorkspace();
    await patchLeadState("gmaps-real", { salesStage: "demo" });

    const outcome = await resetLeadOperationalStates(
      ["undefined", "gmaps-real"],
      "untouched",
    );

    assert.equal(outcome.results.length, 1);
    assert.equal(outcome.results[0].leadId, "gmaps-real");
    assert.equal((await getState()).leads["gmaps-real"], undefined);
  });
});
