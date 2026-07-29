import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { deriveFounderActionReasons, type DeriveReasonsInput } from "./reason.ts";
import { buildFollowUpRecord } from "./follow-up.ts";
import type { ActionStage } from "./action-stage.ts";

const START_OF_DAY = Date.parse("2026-07-29T00:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function baseInput(stage: ActionStage, overrides: Partial<DeriveReasonsInput> = {}): DeriveReasonsInput {
  return {
    entry: { missionId: "m-1", leadId: "gmaps-abc", stage },
    messageReadiness: "not_required",
    startOfLocalDayMs: START_OF_DAY,
    ...overrides,
  };
}

describe("primary reason per stage", () => {
  test("1. failed → DELIVERY_FAILED", () => {
    const reasons = deriveFounderActionReasons(baseInput("failed"));
    assert.equal(reasons[0].code, "DELIVERY_FAILED");
    assert.equal(reasons[0].priority, 0);
  });
  test("2. hot_reply → HOT_REPLY", () => {
    assert.equal(deriveFounderActionReasons(baseInput("hot_reply"))[0].code, "HOT_REPLY");
  });
  test("3. demo_pending → DEMO_PENDING", () => {
    assert.equal(deriveFounderActionReasons(baseInput("demo_pending"))[0].code, "DEMO_PENDING");
  });
  test("4. outcome_required → OUTCOME_REQUIRED", () => {
    assert.equal(deriveFounderActionReasons(baseInput("outcome_required"))[0].code, "OUTCOME_REQUIRED");
  });
  test("5. approval_required → APPROVAL_REQUIRED", () => {
    assert.equal(deriveFounderActionReasons(baseInput("approval_required"))[0].code, "APPROVAL_REQUIRED");
  });
  test("6. ready + ready draft → MESSAGE_READY", () => {
    const reasons = deriveFounderActionReasons(baseInput("ready", { messageReadiness: "ready" }));
    assert.equal(reasons[0].code, "MESSAGE_READY");
  });
  test("7. ready + no draft → NEEDS_RESEARCH", () => {
    const reasons = deriveFounderActionReasons(baseInput("ready", { messageReadiness: "needs_research" }));
    assert.equal(reasons[0].code, "NEEDS_RESEARCH");
  });
  test("8. sent (no readiness question) → no primary reason", () => {
    const reasons = deriveFounderActionReasons(baseInput("sent"));
    assert.equal(reasons.length, 0);
  });
});

describe("follow-up due vs overdue", () => {
  test("9. dueAt before start-of-day → FOLLOW_UP_OVERDUE", () => {
    const followUp = {
      ...buildFollowUpRecord(
        { missionId: "m-1", leadId: "gmaps-abc", reason: "later_requested" },
        new Date(START_OF_DAY - 48 * HOUR).toISOString(),
      ),
      dueAt: START_OF_DAY - HOUR,
    };
    const reasons = deriveFounderActionReasons(
      baseInput("follow_up_required", { followUp }),
    );
    assert.equal(reasons[0].code, "FOLLOW_UP_OVERDUE");
  });
  test("10. dueAt on/after start-of-day → FOLLOW_UP_DUE_TODAY", () => {
    const followUp = {
      ...buildFollowUpRecord(
        { missionId: "m-1", leadId: "gmaps-abc", reason: "later_requested" },
        new Date(START_OF_DAY).toISOString(),
      ),
      dueAt: START_OF_DAY + HOUR,
    };
    const reasons = deriveFounderActionReasons(
      baseInput("follow_up_required", { followUp }),
    );
    assert.equal(reasons[0].code, "FOLLOW_UP_DUE_TODAY");
  });
});

describe("supporting signals", () => {
  test("11. verified WhatsApp is appended after the primary reason", () => {
    const reasons = deriveFounderActionReasons(
      baseInput("hot_reply", { leadSignals: { whatsappConfidence: "confirmed" } }),
    );
    assert.deepEqual(
      reasons.map((r) => r.code),
      ["HOT_REPLY", "VERIFIED_WHATSAPP"],
    );
  });
  test("12. high ICP fit (>=70) is appended", () => {
    const reasons = deriveFounderActionReasons(
      baseInput("demo_pending", { leadSignals: { icpFitScore: 82 } }),
    );
    assert.ok(reasons.some((r) => r.code === "HIGH_ICP"));
  });
  test("13. low ICP fit is not appended", () => {
    const reasons = deriveFounderActionReasons(
      baseInput("demo_pending", { leadSignals: { icpFitScore: 40 } }),
    );
    assert.equal(reasons.some((r) => r.code === "HIGH_ICP"), false);
  });
  test("14. high verified opportunity score (>=75) is appended", () => {
    const reasons = deriveFounderActionReasons(
      baseInput("outcome_required", { leadSignals: { verifiedOpportunityScore: 90 } }),
    );
    assert.ok(reasons.some((r) => r.code === "HIGH_OPPORTUNITY"));
  });
  test("15. deterministic order — primary, whatsapp, icp, opportunity", () => {
    const reasons = deriveFounderActionReasons(
      baseInput("hot_reply", {
        leadSignals: { whatsappConfidence: "confirmed", icpFitScore: 90, verifiedOpportunityScore: 90 },
      }),
    );
    assert.deepEqual(
      reasons.map((r) => r.code),
      ["HOT_REPLY", "VERIFIED_WHATSAPP", "HIGH_ICP", "HIGH_OPPORTUNITY"],
    );
  });
  test("16. no duplicate reason codes", () => {
    const reasons = deriveFounderActionReasons(
      baseInput("hot_reply", {
        leadSignals: { whatsappConfidence: "confirmed", icpFitScore: 90, verifiedOpportunityScore: 90 },
      }),
    );
    const codes = reasons.map((r) => r.code);
    assert.equal(new Set(codes).size, codes.length);
  });
});

describe("evidence grounding", () => {
  test("17. every reason carries a non-empty, grounded evidenceRefs entry", () => {
    const reasons = deriveFounderActionReasons(
      baseInput("hot_reply", { leadSignals: { whatsappConfidence: "confirmed" } }),
    );
    for (const reason of reasons) {
      assert.ok(reason.evidenceRefs.length > 0, reason.code);
      assert.ok(
        reason.evidenceRefs.every((ref) => ref.startsWith("mission:") || ref.startsWith("lead:") || ref.startsWith("followUp:")),
        reason.code,
      );
    }
  });
});
