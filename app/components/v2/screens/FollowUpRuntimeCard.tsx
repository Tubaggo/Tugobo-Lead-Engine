"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FOLLOW_UP_REASON_LABELS_TR,
  FOLLOW_UP_STATUS_LABELS_TR,
  type FollowUpCandidate,
  type FollowUpPriority,
  type FollowUpStatus,
  type FollowUpStatusUpdateTarget,
} from "@/app/lib/follow-up-runtime";

/**
 * Follow-up Runtime Card (v6.5).
 *
 * Founder-facing, compact, Developer Mode. Self-contained — fetches its
 * own feed from `/api/hermes/follow-ups` (GET) and posts status changes to
 * `/api/hermes/follow-ups/status` (POST), no props, no mission wiring.
 * Shows only active candidates (`candidate`/`approval_required`), capped
 * at a handful of rows to stay compact.
 *
 * The four buttons ("Onay Bekliyor" / "Onaylandı" / "Tamamlandı" /
 * "Vazgeç") are the *only* actions this card exposes — deliberately no
 * "Gönder", no "WhatsApp gönder", no "Otomatik takip", no "Toplu gönder".
 * This is a review board, not a messaging tool: nothing here ever sends a
 * WhatsApp message.
 */

const PRIORITY_BADGE_CLS: Record<FollowUpPriority, string> = {
  high: "bg-rose-500/[0.10] text-rose-400 ring-rose-500/20",
  medium: "bg-amber-500/[0.10] text-amber-400 ring-amber-500/20",
  low: "bg-white/[0.04] text-zinc-500 ring-white/[0.06]",
};

const PRIORITY_LABEL_TR: Record<FollowUpPriority, string> = {
  high: "Yüksek",
  medium: "Orta",
  low: "Düşük",
};

const STATUS_BADGE_CLS: Record<FollowUpStatus, string> = {
  not_needed: "bg-white/[0.04] text-zinc-500 ring-white/[0.06]",
  candidate: "bg-cyan-500/[0.10] text-cyan-400 ring-cyan-500/20",
  approval_required: "bg-amber-500/[0.10] text-amber-400 ring-amber-500/20",
  approved: "bg-sky-500/[0.10] text-sky-400 ring-sky-500/20",
  dismissed: "bg-zinc-500/[0.10] text-zinc-400 ring-zinc-500/20",
  completed: "bg-emerald-500/[0.10] text-emerald-400 ring-emerald-500/20",
  expired: "bg-zinc-500/[0.10] text-zinc-500 ring-zinc-500/20",
  unknown: "bg-white/[0.04] text-zinc-500 ring-white/[0.06]",
};

const ACTION_BUTTONS: { target: FollowUpStatusUpdateTarget; label: string }[] = [
  { target: "approval_required", label: "Onay Bekliyor" },
  { target: "approved", label: "Onaylandı" },
  { target: "completed", label: "Tamamlandı" },
  { target: "dismissed", label: "Vazgeç" },
];

export default function FollowUpRuntimeCard() {
  const [items, setItems] = useState<FollowUpCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hermes/follow-ups");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { items?: FollowUpCandidate[] };
      setItems(data.items ?? []);
    } catch {
      setError("Takip listesi alınamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const applyStatus = useCallback(
    async (id: string, status: FollowUpStatusUpdateTarget) => {
      setUpdatingId(id);
      try {
        const res = await fetch("/api/hermes/follow-ups/status", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, status }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await refresh();
      } catch {
        setError("Durum güncellenemedi.");
      } finally {
        setUpdatingId(null);
      }
    },
    [refresh],
  );

  const activeItems = items.filter((i) => i.status === "candidate" || i.status === "approval_required").slice(0, 6);

  return (
    <div className="border-b border-white/[0.06] px-5 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-600">Takip Adayları</span>
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

      {activeItems.length === 0 && !loading && (
        <p className="mt-2 text-[10px] text-zinc-600">Şu anda takip gerektiren bir aday yok.</p>
      )}

      {activeItems.length > 0 && (
        <div className="mt-2.5 space-y-2">
          {activeItems.map((item) => (
            <div key={item.id} className="rounded-lg bg-white/[0.02] px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-[2px] text-[9px] font-semibold ring-1 ring-inset ${STATUS_BADGE_CLS[item.status]}`}
                >
                  {FOLLOW_UP_STATUS_LABELS_TR[item.status]}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-[2px] text-[9px] font-semibold ring-1 ring-inset ${PRIORITY_BADGE_CLS[item.priority]}`}
                >
                  {PRIORITY_LABEL_TR[item.priority]}
                </span>
                <span className="text-[10px] font-medium text-zinc-300">{item.missionId ?? "Mission eşleşmedi"}</span>
              </div>

              <p className="mt-1.5 text-[10px] font-medium text-zinc-300">{FOLLOW_UP_REASON_LABELS_TR[item.reason]}</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-cyan-300">{item.suggestedAction}</p>
              <p className="mt-0.5 text-[9px] text-zinc-500">Önerilen zaman: {item.suggestedTiming}</p>
              {item.draftHint && <p className="mt-1 text-[9px] italic text-zinc-600">{item.draftHint}</p>}

              <div className="mt-2 flex flex-wrap gap-1.5">
                {ACTION_BUTTONS.map((btn) => (
                  <button
                    key={btn.target}
                    type="button"
                    onClick={() => void applyStatus(item.id, btn.target)}
                    disabled={updatingId === item.id}
                    className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[9px] font-semibold text-zinc-300 transition-colors duration-100 hover:bg-white/[0.06] hover:text-zinc-100 disabled:opacity-40"
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
