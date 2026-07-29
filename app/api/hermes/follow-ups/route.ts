import { withAdminSession } from "@/app/lib/auth/require-admin-session";
import { listFollowUps } from "@/app/lib/hermes-runtime/daily-loop-repository";
import { hermesErrorResponse, json } from "@/app/lib/hermes-runtime/http";

/**
 * Read-only follow-up feed, for observability outside the daily loop.
 *
 * Every founder-facing mutation of a follow-up (plan, approve, dismiss,
 * complete) goes through `POST /api/hermes/daily-run/action` instead — one
 * mutation surface, so a follow-up's due instant is never computed or
 * written from two different routes.
 */

export const dynamic = "force-dynamic";

async function handleGET(): Promise<Response> {
  try {
    const items = await listFollowUps();
    return json({ items });
  } catch (err) {
    return hermesErrorResponse(err);
  }
}

export const GET = withAdminSession(handleGET);
