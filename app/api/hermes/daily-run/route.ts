import { withAdminSession } from "@/app/lib/auth/require-admin-session";
import {
  buildDailyQueueSnapshot,
  getDailyRun,
  startOrResumeDailyRun,
} from "@/app/lib/hermes-runtime/daily-loop-repository";
import { hermesErrorResponse, isRecord, json, readJsonBody, readString } from "@/app/lib/hermes-runtime/http";

/**
 * The durable daily run — read (GET) and start-or-resume (POST).
 *
 * `localDate` always comes from the caller as an explicit `YYYY-MM-DD`
 * string, never derived from the server clock: the founder's local day and
 * the server's are not guaranteed to match, and a run keyed by the wrong day
 * would silently start a second "today". Idempotent on `localDate` — a
 * second POST for the same day resumes the existing run rather than
 * duplicating it, because the run's id *is* the date.
 *
 * Scans only durable local state. No provider call, no outbound `fetch`,
 * anywhere in this route's import graph.
 */

export const dynamic = "force-dynamic";

async function handleGET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const localDate = url.searchParams.get("localDate")?.trim() ?? "";
  if (!localDate) return json({ error: "localDate is required" }, 400);

  try {
    const [run, snapshot] = await Promise.all([
      getDailyRun(localDate),
      buildDailyQueueSnapshot(localDate),
    ]);
    return json({ run, items: snapshot.items, summary: snapshot.summary });
  } catch (err) {
    return hermesErrorResponse(err);
  }
}

async function handlePOST(request: Request): Promise<Response> {
  const body = await readJsonBody(request);
  if (body instanceof Response) return body;
  if (!isRecord(body)) return json({ error: "invalid request" }, 400);

  const localDate = readString(body.localDate);
  if (!localDate) return json({ error: "localDate is required" }, 400);

  try {
    const run = await startOrResumeDailyRun(localDate);
    const snapshot = await buildDailyQueueSnapshot(localDate);
    return json({ run, items: snapshot.items, summary: snapshot.summary });
  } catch (err) {
    return hermesErrorResponse(err);
  }
}

export const GET = withAdminSession(handleGET);
export const POST = withAdminSession(handlePOST);
