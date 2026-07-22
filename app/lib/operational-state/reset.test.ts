import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { resolveBackupDir } from "./env.ts";
import {
  appendLeadActivity,
  getLeadState,
  getRoster,
  getState,
  patchLeadState,
  putDailyQueue,
  putRoster,
  resetLeadOperationalStates,
} from "./repository.ts";
import {
  isResetProfile,
  MAX_RESET_LEADS,
  normalizeResetIds,
  planLeadReset,
  removeLeadsFromDailyQueue,
} from "./reset.ts";
import type { LeadOperationalState } from "./schema.ts";

/**
 * Every test here runs against a throwaway `LEAD_ENGINE_DATA_DIR` seeded with
 * fixture leads. No real pipeline data is read or written, and the developer
 * `.data` fallback is never reached.
 */

let tempDir: string;
let previousDataDir: string | undefined;

beforeEach(async () => {
  previousDataDir = process.env.LEAD_ENGINE_DATA_DIR;
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tugobo-reset-"));
  process.env.LEAD_ENGINE_DATA_DIR = tempDir;
});

afterEach(async () => {
  if (previousDataDir === undefined) delete process.env.LEAD_ENGINE_DATA_DIR;
  else process.env.LEAD_ENGINE_DATA_DIR = previousDataDir;
  await fs.rm(tempDir, { recursive: true, force: true });
});

const NOW = "2026-07-22T09:00:00.000Z";

/** A lead that has been worked: queued, contacted, staged, noted, drafted. */
function workedLead(leadId = "ant-001"): LeadOperationalState {
  return {
    leadId,
    queued: true,
    salesStage: "contacted",
    nextFollowUpAt: "2026-07-25T09:00:00.000Z",
    founderNotes: "test notu",
    workflow: {
      status: "needs_follow_up",
      contactAttempts: 2,
      lastContactedAt: 1_760_000_000_000,
      nextFollowUpAt: 1_760_500_000_000,
      queuedToday: true,
      lastQueuedAt: 1_760_000_000_000,
      doNotContact: true,
      wonAt: 1_760_100_000_000,
      followUpAfterHours: 72,
    },
    manualOverrides: { tier: "A" },
    aiSnapshot: { summary: "test özeti" },
    messageWorkspace: {
      activeTone: "soft",
      drafts: {
        soft: {
          tone: "soft",
          message: "test taslağı",
          source: "provider",
          updatedAt: NOW,
        },
      },
      recentMessages: [
        {
          id: "soft-1",
          tone: "soft",
          message: "test taslağı",
          source: "provider",
          createdAt: NOW,
        },
      ],
    },
    activity: [
      { id: "a1", type: "message_copied", title: "message_copied", createdAt: NOW },
    ],
    createdAt: NOW,
    updatedAt: NOW,
    revision: 4,
  };
}

/** Seeds the store the way the app would: roster plus per-lead overlay. */
async function seedWorkedLead(leadId = "ant-001"): Promise<void> {
  await putRoster([
    {
      id: leadId,
      name: "Kaş Konak",
      city: "Antalya",
      phone: "+90 532 000 00 00",
      leadScore: 88,
      hotScore: 71,
    },
  ] as never);

  await patchLeadState(leadId, {
    queued: true,
    salesStage: "contacted",
    nextFollowUpAt: "2026-07-25T09:00:00.000Z",
    founderNotes: "test notu",
    workflow: {
      status: "needs_follow_up",
      contactAttempts: 2,
      lastContactedAt: 1_760_000_000_000,
      queuedToday: true,
      doNotContact: true,
    },
    messageWorkspace: {
      activeTone: "soft",
      drafts: {
        soft: { tone: "soft", message: "test taslağı", source: "provider", updatedAt: NOW },
      },
      recentMessages: [],
    },
  });

  await appendLeadActivity(leadId, [
    { id: "a1", type: "message_copied", title: "message_copied", createdAt: NOW },
  ]);
}

/* -------------------------------------------------------------------------- */
/* profile planning                                                           */
/* -------------------------------------------------------------------------- */

describe("followup_only profile", () => {
  test("clears the follow-up date", () => {
    const { next } = planLeadReset(workedLead(), "ant-001", "followup_only", NOW);
    assert.equal(next?.nextFollowUpAt, null);
    assert.equal(next?.workflow?.nextFollowUpAt, null);
  });

  test("clears queue membership", () => {
    const { next } = planLeadReset(workedLead(), "ant-001", "followup_only", NOW);
    assert.equal(next?.queued, false);
    assert.equal(next?.workflow?.queuedToday, false);
    assert.equal(next?.workflow?.lastQueuedAt, null);
  });

  test("leaves the follow-up bucket status behind", () => {
    const { next } = planLeadReset(workedLead(), "ant-001", "followup_only", NOW);
    assert.notEqual(next?.workflow?.status, "needs_follow_up");
    assert.equal(next?.workflow?.status, "contacted");
  });

  test("falls back to new when there was never any contact", () => {
    const lead = workedLead();
    lead.workflow = { status: "needs_follow_up" };
    const { next } = planLeadReset(lead, "ant-001", "followup_only", NOW);
    assert.equal(next?.workflow?.status, "new");
  });

  test("preserves the sales stage", () => {
    const { next } = planLeadReset(workedLead(), "ant-001", "followup_only", NOW);
    assert.equal(next?.salesStage, "contacted");
  });

  test("preserves activity, notes and message drafts", () => {
    const { next } = planLeadReset(workedLead(), "ant-001", "followup_only", NOW);
    assert.equal(next?.activity.length, 1);
    assert.equal(next?.founderNotes, "test notu");
    assert.equal(next?.messageWorkspace?.drafts.soft?.message, "test taslağı");
  });

  test("does not touch DNC, won or contact history", () => {
    const { next } = planLeadReset(workedLead(), "ant-001", "followup_only", NOW);
    assert.equal(next?.workflow?.doNotContact, true);
    assert.equal(next?.workflow?.wonAt, 1_760_100_000_000);
    assert.equal(next?.workflow?.contactAttempts, 2);
    assert.equal(next?.workflow?.lastContactedAt, 1_760_000_000_000);
  });

  test("advances the revision", () => {
    const { next } = planLeadReset(workedLead(), "ant-001", "followup_only", NOW);
    assert.equal(next?.revision, 5);
    assert.equal(next?.updatedAt, NOW);
  });
});

describe("untouched profile", () => {
  test("removes the operational record entirely", () => {
    const { next } = planLeadReset(workedLead(), "ant-001", "untouched", NOW);
    assert.equal(next, null);
  });

  test("reports every cleared area", () => {
    const { result } = planLeadReset(workedLead(), "ant-001", "untouched", NOW);
    for (const field of [
      "queued",
      "salesStage",
      "nextFollowUpAt",
      "founderNotes",
      "workflow",
      "doNotContact",
      "wonAt",
      "contactAttempts",
      "manualOverrides",
      "aiSnapshot",
      "messageWorkspace",
      "activity",
    ]) {
      assert.ok(result.clearedFields.includes(field), `missing: ${field}`);
    }
  });

  test("always reports the lead's own data as preserved", () => {
    const { result } = planLeadReset(workedLead(), "ant-001", "untouched", NOW);
    for (const field of ["roster", "scores", "enrichment", "channelVerification"]) {
      assert.ok(result.preservedFields.includes(field), `missing: ${field}`);
    }
  });

  test("is a no-op for a lead that was never worked", () => {
    const { next, result } = planLeadReset(undefined, "ant-999", "untouched", NOW);
    assert.equal(next, null);
    assert.equal(result.changed, false);
    assert.deepEqual(result.clearedFields, []);
  });
});

/* -------------------------------------------------------------------------- */
/* request shaping                                                            */
/* -------------------------------------------------------------------------- */

describe("request normalization", () => {
  test("deduplicates ids while preserving order", () => {
    assert.deepEqual(
      normalizeResetIds(["ant-001", "ant-002", "ant-001", "ant-003"]),
      ["ant-001", "ant-002", "ant-003"],
    );
  });

  test("bounds the batch", () => {
    const many = Array.from({ length: MAX_RESET_LEADS + 50 }, (_, i) => `ant-${i}`);
    assert.equal(normalizeResetIds(many).length, MAX_RESET_LEADS);
  });

  test("validates the profile name", () => {
    assert.equal(isResetProfile("untouched"), true);
    assert.equal(isResetProfile("followup_only"), true);
    assert.equal(isResetProfile("wipe"), false);
    assert.equal(isResetProfile(undefined), false);
  });
});

describe("daily queue cleanup", () => {
  const queue = {
    queueDate: "2026-07-22",
    todayQueue: ["ant-001", "ant-002"],
    todayLog: ["ant-001"],
    queueItems: { "ant-001": { queueStatus: "prepared" }, "ant-002": {} },
    completedToday: 1,
    skippedToday: 0,
    dncToday: 0,
    updatedAt: NOW,
  };

  test("drops the reset leads from every queue list", () => {
    const next = removeLeadsFromDailyQueue(queue, ["ant-001"], NOW);
    assert.deepEqual(next?.todayQueue, ["ant-002"]);
    assert.deepEqual(next?.todayLog, []);
    assert.deepEqual(Object.keys(next?.queueItems ?? {}), ["ant-002"]);
  });

  test("leaves an unrelated queue untouched", () => {
    assert.equal(removeLeadsFromDailyQueue(queue, ["ant-999"], NOW), queue);
  });

  test("handles a workspace with no queue", () => {
    assert.equal(removeLeadsFromDailyQueue(null, ["ant-001"], NOW), null);
  });
});

/* -------------------------------------------------------------------------- */
/* repository integration                                                     */
/* -------------------------------------------------------------------------- */

describe("resetLeadOperationalStates", () => {
  test("untouched leaves the roster completely intact", async () => {
    await seedWorkedLead();
    const before = await getRoster();

    await resetLeadOperationalStates(["ant-001"], "untouched");

    const after = await getRoster();
    assert.equal(after.length, before.length);
    assert.deepEqual(after, before);
    assert.equal(after[0].id, "ant-001");
    assert.equal(after[0].leadScore, 88);
  });

  test("untouched removes the lead's operational overlay", async () => {
    await seedWorkedLead();
    assert.notEqual(await getLeadState("ant-001"), null);

    await resetLeadOperationalStates(["ant-001"], "untouched");

    assert.equal(await getLeadState("ant-001"), null);
  });

  test("untouched clears drafts, activity and notes with it", async () => {
    await seedWorkedLead();
    await resetLeadOperationalStates(["ant-001"], "untouched");

    const file = await getState();
    assert.equal(Object.keys(file.leads).length, 0);
  });

  test("followup_only keeps the record and its history", async () => {
    await seedWorkedLead();
    await resetLeadOperationalStates(["ant-001"], "followup_only");

    const state = await getLeadState("ant-001");
    assert.equal(state?.nextFollowUpAt, null);
    assert.equal(state?.queued, false);
    assert.equal(state?.founderNotes, "test notu");
    assert.equal(state?.activity.length, 1);
    assert.equal(state?.messageWorkspace?.drafts.soft?.message, "test taslağı");
    assert.equal(state?.workflow?.doNotContact, true);
  });

  test("drops the leads from today's queue", async () => {
    await seedWorkedLead();
    await putDailyQueue({
      queueDate: "2026-07-22",
      todayQueue: ["ant-001"],
      todayLog: ["ant-001"],
      queueItems: { "ant-001": { queueStatus: "prepared" } },
    });

    await resetLeadOperationalStates(["ant-001"], "untouched");

    const file = await getState();
    assert.deepEqual(file.dailyQueue?.todayQueue, []);
    assert.deepEqual(file.dailyQueue?.todayLog, []);
    assert.deepEqual(Object.keys(file.dailyQueue?.queueItems ?? {}), []);
  });

  test("writes a snapshot before mutating", async () => {
    await seedWorkedLead();

    const outcome = await resetLeadOperationalStates(["ant-001"], "untouched");

    assert.ok(outcome.backupFile);
    const backups = await fs.readdir(resolveBackupDir());
    assert.equal(backups.length, 1);

    // The snapshot must show the pre-reset world, not the post-reset one.
    const raw = await fs.readFile(
      path.join(resolveBackupDir(), backups[0]),
      "utf8",
    );
    const snapshot = JSON.parse(raw) as { leads: Record<string, unknown> };
    assert.ok(snapshot.leads["ant-001"], "backup must predate the reset");
  });

  test("is idempotent", async () => {
    await seedWorkedLead();

    const first = await resetLeadOperationalStates(["ant-001"], "untouched");
    const second = await resetLeadOperationalStates(["ant-001"], "untouched");

    assert.equal(first.changedCount, 1);
    assert.equal(second.changedCount, 0);
    assert.equal(await getLeadState("ant-001"), null);
  });

  test("deduplicates ids inside one request", async () => {
    await seedWorkedLead();
    const outcome = await resetLeadOperationalStates(
      ["ant-001", "ant-001", "ant-001"],
      "untouched",
    );
    assert.equal(outcome.results.length, 1);
  });

  test("an unknown lead is a safe no-op, not an error", async () => {
    await seedWorkedLead();
    const outcome = await resetLeadOperationalStates(["ant-404"], "untouched");
    assert.equal(outcome.results.length, 1);
    assert.equal(outcome.results[0].changed, false);
    assert.notEqual(await getLeadState("ant-001"), null);
  });

  test("resets a batch without touching the leads outside it", async () => {
    await seedWorkedLead("ant-001");
    await patchLeadState("ant-002", { queued: true, founderNotes: "kalmalı" });
    await patchLeadState("ant-003", { queued: true });

    await resetLeadOperationalStates(["ant-001", "ant-003"], "untouched");

    assert.equal(await getLeadState("ant-001"), null);
    assert.equal(await getLeadState("ant-003"), null);
    assert.equal((await getLeadState("ant-002"))?.founderNotes, "kalmalı");
  });

  test("an empty request changes nothing and takes no snapshot", async () => {
    await seedWorkedLead();
    const outcome = await resetLeadOperationalStates([], "untouched");

    assert.equal(outcome.results.length, 0);
    assert.equal(outcome.backupFile, null);
    assert.notEqual(await getLeadState("ant-001"), null);
    await assert.rejects(() => fs.readdir(resolveBackupDir()));
  });

  test("concurrent resets are serialized, not interleaved", async () => {
    await seedWorkedLead("ant-001");
    await patchLeadState("ant-002", { queued: true });

    await Promise.all([
      resetLeadOperationalStates(["ant-001"], "untouched"),
      resetLeadOperationalStates(["ant-002"], "untouched"),
    ]);

    const file = await getState();
    assert.equal(Object.keys(file.leads).length, 0);
    assert.equal(file.roster.length, 1, "the roster survives both writes");
  });

  test("a reset creates no activity of its own", async () => {
    await seedWorkedLead();
    await resetLeadOperationalStates(["ant-001"], "followup_only");

    const state = await getLeadState("ant-001");
    assert.equal(state?.activity.length, 1, "no reset event is appended");
    assert.equal(state?.activity[0].id, "a1");
  });
});
