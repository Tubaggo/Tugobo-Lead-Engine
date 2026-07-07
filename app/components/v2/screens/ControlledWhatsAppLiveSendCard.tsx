"use client";

import { useCallback, useState } from "react";
import {
  CONTROLLED_SEND_REAL_SEND_OFF_LABEL,
  CONTROLLED_SEND_SECTION_LABEL,
  CONTROLLED_SEND_STATUS_LABELS,
  PREFLIGHT_BUTTON_LABEL,
  type WhatsAppControlledSendStatus,
} from "@/app/lib/whatsapp-controlled-live-send-runtime";

/**
 * Controlled WhatsApp Live Send Card (v5.1.0).
 *
 * Purely additive to the Hermes Workspace, rendered directly below
 * WhatsAppProviderReadinessCard. Self-contained — no props, no mission
 * wiring. The only action is "Test Alıcısına Kontrollü Preflight", which
 * POSTs a fixed, safe payload to `/api/hermes/providers/whatsapp/controlled-send`
 * with `founderApproved` / `courierDraftApproved` / `deliveryGatewayAllowed`
 * always `false` and `runtimeMode: "dry_run"` — there is no mission context
 * at this level of the screen, so this card can never honestly claim those
 * approvals exist. The result is always "blocked" or "dry_run"; there is no
 * path here that can reach a live send.
 */

type ControlledSendPreflightResult = {
  status: WhatsAppControlledSendStatus;
  canAttemptLiveSend: boolean;
  forcedDryRun: boolean;
  recipientMasked: string | null;
  blockingReasons: string[];
};

const STATUS_DOT: Record<WhatsAppControlledSendStatus, string> = {
  blocked: "bg-rose-400",
  dry_run: "bg-sky-400",
  controlled_live_ready: "bg-emerald-400",
  controlled_live_sent: "bg-emerald-400",
  failed: "bg-rose-400",
};

const STATUS_BADGE_CLS: Record<WhatsAppControlledSendStatus, string> = {
  blocked: "bg-rose-500/[0.10] text-rose-400 ring-rose-500/20",
  dry_run: "bg-sky-500/[0.10] text-sky-400 ring-sky-500/20",
  controlled_live_ready: "bg-emerald-500/[0.10] text-emerald-400 ring-emerald-500/20",
  controlled_live_sent: "bg-emerald-500/[0.10] text-emerald-400 ring-emerald-500/20",
  failed: "bg-rose-500/[0.10] text-rose-400 ring-rose-500/20",
};

const PREFLIGHT_PAYLOAD = {
  missionId: "provider-preflight",
  leadId: "provider-preflight",
  runtimeMode: "dry_run" as const,
  founderApproved: false,
  courierDraftApproved: false,
  deliveryGatewayAllowed: false,
  recipientPhone: null,
  messageText: "Bu bir kontrollü preflight testidir — gerçek mesaj gönderilmez.",
};

export default function ControlledWhatsAppLiveSendCard() {
  const [result, setResult] = useState<ControlledSendPreflightResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runPreflight = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hermes/providers/whatsapp/controlled-send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(PREFLIGHT_PAYLOAD),
      });
      const data = (await res.json()) as ControlledSendPreflightResult;
      setResult(data);
    } catch {
      setError("Controlled preflight çalıştırılamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="border-b border-white/[0.06] px-5 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-600">
            {CONTROLLED_SEND_SECTION_LABEL}
          </span>
          {result && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[result.status]}`} />}
        </div>
        <button
          type="button"
          onClick={() => void runPreflight()}
          disabled={loading}
          className="text-[9px] font-semibold text-zinc-600 transition-colors duration-100 hover:text-zinc-300 disabled:opacity-40"
        >
          {loading ? "Çalıştırılıyor…" : PREFLIGHT_BUTTON_LABEL}
        </button>
      </div>

      {error && <p className="mt-2 text-[10px] text-rose-400">{error}</p>}

      {result && (
        <div className="mt-2.5 space-y-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center rounded-full px-2 py-[2px] text-[9px] font-semibold ring-1 ring-inset ${STATUS_BADGE_CLS[result.status]}`}
            >
              {CONTROLLED_SEND_STATUS_LABELS[result.status]}
            </span>
            {result.forcedDryRun && (
              <span className="inline-flex items-center rounded-full bg-white/[0.06] px-2 py-[2px] text-[9px] font-semibold text-zinc-300">
                Zorunlu Dry Run
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-zinc-500">Canlı Gönderim Denemesi</span>
            <span
              className={`text-[10px] font-semibold ${result.canAttemptLiveSend ? "text-emerald-400" : "text-rose-400"}`}
            >
              {result.canAttemptLiveSend ? "Mümkün" : "Mümkün Değil"}
            </span>
          </div>

          {result.recipientMasked && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-zinc-500">Alıcı</span>
              <span className="text-[10px] font-medium text-zinc-400">{result.recipientMasked}</span>
            </div>
          )}

          {result.blockingReasons.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-zinc-600">Engelleyen Nedenler</p>
              <ul className="mt-1 space-y-1">
                {result.blockingReasons.map((reason) => (
                  <li key={reason} className="flex items-start gap-1.5">
                    <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-rose-400" />
                    <span className="text-[10px] leading-relaxed text-zinc-500">{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="border-t border-white/[0.06] pt-2 text-[9px] leading-relaxed text-zinc-600">
            {CONTROLLED_SEND_REAL_SEND_OFF_LABEL}.
          </p>
        </div>
      )}
    </div>
  );
}
