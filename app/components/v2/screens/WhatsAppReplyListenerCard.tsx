"use client";

import { useCallback, useEffect, useState } from "react";
import {
  REPLY_MESSAGE_TYPE_LABELS_TR,
  type WhatsAppInboundMessageType,
} from "@/app/lib/whatsapp-reply-listener-runtime";

/**
 * WhatsApp Reply Listener Card (v6.2).
 *
 * Purely additive to the Hermes Workspace, rendered directly below
 * WhatsAppDeliveryReceiptCard. Self-contained — fetches its own feed from
 * `/api/hermes/providers/whatsapp/replies` (GET, read-only), no props, no
 * mission wiring. Shows only the *last* inbound reply — its type,
 * mapping state, and a 160-char textPreview. Never a conversation view,
 * never the full message body, never a reply/send action.
 */

type LatestReply = {
  providerMessageId: string;
  messageType: WhatsAppInboundMessageType;
  textPreview: string | null;
  mapped: boolean;
  missionId: string | null;
  occurredAt: number;
};

const TYPE_DOT: Record<WhatsAppInboundMessageType, string> = {
  text: "bg-fuchsia-400",
  button: "bg-fuchsia-400",
  interactive: "bg-fuchsia-400",
  unknown: "bg-zinc-500",
};

export default function WhatsAppReplyListenerCard() {
  const [latest, setLatest] = useState<LatestReply | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hermes/providers/whatsapp/replies");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { latest: LatestReply | null };
      setLatest(data.latest);
    } catch {
      setError("Cevap durumu alınamadı.");
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
            WhatsApp Cevap Dinleyici
          </span>
          {latest && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TYPE_DOT[latest.messageType]}`} />}
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

      {latest === null && <p className="mt-2 text-[10px] text-zinc-600">Henüz cevap alınmadı.</p>}

      {latest && (
        <div className="mt-2.5 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded-full bg-fuchsia-500/[0.10] px-2 py-[2px] text-[9px] font-semibold text-fuchsia-400 ring-1 ring-inset ring-fuchsia-500/20">
              {REPLY_MESSAGE_TYPE_LABELS_TR[latest.messageType]}
            </span>
            {latest.mapped ? (
              <span className="inline-flex items-center rounded-full bg-emerald-500/[0.10] px-2 py-[2px] text-[9px] font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
                Mission ile eşleşti
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-amber-500/[0.10] px-2 py-[2px] text-[9px] font-semibold text-amber-400 ring-1 ring-inset ring-amber-500/20">
                Cevap geldi ancak mission eşleşmedi
              </span>
            )}
          </div>

          {latest.textPreview && (
            <p className="rounded bg-white/[0.02] px-2 py-1.5 text-[10px] leading-relaxed text-zinc-400">
              {latest.textPreview}
            </p>
          )}

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
        </div>
      )}
    </div>
  );
}
