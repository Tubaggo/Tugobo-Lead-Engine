import { withAdminSession } from "@/app/lib/auth/require-admin-session";
import { computeActionQueue } from "@/app/lib/hermes-runtime/action-stage";
import {
  hermesErrorResponse,
  isRecord,
  json,
  readJsonBody,
  readString,
} from "@/app/lib/hermes-runtime/http";
import {
  createMission,
  listDeliveries,
  listDemos,
  listMissions,
  listReplies,
} from "@/app/lib/hermes-runtime/repository";
import { isMissionStage } from "@/app/lib/hermes-runtime/schema";

/**
 * Hermes missions — list (with the ranked action queue) and create.
 *
 * Reads and writes durable runtime state. Sends nothing: this module's import
 * graph contains no provider client, no `fetch` to an external host, and no
 * WhatsApp code of any kind.
 */

export const dynamic = "force-dynamic";

async function handleGET(): Promise<Response> {
  try {
    const [missions, replies, demos, deliveries] = await Promise.all([
      listMissions(),
      listReplies(),
      listDemos(),
      listDeliveries(),
    ]);

    return json({
      missions,
      // The ported Founder Revenue Workspace precedence, computed server-side
      // from the same records the founder can read back. Nothing ranks a
      // mission twice.
      actionQueue: computeActionQueue(missions, { replies, demos, deliveries }),
      counts: {
        missions: missions.length,
        replies: replies.length,
        demos: demos.length,
        deliveries: deliveries.length,
      },
    });
  } catch (err) {
    return hermesErrorResponse(err);
  }
}

async function handlePOST(request: Request): Promise<Response> {
  const body = await readJsonBody(request);
  if (body instanceof Response) return body;
  if (!isRecord(body)) return hermesErrorResponse(new Error("invalid"));

  const missionId = readString(body.missionId);
  const leadId = readString(body.leadId);
  if (!missionId || !leadId) {
    return json({ error: "missionId and leadId are required" }, 400);
  }

  try {
    const mission = await createMission({
      missionId,
      leadId,
      hotelName: readString(body.hotelName),
      status: readString(body.status),
      stage: isMissionStage(body.stage) ? body.stage : undefined,
      approvalRequired:
        typeof body.approvalRequired === "boolean" ? body.approvalRequired : undefined,
      primaryTaskId: readString(body.primaryTaskId),
      tasks: Array.isArray(body.tasks)
        ? body.tasks.flatMap((task) => {
            if (!isRecord(task)) return [];
            const id = readString(task.id);
            if (!id) return [];
            return [{ id, taskType: readString(task.taskType) ?? "unknown" }];
          })
        : undefined,
    });
    return json({ mission });
  } catch (err) {
    return hermesErrorResponse(err);
  }
}

export const GET = withAdminSession(handleGET);
export const POST = withAdminSession(handlePOST);
