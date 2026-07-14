import { NextResponse } from "next/server";
import {
  authorizeAcquisitionTrigger,
  parseAcquisitionRunRequest,
  parseJsonBodySafely,
} from "@/app/lib/hermes-acquisition-request";
import { runFollowUpOrchestration } from "@/app/lib/hermes-follow-up-orchestration-service";
import { summarizeFollowUpOrchestration } from "@/app/lib/hermes-autonomous-follow-up-orchestrator";

/**
 * Hermes Follow-up Orchestration — scheduler-compatible evaluate trigger
 * (Sprint C5 — Scope 9).
 *
 * POST-only. Zamanı gelen takipleri `due`/`approval_required` yapmak için
 * mevcut aday + sinyalleri yeniden değerlendirir ve orchestration
 * registry'sini tazeler. Bu route MESAJ GÖNDERMEZ, ONAY ÜRETMEZ, provider/
 * gateway import ETMEZ.
 *
 * Güvenlik (acquisition run route'unun aynı kalıbı):
 *  - body yalnız `trigger` (+ dryRun) okunur — client policy, dueAt,
 *    founderApproved, sendAllowed veya limit gönderemez;
 *  - `scheduled` trigger cron secret gerektirir (`Authorization: Bearer`);
 *    secret env'den okunur, karşılaştırılır, asla loglanmaz/echo edilmez;
 *  - malformed body güvenli 400;
 *  - concurrent evaluation servis içinde lock ile korunur (ikinci eşzamanlı
 *    çağrı `skipped:true` döner);
 *  - idempotent: aynı durum → aynı kararlar → upsert (duplicate yok).
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const body = parseJsonBodySafely(raw);
  if (body === undefined) {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const parsed = parseAcquisitionRunRequest(body);
  if (!parsed) {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const auth = authorizeAcquisitionTrigger({
    trigger: parsed.trigger,
    authorizationHeader: request.headers.get("authorization"),
    configuredSecret:
      process.env.HERMES_FOLLOW_UP_CRON_SECRET ?? process.env.HERMES_ACQUISITION_CRON_SECRET,
  });
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.errorTr }, { status: auth.status });
  }

  const result = runFollowUpOrchestration({ persist: true });
  const summary = summarizeFollowUpOrchestration(result.decisions);

  return NextResponse.json({
    ok: true,
    skipped: result.skipped,
    evaluatedCount: result.evaluatedCount,
    summary,
  });
}
