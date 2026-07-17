/**
 * Hermes Opportunity Workspace Mode adapter (Commercial Journey Driven
 * Opportunity Workspace v1.0).
 *
 * Pure, deterministic answer to "which single Workspace Mode should the
 * founder see right now?" — derived exclusively from real runtime objects
 * this codebase already produces (mission, pipeline, draft, delivery,
 * reply, demo, outcome). Computes nothing new about any of them; only
 * decides which ONE already-real signal should currently own the screen.
 *
 * Priority — a real runtime object always outranks the shadow-simulated
 * mission state; a mission's own `decisionState`/`stage` never overrides a
 * real draft/delivery/reply/demo/outcome once one exists:
 *
 *   1. outcome.status is "won"/"lost"            → closed
 *   2. a real demo item exists                    → demo_progress
 *   3. a real reply exists                         → reply_review
 *   4. delivery.status shows an attempted send     → delivery_waiting
 *   5. draft.status === "approved"                 → controlled_send_ready
 *   6. a real draft exists (any other status)      → message_review
 *   7. pipeline.state is queued/running/waiting    → preparation
 *   8. everything else                             → opportunity_review
 *
 * `mission` is accepted for signature symmetry with the runtime this
 * adapter reads from — its own shadow `decisionState`/`stage` never
 * appears in the priority ladder above (per the sprint's explicit rule).
 * `DealWorkspace` still reads `mission.decisionState` directly, but only to
 * decide what to show *inside* the `opportunity_review` mode's own single
 * decision — never to decide which mode is active.
 *
 * `journey` is likewise accepted only for parity with the runtime this
 * adapter draws from; every real signal it would encode (reply/demo/
 * outcome/draft existence) is already passed in directly above, so it
 * plays no role in the priority ladder itself — `computeCommercialJourney`
 * is untouched and unduplicated.
 *
 * Deliberately dependency-free (no "@/" imports, no React, no browser API)
 * so it runs under plain `node --test` — the same convention every v8
 * adapter in this codebase follows.
 */

export type OpportunityWorkspaceMode =
  | "opportunity_review"
  | "preparation"
  | "message_review"
  | "controlled_send_ready"
  | "delivery_waiting"
  | "reply_review"
  | "demo_progress"
  | "closed";

export type WorkspaceModeMissionLike = { decisionState: string; stage: string } | null;
export type WorkspaceModePipelineLike = { state: string } | null;
export type WorkspaceModeDraftLike = { status: string } | null;
export type WorkspaceModeDeliveryLike = { status: string } | null;
export type WorkspaceModeOutcomeLike = { status: string } | null;

export type ComputeOpportunityWorkspaceModeInput = {
  mission: WorkspaceModeMissionLike;
  pipeline: WorkspaceModePipelineLike;
  draft: WorkspaceModeDraftLike;
  delivery: WorkspaceModeDeliveryLike;
  /** Presence alone decides mode — any real reply matched to this mission. */
  reply: unknown | null | undefined;
  /** Presence alone decides mode — any real demo item matched to this mission. */
  demo: unknown | null | undefined;
  outcome: WorkspaceModeOutcomeLike;
  journey?: unknown;
};

const PIPELINE_ACTIVE_STATES = new Set(["queued", "running", "waiting"]);
/** A delivery status that means a real send was actually attempted — not merely prepared/approved. */
const DELIVERY_ATTEMPTED_STATES = new Set(["sending", "sent", "delivered", "failed", "cancelled"]);

export function computeOpportunityWorkspaceMode(
  input: ComputeOpportunityWorkspaceModeInput,
): OpportunityWorkspaceMode {
  if (input.outcome && (input.outcome.status === "won" || input.outcome.status === "lost")) {
    return "closed";
  }
  if (input.demo !== null && input.demo !== undefined) return "demo_progress";
  if (input.reply !== null && input.reply !== undefined) return "reply_review";
  if (input.delivery && DELIVERY_ATTEMPTED_STATES.has(input.delivery.status)) return "delivery_waiting";
  if (input.draft && input.draft.status === "approved") return "controlled_send_ready";
  if (input.draft) return "message_review";
  if (input.pipeline && PIPELINE_ACTIVE_STATES.has(input.pipeline.state)) return "preparation";
  return "opportunity_review";
}
