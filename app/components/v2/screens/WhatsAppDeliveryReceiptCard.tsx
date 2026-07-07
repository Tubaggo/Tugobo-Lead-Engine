"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DELIVERY_STATUS_LABELS_TR,
  type WhatsAppDeliveryStatus,
} from "@/app/lib/whatsapp-delivery-receipt-runtime";

/**
 * WhatsApp Delivery Receipt Card (v6.0.1).
 *
 * Purely additive to the Hermes Workspace, rendered directly below
 * ControlledWhatsAppLiveSendCard. Self-contained — fetches its own status
 * from `/api/hermes/providers/whatsapp/delivery-receipts` (GET, read-only),
 * no props, no mission wiring. Shows only the *last* processed delivery
 * receipt — sent/delivered/read/failed status for a message Hermes already
 * sent (v5.2), never inbound message content, never a reply, never a
 * send/follow-up trigger. This is a receipt viewer, not a messaging UI.
 */

type LatestReceipt = {
  status: WhatsAppDeliveryStatus;
  providerMessageId: string;
  missionId: string | null;
  mapped: boolean;
  occurredAt: number;
  errorMessageSafe: string | null;
};

const STATUS_DOT: Record<WhatsAppDeliveryStatus, string> = {
  sent: "bg-sky-400",
  delivered: "bg-emerald-400",
  read: "bg-emerald-400",
  failed: "bg-rose-400",
  unknown: "bg-zinc-500",
};

const STATUS_BADGE_CLS: Record<WhatsAppDeliveryStatus, string> = {
  sent: "bg-sky-500/[0.10] text-sky-400 ring-sky-500/20",
  delivered: "bg-emerald-500/[0.10] text-emerald-400 ring-emerald-500/20",
  read: "bg-emerald-500/[0.10] text-emerald-400 ring-emerald-500/20",
  failed: "bg-rose-500/[0.10] text-rose-400 ring-rose-500/20",
  unknown: "bg-white/[0.04] text-zinc-500 ring-white/[0.06]",
};

function shortenMessageId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

export default function WhatsAppDeliveryReceiptCard() {
  const [latest, setLatest] = useState<LatestReceipt | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hermes/providers/whatsapp/delivery-receipts");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { latest: LatestReceipt | null };
      setLatest(data.latest);
    } catch {
      setError("Teslimat makbuzu durumu alınamadı.");
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
            WhatsApp Teslimat Makbuzu
          </span>
          {latest && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[latest.status]}`} />}
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

      {latest === null && (
        <p className="mt-2 text-[10px] text-zinc-600">Henüz teslimat makbuzu alınmadı.</p>
      )}

      {latest && (
        <div className="mt-2.5 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center rounded-full px-2 py-[2px] text-[9px] font-semibold ring-1 ring-inset ${STATUS_BADGE_CLS[latest.status]}`}
            >
              {DELIVERY_STATUS_LABELS_TR[latest.status]}
            </span>
            {!latest.mapped && (
              <span className="inline-flex items-center rounded-full bg-amber-500/[0.10] px-2 py-[2px] text-[9px] font-semibold text-amber-400 ring-1 ring-inset ring-amber-500/20">
                Eşleşmemiş
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-zinc-500">Provider Message ID</span>
            <span className="text-[10px] font-medium text-zinc-400">{shortenMessageId(latest.providerMessageId)}</span>
          </div>

          {latest.missionId && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-zinc-500">Mission</span>
              <span className="text-[10px] font-medium text-zinc-400">{latest.missionId}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-zinc-500">Zaman</span>
            <span className="text-[10px] font-medium text-zinc-400">
              {new Date(latest.occurredAt).toLocaleTimeString("tr-TR")}
            </span>
          </div>

          {latest.status === "failed" && latest.errorMessageSafe && (
            <p className="text-[9px] leading-relaxed text-rose-400/80">{latest.errorMessageSafe}</p>
          )}
        </div>
      )}
    </div>
  );
}
