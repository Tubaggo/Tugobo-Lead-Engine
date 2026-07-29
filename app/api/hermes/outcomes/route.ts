import { withAdminSession } from "@/app/lib/auth/require-admin-session";
import { listOutcomes } from "@/app/lib/hermes-runtime/daily-loop-repository";
import { hermesErrorResponse, json } from "@/app/lib/hermes-runtime/http";

/**
 * Read-only sales-outcome feed, for observability outside the daily loop.
 *
 * Recording an outcome is a `RECORD_OUTCOME` action on
 * `POST /api/hermes/daily-run/action` — see `follow-ups/route.ts` for why
 * there is exactly one mutation surface.
 */

export const dynamic = "force-dynamic";

async function handleGET(): Promise<Response> {
  try {
    const items = await listOutcomes();
    return json({ items });
  } catch (err) {
    return hermesErrorResponse(err);
  }
}

export const GET = withAdminSession(handleGET);
