/**
 * Message readiness — a read-only projection over the existing v6 outreach
 * workspace, never a second draft engine.
 *
 * v3.8.1 — Hermes Daily Loop Wiring.
 *
 * The daily loop needs to know, for each queue item, whether there is
 * ready-to-send copy — but "Hermes'i Çalıştır" must never call a provider or
 * write a draft itself (see `AGENTS.md` / the sprint's non-goals). So this
 * module only *reads* `LeadMessageWorkspaceState` (`outreach/workspace.ts`,
 * already persisted per lead under `operational-state`) and the lead's
 * WhatsApp channel status, and classifies what it finds. Producing a draft
 * stays an explicit founder action from inside the lead workspace, exactly as
 * it is on `main` and on this branch today.
 *
 * Pure: no React, no I/O, no `server-only`, no provider import of any kind.
 */

import type { ActionStage } from "./action-stage.ts";
import type { LeadMessageWorkspaceState } from "../outreach/workspace.ts";

export type MessageReadiness = "ready" | "needs_research" | "missing_channel" | "not_required";

/**
 * Stages where "is there copy to send" is the actual open question. Every
 * other stage already has its own recommended action (reply, demo, follow-up,
 * outcome, retry) — asking about draft readiness there would just be noise.
 */
const READINESS_RELEVANT_STAGES: readonly ActionStage[] = ["approval_required", "ready"];

export type ComputeMessageReadinessInput = {
  actionStage: ActionStage;
  hasWhatsAppChannel: boolean;
  workspace: LeadMessageWorkspaceState | undefined;
};

/**
 * Classifies readiness from state that already exists — never generates it.
 *
 * `missing_channel` outranks `needs_research`: without a verified channel
 * there is nowhere to send a draft even if one existed, so the founder's next
 * action is "verify a channel", not "research a message".
 */
export function computeMessageReadiness(input: ComputeMessageReadinessInput): MessageReadiness {
  if (!READINESS_RELEVANT_STAGES.includes(input.actionStage)) return "not_required";
  if (!input.hasWhatsAppChannel) return "missing_channel";

  const workspace = input.workspace;
  const draft = workspace ? workspace.drafts[workspace.activeTone] : undefined;
  if (draft && draft.message.trim().length > 0) return "ready";
  return "needs_research";
}

/** Founder-facing next-step label for a `needs_research` item. Constant, not computed. */
export const NEEDS_RESEARCH_ACTION_LABEL_TR = "Yeniden zenginleştir";
