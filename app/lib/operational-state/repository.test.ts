import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { resolveStateFilePath } from "./env.ts";
import {
  appendLeadActivity,
  getLeadState,
  getRoster,
  getState,
  isStorageReady,
  migrateLegacyState,
  patchLeadState,
  putDailyQueue,
  putRoster,
  RevisionConflictError,
} from "./repository.ts";

/**
 * The repository resolves its path from `LEAD_ENGINE_DATA_DIR`, so each test
 * points that at a fresh temporary directory. The developer `.data` fallback
 * is never reached and `.env.local` is never read.
 */

let tempDir: string;
let previousDataDir: string | undefined;

beforeEach(async () => {
  previousDataDir = process.env.LEAD_ENGINE_DATA_DIR;
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tugobo-repo-"));
  process.env.LEAD_ENGINE_DATA_DIR = tempDir;
});

afterEach(async () => {
  if (previousDataDir === undefined) delete process.env.LEAD_ENGINE_DATA_DIR;
  else process.env.LEAD_ENGINE_DATA_DIR = previousDataDir;
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("env wiring", () => {
  test("the state file lands inside the configured data directory", () => {
    assert.equal(
      resolveStateFilePath(),
      path.join(tempDir, "operational-state.json"),
    );
  });

  test("storage readiness is true for a writable directory", async () => {
    assert.equal(await isStorageReady(), true);
  });
});

describe("patchLeadState", () => {
  test("creates a record on first write", async () => {
    const state = await patchLeadState("ant-001", { salesStage: "demo" });
    assert.equal(state.leadId, "ant-001");
    assert.equal(state.salesStage, "demo");
    assert.equal(state.revision, 1);
  });

  test("persists across reads", async () => {
    await patchLeadState("ant-001", { founderNotes: "called them" });
    const state = await getLeadState("ant-001");
    assert.equal(state?.founderNotes, "called them");
  });

  test("increments revision on each write", async () => {
    await patchLeadState("ant-001", { queued: true });
    const second = await patchLeadState("ant-001", { queued: false });
    assert.equal(second.revision, 2);
  });

  test("rejects a stale expectedRevision", async () => {
    await patchLeadState("ant-001", { queued: true }); // revision 1
    await assert.rejects(
      patchLeadState("ant-001", { queued: false }, 0),
      RevisionConflictError,
    );
  });

  test("accepts a matching expectedRevision", async () => {
    const first = await patchLeadState("ant-001", { queued: true });
    const second = await patchLeadState("ant-001", { queued: false }, first.revision);
    assert.equal(second.revision, 2);
  });

  test("a rejected conflict does not mutate the record", async () => {
    await patchLeadState("ant-001", { founderNotes: "original" });
    await assert.rejects(
      patchLeadState("ant-001", { founderNotes: "clobbered" }, 99),
      RevisionConflictError,
    );
    const state = await getLeadState("ant-001");
    assert.equal(state?.founderNotes, "original");
  });

  test("returns null for an unknown lead", async () => {
    assert.equal(await getLeadState("ant-999"), null);
  });
});

describe("appendLeadActivity", () => {
  const entry = (id: string, createdAt: string) => ({
    id,
    type: "contacted",
    title: "contacted",
    createdAt,
  });

  test("appends entries for a lead", async () => {
    const state = await appendLeadActivity("ant-001", [
      entry("a", "2026-07-01T00:00:00.000Z"),
    ]);
    assert.equal(state.activity.length, 1);
  });

  test("deduplicates a replayed entry", async () => {
    await appendLeadActivity("ant-001", [entry("a", "2026-07-01T00:00:00.000Z")]);
    const second = await appendLeadActivity("ant-001", [
      entry("a", "2026-07-01T00:00:00.000Z"),
    ]);
    assert.equal(second.activity.length, 1);
  });

  test("a fully deduplicated append is a no-op on revision", async () => {
    const first = await appendLeadActivity("ant-001", [
      entry("a", "2026-07-01T00:00:00.000Z"),
    ]);
    const second = await appendLeadActivity("ant-001", [
      entry("a", "2026-07-01T00:00:00.000Z"),
    ]);
    assert.equal(second.revision, first.revision);
  });

  test("drops malformed entries without failing the whole append", async () => {
    const state = await appendLeadActivity("ant-001", [
      entry("a", "2026-07-01T00:00:00.000Z"),
      { type: "no-id" },
      null,
    ]);
    assert.equal(state.activity.length, 1);
  });

  test("activity survives a later field patch", async () => {
    await appendLeadActivity("ant-001", [entry("a", "2026-07-01T00:00:00.000Z")]);
    await patchLeadState("ant-001", { salesStage: "demo" });
    const state = await getLeadState("ant-001");
    assert.equal(state?.activity.length, 1);
    assert.equal(state?.salesStage, "demo");
  });
});

describe("roster and daily queue", () => {
  test("stores and returns the roster", async () => {
    const count = await putRoster([{ id: "gmaps-abc", name: "Test Hotel" }]);
    assert.equal(count, 1);
    const roster = await getRoster();
    assert.equal(roster[0].id, "gmaps-abc");
  });

  test("replaces the roster wholesale", async () => {
    await putRoster([{ id: "gmaps-a" }, { id: "gmaps-b" }]);
    await putRoster([{ id: "gmaps-c" }]);
    assert.deepEqual((await getRoster()).map((l) => l.id), ["gmaps-c"]);
  });

  test("stores the daily queue", async () => {
    const queue = await putDailyQueue({
      queueDate: "2026-07-21",
      todayQueue: ["ant-001"],
    });
    assert.equal(queue?.queueDate, "2026-07-21");
    assert.deepEqual(queue?.todayQueue, ["ant-001"]);
  });
});

describe("legacy migration", () => {
  const legacy = {
    leads: { "ant-001": { founderNotes: "from browser", salesStage: "contacted" } },
    activity: {
      "ant-001": [
        { id: "evt-1", type: "contacted", title: "c", createdAt: "2026-07-01T00:00:00.000Z" },
      ],
    },
    roster: [{ id: "gmaps-abc", name: "Legacy Hotel" }],
    dailyQueue: { queueDate: "2026-07-21", todayQueue: ["ant-001"] },
  };

  test("adopts legacy data into an empty store", async () => {
    const result = await migrateLegacyState(legacy);
    assert.equal(result.leadsAdded, 1);
    assert.equal(result.activityAdded, 1);
    assert.equal(result.rosterAdded, 1);
    assert.equal(result.dailyQueueAdopted, true);

    const state = await getLeadState("ant-001");
    assert.equal(state?.founderNotes, "from browser");
  });

  test("is idempotent when re-run", async () => {
    await migrateLegacyState(legacy);
    const second = await migrateLegacyState(legacy);

    assert.equal(second.leadsAdded, 0);
    assert.equal(second.activityAdded, 0);
    assert.equal(second.rosterAdded, 0);
    assert.equal(second.dailyQueueAdopted, false);

    const state = await getLeadState("ant-001");
    assert.equal(state?.activity.length, 1, "activity was not doubled");
  });

  test("older local data does not overwrite newer server state", async () => {
    await patchLeadState("ant-001", { founderNotes: "edited on another device" });
    await migrateLegacyState(legacy);

    const state = await getLeadState("ant-001");
    assert.equal(
      state?.founderNotes,
      "edited on another device",
      "server wins over legacy browser data",
    );
  });

  test("still merges activity for a lead the server already knows", async () => {
    await patchLeadState("ant-001", { founderNotes: "server" });
    await migrateLegacyState(legacy);
    const state = await getLeadState("ant-001");
    assert.equal(state?.founderNotes, "server");
    assert.equal(state?.activity.length, 1, "timeline is additive, fields are not");
  });

  test("does not replace a roster the server already has", async () => {
    await putRoster([{ id: "gmaps-server" }]);
    const result = await migrateLegacyState(legacy);
    assert.equal(result.rosterAdded, 1);
    const ids = (await getRoster()).map((l) => l.id);
    assert.deepEqual(ids, ["gmaps-server", "gmaps-abc"], "server entries kept, gaps filled");
  });

  test("does not replace a daily queue the server already has", async () => {
    await putDailyQueue({ queueDate: "2026-07-21", todayQueue: ["ant-999"] });
    const result = await migrateLegacyState(legacy);
    assert.equal(result.dailyQueueAdopted, false);
    const file = await getState();
    assert.deepEqual(file.dailyQueue?.todayQueue, ["ant-999"]);
  });

  test("an empty legacy payload changes nothing", async () => {
    await patchLeadState("ant-001", { founderNotes: "server" });
    const result = await migrateLegacyState({});
    assert.equal(result.leadsAdded, 0);
    const state = await getLeadState("ant-001");
    assert.equal(state?.founderNotes, "server");
  });
});

describe("cross-device behaviour", () => {
  test("a second client reads what the first wrote", async () => {
    // Same data directory, separate calls: this is exactly what a second
    // browser does after login.
    await patchLeadState("ant-001", { salesStage: "demo", founderNotes: "device A" });
    await putRoster([{ id: "gmaps-abc" }]);

    const file = await getState();
    assert.equal(file.leads["ant-001"].salesStage, "demo");
    assert.equal(file.leads["ant-001"].founderNotes, "device A");
    assert.equal(file.roster.length, 1);
  });

  test("state survives a simulated process restart", async () => {
    await patchLeadState("ant-001", { salesStage: "won" });
    // Nothing is cached in the repository — a fresh read hits the file the way
    // a restarted PM2 process would.
    const file = await getState();
    assert.equal(file.leads["ant-001"].salesStage, "won");
    const onDisk = JSON.parse(
      await fs.readFile(resolveStateFilePath(), "utf8"),
    ) as { leads: Record<string, { salesStage?: string }> };
    assert.equal(onDisk.leads["ant-001"].salesStage, "won");
  });
});
