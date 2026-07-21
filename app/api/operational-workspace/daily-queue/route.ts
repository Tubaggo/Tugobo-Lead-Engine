import { withAdminSession } from "@/app/lib/auth/require-admin-session";
import { errorResponse, json, readJsonBody } from "@/app/lib/operational-state/http";
import { getState, putDailyQueue } from "@/app/lib/operational-state/repository";

/** Today's outreach queue: a single workspace-scoped record, not per-lead. */

export const dynamic = "force-dynamic";

async function handleGET(): Promise<Response> {
  try {
    return json({ dailyQueue: (await getState()).dailyQueue });
  } catch (err) {
    return errorResponse(err);
  }
}

async function handlePUT(request: Request): Promise<Response> {
  const body = await readJsonBody(request);
  if (body instanceof Response) return body;

  const raw =
    body && typeof body === "object" && "dailyQueue" in (body as object)
      ? (body as { dailyQueue: unknown }).dailyQueue
      : body;

  try {
    return json({ dailyQueue: await putDailyQueue(raw) });
  } catch (err) {
    return errorResponse(err);
  }
}

export const GET = withAdminSession(handleGET);
export const PUT = withAdminSession(handlePUT);
