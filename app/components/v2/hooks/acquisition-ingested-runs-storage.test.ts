import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseIngestedRunIds,
  serializeIngestedRunIds,
  addIngestedRunId,
} from "./acquisition-ingested-runs-storage.ts";

test("parseIngestedRunIds: valid JSON array of strings round-trips", () => {
  assert.deepEqual(parseIngestedRunIds('["acq-1","acq-2"]'), ["acq-1", "acq-2"]);
});

test("parseIngestedRunIds: null/undefined/empty never throw, yield []", () => {
  assert.deepEqual(parseIngestedRunIds(null), []);
  assert.deepEqual(parseIngestedRunIds(undefined), []);
  assert.deepEqual(parseIngestedRunIds(""), []);
});

test("parseIngestedRunIds: invalid JSON never throws, yields []", () => {
  assert.deepEqual(parseIngestedRunIds("not json {{{"), []);
});

test("parseIngestedRunIds: non-array JSON yields []", () => {
  assert.deepEqual(parseIngestedRunIds('{"a":1}'), []);
  assert.deepEqual(parseIngestedRunIds("42"), []);
});

test("parseIngestedRunIds: drops non-string entries instead of throwing", () => {
  assert.deepEqual(parseIngestedRunIds('["acq-1", 42, null, "acq-2"]'), ["acq-1", "acq-2"]);
});

test("addIngestedRunId: appends a new id", () => {
  assert.deepEqual(addIngestedRunId(["acq-1"], "acq-2"), ["acq-1", "acq-2"]);
});

test("addIngestedRunId: adding an already-present id is a no-op (no duplicate)", () => {
  assert.deepEqual(addIngestedRunId(["acq-1", "acq-2"], "acq-1"), ["acq-1", "acq-2"]);
});

test("addIngestedRunId: caps at the most recent 50 entries", () => {
  const existing = Array.from({ length: 50 }, (_, i) => `acq-${i}`);
  const next = addIngestedRunId(existing, "acq-new");
  assert.equal(next.length, 50);
  assert.equal(next[next.length - 1], "acq-new");
  assert.ok(!next.includes("acq-0")); // oldest entry evicted
});

test("serializeIngestedRunIds round-trips through parseIngestedRunIds", () => {
  const ids = ["acq-1", "acq-2", "acq-3"];
  assert.deepEqual(parseIngestedRunIds(serializeIngestedRunIds(ids)), ids);
});

test("serializeIngestedRunIds caps at 50 even if given more", () => {
  const ids = Array.from({ length: 60 }, (_, i) => `acq-${i}`);
  const parsedBack = parseIngestedRunIds(serializeIngestedRunIds(ids));
  assert.equal(parsedBack.length, 50);
  assert.deepEqual(parsedBack, ids.slice(-50));
});
