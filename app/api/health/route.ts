/**
 * Public liveness probe for PM2 / Nginx monitoring on the VPS.
 *
 * Intentionally minimal: no external calls, no dependency checks, no env or
 * secret status, no data. It answers exactly one question — is this process
 * up and serving? Anything more would leak deployment detail to an
 * unauthenticated caller.
 */

export const dynamic = "force-dynamic";

export function GET(): Response {
  return new Response(
    JSON.stringify({
      status: "ok",
      service: "tugobo-lead-engine",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    },
  );
}
