import { isStorageReady } from "@/app/lib/operational-state/repository";

/**
 * Public liveness probe for PM2 / Nginx monitoring on the VPS.
 *
 * Intentionally minimal: no external calls, no dependency checks, no env or
 * secret status, no data. It answers two questions — is this process up, and
 * can it persist operational state? Anything more would leak deployment detail
 * to an unauthenticated caller, so `storage` is a bare "ready"/"unavailable"
 * and never the path, the file name, or the number of leads.
 *
 * A missing state file is still `ready`: a fresh install has no data yet, and
 * what matters is that the directory can be written.
 */

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const ready = await isStorageReady();

  return new Response(
    JSON.stringify({
      status: ready ? "ok" : "degraded",
      service: "tugobo-lead-engine",
      storage: ready ? "ready" : "unavailable",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    }),
    {
      // 503 so PM2 / Nginx treat an unwritable data directory as a real
      // outage: the app would appear to work while silently losing every edit.
      status: ready ? 200 : 503,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    },
  );
}
