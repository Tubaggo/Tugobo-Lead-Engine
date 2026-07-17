import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLastSelectedMissionId } from "./last-selected-mission-storage.ts";

test("parseLastSelectedMissionId: a real mission id string round-trips", () => {
  assert.equal(parseLastSelectedMissionId("mission:nev-028"), "mission:nev-028");
});

test("parseLastSelectedMissionId: null/undefined never throw, yield null", () => {
  assert.equal(parseLastSelectedMissionId(null), null);
  assert.equal(parseLastSelectedMissionId(undefined), null);
});

test("parseLastSelectedMissionId: empty or whitespace-only string is invalid", () => {
  assert.equal(parseLastSelectedMissionId(""), null);
  assert.equal(parseLastSelectedMissionId("   "), null);
});

test("parseLastSelectedMissionId: trims surrounding whitespace on a real id", () => {
  assert.equal(parseLastSelectedMissionId("  mission:abc  "), "mission:abc");
});

test("parseLastSelectedMissionId: non-string input never throws, yields null", () => {
  // Simulates a corrupted/legacy value read from storage (defensive cast, as a real caller might pass through JSON.parse output).
  assert.equal(parseLastSelectedMissionId(42 as unknown as string), null);
  assert.equal(parseLastSelectedMissionId({} as unknown as string), null);
});
