import { withAdminSession } from "@/app/lib/auth/require-admin-session";
import {
  errorJson,
  errorResponse,
  json,
  leadIdRejection,
  readJsonBody,
} from "@/app/lib/operational-state/http";
import { validateLeadId } from "@/app/lib/operational-state/lead-id";
import { appendLeadActivity } from "@/app/lib/operational-state/repository";
import { MAX_ACTIVITY_PER_LEAD } from "@/app/lib/operational-state/schema";

/**
 * Append timeline entries for a lead.
 *
 * Entries carry a client-generated `id`; the repository deduplicates on it, so
 * a retried request is a no-op rather than a doubled event.
 */

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ leadId: string }> };

async function handlePOST(request: Request, ctx: Ctx): Promise<Response> {
  const { leadId } = await ctx.params;
  const valid = validateLeadId(leadId);
  if (!valid.ok) return leadIdRejection(valid.reason);

  const body = await readJsonBody(request);
  if (body instanceof Response) return body;

  const entries = Array.isArray(body)
    ? body
    : Array.isArray((body as { entries?: unknown }).entries)
      ? ((body as { entries: unknown[] }).entries)
      : null;

  if (!entries) return errorJson("invalid request", 400);
  if (entries.length > MAX_ACTIVITY_PER_LEAD) {
    return errorJson("payload too large", 413);
  }

  try {
    return json(await appendLeadActivity(valid.leadId, entries));
  } catch (err) {
    return errorResponse(err);
  }
}

export const POST = withAdminSession(handlePOST);
