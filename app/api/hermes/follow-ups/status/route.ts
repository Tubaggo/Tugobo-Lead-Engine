import { NextResponse } from "next/server";
import { updateFollowUpStatus } from "@/app/lib/follow-up-registry";
import { isValidFollowUpStatusUpdateTarget } from "@/app/lib/follow-up-runtime";

/**
 * Follow-up Candidates — manual status update (v6.5).
 *
 * POST-only. The *only* way a candidate can move to `approval_required`/
 * `approved`/`dismissed`/`completed` — always a founder clicking a button
 * in `FollowUpRuntimeCard`, never an automatic transition. Only reads `id`
 * and `status` off the request body — anything else present (a phone
 * number, message text, a credential) is silently ignored, mirroring
 * `demo-scheduling/status/route.ts`'s allowlist convention. `status` is
 * validated strictly against `FOLLOW_UP_STATUS_UPDATE_TARGETS`; never sends
 * a message.
 */

export async function POST(request: Request) {
  const raw = await request.text();
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const { id, status } = body as Record<string, unknown>;

  if (typeof id !== "string" || !id.trim()) {
    return NextResponse.json({ ok: false, error: "id zorunludur." }, { status: 400 });
  }
  if (!isValidFollowUpStatusUpdateTarget(status)) {
    return NextResponse.json({ ok: false, error: "Geçersiz durum." }, { status: 400 });
  }

  const updated = updateFollowUpStatus(id, status);

  if (!updated) {
    return NextResponse.json({ ok: false, error: "Takip kaydı bulunamadı." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, item: updated });
}
