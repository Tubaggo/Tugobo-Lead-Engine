import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_OUTREACH_POLICY,
  OUTREACH_HARD_LIMITS,
  deriveOutreachPolicy,
} from "./hermes-outreach-policy.ts";
import {
  DEFAULT_ACQUISITION_POLICY,
  type AcquisitionPolicy,
} from "./hermes-autonomous-acquisition-policy.ts";

function acq(overrides: Partial<AcquisitionPolicy> = {}): AcquisitionPolicy {
  return { ...DEFAULT_ACQUISITION_POLICY, ...overrides };
}

test("default policy güvenli: kapalı + güvenilir kanal zorunlu + onay zorunlu", () => {
  assert.equal(DEFAULT_OUTREACH_POLICY.enabled, false);
  assert.equal(DEFAULT_OUTREACH_POLICY.requireTrustedChannel, true);
  assert.equal(DEFAULT_OUTREACH_POLICY.requireFounderApproval, true);
});

test("acquisition kapalıyken outreach da kapalı", () => {
  const p = deriveOutreachPolicy(acq({ enabled: false, mode: "disabled" }));
  assert.equal(p.enabled, false);
});

test("acquisition açıkken (mode !== disabled) outreach açılır", () => {
  const p = deriveOutreachPolicy(acq({ enabled: true, mode: "scheduled_safe" }));
  assert.equal(p.enabled, true);
});

test("mode disabled iken enabled true olsa bile kapalı", () => {
  const p = deriveOutreachPolicy(acq({ enabled: true, mode: "disabled" }));
  assert.equal(p.enabled, false);
});

test("maxPreparedPerRun acquisition mission cap'inden gelir ve tavana clamp'lenir", () => {
  const p = deriveOutreachPolicy(acq({ maxMissionCandidatesPerRun: 999 }));
  assert.equal(p.maxPreparedPerRun, OUTREACH_HARD_LIMITS.maxPreparedPerRun);
  const p2 = deriveOutreachPolicy(acq({ maxMissionCandidatesPerRun: 3 }));
  assert.equal(p2.maxPreparedPerRun, 3);
});

test("requireFounderApproval override edilemez — her zaman true", () => {
  const p = deriveOutreachPolicy(
    acq({ enabled: true, mode: "manual_safe" }),
    // @ts-expect-error requireFounderApproval override tip düzeyinde reddedilir
    { requireFounderApproval: false },
  );
  assert.equal(p.requireFounderApproval, true);
});

test("overrides yalnız server içi alanları etkiler", () => {
  const p = deriveOutreachPolicy(acq({ enabled: true, mode: "manual_safe" }), {
    allowInstagramChannel: false,
    allowWebsiteChannel: false,
    defaultLanguage: "en",
  });
  assert.equal(p.allowInstagramChannel, false);
  assert.equal(p.allowWebsiteChannel, false);
  assert.equal(p.defaultLanguage, "en");
});

test("updatedAt acquisition'dan taşınır", () => {
  const p = deriveOutreachPolicy(acq({ updatedAt: 12345 }));
  assert.equal(p.updatedAt, 12345);
});
