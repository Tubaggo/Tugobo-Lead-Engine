import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  approvalCoversMessage,
  hashApprovedMessage,
} from "./message-hash.ts";
import {
  BRIDGE_BLOCKING_REASONS,
  deriveMissionApprovalFromSnapshot,
  publishHermesMissionStateSnapshot,
} from "./mission-state-bridge.ts";
import {
  isExternalSendAuthorized,
  MISSION_APPROVAL_UNRESOLVED_REASON,
  resolveMissionApprovalState,
} from "./mission-approval-resolver.ts";
import { createMission } from "./repository.ts";
import type { HermesApprovalRecord } from "./schema.ts";

/**
 * Approval semantics.
 *
 * The ported rule is that approval is *derived* server-side and never granted
 * by default. The added rule is that an approval only covers the copy it was
 * bound to. Both are load-bearing for a future send path, so both are pinned
 * here rather than left to the route.
 */

const MESSAGE = "Merhaba, web sitenizdeki WhatsApp bağlantısını fark ettim.";

function snapshot(over: Partial<HermesApprovalRecord> = {}): HermesApprovalRecord {
  return {
    missionId: "m-1",
    leadId: "gmaps-abc",
    founderApprovalStatus: "approved",
    courierDraftStatus: "approved",
    deliveryGatewayStatus: "allowed",
    messageHash: hashApprovedMessage(MESSAGE),
    source: "workspace_snapshot",
    updatedAt: 1_700_000_000_000,
    expiresAt: 1_700_000_600_000,
    revision: 1,
    ...over,
  };
}

describe("message hashing", () => {
  test("1. the same copy hashes the same way", () => {
    assert.equal(hashApprovedMessage(MESSAGE), hashApprovedMessage(MESSAGE));
  });

  test("2. trailing whitespace and CRLF are not a different message", () => {
    assert.equal(
      hashApprovedMessage(MESSAGE),
      hashApprovedMessage(`${MESSAGE.replace(/\n/g, "\r\n")}   \n`),
    );
  });

  test("3. a changed word is a different message", () => {
    assert.notEqual(hashApprovedMessage(MESSAGE), hashApprovedMessage(`${MESSAGE} Teşekkürler.`));
  });

  test("4. the digest carries none of the message", () => {
    const digest = hashApprovedMessage(MESSAGE);
    assert.match(digest, /^[0-9a-f]{32}$/);
    assert.equal(digest.includes("Merhaba"), false);
  });

  test("5. an approval bound to nothing covers no message", () => {
    assert.equal(approvalCoversMessage(null, MESSAGE), false);
    // …but with no message in play there is nothing to contradict.
    assert.equal(approvalCoversMessage(null, null), true);
    assert.equal(approvalCoversMessage(null, undefined), true);
  });
});

describe("derivation (pure)", () => {
  test("6. a missing snapshot derives to all-false with no reasons", () => {
    const derived = deriveMissionApprovalFromSnapshot(null);
    assert.deepEqual(derived, {
      founderApproved: false,
      courierDraftApproved: false,
      deliveryGatewayAllowed: false,
      blockingReasons: [],
    });
  });

  test("7. approval requires the exact literal, never a lookalike", () => {
    assert.equal(
      deriveMissionApprovalFromSnapshot(snapshot({ founderApprovalStatus: "pending" }))
        .founderApproved,
      false,
    );
    assert.equal(
      deriveMissionApprovalFromSnapshot(snapshot({ deliveryGatewayStatus: "blocked" }))
        .deliveryGatewayAllowed,
      false,
    );
  });

  test("8. a fully approved snapshot derives to all-true", () => {
    const derived = deriveMissionApprovalFromSnapshot(snapshot(), MESSAGE);
    assert.equal(derived.founderApproved, true);
    assert.equal(derived.courierDraftApproved, true);
    assert.equal(derived.deliveryGatewayAllowed, true);
    assert.deepEqual(derived.blockingReasons, []);
  });

  test("9. a regenerated draft revokes founder approval and says why", () => {
    const derived = deriveMissionApprovalFromSnapshot(snapshot(), "Bambaşka bir mesaj.");
    assert.equal(derived.founderApproved, false);
    assert.ok(
      derived.blockingReasons.includes(BRIDGE_BLOCKING_REASONS.messageChangedSinceApproval),
    );
    // The channel authorities are about the channel, not the copy.
    assert.equal(derived.courierDraftApproved, true);
    assert.equal(derived.deliveryGatewayAllowed, true);
  });

  test("10. an approval never bound to a message cannot cover one that appears later", () => {
    const derived = deriveMissionApprovalFromSnapshot(
      snapshot({ messageHash: null }),
      MESSAGE,
    );
    assert.equal(derived.founderApproved, false);
  });
});

/* -------------------------------------------------------------------------- */
/* resolver (durable)                                                         */
/* -------------------------------------------------------------------------- */

let tempDir: string;
let previousDataDir: string | undefined;

beforeEach(async () => {
  previousDataDir = process.env.LEAD_ENGINE_DATA_DIR;
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tugobo-hermes-approval-"));
  process.env.LEAD_ENGINE_DATA_DIR = tempDir;
});

afterEach(async () => {
  if (previousDataDir === undefined) delete process.env.LEAD_ENGINE_DATA_DIR;
  else process.env.LEAD_ENGINE_DATA_DIR = previousDataDir;
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("resolver", () => {
  test("11. an unpublished mission resolves unresolved, never approved", async () => {
    const resolution = await resolveMissionApprovalState({
      missionId: "m-1",
      leadId: "gmaps-abc",
    });
    assert.equal(resolution.source, "unresolved");
    assert.equal(resolution.founderApproved, false);
    assert.deepEqual(resolution.blockingReasons, [MISSION_APPROVAL_UNRESOLVED_REASON]);
  });

  test("12. an empty identifier resolves like any other unresolved case", async () => {
    const resolution = await resolveMissionApprovalState({ missionId: "", leadId: "" });
    assert.equal(resolution.source, "unresolved");
    assert.equal(isExternalSendAuthorized(resolution), false);
  });

  test("13. a published approval resolves from the durable bridge", async () => {
    await createMission({ missionId: "m-1", leadId: "gmaps-abc" });
    await publishHermesMissionStateSnapshot({
      missionId: "m-1",
      leadId: "gmaps-abc",
      founderApprovalStatus: "approved",
      courierDraftStatus: "approved",
      deliveryGatewayStatus: "allowed",
      approvedMessage: MESSAGE,
    });

    const resolution = await resolveMissionApprovalState({
      missionId: "m-1",
      leadId: "gmaps-abc",
      currentMessage: MESSAGE,
    });
    assert.equal(resolution.source, "mission_state_bridge");
    assert.equal(resolution.founderApproved, true);
    assert.equal(isExternalSendAuthorized(resolution), true);
  });

  test("14. the same approval does not authorize a different message", async () => {
    await createMission({ missionId: "m-1", leadId: "gmaps-abc" });
    await publishHermesMissionStateSnapshot({
      missionId: "m-1",
      leadId: "gmaps-abc",
      founderApprovalStatus: "approved",
      courierDraftStatus: "approved",
      deliveryGatewayStatus: "allowed",
      approvedMessage: MESSAGE,
    });

    const resolution = await resolveMissionApprovalState({
      missionId: "m-1",
      leadId: "gmaps-abc",
      currentMessage: "Yeniden üretilmiş bambaşka bir mesaj.",
    });
    assert.equal(resolution.founderApproved, false);
    assert.equal(isExternalSendAuthorized(resolution), false);
  });

  test("15. a blocked gateway keeps external send unauthorized even when approved", async () => {
    await createMission({ missionId: "m-1", leadId: "gmaps-abc" });
    await publishHermesMissionStateSnapshot({
      missionId: "m-1",
      leadId: "gmaps-abc",
      founderApprovalStatus: "approved",
      courierDraftStatus: "approved",
      deliveryGatewayStatus: "blocked",
      approvedMessage: MESSAGE,
    });

    const resolution = await resolveMissionApprovalState({
      missionId: "m-1",
      leadId: "gmaps-abc",
      currentMessage: MESSAGE,
    });
    assert.equal(resolution.founderApproved, true);
    assert.equal(isExternalSendAuthorized(resolution), false);
  });

  test("16. an expired approval resolves unresolved again", async () => {
    await createMission({ missionId: "m-1", leadId: "gmaps-abc" });
    const past = Date.now() - 60 * 60 * 1000;
    await publishHermesMissionStateSnapshot({
      missionId: "m-1",
      leadId: "gmaps-abc",
      founderApprovalStatus: "approved",
      courierDraftStatus: "approved",
      deliveryGatewayStatus: "allowed",
      approvedMessage: MESSAGE,
      now: past,
    });

    const resolution = await resolveMissionApprovalState({
      missionId: "m-1",
      leadId: "gmaps-abc",
      currentMessage: MESSAGE,
    });
    assert.equal(resolution.source, "unresolved");
    assert.equal(resolution.founderApproved, false);
  });
});
