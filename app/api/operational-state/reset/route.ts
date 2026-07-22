import { withAdminSession } from "@/app/lib/auth/require-admin-session";
import { BackupFailedError } from "@/app/lib/operational-state/backup";
import {
  errorJson,
  errorResponse,
  json,
  readJsonBody,
} from "@/app/lib/operational-state/http";
import { resetLeadOperationalStates } from "@/app/lib/operational-state/repository";
import {
  isResetProfile,
  MAX_RESET_LEADS,
  normalizeResetIds,
} from "@/app/lib/operational-state/reset";
import { isValidLeadId } from "@/app/lib/operational-state/schema";

/**
 * Clears test operating state for one or more leads.
 *
 * Destructive, so every gate is explicit rather than inferred: the caller must
 * name the profile, list the leads itself, and set `confirm`. Nothing here
 * selects leads by heuristic — "looks like test data" is a judgement only the
 * founder can make, and getting it wrong deletes real pipeline history.
 *
 * Deletes no lead. The roster is not in scope for this route.
 */

export const dynamic = "force-dynamic";

async function handlePOST(request: Request): Promise<Response> {
  const body = await readJsonBody(request);
  if (body instanceof Response) return body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorJson("invalid request", 400);
  }

  const raw = body as Record<string, unknown>;

  // Explicit confirmation, never defaulted. A reset must be asked for.
  if (raw.confirm !== true) return errorJson("confirmation required", 400);

  if (!isResetProfile(raw.profile)) return errorJson("invalid profile", 400);

  if (!Array.isArray(raw.leadIds)) return errorJson("invalid request", 400);
  if (raw.leadIds.length === 0) return errorJson("no leads selected", 400);
  if (raw.leadIds.length > MAX_RESET_LEADS) {
    return errorJson("too many leads", 400);
  }

  const requested = raw.leadIds.filter(isValidLeadId);
  if (requested.length === 0) return errorJson("no valid lead ids", 400);

  const leadIds = normalizeResetIds(requested);

  try {
    const outcome = await resetLeadOperationalStates(leadIds, raw.profile);
    return json({
      ok: true,
      profile: raw.profile,
      requested: leadIds.length,
      changed: outcome.changedCount,
      backupCreated: outcome.backupFile !== null,
      backupFile: outcome.backupFile,
      results: outcome.results,
    });
  } catch (err) {
    // A failed snapshot is reported distinctly: the founder needs to know the
    // reset did not happen *and* why, or they will simply retry into the same
    // wall. No path or errno is included.
    if (err instanceof BackupFailedError) {
      return errorJson("backup failed; nothing was reset", 503);
    }
    return errorResponse(err);
  }
}

export const POST = withAdminSession(handlePOST);
