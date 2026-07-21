import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { safeCallbackPath } from "./login-shared.ts";

describe("safeCallbackPath", () => {
  test("keeps same-site paths", () => {
    assert.equal(safeCallbackPath("/dashboard/follow-ups"), "/dashboard/follow-ups");
    assert.equal(safeCallbackPath("/?filter=hot"), "/?filter=hot");
  });

  test("rejects absolute URLs to another origin", () => {
    assert.equal(safeCallbackPath("https://evil.example.com"), "/");
    assert.equal(safeCallbackPath("http://evil.example.com/x"), "/");
  });

  test("rejects protocol-relative URLs", () => {
    assert.equal(safeCallbackPath("//evil.example.com"), "/");
  });

  test("rejects backslash-prefixed paths some browsers normalize to //", () => {
    assert.equal(safeCallbackPath("\\\\evil.example.com"), "/");
  });

  test("never bounces back to the login page", () => {
    assert.equal(safeCallbackPath("/login"), "/");
    assert.equal(safeCallbackPath("/login?callbackUrl=/login"), "/");
  });

  test("falls back to root for non-string or empty input", () => {
    assert.equal(safeCallbackPath(undefined), "/");
    assert.equal(safeCallbackPath(null), "/");
    assert.equal(safeCallbackPath(42), "/");
    assert.equal(safeCallbackPath(""), "/");
  });
});
