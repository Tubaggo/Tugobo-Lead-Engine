import { withAdminSession } from "@/app/lib/auth/require-admin-session";
import {
  hermesErrorResponse,
  isRecord,
  json,
  readJsonBody,
  readString,
} from "@/app/lib/hermes-runtime/http";
import {
  listDemos,
  recordDemo,
  updateDemoStatus,
} from "@/app/lib/hermes-runtime/repository";
import { DEMO_STATUS_LABELS_TR, type DemoScheduleStatus } from "@/app/lib/hermes-runtime/schema";

/**
 * Hermes demo scheduling — durable record and founder-only status changes.
 *
 * The Hermes line's rule is preserved: a demo reaches `scheduled` /
 * `completed` / `cancelled` / `no_show` only through an explicit founder
 * action, never automatically and never as a side effect of a reply. PATCH is
 * that action, and it is the only way those four statuses can be written.
 *
 * No calendar API is called. Nothing is booked anywhere but here.
 */

export const dynamic = "force-dynamic";

function isDemoStatus(value: unknown): value is DemoScheduleStatus {
  return typeof value === "string" && value in DEMO_STATUS_LABELS_TR;
}

async function handleGET(): Promise<Response> {
  try {
    return json({ demos: await listDemos() });
  } catch (err) {
    return hermesErrorResponse(err);
  }
}

async function handlePOST(request: Request): Promise<Response> {
  const body = await readJsonBody(request);
  if (body instanceof Response) return body;
  if (!isRecord(body)) return json({ error: "invalid request" }, 400);

  const demoId = readString(body.demoId);
  if (!demoId) return json({ error: "demoId is required" }, 400);

  try {
    const demo = await recordDemo({
      demoId,
      missionId: readString(body.missionId) ?? null,
      leadId: readString(body.leadId) ?? null,
      sourceProviderMessageId: readString(body.sourceProviderMessageId) ?? null,
      sourceIntent: readString(body.sourceIntent),
      status: readString(body.status),
      priority: readString(body.priority),
      leadName: readString(body.leadName) ?? null,
      suggestedAction: readString(body.suggestedAction) ?? "",
      reason: readString(body.reason) ?? "",
    });
    return json({ demo });
  } catch (err) {
    return hermesErrorResponse(err);
  }
}

async function handlePATCH(request: Request): Promise<Response> {
  const body = await readJsonBody(request);
  if (body instanceof Response) return body;
  if (!isRecord(body)) return json({ error: "invalid request" }, 400);

  const demoId = readString(body.demoId);
  if (!demoId) return json({ error: "demoId is required" }, 400);
  if (!isDemoStatus(body.status)) return json({ error: "invalid status" }, 400);

  try {
    return json({ demo: await updateDemoStatus(demoId, body.status) });
  } catch (err) {
    return hermesErrorResponse(err);
  }
}

export const GET = withAdminSession(handleGET);
export const POST = withAdminSession(handlePOST);
export const PATCH = withAdminSession(handlePATCH);
