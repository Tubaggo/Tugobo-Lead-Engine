import { NextResponse } from "next/server";
import { updateDemoScheduleStatus } from "@/app/lib/demo-scheduling-registry";
import { isValidDemoStatusUpdateTarget } from "@/app/lib/demo-scheduling-runtime";

/**
 * Demo Scheduling — manual status update (v6.4).
 *
 * POST-only. The *only* way a demo item can move to `scheduled`/
 * `completed`/`cancelled`/`no_show` — always a founder clicking a button in
 * `DemoSchedulingCard`, never an automatic inference. Only reads `id`,
 * `status`, and an optional numeric `scheduledAt` off the request body —
 * anything else present (a phone number, message text, a credential) is
 * silently ignored, mirroring `whatsapp-controlled-live-send-request.ts`'s
 * safe-field-allowlist convention. `status` is validated strictly against
 * `DEMO_STATUS_UPDATE_TARGETS`; never sends a message, never touches a
 * calendar.
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

  const { id, status, scheduledAt } = body as Record<string, unknown>;

  if (typeof id !== "string" || !id.trim()) {
    return NextResponse.json({ ok: false, error: "id zorunludur." }, { status: 400 });
  }
  if (!isValidDemoStatusUpdateTarget(status)) {
    return NextResponse.json({ ok: false, error: "Geçersiz durum." }, { status: 400 });
  }

  const metadata = typeof scheduledAt === "number" ? { scheduledAt } : undefined;
  const updated = updateDemoScheduleStatus(id, status, metadata);

  if (!updated) {
    return NextResponse.json({ ok: false, error: "Demo kaydı bulunamadı." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, item: updated });
}
