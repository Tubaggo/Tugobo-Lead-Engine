import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeOpportunityWorkspaceMode,
  type ComputeOpportunityWorkspaceModeInput,
} from "./hermes-opportunity-workspace-mode-adapter.ts";

function buildInput(overrides: Partial<ComputeOpportunityWorkspaceModeInput> = {}): ComputeOpportunityWorkspaceModeInput {
  return {
    mission: null,
    pipeline: null,
    draft: null,
    delivery: null,
    reply: null,
    demo: null,
    outcome: null,
    ...overrides,
  };
}

test("nothing real yet: opportunity_review", () => {
  assert.equal(computeOpportunityWorkspaceMode(buildInput()), "opportunity_review");
});

test("mission shadow state pending alone (no pipeline/draft) still reads opportunity_review — shadow state never earns its own mode", () => {
  const mode = computeOpportunityWorkspaceMode(
    buildInput({ mission: { decisionState: "pending", stage: "approval" } }),
  );
  assert.equal(mode, "opportunity_review");
});

test("pipeline running, no draft: preparation", () => {
  assert.equal(computeOpportunityWorkspaceMode(buildInput({ pipeline: { state: "running" } })), "preparation");
});

test("pipeline queued: preparation", () => {
  assert.equal(computeOpportunityWorkspaceMode(buildInput({ pipeline: { state: "queued" } })), "preparation");
});

test("pipeline waiting: preparation", () => {
  assert.equal(computeOpportunityWorkspaceMode(buildInput({ pipeline: { state: "waiting" } })), "preparation");
});

test("pipeline blocked with no draft falls to opportunity_review (not in the preparation trigger set)", () => {
  assert.equal(computeOpportunityWorkspaceMode(buildInput({ pipeline: { state: "blocked" } })), "opportunity_review");
});

test("a real draft exists (draft_ready), even with mission still pending: message_review — real object overrides shadow state", () => {
  const mode = computeOpportunityWorkspaceMode(
    buildInput({
      mission: { decisionState: "pending", stage: "approval" },
      pipeline: { state: "completed" },
      draft: { status: "draft_ready" },
    }),
  );
  assert.equal(mode, "message_review");
});

test("a real draft exists (edited): message_review", () => {
  assert.equal(computeOpportunityWorkspaceMode(buildInput({ draft: { status: "edited" } })), "message_review");
});

test("a rejected draft still reads message_review (view-only), never controlled_send_ready", () => {
  assert.equal(computeOpportunityWorkspaceMode(buildInput({ draft: { status: "rejected" } })), "message_review");
});

test("approved draft, no delivery attempt yet: controlled_send_ready", () => {
  assert.equal(computeOpportunityWorkspaceMode(buildInput({ draft: { status: "approved" } })), "controlled_send_ready");
});

test("approved draft with delivery only 'ready' (not yet actually sent): still controlled_send_ready", () => {
  const mode = computeOpportunityWorkspaceMode(
    buildInput({ draft: { status: "approved" }, delivery: { status: "ready" } }),
  );
  assert.equal(mode, "controlled_send_ready");
});

test("delivery actually sent: delivery_waiting, even though the draft is approved too", () => {
  const mode = computeOpportunityWorkspaceMode(
    buildInput({ draft: { status: "approved" }, delivery: { status: "sent" } }),
  );
  assert.equal(mode, "delivery_waiting");
});

test("delivery delivered: delivery_waiting", () => {
  const mode = computeOpportunityWorkspaceMode(
    buildInput({ draft: { status: "approved" }, delivery: { status: "delivered" } }),
  );
  assert.equal(mode, "delivery_waiting");
});

test("delivery failed: delivery_waiting (the founder still needs to see what happened)", () => {
  const mode = computeOpportunityWorkspaceMode(
    buildInput({ draft: { status: "approved" }, delivery: { status: "failed" } }),
  );
  assert.equal(mode, "delivery_waiting");
});

test("a real reply exists: reply_review, even with a sent delivery present", () => {
  const mode = computeOpportunityWorkspaceMode(
    buildInput({ draft: { status: "approved" }, delivery: { status: "sent" }, reply: { textPreview: "Merhaba" } }),
  );
  assert.equal(mode, "reply_review");
});

test("a real demo exists: demo_progress, even with a reply present", () => {
  const mode = computeOpportunityWorkspaceMode(
    buildInput({ reply: { textPreview: "Merhaba" }, demo: { status: "scheduled" } }),
  );
  assert.equal(mode, "demo_progress");
});

test("outcome won: closed, even with a demo present", () => {
  const mode = computeOpportunityWorkspaceMode(
    buildInput({ demo: { status: "scheduled" }, outcome: { status: "won" } }),
  );
  assert.equal(mode, "closed");
});

test("outcome lost: closed", () => {
  assert.equal(computeOpportunityWorkspaceMode(buildInput({ outcome: { status: "lost" } })), "closed");
});

test("outcome 'open' (not won/lost) never triggers closed on its own", () => {
  const mode = computeOpportunityWorkspaceMode(buildInput({ outcome: { status: "open" }, draft: { status: "draft_ready" } }));
  assert.equal(mode, "message_review");
});
