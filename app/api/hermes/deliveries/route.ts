import { withAdminSession } from "@/app/lib/auth/require-admin-session";
import {
  hermesErrorResponse,
  isRecord,
  json,
  readJsonBody,
  readString,
} from "@/app/lib/hermes-runtime/http";
import { listDeliveries, recordDelivery } from "@/app/lib/hermes-runtime/repository";

/**
 * Hermes delivery receipts — durable record only.
 *
 * Nothing here polls a provider or receives a callback. A receipt exists in
 * this store because an authenticated caller recorded one, which in Milestone 1
 * means a test or a founder-triggered action.
 *
 * The reason to build the shape now, before the webhook: a delivery receipt is
 * the one Hermes record type that arrives once and can never be re-requested.
 * Standing up a public webhook while the store still lost everything on restart
 * would lose receipts silently. This route is that store, proven first.
 */

export const dynamic = "force-dynamic";

async function handleGET(): Promise<Response> {
  try {
    return json({ deliveries: await listDeliveries() });
  } catch (err) {
    return hermesErrorResponse(err);
  }
}

async function handlePOST(request: Request): Promise<Response> {
  const body = await readJsonBody(request);
  if (body instanceof Response) return body;
  if (!isRecord(body)) return json({ error: "invalid request" }, 400);

  const providerMessageId = readString(body.providerMessageId);
  if (!providerMessageId) {
    return json({ error: "providerMessageId is required" }, 400);
  }

  try {
    const delivery = await recordDelivery({
      providerMessageId,
      status: readString(body.status),
      rawStatus: readString(body.rawStatus) ?? "",
      occurredAt:
        typeof body.occurredAt === "number" && Number.isFinite(body.occurredAt)
          ? body.occurredAt
          : undefined,
      missionId: readString(body.missionId) ?? null,
      leadId: readString(body.leadId) ?? null,
    });
    return json({ delivery });
  } catch (err) {
    return hermesErrorResponse(err);
  }
}

export const GET = withAdminSession(handleGET);
export const POST = withAdminSession(handlePOST);
