import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { CorruptStateFileError } from "./file-store.ts";
import { errorJson, errorResponse, json, MAX_BODY_BYTES, readJsonBody } from "./http.ts";
import { RevisionConflictError } from "./repository.ts";

describe("response headers", () => {
  test("every response is no-store", async () => {
    const res = json({ ok: true });
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.headers.get("content-type"), "application/json");
  });

  test("errorJson carries the requested status", () => {
    assert.equal(errorJson("not found", 404).status, 404);
  });
});

describe("readJsonBody", () => {
  function request(body: string, headers: Record<string, string> = {}): Request {
    return new Request("https://example.test/api", {
      method: "POST",
      body,
      headers: { "content-type": "application/json", ...headers },
    });
  }

  test("parses a valid body", async () => {
    const result = await readJsonBody(request(JSON.stringify({ queued: true })));
    assert.deepEqual(result, { queued: true });
  });

  test("rejects malformed JSON with 400", async () => {
    const result = await readJsonBody(request("{not json"));
    assert.ok(result instanceof Response);
    assert.equal(result.status, 400);
  });

  test("rejects an empty body with 400", async () => {
    const result = await readJsonBody(request("   "));
    assert.ok(result instanceof Response);
    assert.equal(result.status, 400);
  });

  test("rejects an oversized body with 413", async () => {
    const oversized = JSON.stringify({ note: "x".repeat(MAX_BODY_BYTES) });
    const result = await readJsonBody(request(oversized));
    assert.ok(result instanceof Response);
    assert.equal(result.status, 413);
  });

  test("rejects an oversized declared content-length before reading", async () => {
    const result = await readJsonBody(
      request("{}", { "content-length": String(MAX_BODY_BYTES + 1) }),
    );
    assert.ok(result instanceof Response);
    assert.equal(result.status, 413);
  });
});

describe("errorResponse", () => {
  test("maps a revision conflict to 409 with the current revision", async () => {
    const res = errorResponse(new RevisionConflictError(7));
    assert.equal(res.status, 409);
    assert.deepEqual(await res.json(), { error: "revision conflict", currentRevision: 7 });
  });

  test("maps a corrupt file to 503", () => {
    assert.equal(errorResponse(new CorruptStateFileError("/tmp/x")).status, 503);
  });

  test("maps anything else to a generic 500", async () => {
    const res = errorResponse(new Error("ENOENT: /var/lib/tugobo-lead-engine/secret"));
    assert.equal(res.status, 500);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "internal error");
    assert.equal(
      body.error.includes("/var/lib"),
      false,
      "the data directory is never leaked to a caller",
    );
  });

  test("a quarantine path is not echoed to the caller", async () => {
    const res = errorResponse(new CorruptStateFileError("/var/lib/tugobo/x.corrupt-1"));
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "storage unavailable");
  });
});
