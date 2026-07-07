import { NextResponse } from "next/server";
import {
  deriveMissionApprovalFromSnapshot,
  publishHermesMissionStateSnapshot,
} from "@/app/lib/hermes-mission-state-bridge";
import {
  parseJsonBodySafely,
  parseMissionStateSnapshotRequestFields,
} from "@/app/lib/hermes-mission-state-snapshot-request";

/**
 * Mission State Bridge — snapshot sync (v5.1.2).
 *
 * POST-only. Accepts only missionId, leadId, and the three status enums
 * (founderApprovalStatus / courierDraftStatus / deliveryGatewayStatus).
 * Never reads an approval boolean, message text, recipient phone, or a
 * provider credential from the body — `parseMissionStateSnapshotRequestFields`
 * simply never destructures them.
 *
 * This route never sends anything and never calls the WhatsApp Cloud API —
 * it only writes a sanitized in-memory snapshot that
 * `hermes-mission-approval-resolver.ts` reads back later, from an
 * unrelated request (the controlled-send route).
 */

function safeErrorResponse(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  const parsedBody = parseJsonBodySafely(raw);
  if (parsedBody === undefined) {
    return safeErrorResponse("Geçersiz istek gövdesi.");
  }

  const fields = parseMissionStateSnapshotRequestFields(parsedBody);
  if (!fields) {
    return safeErrorResponse("Geçersiz mission state snapshot.");
  }

  const snapshot = publishHermesMissionStateSnapshot(fields);
  const derived = deriveMissionApprovalFromSnapshot(snapshot);

  return NextResponse.json({
    ok: true,
    missionId: snapshot.missionId,
    leadId: snapshot.leadId,
    source: snapshot.source,
    updatedAt: snapshot.updatedAt,
    expiresAt: snapshot.expiresAt,
    founderApproved: derived.founderApproved,
    courierDraftApproved: derived.courierDraftApproved,
    deliveryGatewayAllowed: derived.deliveryGatewayAllowed,
    blockingReasons: derived.blockingReasons,
  });
}
