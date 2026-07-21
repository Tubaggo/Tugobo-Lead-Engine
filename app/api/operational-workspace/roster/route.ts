import { withAdminSession } from "@/app/lib/auth/require-admin-session";
import { errorResponse, json, readJsonBody } from "@/app/lib/operational-state/http";
import { getRoster, putRoster } from "@/app/lib/operational-state/repository";

/**
 * The imported lead roster.
 *
 * Deliberately *not* mounted under `/api/operational-state/...`: a static
 * segment there would shadow any lead whose id happened to match it. Keeping
 * workspace-level collections on their own path means `[leadId]` has no
 * reserved words.
 */

export const dynamic = "force-dynamic";

async function handleGET(): Promise<Response> {
  try {
    return json({ roster: await getRoster() });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Replaces the roster wholesale — the client owns the merge. */
async function handlePUT(request: Request): Promise<Response> {
  const body = await readJsonBody(request);
  if (body instanceof Response) return body;

  const raw = Array.isArray(body) ? body : (body as { roster?: unknown }).roster;

  try {
    return json({ count: await putRoster(raw) });
  } catch (err) {
    return errorResponse(err);
  }
}

export const GET = withAdminSession(handleGET);
export const PUT = withAdminSession(handlePUT);
