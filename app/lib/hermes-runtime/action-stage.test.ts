import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  ACTION_STAGE_LABELS,
  ACTION_STAGE_RANK,
  actionStageOf,
  computeActionQueue,
  SUGGESTED_ACTION_LABELS,
  type ActionStage,
} from "./action-stage.ts";
import type {
  HermesDeliveryRecord,
  HermesDemoRecord,
  HermesMissionRecord,
  HermesReplyRecord,
  MissionStage,
} from "./schema.ts";

/**
 * The ported Founder Revenue Workspace precedence.
 *
 * This is the codebase's single ranking function, and the reconciliation
 * discovery flagged rewriting it as the duplication risk to avoid. These
 * assertions exist so a later sprint that "improves" the order has to do it
 * deliberately, in one place, with the tests in hand.
 */

const ISO = "2026-07-28T09:00:00.000Z";

function mission(missionId: string, stage: MissionStage = "prepare"): HermesMissionRecord {
  return {
    missionId,
    leadId: "gmaps-abc",
    hotelName: "Otel A",
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
    createdAt: ISO,
    updatedAt: ISO,
    revision: 0,
  };
}

function delivery(
  missionId: string | null,
  status: HermesDeliveryRecord["status"],
): HermesDeliveryRecord {
  return {
    providerMessageId: `wamid-${missionId}-${status}`,
    provider: "whatsapp",
    status,
    rawStatus: status,
    occurredAt: 1_700_000_000_000,
    missionId,
    leadId: "gmaps-abc",
    mapped: missionId !== null,
    createdAt: ISO,
    updatedAt: ISO,
    revision: 0,
  };
}

function reply(
  missionId: string | null,
  over: Partial<HermesReplyRecord> = {},
): HermesReplyRecord {
  return {
    replyId: `r-${missionId}`,
    provider: "whatsapp",
    providerMessageId: "wamid-1",
    fromMasked: null,
    messageType: "text",
    textPreview: null,
    occurredAt: 1_700_000_000_000,
    conversationIdSafe: null,
    contactProfileNameSafe: null,
    mapped: missionId !== null,
    missionId,
    leadId: "gmaps-abc",
    intent: "unknown",
    urgency: "low",
    source: missionId !== null ? "provider_message_registry" : "unmapped",
    createdAt: ISO,
    updatedAt: ISO,
    revision: 0,
    ...over,
  };
}

function demo(
  missionId: string | null,
  status: HermesDemoRecord["status"],
): HermesDemoRecord {
  return {
    demoId: `d-${missionId}`,
    missionId,
    leadId: "gmaps-abc",
    provider: "whatsapp",
    sourceProviderMessageId: null,
    sourceIntent: "demo_requested",
    status,
    priority: "high",
    leadName: null,
    suggestedAction: "",
    reason: "",
    scheduledAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: ISO,
    updatedAt: ISO,
    revision: 0,
  };
}

const ORDER: ActionStage[] = [
  "failed",
  "hot_reply",
  "demo_pending",
  "follow_up_required",
  "outcome_required",
  "reply_needs_review",
  "reply_received",
  "approval_required",
  "read",
  "delivered",
  "sent",
  "ready",
  "won",
  "lost",
  "unknown",
];

describe("the ladder itself", () => {
  test("1. the rank order is the ported one, exactly", () => {
    assert.deepEqual(
      ORDER.map((stage) => ACTION_STAGE_RANK[stage]),
      ORDER.map((_, index) => index),
    );
  });

  test("2. every stage has a Turkish label and a suggested action", () => {
    for (const stage of ORDER) {
      assert.ok(ACTION_STAGE_LABELS[stage].length > 0, stage);
      assert.ok(SUGGESTED_ACTION_LABELS[stage].length > 0, stage);
    }
  });
});

describe("precedence", () => {
  test("3. failed beats everything below it", () => {
    const stage = actionStageOf(mission("m-1", "approval"), {
      deliveries: [delivery("m-1", "failed")],
      replies: [reply("m-1", { urgency: "high" })],
      demos: [demo("m-1", "demo_requested")],
      followUps: [{ missionId: "m-1", status: "candidate" }],
      salesOutcomes: [{ missionId: "m-1", status: "open" }],
    });
    assert.equal(stage, "failed");
  });

  test("4. hot_reply beats demo_pending and everything below", () => {
    const stage = actionStageOf(mission("m-1", "approval"), {
      replies: [reply("m-1", { urgency: "high" })],
      demos: [demo("m-1", "demo_requested")],
      followUps: [{ missionId: "m-1", status: "candidate" }],
    });
    assert.equal(stage, "hot_reply");
  });

  test("5. `interested` counts as hot even at medium urgency", () => {
    const stage = actionStageOf(mission("m-1"), {
      replies: [reply("m-1", { intent: "interested", urgency: "medium" })],
    });
    assert.equal(stage, "hot_reply");
  });

  test("6. demo_pending beats follow_up_required", () => {
    const stage = actionStageOf(mission("m-1"), {
      demos: [demo("m-1", "scheduling_needed")],
      followUps: [{ missionId: "m-1", status: "candidate" }],
    });
    assert.equal(stage, "demo_pending");
  });

  test("7. a resolved demo no longer holds the mission at demo_pending", () => {
    const stage = actionStageOf(mission("m-1", "approval"), {
      demos: [demo("m-1", "scheduled")],
    });
    assert.equal(stage, "approval_required");
  });

  test("8. an unclassifiable reply routes to review, not to reply_received", () => {
    const stage = actionStageOf(mission("m-1"), {
      replies: [reply("m-1", { intent: "human_review_required" })],
    });
    assert.equal(stage, "reply_needs_review");
  });

  test("9. approval_required outranks every delivery state", () => {
    const stage = actionStageOf(mission("m-1", "approval"), {
      deliveries: [delivery("m-1", "read")],
    });
    assert.equal(stage, "approval_required");
  });

  test("10. read > delivered > sent", () => {
    assert.equal(
      actionStageOf(mission("m-1"), { deliveries: [delivery("m-1", "read")] }),
      "read",
    );
    assert.equal(
      actionStageOf(mission("m-1"), { deliveries: [delivery("m-1", "delivered")] }),
      "delivered",
    );
    assert.equal(
      actionStageOf(mission("m-1"), { deliveries: [delivery("m-1", "sent")] }),
      "sent",
    );
  });

  test("11. execution-ready with nothing else is `ready`", () => {
    assert.equal(actionStageOf(mission("m-1", "execution-ready")), "ready");
  });

  test("12. won and lost rank last, but still rank", () => {
    assert.equal(
      actionStageOf(mission("m-1"), { salesOutcomes: [{ missionId: "m-1", status: "won" }] }),
      "won",
    );
    assert.equal(
      actionStageOf(mission("m-1"), { salesOutcomes: [{ missionId: "m-1", status: "lost" }] }),
      "lost",
    );
  });

  test("13. a stray follow-up after a won deal still wins the founder's attention", () => {
    const stage = actionStageOf(mission("m-1"), {
      followUps: [{ missionId: "m-1", status: "candidate" }],
      salesOutcomes: [{ missionId: "m-1", status: "won" }],
    });
    assert.equal(stage, "follow_up_required");
  });

  test("14. a bare mission is `unknown`", () => {
    assert.equal(actionStageOf(mission("m-1")), "unknown");
  });

  test("15. records belonging to another mission never leak across", () => {
    const stage = actionStageOf(mission("m-1"), {
      deliveries: [delivery("m-2", "failed")],
      replies: [reply("m-2", { urgency: "high" })],
      demos: [demo("m-2", "demo_requested")],
    });
    assert.equal(stage, "unknown");
  });

  test("16. an unmapped reply attaches to no mission", () => {
    const stage = actionStageOf(mission("m-1"), {
      replies: [reply(null, { urgency: "high" })],
    });
    assert.equal(stage, "unknown");
  });
});

describe("queue", () => {
  test("17. the queue sorts by rank, most urgent first", () => {
    const queue = computeActionQueue(
      [mission("m-ready", "execution-ready"), mission("m-approval", "approval"), mission("m-hot")],
      { replies: [reply("m-hot", { urgency: "high" })] },
    );
    assert.deepEqual(
      queue.map((entry) => entry.stage),
      ["hot_reply", "approval_required", "ready"],
    );
  });

  test("18. ties break deterministically, so two reads never disagree", () => {
    const queue = computeActionQueue([mission("m-b"), mission("m-a"), mission("m-c")]);
    assert.deepEqual(
      queue.map((entry) => entry.missionId),
      ["m-a", "m-b", "m-c"],
    );
  });

  test("19. each entry carries the founder-facing label and suggestion", () => {
    const [entry] = computeActionQueue([mission("m-1", "approval")]);
    assert.equal(entry.stage, "approval_required");
    assert.equal(entry.stageLabel, "Onay Bekliyor");
    assert.equal(entry.suggestedAction, "Founder onayı bekleniyor");
    assert.equal(entry.leadId, "gmaps-abc");
  });
});
