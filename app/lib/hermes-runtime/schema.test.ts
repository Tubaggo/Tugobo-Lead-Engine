import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  emptyHermesRuntimeFile,
  HERMES_SCHEMA_VERSION,
  isHotReplyIntelligence,
  isValidRecordId,
  MAX_TEXT_PREVIEW,
  normalizeApprovalRecord,
  normalizeDeliveryRecord,
  normalizeDemoRecord,
  normalizeMissionRecord,
  normalizeReplyRecord,
  parseHermesRuntimeFile,
} from "./schema.ts";

/**
 * Every value that comes off disk or off the wire goes through a normalizer
 * before it is trusted. These tests pin the two properties that matter most:
 * a malformed status can never read as authority, and a record that names no
 * valid lead is dropped rather than repaired.
 */

const NOW = "2026-07-28T09:00:00.000Z";
const AT = Date.parse(NOW);

describe("record ids", () => {
  test("1. a normal id is accepted", () => {
    assert.equal(isValidRecordId("mission-1"), true);
    assert.equal(isValidRecordId("gmaps-ChIJabc123"), true);
  });

  test("2. path traversal, empty and non-string ids are rejected", () => {
    assert.equal(isValidRecordId("../etc"), false);
    assert.equal(isValidRecordId("a..b"), false);
    assert.equal(isValidRecordId(""), false);
    assert.equal(isValidRecordId(undefined), false);
    assert.equal(isValidRecordId("has space"), false);
  });
});

describe("mission record", () => {
  test("3. a mission with an invalid lead id is dropped, not repaired", () => {
    assert.equal(normalizeMissionRecord("m-1", { leadId: "" }, NOW), null);
    assert.equal(normalizeMissionRecord("m-1", { leadId: "../x" }, NOW), null);
    assert.equal(normalizeMissionRecord("m-1", { leadId: undefined }, NOW), null);
  });

  test("4. an unknown stage falls back to discover, never to a later rung", () => {
    const record = normalizeMissionRecord("m-1", { leadId: "ant-001", stage: "nonsense" }, NOW);
    assert.equal(record?.stage, "discover");
    assert.equal(record?.progress, 10);
  });

  test("5. label and progress are derived from stage, never trusted from input", () => {
    const record = normalizeMissionRecord(
      "m-1",
      { leadId: "ant-001", stage: "approval", stageLabel: "SAHTE", progress: 999 },
      NOW,
    );
    assert.equal(record?.stageLabel, "Onay");
    assert.equal(record?.progress, 75);
  });

  test("6. an unknown decision state falls back to not-required", () => {
    const record = normalizeMissionRecord(
      "m-1",
      { leadId: "ant-001", decisionState: "approved-ish" },
      NOW,
    );
    assert.equal(record?.decisionState, "not-required");
  });

  test("7. malformed tasks and timeline entries are dropped individually", () => {
    const record = normalizeMissionRecord(
      "m-1",
      {
        leadId: "ant-001",
        tasks: [{ id: "t-1", taskType: "enrichment" }, { id: "" }, null, { id: "t-1" }],
        timeline: [{ at: AT, text: "ok" }, { at: AT, text: "" }, "nope"],
      },
      NOW,
    );
    assert.equal(record?.tasks.length, 1);
    assert.equal(record?.timeline.length, 1);
  });
});

describe("approval record", () => {
  test("8. an unrecognized founder status normalizes to missing, not approved", () => {
    const record = normalizeApprovalRecord(
      "m-1",
      { leadId: "ant-001", founderApprovalStatus: "APPROVED!" },
      AT,
    );
    assert.equal(record?.founderApprovalStatus, "missing");
  });

  test("9. an unrecognized gateway status normalizes to blocked, not allowed", () => {
    const record = normalizeApprovalRecord(
      "m-1",
      { leadId: "ant-001", deliveryGatewayStatus: "yes-please" },
      AT,
    );
    assert.equal(record?.deliveryGatewayStatus, "blocked");
  });

  test("10. an approval naming no valid lead is dropped", () => {
    assert.equal(normalizeApprovalRecord("m-1", { leadId: 7 }, AT), null);
  });

  test("11. the record has no field that could hold message text", () => {
    const record = normalizeApprovalRecord(
      "m-1",
      { leadId: "ant-001", messageHash: "abc123", approvedMessage: "gizli metin" },
      AT,
    );
    assert.equal(record?.messageHash, "abc123");
    assert.equal("approvedMessage" in (record as object), false);
  });
});

describe("reply record", () => {
  test("12. the text preview is capped by the normalizer, not by the caller", () => {
    const record = normalizeReplyRecord(
      "r-1",
      { textPreview: "x".repeat(500), missionId: "m-1", leadId: "ant-001" },
      NOW,
    );
    assert.equal(record?.textPreview?.length, MAX_TEXT_PREVIEW);
  });

  test("13. `mapped` is derived from the mission id, so it cannot disagree", () => {
    const mapped = normalizeReplyRecord("r-1", { missionId: "m-1", mapped: false }, NOW);
    assert.equal(mapped?.mapped, true);
    assert.equal(mapped?.source, "provider_message_registry");

    const unmapped = normalizeReplyRecord("r-2", { mapped: true }, NOW);
    assert.equal(unmapped?.mapped, false);
    assert.equal(unmapped?.source, "unmapped");
  });

  test("14. an unknown intent and urgency fall back to the quiet end", () => {
    const record = normalizeReplyRecord("r-1", { intent: "buy_now", urgency: "URGENT" }, NOW);
    assert.equal(record?.intent, "unknown");
    assert.equal(record?.urgency, "low");
  });

  test("15. the hot-reply predicate is the ported v6.3 rule", () => {
    assert.equal(isHotReplyIntelligence({ urgency: "high", intent: "unknown" }), true);
    assert.equal(isHotReplyIntelligence({ urgency: "low", intent: "interested" }), true);
    assert.equal(isHotReplyIntelligence({ urgency: "low", intent: "later" }), false);
  });
});

describe("demo and delivery records", () => {
  test("16. an unknown demo status falls back to unknown", () => {
    const record = normalizeDemoRecord("d-1", { status: "definitely_booked" }, NOW);
    assert.equal(record?.status, "unknown");
  });

  test("17. an unknown delivery status falls back to unknown, never to sent", () => {
    const record = normalizeDeliveryRecord("wamid-1", { status: "ok" }, NOW);
    assert.equal(record?.status, "unknown");
  });
});

describe("file parsing", () => {
  test("18. an empty file has every section present and a zero revision", () => {
    const file = emptyHermesRuntimeFile(NOW);
    assert.equal(file.schemaVersion, HERMES_SCHEMA_VERSION);
    assert.equal(file.revision, 0);
    assert.deepEqual(file.missions, {});
    assert.deepEqual(file.approvals, {});
    assert.deepEqual(file.replies, {});
    assert.deepEqual(file.demos, {});
    assert.deepEqual(file.deliveries, {});
  });

  test("19. a wrong schema version parses to null so the caller can quarantine", () => {
    assert.equal(parseHermesRuntimeFile({ schemaVersion: 2 }, NOW), null);
    assert.equal(parseHermesRuntimeFile([], NOW), null);
    assert.equal(parseHermesRuntimeFile("nope", NOW), null);
  });

  test("20. unknown top-level keys are dropped rather than preserved", () => {
    const file = parseHermesRuntimeFile(
      { schemaVersion: 1, updatedAt: NOW, revision: 3, sneaky: { a: 1 } },
      NOW,
    );
    assert.equal(file?.revision, 3);
    assert.equal("sneaky" in (file as object), false);
  });

  test("21. a section keyed by an invalid record id drops that entry only", () => {
    const file = parseHermesRuntimeFile(
      {
        schemaVersion: 1,
        updatedAt: NOW,
        missions: {
          "m-1": { leadId: "ant-001" },
          "../evil": { leadId: "ant-001" },
        },
      },
      NOW,
    );
    assert.deepEqual(Object.keys(file?.missions ?? {}), ["m-1"]);
  });
});

/**
 * v3.8.0 — sender masking at the storage boundary.
 *
 * The record field is called `fromMasked`. Before these tests it was a name
 * with nothing behind it: the normalizer truncated to 40 characters and stored
 * whatever arrived, so a raw phone number passed straight through to disk. The
 * webhook parser that masks on the Hermes line is not part of this milestone,
 * which is exactly why the guarantee has to live here instead.
 */
describe("normalizeReplyRecord — sender masking", () => {
  const NOW_ISO = "2026-07-29T00:00:00.000Z";

  test("22. a raw phone number never reaches the stored record", () => {
    const record = normalizeReplyRecord(
      "r-1",
      { fromMasked: "+905551234567" },
      NOW_ISO,
    );
    assert.equal(record?.fromMasked?.includes("905551234567"), false);
    assert.equal(record?.fromMasked?.includes("5551234"), false);
  });

  test("23. only the last two characters survive", () => {
    const record = normalizeReplyRecord("r-1", { fromMasked: "+905551234567" }, NOW_ISO);
    assert.equal(record?.fromMasked, "••• ••• 67");
  });

  test("24. masking an already-masked value is a no-op", () => {
    const once = normalizeReplyRecord("r-1", { fromMasked: "+905551234567" }, NOW_ISO);
    const twice = normalizeReplyRecord("r-1", { fromMasked: once?.fromMasked }, NOW_ISO);
    assert.equal(twice?.fromMasked, once?.fromMasked);
  });

  test("25. an absent sender stays null rather than becoming a masked empty string", () => {
    assert.equal(normalizeReplyRecord("r-1", {}, NOW_ISO)?.fromMasked, null);
    assert.equal(normalizeReplyRecord("r-1", { fromMasked: "   " }, NOW_ISO)?.fromMasked, null);
  });

  test("26. the preview is still capped at the ported 160-char limit", () => {
    const record = normalizeReplyRecord(
      "r-1",
      { textPreview: "a".repeat(500) },
      NOW_ISO,
    );
    assert.equal(record?.textPreview?.length, MAX_TEXT_PREVIEW);
  });
});
