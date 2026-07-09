import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_V2_SCREEN,
  V2_ACTIVE_SCREEN_STORAGE_KEY,
  parseStoredActiveScreen,
} from "./active-screen-storage.ts";

test("v8.0: Hermes is the default screen", () => {
  assert.equal(DEFAULT_V2_SCREEN, "hermes");
});

test("storage key is unchanged from pre-v8 — no persistence break", () => {
  assert.equal(V2_ACTIVE_SCREEN_STORAGE_KEY, "tugobo-lead-engine:v2-active-screen");
});

test("valid screen ids pass through", () => {
  assert.equal(parseStoredActiveScreen("hermes"), "hermes");
  assert.equal(parseStoredActiveScreen("lead-list"), "lead-list");
  assert.equal(parseStoredActiveScreen("revenue-forecast"), "revenue-forecast");
  assert.equal(parseStoredActiveScreen("command-center"), "command-center");
});

test("legacy automation-center migrates to hermes (rename, not reset)", () => {
  assert.equal(parseStoredActiveScreen("automation-center"), "hermes");
});

test("unknown or missing values resolve to null so the caller falls back to the default", () => {
  assert.equal(parseStoredActiveScreen(null), null);
  assert.equal(parseStoredActiveScreen(""), null);
  assert.equal(parseStoredActiveScreen("not-a-screen"), null);
  assert.equal(parseStoredActiveScreen("HERMES"), null);
});
