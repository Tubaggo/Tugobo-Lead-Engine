import type {
  HermesRuntimeEvent,
  HermesEventType,
  ShadowDecision,
  ShadowEvaluationRecord,
} from "./types";

/**
 * Runtime event stream — an ephemeral audit projection of one monitor
 * pass. Events are derived, never persisted: replaying the same contexts
 * through the monitor yields the same stream.
 */

const DECISION_EVENT: Record<ShadowDecision, HermesEventType> = {
  RUN: "decision.run",
  WAIT: "decision.wait",
  SKIP: "decision.skip",
  APPROVAL: "decision.approval",
  ESCALATE: "decision.escalated",
};

export function buildRuntimeEvents(
  records: ShadowEvaluationRecord[],
  now: number,
): HermesRuntimeEvent[] {
  const events: HermesRuntimeEvent[] = [];
  let seq = 0;

  const push = (
    type: HermesEventType,
    leadId: string | null,
    taskId: string | null,
    detail: string,
  ) => {
    seq += 1;
    events.push({
      id: `hermes-evt-${seq}`,
      type,
      at: now,
      actor: "hermes:monitor",
      leadId,
      taskId,
      detail,
    });
  };

  for (const { context, result, task } of records) {
    push(
      DECISION_EVENT[result.decision],
      context.leadId,
      task?.id ?? null,
      `${context.hotelName}: ${result.decisionReason}`,
    );
    if (task) {
      push(
        "task.created",
        task.leadId,
        task.id,
        `${task.hotelName} — ${task.suggestedAction.label} (gölge görev, yürütülmez)`,
      );
    }
  }

  const taskCount = records.filter((r) => r.task !== null).length;
  push("brief.generated", null, null, "Founder brifing önizlemesi oluşturuldu.");
  push(
    "monitor.completed",
    null,
    null,
    `Hermes Monitor tamamlandı: ${records.length} lead değerlendirildi, ${taskCount} gölge görev üretildi.`,
  );

  return events;
}
