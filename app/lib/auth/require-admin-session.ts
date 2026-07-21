import "server-only";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getAuthEnv, normalizeEmail } from "./env";

/**
 * The single server-side authorization boundary.
 *
 * Every protected page and every internal API route goes through here, so the
 * check exists in exactly one place. `proxy.ts` is only an early redirect for
 * page navigations and is deliberately not trusted as a security boundary.
 */

/**
 * True when there is a valid session *and* it belongs to the configured admin.
 * Session existence alone is not sufficient: the e-mail must still match the
 * current environment, so rotating LEAD_ENGINE_ADMIN_EMAIL invalidates old
 * sessions immediately.
 */
export async function hasAdminSession(): Promise<boolean> {
  const env = getAuthEnv();
  if (!env) return false;

  const session = await auth();
  const sessionEmail = normalizeEmail(session?.user?.email);
  if (!sessionEmail) return false;

  return sessionEmail === env.adminEmail;
}

/**
 * API guard. Returns a generic JSON 401 when unauthenticated, or `null` when
 * the caller may proceed.
 *
 * Always JSON — an unauthenticated `fetch` from the dashboard must not receive
 * an HTML login page it would then try to parse.
 */
export async function requireAdminApiSession(): Promise<Response | null> {
  if (await hasAdminSession()) return null;
  return unauthorizedJson();
}

/** The one generic unauthorized response. Reveals nothing about why. */
export function unauthorizedJson(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

/**
 * Page guard. Redirects to `/login` when unauthenticated.
 * Call at the top of every protected server component.
 */
export async function requireAdminPage(): Promise<void> {
  if (!(await hasAdminSession())) redirect("/login");
}

/**
 * Wraps a route handler so the session check cannot be forgotten.
 *
 * Usage: `export const POST = withAdminSession(async (req) => { ... })`
 */
export function withAdminSession<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response> | Response,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    const denied = await requireAdminApiSession();
    if (denied) return denied;
    return handler(...args);
  };
}
