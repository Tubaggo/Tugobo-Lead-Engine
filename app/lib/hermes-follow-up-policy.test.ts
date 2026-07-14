import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FOLLOW_UP_POLICY,
  buildFollowUpPolicy,
  defaultFollowUpPolicy,
} from "./hermes-follow-up-policy.ts";

test("safe defaults", () => {
  const d = DEFAULT_FOLLOW_UP_POLICY;
  assert.equal(d.enabled, true);
  assert.equal(d.requireFounderApproval, true);
  assert.equal(d.readNoReplyDelayHours, 24);
  assert.equal(d.deliveredNoReplyDelayHours, 48);
  assert.equal(d.hotReplyActionDelayMinutes, 30);
  assert.equal(d.demoNotScheduledDelayHours, 4);
  assert.equal(d.demoNoShowDelayHours, 24);
  assert.equal(d.failedDeliveryRecoveryDelayMinutes, 15);
  assert.equal(d.laterRequestedDefaultDelayHours, 72);
  assert.equal(d.maxFollowUpsPerLead, 3);
  assert.equal(d.minHoursBetweenFollowUps, 24);
  assert.equal(d.expireAfterHours, 336);
  assert.equal(d.requireMappedLead, true);
  assert.equal(d.blockNotInterested, true);
  assert.equal(d.blockWrongNumber, true);
  assert.equal(d.blockDoNotContact, true);
});

test("requireFounderApproval can never be overridden to false", () => {
  const p = buildFollowUpPolicy(
    // @ts-expect-error — structurally impossible to override
    { requireFounderApproval: false },
  );
  assert.equal(p.requireFounderApproval, true);
});

test("invalid durations fall back to defaults", () => {
  const p = buildFollowUpPolicy({ readNoReplyDelayHours: NaN, demoNotScheduledDelayHours: Infinity });
  assert.equal(p.readNoReplyDelayHours, 24);
  assert.equal(p.demoNotScheduledDelayHours, 4);
});

test("maximum limits clamp", () => {
  const p = buildFollowUpPolicy({
    readNoReplyDelayHours: 99999,
    hotReplyActionDelayMinutes: 99999,
    maxFollowUpsPerLead: 99999,
    minHoursBetweenFollowUps: 99999,
    expireAfterHours: 99999,
  });
  assert.equal(p.readNoReplyDelayHours, 720);
  assert.equal(p.hotReplyActionDelayMinutes, 1440);
  assert.equal(p.maxFollowUpsPerLead, 10);
  assert.equal(p.minHoursBetweenFollowUps, 240);
  assert.equal(p.expireAfterHours, 1440);
});

test("maxFollowUpsPerLead clamps to minimum 1", () => {
  const p = buildFollowUpPolicy({ maxFollowUpsPerLead: 0 });
  assert.equal(p.maxFollowUpsPerLead, 1);
});

test("negative delays clamp to 0", () => {
  const p = buildFollowUpPolicy({ readNoReplyDelayHours: -5 });
  assert.equal(p.readNoReplyDelayHours, 0);
});

test("defaultFollowUpPolicy is enabled and approval-required", () => {
  const p = defaultFollowUpPolicy();
  assert.equal(p.enabled, true);
  assert.equal(p.requireFounderApproval, true);
});

test("updatedAt is set from argument", () => {
  const p = buildFollowUpPolicy({}, 12345);
  assert.equal(p.updatedAt, 12345);
});
