import type { ScoredLead } from "@/app/lib/leads";
import { buildExecutionContexts } from "@/app/lib/execution-runtime";
import type { ExecutionContext } from "@/app/lib/execution-runtime";
import { decideShadow } from "./decision-engine";
import { buildShadowTask } from "./task-builder";
import { buildShadowLedger } from "./shadow-ledger";
import { buildRuntimeEvents } from "./events";
import { buildMorningBriefPreview } from "./briefing";
import type {
  HermesApprovalCandidate,
  HermesMonitor,
  HermesMonitorSummary,
  ShadowDecision,
  ShadowEvaluationRecord,
  ShadowTask,
} from "./types";

/**
 * Hermes Monitor — the shadow runtime's single public entry point.
 *
 * One pass: ExecutionContext[] → decisions → shadow tasks → ledger →
 * events → brief preview. Pure and re-runnable: same contexts and `now`
 * in, same monitor out. Nothing here mutates a lead, touches storage,
 * or calls anything external — the pass itself is the entire lifetime
 * of everything it produces.
 */

function toApprovalCandidate(task: ShadowTask): HermesApprovalCandidate {
  return {
    leadId: task.leadId,
    hotelName: task.hotelName,
    city: task.city,
    taskId: task.id,
    actionLabel: task.suggestedAction.label,
    actionReason: task.decisionReason,
    priority: task.priority,
    confidence: task.confidence,
    estimatedImpact: task.estimatedImpact,
    decision: task.decision,
  };
}

function buildSummary(records: ShadowEvaluationRecord[], now: number): HermesMonitorSummary {
  const decisionCounts: Record<ShadowDecision, number> = {
    RUN: 0,
    WAIT: 0,
    SKIP: 0,
    APPROVAL: 0,
    ESCALATE: 0,
  };
  const agentTaskCounts: HermesMonitorSummary["agentTaskCounts"] = {};
  const approvalCandidates: HermesApprovalCandidate[] = [];
  const escalations: HermesApprovalCandidate[] = [];
  let shadowTaskCount = 0;

  for (const { result, task } of records) {
    decisionCounts[result.decision] += 1;
    if (!task) continue;

    shadowTaskCount += 1;
    if (task.suggestedAgent) {
      agentTaskCounts[task.suggestedAgent] = (agentTaskCounts[task.suggestedAgent] ?? 0) + 1;
    }
    if (task.decision === "ESCALATE") {
      escalations.push(toApprovalCandidate(task));
    } else if (task.requiresApproval) {
      approvalCandidates.push(toApprovalCandidate(task));
    }
  }

  return {
    generatedAt: now,
    leadsEvaluated: records.length,
    shadowTaskCount,
    decisionCounts,
    agentTaskCounts,
    approvalCandidates,
    escalations,
  };
}

/**
 * Runs one full shadow pass over already-built ExecutionContexts.
 * Contexts are deduped by leadId defensively, mirroring the execution
 * queue's own backstop.
 */
export function buildHermesMonitor(
  contexts: ExecutionContext[],
  options: { now?: number } = {},
): HermesMonitor {
  const now = options.now ?? Date.now();

  const seen = new Set<string>();
  const records: ShadowEvaluationRecord[] = [];

  for (const context of contexts) {
    if (seen.has(context.leadId)) continue;
    seen.add(context.leadId);

    const result = decideShadow(context);
    const task = buildShadowTask(context, result, now);
    records.push({ context, result, task });
  }

  const summary = buildSummary(records, now);
  const tasks = records
    .map((r) => r.task)
    .filter((t): t is ShadowTask => t !== null);
  const ledger = buildShadowLedger(records, now);
  const events = buildRuntimeEvents(records, now);
  const brief = buildMorningBriefPreview(summary, tasks, now);

  return { generatedAt: now, summary, tasks, ledger, events, brief };
}

/**
 * Convenience bridge for callers that hold raw leads (Automation Center
 * in A3): builds the ExecutionContexts through the existing runtime —
 * never a parallel derivation — then runs the monitor pass.
 */
export function buildHermesMonitorFromLeads(
  leads: ScoredLead[],
  options: { now?: number } = {},
): HermesMonitor {
  return buildHermesMonitor(buildExecutionContexts(leads), options);
}
