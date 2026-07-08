"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEMO_STATUS_LABELS_TR,
  type DemoScheduleItem,
  type DemoScheduleStatus,
  type DemoStatusUpdateTarget,
} from "@/app/lib/demo-scheduling-runtime";

/**
 * Demo Scheduling Card (v6.4).
 *
 * Founder-facing, compact, Developer Mode. Self-contained — fetches its
 * own feed from `/api/hermes/demo-scheduling` (GET) and posts status
 * changes to `/api/hermes/demo-scheduling/status` (POST), no props, no
 * mission wiring. Shows only pending items (`demo_requested` /
 * `scheduling_needed`) plus whatever the founder most recently
 * scheduled/completed/cancelled/marked no-show, capped at a handful of
 * rows to stay compact.
 *
 * The four buttons ("Planlandı" / "Tamamlandı" / "İptal" / "No-show") are
 * the *only* actions this card exposes — deliberately no "WhatsApp gönder",
 * no "Takvim oluştur", no "Otomatik planla", no "Müşteriye bildir". This is
 * a status board, not a messaging or calendar tool.
 */

const STATUS_BADGE_CLS: Record<DemoScheduleStatus, string> = {
  not_requested: "bg-white/[0.04] text-zinc-500 ring-white/[0.06]",
  demo_requested: "bg-teal-500/[0.10] text-teal-400 ring-teal-500/20",
  scheduling_needed: "bg-teal-500/[0.10] text-teal-400 ring-teal-500/20",
  scheduled: "bg-sky-500/[0.10] text-sky-400 ring-sky-500/20",
  completed: "bg-emerald-500/[0.10] text-emerald-400 ring-emerald-500/20",
  cancelled: "bg-zinc-500/[0.10] text-zinc-400 ring-zinc-500/20",
  no_show: "bg-rose-500/[0.10] text-rose-400 ring-rose-500/20",
  unknown: "bg-white/[0.04] text-zinc-500 ring-white/[0.06]",
};

const ACTION_BUTTONS: { target: DemoStatusUpdateTarget; label: string }[] = [
  { target: "scheduled", label: "Planlandı" },
  { target: "completed", label: "Tamamlandı" },
  { target: "cancelled", label: "İptal" },
  { target: "no_show", label: "No-show" },
];

export default function DemoSchedulingCard() {
  const [items, setItems] = useState<DemoScheduleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hermes/demo-scheduling");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { items?: DemoScheduleItem[] };
      setItems(data.items ?? []);
    } catch {
      setError("Demo listesi alınamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const applyStatus = useCallback(
    async (id: string, status: DemoStatusUpdateTarget) => {
      setUpdatingId(id);
      try {
        const res = await fetch("/api/hermes/demo-scheduling/status", {
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

  const visibleItems = items.slice(0, 6);

  return (
    <div className="border-b border-white/[0.06] px-5 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-600">Demo Planlama</span>
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

      {visibleItems.length === 0 && !loading && (
        <p className="mt-2 text-[10px] text-zinc-600">Şu anda bekleyen bir demo talebi yok.</p>
      )}

      {visibleItems.length > 0 && (
        <div className="mt-2.5 space-y-2">
          {visibleItems.map((item) => (
            <div key={item.id} className="rounded-lg bg-white/[0.02] px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-[2px] text-[9px] font-semibold ring-1 ring-inset ${STATUS_BADGE_CLS[item.status]}`}
                >
                  {DEMO_STATUS_LABELS_TR[item.status]}
                </span>
                <span className="text-[10px] font-medium text-zinc-300">{item.missionId ?? "Mission eşleşmedi"}</span>
              </div>

              <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-500">{item.reason}</p>
              <p className="mt-0.5 text-[10px] font-medium text-teal-300">{item.suggestedAction}</p>

              {item.scheduledAt && (
                <p className="mt-1 text-[9px] text-zinc-600">
                  Planlanan: {new Date(item.scheduledAt).toLocaleString("tr-TR")}
                </p>
              )}

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
