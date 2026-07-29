import { withAdminSession } from "@/app/lib/auth/require-admin-session";
import {
  approveCurrentDraft,
  buildDailyQueueSnapshot,
  completeItem,
  markContacted,
  planDemoForDailyLoop,
  planFollowUp,
  recordOutcome,
  recordReplyForDailyLoop,
  refreshDailyQueue,
  selectItem,
  skipItem,
  snoozeItem,
} from "@/app/lib/hermes-runtime/daily-loop-repository";
import { hermesErrorResponse, isRecord, json, readJsonBody, readString } from "@/app/lib/hermes-runtime/http";
import {
  isFollowUpReason,
  isSalesLostReason,
  isSalesOutcomeStatus,
  isSalesPackage,
} from "@/app/lib/hermes-runtime/schema";

/**
 * The single mutation surface for the Hermes daily loop.
 *
 * One route rather than eleven, deliberately: every founder decision in the
 * daily workspace — select, skip, snooze, approve, mark-contacted, plan a
 * follow-up, record a reply/demo/outcome, complete — is the same shape from
 * the store's point of view, a guarded write followed by a full queue
 * recompute. Centralizing them here is what makes "client kendi rank/state
 * mantığını yazmamalı" (section 11) true structurally: there is no other path
 * that can mutate daily-loop state, so a client cannot even be tempted to
 * compute the next state itself — it always re-reads the server's answer.
 *
 * Strict discriminated union on `action`. An unrecognized action is a 400,
 * never a silent no-op.
 */

export const dynamic = "force-dynamic";

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readPreset(value: unknown): 1 | 3 | undefined {
  return value === 1 || value === 3 ? value : undefined;
}

async function handlePOST(request: Request): Promise<Response> {
  const body = await readJsonBody(request);
  if (body instanceof Response) return body;
  if (!isRecord(body)) return json({ error: "invalid request" }, 400);

  const localDate = readString(body.localDate);
  if (!localDate) return json({ error: "localDate is required" }, 400);
  const action = readString(body.action);
  if (!action) return json({ error: "action is required" }, 400);

  try {
    switch (action) {
      case "SELECT_ITEM": {
        const itemId = readString(body.itemId);
        if (!itemId) return json({ error: "itemId is required" }, 400);
        await selectItem(localDate, itemId);
        break;
      }
      case "SKIP_ITEM": {
        const itemId = readString(body.itemId);
        if (!itemId) return json({ error: "itemId is required" }, 400);
        await skipItem(localDate, itemId);
        break;
      }
      case "SNOOZE_ITEM": {
        const itemId = readString(body.itemId);
        if (!itemId) return json({ error: "itemId is required" }, 400);
        await snoozeItem(localDate, itemId);
        break;
      }
      case "COMPLETE_ITEM": {
        const itemId = readString(body.itemId);
        if (!itemId) return json({ error: "itemId is required" }, 400);
        await completeItem(localDate, itemId);
        break;
      }
      case "APPROVE_CURRENT_DRAFT": {
        const missionId = readString(body.missionId);
        const leadId = readString(body.leadId);
        const currentMessage = readString(body.currentMessage);
        if (!missionId || !leadId || !currentMessage) {
          return json({ error: "missionId, leadId and currentMessage are required" }, 400);
        }
        await approveCurrentDraft({ missionId, leadId, currentMessage });
        break;
      }
      case "MARK_CONTACTED": {
        const missionId = readString(body.missionId);
        const leadId = readString(body.leadId);
        const currentMessage = readString(body.currentMessage);
        const channel = readString(body.channel);
        if (!missionId || !leadId || !currentMessage) {
          return json({ error: "missionId, leadId and currentMessage are required" }, 400);
        }
        if (
          channel !== "whatsapp" &&
          channel !== "phone" &&
          channel !== "instagram" &&
          channel !== "email"
        ) {
          return json({ error: "channel must be whatsapp, phone, instagram or email" }, 400);
        }
        await markContacted({
          missionId,
          leadId,
          currentMessage,
          channel,
          followUpPresetDays: readPreset(body.followUpPresetDays),
        });
        break;
      }
      case "PLAN_FOLLOW_UP": {
        const missionId = readString(body.missionId);
        const leadId = readString(body.leadId);
        const reason = isFollowUpReason(body.reason) ? body.reason : "manual";
        if (!missionId || !leadId) {
          return json({ error: "missionId and leadId are required" }, 400);
        }
        await planFollowUp({
          missionId,
          leadId,
          reason,
          presetDays: readPreset(body.presetDays),
          note: readString(body.note),
        });
        break;
      }
      case "RECORD_REPLY": {
        const missionId = readString(body.missionId);
        const leadId = readString(body.leadId);
        const replyId = readString(body.replyId) ?? `manual-reply:${missionId}:${Date.now()}`;
        if (!missionId || !leadId) {
          return json({ error: "missionId and leadId are required" }, 400);
        }
        await recordReplyForDailyLoop({
          replyId,
          missionId,
          leadId,
          intent: readString(body.intent),
          urgency: readString(body.urgency),
          messageType: readString(body.messageType),
          textPreview: readString(body.textPreview) ?? null,
          occurredAt: readNumber(body.occurredAt),
        });
        break;
      }
      case "PLAN_DEMO": {
        const missionId = readString(body.missionId);
        const leadId = readString(body.leadId);
        const demoId = readString(body.demoId) ?? `manual-demo:${missionId}:${Date.now()}`;
        if (!missionId || !leadId) {
          return json({ error: "missionId and leadId are required" }, 400);
        }
        await planDemoForDailyLoop({
          demoId,
          missionId,
          leadId,
          status: readString(body.status),
          priority: readString(body.priority),
          scheduledAt: readNumber(body.scheduledAt) ?? null,
          reason: readString(body.reason),
        });
        break;
      }
      case "RECORD_OUTCOME": {
        const missionId = readString(body.missionId);
        const leadId = readString(body.leadId);
        if (!missionId || !leadId || !isSalesOutcomeStatus(body.status)) {
          return json({ error: "missionId, leadId and a valid status are required" }, 400);
        }
        await recordOutcome({
          missionId,
          leadId,
          status: body.status,
          package: isSalesPackage(body.package) ? body.package : null,
          estimatedMrr: readNumber(body.estimatedMrr) ?? null,
          lostReason: isSalesLostReason(body.lostReason) ? body.lostReason : null,
          note: readString(body.note),
        });
        break;
      }
      default:
        return json({ error: "invalid action" }, 400);
    }

    const run = await refreshDailyQueue(localDate);
    const snapshot = await buildDailyQueueSnapshot(localDate);
    return json({ run, items: snapshot.items, summary: snapshot.summary });
  } catch (err) {
    return hermesErrorResponse(err);
  }
}

export const POST = withAdminSession(handlePOST);
