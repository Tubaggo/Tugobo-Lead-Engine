import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Early redirect layer for page navigations (Next.js 16 renamed Middleware to
 * Proxy; the behaviour is unchanged).
 *
 * This is an OPTIMISTIC check only: it looks for the presence of a session
 * cookie so an unauthenticated visitor lands on /login instead of flashing the
 * dashboard shell. It does NOT verify the token — a forged cookie gets past
 * this layer by design. Real authorization happens server-side in
 * `require-admin-session.ts`, which every protected page and API route calls.
 *
 * Keeping verification out of the proxy also keeps bcrypt and the Node-only
 * auth config off the edge runtime.
 */

/** Auth.js session cookie, plain in dev and `__Secure-` prefixed over HTTPS. */
const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some(
    (name) => (request.cookies.get(name)?.value ?? "").length > 0,
  );
}

export function proxy(request: NextRequest) {
  if (hasSessionCookie(request)) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  // Preserve the intended destination as a path only; the login action
  // re-validates it before redirecting.
  const { pathname, search } = request.nextUrl;
  if (pathname !== "/") loginUrl.searchParams.set("callbackUrl", pathname + search);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  /**
   * Runs on everything except:
   *  - /login and the Auth.js endpoints (must stay reachable while signed out)
   *  - /api/health (public probe for PM2/Nginx monitoring)
   *  - /api/* generally — those routes enforce their own JSON 401 rather than
   *    being redirected to an HTML page
   *  - Next.js internals, static assets, and crawler files
   */
  matcher: [
    "/((?!login|api/|_next/static|_next/image|assets/|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)",
  ],
};
