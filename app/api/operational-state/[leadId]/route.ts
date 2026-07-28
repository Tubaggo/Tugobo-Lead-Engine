import { withAdminSession } from "@/app/lib/auth/require-admin-session";
import {
  errorJson,
  errorResponse,
  json,
  leadIdRejection,
  readJsonBody,
} from "@/app/lib/operational-state/http";
import { validateLeadId } from "@/app/lib/operational-state/lead-id";
import { getLeadState, patchLeadState } from "@/app/lib/operational-state/repository";
import { parseLeadStatePatch } from "@/app/lib/operational-state/schema";

/** Read and update a single lead's operational state. */

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ leadId: string }> };

/**
 * The lead id is only ever an object key inside one JSON file — it is never
 * joined into a path — but it is still validated here so a malformed,
 * traversal-shaped or placeholder id ("undefined", "null") is rejected at the
 * edge rather than stored. Membership is checked deeper, inside the write
 * transaction, where it cannot go stale between the check and the write.
 */
async function handleGET(_request: Request, ctx: Ctx): Promise<Response> {
  const { leadId } = await ctx.params;
  const valid = validateLeadId(leadId);
  if (!valid.ok) return leadIdRejection(valid.reason);

  try {
    const state = await getLeadState(valid.leadId);
    if (!state) return errorJson("not found", 404);
    return json(state);
  } catch (err) {
    return errorResponse(err);
  }
}

async function handlePATCH(request: Request, ctx: Ctx): Promise<Response> {
  const { leadId: rawLeadId } = await ctx.params;
  const valid = validateLeadId(rawLeadId);
  if (!valid.ok) return leadIdRejection(valid.reason);
  const leadId = valid.leadId;

  const body = await readJsonBody(request);
  if (body instanceof Response) return body;

  const raw = body as Record<string, unknown>;
  const patch = parseLeadStatePatch(raw);
  if (!patch) return errorJson("invalid request", 400);

  // Optional optimistic-concurrency check. Absent means last-write-wins, which
  // is what the single-founder UI wants for fire-and-forget field edits.
  const expected = raw.expectedRevision;
  const expectedRevision =
    typeof expected === "number" && Number.isInteger(expected) && expected >= 0
      ? expected
      : undefined;

  try {
    return json(await patchLeadState(leadId, patch, expectedRevision));
  } catch (err) {
    return errorResponse(err);
  }
}

export const GET = withAdminSession(handleGET);
export const PATCH = withAdminSession(handlePATCH);
