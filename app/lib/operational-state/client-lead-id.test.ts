/**
 * The browser half of the lead-id guard.
 *
 * The stray record started here: a caller with an undefined lead handed it to
 * a template literal, `${undefined}` became "undefined", and the request was
 * already well-formed by the time the server saw it. Rejecting it server-side
 * is necessary but not sufficient — the request should never be made, or the
 * founder pays a round trip to be told their own client is confused.
 *
 * `client.ts` has no React and no runtime imports beyond the validator, so it
 * loads here directly; `fetch` is stubbed to prove nothing leaves.
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  appendActivity,
  assertValidLeadIdForMutation,
  OperationalStateError,
  patchLead,
  patchLeads,
  patchMessageWorkspace,
  refreshLead,
  resetLeads,
} from "./client.ts";
import type { LeadMessageWorkspaceState } from "../outreach/workspace.ts";

/** Every id the founder's client must refuse to put in a URL. */
const REFUSED_IDS = [
  "",
  " ",
  "undefined",
  "null",
  "NaN",
  "[object Object]",
  "true",
  "false",
  "UNDEFINED",
  "../etc/passwd",
  "a/b",
];

const workspace: LeadMessageWorkspaceState = {
  activeTone: "soft",
  drafts: {
    soft: {
      tone: "soft",
      message: "taslak",
      source: "provider",
      updatedAt: "2026-07-25T09:00:00.000Z",
      copyVersion: 5,
    },
  },
  recentMessages: [],
};

let calls: string[];
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  calls = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: { method?: string }) => {
    const url = typeof input === "string" ? input : String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    return {
      ok: true,
      status: 200,
      json: async () => ({ leadId: "gmaps-real", revision: 1, activity: [] }),
    };
  }) as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("assertValidLeadIdForMutation", () => {
  it("throws a 400 for every unusable id", () => {
    for (const leadId of [...REFUSED_IDS, undefined, null, 0, {}, []]) {
      assert.throws(
        () => assertValidLeadIdForMutation(leadId),
        (err: unknown) =>
          err instanceof OperationalStateError && err.status === 400,
        JSON.stringify(leadId),
      );
    }
  });

  it("says nothing technical to the founder", () => {
    try {
      assertValidLeadIdForMutation("undefined");
      assert.fail("should have thrown");
    } catch (err) {
      const message = (err as Error).message;
      assert.ok(!/undefined|null|400|PATCH|id\b/i.test(message), message);
      assert.match(message, /kaydedilmedi/);
    }
  });

  it("returns the id it accepted", () => {
    assert.equal(assertValidLeadIdForMutation("gmaps-real"), "gmaps-real");
  });
});

describe("no mutation request leaves the browser", () => {
  it("blocks patchMessageWorkspace", async () => {
    for (const leadId of REFUSED_IDS) {
      await assert.rejects(
        () => patchMessageWorkspace(leadId, workspace),
        OperationalStateError,
        leadId,
      );
    }
    assert.deepEqual(calls, []);
  });

  it("blocks patchLead", async () => {
    for (const leadId of REFUSED_IDS) {
      await assert.rejects(() => patchLead(leadId, { queuedToday: true }), OperationalStateError);
    }
    assert.deepEqual(calls, []);
  });

  it("blocks appendActivity", async () => {
    for (const leadId of REFUSED_IDS) {
      await assert.rejects(
        () =>
          appendActivity(leadId, [
            { id: "a1", type: "note", title: "t", createdAt: "2026-07-25T09:00:00.000Z" },
          ]),
        OperationalStateError,
      );
    }
    assert.deepEqual(calls, []);
  });

  it("blocks a reset with nothing usable in it", async () => {
    await assert.rejects(() => resetLeads(REFUSED_IDS, "untouched"), OperationalStateError);
    assert.deepEqual(calls, [], "a reset takes a backup; it must not even be asked for");
  });

  it("treats an unusable id as 'no such lead' on the read path", async () => {
    for (const leadId of REFUSED_IDS) {
      assert.equal(await refreshLead(leadId), null, leadId);
    }
    assert.deepEqual(calls, []);
  });
});

describe("the bulk autosave", () => {
  it("skips unusable keys and still saves the rest", async () => {
    await patchLeads({
      undefined: { queuedToday: true },
      "": { queuedToday: true },
      "[object Object]": { queuedToday: true },
      "gmaps-real": { queuedToday: true },
    });

    assert.equal(calls.length, 1, "exactly one lead was written");
    assert.match(calls[0], /^PATCH \/api\/operational-state\/gmaps-real$/);
  });

  it("does not abort the batch when an unusable key comes first", async () => {
    await patchLeads({
      null: { queuedToday: true },
      "gmaps-a": { queuedToday: true },
      "gmaps-b": { queuedToday: true },
    });
    assert.equal(calls.length, 2);
  });
});
