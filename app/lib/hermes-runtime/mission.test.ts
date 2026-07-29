import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  applyMissionDecision,
  applyMissionFailure,
  applyMissionStageTransition,
  buildMissionRecord,
  canTransitionDecisionState,
  canTransitionMissionStage,
  InvalidDecisionTransitionError,
  InvalidMissionTransitionError,
  nextMissionStage,
} from "./mission.ts";
import {
  MISSION_STAGE_LABELS,
  MISSION_STAGE_ORDER,
  MISSION_STAGE_PROGRESS,
  type MissionStage,
} from "./schema.ts";

/**
 * The mission state machine. Pure — no filesystem, no environment.
 *
 * These assertions exist to pin the *ported* ladder in place: if a later sprint
 * reorders `MISSION_STAGE_PROGRESS`, several of these fail rather than the
 * ordering silently changing under the founder.
 */

const NOW = "2026-07-28T09:00:00.000Z";

function fresh(stage?: MissionStage) {
  return buildMissionRecord(
    { missionId: "m-1", leadId: "gmaps-abc", hotelName: "Otel A", stage },
    NOW,
  );
}

describe("ported ladder", () => {
  test("1. the stage order is the Hermes progress ladder, ascending", () => {
    assert.deepEqual(MISSION_STAGE_ORDER, [
      "discover",
      "verify",
      "enrich",
      "prepare",
      "approval",
      "execution-ready",
      "completed",
    ]);
  });

  test("2. progress is strictly increasing along that order", () => {
    for (let i = 1; i < MISSION_STAGE_ORDER.length; i += 1) {
      assert.ok(
        MISSION_STAGE_PROGRESS[MISSION_STAGE_ORDER[i]] >
          MISSION_STAGE_PROGRESS[MISSION_STAGE_ORDER[i - 1]],
        `${MISSION_STAGE_ORDER[i]} must rank above ${MISSION_STAGE_ORDER[i - 1]}`,
      );
    }
  });

  test("3. every stage has a Turkish label", () => {
    for (const stage of MISSION_STAGE_ORDER) {
      assert.ok(MISSION_STAGE_LABELS[stage].length > 0);
    }
  });
});

describe("stage transitions", () => {
  test("4. a forward step is legal", () => {
    assert.equal(canTransitionMissionStage("discover", "verify"), true);
    assert.equal(canTransitionMissionStage("prepare", "approval"), true);
  });

  test("5. skipping forward is legal — a mission may jump rungs", () => {
    assert.equal(canTransitionMissionStage("discover", "execution-ready"), true);
  });

  test("6. moving backwards is rejected", () => {
    assert.equal(canTransitionMissionStage("approval", "enrich"), false);
    assert.equal(canTransitionMissionStage("execution-ready", "approval"), false);
  });

  test("7. re-declaring the current stage is rejected", () => {
    assert.equal(canTransitionMissionStage("enrich", "enrich"), false);
  });

  test("8. completed is terminal", () => {
    for (const stage of MISSION_STAGE_ORDER) {
      assert.equal(canTransitionMissionStage("completed", stage), false);
    }
  });

  test("9. nextMissionStage walks the ladder and stops at the end", () => {
    assert.equal(nextMissionStage("discover"), "verify");
    assert.equal(nextMissionStage("execution-ready"), "completed");
    assert.equal(nextMissionStage("completed"), null);
  });

  test("10. applying a legal transition updates stage, label, progress and revision", () => {
    const next = applyMissionStageTransition(fresh(), "verify", "kanal doğrulandı", NOW);
    assert.equal(next.stage, "verify");
    assert.equal(next.stageLabel, "Doğrulama");
    assert.equal(next.progress, MISSION_STAGE_PROGRESS.verify);
    assert.equal(next.revision, 1);
    assert.deepEqual(next.lastTransition, {
      from: "discover",
      to: "verify",
      at: Date.parse(NOW),
      reasonTr: "kanal doğrulandı",
    });
  });

  test("11. an illegal transition throws and mutates nothing", () => {
    const record = applyMissionStageTransition(fresh(), "approval", "", NOW);
    assert.throws(
      () => applyMissionStageTransition(record, "enrich", "", NOW),
      InvalidMissionTransitionError,
    );
    assert.equal(record.stage, "approval");
    assert.equal(record.revision, 1);
  });

  test("12. reaching the approval stage starts the decision as pending", () => {
    const record = fresh();
    assert.equal(record.decisionState, "not-required");
    const next = applyMissionStageTransition(record, "approval", "", NOW);
    assert.equal(next.decisionState, "pending");
  });

  test("13. a mission created at the approval stage is already pending", () => {
    assert.equal(fresh("approval").decisionState, "pending");
  });

  test("14. moving forward clears a recorded failure", () => {
    const failed = applyMissionFailure(fresh(), "no_channel", "Kanal yok", NOW);
    assert.notEqual(failed.failure, null);
    const recovered = applyMissionStageTransition(failed, "verify", "", NOW);
    assert.equal(recovered.failure, null);
  });

  test("15. every transition appends exactly one timeline line", () => {
    const record = fresh();
    const before = record.timeline.length;
    const next = applyMissionStageTransition(record, "verify", "", NOW);
    assert.equal(next.timeline.length, before + 1);
    assert.match(next.timeline.at(-1)!.text, /Keşif → Doğrulama/);
  });
});

describe("decision transitions", () => {
  test("16. not-required → pending → approved is the legal path", () => {
    assert.equal(canTransitionDecisionState("not-required", "pending"), true);
    assert.equal(canTransitionDecisionState("pending", "approved"), true);
    assert.equal(canTransitionDecisionState("pending", "rejected"), true);
  });

  test("17. a decided mission cannot silently return to pending", () => {
    assert.equal(canTransitionDecisionState("approved", "pending"), false);
    assert.equal(canTransitionDecisionState("rejected", "pending"), false);
  });

  test("18. approving straight from not-required is rejected", () => {
    assert.equal(canTransitionDecisionState("not-required", "approved"), false);
    assert.throws(
      () => applyMissionDecision(fresh(), "approved", NOW),
      InvalidDecisionTransitionError,
    );
  });

  test("19. an approval is recorded on the timeline as the founder's", () => {
    const pending = applyMissionStageTransition(fresh(), "approval", "", NOW);
    const approved = applyMissionDecision(pending, "approved", NOW);
    assert.equal(approved.decisionState, "approved");
    assert.equal(approved.timeline.at(-1)!.actorLabel, "Founder");
    assert.equal(approved.revision, pending.revision + 1);
  });
});
