import { NextResponse } from "next/server";
import { updateSalesOutcomeStatus } from "@/app/lib/sales-outcome-registry";
import {
  isValidSalesLostReason,
  isValidSalesOutcomeStatusUpdateTarget,
  isValidSalesPackage,
  type SalesLostReason,
  type SalesPackage,
} from "@/app/lib/sales-outcome-runtime";

/**
 * Sales Outcomes — manual status update (v6.6).
 *
 * POST-only. The *only* way an outcome can move to `won`/`lost`/`paused`/
 * `no_decision`/`open` — always a founder submitting `SalesOutcomeCard`,
 * never an automatic inference. Only reads `id`, `status`, `package`,
 * `estimatedMrr`, `lostReason`, `outcomeNote`, `closedAt` off the request
 * body — anything else present (a phone number, message text, a
 * credential) is silently ignored, mirroring
 * `demo-scheduling/status/route.ts`'s allowlist convention. `status`/
 * `package`/`lostReason` are validated strictly; `estimatedMrr` must be a
 * finite non-negative number; `won` requires a real package or a positive
 * revenue estimate, `lost` requires a real reason or a note (enforced by
 * the registry via `isValidSalesOutcomeStatusUpdate`). Never calls an
 * external API, never sends a message.
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

  const { id, status, package: pkg, estimatedMrr, lostReason, outcomeNote, closedAt } = body as Record<string, unknown>;

  if (typeof id !== "string" || !id.trim()) {
    return NextResponse.json({ ok: false, error: "id zorunludur." }, { status: 400 });
  }
  if (!isValidSalesOutcomeStatusUpdateTarget(status)) {
    return NextResponse.json({ ok: false, error: "Geçersiz durum." }, { status: 400 });
  }
  if (pkg !== undefined && !isValidSalesPackage(pkg)) {
    return NextResponse.json({ ok: false, error: "Geçersiz paket." }, { status: 400 });
  }
  if (lostReason !== undefined && !isValidSalesLostReason(lostReason)) {
    return NextResponse.json({ ok: false, error: "Geçersiz kayıp nedeni." }, { status: 400 });
  }
  if (estimatedMrr !== undefined && (typeof estimatedMrr !== "number" || !Number.isFinite(estimatedMrr) || estimatedMrr < 0)) {
    return NextResponse.json({ ok: false, error: "Geçersiz tahmini MRR." }, { status: 400 });
  }
  if (closedAt !== undefined && (typeof closedAt !== "number" || !Number.isFinite(closedAt))) {
    return NextResponse.json({ ok: false, error: "Geçersiz kapanış zamanı." }, { status: 400 });
  }

  const result = updateSalesOutcomeStatus(id, {
    status,
    package: pkg as SalesPackage | undefined,
    estimatedMrr: estimatedMrr as number | undefined,
    lostReason: lostReason as SalesLostReason | undefined,
    outcomeNote: typeof outcomeNote === "string" ? outcomeNote : undefined,
    closedAt: closedAt as number | undefined,
  });

  if (!result.ok) {
    if (result.error === "not_found") {
      return NextResponse.json({ ok: false, error: "Satış sonucu kaydı bulunamadı." }, { status: 404 });
    }
    return NextResponse.json(
      { ok: false, error: "Kazanıldı için paket veya tahmini gelir, kaybedildi için neden veya not gereklidir." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, item: result.item });
}
