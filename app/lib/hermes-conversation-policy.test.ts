import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CONVERSATION_POLICY,
  defaultConversationPolicy,
  deriveConversationPolicy,
} from "./hermes-conversation-policy.ts";
import { DEFAULT_ACQUISITION_POLICY } from "./hermes-autonomous-acquisition-policy.ts";

test("safe defaults: automation gated, approval mandatory, previews capped", () => {
  const d = DEFAULT_CONVERSATION_POLICY;
  assert.equal(d.enabled, true);
  assert.equal(d.requireMappedReplyForAutomation, true);
  assert.equal(d.requireFounderApprovalForReplyDraft, true);
  assert.equal(d.allowAutoDemoCandidateCreation, true);
  assert.equal(d.allowAutoFollowUpCandidateCreation, true);
  assert.equal(d.closeOnNotInterested, true);
  assert.equal(d.closeOnWrongNumber, true);
  assert.equal(d.maxReplyPreviewLength, 160);
});

test("disabled acquisition → disabled conversation policy", () => {
  const p = deriveConversationPolicy(DEFAULT_ACQUISITION_POLICY);
  // DEFAULT_ACQUISITION_POLICY is disabled/mode=disabled.
  assert.equal(p.enabled, false);
});

test("enabled acquisition → enabled conversation policy", () => {
  const p = deriveConversationPolicy({ ...DEFAULT_ACQUISITION_POLICY, enabled: true, mode: "manual_safe" });
  assert.equal(p.enabled, true);
});

test("requireFounderApprovalForReplyDraft can never be overridden to false", () => {
  const p = deriveConversationPolicy(
    { ...DEFAULT_ACQUISITION_POLICY, enabled: true, mode: "manual_safe" },
    // @ts-expect-error — structurally impossible to override to false
    { requireFounderApprovalForReplyDraft: false },
  );
  assert.equal(p.requireFounderApprovalForReplyDraft, true);
});

test("maxReplyPreviewLength clamped to hard limit 160", () => {
  const p = deriveConversationPolicy(
    { ...DEFAULT_ACQUISITION_POLICY, enabled: true, mode: "manual_safe" },
    { maxReplyPreviewLength: 9999 },
  );
  assert.equal(p.maxReplyPreviewLength, 160);
});

test("maxConversationDecisionsPerLead clamped to [1,50]", () => {
  const p = deriveConversationPolicy(
    { ...DEFAULT_ACQUISITION_POLICY, enabled: true, mode: "manual_safe" },
    { maxConversationDecisionsPerLead: 9999 },
  );
  assert.equal(p.maxConversationDecisionsPerLead, 50);
});

test("defaultConversationPolicy is enabled and independent of acquisition (Scope 4)", () => {
  const p = defaultConversationPolicy();
  assert.equal(p.enabled, true); // conversation orchestration is on by default
  assert.equal(p.requireFounderApprovalForReplyDraft, true);
});

test("overrides for close behavior are respected", () => {
  const p = deriveConversationPolicy(
    { ...DEFAULT_ACQUISITION_POLICY, enabled: true, mode: "manual_safe" },
    { closeOnNotInterested: false, requireMappedReplyForAutomation: false },
  );
  assert.equal(p.closeOnNotInterested, false);
  assert.equal(p.requireMappedReplyForAutomation, false);
});
