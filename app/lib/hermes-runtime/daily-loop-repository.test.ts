import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getLeadState, putRoster } from "../operational-state/repository.ts";
import {
  approveCurrentDraft,
  buildDailyQueueSnapshot,
  markContacted,
  planDemoForDailyLoop,
  planFollowUp,
  recordOutcome,
  recordReplyForDailyLoop,
  refreshDailyQueue,
  selectItem,
  skipItem,
  startOrResumeDailyRun,
  StaleApprovalError,
  UnknownDailyRunError,
  UnknownDailyRunItemError,
  UnknownMissionError,
} from "./daily-loop-repository.ts";
import { UnknownLeadError } from "../operational-state/repository.ts";
import { createMission } from "./repository.ts";
import { readHermesFileOrEmpty } from "./store.ts";
import { resolveHermesRuntimeFilePath } from "./env.ts";

/**
 * The daily loop's own repository surface, integration-tested against a real
 * temporary data directory exactly like `repository.test.ts` — no in-memory
 * cache exists anywhere in this stack, so a fresh read after a mutation is
 * what a restarted process would see too.
 */

let tempDir: string;
let previousDataDir: string | undefined;

beforeEach(async () => {
  previousDataDir = process.env.LEAD_ENGINE_DATA_DIR;
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tugobo-daily-loop-"));
  process.env.LEAD_ENGINE_DATA_DIR = tempDir;
});

afterEach(async () => {
  if (previousDataDir === undefined) delete process.env.LEAD_ENGINE_DATA_DIR;
  else process.env.LEAD_ENGINE_DATA_DIR = previousDataDir;
  await fs.rm(tempDir, { recursive: true, force: true });
});

async function seedRoster(ids: string[]): Promise<void> {
  await putRoster(ids.map((id) => ({ id, name: `Otel ${id}`, city: "Antalya" })));
}

async function seedMission(missionId = "m-1", leadId = "gmaps-abc") {
  await seedRoster([leadId]);
  return createMission({ missionId, leadId, hotelName: "Otel A", stage: "approval" });
}

describe("planFollowUp", () => {
  test("1. creates a due-in-the-future follow-up bound to the mission", async () => {
    await seedMission();
    const followUp = await planFollowUp({
      missionId: "m-1",
      leadId: "gmaps-abc",
      reason: "manual",
      presetDays: 1,
    });
    assert.equal(followUp.followUpId, "followup:m-1");
    assert.equal(followUp.status, "candidate");
    assert.ok(followUp.dueAt > Date.now());
  });

  test("2. planning again for the same mission upserts rather than duplicates", async () => {
    await seedMission();
    await planFollowUp({ missionId: "m-1", leadId: "gmaps-abc", reason: "manual", presetDays: 1 });
    await planFollowUp({ missionId: "m-1", leadId: "gmaps-abc", reason: "manual", presetDays: 3 });
    const file = await readHermesFileOrEmpty(resolveHermesRuntimeFilePath());
    assert.equal(Object.keys(file.followUps).length, 1);
  });

  test("3. an unknown lead is rejected", async () => {
    await seedMission();
    await assert.rejects(
      () => planFollowUp({ missionId: "m-1", leadId: "gmaps-ghost", reason: "manual" }),
      UnknownLeadError,
    );
  });

  test("4. an unknown mission is rejected", async () => {
    await seedRoster(["gmaps-abc"]);
    await assert.rejects(
      () => planFollowUp({ missionId: "m-ghost", leadId: "gmaps-abc", reason: "manual" }),
      UnknownMissionError,
    );
  });
});

describe("recordOutcome", () => {
  test("5. rejects an incomplete won update", async () => {
    await seedMission();
    await assert.rejects(() =>
      recordOutcome({ missionId: "m-1", leadId: "gmaps-abc", status: "won" }),
    );
  });

  test("6. a valid won outcome is recorded and closes an active follow-up", async () => {
    await seedMission();
    await planFollowUp({ missionId: "m-1", leadId: "gmaps-abc", reason: "manual" });
    const outcome = await recordOutcome({
      missionId: "m-1",
      leadId: "gmaps-abc",
      status: "won",
      package: "growth",
    });
    assert.equal(outcome.status, "won");
    assert.ok(outcome.closedAt);

    const file = await readHermesFileOrEmpty(resolveHermesRuntimeFilePath());
    assert.equal(file.followUps["followup:m-1"].status, "completed");
  });

  test("7. an unknown mission is rejected", async () => {
    await seedRoster(["gmaps-abc"]);
    await assert.rejects(
      () => recordOutcome({ missionId: "m-ghost", leadId: "gmaps-abc", status: "open" }),
      UnknownMissionError,
    );
  });
});

describe("approveCurrentDraft", () => {
  test("8. approves the decision and advances an approval-stage mission to execution-ready", async () => {
    await seedMission();
    const { mission } = await approveCurrentDraft({
      missionId: "m-1",
      leadId: "gmaps-abc",
      currentMessage: "Merhaba, kısa bir sorumuz olacaktı.",
    });
    assert.equal(mission.decisionState, "approved");
    assert.equal(mission.stage, "execution-ready");
  });
});

describe("markContacted — the atomic contacted transaction", () => {
  test("9. rejects when the draft was never approved", async () => {
    await seedMission();
    await assert.rejects(
      () =>
        markContacted({
          missionId: "m-1",
          leadId: "gmaps-abc",
          currentMessage: "Merhaba",
          channel: "whatsapp",
        }),
      StaleApprovalError,
    );
  });

  test("10. rejects when the message was edited after approval", async () => {
    await seedMission();
    await approveCurrentDraft({ missionId: "m-1", leadId: "gmaps-abc", currentMessage: "Merhaba A" });
    await assert.rejects(
      () =>
        markContacted({
          missionId: "m-1",
          leadId: "gmaps-abc",
          currentMessage: "Merhaba B — değişti",
          channel: "whatsapp",
        }),
      StaleApprovalError,
    );
  });

  test("11. succeeds for the exact approved copy: one delivery, one follow-up, one activity entry, lead contacted", async () => {
    await seedMission();
    const message = "Merhaba, kısa bir sorumuz olacaktı.";
    await approveCurrentDraft({ missionId: "m-1", leadId: "gmaps-abc", currentMessage: message });
    const { followUp } = await markContacted({
      missionId: "m-1",
      leadId: "gmaps-abc",
      currentMessage: message,
      channel: "whatsapp",
      followUpPresetDays: 1,
    });

    assert.equal(followUp.status, "candidate");
    assert.ok(followUp.dueAt > Date.now());

    const file = await readHermesFileOrEmpty(resolveHermesRuntimeFilePath());
    const deliveries = Object.values(file.deliveries).filter((d) => d.missionId === "m-1");
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].status, "sent");

    const leadState = await getLeadState("gmaps-abc");
    assert.equal(leadState?.workflow?.status, "contacted");
    assert.equal(leadState?.workflow?.nextFollowUpAt, followUp.dueAt);
    const contactedEntries = (leadState?.activity ?? []).filter((a) => a.type === "contacted");
    assert.equal(contactedEntries.length, 1);
    assert.equal(contactedEntries[0].followUpAt, new Date(followUp.dueAt).toISOString());
  });

  test("12. calling markContacted twice for the same mission does not create a second follow-up while the first is still active", async () => {
    await seedMission();
    const message = "Merhaba, kısa bir sorumuz olacaktı.";
    await approveCurrentDraft({ missionId: "m-1", leadId: "gmaps-abc", currentMessage: message });
    const first = await markContacted({
      missionId: "m-1",
      leadId: "gmaps-abc",
      currentMessage: message,
      channel: "whatsapp",
    });
    const second = await markContacted({
      missionId: "m-1",
      leadId: "gmaps-abc",
      currentMessage: message,
      channel: "whatsapp",
    });
    assert.equal(first.followUp.followUpId, second.followUp.followUpId);
    assert.equal(first.followUp.dueAt, second.followUp.dueAt);
  });
});

describe("recordReplyForDailyLoop / planDemoForDailyLoop close the follow-up loop", () => {
  test("13. a recorded reply completes the mission's active follow-up", async () => {
    await seedMission();
    await planFollowUp({ missionId: "m-1", leadId: "gmaps-abc", reason: "manual" });
    await recordReplyForDailyLoop({
      replyId: "reply-1",
      missionId: "m-1",
      leadId: "gmaps-abc",
      intent: "interested",
      urgency: "high",
    });
    const file = await readHermesFileOrEmpty(resolveHermesRuntimeFilePath());
    assert.equal(file.followUps["followup:m-1"].status, "completed");
  });

  test("14. a planned demo completes the mission's active follow-up", async () => {
    await seedMission();
    await planFollowUp({ missionId: "m-1", leadId: "gmaps-abc", reason: "manual" });
    await planDemoForDailyLoop({ demoId: "demo-1", missionId: "m-1", leadId: "gmaps-abc" });
    const file = await readHermesFileOrEmpty(resolveHermesRuntimeFilePath());
    assert.equal(file.followUps["followup:m-1"].status, "completed");
  });
});

describe("daily run lifecycle + restart durability", () => {
  test("15. starting twice for the same date resumes rather than duplicates", async () => {
    await seedMission();
    const first = await startOrResumeDailyRun("2026-07-29");
    const second = await startOrResumeDailyRun("2026-07-29");
    assert.equal(first.id, second.id);
    const file = await readHermesFileOrEmpty(resolveHermesRuntimeFilePath());
    assert.equal(Object.keys(file.dailyRuns).length, 1);
  });

  test("16. refreshing an unstarted date throws UnknownDailyRunError", async () => {
    await assert.rejects(() => refreshDailyQueue("2026-07-30"), UnknownDailyRunError);
  });

  test("17. selecting an item not in the queue throws", async () => {
    await seedMission();
    await startOrResumeDailyRun("2026-07-29");
    await assert.rejects(() => selectItem("2026-07-29", "ghost"), UnknownDailyRunItemError);
  });

  test("18. a fresh read after mutation reflects the same state a restarted process would see", async () => {
    await seedMission();
    await startOrResumeDailyRun("2026-07-29");
    await skipItem("2026-07-29", "m-1");

    // Simulate a process restart: read the file fresh, with nothing cached.
    const reread = await readHermesFileOrEmpty(resolveHermesRuntimeFilePath());
    assert.deepEqual(reread.dailyRuns["2026-07-29"].skippedItemIds, ["m-1"]);
  });

  test("19. buildDailyQueueSnapshot never mutates state — two consecutive reads agree", async () => {
    await seedMission();
    const a = await buildDailyQueueSnapshot("2026-07-29");
    const b = await buildDailyQueueSnapshot("2026-07-29");
    assert.deepEqual(a.items, b.items);
  });
});
