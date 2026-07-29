import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  applyFollowUpStatusTransition,
  buildFollowUpRecord,
  canTransitionFollowUpStatus,
  computeFollowUpDueAt,
  InvalidFollowUpTransitionError,
  isActiveFollowUpStatus,
  isStaleFollowUp,
  replanFollowUpRecord,
} from "./follow-up.ts";
import type { FollowUpRecord } from "./schema.ts";

const NOW = Date.parse("2026-07-29T09:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;

describe("computeFollowUpDueAt — the one canonical helper", () => {
  test("1. preset +1 day wins regardless of reason", () => {
    assert.equal(computeFollowUpDueAt(NOW, "read_no_reply", 1), NOW + 24 * HOUR);
  });
  test("2. preset +3 day wins regardless of reason", () => {
    assert.equal(computeFollowUpDueAt(NOW, "hot_reply_needs_action", 3), NOW + 72 * HOUR);
  });
  test("3. read_no_reply → +24h", () => {
    assert.equal(computeFollowUpDueAt(NOW, "read_no_reply"), NOW + 24 * HOUR);
  });
  test("4. delivered_no_reply → +48h", () => {
    assert.equal(computeFollowUpDueAt(NOW, "delivered_no_reply"), NOW + 48 * HOUR);
  });
  test("5. hot_reply_needs_action → +30min", () => {
    assert.equal(computeFollowUpDueAt(NOW, "hot_reply_needs_action"), NOW + 30 * MIN);
  });
  test("6. demo_not_scheduled → +4h", () => {
    assert.equal(computeFollowUpDueAt(NOW, "demo_not_scheduled"), NOW + 4 * HOUR);
  });
  test("7. demo_no_show → +24h", () => {
    assert.equal(computeFollowUpDueAt(NOW, "demo_no_show"), NOW + 24 * HOUR);
  });
  test("8. failed_delivery_recovery → +15min", () => {
    assert.equal(computeFollowUpDueAt(NOW, "failed_delivery_recovery"), NOW + 15 * MIN);
  });
  test("9. later_requested / manual / unknown fall back to +72h", () => {
    assert.equal(computeFollowUpDueAt(NOW, "later_requested"), NOW + 72 * HOUR);
    assert.equal(computeFollowUpDueAt(NOW, "manual"), NOW + 72 * HOUR);
    assert.equal(computeFollowUpDueAt(NOW, "unknown"), NOW + 72 * HOUR);
  });
});

describe("isActiveFollowUpStatus", () => {
  test("10. candidate and approval_required are active", () => {
    assert.equal(isActiveFollowUpStatus("candidate"), true);
    assert.equal(isActiveFollowUpStatus("approval_required"), true);
  });
  test("11. approved, dismissed, completed, expired, not_needed are not active", () => {
    for (const status of ["approved", "dismissed", "completed", "expired", "not_needed"] as const) {
      assert.equal(isActiveFollowUpStatus(status), false, status);
    }
  });
});

describe("buildFollowUpRecord", () => {
  test("12. starts as candidate with a deterministic id", () => {
    const record = buildFollowUpRecord(
      { missionId: "m-1", leadId: "gmaps-abc", reason: "later_requested" },
      new Date(NOW).toISOString(),
    );
    assert.equal(record.followUpId, "followup:m-1");
    assert.equal(record.status, "candidate");
    assert.equal(record.completedAt, null);
    assert.equal(record.cancelledAt, null);
    assert.equal(record.dueAt, NOW + 72 * HOUR);
  });
});

describe("status transitions", () => {
  test("13. candidate → approval_required → approved → completed is legal", () => {
    assert.equal(canTransitionFollowUpStatus("candidate", "approval_required"), true);
    assert.equal(canTransitionFollowUpStatus("approval_required", "approved"), true);
    assert.equal(canTransitionFollowUpStatus("approved", "completed"), true);
  });
  test("14. completed, dismissed, expired are terminal", () => {
    assert.equal(canTransitionFollowUpStatus("completed", "candidate"), false);
    assert.equal(canTransitionFollowUpStatus("dismissed", "candidate"), false);
    assert.equal(canTransitionFollowUpStatus("expired", "candidate"), false);
  });
  test("15. applyFollowUpStatusTransition throws on an illegal move", () => {
    const record = buildFollowUpRecord(
      { missionId: "m-1", leadId: "gmaps-abc", reason: "manual" },
      new Date(NOW).toISOString(),
    );
    const completed = applyFollowUpStatusTransition(record, "completed", new Date(NOW).toISOString());
    assert.throws(
      () => applyFollowUpStatusTransition(completed, "candidate", new Date(NOW).toISOString()),
      InvalidFollowUpTransitionError,
    );
  });
  test("16. completed stamps completedAt; dismissed stamps cancelledAt", () => {
    const record = buildFollowUpRecord(
      { missionId: "m-1", leadId: "gmaps-abc", reason: "manual" },
      new Date(NOW).toISOString(),
    );
    const at = new Date(NOW + HOUR).toISOString();
    const completed = applyFollowUpStatusTransition(record, "completed", at);
    assert.equal(completed.completedAt, NOW + HOUR);
    assert.equal(completed.cancelledAt, null);

    const record2 = buildFollowUpRecord(
      { missionId: "m-2", leadId: "gmaps-def", reason: "manual" },
      new Date(NOW).toISOString(),
    );
    const dismissed = applyFollowUpStatusTransition(record2, "dismissed", at);
    assert.equal(dismissed.cancelledAt, NOW + HOUR);
    assert.equal(dismissed.completedAt, null);
  });
});

describe("replanFollowUpRecord", () => {
  test("17. resets to candidate, recomputes dueAt, clears completion/cancellation", () => {
    const base: FollowUpRecord = {
      ...buildFollowUpRecord({ missionId: "m-1", leadId: "gmaps-abc", reason: "manual" }, new Date(NOW).toISOString()),
      status: "dismissed",
      cancelledAt: NOW,
    };
    const replanned = replanFollowUpRecord(base, "read_no_reply", new Date(NOW + HOUR).toISOString());
    assert.equal(replanned.status, "candidate");
    assert.equal(replanned.reason, "read_no_reply");
    assert.equal(replanned.dueAt, NOW + HOUR + 24 * HOUR);
    assert.equal(replanned.cancelledAt, null);
    assert.equal(replanned.revision, base.revision + 1);
  });
});

describe("isStaleFollowUp", () => {
  test("18. active and more than 14 days past due is stale", () => {
    const record = buildFollowUpRecord(
      { missionId: "m-1", leadId: "gmaps-abc", reason: "manual" },
      new Date(NOW - 20 * 24 * HOUR).toISOString(),
    );
    assert.equal(isStaleFollowUp(record, NOW), true);
  });
  test("19. active and within 14 days is not stale", () => {
    const record = buildFollowUpRecord(
      { missionId: "m-1", leadId: "gmaps-abc", reason: "manual" },
      new Date(NOW).toISOString(),
    );
    assert.equal(isStaleFollowUp(record, NOW + HOUR), false);
  });
  test("20. a completed follow-up is never stale, however old", () => {
    const record: FollowUpRecord = {
      ...buildFollowUpRecord({ missionId: "m-1", leadId: "gmaps-abc", reason: "manual" }, new Date(NOW - 100 * 24 * HOUR).toISOString()),
      status: "completed",
    };
    assert.equal(isStaleFollowUp(record, NOW), false);
  });
});
