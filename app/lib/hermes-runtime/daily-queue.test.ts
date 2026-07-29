import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { computeActionQueue } from "./action-stage.ts";
import { computeHermesDailyActionItems, summarizeDailyQueue } from "./daily-queue.ts";
import { buildFollowUpRecord } from "./follow-up.ts";
import type { HermesMissionRecord, MissionStage } from "./schema.ts";

const NOW = Date.parse("2026-07-29T09:00:00.000Z");
const NOW_ISO = new Date(NOW).toISOString();
const START_OF_DAY = Date.parse("2026-07-29T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function mission(missionId: string, stage: MissionStage = "execution-ready"): HermesMissionRecord {
  return {
    missionId,
    leadId: `lead-${missionId}`,
    hotelName: `Otel ${missionId}`,
    stage,
    stageLabel: stage,
    progress: 0,
    status: "",
    decisionState: "not-required",
    approvalRequired: true,
    primaryTaskId: "",
    tasks: [],
    timeline: [],
    lastTransition: null,
    failure: null,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    revision: 0,
  };
}

describe("HOT_NOW / precedence parity", () => {
  test("1. daily-queue rank order matches computeActionQueue exactly", () => {
    const missions = [mission("m-ready", "execution-ready"), mission("m-approval", "approval")];
    const rawQueue = computeActionQueue(missions, {});
    const items = computeHermesDailyActionItems({
      missions,
      startOfLocalDayMs: START_OF_DAY,
      now: NOW,
    });
    assert.deepEqual(
      items.map((i) => i.id),
      rawQueue.map((e) => e.missionId),
    );
    assert.deepEqual(
      items.map((i) => i.actionState),
      rawQueue.map((e) => e.stage),
    );
  });

  test("2. no duplicate mission ids in the projected queue", () => {
    const missions = [mission("m-1"), mission("m-2"), mission("m-3", "approval")];
    const items = computeHermesDailyActionItems({ missions, startOfLocalDayMs: START_OF_DAY, now: NOW });
    const ids = items.map((i) => i.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe("follow-up due-awareness", () => {
  test("3. a follow-up not yet due does not surface as follow_up_required", () => {
    const missions = [mission("m-1", "execution-ready")];
    const notYetDue = {
      ...buildFollowUpRecord({ missionId: "m-1", leadId: "lead-m-1", reason: "manual" }, NOW_ISO),
      dueAt: NOW + 5 * DAY,
    };
    const items = computeHermesDailyActionItems({
      missions,
      followUps: [notYetDue],
      startOfLocalDayMs: START_OF_DAY,
      now: NOW,
    });
    assert.equal(items[0].actionState, "ready");
  });

  test("4. a due, active follow-up surfaces as follow_up_required with dueAt populated", () => {
    const missions = [mission("m-1", "execution-ready")];
    const due = {
      ...buildFollowUpRecord({ missionId: "m-1", leadId: "lead-m-1", reason: "manual" }, NOW_ISO),
      dueAt: NOW - 60_000,
    };
    const items = computeHermesDailyActionItems({
      missions,
      followUps: [due],
      startOfLocalDayMs: START_OF_DAY,
      now: NOW,
    });
    assert.equal(items[0].actionState, "follow_up_required");
    assert.equal(items[0].dueAt, new Date(due.dueAt).toISOString());
  });

  test("5. a completed follow-up never surfaces as follow_up_required even if its old dueAt has passed", () => {
    const missions = [mission("m-1", "execution-ready")];
    const completed = {
      ...buildFollowUpRecord({ missionId: "m-1", leadId: "lead-m-1", reason: "manual" }, NOW_ISO),
      dueAt: NOW - 60_000,
      status: "completed" as const,
    };
    const items = computeHermesDailyActionItems({
      missions,
      followUps: [completed],
      startOfLocalDayMs: START_OF_DAY,
      now: NOW,
    });
    assert.equal(items[0].actionState, "ready");
  });
});

describe("decoration fields", () => {
  test("6. reasonCodes and messageReadiness are attached per item", () => {
    const missions = [mission("m-1", "execution-ready")];
    const items = computeHermesDailyActionItems({
      missions,
      startOfLocalDayMs: START_OF_DAY,
      now: NOW,
      leadLookup: () => ({ hasWhatsAppChannel: true, workspace: undefined }),
    });
    assert.equal(items[0].messageReadiness, "needs_research");
    assert.equal(items[0].reasonCodes[0]?.code, "NEEDS_RESEARCH");
  });
});

describe("summarizeDailyQueue", () => {
  test("7. counts land in the right buckets", () => {
    const items = computeHermesDailyActionItems({
      missions: [
        mission("m-approval", "approval"),
        mission("m-ready", "execution-ready"),
      ],
      startOfLocalDayMs: START_OF_DAY,
      now: NOW,
    });
    const summary = summarizeDailyQueue(items);
    assert.equal(summary.scanned, 2);
    assert.equal(summary.waitingFounder, 1);
    assert.equal(summary.actionable, 1);
  });
  test("8. won/lost land in completed, not actionable, regardless of mission stage", () => {
    // v3.8.1 fix: a terminal outcome resolves before any transient signal,
    // so this holds for a mission at `execution-ready` too — not only for one
    // parked at `completed` with no delivery info, as it required before.
    const items = computeHermesDailyActionItems({
      missions: [mission("m-1", "execution-ready")],
      salesOutcomes: [
        {
          outcomeId: "outcome:m-1",
          missionId: "m-1",
          leadId: "lead-m-1",
          status: "won",
          package: "growth",
          estimatedMrr: null,
          lostReason: null,
          note: "",
          createdAt: NOW_ISO,
          updatedAt: NOW_ISO,
          closedAt: NOW,
          revision: 0,
        },
      ],
      startOfLocalDayMs: START_OF_DAY,
      now: NOW,
    });
    assert.equal(items[0].actionState, "won");
    const summary = summarizeDailyQueue(items);
    assert.equal(summary.completed, 1);
    assert.equal(summary.actionable, 0);
    assert.equal(summary.waitingFounder, 0);
  });

  test("9. a won outcome on an already-sent mission is no longer counted as actionable — the release-blocker scenario", () => {
    const items = computeHermesDailyActionItems({
      missions: [mission("m-1", "execution-ready")],
      deliveries: [
        {
          providerMessageId: "wamid-1",
          provider: "whatsapp",
          status: "sent",
          rawStatus: "sent",
          occurredAt: NOW,
          missionId: "m-1",
          leadId: "lead-m-1",
          mapped: true,
          createdAt: NOW_ISO,
          updatedAt: NOW_ISO,
          revision: 0,
        },
      ],
      salesOutcomes: [
        {
          outcomeId: "outcome:m-1",
          missionId: "m-1",
          leadId: "lead-m-1",
          status: "won",
          package: "growth",
          estimatedMrr: null,
          lostReason: null,
          note: "",
          createdAt: NOW_ISO,
          updatedAt: NOW_ISO,
          closedAt: NOW,
          revision: 0,
        },
      ],
      startOfLocalDayMs: START_OF_DAY,
      now: NOW,
    });
    assert.equal(items[0].actionState, "won");
    const summary = summarizeDailyQueue(items);
    assert.equal(summary.actionable, 0);
    assert.equal(summary.completed, 1);
  });

  test("10. a lost outcome on a hot-reply mission is counted as completed, not reply-attention", () => {
    const items = computeHermesDailyActionItems({
      missions: [mission("m-1", "execution-ready")],
      replies: [
        {
          replyId: "r-1",
          provider: "whatsapp",
          providerMessageId: "wamid-1",
          fromMasked: null,
          messageType: "text",
          textPreview: null,
          occurredAt: NOW,
          conversationIdSafe: null,
          contactProfileNameSafe: null,
          mapped: true,
          missionId: "m-1",
          leadId: "lead-m-1",
          intent: "interested",
          urgency: "high",
          source: "provider_message_registry",
          createdAt: NOW_ISO,
          updatedAt: NOW_ISO,
          revision: 0,
        },
      ],
      salesOutcomes: [
        {
          outcomeId: "outcome:m-1",
          missionId: "m-1",
          leadId: "lead-m-1",
          status: "lost",
          package: null,
          estimatedMrr: null,
          lostReason: "budget",
          note: "",
          createdAt: NOW_ISO,
          updatedAt: NOW_ISO,
          closedAt: NOW,
          revision: 0,
        },
      ],
      startOfLocalDayMs: START_OF_DAY,
      now: NOW,
    });
    assert.equal(items[0].actionState, "lost");
    const summary = summarizeDailyQueue(items);
    assert.equal(summary.replyAttention, 0);
    assert.equal(summary.actionable, 0);
    assert.equal(summary.completed, 1);
  });
});
