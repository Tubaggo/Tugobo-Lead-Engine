import { withAdminSession } from "@/app/lib/auth/require-admin-session";
import {
  buildDailyQueueSnapshot,
  refreshDailyQueue,
} from "@/app/lib/hermes-runtime/daily-loop-repository";
import { hermesErrorResponse, isRecord, json, readJsonBody, readString } from "@/app/lib/hermes-runtime/http";

/**
 * "Bugünkü Kuyruğu Yenile" — recomputes an already-started run's queue
 * against current durable state. 404s if no run exists yet for the date;
 * the founder starts one first via `POST /api/hermes/daily-run`.
 */

export const dynamic = "force-dynamic";

async function handlePOST(request: Request): Promise<Response> {
  const body = await readJsonBody(request);
  if (body instanceof Response) return body;
  if (!isRecord(body)) return json({ error: "invalid request" }, 400);

  const localDate = readString(body.localDate);
  if (!localDate) return json({ error: "localDate is required" }, 400);

  try {
    const run = await refreshDailyQueue(localDate);
    const snapshot = await buildDailyQueueSnapshot(localDate);
    return json({ run, items: snapshot.items, summary: snapshot.summary });
  } catch (err) {
    return hermesErrorResponse(err);
  }
}

export const POST = withAdminSession(handlePOST);
