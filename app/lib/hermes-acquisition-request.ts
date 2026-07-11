import type { AcquisitionTrigger } from "./hermes-autonomous-acquisition-policy.ts";

/**
 * Acquisition run request parsing + trigger authorization (Sprint C1 —
 * Scope 6/7). Pure helpers, node-testable, used only by
 * `/api/hermes/acquisition/run`.
 *
 * Security contract:
 *  - The client body may carry ONLY `trigger` and `dryRun` — nothing else is
 *    ever destructured, so a malicious body can never set a policy limit,
 *    `founderApproved`, an auto-send flag, or an approval boolean.
 *  - `dryRun` from the client can only force dry-run ON. Turning dry-run OFF
 *    is exclusively a server-side env decision.
 *  - The "scheduled" trigger requires the cron secret via the
 *    `Authorization: Bearer <secret>` header — never the body, never a
 *    query parameter. A wrong or missing secret is rejected before any
 *    policy evaluation. The secret value itself never leaves this function's
 *    comparison.
 */

export function parseJsonBodySafely(raw: string): unknown | undefined {
  if (raw.trim() === "") return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

export type ParsedAcquisitionRunRequest = {
  trigger: AcquisitionTrigger;
  /** True only when the client explicitly asked for a preview. Never turns dry-run off. */
  forceDryRun: boolean;
};

/**
 * Strict subset parse. An unknown/missing trigger defaults to "manual";
 * a structurally invalid body returns null so the route can 400 safely.
 */
export function parseAcquisitionRunRequest(body: unknown): ParsedAcquisitionRunRequest | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;

  let trigger: AcquisitionTrigger = "manual";
  if (b.trigger !== undefined) {
    if (b.trigger !== "scheduled" && b.trigger !== "manual" && b.trigger !== "developer") return null;
    trigger = b.trigger;
  }

  return {
    trigger,
    forceDryRun: b.dryRun === true,
  };
}

export type TriggerAuthorization =
  | { ok: true }
  | { ok: false; status: 401 | 403 | 503; errorTr: string };

/**
 * Scheduled triggers require the configured cron secret in the
 * Authorization header. Manual/developer triggers need no secret (the app
 * has no auth layer; the policy gates — disabled by default — are the
 * actual barrier), but if an Authorization header IS present it must still
 * be correct, so a caller can never "downgrade" a bad secret into a manual
 * run silently.
 */
export function authorizeAcquisitionTrigger(input: {
  trigger: AcquisitionTrigger;
  authorizationHeader: string | null;
  configuredSecret: string | undefined;
}): TriggerAuthorization {
  const secret = input.configuredSecret?.trim();
  const header = input.authorizationHeader?.trim() ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;

  if (input.trigger === "scheduled") {
    if (!secret) {
      return { ok: false, status: 503, errorTr: "Planlı tarama henüz yapılandırılmadı." };
    }
    if (!bearer) {
      return { ok: false, status: 401, errorTr: "Yetkilendirme gerekli." };
    }
    if (bearer !== secret) {
      return { ok: false, status: 403, errorTr: "Yetkilendirme doğrulanamadı." };
    }
    return { ok: true };
  }

  if (bearer !== null && secret && bearer !== secret) {
    return { ok: false, status: 403, errorTr: "Yetkilendirme doğrulanamadı." };
  }
  return { ok: true };
}
