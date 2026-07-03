import type { AutomationCard } from "@/app/components/v2/adapters/automation-center-adapter";
import type {
  HermesMission,
  HermesMissionTimelineItem,
} from "@/app/components/v2/adapters/hermes-mission-adapter";
import { HERMES_AGENT_REGISTRY } from "@/app/lib/hermes-monitor";
import type { HermesAgentKey } from "@/app/lib/hermes-monitor";
import {
  actionLabelOf,
  resolveExecutableAction,
  runSafeAction,
} from "@/app/components/v2/hermes-execution";
import type { ExecutableActionKey, HermesStageOutcome } from "@/app/components/v2/hermes-execution";

/**
 * Hermes Pipeline Engine (A5).
 *
 * Turns a single founder approval into a multi-stage, autonomous execution
 * chain: Verify Contact → Re-Enrich → AI Review → Schedule Follow-up. Every
 * stage is one of the four already-safe actions A4 wired — this engine adds
 * no new external calls of its own, it only sequences the existing ones and
 * decides, after each result, whether the next stage may run.
 *
 * Pure decision core (buildInitialPipeline / advancePipeline / stage guard)
 * has no side effects and does not touch fetch, React, or hooks. The one
 * exception is `runHermesPipeline`, an async orchestrator that drives the
 * pure core forward by calling `runSafeAction` — kept in this file because
 * it is the pipeline's own loop, not a general-purpose action runner.
 *
 * This module does not touch Execution Runtime, the Decision Engine, Shadow
 * Task generation, or mission grouping (`hermes-mission-adapter.ts`) — it
 * only reads a mission's already-derived fields once, at pipeline creation.
 * No scheduler, no cron, no background worker: the whole chain runs inside
 * one continued async call triggered by one founder click.
 */

/** Canonical, fixed stage order — every executable mission runs this exact chain. */
export const PIPELINE_STAGES: ExecutableActionKey[] = ["verify_contact", "re_enrich", "ai_review", "follow_up"];

const STAGE_AGENT: Record<ExecutableActionKey, HermesAgentKey> = {
  verify_contact: "scout",
  re_enrich: "enricher",
  ai_review: "appraiser",
  follow_up: "shepherd",
};

export const STAGE_SHORT_LABELS: Record<ExecutableActionKey, string> = {
  verify_contact: "Doğrula",
  re_enrich: "Zenginleştir",
  ai_review: "AI İncele",
  follow_up: "Takip",
};

export type HermesPipelineStepStatus = "queued" | "running" | "succeeded" | "failed" | "skipped";

export type HermesPipelineStep = {
  id: string;
  missionId: string;
  stage: ExecutableActionKey;
  agent: HermesAgentKey;
  status: HermesPipelineStepStatus;
  startedAt: number | null;
  finishedAt: number | null;
  result?: HermesStageOutcome;
};

/**
 * Full vocabulary per the runtime spec. In practice this engine only ever
 * produces queued/running/blocked/completed, plus "waiting" for missions
 * whose underlying task is itself in a WAIT state (reply pending / follow-up
 * not yet due) — the pipeline correctly never starts for those. "failed" and
 * "paused" are reserved for a later phase (same "define the full vocabulary,
 * use the reachable subset" approach every prior sprint has followed).
 */
export type HermesPipelineState = "queued" | "running" | "waiting" | "blocked" | "completed" | "failed" | "paused";

export type HermesPipeline = {
  missionId: string;
  state: HermesPipelineState;
  steps: HermesPipelineStep[];
  /** Index into `steps` of the stage that is running or would run next; null once nothing is pending. */
  currentStageIndex: number | null;
  startedAt: number | null;
  finishedAt: number | null;
};

/** A read-only preview of what the pipeline *would* run — shown before the founder ever starts it. */
export function buildInitialPipeline(mission: HermesMission): HermesPipeline {
  const steps: HermesPipelineStep[] = PIPELINE_STAGES.map((stage) => ({
    id: `${mission.missionId}:${stage}`,
    missionId: mission.missionId,
    stage,
    agent: STAGE_AGENT[stage],
    status: "queued",
    startedAt: null,
    finishedAt: null,
  }));
  return {
    missionId: mission.missionId,
    state: "queued",
    steps,
    currentStageIndex: 0,
    startedAt: null,
    finishedAt: null,
  };
}

export type PipelineGuardResult = { ok: true } | { ok: false; reason: string };

/**
 * The one-time gate before a pipeline is ever created for a mission. Checked
 * again, per-stage, inside `runHermesPipeline` below (the sprint explicitly
 * asks for "before every stage" validation, not just once) — this function
 * is reused there against the same snapshot.
 */
export function canQueuePipeline(
  mission: HermesMission,
  card: AutomationCard | undefined,
  existing: HermesPipeline | undefined,
): PipelineGuardResult {
  if (existing && (existing.state === "running" || existing.state === "completed")) {
    return { ok: false, reason: "Bu mission için pipeline zaten başlatıldı." };
  }
  if (mission.decisionState === "rejected") {
    return { ok: false, reason: "Mission reddedildi — pipeline başlatılamaz." };
  }
  if (resolveExecutableAction(mission) === null) {
    return { ok: false, reason: "Bu görev dış temas içeriyor — A5'te bağlanacak." };
  }
  const primaryTask = mission.tasks.find((t) => t.id === mission.primaryTaskId) ?? mission.tasks[0];
  if (primaryTask?.decision === "WAIT") {
    return { ok: false, reason: "Yanıt/takip zamanı bekleniyor — pipeline henüz başlatılamaz." };
  }
  if (mission.decisionState === "pending") {
    return { ok: false, reason: "Önce Founder onayı gerekli." };
  }
  if (!card) return { ok: false, reason: "Lead bulunamadı." };
  if (card.scoredLead.doNotContact) {
    return { ok: false, reason: "İletişim yasağı (DNC) aktif — pipeline başlatılamaz." };
  }
  return { ok: true };
}

/**
 * Pure state transition: given the pipeline and the step that just finished
 * (with its outcome attached), returns the next pipeline. On failure, every
 * remaining queued step is marked "skipped" and the pipeline becomes
 * "blocked" — later stages never run once one has failed.
 */
export function advancePipeline(
  pipeline: HermesPipeline,
  finishedStepId: string,
  outcome: HermesStageOutcome,
): HermesPipeline {
  const finishedIndex = pipeline.steps.findIndex((s) => s.id === finishedStepId);
  if (finishedIndex === -1) return pipeline;

  const now = Date.now();
  const steps = pipeline.steps.map((s, i) =>
    i === finishedIndex ? { ...s, status: outcome.status, finishedAt: now, result: outcome } : s,
  );

  if (outcome.status === "failed") {
    const blocked = steps.map((s, i) => (i > finishedIndex && s.status === "queued" ? { ...s, status: "skipped" as const } : s));
    return { ...pipeline, steps: blocked, state: "blocked", currentStageIndex: null, finishedAt: now };
  }

  const nextIndex = finishedIndex + 1;
  if (nextIndex >= steps.length) {
    return { ...pipeline, steps, state: "completed", currentStageIndex: null, finishedAt: now };
  }
  return { ...pipeline, steps, state: "running", currentStageIndex: nextIndex };
}

/** Pure: marks one step "running" — used right before its action is awaited. */
function startStep(pipeline: HermesPipeline, stepId: string): HermesPipeline {
  const steps = pipeline.steps.map((s) => (s.id === stepId ? { ...s, status: "running" as const, startedAt: Date.now() } : s));
  return { ...pipeline, steps, state: "running" };
}

/** Pure: stops the pipeline immediately (used when a per-stage guard re-check fails mid-run). */
function blockPipeline(pipeline: HermesPipeline, fromStepId: string, reason: string): HermesPipeline {
  const fromIndex = pipeline.steps.findIndex((s) => s.id === fromStepId);
  const now = Date.now();
  const steps = pipeline.steps.map((s, i) =>
    i === fromIndex
      ? { ...s, status: "failed" as const, startedAt: s.startedAt ?? now, finishedAt: now, result: { status: "failed" as const, message: reason } }
      : i > fromIndex && s.status === "queued"
        ? { ...s, status: "skipped" as const }
        : s,
  );
  return { ...pipeline, steps, state: "blocked", currentStageIndex: null, finishedAt: now };
}

/**
 * Runs the full chain for one mission, one stage at a time, stopping the
 * instant a stage fails. `onProgress` fires after every state change (stage
 * start, stage result, final state) so the UI can render live without
 * waiting for the whole chain to finish. Callers must call
 * `canQueuePipeline` first — this function assumes the gate already passed.
 */
export async function runHermesPipeline(
  mission: HermesMission,
  card: AutomationCard,
  onProgress: (pipeline: HermesPipeline) => void,
): Promise<HermesPipeline> {
  let pipeline: HermesPipeline = { ...buildInitialPipeline(mission), state: "running", startedAt: Date.now() };
  onProgress(pipeline);

  for (const step of pipeline.steps) {
    // Re-checked per stage, against the same snapshot passed in at start —
    // defense-in-depth, matching every other Hermes guardrail in this app.
    if (card.scoredLead.doNotContact) {
      pipeline = blockPipeline(pipeline, step.id, "İletişim yasağı (DNC) aktif — pipeline durduruldu.");
      onProgress(pipeline);
      break;
    }
    if (mission.decisionState === "rejected") {
      pipeline = blockPipeline(pipeline, step.id, "Mission reddedildi — pipeline durduruldu.");
      onProgress(pipeline);
      break;
    }

    pipeline = startStep(pipeline, step.id);
    onProgress(pipeline);

    const outcome = await runSafeAction(step.stage, card);
    pipeline = advancePipeline(pipeline, step.id, outcome);
    onProgress(pipeline);

    if (pipeline.state !== "running") break;
  }

  return pipeline;
}

/* ── UI projection helpers ────────────────────────────────────────
   Pure derivations for the screen/panel — no state of their own. */

/**
 * One state per mission for rendering: either the real pipeline's state, or
 * — when no pipeline has been created yet — a derived pre-pipeline state
 * ("ready" to start / "gated" behind approval / "waiting" on a reply or
 * follow-up window / "unsupported" for anything outside the safe chain).
 */
export type MissionPipelineUiState = HermesPipelineState | "ready" | "gated" | "unsupported";

export function computeMissionPipelineUiState(
  mission: HermesMission,
  pipeline: HermesPipeline | undefined,
): MissionPipelineUiState {
  if (pipeline) return pipeline.state;
  if (resolveExecutableAction(mission) === null) return "unsupported";
  const primaryTask = mission.tasks.find((t) => t.id === mission.primaryTaskId) ?? mission.tasks[0];
  if (primaryTask?.decision === "WAIT") return "waiting";
  if (mission.decisionState === "approved" || mission.decisionState === "not-required") return "ready";
  return "gated";
}

export const PIPELINE_STATE_LABELS: Record<HermesPipelineState, string> = {
  queued: "Pipeline Kuyrukta",
  running: "Pipeline Çalışıyor",
  waiting: "Yanıt Bekleniyor",
  blocked: "Pipeline Durduruldu",
  completed: "Pipeline Tamamlandı",
  failed: "Pipeline Hata Verdi",
  paused: "Pipeline Duraklatıldı",
};

/** Current + next running agent, derived straight from the pipeline's own step array — never recomputed elsewhere. */
export function pipelineAgentFlow(pipeline: HermesPipeline): {
  current: HermesAgentKey | null;
  next: HermesAgentKey | null;
} {
  if (pipeline.currentStageIndex === null) return { current: null, next: null };
  const current = pipeline.steps[pipeline.currentStageIndex]?.agent ?? null;
  const next = pipeline.steps[pipeline.currentStageIndex + 1]?.agent ?? null;
  return { current, next };
}

/**
 * Mission timeline entries generated purely from the pipeline's own step
 * data (startedAt/finishedAt) — one "stage started" and one "stage result"
 * line per attempted step. No activity is invented; steps that never ran
 * (still "queued"/"skipped") produce nothing.
 */
export function buildPipelineTimelineEntries(pipeline: HermesPipeline | undefined): HermesMissionTimelineItem[] {
  if (!pipeline) return [];
  const items: HermesMissionTimelineItem[] = [];
  for (const step of pipeline.steps) {
    if (step.startedAt === null) continue;
    const agentLabel = HERMES_AGENT_REGISTRY[step.agent].label;
    items.push({
      at: step.startedAt,
      actorLabel: agentLabel,
      actorCls: "text-violet-300",
      text: `${actionLabelOf(step.stage)} başlatıldı`,
    });
    if (step.finishedAt !== null && step.result) {
      items.push({
        at: step.finishedAt,
        actorLabel: agentLabel,
        actorCls: step.result.status === "failed" ? "text-rose-400" : "text-violet-300",
        text: step.result.error ? `${step.result.message} (${step.result.error})` : step.result.message,
      });
    }
  }
  if (pipeline.state === "completed" && pipeline.finishedAt !== null) {
    items.push({
      at: pipeline.finishedAt,
      actorLabel: "Hermes",
      actorCls: "text-indigo-300",
      text: "Mission tamamlandı",
    });
  }
  return items;
}
