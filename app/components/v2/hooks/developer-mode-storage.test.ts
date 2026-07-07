import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDeveloperModeFlag, serializeDeveloperModeFlag } from "./developer-mode-storage.ts";

test("parseDeveloperModeFlag: only the literal 'true' turns Developer Mode on", () => {
  assert.equal(parseDeveloperModeFlag("true"), true);
  assert.equal(parseDeveloperModeFlag("false"), false);
  assert.equal(parseDeveloperModeFlag(null), false);
  assert.equal(parseDeveloperModeFlag(undefined), false);
  assert.equal(parseDeveloperModeFlag(""), false);
  assert.equal(parseDeveloperModeFlag("garbage"), false);
  assert.equal(parseDeveloperModeFlag("TRUE"), false);
});

test("serializeDeveloperModeFlag round-trips through parseDeveloperModeFlag", () => {
  assert.equal(parseDeveloperModeFlag(serializeDeveloperModeFlag(true)), true);
  assert.equal(parseDeveloperModeFlag(serializeDeveloperModeFlag(false)), false);
});

test("default (no stored value) is OFF — the founder workspace is the default experience", () => {
  assert.equal(parseDeveloperModeFlag(null), false);
});
