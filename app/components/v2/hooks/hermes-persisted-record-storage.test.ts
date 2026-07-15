import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePersistedRecord, serializePersistedRecord } from "./hermes-persisted-record-storage.ts";

test("parsePersistedRecord: missing/empty/garbage input falls back to {}", () => {
  assert.deepEqual(parsePersistedRecord(null), {});
  assert.deepEqual(parsePersistedRecord(undefined), {});
  assert.deepEqual(parsePersistedRecord(""), {});
  assert.deepEqual(parsePersistedRecord("not json"), {});
  assert.deepEqual(parsePersistedRecord("[1,2,3]"), {});
  assert.deepEqual(parsePersistedRecord("null"), {});
  assert.deepEqual(parsePersistedRecord('"a string"'), {});
});

test("parsePersistedRecord: valid object JSON round-trips", () => {
  const record = { "mission:lead-1": { status: "approved", at: 1000 } };
  assert.deepEqual(parsePersistedRecord(JSON.stringify(record)), record);
});

test("serializePersistedRecord round-trips through parsePersistedRecord", () => {
  const record = { "mission:lead-1": { status: "rejected", at: 2000 }, "mission:lead-2": { status: "approved", at: 3000 } };
  assert.deepEqual(parsePersistedRecord(serializePersistedRecord(record)), record);
});

test("serializePersistedRecord({}) round-trips to an empty record", () => {
  assert.deepEqual(parsePersistedRecord(serializePersistedRecord({})), {});
});
