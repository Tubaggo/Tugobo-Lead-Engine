import { withAdminSession } from "@/app/lib/auth/require-admin-session";
import {
  hermesErrorResponse,
  isRecord,
  json,
  readJsonBody,
  readString,
} from "@/app/lib/hermes-runtime/http";
import { listReplies, recordReply } from "@/app/lib/hermes-runtime/repository";

/**
 * Hermes replies — durable record only.
 *
 * This is NOT a listener and NOT a webhook. It is authenticated like every
 * other route here, so an inbound provider callback could not reach it even if
 * one existed; Meta's webhook is a separate, public, signature-verified surface
 * and it is deliberately not part of this milestone.
 *
 * What this route does is prove the reply *shape* survives a restart, so the
 * later webhook milestone writes into a store that has already been shown to
 * hold. Recording a reply here never triggers a send, a follow-up or a demo.
 */

export const dynamic = "force-dynamic";

async function handleGET(): Promise<Response> {
  try {
    return json({ replies: await listReplies() });
  } catch (err) {
    return hermesErrorResponse(err);
  }
}

async function handlePOST(request: Request): Promise<Response> {
  const body = await readJsonBody(request);
  if (body instanceof Response) return body;
  if (!isRecord(body)) return json({ error: "invalid request" }, 400);

  const replyId = readString(body.replyId);
  if (!replyId) return json({ error: "replyId is required" }, 400);

  try {
    const reply = await recordReply({
      replyId,
      providerMessageId: readString(body.providerMessageId),
      fromMasked: readString(body.fromMasked) ?? null,
      messageType: readString(body.messageType),
      textPreview: readString(body.textPreview) ?? null,
      occurredAt:
        typeof body.occurredAt === "number" && Number.isFinite(body.occurredAt)
          ? body.occurredAt
          : undefined,
      conversationIdSafe: readString(body.conversationIdSafe) ?? null,
      contactProfileNameSafe: readString(body.contactProfileNameSafe) ?? null,
      missionId: readString(body.missionId) ?? null,
      leadId: readString(body.leadId) ?? null,
      intent: readString(body.intent),
      urgency: readString(body.urgency),
    });
    return json({ reply });
  } catch (err) {
    return hermesErrorResponse(err);
  }
}

export const GET = withAdminSession(handleGET);
export const POST = withAdminSession(handlePOST);
