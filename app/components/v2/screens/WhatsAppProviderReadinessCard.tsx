"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CONTROLLED_LIVE_NOT_READY_LABEL,
  REAL_SEND_DISABLED_LABEL,
  WHATSAPP_MODE_LABELS,
  WHATSAPP_PROVIDER_SECTION_LABEL,
  WHATSAPP_READINESS_STATUS_LABELS,
  type WhatsAppProviderConfig,
} from "@/app/lib/whatsapp-provider-runtime";

/**
 * WhatsApp Provider Readiness Card (v5.0.0).
 *
 * Purely additive to the Hermes Workspace — self-contained fetch/state, no
 * props from the parent screen, no changes to any existing mission-scoped
 * runtime wiring. Fetches `/api/hermes/providers/whatsapp/status`, which
 * never returns a raw secret (only presence booleans + a masked test
 * recipient + readiness metadata).
 *
 * No send button exists anywhere in this component, on purpose — this
 * sprint only prepares credential/configuration readiness, it never sends
 * a real WhatsApp message.
 */

const READINESS_DOT: Record<WhatsAppProviderConfig["readinessStatus"], string> = {
  not_configured: "bg-zinc-600",
  partial: "bg-amber-400",
  dry_run_ready: "bg-sky-400",
  blocked: "bg-rose-400",
  controlled_live_ready: "bg-emerald-400",
};

const READINESS_BADGE_CLS: Record<WhatsAppProviderConfig["readinessStatus"], string> = {
  not_configured: "bg-white/[0.04] text-zinc-500 ring-white/[0.06]",
  partial: "bg-amber-500/[0.10] text-amber-400 ring-amber-500/20",
  dry_run_ready: "bg-sky-500/[0.10] text-sky-400 ring-sky-500/20",
  blocked: "bg-rose-500/[0.10] text-rose-400 ring-rose-500/20",
  controlled_live_ready: "bg-emerald-500/[0.10] text-emerald-400 ring-emerald-500/20",
};

function CredentialRow({ label, present }: { label: string; present: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] text-zinc-500">{label}</span>
      <span
        className={`inline-flex items-center gap-1 text-[9px] font-semibold ${present ? "text-emerald-400" : "text-rose-400"}`}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${present ? "bg-emerald-400" : "bg-rose-400"}`} />
        {present ? "Tanımlı" : "Eksik"}
      </span>
    </div>
  );
}

export default function WhatsAppProviderReadinessCard() {
  const [config, setConfig] = useState<WhatsAppProviderConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hermes/providers/whatsapp/status");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as WhatsAppProviderConfig;
      setConfig(data);
    } catch {
      setError("WhatsApp provider durumu alınamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="border-b border-white/[0.06] px-5 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-600">
            {WHATSAPP_PROVIDER_SECTION_LABEL}
          </span>
          {config && (
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${READINESS_DOT[config.readinessStatus]}`} />
          )}
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="text-[9px] font-semibold text-zinc-600 transition-colors duration-100 hover:text-zinc-300 disabled:opacity-40"
        >
          {loading ? "Kontrol ediliyor…" : "Yenile"}
        </button>
      </div>

      {error && <p className="mt-2 text-[10px] text-rose-400">{error}</p>}

      {config && (
        <div className="mt-2.5 space-y-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded-full bg-white/[0.06] px-2 py-[2px] text-[9px] font-semibold text-zinc-300">
              {WHATSAPP_MODE_LABELS[config.mode]}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-[2px] text-[9px] font-semibold ring-1 ring-inset ${READINESS_BADGE_CLS[config.readinessStatus]}`}
            >
              {WHATSAPP_READINESS_STATUS_LABELS[config.readinessStatus]}
            </span>
          </div>

          <div className="space-y-1.5 rounded-lg bg-white/[0.02] px-3 py-2.5">
            <CredentialRow label="Access Token" present={config.accessTokenPresent} />
            <CredentialRow label="Phone Number ID" present={config.phoneNumberIdPresent} />
            <CredentialRow label="Business Account ID" present={config.businessAccountIdPresent} />
            <CredentialRow label="Test Alıcısı" present={config.testRecipientConfigured} />
            {config.testRecipientMasked && (
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <span className="text-[9px] text-zinc-600">Test Numarası</span>
                <span className="text-[10px] font-medium text-zinc-400">{config.testRecipientMasked}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-zinc-500">Canlı Gönderim Uygunluğu</span>
            <span
              className={`text-[10px] font-semibold ${config.liveSendEligible ? "text-emerald-400" : "text-rose-400"}`}
            >
              {config.liveSendEligible ? "Uygun" : "Uygun Değil"}
            </span>
          </div>

          {config.blockingReasons.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-zinc-600">
                Engelleyen Nedenler
              </p>
              <ul className="mt-1 space-y-1">
                {config.blockingReasons.map((reason) => (
                  <li key={reason} className="flex items-start gap-1.5">
                    <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-rose-400" />
                    <span className="text-[10px] leading-relaxed text-zinc-500">{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="border-t border-white/[0.06] pt-2 text-[9px] leading-relaxed text-zinc-600">
            {!config.liveSendEligible && `${CONTROLLED_LIVE_NOT_READY_LABEL} — `}
            {REAL_SEND_DISABLED_LABEL}.
          </p>
        </div>
      )}
    </div>
  );
}
