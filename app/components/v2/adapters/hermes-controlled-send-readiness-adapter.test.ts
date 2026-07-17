import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeControlledSendReadiness,
  CONTROLLED_SEND_READINESS_LABELS,
  type ControlledSendReadinessInput,
} from "./hermes-controlled-send-readiness-adapter.ts";

function buildInput(overrides: Partial<ControlledSendReadinessInput> = {}): ControlledSendReadinessInput {
  return {
    draftStatus: "approved",
    draftBody: "Merhaba, TUGOBO AI olarak...",
    hasUnsavedEdit: false,
    recipientPhone: "+90 555 111 2233",
    recipientPhoneVerified: true,
    whatsappProviderReady: true,
    ...overrides,
  };
}

test("all conditions true: controlled send reads ready, no blocking reason", () => {
  const r = computeControlledSendReadiness(buildInput());
  assert.equal(r.controlledSendReady, true);
  assert.equal(r.controlledSendLabel, CONTROLLED_SEND_READINESS_LABELS.readyLabel);
  assert.equal(r.blockingReasonLabel, null);
});

test("draft not yet approved: never reads ready, reason is founder approval", () => {
  const r = computeControlledSendReadiness(buildInput({ draftStatus: "edited" }));
  assert.equal(r.controlledSendReady, false);
  assert.equal(r.controlledSendLabel, CONTROLLED_SEND_READINESS_LABELS.blockedLabel);
  assert.equal(r.blockingReasonLabel, CONTROLLED_SEND_READINESS_LABELS.reasonApprovalMissing);
  assert.equal(r.founderApprovalLabel, CONTROLLED_SEND_READINESS_LABELS.founderApprovalNo);
});

test("provider not ready: never reads ready even with everything else true", () => {
  const r = computeControlledSendReadiness(buildInput({ whatsappProviderReady: false }));
  assert.equal(r.controlledSendReady, false);
  assert.equal(r.providerStatusLabel, CONTROLLED_SEND_READINESS_LABELS.providerNotReady);
  assert.equal(r.blockingReasonLabel, CONTROLLED_SEND_READINESS_LABELS.reasonProviderNotReady);
});

test("no phone at all: never reads ready, truthful missing-phone label", () => {
  const r = computeControlledSendReadiness(buildInput({ recipientPhone: null }));
  assert.equal(r.controlledSendReady, false);
  assert.equal(r.phoneLabel, CONTROLLED_SEND_READINESS_LABELS.phoneMissing);
  assert.equal(r.blockingReasonLabel, CONTROLLED_SEND_READINESS_LABELS.reasonPhoneMissing);
});

test("phone present but not verified: still reads not-ready, not verified", () => {
  const r = computeControlledSendReadiness(buildInput({ recipientPhoneVerified: false }));
  assert.equal(r.controlledSendReady, false);
  assert.equal(r.phoneVerified, false);
  assert.equal(r.blockingReasonLabel, CONTROLLED_SEND_READINESS_LABELS.reasonPhoneMissing);
});

test("unsaved edit in progress: blocks readiness even if draft is approved", () => {
  const r = computeControlledSendReadiness(buildInput({ hasUnsavedEdit: true }));
  assert.equal(r.controlledSendReady, false);
  assert.equal(r.blockingReasonLabel, CONTROLLED_SEND_READINESS_LABELS.reasonUnsavedEdit);
});

test("empty draft body never reads ready even if approved", () => {
  const r = computeControlledSendReadiness(buildInput({ draftBody: "   " }));
  assert.equal(r.controlledSendReady, false);
});

test("rejected draft reads rejected status label, never ready", () => {
  const r = computeControlledSendReadiness(buildInput({ draftStatus: "rejected" }));
  assert.equal(r.draftStatusLabel, CONTROLLED_SEND_READINESS_LABELS.draftRejected);
  assert.equal(r.controlledSendReady, false);
});

test("whitespace-only phone counts as missing, never a false-positive verified phone", () => {
  const r = computeControlledSendReadiness(buildInput({ recipientPhone: "   ", recipientPhoneVerified: true }));
  assert.equal(r.phoneVerified, false);
  assert.equal(r.phoneLabel, CONTROLLED_SEND_READINESS_LABELS.phoneMissing);
});
