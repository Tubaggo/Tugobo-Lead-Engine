import { NextResponse } from "next/server";
import { loadAcquisitionConfigFromEnv } from "@/app/lib/hermes-acquisition-config";
import {
  authorizeAcquisitionTrigger,
  parseAcquisitionRunRequest,
  parseJsonBodySafely,
} from "@/app/lib/hermes-acquisition-request";
import { runHermesAutonomousAcquisition } from "@/app/lib/hermes-autonomous-acquisition-runtime";
import { hermesAcquisitionServerImportAdapter } from "@/app/lib/hermes-acquisition-server-adapter";
import {
  readAcquisitionRegionStateFromDisk,
  writeAcquisitionRegionStateToDisk,
} from "@/app/lib/hermes-acquisition-region-state-store";

/**
 * Hermes Autonomous Acquisition — scheduler-compatible run trigger
 * (Sprint C1 — Scope 6/7).
 *
 * POST-only. Callable by an external scheduler (VPS cron, Railway cron,
 * Vercel Cron, GitHub Actions) with
 * `Authorization: Bearer <HERMES_ACQUISITION_CRON_SECRET>` and
 * `{"trigger":"scheduled"}`, or by the Developer Mode UI with
 * `{"trigger":"developer","dryRun":true}`.
 *
 * Everything that matters is decided server-side:
 *  - the body is parsed by `parseAcquisitionRunRequest`, which structurally
 *    cannot yield anything beyond `trigger` + a dry-run-ON request — no
 *    client can raise a limit, enable acquisition, set founderApproved, or
 *    request an auto-send;
 *  - the cron secret is read from env here only, compared inside
 *    `authorizeAcquisitionTrigger`, and never logged or echoed;
 *  - policy/config/limits come exclusively from
 *    `loadAcquisitionConfigFromEnv(process.env)`;
 *  - a disabled policy yields a blocked result with zero external calls —
 *    the orchestrator guarantees the adapter is never invoked in that case.
 *
 * The response is the orchestrator's sanitized result object — counts,
 * status, Turkish summary. Never a secret, an env name, or a raw provider
 * payload.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const body = parseJsonBodySafely(raw);
  if (body === undefined) {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const parsed = parseAcquisitionRunRequest(body);
  if (!parsed) {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const auth = authorizeAcquisitionTrigger({
    trigger: parsed.trigger,
    authorizationHeader: request.headers.get("authorization"),
    configuredSecret: process.env.HERMES_ACQUISITION_CRON_SECRET,
  });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.errorTr }, { status: auth.status });
  }

  const config = loadAcquisitionConfigFromEnv(process.env);
  const result = await runHermesAutonomousAcquisition({
    trigger: parsed.trigger,
    config,
    importAdapter: hermesAcquisitionServerImportAdapter,
    forceDryRun: parsed.forceDryRun,
    // Türkiye Region Rotation v1.0 — durable rotation cursor, server-only.
    regionStateHydrator: readAcquisitionRegionStateFromDisk,
    regionStatePersister: writeAcquisitionRegionStateToDisk,
  });

  return NextResponse.json(result);
}
