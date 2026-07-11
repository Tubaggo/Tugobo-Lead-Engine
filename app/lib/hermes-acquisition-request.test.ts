import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authorizeAcquisitionTrigger,
  parseAcquisitionRunRequest,
  parseJsonBodySafely,
} from "./hermes-acquisition-request.ts";

/* ── body parsing ───────────────────────────────────────────── */

test("empty body parses to an empty object (manual defaults)", () => {
  const body = parseJsonBodySafely("");
  const parsed = parseAcquisitionRunRequest(body);
  assert.deepEqual(parsed, { trigger: "manual", forceDryRun: false });
});

test("malformed JSON body is rejected safely", () => {
  assert.equal(parseJsonBodySafely("{oops"), undefined);
});

test("unknown trigger value is rejected", () => {
  assert.equal(parseAcquisitionRunRequest({ trigger: "auto_send_everything" }), null);
});

test("client cannot override policy limits or approval flags via the body", () => {
  const parsed = parseAcquisitionRunRequest({
    trigger: "developer",
    dryRun: true,
    dailyLeadLimit: 99999,
    maxMissionCandidatesPerRun: 99999,
    founderApproved: true,
    autoSend: true,
    enabled: true,
  });
  assert.deepEqual(parsed, { trigger: "developer", forceDryRun: true });
  // Structurally impossible to smuggle anything else through:
  assert.deepEqual(Object.keys(parsed!).sort(), ["forceDryRun", "trigger"]);
});

test("client dryRun=false can never turn dry-run off", () => {
  const parsed = parseAcquisitionRunRequest({ trigger: "manual", dryRun: false });
  assert.equal(parsed?.forceDryRun, false); // false = "no forced preview", not "disable dry-run"
});

/* ── trigger authorization ──────────────────────────────────── */

const SECRET = "test-cron-secret";

test("scheduled trigger with the correct bearer secret is authorized", () => {
  const r = authorizeAcquisitionTrigger({
    trigger: "scheduled",
    authorizationHeader: `Bearer ${SECRET}`,
    configuredSecret: SECRET,
  });
  assert.deepEqual(r, { ok: true });
});

test("scheduled trigger with a wrong secret is blocked with 403", () => {
  const r = authorizeAcquisitionTrigger({
    trigger: "scheduled",
    authorizationHeader: "Bearer wrong",
    configuredSecret: SECRET,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 403);
});

test("scheduled trigger with a missing header is blocked with 401", () => {
  const r = authorizeAcquisitionTrigger({
    trigger: "scheduled",
    authorizationHeader: null,
    configuredSecret: SECRET,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 401);
});

test("scheduled trigger without a configured secret is blocked with 503", () => {
  const r = authorizeAcquisitionTrigger({
    trigger: "scheduled",
    authorizationHeader: `Bearer ${SECRET}`,
    configuredSecret: undefined,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 503);
});

test("authorization errors never echo the secret or the attempted token", () => {
  const r = authorizeAcquisitionTrigger({
    trigger: "scheduled",
    authorizationHeader: "Bearer attacker-token",
    configuredSecret: SECRET,
  });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(!r.errorTr.includes(SECRET));
    assert.ok(!r.errorTr.includes("attacker-token"));
  }
});

test("manual trigger needs no secret", () => {
  const r = authorizeAcquisitionTrigger({
    trigger: "manual",
    authorizationHeader: null,
    configuredSecret: SECRET,
  });
  assert.deepEqual(r, { ok: true });
});

test("manual trigger with a WRONG bearer header is still rejected", () => {
  const r = authorizeAcquisitionTrigger({
    trigger: "manual",
    authorizationHeader: "Bearer wrong",
    configuredSecret: SECRET,
  });
  assert.equal(r.ok, false);
});
