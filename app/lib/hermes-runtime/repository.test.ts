import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { putRoster } from "../operational-state/repository.ts";
import { resolveHermesRuntimeFilePath } from "./env.ts";
import { InvalidMissionTransitionError } from "./mission.ts";
import {
  createMission,
  decideMission,
  getApprovalSnapshot,
  getHermesState,
  getMission,
  InvalidRecordIdError,
  listDeliveries,
  listDemos,
  listMissions,
  listReplies,
  publishApprovalSnapshot,
  recordDelivery,
  recordDemo,
  recordReply,
  sweepExpiredApprovals,
  transitionMission,
  UnknownLeadError,
  UnknownMissionError,
  updateDemoStatus,
} from "./repository.ts";

/**
 * The durable Hermes repository.
 *
 * The repository holds no in-memory cache — every call reads the file — so a
 * fresh read here is exactly what a restarted process would see. The
 * end-to-end restart is exercised separately against a real dev server; these
 * tests pin the storage contract that makes it work.
 *
 * Each test points `LEAD_ENGINE_DATA_DIR` at a fresh temporary directory, so
 * neither `.data` nor `.env.local` is ever touched.
 */

let tempDir: string;
let previousDataDir: string | undefined;

beforeEach(async () => {
  previousDataDir = process.env.LEAD_ENGINE_DATA_DIR;
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tugobo-hermes-repo-"));
  process.env.LEAD_ENGINE_DATA_DIR = tempDir;
});

afterEach(async () => {
  if (previousDataDir === undefined) delete process.env.LEAD_ENGINE_DATA_DIR;
  else process.env.LEAD_ENGINE_DATA_DIR = previousDataDir;
  await fs.rm(tempDir, { recursive: true, force: true });
});

/** Gives the workspace a roster so membership becomes judgeable. */
async function seedRoster(ids: string[]): Promise<void> {
  await putRoster(
    ids.map((id) => ({ id, name: `Otel ${id}`, city: "Antalya" })),
  );
}

async function seedMission(missionId = "m-1", leadId = "gmaps-abc") {
  return createMission({ missionId, leadId, hotelName: "Otel A" });
}

describe("env wiring", () => {
  test("1. the Hermes file lands beside the operational file, in one data dir", () => {
    assert.equal(
      resolveHermesRuntimeFilePath(),
      path.join(tempDir, "hermes-runtime.json"),
    );
  });

  test("2. a fresh workspace reads as an empty runtime", async () => {
    const file = await getHermesState();
    assert.deepEqual(file.missions, {});
    assert.equal(await getMission("nope"), null);
  });
});

describe("mission lifecycle", () => {
  test("3. a mission is created and read back", async () => {
    const created = await seedMission();
    assert.equal(created.missionId, "m-1");
    assert.equal(created.leadId, "gmaps-abc");
    assert.equal(created.stage, "discover");

    const read = await getMission("m-1");
    assert.deepEqual(read, created);
  });

  test("4. creation is idempotent — a retry never resets the mission", async () => {
    await seedMission();
    await transitionMission("m-1", "verify", "");
    const again = await createMission({ missionId: "m-1", leadId: "gmaps-abc" });
    assert.equal(again.stage, "verify");
  });

  test("5. a legal transition is applied and persisted", async () => {
    await seedMission();
    await transitionMission("m-1", "verify", "kanal doğrulandı");
    const read = await getMission("m-1");
    assert.equal(read?.stage, "verify");
    assert.equal(read?.lastTransition?.reasonTr, "kanal doğrulandı");
  });

  test("6. an illegal transition is rejected and nothing is written", async () => {
    await seedMission();
    await transitionMission("m-1", "approval", "");
    const before = await getHermesState();

    await assert.rejects(
      () => transitionMission("m-1", "enrich", ""),
      InvalidMissionTransitionError,
    );

    const after = await getHermesState();
    assert.equal(after.revision, before.revision);
    assert.equal(after.missions["m-1"].stage, "approval");
  });

  test("7. transitioning an unknown mission is a 404-shaped rejection", async () => {
    await assert.rejects(() => transitionMission("ghost", "verify", ""), UnknownMissionError);
  });

  test("8. an invalid mission id is rejected before any read", async () => {
    await assert.rejects(
      () => createMission({ missionId: "../evil", leadId: "gmaps-abc" }),
      InvalidRecordIdError,
    );
  });

  test("9. missions list in stable creation order", async () => {
    await seedMission("m-b");
    await seedMission("m-a");
    const ids = (await listMissions()).map((m) => m.missionId);
    assert.deepEqual(ids.length, 2);
    assert.ok(ids.includes("m-a") && ids.includes("m-b"));
  });
});

describe("lead-id integrity", () => {
  test("10. a malformed lead id can never create a mission", async () => {
    for (const bad of ["", "../x", "a..b", "undefined lead"]) {
      await assert.rejects(
        () => createMission({ missionId: `m-${Math.random()}`, leadId: bad }),
        UnknownLeadError,
        `expected rejection for ${JSON.stringify(bad)}`,
      );
    }
  });

  test("11. a well-formed but unknown lead is rejected once the roster exists", async () => {
    await seedRoster(["gmaps-known"]);
    await assert.rejects(
      () => createMission({ missionId: "m-x", leadId: "gmaps-stranger" }),
      UnknownLeadError,
    );
    const ok = await createMission({ missionId: "m-y", leadId: "gmaps-known" });
    assert.equal(ok.leadId, "gmaps-known");
  });

  test("12. an empty workspace still accepts the very first mission", async () => {
    const mission = await createMission({ missionId: "m-first", leadId: "gmaps-first" });
    assert.equal(mission.leadId, "gmaps-first");
  });
});

describe("approval durability", () => {
  test("13. an approval snapshot is stored and read back", async () => {
    await seedMission();
    const snapshot = await publishApprovalSnapshot({
      missionId: "m-1",
      leadId: "gmaps-abc",
      founderApprovalStatus: "approved",
      courierDraftStatus: "approved",
      deliveryGatewayStatus: "blocked",
      approvedMessage: "Merhaba, kısa bir sorum olacaktı.",
    });
    assert.equal(snapshot.founderApprovalStatus, "approved");
    assert.ok(snapshot.messageHash);

    const read = await getApprovalSnapshot("m-1");
    assert.deepEqual(read, snapshot);
  });

  test("14. the approved message text itself is never persisted", async () => {
    await seedMission();
    await publishApprovalSnapshot({
      missionId: "m-1",
      leadId: "gmaps-abc",
      founderApprovalStatus: "approved",
      courierDraftStatus: "approved",
      deliveryGatewayStatus: "blocked",
      approvedMessage: "COK-GIZLI-METIN",
    });
    const raw = await fs.readFile(resolveHermesRuntimeFilePath(), "utf8");
    assert.equal(raw.includes("COK-GIZLI-METIN"), false);
  });

  test("15. an approval for an unknown mission is refused", async () => {
    await assert.rejects(
      () =>
        publishApprovalSnapshot({
          missionId: "ghost",
          leadId: "gmaps-abc",
          founderApprovalStatus: "approved",
          courierDraftStatus: "approved",
          deliveryGatewayStatus: "allowed",
        }),
      UnknownMissionError,
    );
  });

  test("16. an expired snapshot reads as missing but is not deleted by the read", async () => {
    await seedMission();
    const past = Date.now() - 60 * 60 * 1000;
    await publishApprovalSnapshot({
      missionId: "m-1",
      leadId: "gmaps-abc",
      founderApprovalStatus: "approved",
      courierDraftStatus: "approved",
      deliveryGatewayStatus: "allowed",
      now: past,
    });

    assert.equal(await getApprovalSnapshot("m-1"), null);
    const file = await getHermesState();
    assert.ok(file.approvals["m-1"], "the record survives the read");

    assert.equal(await sweepExpiredApprovals(), 1);
    assert.equal((await getHermesState()).approvals["m-1"], undefined);
  });

  test("17. re-publishing bumps the record revision", async () => {
    await seedMission();
    const base = {
      missionId: "m-1",
      leadId: "gmaps-abc",
      founderApprovalStatus: "pending" as const,
      courierDraftStatus: "draft" as const,
      deliveryGatewayStatus: "blocked" as const,
    };
    const first = await publishApprovalSnapshot(base);
    const second = await publishApprovalSnapshot(base);
    assert.equal(first.revision, 1);
    assert.equal(second.revision, 2);
  });
});

describe("reply durability", () => {
  test("18. a reply is stored, masked and capped", async () => {
    await seedMission();
    const reply = await recordReply({
      replyId: "r-1",
      providerMessageId: "wamid-1",
      fromMasked: "+90 5** *** ** 42",
      messageType: "text",
      textPreview: "y".repeat(400),
      missionId: "m-1",
      leadId: "gmaps-abc",
      intent: "demo_requested",
      urgency: "high",
    });
    assert.equal(reply.textPreview?.length, 160);
    assert.equal(reply.mapped, true);
    assert.equal(reply.intent, "demo_requested");

    const [read] = await listReplies();
    assert.deepEqual(read, reply);
  });

  test("19. a reply naming an unknown mission is refused", async () => {
    await assert.rejects(
      () => recordReply({ replyId: "r-1", missionId: "ghost" }),
      UnknownMissionError,
    );
  });

  test("20. an unmapped reply is still recorded", async () => {
    const reply = await recordReply({ replyId: "r-2", textPreview: "merhaba" });
    assert.equal(reply.mapped, false);
    assert.equal(reply.source, "unmapped");
  });
});

describe("demo durability", () => {
  test("21. a demo is stored and read back", async () => {
    await seedMission();
    const demo = await recordDemo({
      demoId: "d-1",
      missionId: "m-1",
      leadId: "gmaps-abc",
      status: "demo_requested",
      priority: "high",
      leadName: "Otel A",
    });
    assert.equal(demo.status, "demo_requested");
    assert.deepEqual((await listDemos())[0], demo);
  });

  test("22. only an explicit status change reaches a founder-decided status", async () => {
    await seedMission();
    await recordDemo({ demoId: "d-1", missionId: "m-1", status: "demo_requested" });
    const scheduled = await updateDemoStatus("d-1", "scheduled", 1_700_000_000_000);
    assert.equal(scheduled.status, "scheduled");
    assert.equal(scheduled.scheduledAt, 1_700_000_000_000);

    const completed = await updateDemoStatus("d-1", "completed", 1_700_000_100_000);
    assert.equal(completed.completedAt, 1_700_000_100_000);
    // The earlier stamp is preserved — a completed demo still knows when it was booked.
    assert.equal(completed.scheduledAt, 1_700_000_000_000);
  });

  test("23. updating an unknown demo is refused", async () => {
    await assert.rejects(() => updateDemoStatus("ghost", "scheduled"), InvalidRecordIdError);
  });
});

describe("delivery durability", () => {
  test("24. a delivery receipt is stored and read back", async () => {
    await seedMission();
    const delivery = await recordDelivery({
      providerMessageId: "wamid-1",
      status: "delivered",
      rawStatus: "delivered",
      missionId: "m-1",
      leadId: "gmaps-abc",
      occurredAt: 1_700_000_000_000,
    });
    assert.equal(delivery.status, "delivered");
    assert.equal(delivery.mapped, true);
    assert.deepEqual((await listDeliveries())[0], delivery);
  });

  test("25. re-recording the same provider message id updates in place", async () => {
    await seedMission();
    await recordDelivery({ providerMessageId: "wamid-1", status: "sent", missionId: "m-1" });
    const read = await recordDelivery({
      providerMessageId: "wamid-1",
      status: "read",
      missionId: "m-1",
    });
    assert.equal(read.status, "read");
    assert.equal(read.revision, 2);
    assert.equal((await listDeliveries()).length, 1);
  });
});

describe("the mandatory acceptance path", () => {
  test("26. mission + approval + reply + demo all survive a full re-read", async () => {
    await seedRoster(["gmaps-abc"]);

    await createMission({ missionId: "m-1", leadId: "gmaps-abc", hotelName: "Otel A" });
    await transitionMission("m-1", "approval", "hazırlık tamam");
    await decideMission("m-1", "approved");
    await publishApprovalSnapshot({
      missionId: "m-1",
      leadId: "gmaps-abc",
      founderApprovalStatus: "approved",
      courierDraftStatus: "approved",
      deliveryGatewayStatus: "blocked",
      approvedMessage: "Merhaba, kısa bir sorum olacaktı.",
    });
    await recordReply({
      replyId: "r-1",
      missionId: "m-1",
      leadId: "gmaps-abc",
      intent: "demo_requested",
      urgency: "high",
      textPreview: "Demo görebilir miyiz?",
    });
    await recordDemo({
      demoId: "d-1",
      missionId: "m-1",
      leadId: "gmaps-abc",
      status: "demo_requested",
      priority: "high",
    });
    await recordDelivery({
      providerMessageId: "wamid-1",
      status: "read",
      missionId: "m-1",
      leadId: "gmaps-abc",
    });

    // Everything below is read straight off disk — no cache to warm, which is
    // precisely why a restarted process sees the same thing.
    const file = await getHermesState();

    assert.equal(file.missions["m-1"].stage, "approval");
    assert.equal(file.missions["m-1"].decisionState, "approved");
    assert.equal(file.approvals["m-1"].founderApprovalStatus, "approved");
    assert.ok(file.approvals["m-1"].messageHash);
    assert.equal(file.replies["r-1"].intent, "demo_requested");
    assert.equal(file.demos["d-1"].status, "demo_requested");
    assert.equal(file.deliveries["wamid-1"].status, "read");
  });
});
