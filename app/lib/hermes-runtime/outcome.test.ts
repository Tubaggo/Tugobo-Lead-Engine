import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  applyOutcomeStatusTransition,
  buildOutcomeRecord,
  canTransitionOutcomeStatus,
  InvalidOutcomeTransitionError,
  isTerminalOutcomeStatus,
  isValidOutcomeUpdate,
} from "./outcome.ts";

const NOW = "2026-07-29T09:00:00.000Z";

describe("isValidOutcomeUpdate", () => {
  test("1. won without a package or a positive MRR is invalid", () => {
    assert.equal(isValidOutcomeUpdate({ missionId: "m-1", leadId: "l-1", status: "won" }), false);
  });
  test("2. won with a real package is valid", () => {
    assert.equal(
      isValidOutcomeUpdate({ missionId: "m-1", leadId: "l-1", status: "won", package: "growth" }),
      true,
    );
  });
  test("3. won with a positive MRR is valid", () => {
    assert.equal(
      isValidOutcomeUpdate({ missionId: "m-1", leadId: "l-1", status: "won", estimatedMrr: 5000 }),
      true,
    );
  });
  test("4. won with package 'unknown' or MRR 0 is invalid", () => {
    assert.equal(
      isValidOutcomeUpdate({ missionId: "m-1", leadId: "l-1", status: "won", package: "unknown", estimatedMrr: 0 }),
      false,
    );
  });
  test("5. lost without a reason or a note is invalid", () => {
    assert.equal(isValidOutcomeUpdate({ missionId: "m-1", leadId: "l-1", status: "lost" }), false);
  });
  test("6. lost with a real reason is valid", () => {
    assert.equal(
      isValidOutcomeUpdate({ missionId: "m-1", leadId: "l-1", status: "lost", lostReason: "budget" }),
      true,
    );
  });
  test("7. lost with only a note is valid", () => {
    assert.equal(
      isValidOutcomeUpdate({ missionId: "m-1", leadId: "l-1", status: "lost", note: "fiyat itirazı" }),
      true,
    );
  });
  test("8. open / paused / no_decision never require detail", () => {
    for (const status of ["open", "paused", "no_decision"] as const) {
      assert.equal(isValidOutcomeUpdate({ missionId: "m-1", leadId: "l-1", status }), true, status);
    }
  });
});

describe("status transitions", () => {
  test("9. open can move to won/lost/paused/no_decision", () => {
    for (const to of ["won", "lost", "paused", "no_decision"] as const) {
      assert.equal(canTransitionOutcomeStatus("open", to), true, to);
    }
  });
  test("10. won and lost are terminal", () => {
    assert.equal(canTransitionOutcomeStatus("won", "open"), false);
    assert.equal(canTransitionOutcomeStatus("lost", "open"), false);
  });
  test("11. applyOutcomeStatusTransition throws on won → open", () => {
    const record = buildOutcomeRecord(
      { missionId: "m-1", leadId: "l-1", status: "won", package: "growth" },
      NOW,
    );
    assert.throws(
      () => applyOutcomeStatusTransition(record, { missionId: "m-1", leadId: "l-1", status: "open" }, NOW),
      InvalidOutcomeTransitionError,
    );
  });
});

describe("buildOutcomeRecord", () => {
  test("12. won stamps closedAt; open leaves it null", () => {
    const won = buildOutcomeRecord({ missionId: "m-1", leadId: "l-1", status: "won", package: "growth" }, NOW);
    assert.equal(won.closedAt, Date.parse(NOW));

    const open = buildOutcomeRecord({ missionId: "m-2", leadId: "l-2", status: "open" }, NOW);
    assert.equal(open.closedAt, null);
  });
  test("13. outcomeId is deterministic per mission", () => {
    const record = buildOutcomeRecord({ missionId: "m-7", leadId: "l-1", status: "open" }, NOW);
    assert.equal(record.outcomeId, "outcome:m-7");
  });
});

describe("isTerminalOutcomeStatus", () => {
  test("14. won and lost are terminal, everything else is not", () => {
    assert.equal(isTerminalOutcomeStatus("won"), true);
    assert.equal(isTerminalOutcomeStatus("lost"), true);
    assert.equal(isTerminalOutcomeStatus("open"), false);
    assert.equal(isTerminalOutcomeStatus("paused"), false);
    assert.equal(isTerminalOutcomeStatus("no_decision"), false);
  });
});
