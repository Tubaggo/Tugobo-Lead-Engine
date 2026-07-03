import { EXECUTION_PRIORITY_RANK } from "@/app/lib/execution-runtime";
import { HERMES_AGENT_REGISTRY } from "./types";
import type { HermesLedger, HermesLedgerLeadGroup, ShadowEvaluationRecord } from "./types";

/**
 * Shadow ledger — the read-only "why" record of one monitor pass, grouped
 * by lead. Every evidence line traces to either an ExecutionReason the
 * runtime produced or the decision rule that fired; nothing is invented.
 *
 * A single pass yields one entry per lead; the entries array exists so the
 * shape survives A3+, where multiple passes will append chronologically.
 */

const MAX_EVIDENCE_REASONS = 4;

export function buildShadowLedger(
  records: ShadowEvaluationRecord[],
  now: number,
): HermesLedger {
  const leads: HermesLedgerLeadGroup[] = records.map(({ context, result, task }) => {
    const agentLabel = result.suggestedAgent
      ? HERMES_AGENT_REGISTRY[result.suggestedAgent].label
      : null;

    const evidence = [
      result.decisionReason,
      ...context.judgements.reasons.slice(0, MAX_EVIDENCE_REASONS).map((r) => r.message),
    ];

    return {
      leadId: context.leadId,
      hotelName: context.hotelName,
      city: context.city,
      priority: context.judgements.priority,
      entries: [
        {
          at: now,
          decision: result.decision,
          suggestedAgent: result.suggestedAgent,
          agentLabel,
          taskId: task?.id ?? null,
          evidence,
        },
      ],
    };
  });

  // Highest-priority leads first, ties by name — deterministic for a
  // stable founder reading order.
  leads.sort((a, b) => {
    const diff = EXECUTION_PRIORITY_RANK[b.priority] - EXECUTION_PRIORITY_RANK[a.priority];
    if (diff !== 0) return diff;
    return a.hotelName.localeCompare(b.hotelName, "tr");
  });

  return { generatedAt: now, leads };
}
