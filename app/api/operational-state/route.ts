import { withAdminSession } from "@/app/lib/auth/require-admin-session";
import { errorResponse, json, readJsonBody } from "@/app/lib/operational-state/http";
import { getState, migrateLegacyState } from "@/app/lib/operational-state/repository";

/**
 * The whole workspace: per-lead operational state, the imported roster, and
 * today's queue. The dashboard loads this once on mount and treats it as the
 * source of truth for critical state.
 */

export const dynamic = "force-dynamic";

async function handleGET(): Promise<Response> {
  try {
    return json(await getState());
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * One-shot migration of legacy browser state.
 *
 * Idempotent and non-destructive: the repository adopts only what the server
 * does not already have, so replaying this cannot overwrite newer server data
 * or duplicate activity.
 */
async function handlePOST(request: Request): Promise<Response> {
  const body = await readJsonBody(request);
  if (body instanceof Response) return body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "invalid request" }, 400);
  }

  const input = body as {
    leads?: Record<string, unknown>;
    activity?: Record<string, unknown[]>;
    roster?: unknown;
    dailyQueue?: unknown;
  };

  try {
    const result = await migrateLegacyState(input);
    return json({ migrated: true, ...result });
  } catch (err) {
    return errorResponse(err);
  }
}

export const GET = withAdminSession(handleGET);
export const POST = withAdminSession(handlePOST);
