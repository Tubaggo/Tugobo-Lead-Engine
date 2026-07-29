import { withAdminSession } from "@/app/lib/auth/require-admin-session";
import {
  hermesErrorResponse,
  isRecord,
  json,
  readJsonBody,
  readString,
} from "@/app/lib/hermes-runtime/http";
import {
  decideMission,
  failMission,
  transitionMission,
} from "@/app/lib/hermes-runtime/repository";
import { isMissionDecisionState, isMissionStage } from "@/app/lib/hermes-runtime/schema";

/**
 * Mission transitions — stage advance, founder decision, failure.
 *
 * One route rather than three, because all three are the same operation from
 * the store's point of view: a guarded, revision-bumping mutation of one
 * mission. The guard lives in `mission.ts` and rejects an illegal move with a
 * 409, so a client working from stale state is told to re-read rather than
 * silently allowed to drag a mission backwards.
 */

export const dynamic = "force-dynamic";

async function handlePOST(request: Request): Promise<Response> {
  const body = await readJsonBody(request);
  if (body instanceof Response) return body;
  if (!isRecord(body)) return json({ error: "invalid request" }, 400);

  const missionId = readString(body.missionId);
  if (!missionId) return json({ error: "missionId is required" }, 400);

  try {
    if (isMissionStage(body.stage)) {
      const mission = await transitionMission(
        missionId,
        body.stage,
        readString(body.reasonTr) ?? "",
      );
      return json({ mission });
    }

    if (isMissionDecisionState(body.decisionState)) {
      const mission = await decideMission(missionId, body.decisionState);
      return json({ mission });
    }

    const failureCode = readString(body.failureCode);
    if (failureCode) {
      const mission = await failMission(
        missionId,
        failureCode,
        readString(body.failureMessageTr) ?? "",
      );
      return json({ mission });
    }

    return json({ error: "stage, decisionState or failureCode is required" }, 400);
  } catch (err) {
    return hermesErrorResponse(err);
  }
}

export const POST = withAdminSession(handlePOST);
