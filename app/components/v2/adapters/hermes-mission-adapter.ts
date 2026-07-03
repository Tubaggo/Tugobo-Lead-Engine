import { HERMES_AGENT_REGISTRY } from "@/app/lib/hermes-monitor";
import type {
  HermesAgentKey,
  HermesMonitor,
  ShadowTask,
  ShadowTaskType,
} from "@/app/lib/hermes-monitor";
import { EXECUTION_PRIORITY_RANK } from "@/app/lib/execution-runtime";
import type { ExecutionConfidence, ExecutionPriority } from "@/app/lib/execution-runtime";

/**
 * Hermes Mission adapter (A3.6) — presentation-layer projection only.
 *
 * Does not touch Execution Runtime, Hermes Monitor, the Decision Engine, or
 * Shadow Task generation. It groups the ShadowTask[] that buildHermesMonitor
 * already produced by leadId and derives one HermesMission per lead from
 * fields those tasks already carry (taskType, decision, requiresApproval,
 * executionState) plus the founder's session-only approve/reject calls.
 * Every mission field is a lookup or a borrowed value — nothing here scores,
 * ranks, or judges a lead; that remains Execution Runtime's job.
 *
 * One lead currently produces at most one ShadowTask per monitor pass, so
 * most missions wrap a single task today. The grouping is written to
 * generalize to multiple tasks per lead without changes, since the Shadow
 * Ledger already anticipates that shape.
 */

/** Founder's session-only call on a shadow task. Never persisted. */
export type HermesDecisionMap = Record<
  string,
  { status: "approved" | "rejected"; at: number }
>;

export type MissionStage =
  | "discover"
  | "verify"
  | "enrich"
  | "prepare"
  | "approval"
  | "execution-ready"
  | "completed";

export const MISSION_STAGE_LABELS: Record<MissionStage, string> = {
  discover: "Keşif",
  verify: "Doğrulama",
  enrich: "Zenginleştirme",
  prepare: "Hazırlık",
  approval: "Onay",
  "execution-ready": "Yürütmeye Hazır",
  completed: "Tamamlandı",
};

/** Fixed ladder position — not a computed score. Mirrors the spec's example checkpoints. */
export const MISSION_STAGE_PROGRESS: Record<MissionStage, number> = {
  discover: 10,
  verify: 25,
  enrich: 50,
  prepare: 65,
  approval: 75,
  "execution-ready": 90,
  completed: 100,
};

export const MISSION_STAGE_ACCENT_CLS: Record<MissionStage, string> = {
  discover: "text-zinc-500",
  verify: "text-sky-400",
  enrich: "text-sky-400",
  prepare: "text-violet-300",
  approval: "text-amber-400",
  "execution-ready": "text-emerald-400",
  completed: "text-zinc-400",
};

export const MISSION_STAGE_BAR_CLS: Record<MissionStage, string> = {
  discover: "bg-zinc-600",
  verify: "bg-sky-400",
  enrich: "bg-sky-400",
  prepare: "bg-violet-400",
  approval: "bg-amber-400",
  "execution-ready": "bg-emerald-400",
  completed: "bg-zinc-500",
};

export const TASK_TYPE_LABELS: Record<ShadowTaskType, string> = {
  "contact-verification": "İletişim Doğrulama",
  "website-scan": "Web Sitesi Tarama",
  enrichment: "Zenginleştirme",
  "ai-review": "AI İnceleme",
  "outreach-draft": "Outreach Taslağı",
  "follow-up": "Takip",
  recovery: "Kurtarma",
  "demo-preparation": "Demo Hazırlığı",
  proposal: "Teklif",
  "reply-monitoring": "Yanıt İzleme",
  "close-decision": "Kapatma Kararı",
  "founder-review": "Founder İncelemesi",
};

export type MissionDecisionState = "not-required" | "pending" | "approved" | "rejected";

/** "founder" is not a Hermes agent — it represents the founder's own turn in the mission. */
export type MissionAgentSlot = HermesAgentKey | "founder" | null;

export type HermesMissionTimelineItem = {
  at: number;
  actorLabel: string;
  actorCls: string;
  text: string;
};

export type HermesMission = {
  missionId: string;
  leadId: string;
  hotelName: string;
  city: string;
  stage: MissionStage;
  stageLabel: string;
  /** 0-100, fixed ladder position for `stage` — not computed from scores. */
  progress: number;
  status: string;
  currentAgent: MissionAgentSlot;
  currentAgentLabel: string;
  nextAgent: MissionAgentSlot;
  nextAgentLabel: string;
  estimatedImpact: number;
  approvalRequired: boolean;
  decisionState: MissionDecisionState;
  taskCount: number;
  completedTaskCount: number;
  blockedTaskCount: number;
  waitingTaskCount: number;
  priority: ExecutionPriority;
  confidence: ExecutionConfidence;
  /** The task Approve/Reject acts on — the one currently blocking mission progress. */
  primaryTaskId: string;
  tasks: ShadowTask[];
  timeline: HermesMissionTimelineItem[];
};

export type MissionBucket = "approval" | "ready" | "in-progress" | "completed";

export function missionBucketOf(mission: HermesMission): MissionBucket {
  if (mission.stage === "approval") return "approval";
  if (mission.stage === "execution-ready") return "ready";
  if (mission.stage === "completed") return "completed";
  return "in-progress";
}

/** Task type → the agent that would pick up once the founder approves. */
const AFTER_APPROVAL_AGENT: Partial<Record<ShadowTaskType, HermesAgentKey>> = {
  "outreach-draft": "courier",
  "follow-up": "shepherd",
  recovery: "shepherd",
  "demo-preparation": "concierge",
  proposal: "courier",
};

/** Task type → the pipeline stage it represents when Hermes is still mid-work on it. */
const TASK_TYPE_STAGE: Record<ShadowTaskType, MissionStage> = {
  "contact-verification": "verify",
  "website-scan": "verify",
  enrichment: "enrich",
  "ai-review": "enrich",
  "outreach-draft": "prepare",
  "follow-up": "prepare",
  recovery: "prepare",
  "demo-preparation": "prepare",
  proposal: "prepare",
  "reply-monitoring": "prepare",
  "close-decision": "approval",
  "founder-review": "approval",
};

/** Narrative "what conventionally follows" hint — not a scheduled fact. */
const NEXT_STAGE_HINT: Partial<Record<MissionStage, HermesAgentKey>> = {
  verify: "enricher",
  enrich: "scribe",
};

function agentLabelOf(agent: MissionAgentSlot): string {
  if (agent === null) return "—";
  if (agent === "founder") return "Founder";
  return HERMES_AGENT_REGISTRY[agent].label;
}

/**
 * Picks the task that currently governs the mission's stage when a lead
 * has more than one. Urgency order: an undecided conflict/founder-only call
 * outranks an undecided approval, which outranks a wait, which outranks
 * safe autonomous prep, which outranks anything already decided.
 */
function pickPrimaryTask(tasks: ShadowTask[], decisions: HermesDecisionMap): ShadowTask {
  function rank(t: ShadowTask): number {
    const decided = Boolean(decisions[t.id]);
    if (!decided && t.decision === "ESCALATE") return 0;
    if (!decided && t.requiresApproval) return 1;
    if (t.decision === "WAIT") return 2;
    if (!decided) return 3;
    return 4;
  }
  return [...tasks].sort((a, b) => rank(a) - rank(b))[0]!;
}

/**
 * Mission timeline — generated only from Shadow Events (already produced by
 * buildRuntimeEvents, untouched) plus the founder's own session decisions.
 * No new activity is invented; hotel-name prefixes already in the event
 * detail are stripped since the mission card already shows the hotel name.
 */
function buildMissionTimeline(
  monitor: HermesMonitor,
  tasks: ShadowTask[],
  decisions: HermesDecisionMap,
  leadId: string,
): HermesMissionTimelineItem[] {
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const hotelName = tasks[0]?.hotelName ?? "";

  const eventItems: HermesMissionTimelineItem[] = monitor.events
    .filter((e) => e.leadId === leadId)
    .map((e) => {
      const relatedTask = e.taskId ? taskById.get(e.taskId) : undefined;
      const actorLabel = relatedTask?.suggestedAgent
        ? HERMES_AGENT_REGISTRY[relatedTask.suggestedAgent].label
        : relatedTask?.decision === "ESCALATE"
          ? "Founder"
          : "Hermes";
      const actorCls =
        actorLabel === "Founder"
          ? "text-zinc-100"
          : actorLabel === "Hermes"
            ? "text-indigo-300"
            : "text-violet-300";

      let text = e.detail;
      if (text.startsWith(`${hotelName}: `)) {
        text = text.slice(hotelName.length + 2);
      } else if (text.startsWith(`${hotelName} — `)) {
        text = text.slice(hotelName.length + 3);
      }
      return { at: e.at, actorLabel, actorCls, text };
    });

  const founderItems: HermesMissionTimelineItem[] = tasks
    .filter((t) => decisions[t.id])
    .map((t) => {
      const d = decisions[t.id]!;
      return {
        at: d.at,
        actorLabel: "Founder",
        actorCls: "text-zinc-100",
        text: `${d.status === "approved" ? "Onayladı" : "Reddetti"} — ${t.suggestedAction.label}`,
      };
    });

  return [...eventItems, ...founderItems].sort((a, b) => a.at - b.at);
}

/**
 * Groups the monitor's shadow tasks by lead and derives one HermesMission
 * per lead. Missions are sorted by execution priority, then impact — the
 * same convention the existing Execution Queue and Mission Brief use.
 */
export function buildHermesMissions(
  monitor: HermesMonitor,
  decisions: HermesDecisionMap,
): HermesMission[] {
  const byLead = new Map<string, ShadowTask[]>();
  for (const task of monitor.tasks) {
    const list = byLead.get(task.leadId) ?? [];
    list.push(task);
    byLead.set(task.leadId, list);
  }

  const missions: HermesMission[] = [];

  for (const [leadId, tasks] of byLead) {
    const primary = pickPrimaryTask(tasks, decisions);
    const founderDecision = decisions[primary.id] ?? null;

    let stage: MissionStage;
    let status: string;
    let decisionState: MissionDecisionState;
    let currentAgent: MissionAgentSlot;
    let nextAgent: MissionAgentSlot;

    if (founderDecision?.status === "rejected") {
      stage = "completed";
      status = "Reddedildi";
      decisionState = "rejected";
      currentAgent = null;
      nextAgent = null;
    } else if (founderDecision?.status === "approved") {
      stage = "execution-ready";
      status = "Onaylandı — A4 yürütmesini bekliyor";
      decisionState = "approved";
      currentAgent = AFTER_APPROVAL_AGENT[primary.taskType] ?? primary.suggestedAgent;
      nextAgent = null;
    } else if (primary.decision === "ESCALATE") {
      stage = "approval";
      status = "Founder kararı bekliyor";
      decisionState = "pending";
      currentAgent = "founder";
      nextAgent = AFTER_APPROVAL_AGENT[primary.taskType] ?? null;
    } else if (primary.requiresApproval) {
      stage = "approval";
      status = "Onay bekliyor";
      decisionState = "pending";
      currentAgent = "founder";
      nextAgent = AFTER_APPROVAL_AGENT[primary.taskType] ?? primary.suggestedAgent;
    } else if (primary.decision === "WAIT") {
      stage = TASK_TYPE_STAGE[primary.taskType] ?? "prepare";
      status = "İzlemede";
      decisionState = "not-required";
      currentAgent = primary.suggestedAgent;
      nextAgent = null;
    } else {
      // RUN && !requiresApproval — safe autonomous prep, mid-pipeline.
      stage = TASK_TYPE_STAGE[primary.taskType] ?? "verify";
      status = "Hermes hazırlıyor";
      decisionState = "not-required";
      currentAgent = primary.suggestedAgent;
      nextAgent = NEXT_STAGE_HINT[stage] ?? null;
    }

    missions.push({
      missionId: `mission:${leadId}`,
      leadId,
      hotelName: primary.hotelName,
      city: primary.city,
      stage,
      stageLabel: MISSION_STAGE_LABELS[stage],
      progress: MISSION_STAGE_PROGRESS[stage],
      status,
      currentAgent,
      currentAgentLabel: agentLabelOf(currentAgent),
      nextAgent,
      nextAgentLabel: agentLabelOf(nextAgent),
      estimatedImpact: Math.max(0, ...tasks.map((t) => t.estimatedImpact)),
      approvalRequired: primary.requiresApproval,
      decisionState,
      taskCount: tasks.length,
      completedTaskCount: tasks.filter((t) => decisions[t.id]?.status === "approved").length,
      blockedTaskCount: tasks.filter((t) => t.decision === "ESCALATE" && !decisions[t.id]).length,
      waitingTaskCount: tasks.filter((t) => t.decision === "WAIT").length,
      priority: primary.priority,
      confidence: primary.confidence,
      primaryTaskId: primary.id,
      tasks,
      timeline: buildMissionTimeline(monitor, tasks, decisions, leadId),
    });
  }

  return missions.sort((a, b) => {
    const rankDiff = EXECUTION_PRIORITY_RANK[b.priority] - EXECUTION_PRIORITY_RANK[a.priority];
    if (rankDiff !== 0) return rankDiff;
    return b.estimatedImpact - a.estimatedImpact;
  });
}
