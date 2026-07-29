import { withAdminSession } from "@/app/lib/auth/require-admin-session";
import {
  hermesErrorResponse,
  isRecord,
  json,
  readJsonBody,
  readString,
} from "@/app/lib/hermes-runtime/http";
import {
  isExternalSendAuthorized,
  resolveMissionApprovalState,
} from "@/app/lib/hermes-runtime/mission-approval-resolver";
import { publishHermesMissionStateSnapshot } from "@/app/lib/hermes-runtime/mission-state-bridge";
import {
  COURIER_DRAFT_STATUSES,
  DELIVERY_GATEWAY_STATUSES,
  FOUNDER_APPROVAL_STATUSES,
  type CourierDraftStatus,
  type DeliveryGatewayStatus,
  type FounderApprovalStatus,
} from "@/app/lib/hermes-runtime/schema";

/**
 * Mission state snapshot — publish (POST) and resolve (GET).
 *
 * Route name kept from the Hermes line (`/api/hermes/mission-state/snapshot`)
 * so the contract the V2 workspace already speaks is unchanged; only the
 * storage behind it moved from an in-memory `Map` to the durable file.
 *
 * The critical property, ported intact: the client publishes *statuses*, never
 * approval booleans. `founderApproved` / `courierDraftApproved` /
 * `deliveryGatewayAllowed` are derived server-side by the resolver and are not
 * readable from any request body — a malicious or buggy client cannot force one
 * to `true`, because no handler here ever destructures such a field.
 *
 * `externalSendAuthorized` is reported for observability only. There is no send
 * path on this branch for it to unlock.
 */

export const dynamic = "force-dynamic";

function isFounderApprovalStatus(v: unknown): v is FounderApprovalStatus {
  return (FOUNDER_APPROVAL_STATUSES as readonly unknown[]).includes(v);
}

function isCourierDraftStatus(v: unknown): v is CourierDraftStatus {
  return (COURIER_DRAFT_STATUSES as readonly unknown[]).includes(v);
}

function isDeliveryGatewayStatus(v: unknown): v is DeliveryGatewayStatus {
  return (DELIVERY_GATEWAY_STATUSES as readonly unknown[]).includes(v);
}

async function handleGET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const missionId = url.searchParams.get("missionId")?.trim() ?? "";
  const leadId = url.searchParams.get("leadId")?.trim() ?? "";

  try {
    // Deliberately not passed via the query string: a message body in a URL
    // would end up in logs and history. Approval-vs-copy binding is checked on
    // the POST path and by any future send path, both of which have a body.
    const resolution = await resolveMissionApprovalState({ missionId, leadId });
    return json({
      resolution,
      externalSendAuthorized: isExternalSendAuthorized(resolution),
    });
  } catch (err) {
    return hermesErrorResponse(err);
  }
}

async function handlePOST(request: Request): Promise<Response> {
  const body = await readJsonBody(request);
  if (body instanceof Response) return body;
  if (!isRecord(body)) return json({ error: "invalid request" }, 400);

  const missionId = readString(body.missionId);
  const leadId = readString(body.leadId);
  if (!missionId || !leadId) {
    return json({ error: "missionId and leadId are required" }, 400);
  }

  if (
    !isFounderApprovalStatus(body.founderApprovalStatus) ||
    !isCourierDraftStatus(body.courierDraftStatus) ||
    !isDeliveryGatewayStatus(body.deliveryGatewayStatus)
  ) {
    return json({ error: "invalid status" }, 400);
  }

  try {
    const snapshot = await publishHermesMissionStateSnapshot({
      missionId,
      leadId,
      founderApprovalStatus: body.founderApprovalStatus,
      courierDraftStatus: body.courierDraftStatus,
      deliveryGatewayStatus: body.deliveryGatewayStatus,
      approvedMessage: typeof body.approvedMessage === "string" ? body.approvedMessage : null,
      source: body.source === "mission_runtime" ? "mission_runtime" : "workspace_snapshot",
    });

    const resolution = await resolveMissionApprovalState({
      missionId,
      leadId,
      currentMessage: typeof body.approvedMessage === "string" ? body.approvedMessage : null,
    });

    return json({
      snapshot,
      resolution,
      externalSendAuthorized: isExternalSendAuthorized(resolution),
    });
  } catch (err) {
    return hermesErrorResponse(err);
  }
}

export const GET = withAdminSession(handleGET);
export const POST = withAdminSession(handlePOST);
